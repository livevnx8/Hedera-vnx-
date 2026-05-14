/**
 * Canary Deployment Controller
 * Gradual rollout with automatic rollback capability
 */

import { EventEmitter } from 'events';
import { logger } from '../../src/monitoring/logger.js';

export interface CanaryConfig {
  stages: Array<{
    name: string;
    percentage: number;
    durationMinutes: number;
    successCriteria: {
    errorRateThreshold: number;
    latencyThresholdMs: number;
    minSuccessRate: number;
    };
  }>;
  autoRollback: boolean;
  rollbackOnFailure: boolean;
}

export interface DeploymentStage {
  name: string;
  percentage: number;
  startTime: number;
  endTime?: number;
  status: 'running' | 'passed' | 'failed';
  metrics: {
    requests: number;
    errors: number;
    avgLatency: number;
  };
}

export class CanaryController extends EventEmitter {
  private currentStage = 0;
  private stages: DeploymentStage[] = [];
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private config: CanaryConfig) {
    super();
  }

  /**
   * Start canary deployment
   */
  async startDeployment(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    this.stages = this.config.stages.map(s => ({
      name: s.name,
      percentage: s.percentage,
      startTime: 0,
      status: 'running',
      metrics: { requests: 0, errors: 0, avgLatency: 0 },
    }));

    logger.info('CanaryController', {
      message: 'Starting canary deployment',
      stages: this.config.stages.length,
    });

    this.emit('deployment_started', { stages: this.config.stages });

    // Start first stage
    await this.runStage(0);
  }

  /**
   * Run a deployment stage
   */
  private async runStage(stageIndex: number): Promise<void> {
    if (stageIndex >= this.stages.length) {
      await this.completeDeployment();
      return;
    }

    this.currentStage = stageIndex;
    const stage = this.stages[stageIndex];
    const config = this.config.stages[stageIndex];

    stage.startTime = Date.now();

    logger.info('CanaryController', {
      message: `Starting stage: ${stage.name}`,
      percentage: stage.percentage,
      duration: `${config.durationMinutes}min`,
    });

    this.emit('stage_started', { stage: stage.name, percentage: stage.percentage });

    // Monitor for stage duration
    await this.monitorStage(stage, config);

    // Evaluate stage success
    const passed = this.evaluateStage(stage, config);

    if (passed) {
      stage.status = 'passed';
      stage.endTime = Date.now();

      logger.info('CanaryController', {
        message: `Stage passed: ${stage.name}`,
        metrics: stage.metrics,
      });

      this.emit('stage_passed', { stage: stage.name, metrics: stage.metrics });

      // Move to next stage
      await this.runStage(stageIndex + 1);
    } else {
      stage.status = 'failed';
      stage.endTime = Date.now();

      logger.error('CanaryController', {
        message: `Stage failed: ${stage.name}`,
        metrics: stage.metrics,
      });

      this.emit('stage_failed', { stage: stage.name, metrics: stage.metrics });

      if (this.config.rollbackOnFailure) {
        await this.rollback();
      }
    }
  }

  /**
   * Monitor stage metrics
   */
  private async monitorStage(stage: DeploymentStage, config: CanaryConfig['stages'][0]): Promise<void> {
    const checkInterval = 10000; // 10 seconds
    const totalChecks = (config.durationMinutes * 60000) / checkInterval;

    for (let i = 0; i < totalChecks; i++) {
      if (!this.isRunning) break;

      // Collect metrics (in production, query actual metrics)
      const metrics = await this.collectMetrics();
      
      stage.metrics.requests += metrics.requests;
      stage.metrics.errors += metrics.errors;
      stage.metrics.avgLatency = 
        (stage.metrics.avgLatency * i + metrics.latency) / (i + 1);

      // Early exit if clearly failing
      if (metrics.errorRate > config.successCriteria.errorRateThreshold * 2) {
        logger.error('CanaryController', {
          message: 'Critical error rate detected, aborting stage',
          errorRate: metrics.errorRate,
        });
        break;
      }

      await this.sleep(checkInterval);
    }
  }

  /**
   * Collect metrics for evaluation
   */
  private async collectMetrics(): Promise<{
    requests: number;
    errors: number;
    latency: number;
    errorRate: number;
  }> {
    // In production, query Prometheus/metrics endpoint
    // Simulated for now
    return {
      requests: 100 + Math.floor(Math.random() * 50),
      errors: Math.floor(Math.random() * 5),
      latency: 100 + Math.random() * 200,
      errorRate: Math.random() * 0.05,
    };
  }

  /**
   * Evaluate if stage passed criteria
   */
  private evaluateStage(
    stage: DeploymentStage,
    config: CanaryConfig['stages'][0]
  ): boolean {
    const { requests, errors, avgLatency } = stage.metrics;
    
    if (requests === 0) return false;

    const errorRate = errors / requests;
    const successRate = 1 - errorRate;

    return (
      errorRate <= config.successCriteria.errorRateThreshold &&
      avgLatency <= config.successCriteria.latencyThresholdMs &&
      successRate >= config.successCriteria.minSuccessRate
    );
  }

  /**
   * Complete deployment
   */
  private async completeDeployment(): Promise<void> {
    this.isRunning = false;

    logger.info('CanaryController', {
      message: 'Canary deployment completed successfully',
      totalStages: this.stages.length,
    });

    this.emit('deployment_complete', { stages: this.stages });
  }

  /**
   * Rollback deployment
   */
  private async rollback(): Promise<void> {
    this.isRunning = false;

    logger.error('CanaryController', {
      message: 'ROLLBACK INITIATED',
      currentStage: this.currentStage,
    });

    this.emit('rollback_started', {
      fromStage: this.currentStage,
      stages: this.stages,
    });

    // In production, trigger actual rollback
    await this.sleep(5000); // Simulate rollback time

    logger.info('CanaryController', { message: 'Rollback completed' });

    this.emit('rollback_complete', { timestamp: Date.now() });
  }

  /**
   * Get current deployment status
   */
  getStatus(): {
    isRunning: boolean;
    currentStage: number;
    stages: DeploymentStage[];
    overallProgress: number;
  } {
    const overallProgress = this.stages.length > 0
      ? this.stages.reduce((sum, s) => sum + (s.status === 'passed' ? s.percentage : 0), 0)
      : 0;

    return {
      isRunning: this.isRunning,
      currentStage: this.currentStage,
      stages: this.stages,
      overallProgress,
    };
  }

  /**
   * Force abort deployment
   */
  async abort(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
    }

    logger.warn('CanaryController', { message: 'Deployment aborted' });

    this.emit('deployment_aborted', { timestamp: Date.now() });

    if (this.config.autoRollback) {
      await this.rollback();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default CanaryController;
