/**
 * Ensemble Orchestrator
 *
 * Scales Shadow Council ensemble with dynamic model pool management,
 * load balancing, and A/B testing infrastructure.
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { shadowCouncil, type EnsembleScore } from '../../vera/proofKernel/shadowCouncil.js';
import type { ModelTier as Tier } from './modelRouter.js';

export interface ModelInstance {
  id: string;
  tier: Tier;
  modelPath: string;
  status: 'active' | 'warming' | 'cooling' | 'offline';
  health: number;           // 0-1 health score
  latency: number;          // Average latency (ms)
  accuracy: number;         // Historical accuracy
  requestCount: number;
  errorRate: number;
  lastUsed: number;
  gpuLayers: number;
  quantization: 'f32' | 'f16' | 'q8' | 'q4';
}

export interface EnsembleConfig {
  minModels: number;        // Minimum models for consensus
  maxModels: number;        // Maximum models in ensemble
  targetConsensus: number;  // Target consensus level (0-1)
  autoScale: boolean;       // Auto-scale ensemble size
  loadBalance: boolean;     // Load balance across models
}

export interface RoutingDecision {
  modelIds: string[];
  strategy: 'consensus' | 'single' | 'cascade' | 'ab-test';
  timeout: number;
  fallbackTier?: Tier;
}

export interface ABTestVariant {
  id: string;
  modelId: string;
  weight: number;           // Traffic percentage (0-1)
  metrics: {
    requests: number;
    errors: number;
    latency: number;
    accuracy: number;
  };
}

export class EnsembleOrchestrator extends EventEmitter {
  private modelPool: Map<string, ModelInstance> = new Map();
  private config: EnsembleConfig;
  private abTests: Map<string, ABTestVariant[]> = new Map();
  private warmupQueue: string[] = [];
  private circuitBreakers: Map<string, { failures: number; lastFailure: number }> = new Map();

  constructor(config?: Partial<EnsembleConfig>) {
    super();
    this.config = {
      minModels: 2,
      maxModels: 5,
      targetConsensus: 0.75,
      autoScale: true,
      loadBalance: true,
      ...config,
    };

    this.startHealthChecks();
    this.startAutoScaling();
  }

  /**
   * Register a new model in the pool
   */
  registerModel(instance: Omit<ModelInstance, 'health' | 'requestCount' | 'errorRate' | 'lastUsed'>): void {
    const fullInstance: ModelInstance = {
      ...instance,
      health: 1.0,
      requestCount: 0,
      errorRate: 0,
      lastUsed: Date.now(),
    };

    this.modelPool.set(instance.id, fullInstance);
    logger.info(`[EnsembleOrchestrator] Model registered: ${instance.id} (${instance.tier})`);

    this.emit('modelRegistered', fullInstance);

    // Auto-scale if needed
    if (this.config.autoScale) {
      this.evaluateScaling();
    }
  }

  /**
   * Remove a model from the pool
   */
  unregisterModel(modelId: string): void {
    const model = this.modelPool.get(modelId);
    if (model) {
      this.modelPool.delete(modelId);
      logger.info(`[EnsembleOrchestrator] Model unregistered: ${modelId}`);
      this.emit('modelUnregistered', model);
    }
  }

  /**
   * Get routing decision for a task
   */
  getRoutingDecision(taskComplexity: 'low' | 'medium' | 'high' | 'critical'): RoutingDecision {
    const activeModels = this.getActiveModels();

    // Not enough models - use single model
    if (activeModels.length < this.config.minModels) {
      return {
        modelIds: [this.selectBestModel(activeModels)],
        strategy: 'single',
        timeout: 5000,
      };
    }

    // Check for A/B test on this task
    const abTest = this.getActiveABTest();
    if (abTest && Math.random() < 0.1) {  // 10% of traffic for A/B testing
      return this.createABTestRouting(abTest);
    }

    // Select models based on complexity
    const selectedModels = this.selectModelsForComplexity(taskComplexity, activeModels);

    return {
      modelIds: selectedModels,
      strategy: selectedModels.length > 1 ? 'consensus' : 'single',
      timeout: this.calculateTimeout(taskComplexity),
      fallbackTier: this.getFallbackTier(taskComplexity),
    };
  }

  /**
   * Select best single model
   */
  private selectBestModel(models: ModelInstance[]): string {
    // Sort by health, accuracy, and low latency
    const sorted = models.sort((a, b) => {
      const scoreA = a.health * a.accuracy * (1 / (a.latency + 1));
      const scoreB = b.health * b.accuracy * (1 / (b.latency + 1));
      return scoreB - scoreA;
    });

    return sorted[0]?.id || models[0]?.id;
  }

  /**
   * Select models appropriate for task complexity
   */
  private selectModelsForComplexity(
    complexity: 'low' | 'medium' | 'high' | 'critical',
    availableModels: ModelInstance[]
  ): string[] {
    const tierPriority: Record<string, Tier[]> = {
      low: ['tiny', 'medium'],
      medium: ['medium', 'compact', 'tiny'],
      high: ['compact', 'plus', 'medium'],
      critical: ['plus', 'external', 'compact'],
    };

    const targetTiers = tierPriority[complexity];
    const selected: string[] = [];

    for (const tier of targetTiers) {
      const tierModels = availableModels.filter((m) => m.tier === tier && m.health > 0.7);

      if (tierModels.length > 0) {
        // Load balance: select least busy model in tier
        const bestModel = tierModels.sort((a, b) => a.requestCount - b.requestCount)[0];
        selected.push(bestModel.id);

        if (selected.length >= this.config.maxModels) {
          break;
        }
      }
    }

    // Ensure minimum consensus
    if (selected.length < this.config.minModels) {
      const additional = availableModels
        .filter((m) => !selected.includes(m.id) && m.health > 0.5)
        .slice(0, this.config.minModels - selected.length);
      selected.push(...additional.map((m) => m.id));
    }

    return selected;
  }

  /**
   * Record model performance
   */
  recordPerformance(modelId: string, metrics: { latency: number; success: boolean }): void {
    const model = this.modelPool.get(modelId);
    if (!model) return;

    model.requestCount++;
    model.lastUsed = Date.now();
    model.latency = model.latency * 0.9 + metrics.latency * 0.1;  // Exponential moving average

    if (!metrics.success) {
      model.errorRate = model.errorRate * 0.9 + 0.1;
      this.handleFailure(modelId);
    } else {
      model.errorRate = model.errorRate * 0.9;
      model.accuracy = Math.min(1, model.accuracy * 0.99 + 0.01);
    }

    // Update health score
    model.health = this.calculateHealth(model);

    this.emit('performance', { modelId, metrics, health: model.health });
  }

  /**
   * Calculate model health score
   */
  private calculateHealth(model: ModelInstance): number {
    const errorWeight = 0.4;
    const latencyWeight = 0.3;
    const freshnessWeight = 0.3;

    const errorScore = Math.max(0, 1 - model.errorRate * 10);
    const latencyScore = Math.max(0, 1 - model.latency / 5000);
    const age = Date.now() - model.lastUsed;
    const freshnessScore = age < 60000 ? 1 : Math.max(0, 1 - age / 3600000);

    return (
      errorScore * errorWeight + latencyScore * latencyWeight + freshnessScore * freshnessWeight
    );
  }

  /**
   * Handle model failure with circuit breaker
   */
  private handleFailure(modelId: string): void {
    const breaker = this.circuitBreakers.get(modelId) || { failures: 0, lastFailure: 0 };
    breaker.failures++;
    breaker.lastFailure = Date.now();

    this.circuitBreakers.set(modelId, breaker);

    // Open circuit after 5 failures in 1 minute
    if (breaker.failures >= 5 && Date.now() - breaker.lastFailure < 60000) {
      const model = this.modelPool.get(modelId);
      if (model) {
        model.status = 'cooling';
        logger.warn(`[EnsembleOrchestrator] Circuit opened for ${modelId}`);
        this.emit('circuitOpen', modelId);

        // Try to warm up replacement
        this.warmupReplacement(model.tier);
      }
    }
  }

  /**
   * Warm up a replacement model
   */
  private warmupReplacement(tier: Tier): void {
    this.emit('warmupNeeded', tier);
  }

  /**
   * Create A/B test routing
   */
  private createABTestRouting(variants: ABTestVariant[]): RoutingDecision {
    // Weighted random selection
    const random = Math.random();
    let cumulativeWeight = 0;

    for (const variant of variants) {
      cumulativeWeight += variant.weight;
      if (random <= cumulativeWeight) {
        return {
          modelIds: [variant.modelId],
          strategy: 'ab-test',
          timeout: 5000,
        };
      }
    }

    // Fallback to first variant
    return {
      modelIds: [variants[0].modelId],
      strategy: 'ab-test',
      timeout: 5000,
    };
  }

  /**
   * Start an A/B test
   */
  startABTest(
    testId: string,
    variants: Array<{ modelId: string; weight: number }>
  ): void {
    const abVariants: ABTestVariant[] = variants.map((v) => ({
      id: `${testId}-${v.modelId}`,
      modelId: v.modelId,
      weight: v.weight,
      metrics: {
        requests: 0,
        errors: 0,
        latency: 0,
        accuracy: 0,
      },
    }));

    this.abTests.set(testId, abVariants);
    logger.info(`[EnsembleOrchestrator] A/B test started: ${testId}`);
    this.emit('abTestStarted', { testId, variants: abVariants });
  }

  /**
   * Stop an A/B test and return results
   */
  stopABTest(testId: string): object | null {
    const variants = this.abTests.get(testId);
    if (!variants) return null;

    this.abTests.delete(testId);

    const results = {
      testId,
      variants: variants.map((v) => ({
        modelId: v.modelId,
        requests: v.metrics.requests,
        errorRate: v.metrics.requests > 0 ? v.metrics.errors / v.metrics.requests : 0,
        avgLatency: v.metrics.latency,
        accuracy: v.metrics.accuracy,
      })),
      winner: this.selectWinner(variants),
    };

    this.emit('abTestCompleted', results);
    return results;
  }

  /**
   * Select winning variant from A/B test
   */
  private selectWinner(variants: ABTestVariant[]): string | null {
    const validVariants = variants.filter((v) => v.metrics.requests > 10);
    if (validVariants.length === 0) return null;

    // Score by accuracy, latency, and error rate
    const scored = validVariants.map((v) => ({
      modelId: v.modelId,
      score:
        v.metrics.accuracy * 0.5 +
        (1 - Math.min(1, v.metrics.latency / 5000)) * 0.3 +
        (1 - (v.metrics.requests > 0 ? v.metrics.errors / v.metrics.requests : 0)) * 0.2,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].modelId;
  }

  /**
   * Get active models
   */
  private getActiveModels(): ModelInstance[] {
    return Array.from(this.modelPool.values()).filter((m) => m.status === 'active');
  }

  /**
   * Get active A/B test
   */
  private getActiveABTest(): ABTestVariant[] | null {
    const entries = Array.from(this.abTests.entries());
    if (entries.length === 0) return null;
    return entries[0][1];  // Return first active test
  }

  /**
   * Calculate timeout based on complexity
   */
  private calculateTimeout(complexity: string): number {
    const timeouts: Record<string, number> = {
      low: 2000,
      medium: 5000,
      high: 10000,
      critical: 15000,
    };
    return timeouts[complexity] || 5000;
  }

  /**
   * Get fallback tier
   */
  private getFallbackTier(complexity: string): Tier | undefined {
    const fallbacks: Record<string, Tier> = {
      low: 'medium',
      medium: 'compact',
      high: 'plus',
      critical: 'external',
    };
    return fallbacks[complexity];
  }

  /**
   * Evaluate and execute auto-scaling
   */
  private evaluateScaling(): void {
    const activeCount = this.getActiveModels().length;
    const stats = shadowCouncil.getStats();

    // Scale up if needed
    if (stats.healthyInstances < this.config.minModels && activeCount < this.config.maxModels) {
      this.emit('scaleUp', { reason: 'insufficient_healthy_models', current: activeCount });
    }

    // Scale down if over-provisioned
    if (activeCount > this.config.maxModels * 1.5) {
      this.emit('scaleDown', { reason: 'over_provisioned', current: activeCount });
    }
  }

  /**
   * Start health check loop
   */
  private startHealthChecks(): void {
    setInterval(() => {
      for (const [modelId, model] of this.modelPool.entries()) {
        // Reset circuit breakers after cooldown
        const breaker = this.circuitBreakers.get(modelId);
        if (breaker && Date.now() - breaker.lastFailure > 300000) {
          breaker.failures = 0;
          this.circuitBreakers.set(modelId, breaker);

          if (model.status === 'cooling') {
            model.status = 'active';
            logger.info(`[EnsembleOrchestrator] Circuit closed for ${modelId}`);
            this.emit('circuitClosed', modelId);
          }
        }
      }
    }, 60000);  // Check every minute
  }

  /**
   * Start auto-scaling loop
   */
  private startAutoScaling(): void {
    if (!this.config.autoScale) return;

    setInterval(() => {
      this.evaluateScaling();
    }, 30000);  // Evaluate every 30 seconds
  }

  /**
   * Get orchestrator status
   */
  getStatus(): object {
    return {
      config: this.config,
      modelPool: Array.from(this.modelPool.values()),
      activeModels: this.getActiveModels().length,
      abTests: Array.from(this.abTests.keys()),
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([id, cb]) => ({
        modelId: id,
        failures: cb.failures,
        open: cb.failures >= 5,
      })),
    };
  }
}

// Global orchestrator instance
export const ensembleOrchestrator = new EnsembleOrchestrator();
