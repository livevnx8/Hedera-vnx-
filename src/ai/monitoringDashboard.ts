/**
 * Vera AI Performance Dashboard
 * Real-time metrics and monitoring for AI optimization system
 */

import { logger } from '../monitoring/logger.js';
import { performance } from 'perf_hooks';

interface DashboardMetrics {
  requests: {
    total: number;
    lastMinute: number;
    lastHour: number;
    cacheHitRate: string;
  };
  latency: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  models: {
    provider: string;
    usage: number;
    avgLatency: number;
    errorRate: string;
  }[];
  tools: {
    totalCalls: number;
    batchedCalls: number;
    cacheHits: number;
    accuracy: string;
  };
  cache: {
    hitRate: string;
    semanticHits: string;
    memorySize: number;
    avgHitTime: number;
  };
  health: {
    status: 'healthy' | 'degraded' | 'critical';
    issues: string[];
    recommendations: string[];
  };
}

export class MonitoringDashboard {
  private requestHistory: Array<{ timestamp: number; latency: number; cacheHit: boolean }> = [];
  private modelUsage: Map<string, { count: number; totalLatency: number; errors: number }> = new Map();
  private latencyBuckets: number[] = [];
  
  // Health thresholds
  private readonly LATENCY_THRESHOLD = 500; // ms
  private readonly ERROR_THRESHOLD = 0.05; // 5%
  private readonly CACHE_HIT_THRESHOLD = 0.70; // 70%

  constructor(private getIntegrationStats: () => any) {}

  /**
   * Record a request for metrics
   */
  recordRequest(latency: number, cacheHit: boolean, provider: string): void {
    const now = Date.now();
    
    this.requestHistory.push({ timestamp: now, latency, cacheHit });
    
    // Track model usage
    if (!this.modelUsage.has(provider)) {
      this.modelUsage.set(provider, { count: 0, totalLatency: 0, errors: 0 });
    }
    const usage = this.modelUsage.get(provider)!;
    usage.count++;
    usage.totalLatency += latency;

    // Cleanup old history (keep last 24 hours)
    const dayAgo = now - 24 * 60 * 60 * 1000;
    this.requestHistory = this.requestHistory.filter(r => r.timestamp > dayAgo);

    // Track latency distribution
    this.latencyBuckets.push(latency);
    if (this.latencyBuckets.length > 1000) {
      this.latencyBuckets.shift();
    }
  }

