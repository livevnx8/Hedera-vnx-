/**
 * Workload-Adaptive Variant Controller
 *
 * Automatically switches agent variants based on workload characteristics:
 * - Macro Agents: Batch processing, high throughput, low frequency (every 5s)
 * - Micro Agents: Real-time processing, low latency, high frequency (every 100ms)
 * - Normal Agents: Balanced processing, standard frequency (every 1s)
 * - Hybrid Mode: Agents switch variant based on current queue characteristics
 * - Auto-promote micro→normal→macro based on task accumulation rate
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';

export type AgentVariant = 'micro' | 'normal' | 'macro';

export interface VariantState {
  agentId: string;
  currentVariant: AgentVariant;
  lastSwitch: number;
  switchCount: number;
  queueDepth: number;
  taskRate: number; // tasks per second
  avgLatency: number;
  batchSize: number;
  processingMode: 'throughput' | 'latency' | 'balanced';
}

export interface VariantThresholds {
  microToNormalQueue: number;   // Queue depth to promote from micro
  normalToMacroQueue: number;   // Queue depth to promote from normal
  macroToNormalQueue: number;   // Queue depth to demote from macro
  normalToMicroQueue: number;   // Queue depth to demote from normal
  minSwitchIntervalMs: number;  // Minimum time between switches
  taskRateWindowMs: number;     // Window for calculating task rate
}

export interface VariantConfig {
  micro: {
    tickInterval: number;
    maxQueueDepth: number;
    targetLatency: number;
    batchSize: number;
  };
  normal: {
    tickInterval: number;
    maxQueueDepth: number;
    targetLatency: number;
    batchSize: number;
  };
  macro: {
    tickInterval: number;
    maxQueueDepth: number;
    targetLatency: number;
    batchSize: number;
  };
  thresholds: VariantThresholds;
  enableAutoSwitch: boolean;
  enableHybridMode: boolean;
}

const DEFAULT_CONFIG: VariantConfig = {
  micro: {
    tickInterval: 100,    // 100ms
    maxQueueDepth: 10,
    targetLatency: 50,   // 50ms
    batchSize: 1,        // Single task processing
  },
  normal: {
    tickInterval: 1000,  // 1s
    maxQueueDepth: 50,
    targetLatency: 500,  // 500ms
    batchSize: 5,        // Small batches
  },
  macro: {
    tickInterval: 5000,  // 5s
    maxQueueDepth: 200,
    targetLatency: 2000, // 2s
    batchSize: 20,       // Large batches
  },
  thresholds: {
    microToNormalQueue: 8,
    normalToMacroQueue: 40,
    macroToNormalQueue: 100,
    normalToMicroQueue: 5,
    minSwitchIntervalMs: 3000,
    taskRateWindowMs: 10000,
  },
  enableAutoSwitch: true,
  enableHybridMode: true,
};

export interface VariantMetrics {
  variant: AgentVariant;
  queueDepth: number;
  taskRate: number;
  avgLatency: number;
  throughput: number;
  efficiency: number;
}

export class VariantController extends EventEmitter {
  private agentStates = new Map<string, VariantState>();
  private config: VariantConfig;
  private isRunning = false;
  private checkTimer: NodeJS.Timeout | null = null;
  private taskHistory = new Map<string, Array<{ timestamp: number; count: number }>>();
  
  // Statistics
  private stats = {
    switchesMicroToNormal: 0,
    switchesNormalToMacro: 0,
    switchesMacroToNormal: 0,
    switchesNormalToMicro: 0,
    hybridTransitions: 0,
    blockedSwitches: 0,
  };

  constructor(config: Partial<VariantConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the variant controller
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.checkTimer = setInterval(() => {
      this.runVariantCheckCycle();
    }, 500); // Check every 500ms

    logger.info('VariantController', {
      message: 'Variant controller started',
      autoSwitch: this.config.enableAutoSwitch,
      hybridMode: this.config.enableHybridMode,
    });

    this.emit('started');
  }

  /**
   * Stop the variant controller
   */
  stop(): void {
    this.isRunning = false;
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    logger.info('VariantController', { message: 'Variant controller stopped' });
    this.emit('stopped');
  }

  /**
   * Register a new agent with variant controller
   */
  registerAgent(agentId: string, initialVariant: AgentVariant = 'normal'): void {
    const state: VariantState = {
      agentId,
      currentVariant: initialVariant,
      lastSwitch: Date.now(),
      switchCount: 0,
      queueDepth: 0,
      taskRate: 0,
      avgLatency: 0,
      batchSize: this.config[initialVariant].batchSize,
      processingMode: this.getModeFromVariant(initialVariant),
    };

    this.agentStates.set(agentId, state);
    this.taskHistory.set(agentId, []);

    logger.debug('VariantController', {
      message: 'Agent registered',
      agentId,
      variant: initialVariant,
    });

    this.emit('agent_registered', { agentId, variant: initialVariant });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agentStates.delete(agentId);
    this.taskHistory.delete(agentId);

    logger.debug('VariantController', {
      message: 'Agent unregistered',
      agentId,
    });

    this.emit('agent_unregistered', { agentId });
  }

  /**
   * Update agent metrics
   */
  updateMetrics(agentId: string, metrics: {
    queueDepth?: number;
    taskRate?: number;
    latency?: number;
    completedTasks?: number;
  }): void {
    const state = this.agentStates.get(agentId);
    if (!state) return;

    if (metrics.queueDepth !== undefined) {
      state.queueDepth = metrics.queueDepth;
    }
    if (metrics.taskRate !== undefined) {
      state.taskRate = metrics.taskRate;
    }
    if (metrics.latency !== undefined) {
      state.avgLatency = state.avgLatency * 0.7 + metrics.latency * 0.3;
    }

    // Record task completion for history
    if (metrics.completedTasks) {
      let history = this.taskHistory.get(agentId);
      if (!history) {
        history = [];
        this.taskHistory.set(agentId, history);
      }

      history.push({
        timestamp: Date.now(),
        count: metrics.completedTasks,
      });

      // Keep only last window
      const cutoff = Date.now() - this.config.thresholds.taskRateWindowMs;
      while (history.length > 0 && history[0].timestamp < cutoff) {
        history.shift();
      }
    }
  }

  /**
   * Main check cycle - evaluates all agents for variant switching
   */
  private runVariantCheckCycle(): void {
    if (!this.config.enableAutoSwitch) return;

    for (const [agentId, state] of this.agentStates) {
      this.evaluateVariantSwitch(agentId, state);
    }
  }

  /**
   * Evaluate whether an agent should switch variants
   */
  private evaluateVariantSwitch(agentId: string, state: VariantState): void {
    const timeSinceLastSwitch = Date.now() - state.lastSwitch;
    
    // Respect minimum switch interval
    if (timeSinceLastSwitch < this.config.thresholds.minSwitchIntervalMs) {
      return;
    }

    // Calculate effective task rate from history
    const history = this.taskHistory.get(agentId) || [];
    const effectiveRate = this.calculateEffectiveRate(history);

    let newVariant: AgentVariant | null = null;
    let switchReason = '';

    switch (state.currentVariant) {
      case 'micro':
        // Promote to normal if queue building up
        if (state.queueDepth >= this.config.thresholds.microToNormalQueue ||
            effectiveRate > 50) {
          newVariant = 'normal';
          switchReason = `queue_depth_${state.queueDepth}_high_rate_${effectiveRate.toFixed(1)}`;
        }
        break;

      case 'normal':
        // Promote to macro if queue building significantly
        if (state.queueDepth >= this.config.thresholds.normalToMacroQueue ||
            effectiveRate > 200) {
          newVariant = 'macro';
          switchReason = `queue_depth_${state.queueDepth}_burst_rate_${effectiveRate.toFixed(1)}`;
        }
        // Demote to micro if queue very low (efficiency optimization)
        else if (state.queueDepth <= this.config.thresholds.normalToMicroQueue &&
                 effectiveRate < 10 &&
                 this.config.enableHybridMode) {
          newVariant = 'micro';
          switchReason = `queue_depth_${state.queueDepth}_low_rate_${effectiveRate.toFixed(1)}`;
        }
        break;

      case 'macro':
        // Demote to normal if queue reduced
        if (state.queueDepth <= this.config.thresholds.macroToNormalQueue &&
            effectiveRate < 150) {
          newVariant = 'normal';
          switchReason = `queue_reduced_${state.queueDepth}_rate_${effectiveRate.toFixed(1)}`;
        }
        break;
    }

    // Execute switch if determined
    if (newVariant && newVariant !== state.currentVariant) {
      this.executeVariantSwitch(agentId, state, newVariant, switchReason);
    }
  }

  /**
   * Calculate effective task rate from history
   */
  private calculateEffectiveRate(history: Array<{ timestamp: number; count: number }>): number {
    if (history.length === 0) return 0;

    const totalTasks = history.reduce((sum, h) => sum + h.count, 0);
    const timeSpan = Date.now() - history[0].timestamp;
    
    if (timeSpan === 0) return 0;

    // Tasks per second
    return (totalTasks / timeSpan) * 1000;
  }

  /**
   * Execute variant switch
   */
  private executeVariantSwitch(
    agentId: string,
    state: VariantState,
    newVariant: AgentVariant,
    reason: string
  ): void {
    const oldVariant = state.currentVariant;

    // Update state
    state.currentVariant = newVariant;
    state.lastSwitch = Date.now();
    state.switchCount++;
    state.batchSize = this.config[newVariant].batchSize;
    state.processingMode = this.getModeFromVariant(newVariant);

    // Update statistics
    this.updateSwitchStats(oldVariant, newVariant);

    logger.info('VariantController', {
      message: 'Variant switched',
      agentId,
      from: oldVariant,
      to: newVariant,
      reason,
      switchCount: state.switchCount,
      queueDepth: state.queueDepth,
    });

    this.emit('variant_switched', {
      agentId,
      from: oldVariant,
      to: newVariant,
      reason,
      config: this.config[newVariant],
    });
  }

  /**
   * Update switch statistics
   */
  private updateSwitchStats(from: AgentVariant, to: AgentVariant): void {
    if (from === 'micro' && to === 'normal') this.stats.switchesMicroToNormal++;
    if (from === 'normal' && to === 'macro') this.stats.switchesNormalToMacro++;
    if (from === 'macro' && to === 'normal') this.stats.switchesMacroToNormal++;
    if (from === 'normal' && to === 'micro') this.stats.switchesNormalToMicro++;
    if (from !== to) this.stats.hybridTransitions++;
  }

  /**
   * Force variant switch (admin/manual override)
   */
  forceVariantSwitch(agentId: string, newVariant: AgentVariant, reason: string): boolean {
    const state = this.agentStates.get(agentId);
    if (!state) return false;

    this.executeVariantSwitch(agentId, state, newVariant, `forced_${reason}`);
    return true;
  }

  /**
   * Get processing mode from variant
   */
  private getModeFromVariant(variant: AgentVariant): 'throughput' | 'latency' | 'balanced' {
    switch (variant) {
      case 'micro': return 'latency';
      case 'normal': return 'balanced';
      case 'macro': return 'throughput';
    }
  }

  /**
   * Get current variant config for an agent
   */
  getAgentConfig(agentId: string): {
    variant: AgentVariant;
    tickInterval: number;
    batchSize: number;
    maxQueueDepth: number;
    targetLatency: number;
    processingMode: string;
  } | null {
    const state = this.agentStates.get(agentId);
    if (!state) return null;

    const variantConfig = this.config[state.currentVariant];

    return {
      variant: state.currentVariant,
      tickInterval: variantConfig.tickInterval,
      batchSize: state.batchSize,
      maxQueueDepth: variantConfig.maxQueueDepth,
      targetLatency: variantConfig.targetLatency,
      processingMode: state.processingMode,
    };
  }

  /**
   * Get variant-specific metrics
   */
  getVariantMetrics(): Record<AgentVariant, VariantMetrics> {
    const metrics: Record<AgentVariant, VariantMetrics> = {
      micro: { variant: 'micro', queueDepth: 0, taskRate: 0, avgLatency: 0, throughput: 0, efficiency: 0 },
      normal: { variant: 'normal', queueDepth: 0, taskRate: 0, avgLatency: 0, throughput: 0, efficiency: 0 },
      macro: { variant: 'macro', queueDepth: 0, taskRate: 0, avgLatency: 0, throughput: 0, efficiency: 0 },
    };

    const counts: Record<AgentVariant, number> = { micro: 0, normal: 0, macro: 0 };

    for (const state of this.agentStates.values()) {
      const m = metrics[state.currentVariant];
      m.queueDepth += state.queueDepth;
      m.taskRate += state.taskRate;
      m.avgLatency += state.avgLatency;
      counts[state.currentVariant]++;
    }

    // Average the metrics
    for (const variant of ['micro', 'normal', 'macro'] as AgentVariant[]) {
      const count = counts[variant];
      if (count > 0) {
        const m = metrics[variant];
        m.queueDepth /= count;
        m.taskRate /= count;
        m.avgLatency /= count;
        m.throughput = m.taskRate;
        m.efficiency = m.throughput / (m.avgLatency + 1);
      }
    }

    return metrics;
  }

  /**
   * Get controller statistics
   */
  getStats(): {
    switchesMicroToNormal: number;
    switchesNormalToMacro: number;
    switchesMacroToNormal: number;
    switchesNormalToMicro: number;
    hybridTransitions: number;
    blockedSwitches: number;
    totalAgents: number;
    variantDistribution: Record<AgentVariant, number>;
  } {
    const distribution: Record<AgentVariant, number> = { micro: 0, normal: 0, macro: 0 };
    
    for (const state of this.agentStates.values()) {
      distribution[state.currentVariant]++;
    }

    return {
      switchesMicroToNormal: this.stats.switchesMicroToNormal,
      switchesNormalToMacro: this.stats.switchesNormalToMacro,
      switchesMacroToNormal: this.stats.switchesMacroToNormal,
      switchesNormalToMicro: this.stats.switchesNormalToMicro,
      hybridTransitions: this.stats.hybridTransitions,
      blockedSwitches: this.stats.blockedSwitches,
      totalAgents: this.agentStates.size,
      variantDistribution: distribution,
    };
  }

  /**
   * Batch agents by variant for efficient processing
   */
  getAgentsByVariant(): Record<AgentVariant, string[]> {
    const batches: Record<AgentVariant, string[]> = {
      micro: [],
      normal: [],
      macro: [],
    };

    for (const [agentId, state] of this.agentStates) {
      batches[state.currentVariant].push(agentId);
    }

    return batches;
  }

  /**
   * Get optimal tick interval for coordinated processing
   */
  getCoordinatedTick(variant: AgentVariant): number {
    return this.config[variant].tickInterval;
  }

  /**
   * Determine if agent should process on this tick
   */
  shouldProcess(agentId: string, currentTime: number): boolean {
    const state = this.agentStates.get(agentId);
    if (!state) return false;

    const interval = this.config[state.currentVariant].tickInterval;
    const lastTick = state.lastSwitch;
    
    return (currentTime - lastTick) >= interval;
  }

  /**
   * Get recommended batch size for agent
   */
  getBatchSize(agentId: string): number {
    const state = this.agentStates.get(agentId);
    if (!state) return 1;

    return Math.min(state.batchSize, state.queueDepth);
  }

  /**
   * Update controller configuration
   */
  updateConfig(newConfig: Partial<VariantConfig>): void {
    this.config = { ...this.config, ...newConfig };

    logger.info('VariantController', {
      message: 'Configuration updated',
      enableAutoSwitch: this.config.enableAutoSwitch,
      enableHybridMode: this.config.enableHybridMode,
    });

    this.emit('config_updated', this.config);
  }

  /**
   * Recommend optimal variant for workload pattern
   */
  recommendVariant(workloadPattern: {
    avgQueueDepth: number;
    taskRate: number;
    latencyRequirement: number;
    batchingEfficiency: number;
  }): AgentVariant {
    // Latency-critical workloads -> micro
    if (workloadPattern.latencyRequirement < 100) {
      return 'micro';
    }

    // High throughput with batching -> macro
    if (workloadPattern.taskRate > 100 && workloadPattern.batchingEfficiency > 0.7) {
      return 'macro';
    }

    // Medium load or no strong preference -> normal
    return 'normal';
  }
}

// Singleton export
let controllerInstance: VariantController | null = null;

export function getVariantController(config?: Partial<VariantConfig>): VariantController {
  if (!controllerInstance) {
    controllerInstance = new VariantController(config);
  }
  return controllerInstance;
}

export function resetVariantController(): void {
  controllerInstance = null;
}
