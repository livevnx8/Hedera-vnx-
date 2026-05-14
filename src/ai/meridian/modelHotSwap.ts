/**
 * Model Hot-Swap Manager
 *
 * Zero-downtime model updates with validation-gated deployment.
 * Gradually migrates traffic from old to new checkpoints.
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { validationHarness } from './testing/validationHarness.js';

export interface ModelCheckpoint {
  id: string;
  path: string;
  epoch: number;
  size: number;
  validationScore: number;
  status: 'pending' | 'validating' | 'ready' | 'deploying' | 'active' | 'rollback' | 'retired';
  deployedAt?: Date;
  trafficPercent: number;
  errorRate: number;
  latencyMs: number;
}

export interface DeploymentConfig {
  rolloutStrategy: 'canary' | 'blue-green' | 'immediate';
  canaryPercent: number;      // Starting traffic percentage
  canaryIncrement: number;      // Percent increase per step
  canaryInterval: number;       // Minutes between steps
  rollbackThreshold: number;    // Error rate threshold for auto-rollback
  validationGate: boolean;      // Require validation > 75% before deploy
}

export interface DeploymentState {
  current: ModelCheckpoint | null;
  previous: ModelCheckpoint | null;
  deploying: ModelCheckpoint | null;
  trafficSplit: Record<string, number>;  // checkpointId -> percentage
}

export class ModelHotSwap extends EventEmitter {
  private checkpoints: Map<string, ModelCheckpoint> = new Map();
  private state: DeploymentState = {
    current: null,
    previous: null,
    deploying: null,
    trafficSplit: {},
  };
  private config: DeploymentConfig = {
    rolloutStrategy: 'canary',
    canaryPercent: 5,
    canaryIncrement: 10,
    canaryInterval: 5,
    rollbackThreshold: 0.05,
    validationGate: true,
  };
  private deploymentTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<DeploymentConfig>) {
    super();
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Register a new checkpoint for deployment
   */
  async registerCheckpoint(
    checkpointPath: string,
    metadata: { epoch: number; size: number }
  ): Promise<ModelCheckpoint> {
    const id = `checkpoint-${metadata.epoch}-${Date.now()}`;

    const checkpoint: ModelCheckpoint = {
      id,
      path: checkpointPath,
      epoch: metadata.epoch,
      size: metadata.size,
      validationScore: 0,
      status: 'pending',
      trafficPercent: 0,
      errorRate: 0,
      latencyMs: 0,
    };

    this.checkpoints.set(id, checkpoint);
    logger.info(`[ModelHotSwap] Checkpoint registered: ${id} (epoch ${metadata.epoch})`);

    this.emit('checkpointRegistered', checkpoint);

    // Auto-start validation if gate is enabled
    if (this.config.validationGate) {
      await this.validateCheckpoint(id);
    }

    return checkpoint;
  }

  /**
   * Run validation on checkpoint
   */
  private async validateCheckpoint(checkpointId: string): Promise<void> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) return;

    checkpoint.status = 'validating';
    this.emit('validationStarted', checkpoint);

    try {
      // Run validation harness
      const report = await validationHarness.validateCheckpoint(
        checkpoint.path,
        { meridianUrl: process.env.MERIDIAN_URL }
      );

      checkpoint.validationScore = report.overallScore;

      if (report.productionReady) {
        checkpoint.status = 'ready';
        logger.info(
          `[ModelHotSwap] Checkpoint ${checkpointId} validated: ${report.overallScore.toFixed(1)}%`
        );
        this.emit('validationPassed', checkpoint);

        // Auto-deploy if validation passes
        await this.deployCheckpoint(checkpointId);
      } else {
        checkpoint.status = 'rollback';
        logger.warn(
          `[ModelHotSwap] Checkpoint ${checkpointId} failed validation: ${report.overallScore.toFixed(1)}%`
        );
        this.emit('validationFailed', checkpoint);
      }
    } catch (error) {
      checkpoint.status = 'rollback';
      logger.error(`[ModelHotSwap] Validation error for ${checkpointId}:`, error);
      this.emit('validationError', { checkpoint, error });
    }
  }

  /**
   * Deploy checkpoint using configured strategy
   */
  async deployCheckpoint(checkpointId: string): Promise<void> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    if (checkpoint.status !== 'ready' && checkpoint.status !== 'pending') {
      throw new Error(`Checkpoint ${checkpointId} not ready for deployment`);
    }

    checkpoint.status = 'deploying';
    this.state.deploying = checkpoint;

    logger.info(`[ModelHotSwap] Deploying ${checkpointId} using ${this.config.rolloutStrategy}`);
    this.emit('deploymentStarted', checkpoint);

    switch (this.config.rolloutStrategy) {
      case 'immediate':
        await this.deployImmediate(checkpoint);
        break;
      case 'blue-green':
        await this.deployBlueGreen(checkpoint);
        break;
      case 'canary':
        await this.deployCanary(checkpoint);
        break;
    }
  }

  /**
   * Immediate deployment (switch all traffic)
   */
  private async deployImmediate(checkpoint: ModelCheckpoint): Promise<void> {
    // Save previous
    if (this.state.current) {
      this.state.previous = this.state.current;
      this.state.previous.status = 'retired';
    }

    // Activate new
    checkpoint.status = 'active';
    checkpoint.deployedAt = new Date();
    checkpoint.trafficPercent = 100;
    this.state.current = checkpoint;
    this.state.deploying = null;

    this.state.trafficSplit = { [checkpoint.id]: 100 };

    logger.info(`[ModelHotSwap] Immediate deployment complete: ${checkpoint.id}`);
    this.emit('deploymentComplete', { checkpoint, strategy: 'immediate' });
  }

  /**
   * Blue-green deployment (instant switch with rollback capability)
   */
  private async deployBlueGreen(checkpoint: ModelCheckpoint): Promise<void> {
    // Green = new, Blue = current
    const blue = this.state.current;

    // Start with 100% blue, 0% green
    this.state.trafficSplit = {
      [blue?.id || 'none']: 100,
      [checkpoint.id]: 0,
    };

    // Warm up green
    checkpoint.status = 'active';
    this.emit('warming', checkpoint);

    await this.sleep(30000); // 30s warmup

    // Instant switch to green
    checkpoint.trafficPercent = 100;
    checkpoint.deployedAt = new Date();

    if (blue) {
      blue.trafficPercent = 0;
      blue.status = 'retired';
      this.state.previous = blue;
    }

    this.state.current = checkpoint;
    this.state.deploying = null;
    this.state.trafficSplit = { [checkpoint.id]: 100 };

    logger.info(`[ModelHotSwap] Blue-green deployment complete: ${checkpoint.id}`);
    this.emit('deploymentComplete', { checkpoint, strategy: 'blue-green' });
  }

  /**
   * Canary deployment (gradual traffic shift)
   */
  private async deployCanary(checkpoint: ModelCheckpoint): Promise<void> {
    const current = this.state.current;
    let canaryPercent = this.config.canaryPercent;

    // Start canary
    checkpoint.status = 'active';

    const canaryStep = async () => {
      // Update traffic split
      checkpoint.trafficPercent = canaryPercent;
      if (current) {
        current.trafficPercent = 100 - canaryPercent;
      }

      this.state.trafficSplit = {
        [checkpoint.id]: canaryPercent,
        [current?.id || 'none']: 100 - canaryPercent,
      };

      this.emit('canaryProgress', {
        checkpoint,
        current,
        canaryPercent,
      });

      // Check for rollback conditions
      if (checkpoint.errorRate > this.config.rollbackThreshold) {
        logger.warn(`[ModelHotSwap] Canary rollback triggered: error rate ${checkpoint.errorRate}`);
        await this.rollback();
        return;
      }

      // Check if complete
      if (canaryPercent >= 100) {
        // Full deployment
        checkpoint.deployedAt = new Date();
        if (current) {
          current.status = 'retired';
          current.trafficPercent = 0;
          this.state.previous = current;
        }
        this.state.current = checkpoint;
        this.state.deploying = null;

        logger.info(`[ModelHotSwap] Canary deployment complete: ${checkpoint.id}`);
        this.emit('deploymentComplete', { checkpoint, strategy: 'canary' });
        return;
      }

      // Increment canary
      canaryPercent = Math.min(100, canaryPercent + this.config.canaryIncrement);
      this.deploymentTimer = setTimeout(
        canaryStep,
        this.config.canaryInterval * 60000
      );
    };

    await canaryStep();
  }

  /**
   * Rollback to previous checkpoint
   */
  async rollback(): Promise<void> {
    const current = this.state.current;
    const previous = this.state.previous;

    if (!previous) {
      logger.error('[ModelHotSwap] Rollback failed: no previous checkpoint');
      throw new Error('No previous checkpoint to rollback to');
    }

    logger.warn(`[ModelHotSwap] Rolling back from ${current?.id} to ${previous.id}`);

    // Swap
    if (current) {
      current.status = 'rollback';
      current.trafficPercent = 0;
    }

    previous.status = 'active';
    previous.trafficPercent = 100;
    previous.deployedAt = new Date();

    this.state.current = previous;
    this.state.previous = current || null;
    this.state.deploying = null;
    this.state.trafficSplit = { [previous.id]: 100 };

    // Clear deployment timer
    if (this.deploymentTimer) {
      clearTimeout(this.deploymentTimer);
      this.deploymentTimer = null;
    }

    this.emit('rollbackComplete', { from: current, to: previous });
  }

  /**
   * Record checkpoint metrics
   */
  recordMetrics(checkpointId: string, metrics: { latency: number; success: boolean }): void {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) return;

    // Update latency (EMA)
    checkpoint.latencyMs = checkpoint.latencyMs * 0.9 + metrics.latency * 0.1;

    // Update error rate
    if (!metrics.success) {
      checkpoint.errorRate = checkpoint.errorRate * 0.9 + 0.1;
    } else {
      checkpoint.errorRate = checkpoint.errorRate * 0.9;
    }

    // Check rollback threshold
    if (checkpoint.status === 'active' && checkpoint.errorRate > this.config.rollbackThreshold) {
      logger.warn(`[ModelHotSwap] Auto-rollback triggered for ${checkpointId}`);
      this.rollback();
    }
  }

  /**
   * Get current traffic split for routing
   */
  getTrafficSplit(): Record<string, number> {
    return { ...this.state.trafficSplit };
  }

  /**
   * Get active checkpoint for inference
   */
  getActiveCheckpoint(): ModelCheckpoint | null {
    return this.state.current;
  }

  /**
   * Get all checkpoints
   */
  getAllCheckpoints(): ModelCheckpoint[] {
    return Array.from(this.checkpoints.values());
  }

  /**
   * Get deployment state
   */
  getState(): DeploymentState {
    return { ...this.state };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clean up old checkpoints
   */
  cleanup(maxAge: number = 86400000): void {
    // Remove checkpoints older than maxAge (default 24h) that are not active
    const now = Date.now();

    for (const [id, checkpoint] of this.checkpoints.entries()) {
      if (checkpoint.status !== 'active' && checkpoint.status !== 'deploying') {
        const age = now - (checkpoint.deployedAt?.getTime() || now);
        if (age > maxAge) {
          this.checkpoints.delete(id);
          logger.info(`[ModelHotSwap] Cleaned up old checkpoint: ${id}`);
        }
      }
    }
  }
}

// Global hot-swap instance
export const modelHotSwap = new ModelHotSwap();
