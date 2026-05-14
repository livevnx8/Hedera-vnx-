/**
 * Auto-Scaling System for QVX Node
 * 
 * Dynamically optimizes resources for Vera AI Assistant
 * Enhanced with quantum-aware scaling for parallel mirrors and echo nodes
 */

export interface ScalingMetrics {
  timestamp: Date;
  cpuUtilization: number;
  gpuUtilization: number;
  memoryUtilization: number;
  requestQueue: number;
  averageResponseTime: number;
  errorRate: number;
  activeConnections: number;
  throughput: number;
  // Quantum-specific metrics
  quantumParallelUtilization: number;
  echoNodeEfficiency: number;
  quantumLatency: number;
  qvxThroughput: number;
  sacredResonance: number;
}

export interface ScalingDecision {
  timestamp: Date;
  action: 'scale_up' | 'scale_down' | 'optimize' | 'maintain' | 'quantum_boost' | 'quantum_reduce';
  reason: string;
  confidence: number;
  targetConfiguration: {
    gpuLayers: number;
    batchSize: number;
    contextSize: number;
    maxConcurrency: number;
    cacheSize: number;
    compressionEnabled: boolean;
    // Quantum configuration
    parallelMirrorStreams: number;
    echoNodeAmplification: number;
    sacredFrequencyOptimization: boolean;
    quantumCacheSize: number;
  };
  estimatedImpact: {
    responseTimeImprovement: number;
    throughputIncrease: number;
    resourceSavings: number;
    quantumEnhancement: number;
  };
}

export interface ScalingPolicy {
  scaleUpThreshold: {
    responseTime: number;
    errorRate: number;
    queueLength: number;
    gpuUtilization: number;
  };
  scaleDownThreshold: {
    responseTime: number;
    errorRate: number;
    gpuUtilization: number;
    activeConnections: number;
  };
  cooldownPeriod: number;
  maxScaleUpSteps: number;
  maxScaleDownSteps: number;
  aggressiveMode: boolean;
}

export class AutoScaler {
  private metrics: ScalingMetrics[] = [];
  private scalingHistory: ScalingDecision[] = [];
  private lastScaleTime: number = 0;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private currentConfiguration = {
    gpuLayers: -1,
    batchSize: 4,
    contextSize: 4096,
    maxConcurrency: 100,
    cacheSize: 256,
    compressionEnabled: false,
    // Quantum configuration
    parallelMirrorStreams: 18,
    echoNodeAmplification: 1.8,
    sacredFrequencyOptimization: true,
    quantumCacheSize: 5000
  };
  
  private policy: ScalingPolicy = {
    scaleUpThreshold: {
      responseTime: 3000,
      errorRate: 0.05,
      queueLength: 20,
      gpuUtilization: 0.85
    },
    scaleDownThreshold: {
      responseTime: 1000,
      errorRate: 0.01,
      gpuUtilization: 0.5,
      activeConnections: 10
    },
    cooldownPeriod: 5 * 60 * 1000, // 5 minutes
    maxScaleUpSteps: 3,
    maxScaleDownSteps: 2,
    aggressiveMode: false
  };

  constructor(policy?: Partial<ScalingPolicy>) {
    if (policy) {
      this.policy = { ...this.policy, ...policy };
    }
  }

  /**
   * Initialize auto-scaling
   */
  async initialize(): Promise<void> {
    this.startMonitoring();
    console.log('🚀 Auto-Scaler initialized for Vera AI');
  }

  /**
   * Record metrics for scaling decisions
   */
  recordMetrics(metrics: Partial<ScalingMetrics>): void {
    const fullMetrics: ScalingMetrics = {
      timestamp: new Date(),
      cpuUtilization: metrics.cpuUtilization || 0,
      gpuUtilization: metrics.gpuUtilization || 0,
      memoryUtilization: metrics.memoryUtilization || 0,
      requestQueue: metrics.requestQueue || 0,
      averageResponseTime: metrics.averageResponseTime || 0,
      errorRate: metrics.errorRate || 0,
      activeConnections: metrics.activeConnections || 0,
      throughput: metrics.throughput || 0,
      // Quantum-specific metrics
      quantumParallelUtilization: metrics.quantumParallelUtilization || 0,
      echoNodeEfficiency: metrics.echoNodeEfficiency || 0,
      quantumLatency: metrics.quantumLatency || 0,
      qvxThroughput: metrics.qvxThroughput || 0,
      sacredResonance: metrics.sacredResonance || 0
    };
    
    this.metrics.push(fullMetrics);
    
    // Keep only last 100 metrics
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }
    
