/**
 * Intelligent Task Router
 *
 * Enhanced task routing algorithm with:
 * - Historical success rate weighting (20%)
 * - Network latency factor (15%)
 * - Task type specialization matching (15%)
 * - Real-time queue depth consideration (10%)
 * - A* pathfinding through lattice for optimal routing
 * - Sacred geometry alignment bonus
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import type { FlowerOfLifeOS, LatticeNode, LatticeLayer, LatticeRoute } from '../vera/orchestrator/flowerOfLifeOS.js';

interface AgentPerformance {
  agentId: string;
  tasksCompleted: number;
  tasksFailed: number;
  avgLatency: number;
  lastTask: number;
  successRate: number;
  taskTypeHistory: Map<string, { completed: number; failed: number }>;
}

export interface RoutingScore {
  agentId: string;
  nodeId: string;
  layer: LatticeLayer;
  compositeScore: number;
  breakdown: {
    capabilityMatch: number;
    phaseAlignment: number;
    amplitudeMatch: number;
    historicalSuccess: number;
    latencyScore: number;
    specialization: number;
    queueDepth: number;
    sacredAlignment: number;
  };
  estimatedLatency: number;
  confidence: number;
}

export interface TaskRequest {
  taskId: string;
  taskType: string;
  complexity: number;
  requiredCapabilities: string[];
  priority: 'low' | 'normal' | 'high' | 'critical';
  deadline?: number;
  estimatedDuration?: number;
  [key: string]: unknown;
}

export interface RouterConfig {
  capabilityWeight: number;
  phaseWeight: number;
  amplitudeWeight: number;
  historicalWeight: number;
  latencyWeight: number;
  specializationWeight: number;
  queueWeight: number;
  sacredWeight: number;
  enableAStar: boolean;
  confidenceThreshold: number;
  maxCandidates: number;
  decayFactor: number;
}

const DEFAULT_CONFIG: RouterConfig = {
  capabilityWeight: 0.30,    // 30%
  phaseWeight: 0.15,         // 15%
  amplitudeWeight: 0.10,     // 10%
  historicalWeight: 0.20,    // 20%
  latencyWeight: 0.15,       // 15%
  specializationWeight: 0.15, // 15%
  queueWeight: 0.10,         // 10%
  sacredWeight: 0.05,        // 5%
  enableAStar: true,
  confidenceThreshold: 0.6,
  maxCandidates: 5,
  decayFactor: 0.95,
};

// Sacred geometry constants
const PHI = (1 + Math.sqrt(5)) / 2;
const DEG60 = Math.PI / 3;

export class IntelligentTaskRouter extends EventEmitter {
  private lattice: FlowerOfLifeOS;
  private performanceHistory = new Map<string, AgentPerformance>();
  private nodeMetrics = new Map<string, {
    avgLatency: number;
    queueDepth: number;
    lastUpdated: number;
  }>();
  private config: RouterConfig;
  private taskTypeSpecialization = new Map<string, Set<string>>();
  private isRunning = false;

  constructor(lattice: FlowerOfLifeOS, config: Partial<RouterConfig> = {}) {
    super();
    this.lattice = lattice;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the task router
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startMetricsDecay();
    logger.info('IntelligentTaskRouter', { message: 'Task router started' });
    this.emit('started');
  }

  /**
   * Stop the task router
   */
  stop(): void {
    this.isRunning = false;
    logger.info('IntelligentTaskRouter', { message: 'Task router stopped' });
    this.emit('stopped');
  }

  /**
   * Route task using intelligent multi-factor scoring
   */
  routeTask(task: TaskRequest): {
    primary: RoutingScore | null;
    fallbacks: RoutingScore[];
    path: LatticeRoute | null;
    confidence: number;
  } {
    const startTime = Date.now();
    
    // Score all available agents
    const allScores = this.scoreAllAgents(task);
    
    if (allScores.length === 0) {
      logger.warn('IntelligentTaskRouter', {
        message: 'No agents available for task',
        taskId: task.taskId,
        taskType: task.taskType,
      });
      return { primary: null, fallbacks: [], path: null, confidence: 0 };
    }

    // Filter by confidence threshold
    const qualified = allScores.filter(s => s.confidence >= this.config.confidenceThreshold);
    
    // Sort by composite score (descending)
    qualified.sort((a, b) => b.compositeScore - a.compositeScore);

    const primary = qualified[0] || null;
    const fallbacks = qualified.slice(1, this.config.maxCandidates);

    // Find optimal path using A* if enabled
    let path: LatticeRoute | null = null;
    if (primary && this.config.enableAStar) {
      path = this.findOptimalPath('center-0', primary.nodeId, task);
    }

    const routingTime = Date.now() - startTime;
    
    logger.debug('IntelligentTaskRouter', {
      message: 'Task routed',
      taskId: task.taskId,
      taskType: task.taskType,
      primaryAgent: primary?.agentId,
      confidence: primary?.confidence.toFixed(3),
      routingTimeMs: routingTime,
      candidatesConsidered: allScores.length,
    });

    this.emit('task_routed', {
      task,
      primary,
      fallbacks,
      path,
      routingTime,
    });

    return {
      primary,
      fallbacks,
      path,
      confidence: primary?.confidence || 0,
    };
  }

  /**
   * Score all agents using multi-factor algorithm
   */
  private scoreAllAgents(task: TaskRequest): RoutingScore[] {
    const latticeState = this.lattice.getLatticeState?.() || { nodes: [] };
    const scores: RoutingScore[] = [];

    for (const node of latticeState.nodes) {
      for (const agentId of node.assignedAgents) {
        const score = this.calculateAgentScore(agentId, node, task);
        if (score) {
          scores.push(score);
        }
      }
    }

    return scores;
  }

  /**
   * Calculate comprehensive routing score for an agent
   */
  private calculateAgentScore(
    agentId: string,
    node: LatticeNode,
    task: TaskRequest
  ): RoutingScore | null {
    const performance = this.getOrCreatePerformance(agentId);
    const metrics = this.nodeMetrics.get(node.id);

    // 1. Capability match (30%)
    const capabilityMatch = this.calculateCapabilityMatch(
      task.requiredCapabilities,
      node.role ? [node.role] : []
    );

    // 2. Phase alignment (15%) - harmonic resonance
    const taskPhase = this.calculateTaskPhase(task);
    const phaseAlignment = (Math.cos(taskPhase - node.angle) + 1) / 2;

    // 3. Amplitude match (10%) - energy/load balance
    const amplitudeMatch = 1 - node.energy; // Prefer lower energy (less loaded) nodes

    // 4. Historical success rate (20%)
    const historicalSuccess = performance.successRate;

    // 5. Network latency score (15%)
    const latencyScore = metrics 
      ? 1 / (1 + metrics.avgLatency / 1000)
      : 0.5;

    // 6. Task type specialization (15%)
    const specialization = this.calculateSpecialization(agentId, task.taskType);

    // 7. Queue depth consideration (10%)
    const queueDepth = metrics 
      ? 1 - Math.min(1, metrics.queueDepth / 100)
      : 0.5;

    // 8. Sacred geometry alignment (5%)
    const sacredAlignment = this.calculateSacredAlignment(node, task);

    // Calculate weighted composite score
    const compositeScore = 
      capabilityMatch * this.config.capabilityWeight +
      phaseAlignment * this.config.phaseWeight +
      amplitudeMatch * this.config.amplitudeWeight +
      historicalSuccess * this.config.historicalWeight +
      latencyScore * this.config.latencyWeight +
      specialization * this.config.specializationWeight +
      queueDepth * this.config.queueWeight +
      sacredAlignment * this.config.sacredWeight;

    // Calculate confidence based on data freshness
    const confidence = this.calculateConfidence(agentId, node, metrics);

    // Estimate latency
    const estimatedLatency = metrics?.avgLatency || 1000;

    return {
      agentId,
      nodeId: node.id,
      layer: node.layer,
      compositeScore,
      breakdown: {
        capabilityMatch,
        phaseAlignment,
        amplitudeMatch,
        historicalSuccess,
        latencyScore,
        specialization,
        queueDepth,
        sacredAlignment,
      },
      estimatedLatency,
      confidence,
    };
  }

  /**
   * Calculate capability match percentage
   */
  private calculateCapabilityMatch(required: string[], available: string[]): number {
    if (required.length === 0) return 1;
    const matches = required.filter(r => 
      available.some(a => a.toLowerCase().includes(r.toLowerCase()) || 
                          r.toLowerCase().includes(a.toLowerCase()))
    ).length;
    return matches / required.length;
  }

  /**
   * Calculate task phase for harmonic resonance
   */
  private calculateTaskPhase(task: TaskRequest): number {
    // Hash task properties to determine phase
    const hash = task.taskType.split('').reduce((acc, char) => 
      acc + char.charCodeAt(0), 0
    );
    return (hash % 360) * (Math.PI / 180);
  }

  /**
   * Calculate agent specialization for task type
   */
  private calculateSpecialization(agentId: string, taskType: string): number {
    const performance = this.performanceHistory.get(agentId);
    if (!performance) return 0.5;

    const typeHistory = performance.taskTypeHistory.get(taskType);
    if (!typeHistory) return 0.3; // No experience with this type

    const total = typeHistory.completed + typeHistory.failed;
    if (total === 0) return 0.3;

    const successRate = typeHistory.completed / total;
    const experienceBonus = Math.min(0.2, total / 100); // Up to 0.2 bonus for experience

    return successRate * 0.8 + experienceBonus;
  }

  /**
   * Calculate sacred geometry alignment bonus
   */
  private calculateSacredAlignment(node: LatticeNode, task: TaskRequest): number {
    // Golden ratio alignment
    const phiAlignment = 1 - Math.abs(node.energy - (1 / PHI));
    
    // 60-degree angle alignment (Flower of Life)
    const angleMod60 = node.angle % DEG60;
    const sixtyDegreeAlignment = 1 - (angleMod60 / DEG60);

    // Layer appropriateness
    const layerBonus = this.getLayerBonus(task.taskType, node.layer);

    return (phiAlignment + sixtyDegreeAlignment + layerBonus) / 3;
  }

  /**
   * Get layer bonus based on task type
   */
  private getLayerBonus(taskType: string, layer: LatticeLayer): number {
    const layerPreferences: Record<string, LatticeLayer[]> = {
      'orchestration': [0],
      'task': [1],
      'pricing': [1],
      'carbon': [2],
      'defi': [2],
      'compliance': [2],
      'verification': [2],
      'communication': [3],
      'gossip': [3],
      'beacon': [3],
    };

    const preferred = layerPreferences[taskType.toLowerCase()];
    if (!preferred) return 0.5;
    
    return preferred.includes(layer) ? 1.0 : 0.3;
  }

  /**
   * Calculate confidence score based on data quality
   */
  private calculateConfidence(
    agentId: string,
    node: LatticeNode,
    metrics?: { lastUpdated: number }
  ): number {
    const performance = this.performanceHistory.get(agentId);
    
    // Base confidence
    let confidence = 0.5;

    // Increase with more historical data
    if (performance) {
      const totalTasks = performance.tasksCompleted + performance.tasksFailed;
      confidence += Math.min(0.3, totalTasks / 50); // Up to 0.3 bonus
    }

    // Decrease if metrics are stale
    if (metrics) {
      const age = Date.now() - metrics.lastUpdated;
      const staleness = Math.min(0.2, age / 300000); // Max 0.2 penalty for 5min stale
      confidence -= staleness;
    }

    // Energy factor - low energy nodes less confident
    confidence *= (0.5 + node.energy * 0.5);

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Find optimal path using A* algorithm through lattice
   */
  private findOptimalPath(
    sourceId: string,
    targetId: string,
    task: TaskRequest
  ): LatticeRoute | null {
    // Use lattice's built-in pathfinding with task-aware scoring
    const basePath = this.lattice.findHarmonicPath?.(sourceId, targetId);
    
    if (!basePath || basePath.path.length === 0) {
      return null;
    }

    // Enhance path with task-specific considerations
    return {
      ...basePath,
      energyCost: this.calculateTaskAwareEnergyCost(basePath, task),
    };
  }

  /**
   * Calculate energy cost considering task characteristics
   */
  private calculateTaskAwareEnergyCost(path: LatticeRoute, task: TaskRequest): number {
    let cost = path.energyCost;

    // Priority multiplier
    const priorityMultipliers = {
      low: 1.0,
      normal: 0.9,
      high: 0.7,
      critical: 0.5,
    };
    cost *= priorityMultipliers[task.priority];

    // Complexity factor
    cost *= (1 + task.complexity * 0.5);

    // Deadline urgency
    if (task.deadline) {
      const timeRemaining = task.deadline - Date.now();
      const urgency = Math.max(0, 1 - timeRemaining / 60000); // Urgency increases as deadline approaches
      cost *= (1 - urgency * 0.3); // Urgent tasks get 30% discount
    }

    return cost;
  }

  /**
   * Record task completion for learning
   */
  recordTaskCompletion(
    agentId: string,
    task: TaskRequest,
    result: { success: boolean; latency: number; error?: string }
  ): void {
    const performance = this.getOrCreatePerformance(agentId);

    if (result.success) {
      performance.tasksCompleted++;
    } else {
      performance.tasksFailed++;
    }

    performance.lastTask = Date.now();
    
    // Update success rate with exponential moving average
    const total = performance.tasksCompleted + performance.tasksFailed;
    performance.successRate = performance.tasksCompleted / total;

    // Update task type history
    let typeHistory = performance.taskTypeHistory.get(task.taskType);
    if (!typeHistory) {
      typeHistory = { completed: 0, failed: 0 };
      performance.taskTypeHistory.set(task.taskType, typeHistory);
    }

    if (result.success) {
      typeHistory.completed++;
    } else {
      typeHistory.failed++;
    }

    // Update node metrics
    const nodeMetrics = this.nodeMetrics.get(agentId);
    if (nodeMetrics) {
      // EMA for latency
      nodeMetrics.avgLatency = 
        nodeMetrics.avgLatency * 0.7 + result.latency * 0.3;
      nodeMetrics.queueDepth = Math.max(0, nodeMetrics.queueDepth - 1);
      nodeMetrics.lastUpdated = Date.now();
    }

    this.emit('task_completed', {
      agentId,
      task,
      result,
      performance,
    });

    logger.debug('IntelligentTaskRouter', {
      message: 'Task completion recorded',
      agentId,
      taskId: task.taskId,
      success: result.success,
      latency: result.latency,
      successRate: performance.successRate.toFixed(3),
    });
  }

  /**
   * Update node metrics (queue depth, etc.)
   */
  updateNodeMetrics(nodeId: string, metrics: { queueDepth?: number; avgLatency?: number }): void {
    const existing = this.nodeMetrics.get(nodeId);
    this.nodeMetrics.set(nodeId, {
      avgLatency: metrics.avgLatency ?? existing?.avgLatency ?? 1000,
      queueDepth: metrics.queueDepth ?? existing?.queueDepth ?? 0,
      lastUpdated: Date.now(),
    });
  }

  /**
   * Get or create performance record for agent
   */
  private getOrCreatePerformance(agentId: string): AgentPerformance {
    let perf = this.performanceHistory.get(agentId);
    if (!perf) {
      perf = {
        agentId,
        tasksCompleted: 0,
        tasksFailed: 0,
        avgLatency: 1000,
        lastTask: 0,
        successRate: 0.5,
        taskTypeHistory: new Map(),
      };
      this.performanceHistory.set(agentId, perf);
    }
    return perf;
  }

  /**
   * Start metrics decay cycle
   */
  private startMetricsDecay(): void {
    setInterval(() => {
      for (const perf of this.performanceHistory.values()) {
        // Decay old performance data
        const age = Date.now() - perf.lastTask;
        if (age > 86400000) { // Older than 24 hours
          perf.successRate = 0.5; // Reset to neutral
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Get router statistics
   */
  getStats(): {
    totalAgents: number;
    averageSuccessRate: number;
    totalTasksRouted: number;
    averageConfidence: number;
  } {
    const perfs = Array.from(this.performanceHistory.values());
    const totalTasks = perfs.reduce((sum, p) => sum + p.tasksCompleted + p.tasksFailed, 0);
    
    return {
      totalAgents: perfs.length,
      averageSuccessRate: perfs.length > 0
        ? perfs.reduce((sum, p) => sum + p.successRate, 0) / perfs.length
        : 0,
      totalTasksRouted: totalTasks,
      averageConfidence: 0, // Would need to track this
    };
  }

  /**
   * Register task type specialization for an agent
   */
  registerSpecialization(agentId: string, taskTypes: string[]): void {
    for (const taskType of taskTypes) {
      const agents = this.taskTypeSpecialization.get(taskType);
      if (agents) {
        agents.add(agentId);
      } else {
        this.taskTypeSpecialization.set(taskType, new Set([agentId]));
      }
    }
  }
}

// Singleton export
let routerInstance: IntelligentTaskRouter | null = null;

export function getIntelligentTaskRouter(
  lattice: FlowerOfLifeOS,
  config?: Partial<RouterConfig>
): IntelligentTaskRouter {
  if (!routerInstance) {
    routerInstance = new IntelligentTaskRouter(lattice, config);
  }
  return routerInstance;
}

export function resetTaskRouter(): void {
  routerInstance = null;
}
