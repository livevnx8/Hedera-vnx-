/**
 * Vera Lattice - Performance Reasoning Field
 * 
 * Latency prediction, throughput analysis, and resource optimization
 * Dimensions: predicted_latency, throughput_capacity, resource_efficiency, cache_hit_rate,
 *             concurrent_request_handling, memory_footprint, cpu_efficiency
 */

import { ReasoningFieldImpl, LatticeNodeImpl } from '../core/LatticeField.js';
import { logger } from '../../../monitoring/logger.js';

export interface PerformanceMetrics {
  agentId: string;
  averageResponseTimeMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughputRps: number; // Requests per second
  errorRate: number;
  cpuUtilization: number; // 0-1
  memoryUtilization: number; // 0-1
  cacheHitRate: number; // 0-1
  concurrentRequests: number;
  maxConcurrentRequests: number;
  uptimePercentage: number;
  lastUpdated: number;
}

export interface ResourceProfile {
  agentId: string;
  cpuCores: number;
  memoryGb: number;
  storageGb: number;
  networkBandwidthMbps: number;
  estimatedTaskCapacity: number; // Tasks per minute
  scalingFactor: number; // How quickly can scale up
}

export interface LatencyPrediction {
  agentId: string;
  predictedLatencyMs: number;
  confidenceInterval: { low: number; high: number };
  factors: string[];
}

export interface BottleneckAnalysis {
  agentId: string;
  primaryBottleneck: 'cpu' | 'memory' | 'network' | 'storage' | 'none';
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  headroom: number; // Percentage of remaining capacity
}

export class PerformanceField extends ReasoningFieldImpl {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private resourceProfiles: Map<string, ResourceProfile> = new Map();
  private historicalLatencies: Map<string, number[]> = new Map(); // agentId -> latencies

  constructor() {
    super('performance', 'Performance Analysis', [
      'predicted_latency',
      'throughput_capacity',
      'resource_efficiency',
      'cache_hit_rate',
      'concurrent_request_handling',
      'memory_footprint',
      'cpu_efficiency'
    ]);
  }

  /**
   * Record performance metrics for an agent
   */
  recordMetrics(agentId: string, metrics: Partial<PerformanceMetrics>): void {
    const existing = this.metrics.get(agentId);
    
    const updated: PerformanceMetrics = {
      agentId,
      averageResponseTimeMs: metrics.averageResponseTimeMs ?? existing?.averageResponseTimeMs ?? 0,
      p50LatencyMs: metrics.p50LatencyMs ?? existing?.p50LatencyMs ?? 0,
      p95LatencyMs: metrics.p95LatencyMs ?? existing?.p95LatencyMs ?? 0,
      p99LatencyMs: metrics.p99LatencyMs ?? existing?.p99LatencyMs ?? 0,
      throughputRps: metrics.throughputRps ?? existing?.throughputRps ?? 0,
      errorRate: metrics.errorRate ?? existing?.errorRate ?? 0,
      cpuUtilization: metrics.cpuUtilization ?? existing?.cpuUtilization ?? 0,
      memoryUtilization: metrics.memoryUtilization ?? existing?.memoryUtilization ?? 0,
      cacheHitRate: metrics.cacheHitRate ?? existing?.cacheHitRate ?? 0,
      concurrentRequests: metrics.concurrentRequests ?? existing?.concurrentRequests ?? 0,
      maxConcurrentRequests: metrics.maxConcurrentRequests ?? existing?.maxConcurrentRequests ?? 100,
      uptimePercentage: metrics.uptimePercentage ?? existing?.uptimePercentage ?? 100,
      lastUpdated: Date.now()
    };

    this.metrics.set(agentId, updated);

    // Track historical latencies for prediction
    if (metrics.averageResponseTimeMs) {
      const history = this.historicalLatencies.get(agentId) || [];
      history.push(metrics.averageResponseTimeMs);
      // Keep last 100 measurements
      if (history.length > 100) history.shift();
      this.historicalLatencies.set(agentId, history);
    }

    // Check for performance degradation
    if (existing && metrics.averageResponseTimeMs && 
        metrics.averageResponseTimeMs > existing.averageResponseTimeMs * 1.5) {
      this.emit('performance_degradation', { agentId, metrics: updated });
    }

    logger.debug('PerformanceField', {
      message: 'Metrics recorded',
      agentId,
      avgLatency: updated.averageResponseTimeMs,
      throughput: updated.throughputRps
    });
  }

