/**
 * Predictive Scaler
 *
 * Forecast-based scaling with:
 * - Time-series forecasting using last 5 minutes of metrics
 * - Pre-warm agents 60s before predicted high-load
 * - Cool-down agents gradually to avoid thrashing
 * - Lattice-aware placement: Spawn new agents at geometrically optimal positions
 * - Sacred geometry alignment for agent positioning
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import type { FlowerOfLifeOS, LatticeNode, LatticeLayer } from '../vera/orchestrator/flowerOfLifeOS.js';

export interface MetricPoint {
  timestamp: number;
  load: number;
  taskRate: number;
  queueDepth: number;
  agentCount: number;
}

export interface LoadForecast {
  timestamp: number;
  predictedLoad: number;
  predictedTaskRate: number;
  confidence: number;
  trend: 'increasing' | 'decreasing' | 'stable' | 'spiking';
  recommendedAgents: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'hold' | 'prewarm';
  targetAgentCount: number;
  agentsToAdd: number;
  agentsToRemove: number;
  reason: string;
  urgency: string;
  expectedLoadAtTarget: number;
  placementStrategy: 'center_out' | 'fill_gaps' | 'edge_expand';
}

export interface AgentPlacement {
  agentId: string;
  nodeId: string;
  layer: LatticeLayer;
  x: number;
  y: number;
  angle: number;
  reason: string;
}

export interface ScalerConfig {
  forecastWindowMs: number;
  predictionHorizonMs: number;
  prewarmWindowMs: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  minAgents: number;
  maxAgents: number;
  coolDownPeriodMs: number;
  scaleUpStep: number;
  scaleDownStep: number;
  targetLoadPerAgent: number;
  enableGeometricPlacement: boolean;
  enablePreemptiveScaling: boolean;
}

const DEFAULT_CONFIG: ScalerConfig = {
  forecastWindowMs: 300000,    // 5 minutes of history
  predictionHorizonMs: 60000,   // Predict 60s ahead
  prewarmWindowMs: 60000,       // Pre-warm 60s before need
  scaleUpThreshold: 0.75,     // Scale up when predicted load > 75%
  scaleDownThreshold: 0.3,      // Scale down when load < 30%
  minAgents: 10,
  maxAgents: 1000,
  coolDownPeriodMs: 120000,     // 2 min cooldown
  scaleUpStep: 5,               // Add 5 agents at a time
  scaleDownStep: 3,             // Remove 3 agents at a time
  targetLoadPerAgent: 0.7,      // Target 70% load per agent
  enableGeometricPlacement: true,
  enablePreemptiveScaling: true,
};

// Sacred geometry constants
const PHI = (1 + Math.sqrt(5)) / 2;
const DEG60 = Math.PI / 3;

export class PredictiveScaler extends EventEmitter {
  private lattice: FlowerOfLifeOS;
  private metricsHistory: MetricPoint[] = [];
  private config: ScalerConfig;
  private isRunning = false;
  private checkTimer: NodeJS.Timeout | null = null;
  private warmAgents = new Set<string>(); // Pre-warmed agents ready to activate
  private coolingAgents = new Map<string, number>(); // agentId -> coolDownStartTime
  private activeAgents = new Set<string>();
  private lastScaleTime = 0;
  
  // Statistics
  private stats = {
    scaleUpEvents: 0,
    scaleDownEvents: 0,
    prewarmEvents: 0,
    predictionsMade: 0,
    accuratePredictions: 0,
    agentsPreWarmed: 0,
    agentsActivated: 0,
    agentsCooledDown: 0,
  };

  constructor(lattice: FlowerOfLifeOS, config: Partial<ScalerConfig> = {}) {
    super();
    this.lattice = lattice;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the predictive scaler
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.checkTimer = setInterval(() => {
      this.runScalingCycle();
    }, 10000); // Check every 10s

    logger.info('PredictiveScaler', {
      message: 'Predictive scaler started',
      forecastWindow: this.config.forecastWindowMs,
      predictionHorizon: this.config.predictionHorizonMs,
      prewarmWindow: this.config.prewarmWindowMs,
    });

    this.emit('started');
  }

  /**
   * Stop the scaler
   */
  stop(): void {
    this.isRunning = false;
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    logger.info('PredictiveScaler', { message: 'Predictive scaler stopped' });
    this.emit('stopped');
  }

  /**
   * Main scaling cycle
   */
  private runScalingCycle(): void {
    // Clean up old metrics
    this.pruneOldMetrics();

    // Clean up cooled agents
    this.processCoolDowns();

    // Generate forecast
    const forecast = this.generateForecast();
    if (!forecast) return;

    this.stats.predictionsMade++;

    // Make scaling decision
    const decision = this.makeScalingDecision(forecast);

    // Execute decision
    this.executeScalingDecision(decision, forecast);

    // Emit metrics
    this.emit('scaling_cycle', {
      forecast,
      decision,
      activeAgents: this.activeAgents.size,
      warmAgents: this.warmAgents.size,
      coolingAgents: this.coolingAgents.size,
    });
  }

  /**
   * Record current metrics for forecasting
   */
  recordMetrics(metrics: {
    load: number;
    taskRate: number;
    queueDepth: number;
    agentCount: number;
  }): void {
    this.metricsHistory.push({
      timestamp: Date.now(),
      load: metrics.load,
      taskRate: metrics.taskRate,
      queueDepth: metrics.queueDepth,
      agentCount: metrics.agentCount,
    });

    // Update active agent count
    if (metrics.agentCount !== this.activeAgents.size) {
      // Sync the count
      logger.debug('PredictiveScaler', {
        message: 'Metrics agent count mismatch',
        reported: metrics.agentCount,
        tracked: this.activeAgents.size,
      });
    }
  }

  /**
   * Prune metrics older than forecast window
   */
  private pruneOldMetrics(): void {
    const cutoff = Date.now() - this.config.forecastWindowMs;
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Process agent cool-downs
   */
  private processCoolDowns(): void {
    const now = Date.now();
    for (const [agentId, startTime] of this.coolingAgents) {
      if (now - startTime >= this.config.coolDownPeriodMs) {
        this.coolingAgents.delete(agentId);
        this.stats.agentsCooledDown++;
        
        logger.debug('PredictiveScaler', {
          message: 'Agent cool-down complete',
          agentId,
          cooledDuration: this.config.coolDownPeriodMs,
        });

        this.emit('agent_cooled', { agentId });
      }
    }
  }

  /**
   * Generate load forecast using time series analysis
   */
  private generateForecast(): LoadForecast | null {
    if (this.metricsHistory.length < 10) {
      return null; // Not enough data
    }

    const recent = this.metricsHistory.slice(-30); // Last 5 minutes (at 10s intervals)
    
    // Calculate trend using linear regression
    const loadTrend = this.calculateTrend(recent.map(m => m.load));
    const taskRateTrend = this.calculateTrend(recent.map(m => m.taskRate));
    const queueTrend = this.calculateTrend(recent.map(m => m.queueDepth));

    // Current values
    const currentLoad = recent[recent.length - 1].load;
    const currentTaskRate = recent[recent.length - 1].taskRate;
    const currentQueue = recent[recent.length - 1].queueDepth;

    // Predict 60s ahead
    const predictionWindow = this.config.predictionHorizonMs / 1000; // in seconds
    const predictedLoad = Math.min(1, Math.max(0, 
      currentLoad + loadTrend * predictionWindow
    ));
    const predictedTaskRate = Math.max(0, 
      currentTaskRate + taskRateTrend * predictionWindow
    );

    // Determine trend classification
    let trend: LoadForecast['trend'] = 'stable';
    if (loadTrend > 0.02) trend = 'spiking';
    else if (loadTrend > 0.005) trend = 'increasing';
    else if (loadTrend < -0.005) trend = 'decreasing';

    // Calculate confidence based on data volatility
    const volatility = this.calculateVolatility(recent.map(m => m.load));
    const confidence = Math.max(0.3, 1 - volatility * 3);

    // Calculate urgency
    let urgency: LoadForecast['urgency'] = 'low';
    if (predictedLoad > 0.9) urgency = 'critical';
    else if (predictedLoad > 0.8) urgency = 'high';
    else if (predictedLoad > 0.7) urgency = 'medium';

    // Calculate recommended agent count
    const totalWork = predictedTaskRate * (1 + predictedLoad);
    const recommendedAgents = Math.ceil(
      totalWork / (this.config.targetLoadPerAgent * 100)
    );

    return {
      timestamp: Date.now() + this.config.predictionHorizonMs,
      predictedLoad,
      predictedTaskRate,
      confidence,
      trend,
      recommendedAgents: Math.min(this.config.maxAgents, 
        Math.max(this.config.minAgents, recommendedAgents)),
      urgency,
    };
  }

  /**
   * Calculate trend using linear regression
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const sumX = values.reduce((sum, _, i) => sum + i, 0);
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = values.reduce((sum, v, i) => sum + i * v, 0);
    const sumXX = values.reduce((sum, _, i) => sum + i * i, 0);

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
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
   * Make scaling decision based on forecast
   */
  private makeScalingDecision(forecast: LoadForecast): ScalingDecision {
    const currentCount = this.activeAgents.size;
    const warmCount = this.warmAgents.size;
    const recommended = forecast.recommendedAgents;

    // Determine action
    let action: ScalingDecision['action'] = 'hold';
    let agentsToAdd = 0;
    let agentsToRemove = 0;
    let reason = '';
    let placementStrategy: ScalingDecision['placementStrategy'] = 'fill_gaps';

    // Check if we need to scale up
    if (forecast.predictedLoad > this.config.scaleUpThreshold && 
        forecast.urgency !== 'low') {
      
      // Can we use pre-warmed agents?
      if (warmCount > 0 && this.config.enablePreemptiveScaling) {
        action = 'prewarm';
        agentsToAdd = Math.min(warmCount, recommended - currentCount);
        reason = `prewarm_${agentsToAdd}_agents_for_predicted_load_${forecast.predictedLoad.toFixed(2)}`;
      } else {
        action = 'scale_up';
        agentsToAdd = Math.min(this.config.scaleUpStep, recommended - currentCount);
        reason = `scale_up_for_${forecast.trend}_load_${forecast.predictedLoad.toFixed(2)}`;
        
        // Choose placement strategy based on urgency
        if (forecast.urgency === 'critical') {
          placementStrategy = 'center_out';
        } else if (forecast.trend === 'spiking') {
          placementStrategy = 'edge_expand';
        }
      }
    }
    // Check if we can scale down
    else if (forecast.predictedLoad < this.config.scaleDownThreshold &&
             currentCount > this.config.minAgents &&
             forecast.trend === 'decreasing') {
      
      // Only scale down if not in cool-down
      const canScaleDown = Date.now() - this.lastScaleTime > this.config.coolDownPeriodMs;
      
      if (canScaleDown) {
        action = 'scale_down';
        agentsToRemove = Math.min(this.config.scaleDownStep, 
          currentCount - this.config.minAgents);
        reason = `scale_down_due_to_low_load_${forecast.predictedLoad.toFixed(2)}`;
      } else {
        reason = `scale_down_blocked_by_cooldown`;
      }
    }
    // Pre-warm if moderate increase expected
    else if (forecast.predictedLoad > 0.6 && 
             forecast.trend === 'increasing' &&
             warmCount < 5 &&
             this.config.enablePreemptiveScaling) {
      action = 'prewarm';
      agentsToAdd = Math.min(5, this.config.scaleUpStep);
      reason = `prewarm_for_increasing_demand`;
    }

    return {
      action,
      targetAgentCount: recommended,
      agentsToAdd,
      agentsToRemove,
      reason,
      urgency: forecast.urgency,
      expectedLoadAtTarget: forecast.predictedLoad * currentCount / Math.max(1, recommended),
      placementStrategy,
    };
  }

  /**
   * Execute scaling decision
   */
  private executeScalingDecision(decision: ScalingDecision, forecast: LoadForecast): void {
    if (decision.action === 'hold') {
      return;
    }

    // Update last scale time
    this.lastScaleTime = Date.now();

    switch (decision.action) {
      case 'prewarm':
        this.executePreWarm(decision, forecast);
        break;
      case 'scale_up':
        this.executeScaleUp(decision, forecast);
        break;
      case 'scale_down':
        this.executeScaleDown(decision, forecast);
        break;
    }

    logger.info('PredictiveScaler', {
      message: 'Scaling decision executed',
      action: decision.action,
      agentsToAdd: decision.agentsToAdd,
      agentsToRemove: decision.agentsToRemove,
      reason: decision.reason,
      urgency: decision.urgency,
    });

    this.emit('scaling_executed', { decision, forecast });
  }

  /**
   * Execute pre-warming
   */
  private executePreWarm(decision: ScalingDecision, forecast: LoadForecast): void {
    // Use existing warm agents or create new ones
    let activated = 0;
    
    for (const agentId of this.warmAgents) {
      if (activated >= decision.agentsToAdd) break;
      
      this.warmAgents.delete(agentId);
      this.activeAgents.add(agentId);
      this.stats.agentsActivated++;
      activated++;

      this.emit('agent_activated', { 
        agentId, 
        reason: decision.reason,
        urgency: forecast.urgency,
      });
    }

    // Create additional warm agents if needed
    const additionalNeeded = decision.agentsToAdd - activated;
    if (additionalNeeded > 0) {
      this.createWarmAgents(additionalNeeded, decision.placementStrategy);
    }

    this.stats.prewarmEvents++;
  }

  /**
   * Execute scale up
   */
  private executeScaleUp(decision: ScalingDecision, forecast: LoadForecast): void {
    const placements = this.calculateOptimalPlacements(
      decision.agentsToAdd, 
      decision.placementStrategy
    );

    for (const placement of placements) {
      this.activeAgents.add(placement.agentId);
      
      this.emit('agent_spawned', {
        agentId: placement.agentId,
        nodeId: placement.nodeId,
        layer: placement.layer,
        x: placement.x,
        y: placement.y,
        angle: placement.angle,
        reason: placement.reason,
      });
    }

    this.stats.scaleUpEvents++;
  }

  /**
   * Execute scale down
   */
  private executeScaleDown(decision: ScalingDecision, forecast: LoadForecast): void {
    // Select agents to remove (prefer ones with low load)
    const candidates = Array.from(this.activeAgents).slice(0, decision.agentsToRemove);

    for (const agentId of candidates) {
      // Move to cooling instead of immediate removal
      this.activeAgents.delete(agentId);
      this.coolingAgents.set(agentId, Date.now());

      this.emit('agent_cooling', {
        agentId,
        reason: decision.reason,
        coolDownDuration: this.config.coolDownPeriodMs,
      });
    }

    this.stats.scaleDownEvents++;
  }

  /**
   * Create warm (pre-warmed) agents
   */
  private createWarmAgents(count: number, strategy: ScalingDecision['placementStrategy']): void {
    const placements = this.calculateOptimalPlacements(count, strategy);

    for (const placement of placements) {
      this.warmAgents.add(placement.agentId);
      this.stats.agentsPreWarmed++;

      this.emit('agent_prewarmed', {
        agentId: placement.agentId,
        nodeId: placement.nodeId,
        layer: placement.layer,
        x: placement.x,
        y: placement.y,
        angle: placement.angle,
        readyAt: Date.now() + this.config.prewarmWindowMs,
      });
    }
  }

  /**
   * Calculate optimal agent placements using sacred geometry
   */
  private calculateOptimalPlacements(
    count: number, 
    strategy: ScalingDecision['placementStrategy']
  ): AgentPlacement[] {
    const placements: AgentPlacement[] = [];
    const latticeState = this.lattice.getLatticeState?.() || { nodes: [] };

    // Get current load per node
    const nodeLoads = new Map<string, number>();
    for (const node of latticeState.nodes) {
      nodeLoads.set(node.id, node.assignedAgents.length);
    }

    // Sort nodes based on strategy
    let sortedNodes: typeof latticeState.nodes = [];
    
    switch (strategy) {
      case 'center_out':
        // Prioritize center layers (0, 1, 2)
        sortedNodes = [...latticeState.nodes].sort((a, b) => a.layer - b.layer);
        break;
      case 'fill_gaps':
        // Prioritize least loaded nodes
        sortedNodes = [...latticeState.nodes].sort((a, b) => 
          (nodeLoads.get(a.id) || 0) - (nodeLoads.get(b.id) || 0)
        );
        break;
      case 'edge_expand':
        // Prioritize outer layers for expansion
        sortedNodes = [...latticeState.nodes].sort((a, b) => b.layer - a.layer);
        break;
    }

    // Place agents at sacred geometry positions
    for (let i = 0; i < count; i++) {
      const node = sortedNodes[i % sortedNodes.length];
      if (!node) continue;

      // Calculate sacred position offset
      const angleOffset = (i % 6) * DEG60; // 60-degree intervals
      const radiusOffset = Math.floor(i / 6) * 10 * PHI; // Golden ratio spacing

      placements.push({
        agentId: `agent-${Date.now()}-${i}`,
        nodeId: node.id,
        layer: node.layer,
        x: node.x + Math.cos(node.angle + angleOffset) * radiusOffset,
        y: node.y + Math.sin(node.angle + angleOffset) * radiusOffset,
        angle: (node.angle + angleOffset) % (2 * Math.PI),
        reason: `sacred_placement_${strategy}`,
      });
    }

    return placements;
  }

  /**
   * Register an agent as active
   */
  registerActiveAgent(agentId: string): void {
    this.activeAgents.add(agentId);
    this.warmAgents.delete(agentId);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.activeAgents.delete(agentId);
    this.warmAgents.delete(agentId);
    this.coolingAgents.delete(agentId);
  }

  /**
   * Get scaler statistics
   */
  getStats(): {
    scaleUpEvents: number;
    scaleDownEvents: number;
    prewarmEvents: number;
    predictionsMade: number;
    agentsPreWarmed: number;
    agentsActivated: number;
    activeAgents: number;
    warmAgents: number;
    coolingAgents: number;
  } {
    return {
      scaleUpEvents: this.stats.scaleUpEvents,
      scaleDownEvents: this.stats.scaleDownEvents,
      prewarmEvents: this.stats.prewarmEvents,
      predictionsMade: this.stats.predictionsMade,
      agentsPreWarmed: this.stats.agentsPreWarmed,
      agentsActivated: this.stats.agentsActivated,
      activeAgents: this.activeAgents.size,
      warmAgents: this.warmAgents.size,
      coolingAgents: this.coolingAgents.size,
    };
  }

  /**
   * Get current capacity report
   */
  getCapacityReport(): {
    totalCapacity: number;
    activeCapacity: number;
    warmCapacity: number;
    coolingCapacity: number;
    utilization: number;
    forecastConfidence: number;
  } {
    const activeCapacity = this.activeAgents.size * this.config.targetLoadPerAgent;
    const warmCapacity = this.warmAgents.size * this.config.targetLoadPerAgent;
    const totalCapacity = this.config.maxAgents * this.config.targetLoadPerAgent;

    // Calculate utilization from recent metrics
    const recent = this.metricsHistory.slice(-5);
    const avgLoad = recent.length > 0 
      ? recent.reduce((sum, m) => sum + m.load, 0) / recent.length 
      : 0;

    return {
      totalCapacity,
      activeCapacity,
      warmCapacity,
      coolingCapacity: this.coolingAgents.size * this.config.targetLoadPerAgent,
      utilization: avgLoad,
      forecastConfidence: 0, // Would need to track this
    };
  }

  /**
   * Force immediate scaling (emergency/admin override)
   */
  forceScale(targetCount: number, reason: string): void {
    const currentCount = this.activeAgents.size;
    
    if (targetCount > currentCount) {
      const decision: ScalingDecision = {
        action: 'scale_up',
        targetAgentCount: targetCount,
        agentsToAdd: targetCount - currentCount,
        agentsToRemove: 0,
        reason: `forced_${reason}`,
        urgency: 'critical',
        expectedLoadAtTarget: 0.5,
        placementStrategy: 'center_out',
      };

      this.executeScaleUp(decision, {
        timestamp: Date.now(),
        predictedLoad: 0.8,
        predictedTaskRate: 100,
        confidence: 0.5,
        trend: 'spiking',
        recommendedAgents: targetCount,
        urgency: 'critical',
      });
    } else if (targetCount < currentCount) {
      const decision: ScalingDecision = {
        action: 'scale_down',
        targetAgentCount: targetCount,
        agentsToAdd: 0,
        agentsToRemove: currentCount - targetCount,
        reason: `forced_${reason}`,
        urgency: 'low',
        expectedLoadAtTarget: 0.5,
        placementStrategy: 'fill_gaps',
      };

      this.executeScaleDown(decision, {
        timestamp: Date.now(),
        predictedLoad: 0.3,
        predictedTaskRate: 50,
        confidence: 0.5,
        trend: 'decreasing',
        recommendedAgents: targetCount,
        urgency: 'low',
      });
    }
  }
}

// Singleton export
let scalerInstance: PredictiveScaler | null = null;

export function getPredictiveScaler(
  lattice: FlowerOfLifeOS,
  config?: Partial<ScalerConfig>
): PredictiveScaler {
  if (!scalerInstance) {
    scalerInstance = new PredictiveScaler(lattice, config);
  }
  return scalerInstance;
}

export function resetPredictiveScaler(): void {
  scalerInstance = null;
}
