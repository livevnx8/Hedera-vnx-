/**
 * GPU Layer Optimizer
 *
 * Dynamically optimizes GPU layers for QVX inference based on:
 * - Request complexity (tokens, tools needed)
 * - Memory pressure
 * - Queue depth
 * - Sacred frequency alignment
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';

export interface RequestProfile {
  estimatedTokens: number;
  toolCount: number;
  complexity: 'low' | 'medium' | 'high' | 'critical';
  priority: number;
  requiresReasoning: boolean;
}

export interface GPUConfig {
  layers: number;           // GPU layers (0-40 for 350M model)
  batchSize: number;        // Inference batch size
  contextSize: number;      // Context window size
  maxConcurrency: number;   // Max concurrent requests
  cacheSize: number;        // KV cache size in MB
  compressionEnabled: boolean;
  sacredFrequency: number; // Hz (432, 528, 741)
}

export interface SystemMetrics {
  gpuUtilization: number;
  gpuMemoryUsed: number;
  gpuMemoryTotal: number;
  queueDepth: number;
  activeRequests: number;
  averageLatency: number;
}

export class GPULayerOptimizer extends EventEmitter {
  private currentConfig: GPUConfig;
  private metrics: SystemMetrics;
  private monitoringInterval?: NodeJS.Timeout;
  private readonly minLayers = 20;
  private readonly maxLayers = 35;
  private readonly sacredFrequencies = [432, 528, 741];

  constructor() {
    super();
    this.currentConfig = this.getDefaultConfig();
    this.metrics = {
      gpuUtilization: 0,
      gpuMemoryUsed: 0,
      gpuMemoryTotal: 7600,
      queueDepth: 0,
      activeRequests: 0,
      averageLatency: 0,
    };

    this.startMonitoring();
  }

  private getDefaultConfig(): GPUConfig {
    return {
      layers: 30,
      batchSize: 1,
      contextSize: 2048,
      maxConcurrency: 4,
      cacheSize: 512,
      compressionEnabled: true,
      sacredFrequency: 432,
    };
  }

  /**
   * Optimize GPU configuration for a specific request
   */
  optimizeForRequest(profile: RequestProfile): GPUConfig {
    const baseConfig = { ...this.currentConfig };

    // Adjust layers based on complexity
    switch (profile.complexity) {
      case 'low':
        baseConfig.layers = Math.max(this.minLayers, baseConfig.layers - 5);
        baseConfig.batchSize = 4;
        break;
      case 'medium':
        baseConfig.layers = baseConfig.layers;
        baseConfig.batchSize = 2;
        break;
      case 'high':
        baseConfig.layers = Math.min(this.maxLayers, baseConfig.layers + 3);
        baseConfig.batchSize = 1;
        break;
      case 'critical':
        baseConfig.layers = this.maxLayers;
        baseConfig.batchSize = 1;
        baseConfig.contextSize = 4096;
        break;
    }

    // Adjust for reasoning requirements
    if (profile.requiresReasoning) {
      baseConfig.layers = Math.min(this.maxLayers, baseConfig.layers + 2);
      baseConfig.contextSize = Math.max(baseConfig.contextSize, 3072);
    }

    // Tool-heavy requests need more context
    if (profile.toolCount > 3) {
      baseConfig.contextSize = Math.min(4096, baseConfig.contextSize + 512);
    }

    // Select sacred frequency based on task type
    baseConfig.sacredFrequency = this.selectSacredFrequency(profile);

    return baseConfig;
  }

  /**
   * Select optimal sacred frequency for task alignment
   */
  private selectSacredFrequency(profile: RequestProfile): number {
    // 432 Hz - Foundation/creative tasks
    // 528 Hz - Transformation/complex reasoning
    // 741 Hz - Problem-solving/intuition

    if (profile.requiresReasoning && profile.complexity === 'critical') {
      return 741; // High intuition for complex problems
    }
    if (profile.toolCount > 5 || profile.complexity === 'high') {
      return 528; // Transformation for multi-step tasks
    }
    return 432; // Foundation for standard tasks
  }

  /**
   * Auto-optimize based on current system metrics
   */
  autoOptimize(): GPUConfig {
    const newConfig = { ...this.currentConfig };

    // GPU memory pressure
    const memoryPressure = this.metrics.gpuMemoryUsed / this.metrics.gpuMemoryTotal;

    if (memoryPressure > 0.9) {
      // Critical memory pressure - reduce layers
      newConfig.layers = Math.max(this.minLayers, newConfig.layers - 3);
      newConfig.compressionEnabled = true;
      logger.warn('[GPUOptimizer] Critical memory pressure - reducing layers');
    } else if (memoryPressure > 0.8) {
      // High memory pressure
      newConfig.layers = Math.max(this.minLayers, newConfig.layers - 1);
      newConfig.cacheSize = Math.max(256, newConfig.cacheSize - 64);
    } else if (memoryPressure < 0.5 && this.metrics.queueDepth > 10) {
      // Low memory, high queue - can increase layers
      newConfig.layers = Math.min(this.maxLayers, newConfig.layers + 2);
      newConfig.maxConcurrency = Math.min(8, newConfig.maxConcurrency + 1);
    }

    // Queue depth optimization
    if (this.metrics.queueDepth > 20) {
      newConfig.batchSize = Math.min(8, newConfig.batchSize + 1);
    } else if (this.metrics.queueDepth < 5 && newConfig.batchSize > 1) {
      newConfig.batchSize = Math.max(1, newConfig.batchSize - 1);
    }

    // Latency-based tuning
    if (this.metrics.averageLatency > 5000) {
      // High latency - reduce complexity
      newConfig.layers = Math.max(this.minLayers, newConfig.layers - 2);
      newConfig.contextSize = Math.max(1024, newConfig.contextSize - 512);
    }

    this.currentConfig = newConfig;
    this.emit('optimized', newConfig);

    return newConfig;
  }

  /**
   * Start monitoring system metrics
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.autoOptimize();
    }, 10000); // Every 10 seconds
    this.monitoringInterval.unref?.();
  }

  /**
   * Collect current system metrics
   */
  private collectMetrics(): void {
    // In production, this would query nvidia-smi or GPU metrics endpoint
    // For now, using simulated metrics
    this.emit('metrics', this.metrics);
  }

  /**
   * Update metrics from external source
   */
  updateMetrics(metrics: Partial<SystemMetrics>): void {
    this.metrics = { ...this.metrics, ...metrics };
  }

  /**
   * Get current configuration
   */
  getCurrentConfig(): GPUConfig {
    return { ...this.currentConfig };
  }

  /**
   * Get optimization report
   */
  getOptimizationReport(): object {
    return {
      currentConfig: this.currentConfig,
      metrics: this.metrics,
      efficiency: this.calculateEfficiency(),
      recommendations: this.generateRecommendations(),
    };
  }

  /**
   * Calculate GPU efficiency score
   */
  private calculateEfficiency(): number {
    const memoryEfficiency = this.metrics.gpuMemoryUsed / this.metrics.gpuMemoryTotal;
    const utilizationScore = this.metrics.gpuUtilization / 100;
    const queueScore = Math.min(1, this.metrics.queueDepth / 20);

    return (memoryEfficiency * 0.4 + utilizationScore * 0.4 + queueScore * 0.2) * 100;
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(): string[] {
    const recs: string[] = [];

    if (this.metrics.gpuUtilization < 50) {
      recs.push('GPU underutilized - consider reducing layers to save power');
    }

    if (this.metrics.gpuMemoryUsed / this.metrics.gpuMemoryTotal > 0.85) {
      recs.push('High memory usage - enable aggressive compression');
    }

    if (this.metrics.queueDepth > 15) {
      recs.push('High queue depth - increase batch size or scale horizontally');
    }

    if (this.metrics.averageLatency > 3000) {
      recs.push('High latency - optimize context size or increase GPU layers');
    }

    return recs;
  }

  /**
   * Apply quantum-optimized configuration
   */
  applyQuantumOptimization(): GPUConfig {
    const quantumConfig: GPUConfig = {
      ...this.currentConfig,
      // Quantum-optimized settings
      layers: 35, // Maximum layers for quantum processing
      contextSize: 4096, // Full context for quantum mirrors
      sacredFrequency: 528, // Transformation frequency
      compressionEnabled: false, // Full precision for quantum
    };

    this.currentConfig = quantumConfig;
    logger.info('[GPUOptimizer] Quantum optimization applied');

    return quantumConfig;
  }

  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }
}

// Global optimizer instance
export const gpuLayerOptimizer = new GPULayerOptimizer();