  /**
   * Record an error
   */
  recordError(provider: string): void {
    if (!this.modelUsage.has(provider)) {
      this.modelUsage.set(provider, { count: 0, totalLatency: 0, errors: 0 });
    }
    this.modelUsage.get(provider)!.errors++;
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): DashboardMetrics {
    const now = Date.now();
    const minuteAgo = now - 60 * 1000;
    const hourAgo = now - 60 * 60 * 1000;

    // Request counts
    const lastMinute = this.requestHistory.filter(r => r.timestamp > minuteAgo).length;
    const lastHour = this.requestHistory.filter(r => r.timestamp > hourAgo).length;
    const total = this.requestHistory.length;
    const cacheHits = this.requestHistory.filter(r => r.cacheHit).length;
    const cacheHitRate = total > 0 ? (cacheHits / total * 100).toFixed(2) : '0';

    // Latency percentiles
    const sortedLatencies = [...this.latencyBuckets].sort((a, b) => a - b);
    const p50 = this.getPercentile(sortedLatencies, 50);
    const p95 = this.getPercentile(sortedLatencies, 95);
    const p99 = this.getPercentile(sortedLatencies, 99);
    const avg = sortedLatencies.length > 0 
      ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length 
      : 0;

    // Model usage stats
    const models = Array.from(this.modelUsage.entries()).map(([provider, stats]) => ({
      provider,
      usage: stats.count,
      avgLatency: stats.count > 0 ? Math.round(stats.totalLatency / stats.count) : 0,
      errorRate: stats.count > 0 ? (stats.errors / stats.count * 100).toFixed(2) + '%' : '0%'
    })).sort((a, b) => b.usage - a.usage);

    // Get integration stats
    const integrationStats = this.getIntegrationStats();

    // Health check
    const health = this.checkHealth(avg, models, cacheHitRate, integrationStats);

    return {
      requests: {
        total,
        lastMinute,
        lastHour,
        cacheHitRate: `${cacheHitRate}%`
      },
      latency: {
        avg: Math.round(avg),
        p50,
        p95,
        p99
      },
      models,
      tools: {
        totalCalls: integrationStats.toolStats?.totalCalls || 0,
        batchedCalls: integrationStats.toolStats?.batchedCalls || 0,
        cacheHits: integrationStats.toolStats?.cacheHits || 0,
        accuracy: ((integrationStats.toolStats?.accuracy || 0) * 100).toFixed(1) + '%'
      },
      cache: {
        hitRate: integrationStats.cacheStats?.hitRate || '0%',
        semanticHits: integrationStats.cacheStats?.semanticRate || '0%',
        memorySize: integrationStats.cacheStats?.memorySize || 0,
        avgHitTime: Math.round(integrationStats.cacheStats?.avgHitTime || 0)
      },
      health
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private getPercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Check system health
   */
  private checkHealth(avgLatency: number, models: any[], cacheHitRate: string, stats: any): DashboardMetrics['health'] {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Latency check
    if (avgLatency > this.LATENCY_THRESHOLD) {
      issues.push(`High average latency: ${Math.round(avgLatency)}ms`);
      recommendations.push('Consider using faster models or enabling more aggressive caching');
    }

    // Error rate check
    for (const model of models) {
      const errorRate = parseFloat(model.errorRate);
      if (errorRate > this.ERROR_THRESHOLD * 100) {
        issues.push(`High error rate for ${model.provider}: ${model.errorRate}`);
        recommendations.push(`Investigate ${model.provider} failures or increase fallback usage`);
      }
    }

    // Cache hit rate check
    const cacheRate = parseFloat(cacheHitRate);
    if (cacheRate < this.CACHE_HIT_THRESHOLD * 100) {
      issues.push(`Low cache hit rate: ${cacheHitRate}%`);
      recommendations.push('Preload common queries and increase cache TTL');
    }

    // Tool accuracy check
    if (stats.toolStats?.accuracy < 0.95) {
      issues.push(`Tool accuracy below 95%: ${(stats.toolStats.accuracy * 100).toFixed(1)}%`);
      recommendations.push('Review tool definitions and add more examples');
    }

    // Determine status
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (issues.length > 2) status = 'critical';
    else if (issues.length > 0) status = 'degraded';

    return { status, issues, recommendations };
  }

  /**
   * Export metrics for Prometheus/Grafana
   */
  getPrometheusMetrics(): string {
    const metrics = this.getMetrics();
    
    return `
# Vera AI Metrics
vera_ai_requests_total ${metrics.requests.total}
vera_ai_requests_last_minute ${metrics.requests.lastMinute}
vera_ai_requests_last_hour ${metrics.requests.lastHour}
vera_ai_cache_hit_rate ${parseFloat(metrics.requests.cacheHitRate)}
vera_ai_latency_avg ${metrics.latency.avg}
vera_ai_latency_p50 ${metrics.latency.p50}
vera_ai_latency_p95 ${metrics.latency.p95}
vera_ai_latency_p99 ${metrics.latency.p99}
vera_ai_tool_accuracy ${parseFloat(metrics.tools.accuracy)}
vera_ai_health_status{status="${metrics.health.status}"} 1
${metrics.models.map(m => `vera_ai_model_usage{provider="${m.provider}"} ${m.usage}`).join('\n')}
${metrics.models.map(m => `vera_ai_model_latency{provider="${m.provider}"} ${m.avgLatency}`).join('\n')}
`.trim();
  }

  /**
   * Get performance summary for logging
   */
  getSummary(): string {
    const m = this.getMetrics();
    return `
Vera AI Performance Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Requests: ${m.requests.total} total, ${m.requests.lastMinute}/min, ${m.requests.lastHour}/hr
Latency: ${m.latency.avg}ms avg, ${m.latency.p95}ms p95
Cache: ${m.requests.cacheHitRate} hit rate
Tools: ${m.tools.accuracy} accuracy, ${m.tools.totalCalls} calls
Health: ${m.health.status.toUpperCase()}
${m.health.issues.length > 0 ? 'Issues: ' + m.health.issues.join(', ') : 'No issues'}
`.trim();
  }
}

// Export factory
export const createDashboard = (getStats: () => any) => new MonitoringDashboard(getStats);