  /**
   * Predict latency for an agent with confidence interval
   */
  predictLatency(agentId: string, taskComplexity: number = 0.5): LatencyPrediction {
    const metrics = this.metrics.get(agentId);
    const history = this.historicalLatencies.get(agentId) || [];

    if (!metrics && history.length === 0) {
      return {
        agentId,
        predictedLatencyMs: 1000, // Default assumption
        confidenceInterval: { low: 500, high: 2000 },
        factors: ['no_historical_data', 'default_prediction']
      };
    }

    // Use recent average if metrics available
    const baseLatency = metrics?.averageResponseTimeMs ?? 
      (history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 1000);

    // Adjust for task complexity (0-1 scale)
    const complexityFactor = 0.5 + taskComplexity; // 0.5 to 1.5x
    
    // Adjust for current load
    const loadFactor = metrics 
      ? (metrics.concurrentRequests / metrics.maxConcurrentRequests) * 0.5 + 0.5
      : 1.0;

    // Adjust for error rate (higher errors = less predictable)
    const errorFactor = metrics 
      ? 1 + (metrics.errorRate * 2) // Up to 3x variance with high errors
      : 1.0;

    const predictedLatency = baseLatency * complexityFactor * loadFactor;
    const variance = baseLatency * errorFactor * 0.2; // 20% base variance

    return {
      agentId,
      predictedLatencyMs: Math.round(predictedLatency),
      confidenceInterval: {
        low: Math.round(predictedLatency - variance),
        high: Math.round(predictedLatency + variance)
      },
      factors: [
        `base_latency_${Math.round(baseLatency)}ms`,
        `complexity_${Math.round(taskComplexity * 100)}%`,
        `load_factor_${loadFactor.toFixed(2)}`,
        `error_rate_${((metrics?.errorRate ?? 0) * 100).toFixed(1)}%`
      ]
    };
  }

  /**
   * Calculate available throughput capacity
   */
  calculateThroughputCapacity(agentId: string): { available: number; max: number; utilized: number } {
    const metrics = this.metrics.get(agentId);
    const profile = this.resourceProfiles.get(agentId);

    if (!metrics && !profile) {
      return { available: 100, max: 100, utilized: 0 }; // Conservative default
    }

    const maxRps = profile?.estimatedTaskCapacity ?? metrics?.maxConcurrentRequests ?? 100;
    const currentRps = metrics?.throughputRps ?? 0;
    const available = Math.max(0, maxRps - currentRps);

    return {
      available,
      max: maxRps,
      utilized: currentRps
    };
  }

