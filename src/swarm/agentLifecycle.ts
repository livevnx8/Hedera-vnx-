/**
 * Enhanced Agent Lifecycle Manager
 *
 * Advanced agent lifecycle with:
 * - Graceful degradation: Reduce agent capacity gradually before removal
 * - Health scoring: Track success rate, latency, error rate per agent
 * - Automatic variant reassignment based on performance trends
 * - Lattice memory: Remember high-performing agent positions for future spawning
 * - Sacred geometry-aware agent positioning
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import type { FlowerOfLifeOS, LatticeNode, LatticeLayer } from '../vera/orchestrator/flowerOfLifeOS.js';
import type { AgentVariant } from './variantController.js';

type AgentStatus = 'spawning' | 'warming' | 'active' | 'degraded' | 'recovering' | 'cooling' | 'removing' | 'removed';
type HealthLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

interface AgentHealth {
  agentId: string;
  status: AgentStatus;
  healthLevel: HealthLevel;
  healthScore: number; // 0-1
  
  // Performance metrics
  successRate: number;
  avgLatency: number;
  errorRate: number;
  tasksCompleted: number;
  tasksFailed: number;
  lastTask: number;
  
  // Resource metrics
  cpuUsage: number;
  memoryUsage: number;
  queueDepth: number;
  
  // Lifecycle timestamps
  spawnedAt: number;
  activatedAt?: number;
  lastHealthCheck: number;
  degradationStarted?: number;
  
  // Position info
  nodeId: string;
  layer: LatticeLayer;
  variant: AgentVariant;
  capabilities: string[];
  
  // History
  performanceHistory: Array<{
    timestamp: number;
    successRate: number;
    latency: number;
    healthScore: number;
  }>;
  
  // Recovery attempts
  recoveryAttempts: number;
  lastRecovery: number;
}

interface LifecycleConfig {
  healthCheckIntervalMs: number;
  degradationThreshold: number; // Health score below this triggers degradation
  recoveryThreshold: number; // Health score above this allows recovery
  maxDegradationLevel: number; // Max 0.5 capacity
  recoveryAttempts: number;
  gracePeriodMs: number; // Time before degradation starts
  removalThreshold: number; // Health score below this triggers removal
  coolingPeriodMs: number;
  performanceHistorySize: number;
  enableGracefulDegradation: boolean;
  enableAutoRecovery: boolean;
  enableLatticeMemory: boolean;
}

interface LatticeMemory {
  position: { x: number; y: number; layer: LatticeLayer; angle: number };
  performanceScore: number;
  spawnCount: number;
  lastUsed: number;
}

const DEFAULT_CONFIG: LifecycleConfig = {
  healthCheckIntervalMs: 30000, // 30 seconds
  degradationThreshold: 0.5,
  recoveryThreshold: 0.7,
  maxDegradationLevel: 0.5, // Reduce to 50% capacity
  recoveryAttempts: 3,
  gracePeriodMs: 60000, // 1 minute grace period
  removalThreshold: 0.2,
  coolingPeriodMs: 120000, // 2 minutes
  performanceHistorySize: 100,
  enableGracefulDegradation: true,
  enableAutoRecovery: true,
  enableLatticeMemory: true,
};

// Sacred geometry constants
const PHI = (1 + Math.sqrt(5)) / 2;

export class AgentLifecycleManager extends EventEmitter {
  private lattice: FlowerOfLifeOS;
  private agents = new Map<string, AgentHealth>();
  private config: LifecycleConfig;
  private isRunning = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private latticeMemory = new Map<string, LatticeMemory[]>(); // layer -> positions
  
  // Statistics
  private stats = {
    agentsSpawned: 0,
    agentsActivated: 0,
    agentsDegraded: 0,
    agentsRecovered: 0,
    agentsRemoved: 0,
    recoveryAttempts: 0,
    recoverySuccesses: 0,
  };

  constructor(lattice: FlowerOfLifeOS, config: Partial<LifecycleConfig> = {}) {
    super();
    this.lattice = lattice;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the lifecycle manager
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.healthCheckTimer = setInterval(() => {
      this.runHealthCheckCycle();
    }, this.config.healthCheckIntervalMs);

    logger.info('AgentLifecycleManager', {
      message: 'Agent lifecycle manager started',
      checkInterval: this.config.healthCheckIntervalMs,
      degradationEnabled: this.config.enableGracefulDegradation,
      recoveryEnabled: this.config.enableAutoRecovery,
    });

    this.emit('started');
  }

  /**
   * Stop the lifecycle manager
   */
  stop(): void {
    this.isRunning = false;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    logger.info('AgentLifecycleManager', { message: 'Agent lifecycle manager stopped' });
    this.emit('stopped');
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): boolean {
    const health = this.agents.get(agentId);
    if (!health) return false;

    health.status = 'removed';
    this.agents.delete(agentId);

    logger.info('AgentLifecycleManager', {
      message: 'Agent unregistered',
      agentId,
    });

    this.emit('agent_unregistered', { agentId });
    return true;
  }

  /**
   * Spawn a new agent
   */
  spawnAgent(
    agentId: string,
    nodeId: string,
    layer: LatticeLayer,
    variant: AgentVariant,
    capabilities: string[]
  ): AgentHealth {
    const now = Date.now();
    
    const health: AgentHealth = {
      agentId,
      status: 'spawning',
      healthLevel: 'excellent',
      healthScore: 1.0,
      successRate: 1.0,
      avgLatency: 0,
      errorRate: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      lastTask: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      queueDepth: 0,
      spawnedAt: now,
      lastHealthCheck: now,
      recoveryAttempts: 0,
      lastRecovery: 0,
      nodeId,
      layer,
      variant,
      capabilities,
      performanceHistory: [],
    };

    this.agents.set(agentId, health);
    this.stats.agentsSpawned++;

    // Transition to warming after a short delay
    setTimeout(() => {
      health.status = 'warming';
      this.emit('agent_warming', { agentId, nodeId, layer, variant });
    }, 1000);

    // Transition to active after grace period
    setTimeout(() => {
      if (this.agents.has(agentId)) {
        health.status = 'active';
        health.activatedAt = Date.now();
        this.stats.agentsActivated++;
        this.emit('agent_activated', { agentId, nodeId, layer, variant });
      }
    }, this.config.gracePeriodMs);

    logger.debug('AgentLifecycleManager', {
      message: 'Agent spawned',
      agentId,
      nodeId,
      layer,
      variant,
    });

    this.emit('agent_spawned', { agentId, nodeId, layer, variant, capabilities });
    return health;
  }

  /**
   * Record task completion for an agent
   */
  recordTaskCompletion(
    agentId: string,
    result: { success: boolean; latency: number; error?: string }
  ): void {
    const health = this.agents.get(agentId);
    if (!health) return;

    if (result.success) {
      health.tasksCompleted++;
      // EMA for latency
      health.avgLatency = health.avgLatency 
        ? health.avgLatency * 0.7 + result.latency * 0.3
        : result.latency;
    } else {
      health.tasksFailed++;
    }

    health.lastTask = Date.now();

    // Update success rate
    const total = health.tasksCompleted + health.tasksFailed;
    health.successRate = total > 0 ? health.tasksCompleted / total : 1.0;
    health.errorRate = total > 0 ? health.tasksFailed / total : 0;

    this.emit('task_recorded', {
      agentId,
      success: result.success,
      latency: result.latency,
      health,
    });
  }

  /**
   * Update agent metrics
   */
  updateMetrics(agentId: string, metrics: {
    cpuUsage?: number;
    memoryUsage?: number;
    queueDepth?: number;
    latency?: number;
  }): void {
    const health = this.agents.get(agentId);
    if (!health) return;

    if (metrics.cpuUsage !== undefined) health.cpuUsage = metrics.cpuUsage;
    if (metrics.memoryUsage !== undefined) health.memoryUsage = metrics.memoryUsage;
    if (metrics.queueDepth !== undefined) health.queueDepth = metrics.queueDepth;
    if (metrics.latency !== undefined) {
      health.avgLatency = health.avgLatency 
        ? health.avgLatency * 0.7 + metrics.latency * 0.3
        : metrics.latency;
    }
  }

  /**
   * Run health check cycle for all agents
   */
  private runHealthCheckCycle(): void {
    for (const [agentId, health] of this.agents) {
      this.checkAgentHealth(agentId, health);
    }
  }

  /**
   * Check individual agent health
   */
  private checkAgentHealth(agentId: string, health: AgentHealth): void {
    const now = Date.now();
    health.lastHealthCheck = now;

    // Skip if not yet active
    if (health.status === 'spawning' || health.status === 'warming') return;
    // Skip if already removing
    if (health.status === 'removing') return;

    // Calculate health score
    const newScore = this.calculateHealthScore(health);
    
    // Record history
    health.performanceHistory.push({
      timestamp: now,
      successRate: health.successRate,
      latency: health.avgLatency,
      healthScore: newScore,
    });

    // Trim history
    if (health.performanceHistory.length > this.config.performanceHistorySize) {
      health.performanceHistory.shift();
    }

    const oldScore = health.healthScore;
    health.healthScore = newScore;
    health.healthLevel = this.scoreToLevel(newScore);

    // Check for degradation
    if (newScore < this.config.degradationThreshold && 
        health.status === 'active' && 
        this.config.enableGracefulDegradation) {
      this.degradeAgent(agentId, health);
    }

    // Check for recovery
    if (newScore > this.config.recoveryThreshold && 
        (health.status === 'degraded' || health.status === 'recovering') &&
        this.config.enableAutoRecovery) {
      this.recoverAgent(agentId, health);
    }

    // Check for removal
    if (newScore < this.config.removalThreshold && 
        health.status !== 'cooling') {
      this.removeAgent(agentId, health, 'critical_health');
    }

    // Emit if significant change
    if (Math.abs(newScore - oldScore) > 0.1) {
      this.emit('health_changed', {
        agentId,
        oldScore,
        newScore,
        level: health.healthLevel,
        status: health.status,
      });
    }
  }

  /**
   * Calculate composite health score
   */
  private calculateHealthScore(health: AgentHealth): number {
    // Weight factors
    const weights = {
      successRate: 0.35,
      latency: 0.20,
      errorRate: 0.20,
      resourceUsage: 0.15,
      recency: 0.10,
    };

    // Success rate (0-1)
    const successScore = health.successRate;

    // Latency score (lower is better, normalize to 0-1)
    const latencyScore = Math.max(0, 1 - (health.avgLatency / 5000)); // 5s threshold

    // Error rate score
    const errorScore = Math.max(0, 1 - health.errorRate * 10);

    // Resource usage (lower is better)
    const resourceScore = 1 - ((health.cpuUsage + health.memoryUsage) / 2);

    // Recency score (have they processed tasks recently?)
    const idleTime = Date.now() - health.lastTask;
    const recencyScore = health.lastTask === 0 ? 0.5 : Math.max(0, 1 - idleTime / 300000); // 5min threshold

    // Queue pressure (lower is better)
    const queueScore = Math.max(0, 1 - health.queueDepth / 50);

    // Combine scores
    const combined = 
      successScore * weights.successRate +
      latencyScore * weights.latency +
      errorScore * weights.errorRate +
      resourceScore * weights.resourceUsage +
      recencyScore * weights.recency;

    return Math.max(0, Math.min(1, combined));
  }

  /**
   * Convert score to level
   */
  private scoreToLevel(score: number): HealthLevel {
    if (score >= 0.9) return 'excellent';
    if (score >= 0.75) return 'good';
    if (score >= 0.5) return 'fair';
    if (score >= 0.25) return 'poor';
    return 'critical';
  }

  /**
   * Degrade an agent gracefully
   */
  private degradeAgent(agentId: string, health: AgentHealth): void {
    health.status = 'degraded';
    health.degradationStarted = Date.now();
    this.stats.agentsDegraded++;

    logger.warn('AgentLifecycleManager', {
      message: 'Agent degraded',
      agentId,
      healthScore: health.healthScore.toFixed(3),
      level: health.healthLevel,
    });

    this.emit('agent_degraded', {
      agentId,
      health,
      maxCapacity: this.config.maxDegradationLevel,
    });
  }

  /**
   * Attempt to recover a degraded agent
   */
  private recoverAgent(agentId: string, health: AgentHealth): void {
    if (health.recoveryAttempts >= this.config.recoveryAttempts) {
      // Max attempts reached, remove instead
      this.removeAgent(agentId, health, 'max_recovery_attempts');
      return;
    }

    health.status = 'recovering';
    health.recoveryAttempts++;
    health.lastRecovery = Date.now();
    this.stats.recoveryAttempts++;

    logger.info('AgentLifecycleManager', {
      message: 'Agent recovery attempted',
      agentId,
      attempt: health.recoveryAttempts,
      maxAttempts: this.config.recoveryAttempts,
    });

    this.emit('agent_recovering', {
      agentId,
      attempt: health.recoveryAttempts,
      health,
    });

    // Simulate recovery (in real system, would restart/refresh agent)
    setTimeout(() => {
      if (health.healthScore > this.config.recoveryThreshold) {
        health.status = 'active';
        health.degradationStarted = undefined;
        this.stats.agentsRecovered++;
        this.stats.recoverySuccesses++;

        logger.info('AgentLifecycleManager', {
          message: 'Agent recovered',
          agentId,
          attempts: health.recoveryAttempts,
        });

        this.emit('agent_recovered', { agentId, health });
      } else {
        // Recovery failed, stay degraded or try again
        health.status = 'degraded';
        
        logger.warn('AgentLifecycleManager', {
          message: 'Agent recovery failed',
          agentId,
          attempts: health.recoveryAttempts,
        });

        this.emit('recovery_failed', { agentId, health });
      }
    }, 10000); // 10s recovery window
  }

  /**
   * Remove an agent from the swarm
   */
  removeAgent(agentId: string, health: AgentHealth, reason: string): void {
    // Store position in lattice memory if performance was good
    if (health.tasksCompleted > 10 && health.successRate > 0.8 && this.config.enableLatticeMemory) {
      this.rememberPosition(health);
    }

    health.status = 'cooling';

    logger.info('AgentLifecycleManager', {
      message: 'Agent removing',
      agentId,
      reason,
      healthScore: health.healthScore.toFixed(3),
      tasksCompleted: health.tasksCompleted,
    });

    this.emit('agent_removing', {
      agentId,
      reason,
      health,
      coolDownDuration: this.config.coolingPeriodMs,
    });

    // Actually remove after cooling period
    setTimeout(() => {
      health.status = 'removing';
      this.agents.delete(agentId);
      this.stats.agentsRemoved++;

      this.emit('agent_removed', {
        agentId,
        reason,
        finalHealth: health,
      });
    }, this.config.coolingPeriodMs);
  }

  /**
   * Remember a good position in lattice memory
   */
  private rememberPosition(health: AgentHealth): void {
    const layer = health.layer;
    let positions = this.latticeMemory.get(layer.toString());
    if (!positions) {
      positions = [];
      this.latticeMemory.set(layer.toString(), positions);
    }

    // Get lattice node info
    const latticeState = this.lattice.getLatticeState?.() || { nodes: [] };
    const node = latticeState.nodes.find(n => n.id === health.nodeId);
    if (!node) return;

    // Calculate performance score
    const perfScore = health.successRate * (1 / (1 + health.avgLatency / 1000));

    positions.push({
      position: { x: node.x, y: node.y, layer, angle: node.angle },
      performanceScore: perfScore,
      spawnCount: 1,
      lastUsed: Date.now(),
    });

    // Keep only top 10 positions per layer
    positions.sort((a, b) => b.performanceScore - a.performanceScore);
    if (positions.length > 10) {
      positions.length = 10;
    }

    logger.debug('AgentLifecycleManager', {
      message: 'Position remembered',
      agentId: health.agentId,
      layer,
      score: perfScore.toFixed(3),
    });
  }

  /**
   * Get recommended spawn position from lattice memory
   */
  getRecommendedPosition(layer: LatticeLayer): { x: number; y: number; angle: number } | null {
    const positions = this.latticeMemory.get(layer.toString());
    if (!positions || positions.length === 0) return null;

    // Return best position
    const best = positions[0];
    best.spawnCount++;
    best.lastUsed = Date.now();

    // Add small jitter based on golden ratio
    const jitter = (Math.random() - 0.5) * 10 * PHI;

    return {
      x: best.position.x + jitter,
      y: best.position.y + jitter,
      angle: best.position.angle,
    };
  }

  /**
   * Get agent health
   */
  getAgentHealth(agentId: string): AgentHealth | null {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get all agents by status
   */
  getAgentsByStatus(status: AgentStatus): AgentHealth[] {
    return Array.from(this.agents.values()).filter(a => a.status === status);
  }

  /**
   * Get swarm health summary
   */
  getSwarmHealth(): {
    totalAgents: number;
    byStatus: Record<AgentStatus, number>;
    byLevel: Record<HealthLevel, number>;
    averageHealthScore: number;
    overallHealthLevel: HealthLevel;
  } {
    const allAgents = Array.from(this.agents.values());
    
    const byStatus: Record<AgentStatus, number> = {
      spawning: 0, warming: 0, active: 0, degraded: 0,
      recovering: 0, cooling: 0, removing: 0, removed: 0,
    };
    
    const byLevel: Record<HealthLevel, number> = {
      excellent: 0, good: 0, fair: 0, poor: 0, critical: 0,
    };

    let totalScore = 0;

    for (const agent of allAgents) {
      byStatus[agent.status]++;
      byLevel[agent.healthLevel]++;
      totalScore += agent.healthScore;
    }

    const avgScore = allAgents.length > 0 ? totalScore / allAgents.length : 0;

    return {
      totalAgents: allAgents.length,
      byStatus,
      byLevel,
      averageHealthScore: avgScore,
      overallHealthLevel: this.scoreToLevel(avgScore),
    };
  }

  /**
   * Get statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Get lattice memory
   */
  getLatticeMemory(): Record<string, LatticeMemory[]> {
    return Object.fromEntries(this.latticeMemory);
  }

  /**
   * Force remove an agent immediately (emergency)
   */
  forceRemove(agentId: string, reason: string): boolean {
    const health = this.agents.get(agentId);
    if (!health) return false;

    health.status = 'removing';
    this.agents.delete(agentId);
    this.stats.agentsRemoved++;

    this.emit('agent_removed', {
      agentId,
      reason: `forced_${reason}`,
      finalHealth: health,
    });

    return true;
  }

  /**
   * Get degraded agents that need attention
   */
  getDegradedAgents(): AgentHealth[] {
    return Array.from(this.agents.values()).filter(
      a => a.status === 'degraded' || a.healthLevel === 'poor' || a.healthLevel === 'critical'
    );
  }

  /**
   * Get top performing agents
   */
  getTopPerformers(count: number = 10): AgentHealth[] {
    return Array.from(this.agents.values())
      .filter(a => a.status === 'active')
      .sort((a, b) => b.healthScore - a.healthScore)
      .slice(0, count);
  }
}

// Singleton export
let lifecycleInstance: AgentLifecycleManager | null = null;

export function getAgentLifecycleManager(
  lattice: FlowerOfLifeOS,
  config?: Partial<LifecycleConfig>
): AgentLifecycleManager {
  if (!lifecycleInstance) {
    lifecycleInstance = new AgentLifecycleManager(lattice, config);
  }
  return lifecycleInstance;
}

export function resetAgentLifecycleManager(): void {
  lifecycleInstance = null;
}

export type { AgentHealth, AgentStatus, HealthLevel, LifecycleConfig, LatticeMemory };
