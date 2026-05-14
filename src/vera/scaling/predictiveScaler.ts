/**
 * Predictive Agent Scaling
 * 
 * Analyzes system load patterns and automatically provisions/decommissions
 * agents based on predicted demand. Integrates with lattice fields for
 * intelligent capacity planning.
 * 
 * Features:
 * - Load pattern analysis with exponential smoothing
 * - Predictive scaling with configurable look-ahead
 * - Cost-aware scaling decisions (EconomicField integration)
 * - Performance-based agent type selection
 * - Graceful agent lifecycle management
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { performanceField } from '../lattice/fields/PerformanceField.js';
import { economicField } from '../lattice/fields/EconomicField.js';
import { AgentDiscoveryInfo } from '../orchestrator/agentHCSBeacon.js';

export interface ScalingConfig {
  minAgents: number;
  maxAgents: number;
  targetCpuUtilization: number; // 0.0 - 1.0
  targetMemoryUtilization: number;
  scaleUpThreshold: number; // CPU/Memory threshold to trigger scale up
  scaleDownThreshold: number;
  predictionWindowMs: number;
  cooldownPeriodMs: number;
  enablePredictiveScaling: boolean;
  enableCostOptimization: boolean;
  maxCostPerHour: number; // HBAR
}

export interface LoadMetrics {
  timestamp: number;
  totalTasks: number;
  activeAgents: number;
  avgCpuUtilization: number;
  avgMemoryUtilization: number;
  queueDepth: number;
  throughputRps: number;
  errorRate: number;
}

export interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'maintain';
  reason: string;
  targetAgentCount: number;
  confidence: number;
  predictedLoad: number;
  estimatedCost: number;
}

export class PredictiveAgentScaler extends EventEmitter {
  private config: ScalingConfig;
  private loadHistory: LoadMetrics[] = [];
  private lastScaleAction: number = 0;
  private currentAgentCount: number = 0;
  private scalingTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Exponential smoothing factors
  private alpha = 0.3; // Smoothing factor for load trends
  private trendSmoothing = 0.1;

  constructor(config: Partial<ScalingConfig> = {}) {
    super();
    this.config = {
      minAgents: config.minAgents || 2,
      maxAgents: config.maxAgents || 20,
      targetCpuUtilization: config.targetCpuUtilization || 0.7,
      targetMemoryUtilization: config.targetMemoryUtilization || 0.7,
      scaleUpThreshold: config.scaleUpThreshold || 0.8,
      scaleDownThreshold: config.scaleDownThreshold || 0.3,
      predictionWindowMs: config.predictionWindowMs || 300000, // 5 minutes
      cooldownPeriodMs: config.cooldownPeriodMs || 60000, // 1 minute
      enablePredictiveScaling: config.enablePredictiveScaling ?? true,
      enableCostOptimization: config.enableCostOptimization ?? true,
      maxCostPerHour: config.maxCostPerHour || 100 // HBAR
    };
  }

  /**
   * Start the predictive scaler
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.scalingTimer = setInterval(() => {
      this.evaluateAndScale();
    }, 30000); // Check every 30 seconds

    logger.info('PredictiveAgentScaler', {
      message: 'Scaler started',
      config: this.config
    });
  }

  /**
   * Stop the scaler
   */
  stop(): void {
    this.isRunning = false;
    if (this.scalingTimer) {
      clearInterval(this.scalingTimer);
      this.scalingTimer = null;
    }
    logger.info('PredictiveAgentScaler', { message: 'Scaler stopped' });
  }

  /**
   * Record current load metrics
   */
  recordLoadMetrics(metrics: Omit<LoadMetrics, 'timestamp'>): void {
    const fullMetrics: LoadMetrics = {
      ...metrics,
      timestamp: Date.now()
    };

    this.loadHistory.push(fullMetrics);
    this.currentAgentCount = metrics.activeAgents;

    // Keep only last hour of history
    const cutoff = Date.now() - 3600000;
    this.loadHistory = this.loadHistory.filter(m => m.timestamp > cutoff);

    logger.debug('PredictiveAgentScaler', {
      message: 'Load metrics recorded',
      activeAgents: metrics.activeAgents,
      queueDepth: metrics.queueDepth,
      cpuUtil: Math.round(metrics.avgCpuUtilization * 100) + '%'
    });
  }

  /**
   * Evaluate current state and make scaling decision
   */
  private evaluateAndScale(): ScalingDecision {
    const now = Date.now();
    
    // Check cooldown
    if (now - this.lastScaleAction < this.config.cooldownPeriodMs) {
      return {
        action: 'maintain',
        reason: 'Cooldown period active',
        targetAgentCount: this.currentAgentCount,
        confidence: 1,
        predictedLoad: 0,
        estimatedCost: 0
      };
    }

    // Get current metrics
    const currentMetrics = this.loadHistory[this.loadHistory.length - 1];
    if (!currentMetrics) {
      return {
        action: 'maintain',
        reason: 'No metrics available',
        targetAgentCount: this.currentAgentCount,
        confidence: 0,
        predictedLoad: 0,
        estimatedCost: 0
      };
    }

    // Calculate predicted load
    const predictedLoad = this.predictLoad();
    const currentLoad = this.calculateLoadScore(currentMetrics);

    // Make scaling decision
    let decision: ScalingDecision;

    if (this.shouldScaleUp(currentMetrics, predictedLoad)) {
      const targetCount = Math.min(
        this.config.maxAgents,
        Math.ceil(this.currentAgentCount * 1.5)
      );
      
      decision = {
        action: 'scale_up',
        reason: `High load detected: ${Math.round(currentLoad * 100)}%, predicted: ${Math.round(predictedLoad * 100)}%`,
        targetAgentCount: targetCount,
        confidence: this.calculateConfidence(),
        predictedLoad,
        estimatedCost: this.estimateCost(targetCount)
      };

      // Check cost constraints
      if (this.config.enableCostOptimization && decision.estimatedCost > this.config.maxCostPerHour) {
        decision.reason += ' (cost-capped)';
        decision.targetAgentCount = this.findMaxAgentsWithinBudget();
      }

    } else if (this.shouldScaleDown(currentMetrics, predictedLoad)) {
      const targetCount = Math.max(
        this.config.minAgents,
        Math.floor(this.currentAgentCount * 0.8)
      );

      decision = {
        action: 'scale_down',
        reason: `Low load detected: ${Math.round(currentLoad * 100)}%, predicted: ${Math.round(predictedLoad * 100)}%`,
        targetAgentCount: targetCount,
        confidence: this.calculateConfidence(),
        predictedLoad,
        estimatedCost: this.estimateCost(targetCount)
      };

    } else {
      decision = {
        action: 'maintain',
        reason: `Load within target range: ${Math.round(currentLoad * 100)}%`,
        targetAgentCount: this.currentAgentCount,
        confidence: this.calculateConfidence(),
        predictedLoad,
        estimatedCost: this.estimateCost(this.currentAgentCount)
      };
    }

    // Execute decision
    this.executeScalingDecision(decision);

    return decision;
  }

  /**
   * Predict future load using exponential smoothing
   */
  private predictLoad(): number {
    if (this.loadHistory.length < 5) {
      return this.loadHistory.length > 0 
        ? this.calculateLoadScore(this.loadHistory[this.loadHistory.length - 1])
        : 0.5;
    }

    const recent = this.loadHistory.slice(-10);
    
    // Calculate weighted average with exponential decay
    let weightedSum = 0;
    let weightSum = 0;
    
    recent.forEach((metric, index) => {
      const weight = Math.pow(this.alpha, recent.length - index - 1);
      weightedSum += this.calculateLoadScore(metric) * weight;
      weightSum += weight;
    });

    const smoothedLoad = weightedSum / weightSum;

    // Calculate trend
    if (recent.length >= 3) {
      const first = this.calculateLoadScore(recent[0]);
      const last = this.calculateLoadScore(recent[recent.length - 1]);
      const trend = (last - first) / recent.length;
      
      // Project trend forward
      const predictionWindow = this.config.predictionWindowMs / 30000; // Number of 30s intervals
      return Math.max(0, Math.min(1, smoothedLoad + trend * predictionWindow * this.trendSmoothing));
    }

    return smoothedLoad;
  }

  /**
   * Calculate composite load score
   */
  private calculateLoadScore(metrics: LoadMetrics): number {
    const cpuWeight = 0.4;
    const memoryWeight = 0.3;
    const queueWeight = 0.2;
    const errorWeight = 0.1;

    // Normalize queue depth (assume max queue of 100)
    const normalizedQueue = Math.min(1, metrics.queueDepth / 100);

    return (
      metrics.avgCpuUtilization * cpuWeight +
      metrics.avgMemoryUtilization * memoryWeight +
      normalizedQueue * queueWeight +
      metrics.errorRate * errorWeight
    );
  }

  /**
   * Determine if we should scale up
   */
  private shouldScaleUp(current: LoadMetrics, predicted: number): boolean {
    if (this.currentAgentCount >= this.config.maxAgents) return false;

    const currentLoad = this.calculateLoadScore(current);
    
    // Scale up if current or predicted load exceeds threshold
    return (
      currentLoad > this.config.scaleUpThreshold ||
      (this.config.enablePredictiveScaling && predicted > this.config.scaleUpThreshold)
    );
  }

  /**
   * Determine if we should scale down
   */
  private shouldScaleDown(current: LoadMetrics, predicted: number): boolean {
    if (this.currentAgentCount <= this.config.minAgents) return false;

    const currentLoad = this.calculateLoadScore(current);

    // Scale down only if both current and predicted are below threshold
    return (
      currentLoad < this.config.scaleDownThreshold &&
      (!this.config.enablePredictiveScaling || predicted < this.config.scaleDownThreshold)
    );
  }

  /**
   * Calculate confidence in prediction
   */
  private calculateConfidence(): number {
    const sampleSize = Math.min(this.loadHistory.length, 20);
    if (sampleSize < 5) return 0.3;
    if (sampleSize < 10) return 0.6;
    return 0.85;
  }

  /**
   * Estimate hourly cost for given agent count
   */
  private estimateCost(agentCount: number): number {
    // Use EconomicField to get market rate
    const stats = economicField.getEconomicStats();
    const avgEarning = stats.totalAgentsTracked > 0 
      ? stats.totalVolumeHbar / stats.totalAgentsTracked 
      : 10; // Default 10 HBAR per agent

    return agentCount * avgEarning;
  }

  /**
   * Find maximum agents within budget
   */
  private findMaxAgentsWithinBudget(): number {
    const stats = economicField.getEconomicStats();
    const avgEarning = stats.totalAgentsTracked > 0 
      ? stats.totalVolumeHbar / stats.totalAgentsTracked 
      : 10;

    return Math.floor(this.config.maxCostPerHour / avgEarning);
  }

  /**
   * Execute scaling decision
   */
  private executeScalingDecision(decision: ScalingDecision): void {
    if (decision.action === 'maintain') return;

    this.lastScaleAction = Date.now();

    logger.info('PredictiveAgentScaler', {
      message: `Scaling ${decision.action}`,
      from: this.currentAgentCount,
      to: decision.targetAgentCount,
      reason: decision.reason,
      confidence: decision.confidence,
      estimatedCost: decision.estimatedCost
    });

    this.emit('scale', decision);

    // Emit specific events
    if (decision.action === 'scale_up') {
      this.emit('scale_up', {
        targetCount: decision.targetAgentCount,
        agentsToAdd: decision.targetAgentCount - this.currentAgentCount
      });
    } else {
      this.emit('scale_down', {
        targetCount: decision.targetAgentCount,
        agentsToRemove: this.currentAgentCount - decision.targetAgentCount
      });
    }
  }

  /**
   * Get current scaling stats
   */
  getStats(): {
    currentAgents: number;
    minAgents: number;
    maxAgents: number;
    historySize: number;
    lastScaleAction: number;
    config: ScalingConfig;
  } {
    return {
      currentAgents: this.currentAgentCount,
      minAgents: this.config.minAgents,
      maxAgents: this.config.maxAgents,
      historySize: this.loadHistory.length,
      lastScaleAction: this.lastScaleAction,
      config: this.config
    };
  }

  /**
   * Get recommendations for agent types based on workload
   */
  getAgentTypeRecommendation(workload: {
    expectedRps: number;
    maxLatencyMs: number;
    requiresGpu?: boolean;
  }): {
    recommendedType: string;
    estimatedInstances: number;
    reason: string;
  } {
    // Simple recommendation logic
    if (workload.requiresGpu) {
      return {
        recommendedType: 'gpu-worker',
        estimatedInstances: Math.ceil(workload.expectedRps / 10),
        reason: 'GPU-intensive workload detected'
      };
    }

    if (workload.maxLatencyMs < 100) {
      return {
        recommendedType: 'high-performance',
        estimatedInstances: Math.ceil(workload.expectedRps / 50),
        reason: 'Low latency requirement (<100ms)'
      };
    }

    if (workload.expectedRps > 1000) {
      return {
        recommendedType: 'high-throughput',
        estimatedInstances: Math.ceil(workload.expectedRps / 100),
        reason: 'High throughput requirement (>1000 RPS)'
      };
    }

    return {
      recommendedType: 'standard',
      estimatedInstances: Math.max(2, Math.ceil(workload.expectedRps / 20)),
      reason: 'Standard workload pattern'
    };
  }
}

// Singleton instance
export const predictiveScaler = new PredictiveAgentScaler();
export default predictiveScaler;