  /**
   * Analyze bottlenecks for an agent
   */
  analyzeBottlenecks(agentId: string): BottleneckAnalysis {
    const metrics = this.metrics.get(agentId);
    const profile = this.resourceProfiles.get(agentId);

    if (!metrics) {
      return {
        agentId,
        primaryBottleneck: 'none',
        severity: 'low',
        recommendations: ['collect_performance_data'],
        headroom: 100
      };
    }

    const bottlenecks: Array<{ type: BottleneckAnalysis['primaryBottleneck']; severity: number }> = [];

    // CPU check
    if (metrics.cpuUtilization > 0.8) {
      bottlenecks.push({ type: 'cpu', severity: metrics.cpuUtilization });
    }

    // Memory check
    if (metrics.memoryUtilization > 0.85) {
      bottlenecks.push({ type: 'memory', severity: metrics.memoryUtilization });
    }

    // Network check (estimated from response times)
    if (metrics.p99LatencyMs > metrics.p50LatencyMs * 3) {
      bottlenecks.push({ type: 'network', severity: 0.7 });
    }

    // Concurrent request check
    const utilizationRatio = metrics.concurrentRequests / metrics.maxConcurrentRequests;
    if (utilizationRatio > 0.9) {
      bottlenecks.push({ type: 'storage', severity: utilizationRatio });
    }

    if (bottlenecks.length === 0) {
      return {
        agentId,
        primaryBottleneck: 'none',
        severity: 'low',
        recommendations: ['performance_healthy'],
        headroom: Math.round((1 - Math.max(metrics.cpuUtilization, metrics.memoryUtilization)) * 100)
      };
    }

    // Sort by severity and get worst
    bottlenecks.sort((a, b) => b.severity - a.severity);
    const worst = bottlenecks[0];

    const severity: BottleneckAnalysis['severity'] = 
      worst.severity > 0.95 ? 'critical' :
      worst.severity > 0.85 ? 'high' :
      worst.severity > 0.7 ? 'medium' : 'low';

    const recommendations: string[] = [];
    
    switch (worst.type) {
      case 'cpu':
        recommendations.push('scale_up_cpu', 'optimize_compute_intensive_ops', 'add_caching');
        break;
      case 'memory':
        recommendations.push('increase_memory', 'optimize_memory_usage', 'check_memory_leaks');
        break;
      case 'network':
        recommendations.push('optimize_payload_size', 'enable_compression', 'use_cdn');
        break;
      case 'storage':
        recommendations.push('scale_horizontal', 'implement_queue', 'optimize_database_queries');
        break;
    }

    // Calculate headroom
    const maxUtilization = Math.max(
      metrics.cpuUtilization,
      metrics.memoryUtilization,
      utilizationRatio
    );

    return {
      agentId,
      primaryBottleneck: worst.type,
      severity,
      recommendations,
      headroom: Math.round((1 - maxUtilization) * 100)
    };
  }

  /**
   * Score an agent's overall performance
   */
  scorePerformance(agentId: string): {
    overall: number;
    latency: number;
    throughput: number;
    reliability: number;
    efficiency: number;
  } {
    const metrics = this.metrics.get(agentId);
    
    if (!metrics) {
      return { overall: 0.5, latency: 0.5, throughput: 0.5, reliability: 0.5, efficiency: 0.5 };
    }

    // Latency score (lower is better, exponential decay)
    const latencyScore = Math.max(0, 1 - (metrics.averageResponseTimeMs / 5000));

    // Throughput score (higher is better)
    const maxThroughput = metrics.maxConcurrentRequests * 10; // Assume 10 RPS per concurrent slot
    const throughputScore = Math.min(1, metrics.throughputRps / maxThroughput);

    // Reliability score (100% uptime = 1.0, subtract for errors)
    const reliabilityScore = (metrics.uptimePercentage / 100) * (1 - metrics.errorRate);

    // Efficiency score (weighted average of resource utilization inverse)
    const resourceEfficiency = 1 - ((metrics.cpuUtilization + metrics.memoryUtilization) / 2);
    const cacheEfficiency = metrics.cacheHitRate;
    const efficiencyScore = resourceEfficiency * 0.6 + cacheEfficiency * 0.4;

    const overall = (latencyScore * 0.3 + throughputScore * 0.25 + 
                    reliabilityScore * 0.25 + efficiencyScore * 0.2);

    return {
      overall,
      latency: latencyScore,
      throughput: throughputScore,
      reliability: reliabilityScore,
      efficiency: efficiencyScore
    };
  }

