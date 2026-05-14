/**
 * QVX Node Optimization Orchestrator
 * 
 * Manages all optimization systems for Vera AI Assistant
 */

import { gpuMemoryManager } from './gpuMemoryManager.js';
import { performanceMonitor } from './performanceMonitor.js';
import { INTELLIGENT_CACHES } from './intelligentCache.js';
import { autoScaler } from './autoScaler.js';

export interface OptimizationStatus {
  timestamp: Date;
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  gpuMemory: {
    utilization: number;
    temperature: number;
    fragmentation: number;
    status: string;
  };
  performance: {
    responseTime: number;
    throughput: number;
    errorRate: number;
    cacheHitRate: number;
    status: string;
  };
  scaling: {
    currentAction: string;
    lastDecision: string;
    recommendations: string[];
    status: string;
  };
  alerts: string[];
  optimizations: string[];
}

export class QVXOptimizer {
  private isInitialized = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastOptimizationTime = 0;
  private optimizationHistory: Array<{
    timestamp: Date;
    type: string;
    action: string;
    impact: string;
  }> = [];

  constructor() {
    this.setupEventHandlers();
  }

  /**
   * Initialize all optimization systems
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing QVX Optimization System for Vera AI...');
    
    try {
      // Initialize GPU memory manager
      await gpuMemoryManager.initialize();
      
      // Initialize performance monitor
      await performanceMonitor.initialize();
      
      // Initialize auto-scaler
      await autoScaler.initialize();
      
      // Setup alert handlers
      this.setupAlertHandlers();
      
      // Start continuous optimization
      this.startContinuousOptimization();
      
      this.isInitialized = true;
      console.log('✅ QVX Optimization System fully initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize optimization system:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive optimization status
   */
  async getStatus(): Promise<OptimizationStatus> {
    if (!this.isInitialized) {
      throw new Error('Optimization system not initialized');
    }

    const gpuStats = await gpuMemoryManager.getMemoryStats();
    const perfMetrics = performanceMonitor.getCurrentMetrics();
    const scalingDecision = autoScaler.getCurrentDecision();
    const activeAlerts = performanceMonitor.getActiveAlerts();
    
    // Calculate overall health
    const overallHealth = this.calculateOverallHealth(gpuStats, perfMetrics, scalingDecision);
    
    // Generate alerts
    const alerts = this.generateAlerts(gpuStats, perfMetrics, activeAlerts);
    
    // Generate optimizations
    const optimizations = this.generateOptimizations(gpuStats, perfMetrics, scalingDecision);
    
    return {
      timestamp: new Date(),
      overallHealth,
      gpuMemory: {
        utilization: gpuStats.utilization,
        temperature: gpuStats.temperature,
        fragmentation: gpuStats.fragmentation,
        status: this.getGPUStatus(gpuStats)
      },
      performance: {
        responseTime: perfMetrics.averageResponseTime,
        throughput: perfMetrics.throughput,
        errorRate: perfMetrics.errorRate,
        cacheHitRate: perfMetrics.cacheHitRate,
        status: this.getPerformanceStatus(perfMetrics)
      },
      scaling: {
        currentAction: scalingDecision?.action || 'maintain',
        lastDecision: scalingDecision?.reason || 'No decision',
        recommendations: autoScaler.getRecommendations().immediate,
        status: this.getScalingStatus(scalingDecision)
      },
      alerts,
      optimizations
    };
  }

  /**
   * Manually trigger optimization cycle
   */
  async triggerOptimization(): Promise<{
    optimizations: string[];
    impact: string;
  }> {
    if (!this.isInitialized) {
      throw new Error('Optimization system not initialized');
    }

    const optimizations: string[] = [];
    
    try {
      // GPU memory optimization
      const gpuRecommendations = gpuMemoryManager.getOptimizationRecommendations();
      if (gpuRecommendations.length > 0) {
        optimizations.push(...gpuRecommendations);
      }
      
      // Performance optimization
      const perfRecommendations = performanceMonitor.getPerformanceRecommendations();
      if (perfRecommendations.length > 0) {
        optimizations.push(...perfRecommendations);
      }
      
      // Auto-scaling evaluation
      const scalingDecision = await autoScaler.triggerEvaluation();
      if (scalingDecision.action !== 'maintain') {
        optimizations.push(`Scaling action: ${scalingDecision.action} - ${scalingDecision.reason}`);
      }
      
      // Cache optimization
      for (const [name, cache] of Object.entries(INTELLIGENT_CACHES)) {
        const cacheRecommendations = cache.getOptimizationRecommendations();
        if (cacheRecommendations.length > 0) {
          optimizations.push(`Cache ${name}: ${cacheRecommendations[0]}`);
        }
      }
      
      // Record optimization
      if (optimizations.length > 0) {
        this.recordOptimization('manual', optimizations.join('; '), 'Applied optimizations');
      }
      
      return {
        optimizations,
        impact: optimizations.length > 0 ? `${optimizations.length} optimizations applied` : 'No optimizations needed'
      };
      
    } catch (error) {
      console.error('Optimization failed:', error);
      throw error;
    }
  }

