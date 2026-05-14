/**
 * Advanced Performance Monitoring for QVX Node
 * 
 * Tracks and optimizes performance for Vera AI Assistant
 */

export interface PerformanceMetrics {
  timestamp: Date;
  requestCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number;
  errorRate: number;
  gpuUtilization: number;
  memoryUtilization: number;
  cacheHitRate: number;
  concurrentUsers: number;
}

export interface PerformanceAlert {
  type: 'warning' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  message: string;
  timestamp: Date;
  recommendations: string[];
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private responseTimes: number[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alertCallbacks: ((alert: PerformanceAlert) => void)[] = [];
  
  private thresholds = {
    responseTime: { warning: 5000, critical: 10000 }, // ms
    errorRate: { warning: 0.05, critical: 0.1 }, // percentage
    gpuUtilization: { warning: 0.85, critical: 0.95 }, // percentage
    memoryUtilization: { warning: 0.8, critical: 0.9 }, // percentage
    throughput: { warning: 10, critical: 5 }, // requests per second
    cacheHitRate: { warning: 0.7, critical: 0.5 } // percentage
  };

  constructor() {
    this.initializeMetrics();
  }

  /**
   * Initialize performance monitoring
   */
  async initialize(): Promise<void> {
    this.startMonitoring();
    console.log('📊 Performance Monitor initialized for Vera AI');
  }

  /**
   * Record a request completion
   */
  recordRequest(responseTime: number, success: boolean, tokensGenerated: number): void {
    this.responseTimes.push(responseTime);
    
    // Keep only last 1000 response times for percentile calculations
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }
    
    // Update current metrics
    this.updateCurrentMetrics();
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): PerformanceMetrics {
    return this.metrics[this.metrics.length - 1] || this.getEmptyMetrics();
  }