  /**
   * Find best performing agents for a task
   */
  findBestPerformingAgents(
    agentIds: string[],
    requirements: {
      maxLatencyMs?: number;
      minThroughputRps?: number;
      maxErrorRate?: number;
      taskComplexity?: number;
    } = {}
  ): Array<{ agentId: string; score: number; prediction: LatencyPrediction }> {
    const results = agentIds.map(agentId => {
      const prediction = this.predictLatency(agentId, requirements.taskComplexity);
      const performance = this.scorePerformance(agentId);
      const capacity = this.calculateThroughputCapacity(agentId);

      let score = performance.overall;

      // Penalize if doesn't meet requirements
      if (requirements.maxLatencyMs && prediction.predictedLatencyMs > requirements.maxLatencyMs) {
        score *= 0.5;
      }

      if (requirements.minThroughputRps && capacity.available < requirements.minThroughputRps) {
        score *= 0.7;
      }

      const metrics = this.metrics.get(agentId);
      if (requirements.maxErrorRate && metrics && metrics.errorRate > requirements.maxErrorRate) {
        score *= 0.6;
      }

      return { agentId, score, prediction };
    });

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Register resource profile for capacity planning
   */
  registerResourceProfile(profile: ResourceProfile): void {
    this.resourceProfiles.set(profile.agentId, profile);

    logger.info('PerformanceField', {
      message: 'Resource profile registered',
      agentId: profile.agentId,
      cpuCores: profile.cpuCores,
      memoryGb: profile.memoryGb,
      estimatedCapacity: profile.estimatedTaskCapacity
    });
  }

  /**
   * Get performance trend for an agent
   */
  getPerformanceTrend(agentId: string): {
    latencyTrend: 'improving' | 'stable' | 'degrading';
    errorTrend: 'improving' | 'stable' | 'degrading';
    throughputTrend: 'improving' | 'stable' | 'degrading';
  } {
    const history = this.historicalLatencies.get(agentId) || [];
    
    if (history.length < 10) {
      return { latencyTrend: 'stable', errorTrend: 'stable', throughputTrend: 'stable' };
    }

    const recent = history.slice(-10);
    const older = history.slice(-20, -10);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;

    const trend = (current: number, previous: number): 'improving' | 'stable' | 'degrading' => {
      const change = Math.abs(current - previous) / previous;
      if (change < 0.1) return 'stable';
      return current < previous ? 'improving' : 'degrading';
    };

    const metrics = this.metrics.get(agentId);

    return {
      latencyTrend: trend(recentAvg, olderAvg),
      errorTrend: metrics ? trend(metrics.errorRate, metrics.errorRate * 0.9) : 'stable', // Simplified
      throughputTrend: metrics ? trend(metrics.throughputRps, metrics.throughputRps * 0.9) : 'stable'
    };
  }

  /**
   * Get field statistics
   */
  getPerformanceStats(): {
    totalAgents: number;
    averageLatencyMs: number;
    averageThroughput: number;
    averageErrorRate: number;
    agentsWithBottlenecks: number;
    criticalBottlenecks: number;
  } {
    const allMetrics = Array.from(this.metrics.values());
    
    if (allMetrics.length === 0) {
      return {
        totalAgents: 0,
        averageLatencyMs: 0,
        averageThroughput: 0,
        averageErrorRate: 0,
        agentsWithBottlenecks: 0,
        criticalBottlenecks: 0
      };
    }

    const avgLatency = allMetrics.reduce((sum, m) => sum + m.averageResponseTimeMs, 0) / allMetrics.length;
    const avgThroughput = allMetrics.reduce((sum, m) => sum + m.throughputRps, 0) / allMetrics.length;
    const avgError = allMetrics.reduce((sum, m) => sum + m.errorRate, 0) / allMetrics.length;

    const bottlenecks = allMetrics.map(m => this.analyzeBottlenecks(m.agentId));
    const agentsWithBottlenecks = bottlenecks.filter(b => b.primaryBottleneck !== 'none').length;
    const criticalBottlenecks = bottlenecks.filter(b => b.severity === 'critical').length;

    return {
      totalAgents: allMetrics.length,
      averageLatencyMs: Math.round(avgLatency),
      averageThroughput: Math.round(avgThroughput * 10) / 10,
      averageErrorRate: Math.round(avgError * 1000) / 1000,
      agentsWithBottlenecks,
      criticalBottlenecks
    };
  }
}

// Singleton instance
export const performanceField = new PerformanceField();
export default performanceField;
