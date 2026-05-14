/**
 * Adaptive Load Balancer
 *
 * Dynamic load balancing with:
 * - Reactive: Trigger rebalance when node load variance > 0.3
 * - Predictive: Use moving average to predict load 60s ahead
 * - Proactive: Pre-position agents based on forecasted demand
 * - Work-stealing: Allow high-load nodes to offload to nearby low-load nodes
 * - Sacred geometry-aware redistribution
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import type { FlowerOfLifeOS, LatticeNode, LatticeLayer } from '../vera/orchestrator/flowerOfLifeOS.js';

export interface NodeLoadState {
  nodeId: string;
  agentIds: string[];
  currentLoad: number; // 0-1
  queueDepth: number;
  taskRate: number; // tasks per second
  latency: number;
  capacity: number; // max concurrent tasks
  history: number[]; // last 60 load readings
  predictedLoad: number;
  lastRebalance: number;
}

export interface RebalanceAction {
  type: 'steal' | 'redistribute' | 'scale_up' | 'scale_down';
  fromNodeId?: string;
  toNodeId?: string;
  agentId?: string;
  reason: string;
  expectedImprovement: number;
}

export interface LoadForecast {
  timestamp: number;
  predictedLoad: number;
  confidence: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface BalancerConfig {
  varianceThreshold: number;
  predictionWindowMs: number;
  rebalanceIntervalMs: number;
  workStealThreshold: number;
  maxStealDistance: number;
  proactiveScalingThreshold: number;
  minRebalanceIntervalMs: number;
  sacredGeometryBonus: boolean;
}

const DEFAULT_CONFIG: BalancerConfig = {
  varianceThreshold: 0.3,      // Trigger rebalance when variance > 0.3
  predictionWindowMs: 60000,   // Predict 60s ahead
  rebalanceIntervalMs: 5000,   // Check every 5s (reactive)
  workStealThreshold: 0.7,      // Steal when load > 0.7 and neighbor < 0.3
  maxStealDistance: 2,         // Max layer distance for work stealing
  proactiveScalingThreshold: 0.8, // Scale up when predicted load > 0.8
  minRebalanceIntervalMs: 2000, // Minimum 2s between rebalances
  sacredGeometryBonus: true,
};

// Sacred geometry constants
const PHI = (1 + Math.sqrt(5)) / 2;
const PHI_INV = 1 / PHI;

export class AdaptiveLoadBalancer extends EventEmitter {
  private lattice: FlowerOfLifeOS;
  private nodeStates = new Map<string, NodeLoadState>();
  private config: BalancerConfig;
  private isRunning = false;
  private checkTimer: NodeJS.Timeout | null = null;
  private forecastHistory = new Map<string, LoadForecast[]>();
  
  // Statistics
  private stats = {
    rebalancesTriggered: 0,
    workSteals: 0,
    proactiveScales: 0,
    avgVariance: 0,
    lastRebalanceTime: 0,
  };

  constructor(lattice: FlowerOfLifeOS, config: Partial<BalancerConfig> = {}) {
    super();
    this.lattice = lattice;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the adaptive load balancer
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.checkTimer = setInterval(() => {
      this.runBalancingCycle();
    }, this.config.rebalanceIntervalMs);

    logger.info('AdaptiveLoadBalancer', {
      message: 'Adaptive load balancer started',
      varianceThreshold: this.config.varianceThreshold,
      predictionWindow: this.config.predictionWindowMs,
      workStealThreshold: this.config.workStealThreshold,
    });

    this.emit('started');
  }

  /**
   * Stop the load balancer
   */
  stop(): void {
    this.isRunning = false;
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    logger.info('AdaptiveLoadBalancer', { message: 'Adaptive load balancer stopped' });
    this.emit('stopped');
  }

  /**
   * Main balancing cycle - runs every interval
   */
  private runBalancingCycle(): void {
    // Skip if too soon after last rebalance
    if (Date.now() - this.stats.lastRebalanceTime < this.config.minRebalanceIntervalMs) {
      return;
    }

    // Update node states from lattice
    this.syncNodeStates();

    // Calculate current variance
    const variance = this.calculateLoadVariance();
    this.stats.avgVariance = this.stats.avgVariance * 0.9 + variance * 0.1;

    // 1. Reactive: High variance triggers immediate rebalance
    if (variance > this.config.varianceThreshold) {
      this.triggerRebalance('variance_threshold');
      return;
    }

    // 2. Predictive: Check forecasts for upcoming load
    const predictions = this.generateForecasts();
    for (const forecast of predictions) {
      if (forecast.predictedLoad > this.config.proactiveScalingThreshold && 
          forecast.confidence > 0.7) {
        this.triggerProactiveScaling(forecast);
        return;
      }
    }

    // 3. Work stealing: Continuous fine-tuning
    this.attemptWorkStealing();
  }

  /**
   * Sync node states from lattice
   */
  private syncNodeStates(): void {
    const latticeState = this.lattice.getLatticeState?.() || { nodes: [] };
    
    for (const node of latticeState.nodes) {
      const existing = this.nodeStates.get(node.id);
      
      if (existing) {
        // Update existing state
        existing.currentLoad = 1 - node.energy; // Invert: high energy = low load
        existing.history.push(existing.currentLoad);
        
        // Keep last 60 readings
        if (existing.history.length > 60) {
          existing.history.shift();
        }
        
        // Calculate task rate
        if (existing.history.length >= 2) {
          const recent = existing.history.slice(-10);
          existing.taskRate = recent.reduce((a, b) => a + b, 0) / recent.length;
        }
      } else {
        // Create new state
        this.nodeStates.set(node.id, {
          nodeId: node.id,
          agentIds: node.assignedAgents,
          currentLoad: 1 - node.energy,
          queueDepth: 0,
          taskRate: 0,
          latency: 100,
          capacity: this.estimateCapacity(node.layer),
          history: [1 - node.energy],
          predictedLoad: 1 - node.energy,
          lastRebalance: 0,
        });
      }
    }
  }

  /**
   * Calculate load variance across all nodes
   */
  private calculateLoadVariance(): number {
    const loads = Array.from(this.nodeStates.values()).map(n => n.currentLoad);
    if (loads.length === 0) return 0;

    const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
    const squaredDiffs = loads.map(l => Math.pow(l - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / loads.length;

    return variance;
  }

  /**
   * Generate load forecasts using moving averages
   */
  private generateForecasts(): LoadForecast[] {
    const forecasts: LoadForecast[] = [];
    const now = Date.now();

    for (const [nodeId, state] of this.nodeStates) {
      if (state.history.length < 10) continue;

      // Simple linear regression on recent history
      const recent = state.history.slice(-20);
      const trend = this.calculateTrend(recent);
      
      // Predict load 60s ahead
      const predictionWindow = this.config.predictionWindowMs / 1000; // in seconds
      const predictedLoad = Math.min(1, Math.max(0, 
        state.currentLoad + trend * predictionWindow
      ));

      // Confidence based on data volatility
      const volatility = this.calculateVolatility(recent);
      const confidence = Math.max(0, 1 - volatility * 2);

      const forecast: LoadForecast = {
        timestamp: now + this.config.predictionWindowMs,
        predictedLoad,
        confidence,
        trend: trend > 0.01 ? 'increasing' : trend < -0.01 ? 'decreasing' : 'stable',
      };

      // Store history
      let history = this.forecastHistory.get(nodeId);
      if (!history) {
        history = [];
        this.forecastHistory.set(nodeId, history);
      }
      history.push(forecast);
      if (history.length > 10) history.shift();

      forecasts.push(forecast);
    }

    return forecasts;
  }

  /**
   * Calculate trend from time series
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const sumX = values.reduce((sum, _, i) => sum + i, 0);
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = values.reduce((sum, v, i) => sum + i * v, 0);
    const sumXX = values.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  /**
   * Calculate volatility (standard deviation of changes)
   */
  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;

    const changes = [];
    for (let i = 1; i < values.length; i++) {
      changes.push(Math.abs(values[i] - values[i - 1]));
    }

    const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
    return mean;
  }

  /**
   * Trigger full rebalance due to high variance
   */
  private triggerRebalance(reason: string): void {
    this.stats.rebalancesTriggered++;
    this.stats.lastRebalanceTime = Date.now();

    const actions = this.generateRebalanceActions();
    
    logger.info('AdaptiveLoadBalancer', {
      message: 'Rebalance triggered',
      reason,
      variance: this.stats.avgVariance.toFixed(3),
      actionCount: actions.length,
    });

    this.emit('rebalance_triggered', {
      reason,
      variance: this.stats.avgVariance,
      actions,
    });

    // Execute actions
    for (const action of actions) {
      this.executeRebalanceAction(action);
    }
  }

  /**
   * Generate rebalance actions based on current state
   */
  private generateRebalanceActions(): RebalanceAction[] {
    const actions: RebalanceAction[] = [];
    const nodes = Array.from(this.nodeStates.values());

    // Sort by load
    const sorted = [...nodes].sort((a, b) => b.currentLoad - a.currentLoad);
    const overloaded = sorted.filter(n => n.currentLoad > 0.7);
    const underloaded = sorted.filter(n => n.currentLoad < 0.3);

    // Redistribute from overloaded to underloaded
    for (const high of overloaded) {
      // Find best target using sacred geometry proximity
      const target = this.findOptimalTarget(high, underloaded);
      
      if (target) {
        // Calculate optimal transfer amount using golden ratio
        const excess = high.currentLoad - 0.5;
        const transfer = excess * PHI_INV;

        actions.push({
          type: 'redistribute',
          fromNodeId: high.nodeId,
          toNodeId: target.nodeId,
          reason: 'load_variance_reduction',
          expectedImprovement: transfer * 0.5,
        });

        // Update expected loads
        high.currentLoad -= transfer;
        target.currentLoad += transfer;
      }
    }

    return actions;
  }
  
  /**
   * Find optimal target node for redistribution
   */
  private findOptimalTarget(
    source: NodeLoadState,
    candidates: NodeLoadState[]
  ): NodeLoadState | null {
    if (candidates.length === 0) return null;

    // Score candidates by proximity (sacred geometry) and capacity
    const scored = candidates.map(target => {
      const geometricScore = this.calculateGeometricProximity(source.nodeId, target.nodeId);
      const capacityScore = 1 - target.currentLoad;
      
      // Weighted score
      const score = geometricScore * 0.4 + capacityScore * 0.6;
      
      return { target, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.target || null;
  }

  /**
   * Calculate geometric proximity between nodes (sacred geometry aware)
   */
  private calculateGeometricProximity(nodeId1: string, nodeId2: string): number {
    // Get lattice state
    const latticeState = this.lattice.getLatticeState?.() || { nodes: [] };
    const node1 = latticeState.nodes.find(n => n.id === nodeId1);
    const node2 = latticeState.nodes.find(n => n.id === nodeId2);

    if (!node1 || !node2) return 0;

    // Euclidean distance
    const dx = node1.x - node2.x;
    const dy = node1.y - node2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Layer distance penalty
    const layerDiff = Math.abs(node1.layer - node2.layer);

    // Sacred geometry bonus: 60° alignment
    const angleDiff = Math.abs(node1.angle - node2.angle) % (Math.PI / 3);
    const alignmentBonus = angleDiff < 0.1 ? 0.2 : 0;

    // Combine scores
    const proximity = Math.max(0, 1 - distance / 200);
    const layerPenalty = layerDiff * 0.1;

    return proximity - layerPenalty + alignmentBonus;
  }

  /**
   * Execute a rebalance action
   */
  private executeRebalanceAction(action: RebalanceAction): void {
    switch (action.type) {
      case 'redistribute':
        this.emit('redistribute', {
          from: action.fromNodeId,
          to: action.toNodeId,
          expectedImprovement: action.expectedImprovement,
        });
        break;

      case 'scale_up':
        this.emit('scale_up', {
          nodeId: action.toNodeId,
          reason: action.reason,
        });
        break;

      case 'scale_down':
        this.emit('scale_down', {
          nodeId: action.fromNodeId,
          reason: action.reason,
        });
        break;
    }

    logger.debug('AdaptiveLoadBalancer', {
      message: 'Rebalance action executed',
      type: action.type,
      reason: action.reason,
    });
  }

  /**
   * Trigger proactive scaling based on forecast
   */
  private triggerProactiveScaling(forecast: LoadForecast): void {
    this.stats.proactiveScales++;

    logger.info('AdaptiveLoadBalancer', {
      message: 'Proactive scaling triggered',
      predictedLoad: forecast.predictedLoad.toFixed(3),
      trend: forecast.trend,
      confidence: forecast.confidence.toFixed(3),
    });

    this.emit('proactive_scale', {
      forecast,
      reason: 'predicted_high_load',
    });
  }

  /**
   * Attempt work stealing between nearby nodes
   */
  private attemptWorkStealing(): void {
    const nodes = Array.from(this.nodeStates.values());
    let stealsAttempted = 0;

    for (const node of nodes) {
      // Check if node is overloaded
      if (node.currentLoad < this.config.workStealThreshold) continue;

      // Find nearby underloaded nodes
      const neighbors = this.findNearbyNodes(node, this.config.maxStealDistance);
      const underloadedNeighbors = neighbors.filter(n => 
        n.currentLoad < 0.3 && n.capacity > n.queueDepth
      );

      if (underloadedNeighbors.length === 0) continue;

      // Steal work
      const target = underloadedNeighbors[0];
      const stealAmount = (node.currentLoad - 0.5) * PHI_INV;

      node.currentLoad -= stealAmount;
      target.currentLoad += stealAmount;
      stealsAttempted++;

      this.stats.workSteals++;

      this.emit('work_stolen', {
        from: node.nodeId,
        to: target.nodeId,
        amount: stealAmount,
      });

      logger.debug('AdaptiveLoadBalancer', {
        message: 'Work stolen',
        from: node.nodeId,
        to: target.nodeId,
        amount: stealAmount.toFixed(3),
      });
    }

    if (stealsAttempted > 0) {
      this.emit('work_stealing_cycle', { stealsAttempted });
    }
  }

  /**
   * Find nearby nodes within layer distance
   */
  private findNearbyNodes(source: NodeLoadState, maxDistance: number): NodeLoadState[] {
    const latticeState = this.lattice.getLatticeState?.() || { nodes: [] };
    const sourceNode = latticeState.nodes.find(n => n.id === source.nodeId);
    
    if (!sourceNode) return [];

    const nearby: NodeLoadState[] = [];

    for (const [nodeId, state] of this.nodeStates) {
      if (nodeId === source.nodeId) continue;

      const node = latticeState.nodes.find(n => n.id === nodeId);
      if (!node) continue;

      const layerDistance = Math.abs(node.layer - sourceNode.layer);
      if (layerDistance <= maxDistance) {
        nearby.push(state);
      }
    }

    return nearby.sort((a, b) => a.currentLoad - b.currentLoad);
  }

  /**
   * Update node metrics from external source
   */
  updateNodeMetrics(nodeId: string, metrics: {
    load?: number;
    queueDepth?: number;
    latency?: number;
    taskRate?: number;
  }): void {
    const state = this.nodeStates.get(nodeId);
    if (!state) return;

    if (metrics.load !== undefined) {
      state.currentLoad = metrics.load;
      state.history.push(metrics.load);
      if (state.history.length > 60) state.history.shift();
    }
    if (metrics.queueDepth !== undefined) state.queueDepth = metrics.queueDepth;
    if (metrics.latency !== undefined) state.latency = metrics.latency;
    if (metrics.taskRate !== undefined) state.taskRate = metrics.taskRate;
  }

  /**
   * Register an agent with a node
   */
  registerAgent(nodeId: string, agentId: string): void {
    const state = this.nodeStates.get(nodeId);
    if (state && !state.agentIds.includes(agentId)) {
      state.agentIds.push(agentId);
    }
  }

  /**
   * Unregister an agent from a node
   */
  unregisterAgent(nodeId: string, agentId: string): void {
    const state = this.nodeStates.get(nodeId);
    if (state) {
      state.agentIds = state.agentIds.filter(id => id !== agentId);
    }
  }

  /**
   * Estimate node capacity based on layer
   */
  private estimateCapacity(layer: LatticeLayer): number {
    // Inner layers have higher capacity (more central)
    const capacities: Record<LatticeLayer, number> = {
      0: 100, // Center
      1: 80,  // Inner
      2: 60,  // Middle
      3: 40,  // Outer
    };
    return capacities[layer] || 40;
  }

  /**
   * Get current statistics
   */
  getStats(): {
    rebalancesTriggered: number;
    workSteals: number;
    proactiveScales: number;
    averageVariance: number;
    nodeCount: number;
  } {
    return {
      rebalancesTriggered: this.stats.rebalancesTriggered,
      workSteals: this.stats.workSteals,
      proactiveScales: this.stats.proactiveScales,
      averageVariance: this.stats.avgVariance,
      nodeCount: this.nodeStates.size,
    };
  }

  /**
   * Get load distribution for visualization
   */
  getLoadDistribution(): {
    nodeId: string;
    load: number;
    capacity: number;
    predictedLoad: number;
    layer: number;
  }[] {
    const latticeState = this.lattice.getLatticeState?.() || { nodes: [] };
    
    return Array.from(this.nodeStates.values()).map(state => {
      const node = latticeState.nodes.find(n => n.id === state.nodeId);
      return {
        nodeId: state.nodeId,
        load: state.currentLoad,
        capacity: state.capacity,
        predictedLoad: state.predictedLoad,
        layer: node?.layer || 0,
      };
    });
  }
}

// Singleton export
let balancerInstance: AdaptiveLoadBalancer | null = null;

export function getAdaptiveLoadBalancer(
  lattice: FlowerOfLifeOS,
  config?: Partial<BalancerConfig>
): AdaptiveLoadBalancer {
  if (!balancerInstance) {
    balancerInstance = new AdaptiveLoadBalancer(lattice, config);
  }
  return balancerInstance;
}

export function resetLoadBalancer(): void {
  balancerInstance = null;
}
