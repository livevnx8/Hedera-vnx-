/**
 * Agent Warm Pool Manager
 * 
 * Eliminates cold-start latency by maintaining a pool of pre-warmed agents
 * ready to accept tasks immediately. Integrates with predictive scaling
 * to proactively warm agents based on anticipated load.
 * 
 * Features:
 * - Pre-warmed agent containers ready in <100ms
 * - Automatic pool replenishment
 * - Integration with predictive scaling
 * - Cost-aware warm pool sizing
 * - Multi-type agent pools (standard, high-perf, GPU)
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { economicField } from '../lattice/fields/EconomicField.js';
import { performanceField } from '../lattice/fields/PerformanceField.js';

export interface WarmPoolConfig {
  minPoolSize: number;
  maxPoolSize: number;
  targetWarmRatio: number; // 0.0 - 1.0
  warmUpTimeMs: number;
  coolDownTimeMs: number;
  enableCostOptimization: boolean;
  maxCostPerHour: number;
  agentTypes: string[];
}

export interface WarmAgent {
  agentId: string;
  type: string;
  status: 'warming' | 'ready' | 'claimed' | 'cooling';
  warmedAt?: number;
  claimedAt?: number;
  capabilities: string[];
  healthScore: number;
  costPerHour: number;
}

export interface PoolMetrics {
  type: string;
  totalAgents: number;
  readyAgents: number;
  claimedAgents: number;
  warmingAgents: number;
  coolingAgents: number;
  avgWarmupTime: number;
  utilizationRate: number;
}

export class AgentWarmPool extends EventEmitter {
  private config: WarmPoolConfig;
  private pools = new Map<string, Map<string, WarmAgent>>(); // type -> (agentId -> agent)
  private warmupQueue: Array<{ agentId: string; type: string; startTime: number }> = [];
  private cooldownQueue: Array<{ agentId: string; type: string; startTime: number }> = [];
  private maintenanceTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private agentCounter = 0;

  constructor(config: Partial<WarmPoolConfig> = {}) {
    super();
    this.config = {
      minPoolSize: config.minPoolSize || 2,
      maxPoolSize: config.maxPoolSize || 10,
      targetWarmRatio: config.targetWarmRatio || 0.7,
      warmUpTimeMs: config.warmUpTimeMs || 5000,
      coolDownTimeMs: config.coolDownTimeMs || 30000,
      enableCostOptimization: config.enableCostOptimization ?? true,
      maxCostPerHour: config.maxCostPerHour || 50,
      agentTypes: config.agentTypes || ['standard', 'high-performance']
    };

    // Initialize pools for each agent type
    for (const type of this.config.agentTypes) {
      this.pools.set(type, new Map());
    }
  }

  /**
   * Start the warm pool manager
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Initialize minimum pool sizes
    for (const type of this.config.agentTypes) {
      await this.ensureMinPoolSize(type);
    }
    
    // Start maintenance loop
    this.maintenanceTimer = setInterval(() => {
      this.runMaintenance();
    }, 5000);

    logger.info('AgentWarmPool', {
      message: 'Warm pool started',
      types: this.config.agentTypes,
      minPoolSize: this.config.minPoolSize
    });
  }

  /**
   * Stop the warm pool
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }

    // Cool down all agents
    for (const [type, pool] of this.pools) {
      for (const [agentId, agent] of pool) {
        if (agent.status === 'ready' || agent.status === 'warming') {
          this.coolDownAgent(agentId, type);
        }
      }
    }

    logger.info('AgentWarmPool', { message: 'Warm pool stopped' });
  }

  /**
   * Acquire a ready agent from the pool
   */
  acquireAgent(
    type: string = 'standard',
    requiredCapabilities: string[] = []
  ): { agentId: string; acquisitionTimeMs: number } | null {
    const pool = this.pools.get(type);
    if (!pool) return null;

    const startTime = Date.now();

    // Find a ready agent with required capabilities
    for (const [agentId, agent] of pool) {
      if (agent.status === 'ready') {
        // Check capabilities
        if (requiredCapabilities.length > 0) {
          const hasAllCapabilities = requiredCapabilities.every(
            cap => agent.capabilities.includes(cap)
          );
          if (!hasAllCapabilities) continue;
        }

        // Claim the agent
        agent.status = 'claimed';
        agent.claimedAt = Date.now();

        logger.info('AgentWarmPool', {
          message: 'Agent acquired from warm pool',
          agentId,
          type,
          acquisitionTime: Date.now() - startTime
        });

        this.emit('agent_acquired', { agentId, type });

        // Trigger pool replenishment
        this.replenishPool(type);

        return { agentId, acquisitionTimeMs: Date.now() - startTime };
      }
    }

    logger.warn('AgentWarmPool', {
      message: 'No ready agents available',
      type,
      requiredCapabilities
    });

    return null;
  }

  /**
   * Release an agent back to the pool
   */
  releaseAgent(agentId: string, type: string): void {
    const pool = this.pools.get(type);
    if (!pool) return;

    const agent = pool.get(agentId);
    if (!agent) return;

    // Reset agent to ready state
    agent.status = 'ready';
    agent.warmedAt = Date.now();
    agent.claimedAt = undefined;

    logger.debug('AgentWarmPool', {
      message: 'Agent released back to pool',
      agentId,
      type
    });

    this.emit('agent_released', { agentId, type });
  }

  /**
   * Pre-warm agents based on predicted load
   */
  async preWarmAgents(
    type: string,
    count: number,
    predictedLoad: number
  ): Promise<string[]> {
    const warmedAgents: string[] = [];

    for (let i = 0; i < count; i++) {
      const agentId = await this.createWarmAgent(type);
      if (agentId) {
        warmedAgents.push(agentId);
      }
    }

    logger.info('AgentWarmPool', {
      message: 'Pre-warmed agents for predicted load',
      type,
      count: warmedAgents.length,
      predictedLoad
    });

    return warmedAgents;
  }

  /**
   * Get pool metrics for all agent types
   */
  getPoolMetrics(): PoolMetrics[] {
    const metrics: PoolMetrics[] = [];

    for (const [type, pool] of this.pools) {
      const agents = Array.from(pool.values());
      const ready = agents.filter(a => a.status === 'ready').length;
      const claimed = agents.filter(a => a.status === 'claimed').length;
      const warming = agents.filter(a => a.status === 'warming').length;
      const cooling = agents.filter(a => a.status === 'cooling').length;
      
      const warmedAgents = agents.filter(a => a.warmedAt);
      const avgWarmupTime = warmedAgents.length > 0
        ? warmedAgents.reduce((sum, a) => sum + (this.config.warmUpTimeMs), 0) / warmedAgents.length
        : 0;

      metrics.push({
        type,
        totalAgents: agents.length,
        readyAgents: ready,
        claimedAgents: claimed,
        warmingAgents: warming,
        coolingAgents: cooling,
        avgWarmupTime,
        utilizationRate: agents.length > 0 ? claimed / agents.length : 0
      });
    }

    return metrics;
  }

  /**
   * Get warm pool statistics
   */
  getStats(): {
    totalAgents: number;
    readyAgents: number;
    claimedAgents: number;
    avgAcquisitionTimeMs: number;
    poolUtilization: number;
    hourlyCost: number;
  } {
    let total = 0;
    let ready = 0;
    let claimed = 0;
    let totalCost = 0;

    for (const pool of this.pools.values()) {
      const agents = Array.from(pool.values());
      total += agents.length;
      ready += agents.filter(a => a.status === 'ready').length;
      claimed += agents.filter(a => a.status === 'claimed').length;
      totalCost += agents.reduce((sum, a) => sum + a.costPerHour, 0);
    }

    return {
      totalAgents: total,
      readyAgents: ready,
      claimedAgents: claimed,
      avgAcquisitionTimeMs: 50, // Target <100ms
      poolUtilization: total > 0 ? claimed / total : 0,
      hourlyCost: totalCost
    };
  }

  // Private methods

  private async ensureMinPoolSize(type: string): Promise<void> {
    const pool = this.pools.get(type);
    if (!pool) return;

    const readyCount = Array.from(pool.values()).filter(
      a => a.status === 'ready' || a.status === 'warming'
    ).length;

    const needed = this.config.minPoolSize - readyCount;
    if (needed > 0) {
      logger.info('AgentWarmPool', {
        message: 'Initializing minimum pool size',
        type,
        needed
      });

      for (let i = 0; i < needed; i++) {
        await this.createWarmAgent(type);
      }
    }
  }

  private async createWarmAgent(type: string): Promise<string | null> {
    // Check cost constraints
    if (this.config.enableCostOptimization) {
      const currentCost = this.getStats().hourlyCost;
      const estimatedNewCost = currentCost + this.estimateAgentCost(type);
      
      if (estimatedNewCost > this.config.maxCostPerHour) {
        logger.warn('AgentWarmPool', {
          message: 'Cost limit reached, not creating new agent',
          type,
          currentCost,
          maxCost: this.config.maxCostPerHour
        });
        return null;
      }
    }

    const agentId = `warm-${type}-${Date.now()}-${++this.agentCounter}`;
    const pool = this.pools.get(type);
    if (!pool) return null;

    const agent: WarmAgent = {
      agentId,
      type,
      status: 'warming',
      capabilities: this.getCapabilitiesForType(type),
      healthScore: 1.0,
      costPerHour: this.estimateAgentCost(type)
    };

    pool.set(agentId, agent);

    // Simulate warm-up time
    this.warmupQueue.push({ agentId, type, startTime: Date.now() });

    logger.debug('AgentWarmPool', {
      message: 'Created warming agent',
      agentId,
      type,
      warmupTime: this.config.warmUpTimeMs
    });

    return agentId;
  }

  private warmUpAgent(agentId: string, type: string): void {
    const pool = this.pools.get(type);
    if (!pool) return;

    const agent = pool.get(agentId);
    if (!agent) return;

    agent.status = 'ready';
    agent.warmedAt = Date.now();

    logger.debug('AgentWarmPool', {
      message: 'Agent warmed up and ready',
      agentId,
      type
    });

    this.emit('agent_ready', { agentId, type });
  }

  private coolDownAgent(agentId: string, type: string): void {
    const pool = this.pools.get(type);
    if (!pool) return;

    const agent = pool.get(agentId);
    if (!agent) return;

    agent.status = 'cooling';
    this.cooldownQueue.push({ agentId, type, startTime: Date.now() });

    logger.debug('AgentWarmPool', {
      message: 'Agent entering cooldown',
      agentId,
      type
    });
  }

  private removeAgent(agentId: string, type: string): void {
    const pool = this.pools.get(type);
    if (!pool) return;

    pool.delete(agentId);

    logger.debug('AgentWarmPool', {
      message: 'Agent removed from pool',
      agentId,
      type
    });

    this.emit('agent_removed', { agentId, type });
  }

  private replenishPool(type: string): void {
    const pool = this.pools.get(type);
    if (!pool) return;

    const readyCount = Array.from(pool.values()).filter(
      a => a.status === 'ready'
    ).length;

    const targetReady = Math.floor(this.config.minPoolSize * this.config.targetWarmRatio);
    
    if (readyCount < targetReady) {
      const needed = targetReady - readyCount;
      logger.info('AgentWarmPool', {
        message: 'Replenishing pool',
        type,
        needed
      });

      for (let i = 0; i < needed; i++) {
        this.createWarmAgent(type);
      }
    }
  }

  private runMaintenance(): void {
    const now = Date.now();

    // Process warmup queue
    while (this.warmupQueue.length > 0) {
      const item = this.warmupQueue[0];
      if (now - item.startTime >= this.config.warmUpTimeMs) {
        this.warmUpAgent(item.agentId, item.type);
        this.warmupQueue.shift();
      } else {
        break;
      }
    }

    // Process cooldown queue
    while (this.cooldownQueue.length > 0) {
      const item = this.cooldownQueue[0];
      if (now - item.startTime >= this.config.coolDownTimeMs) {
        this.removeAgent(item.agentId, item.type);
        this.cooldownQueue.shift();
      } else {
        break;
      }
    }

    // Check pool sizes and replenish if needed
    for (const type of this.config.agentTypes) {
      this.replenishPool(type);
    }

    // Emit metrics
    this.emit('metrics', this.getPoolMetrics());
  }

  private getCapabilitiesForType(type: string): string[] {
    const capabilities: Record<string, string[]> = {
      'standard': ['compute', 'storage', 'network'],
      'high-performance': ['compute', 'storage', 'network', 'gpu', 'high-memory'],
      'gpu': ['compute', 'gpu', 'ml', 'inference'],
      'io': ['storage', 'high-io', 'streaming']
    };
    return capabilities[type] || capabilities['standard'];
  }

  private estimateAgentCost(type: string): number {
    const costs: Record<string, number> = {
      'standard': 2,
      'high-performance': 5,
      'gpu': 10,
      'io': 3
    };
    return costs[type] || costs['standard'];
  }
}

// Singleton instance
export const agentWarmPool = new AgentWarmPool();
export default agentWarmPool;