  /**
   * Get optimization history
   */
  getOptimizationHistory(timeRange?: { start: Date; end: Date }): Array<{
    timestamp: Date;
    type: string;
    action: string;
    impact: string;
  }> {
    let history = [...this.optimizationHistory];
    
    if (timeRange) {
      history = history.filter(opt => 
        opt.timestamp >= timeRange.start && opt.timestamp <= timeRange.end
      );
    }
    
    return history;
  }

  /**
   * Enable aggressive optimization mode
   */
  enableAggressiveMode(): void {
    autoScaler.enableAggressiveMode();
    console.log('🚀 Aggressive optimization mode enabled');
  }

  /**
   * Disable aggressive optimization mode
   */
  disableAggressiveMode(): void {
    autoScaler.disableAggressiveMode();
    console.log('🛡️ Conservative optimization mode enabled');
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): {
    summary: string;
    metrics: any;
    trends: any;
    recommendations: string[];
  } {
    return performanceMonitor.generateReport();
  }

  /**
   * Export optimization metrics
   */
  exportMetrics(): {
    timestamp: Date;
    gpuMemory: any;
    performance: any;
    scaling: any;
    caches: Record<string, any>;
    history: any[];
  } {
    return {
      timestamp: new Date(),
      gpuMemory: gpuMemoryManager.exportMetrics(),
      performance: performanceMonitor.getCurrentMetrics(),
      scaling: autoScaler.getCurrentDecision(),
      caches: Object.fromEntries(
        Object.entries(INTELLIGENT_CACHES).map(([name, cache]) => [name, cache.getStats()])
      ),
      history: this.optimizationHistory
    };
  }

  private calculateOverallHealth(
    gpuStats: any,
    perfMetrics: any,
    scalingDecision: any
  ): OptimizationStatus['overallHealth'] {
    let score = 100;
    
    // GPU memory health (30% weight)
    if (gpuStats.utilization > 0.9) score -= 20;
    else if (gpuStats.utilization > 0.8) score -= 10;
    else if (gpuStats.utilization > 0.7) score -= 5;
    
    if (gpuStats.temperature > 85) score -= 15;
    else if (gpuStats.temperature > 80) score -= 5;
    
    // Performance health (40% weight)
    if (perfMetrics.averageResponseTime > 5000) score -= 25;
    else if (perfMetrics.averageResponseTime > 3000) score -= 15;
    else if (perfMetrics.averageResponseTime > 1000) score -= 5;
    
    if (perfMetrics.errorRate > 0.1) score -= 20;
    else if (perfMetrics.errorRate > 0.05) score -= 10;
    else if (perfMetrics.errorRate > 0.01) score -= 5;
    
    if (perfMetrics.cacheHitRate < 0.5) score -= 10;
    else if (perfMetrics.cacheHitRate < 0.7) score -= 5;
    
    // Scaling health (30% weight)
    if (scalingDecision?.action === 'scale_up') score -= 10;
    if (scalingDecision?.action === 'scale_down') score += 5;
    
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';
    return 'critical';
  }

  private getGPUStatus(stats: any): string {
    if (stats.utilization > 0.9 || stats.temperature > 85) return 'critical';
    if (stats.utilization > 0.8 || stats.temperature > 80) return 'warning';
    if (stats.utilization > 0.7) return 'caution';
    return 'healthy';
  }