  /**
   * Get performance history
   */
  getMetricsHistory(timeRange?: { start: Date; end: Date }): PerformanceMetrics[] {
    let history = [...this.metrics];
    
    if (timeRange) {
      history = history.filter(m => 
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }
    
    return history;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    
    return this.alerts.filter(alert => 
      alert.timestamp.getTime() > fiveMinutesAgo
    );
  }

  /**
   * Add alert callback
   */
  onAlert(callback: (alert: PerformanceAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get performance recommendations
   */
  getPerformanceRecommendations(): string[] {
    const currentMetrics = this.getCurrentMetrics();
    const recommendations: string[] = [];
    
    if (currentMetrics.averageResponseTime > this.thresholds.responseTime.warning) {
      recommendations.push('🐌 Response time is high - consider increasing GPU resources');
      recommendations.push('🔧 Enable response streaming for better user experience');
    }
    
    if (currentMetrics.errorRate > this.thresholds.errorRate.warning) {
      recommendations.push('⚠️ Error rate is elevated - check system health');
      recommendations.push('🔍 Review recent error logs for patterns');
    }
    
    if (currentMetrics.gpuUtilization > this.thresholds.gpuUtilization.warning) {
      recommendations.push('🔥 GPU utilization is high - optimize batch processing');
      recommendations.push('🧠 Consider enabling memory compression');
    }
    
    if (currentMetrics.cacheHitRate < this.thresholds.cacheHitRate.warning) {
      recommendations.push('💾 Cache hit rate is low - increase cache size');
      recommendations.push('🔄 Review caching strategy for better hit rates');
    }
    
    if (currentMetrics.throughput < this.thresholds.throughput.warning) {
      recommendations.push('📈 Throughput is low - optimize request processing');
      recommendations.push('⚡ Consider enabling request batching');
    }
    
    return recommendations;
  }

  /**
   * Generate performance report
   */
  generateReport(): {
    summary: string;
    metrics: PerformanceMetrics;
    alerts: PerformanceAlert[];
    recommendations: string[];
    trends: {
      responseTime: 'improving' | 'stable' | 'degrading';
      throughput: 'increasing' | 'stable' | 'decreasing';
      errorRate: 'improving' | 'stable' | 'degrading';
    };
  } {
    const currentMetrics = this.getCurrentMetrics();
    const activeAlerts = this.getActiveAlerts();
    const recommendations = this.getPerformanceRecommendations();
    
    // Calculate trends
    const trends = this.calculateTrends();
    
    // Generate summary
    const summary = this.generateSummary(currentMetrics, activeAlerts, trends);
    
    return {
      summary,
      metrics: currentMetrics,
      alerts: activeAlerts,
      recommendations,
      trends
    };
  }

  /**
   * Auto-scale based on performance metrics
   */
  getAutoScalingRecommendations(): {
    scaleUp: boolean;
    scaleDown: boolean;
    targetResources: {
      gpuLayers: number;
      batchSize: number;
      contextSize: number;
      maxConcurrency: number;
    };
    reason: string;
  } {
    const currentMetrics = this.getCurrentMetrics();
    const { scaleUp, scaleDown, reason, targetResources } = this.calculateAutoScaling(currentMetrics);
    
    return {
      scaleUp,
      scaleDown,
      targetResources,
      reason
    };
  }

  private initializeMetrics(): void {
    this.metrics.push(this.getEmptyMetrics());
  }

  private getEmptyMetrics(): PerformanceMetrics {
    return {
      timestamp: new Date(),
      requestCount: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      throughput: 0,
      errorRate: 0,
      gpuUtilization: 0,
      memoryUtilization: 0,
      cacheHitRate: 0,
      concurrentUsers: 0
    };
  }

  private updateCurrentMetrics(): void {
    if (this.responseTimes.length === 0) return;
    
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    const average = sortedTimes.reduce((sum, time) => sum + time, 0) / sortedTimes.length;
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);
    
    const currentMetrics: PerformanceMetrics = {
      timestamp: new Date(),
      requestCount: this.responseTimes.length,
      averageResponseTime: average,
      p95ResponseTime: sortedTimes[p95Index] || 0,
      p99ResponseTime: sortedTimes[p99Index] || 0,
      throughput: this.calculateThroughput(),
      errorRate: this.calculateErrorRate(),
      gpuUtilization: this.getGPUUtilization(),
      memoryUtilization: this.getMemoryUtilization(),
      cacheHitRate: this.getCacheHitRate(),
      concurrentUsers: this.getConcurrentUsers()
    };
    
    this.metrics.push(currentMetrics);
    
    // Keep only last 100 metrics
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }
    
    // Check for alerts
    this.checkAlerts(currentMetrics);
  }

  private calculateThroughput(): number {
    // Calculate requests per second over last minute
    const oneMinuteAgo = Date.now() - 60 * 1000;
    const recentMetrics = this.metrics.filter(m => m.timestamp.getTime() > oneMinuteAgo);
    
    if (recentMetrics.length < 2) return 0;
    
    const oldest = recentMetrics[0];
    const newest = recentMetrics[recentMetrics.length - 1];
    const timeDiff = (newest.timestamp.getTime() - oldest.timestamp.getTime()) / 1000;
    
    if (timeDiff === 0) return 0;
    
    const requestDiff = newest.requestCount - oldest.requestCount;
    return requestDiff / timeDiff;
  }

  private calculateErrorRate(): number {
    // This would be calculated from actual error tracking
    // For now, simulate based on response times
    const slowRequests = this.responseTimes.filter(time => time > 10000).length;
    return this.responseTimes.length > 0 ? slowRequests / this.responseTimes.length : 0;
  }

  private getGPUUtilization(): number {
    // This would get actual GPU utilization
    // For now, simulate based on load
    return Math.min(0.95, this.responseTimes.length / 100);
  }

  private getMemoryUtilization(): number {
    // This would get actual memory utilization
    // For now, simulate based on context size
    return Math.min(0.9, this.responseTimes.length / 150);
  }

  private getCacheHitRate(): number {
    // This would get actual cache hit rate
    // For now, simulate
    return 0.8 + Math.random() * 0.15;
  }

  private getConcurrentUsers(): number {
    // This would get actual concurrent user count
    // For now, simulate
    return Math.max(1, Math.floor(this.responseTimes.length / 20));
  }

  private checkAlerts(metrics: PerformanceMetrics): void {
    const alerts: PerformanceAlert[] = [];
    
    // Check response time
    if (metrics.averageResponseTime > this.thresholds.responseTime.critical) {
      alerts.push({
        type: 'critical',
        metric: 'responseTime',
        value: metrics.averageResponseTime,
        threshold: this.thresholds.responseTime.critical,
        message: 'Critical response time detected',
        timestamp: new Date(),
        recommendations: ['Scale up resources immediately', 'Enable request throttling']
      });
    } else if (metrics.averageResponseTime > this.thresholds.responseTime.warning) {
      alerts.push({
        type: 'warning',
        metric: 'responseTime',
        value: metrics.averageResponseTime,
        threshold: this.thresholds.responseTime.warning,
        message: 'High response time detected',
        timestamp: new Date(),
        recommendations: ['Monitor for further degradation', 'Consider scaling up']
      });
    }
    
    // Check error rate
    if (metrics.errorRate > this.thresholds.errorRate.critical) {
      alerts.push({
        type: 'critical',
        metric: 'errorRate',
        value: metrics.errorRate,
        threshold: this.thresholds.errorRate.critical,
        message: 'Critical error rate detected',
        timestamp: new Date(),
        recommendations: ['Investigate system health', 'Check error logs']
      });
    }
    
    // Check GPU utilization
    if (metrics.gpuUtilization > this.thresholds.gpuUtilization.critical) {
      alerts.push({
        type: 'critical',
        metric: 'gpuUtilization',
        value: metrics.gpuUtilization,
        threshold: this.thresholds.gpuUtilization.critical,
        message: 'Critical GPU utilization',
        timestamp: new Date(),
        recommendations: ['Reduce batch size', 'Enable memory compression']
      });
    }
    
    // Add new alerts and notify callbacks
    alerts.forEach(alert => {
      this.alerts.push(alert);
      this.alertCallbacks.forEach(callback => callback(alert));
    });
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
  }

  private calculateTrends(): {
    responseTime: 'improving' | 'stable' | 'degrading';
    throughput: 'increasing' | 'stable' | 'decreasing';
    errorRate: 'improving' | 'stable' | 'degrading';
  } {
    if (this.metrics.length < 10) {
      return {
        responseTime: 'stable',
        throughput: 'stable',
        errorRate: 'stable'
      };
    }
    
    const recent = this.metrics.slice(-10);
    const older = this.metrics.slice(-20, -10);
    
    if (older.length === 0) {
      return {
        responseTime: 'stable',
        throughput: 'stable',
        errorRate: 'stable'
      };
    }
    
    const avgRecentResponseTime = recent.reduce((sum, m) => sum + m.averageResponseTime, 0) / recent.length;
    const avgOlderResponseTime = older.reduce((sum, m) => sum + m.averageResponseTime, 0) / older.length;
    
    const avgRecentThroughput = recent.reduce((sum, m) => sum + m.throughput, 0) / recent.length;
    const avgOlderThroughput = older.reduce((sum, m) => sum + m.throughput, 0) / older.length;
    
    const avgRecentErrorRate = recent.reduce((sum, m) => sum + m.errorRate, 0) / recent.length;
    const avgOlderErrorRate = older.reduce((sum, m) => sum + m.errorRate, 0) / older.length;
    
    return {
      responseTime: avgRecentResponseTime < avgOlderResponseTime * 0.95 ? 'improving' : 
                 avgRecentResponseTime > avgOlderResponseTime * 1.05 ? 'degrading' : 'stable',
      throughput: avgRecentThroughput > avgOlderThroughput * 1.05 ? 'increasing' : 
                   avgRecentThroughput < avgOlderThroughput * 0.95 ? 'decreasing' : 'stable',
      errorRate: avgRecentErrorRate < avgOlderErrorRate * 0.95 ? 'improving' : 
                 avgRecentErrorRate > avgOlderErrorRate * 1.05 ? 'degrading' : 'stable'
    };
  }

  private generateSummary(metrics: PerformanceMetrics, alerts: PerformanceAlert[], trends: any): string {
    const status = alerts.some(a => a.type === 'critical') ? '🚨 Critical' : 
                  alerts.some(a => a.type === 'warning') ? '⚠️ Warning' : '✅ Healthy';
    
    return `${status} - Response: ${metrics.averageResponseTime.toFixed(0)}ms, ` +
           `Throughput: ${metrics.throughput.toFixed(1)} req/s, ` +
           `GPU: ${(metrics.gpuUtilization * 100).toFixed(1)}%`;
  }

  private calculateAutoScaling(metrics: PerformanceMetrics): {
    scaleUp: boolean;
    scaleDown: boolean;
    reason: string;
    targetResources: any;
  } {
    let scaleUp = false;
    let scaleDown = false;
    let reason = '';
    
    const targetResources = {
      gpuLayers: -1,
      batchSize: 4,
      contextSize: 4096,
      maxConcurrency: 100
    };
    
    // Scale up conditions
    if (metrics.averageResponseTime > this.thresholds.responseTime.warning) {
      scaleUp = true;
      reason = 'High response time requires more resources';
      targetResources.batchSize = Math.min(8, targetResources.batchSize + 2);
    }
    
    if (metrics.gpuUtilization > this.thresholds.gpuUtilization.warning) {
      scaleUp = true;
      reason = 'High GPU utilization requires scaling';
      targetResources.maxConcurrency = Math.max(50, targetResources.maxConcurrency - 20);
    }
    
    if (metrics.throughput < this.thresholds.throughput.warning) {
      scaleUp = true;
      reason = 'Low throughput requires optimization';
      targetResources.contextSize = Math.max(2048, targetResources.contextSize - 512);
    }
    
    // Scale down conditions
    if (metrics.averageResponseTime < 1000 && 
        metrics.gpuUtilization < 0.5 && 
        metrics.throughput > 20) {
      scaleDown = true;
      reason = 'Low load allows resource optimization';
      targetResources.batchSize = Math.max(2, targetResources.batchSize - 1);
    }
    
    return { scaleUp, scaleDown, reason, targetResources };
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.updateCurrentMetrics();
    }, 10000); // Update every 10 seconds
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.metrics = [];
    this.alerts = [];
    this.responseTimes = [];
    
    console.log('📊 Performance Monitor destroyed');
  }
}

// Global instance
export const performanceMonitor = new PerformanceMonitor();