    // Trigger scaling evaluation
    this.evaluateScaling();
  }

  /**
   * Get current scaling decision
   */
  getCurrentDecision(): ScalingDecision | null {
    return this.scalingHistory.length > 0 ? 
           this.scalingHistory[this.scalingHistory.length - 1] : null;
  }

  /**
   * Get scaling history
   */
  getScalingHistory(timeRange?: { start: Date; end: Date }): ScalingDecision[] {
    let history = [...this.scalingHistory];
    
    if (timeRange) {
      history = history.filter(decision => 
        decision.timestamp >= timeRange.start && decision.timestamp <= timeRange.end
      );
    }
    
    return history;
  }

  /**
   * Manually trigger scaling evaluation
   */
  async triggerEvaluation(): Promise<ScalingDecision> {
    return this.evaluateScaling();
  }

  /**
   * Get scaling recommendations
   */
  getRecommendations(): {
    immediate: string[];
    proactive: string[];
    longTerm: string[];
  } {
    const currentMetrics = this.metrics[this.metrics.length - 1];
    if (!currentMetrics) {
      return { immediate: [], proactive: [], longTerm: [] };
    }
    
    const immediate: string[] = [];
    const proactive: string[] = [];
    const longTerm: string[] = [];
    
    // Immediate recommendations
    if (currentMetrics.averageResponseTime > this.policy.scaleUpThreshold.responseTime) {
      immediate.push('🚨 Scale up immediately - response times are critical');
      immediate.push('🔧 Increase GPU layers and batch size');
    }
    
    if (currentMetrics.gpuUtilization > this.policy.scaleUpThreshold.gpuUtilization) {
      immediate.push('🔥 High GPU utilization - enable compression');
      immediate.push('📊 Reduce context size to free memory');
    }
    
    if (currentMetrics.errorRate > this.policy.scaleUpThreshold.errorRate) {
      immediate.push('⚠️ High error rate - check system health');
      immediate.push('🔍 Review error patterns and optimize');
    }
    
    // Proactive recommendations
    if (currentMetrics.throughput < 10) {
      proactive.push('📈 Low throughput - optimize request processing');
      proactive.push('⚡ Consider request batching and pipelining');
    }
    
    if (currentMetrics.memoryUtilization > 0.7) {
      proactive.push('💾 High memory usage - implement smarter caching');
      proactive.push('🗑️ Optimize cache eviction policies');
    }
    
    // Long-term recommendations
    if (this.scalingHistory.filter(d => d.action === 'scale_up').length > 5) {
      longTerm.push('🏗️ Consider horizontal scaling with multiple nodes');
      longTerm.push('🔄 Implement load balancing architecture');
    }
    
    if (currentMetrics.activeConnections > 50) {
      longTerm.push('🌐 High connection count - implement connection pooling');
      longTerm.push('📊 Consider CDN for static content');
    }
    
    return { immediate, proactive, longTerm };
  }

  /**
   * Update scaling policy
   */
  updatePolicy(newPolicy: Partial<ScalingPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
    console.log('📝 Scaling policy updated');
  }

  /**
   * Enable aggressive scaling mode
   */
  enableAggressiveMode(): void {
    this.policy.aggressiveMode = true;
    this.policy.scaleUpThreshold.responseTime *= 0.7;
    this.policy.scaleUpThreshold.gpuUtilization *= 0.8;
    this.policy.cooldownPeriod *= 0.5;
    
    console.log('🚀 Aggressive scaling mode enabled');
  }

  /**
   * Disable aggressive scaling mode
   */
  disableAggressiveMode(): void {
    this.policy.aggressiveMode = false;
    this.policy.scaleUpThreshold.responseTime /= 0.7;
    this.policy.scaleUpThreshold.gpuUtilization /= 0.8;
    this.policy.cooldownPeriod /= 0.5;
    
    console.log('🛡️ Conservative scaling mode enabled');
  }

  private evaluateScaling(): ScalingDecision {
    const now = Date.now();
    
    // Check cooldown period
    if (now - this.lastScaleTime < this.policy.cooldownPeriod) {
      return this.createMaintainDecision('In cooldown period');
    }
    
    const currentMetrics = this.metrics[this.metrics.length - 1];
    if (!currentMetrics) {
      return this.createMaintainDecision('No metrics available');
    }
    
    // Check scale up conditions
    const scaleUpReasons = this.checkScaleUpConditions(currentMetrics);
    if (scaleUpReasons.length > 0) {
      const decision = this.createScaleUpDecision(scaleUpReasons);
      this.applyScalingDecision(decision);
      return decision;
    }
    
    // Check scale down conditions
    const scaleDownReasons = this.checkScaleDownConditions(currentMetrics);
    if (scaleDownReasons.length > 0) {
      const decision = this.createScaleDownDecision(scaleDownReasons);
      this.applyScalingDecision(decision);
      return decision;
    }
    
    // Check for optimization opportunities
    const optimizationReasons = this.checkOptimizationConditions(currentMetrics);
    if (optimizationReasons.length > 0) {
      const decision = this.createOptimizationDecision(optimizationReasons);
      this.applyScalingDecision(decision);
      return decision;
    }
    
    return this.createMaintainDecision('All metrics within normal range');
  }

  private checkScaleUpConditions(metrics: ScalingMetrics): string[] {
    const reasons: string[] = [];
    
    if (metrics.averageResponseTime > this.policy.scaleUpThreshold.responseTime) {
      reasons.push(`High response time: ${metrics.averageResponseTime}ms > ${this.policy.scaleUpThreshold.responseTime}ms`);
    }
    
    if (metrics.errorRate > this.policy.scaleUpThreshold.errorRate) {
      reasons.push(`High error rate: ${(metrics.errorRate * 100).toFixed(2)}% > ${(this.policy.scaleUpThreshold.errorRate * 100).toFixed(2)}%`);
    }
    
    if (metrics.requestQueue > this.policy.scaleUpThreshold.queueLength) {
      reasons.push(`Long request queue: ${metrics.requestQueue} > ${this.policy.scaleUpThreshold.queueLength}`);
    }
    
    if (metrics.gpuUtilization > this.policy.scaleUpThreshold.gpuUtilization) {
      reasons.push(`High GPU utilization: ${(metrics.gpuUtilization * 100).toFixed(1)}% > ${(this.policy.scaleUpThreshold.gpuUtilization * 100).toFixed(1)}%`);
    }
    
    return reasons;
  }

  private checkScaleDownConditions(metrics: ScalingMetrics): string[] {
    const reasons: string[] = [];
    
    if (metrics.averageResponseTime < this.policy.scaleDownThreshold.responseTime &&
        metrics.gpuUtilization < this.policy.scaleDownThreshold.gpuUtilization &&
        metrics.activeConnections < this.policy.scaleDownThreshold.activeConnections) {
      reasons.push('Low load - resources can be optimized');
    }
    
    if (metrics.gpuUtilization < this.policy.scaleDownThreshold.gpuUtilization * 0.5) {
      reasons.push(`Very low GPU utilization: ${(metrics.gpuUtilization * 100).toFixed(1)}%`);
    }
    
    return reasons;
  }

  private checkOptimizationConditions(metrics: ScalingMetrics): string[] {
    const reasons: string[] = [];
    
    if (metrics.throughput < 15 && metrics.gpuUtilization < 0.7) {
      reasons.push('Can optimize for better throughput');
    }
    
    if (metrics.memoryUtilization > 0.8 && !this.currentConfiguration.compressionEnabled) {
      reasons.push('High memory usage - compression recommended');
    }
    
    return reasons;
  }

  private createScaleUpDecision(reasons: string[]): ScalingDecision {
    const targetConfig = this.calculateScaleUpConfiguration();
    
    return {
      timestamp: new Date(),
      action: 'scale_up',
      reason: reasons.join('; '),
      confidence: this.calculateConfidence(reasons.length),
      targetConfiguration: targetConfig,
      estimatedImpact: this.estimateScaleUpImpact(targetConfig)
    };
  }

  private createScaleDownDecision(reasons: string[]): ScalingDecision {
    const targetConfig = this.calculateScaleDownConfiguration();
    
    return {
      timestamp: new Date(),
      action: 'scale_down',
      reason: reasons.join('; '),
      confidence: this.calculateConfidence(reasons.length),
      targetConfiguration: targetConfig,
      estimatedImpact: this.estimateScaleDownImpact(targetConfig)
    };
  }

  private createOptimizationDecision(reasons: string[]): ScalingDecision {
    const targetConfig = this.calculateOptimizationConfiguration();
    
    return {
      timestamp: new Date(),
      action: 'optimize',
      reason: reasons.join('; '),
      confidence: this.calculateConfidence(reasons.length),
      targetConfiguration: targetConfig,
      estimatedImpact: this.estimateOptimizationImpact(targetConfig)
    };
  }

  private createMaintainDecision(reason: string): ScalingDecision {
    return {
      timestamp: new Date(),
      action: 'maintain',
      reason,
      confidence: 0.9,
      targetConfiguration: { ...this.currentConfiguration },
      estimatedImpact: {
        responseTimeImprovement: 0,
        throughputIncrease: 0,
        resourceSavings: 0,
        quantumEnhancement: 0
      }
    };
  }

  private calculateScaleUpConfiguration(): ScalingDecision['targetConfiguration'] {
    const config = { ...this.currentConfiguration };
    
    // Increase GPU layers if possible
    if (config.gpuLayers > -10) {
      config.gpuLayers = Math.max(-1, config.gpuLayers + 2);
    }
    
    // Increase batch size
    config.batchSize = Math.min(8, config.batchSize + 1);
    
    // Increase context size
    config.contextSize = Math.min(8192, config.contextSize + 512);
    
    // Increase max concurrency
    config.maxConcurrency = Math.min(200, config.maxConcurrency + 20);
    
    // Increase cache size
    config.cacheSize = Math.min(512, config.cacheSize + 64);
    
    return config;
  }

  private calculateScaleDownConfiguration(): ScalingDecision['targetConfiguration'] {
    const config = { ...this.currentConfiguration };
    
    // Reduce GPU layers
    if (config.gpuLayers < -1) {
      config.gpuLayers = Math.max(-20, config.gpuLayers - 2);
    }
    
    // Reduce batch size
    config.batchSize = Math.max(1, config.batchSize - 1);
    
    // Reduce context size
    config.contextSize = Math.max(2048, config.contextSize - 256);
    
    // Reduce max concurrency
    config.maxConcurrency = Math.max(50, config.maxConcurrency - 10);
    
    // Reduce cache size
    config.cacheSize = Math.max(128, config.cacheSize - 32);
    
    return config;
  }

  private calculateOptimizationConfiguration(): ScalingDecision['targetConfiguration'] {
    const config = { ...this.currentConfiguration };
    
    // Enable compression if memory is high
    const currentMetrics = this.metrics[this.metrics.length - 1];
    if (currentMetrics && currentMetrics.memoryUtilization > 0.7) {
      config.compressionEnabled = true;
    }
    
    // Optimize batch size based on throughput
    if (currentMetrics && currentMetrics.throughput < 10) {
      config.batchSize = Math.min(6, config.batchSize + 1);
    }
    
    return config;
  }

  private calculateConfidence(reasonCount: number): number {
    return Math.min(1.0, reasonCount * 0.3);
  }

  private estimateScaleUpImpact(config: ScalingDecision['targetConfiguration']): ScalingDecision['estimatedImpact'] {
    const responseTimeImprovement = this.currentConfiguration.batchSize < config.batchSize ? 15 : 10;
    const throughputIncrease = this.currentConfiguration.maxConcurrency < config.maxConcurrency ? 25 : 15;
    const resourceSavings = -20; // Scale up uses more resources
    const quantumEnhancement = config.parallelMirrorStreams > this.currentConfiguration.parallelMirrorStreams ? 30 : 20;
    
    return {
      responseTimeImprovement,
      throughputIncrease,
      resourceSavings,
      quantumEnhancement
    };
  }

  private estimateScaleDownImpact(config: ScalingDecision['targetConfiguration']): ScalingDecision['estimatedImpact'] {
    const responseTimeImprovement = -5; // Slightly slower
    const throughputIncrease = -10; // Slightly lower throughput
    const resourceSavings = 30; // Significant resource savings
    const quantumEnhancement = config.parallelMirrorStreams < this.currentConfiguration.parallelMirrorStreams ? -10 : -5;
    
    return {
      responseTimeImprovement,
      throughputIncrease,
      resourceSavings,
      quantumEnhancement
    };
  }

  private estimateOptimizationImpact(config: ScalingDecision['targetConfiguration']): ScalingDecision['estimatedImpact'] {
    const responseTimeImprovement = config.compressionEnabled ? 5 : 8;
    const throughputIncrease = 10;
    const resourceSavings = config.compressionEnabled ? 15 : 5;
    const quantumEnhancement = config.sacredFrequencyOptimization ? 25 : 15;
    
    return {
      responseTimeImprovement,
      throughputIncrease,
      resourceSavings,
      quantumEnhancement
    };
  }

  private applyScalingDecision(decision: ScalingDecision): void {
    this.currentConfiguration = decision.targetConfiguration;
    this.lastScaleTime = Date.now();
    this.scalingHistory.push({
      ...decision,
      timestamp: new Date()
    });
    
    // Keep only last 50 decisions
    if (this.scalingHistory.length > 50) {
      this.scalingHistory = this.scalingHistory.slice(-50);
    }
    
    console.log(`🔧 Scaling decision: ${decision.action} - ${decision.reason}`);
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      if (this.metrics.length > 0) {
        this.evaluateScaling();
      }
    }, 30000); // Evaluate every 30 seconds
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
    this.scalingHistory = [];
    
    console.log('🚀 Auto-Scaler destroyed');
  }
}

// Global instance
export const autoScaler = new AutoScaler();