  private getPerformanceStatus(metrics: any): string {
    if (metrics.averageResponseTime > 5000 || metrics.errorRate > 0.1) return 'critical';
    if (metrics.averageResponseTime > 3000 || metrics.errorRate > 0.05) return 'warning';
    if (metrics.averageResponseTime > 1000) return 'caution';
    return 'healthy';
  }

  private getScalingStatus(decision: any): string {
    if (!decision) return 'idle';
    if (decision.action === 'scale_up') return 'expanding';
    if (decision.action === 'scale_down') return 'contracting';
    if (decision.action === 'optimize') return 'optimizing';
    return 'stable';
  }

  private generateAlerts(gpuStats: any, perfMetrics: any, activeAlerts: any[]): string[] {
    const alerts: string[] = [];
    
    // GPU alerts
    if (gpuStats.utilization > 0.9) {
      alerts.push('🔥 Critical GPU utilization detected');
    }
    
    if (gpuStats.temperature > 85) {
      alerts.push('🌡️ High GPU temperature - thermal throttling likely');
    }
    
    // Performance alerts
    if (perfMetrics.averageResponseTime > 5000) {
      alerts.push('🐌 Critical response times - immediate action required');
    }
    
    if (perfMetrics.errorRate > 0.1) {
      alerts.push('⚠️ High error rate detected');
    }
    
    // Add active alerts from performance monitor
    activeAlerts.forEach(alert => {
      alerts.push(`${alert.type === 'critical' ? '🚨' : '⚠️'} ${alert.message}`);
    });
    
    return alerts;
  }

  private generateOptimizations(gpuStats: any, perfMetrics: any, scalingDecision: any): string[] {
    const optimizations: string[] = [];
    
    // GPU optimizations
    const gpuRecs = gpuMemoryManager.getOptimizationRecommendations();
    optimizations.push(...gpuRecs);
    
    // Performance optimizations
    const perfRecs = performanceMonitor.getPerformanceRecommendations();
    optimizations.push(...perfRecs);
    
    // Scaling optimizations
    const scalingRecs = autoScaler.getRecommendations().immediate;
    optimizations.push(...scalingRecs);
    
    return optimizations.slice(0, 5); // Limit to top 5
  }

  private setupEventHandlers(): void {
    // Handle performance alerts
    performanceMonitor.onAlert((alert) => {
      console.log(`🚨 Performance Alert: ${alert.message}`);
      
      // Trigger automatic optimization for critical alerts
      if (alert.type === 'critical') {
        this.triggerAutomaticOptimization(alert);
      }
    });
  }

  private setupAlertHandlers(): void {
    // Additional alert handlers can be setup here
  }

  private startContinuousOptimization(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performContinuousOptimization();
      } catch (error) {
        console.error('Continuous optimization failed:', error);
      }
    }, 60000); // Run every minute
  }

  private async performContinuousOptimization(): Promise<void> {
    const now = Date.now();
    
    // Don't optimize too frequently
    if (now - this.lastOptimizationTime < 5 * 60 * 1000) {
      return;
    }
    
    const status = await this.getStatus();
    
    // Only optimize if health is not excellent
    if (status.overallHealth !== 'excellent') {
      await this.triggerOptimization();
      this.lastOptimizationTime = now;
    }
  }

  private async triggerAutomaticOptimization(alert: any): Promise<void> {
    console.log(`🔧 Triggering automatic optimization for: ${alert.message}`);
    
    try {
      const result = await this.triggerOptimization();
      this.recordOptimization('automatic', alert.message, result.impact);
    } catch (error) {
      console.error('Automatic optimization failed:', error);
    }
  }

  private recordOptimization(type: string, action: string, impact: string): void {
    this.optimizationHistory.push({
      timestamp: new Date(),
      type,
      action,
      impact
    });
    
    // Keep only last 100 optimizations
    if (this.optimizationHistory.length > 100) {
      this.optimizationHistory = this.optimizationHistory.slice(-100);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    gpuMemoryManager.destroy();
    performanceMonitor.destroy();
    autoScaler.destroy();
    
    // Clear caches
    Object.values(INTELLIGENT_CACHES).forEach(cache => cache.clear());
    
    this.optimizationHistory = [];
    this.isInitialized = false;
    
    console.log('🚀 QVX Optimization System destroyed');
  }
}

// Global instance
export const qvxOptimizer = new QVXOptimizer();
