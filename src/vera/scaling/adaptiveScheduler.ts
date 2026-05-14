/**
 * Vera Adaptive Scheduler
 * Dynamic cycle interval adjustment based on system load and activity
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface AdaptiveSchedulerConfig {
  baseIntervalMs: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  loadFactorThreshold: number;
  anomalyAccelerationFactor: number;
  queueDepthThreshold: number;
  adjustmentSmoothing: number; // 0-1, higher = smoother adjustments
}

export const DEFAULT_SCHEDULER_CONFIG: AdaptiveSchedulerConfig = {
  baseIntervalMs: 180000, // 3 minutes
  minIntervalMs: 30000,   // 30 seconds (during high activity)
  maxIntervalMs: 600000,  // 10 minutes (during low activity)
  loadFactorThreshold: 0.7,
  anomalyAccelerationFactor: 0.5, // Halve interval when anomaly detected
  queueDepthThreshold: 10,
  adjustmentSmoothing: 0.3,
};

export interface SchedulerMetrics {
  currentIntervalMs: number;
  baseIntervalMs: number;
  loadFactor: number;
  anomalyDetected: boolean;
  queueDepth: number;
  lastAdjustmentAt: number;
  totalAdjustments: number;
  rigPressure?: RigPressureMetrics | null;
  lastPlacement?: PlacementDecision | null;
}

export interface RigPressureMetrics {
  cpuUtilization: number;
  memoryUtilization: number;
  diskUtilization: number;
  gpuUtilization: number | null;
  gpuAvailable: boolean;
  health: 'healthy' | 'pressured' | 'critical';
}

export interface PlacementRequest {
  taskId?: string;
  priority?: 'background' | 'normal' | 'high' | 'critical';
  workloadProfile?: 'cpu' | 'memory' | 'io' | 'gpu' | 'balanced';
  requiresGpu?: boolean;
  minMemoryMb?: number;
  latencySensitive?: boolean;
}

export interface PlacementDecision {
  lane: 'cpu' | 'gpu' | 'io' | 'balanced' | 'defer';
  priority: NonNullable<PlacementRequest['priority']>;
  recommendedIntervalMs: number;
  pressureScore: number;
  rigHealth: RigPressureMetrics['health'] | 'unknown';
  reason: string;
}

export class AdaptiveScheduler extends EventEmitter {
  private currentInterval: number;
  private loadFactor = 1.0;
  private anomalyDetected = false;
  private queueDepth = 0;
  private lastAdjustmentAt = Date.now();
  private totalAdjustments = 0;
  private metrics: number[] = []; // Recent load measurements
  private rigPressure: RigPressureMetrics | null = null;
  private lastPlacement: PlacementDecision | null = null;

  constructor(private config: AdaptiveSchedulerConfig = DEFAULT_SCHEDULER_CONFIG) {
    super();
    this.currentInterval = config.baseIntervalMs;
  }

  /**
   * Record a load measurement and adjust interval if needed
   */
  recordLoad(metrics: {
    queueDepth: number;
    anomalyDetected: boolean;
    processingTimeMs?: number;
    successRate?: number;
  }): void {
    this.queueDepth = metrics.queueDepth;
    this.anomalyDetected = metrics.anomalyDetected;

    // Calculate load factor (0-1, higher = more load)
    const queueLoad = Math.min(1, metrics.queueDepth / this.config.queueDepthThreshold);
    const processingLoad = metrics.processingTimeMs 
      ? Math.min(1, metrics.processingTimeMs / this.currentInterval)
      : 0;
    const failureLoad = metrics.successRate !== undefined 
      ? Math.max(0, 1 - metrics.successRate)
      : 0;

    // Weighted combination
    const instantLoad = (queueLoad * 0.5) + (processingLoad * 0.3) + (failureLoad * 0.2);
    
    // Smooth the load factor
    this.loadFactor = this.config.adjustmentSmoothing * instantLoad + 
      (1 - this.config.adjustmentSmoothing) * this.loadFactor;

    // Store metrics history
    this.metrics.push(instantLoad);
    if (this.metrics.length > 10) {
      this.metrics.shift();
    }

    // Adjust interval based on conditions
    this.adjustInterval();
  }

  recordRigPressure(pressure: RigPressureMetrics): void {
    this.rigPressure = pressure;

    const rigLoad = (
      pressure.cpuUtilization * 0.45 +
      pressure.memoryUtilization * 0.35 +
      pressure.diskUtilization * 0.2
    );

    this.loadFactor = this.config.adjustmentSmoothing * rigLoad +
      (1 - this.config.adjustmentSmoothing) * this.loadFactor;

    if (pressure.health === 'critical') {
      this.anomalyDetected = true;
    }

    this.adjustInterval();
    this.emit('rig_pressure', pressure);
  }

  /**
   * Calculate and apply new interval
   */
  private adjustInterval(): void {
    let newInterval = this.currentInterval;

    if (this.anomalyDetected) {
      // Accelerate during anomalies
      newInterval = Math.max(
        this.config.minIntervalMs,
        this.currentInterval * this.config.anomalyAccelerationFactor
      );
      
      logger.info('AdaptiveScheduler', {
        message: 'Accelerating due to anomaly detection',
        previousInterval: this.currentInterval,
        newInterval,
      });
    } else if (this.loadFactor > this.config.loadFactorThreshold) {
      // High load - speed up
      newInterval = Math.max(
        this.config.minIntervalMs,
        this.currentInterval * 0.9
      );
    } else if (this.queueDepth === 0 && this.loadFactor < 0.3) {
      // Low load - slow down to save resources
      newInterval = Math.min(
        this.config.maxIntervalMs,
        this.currentInterval * 1.1
      );
    }

    // Only emit if interval changed significantly (>10%)
    const changePercent = Math.abs(newInterval - this.currentInterval) / this.currentInterval;
    
    if (changePercent > 0.1) {
      const oldInterval = this.currentInterval;
      this.currentInterval = newInterval;
      this.lastAdjustmentAt = Date.now();
      this.totalAdjustments++;

      logger.info('AdaptiveScheduler', {
        message: 'Interval adjusted',
        oldInterval,
        newInterval: this.currentInterval,
        loadFactor: this.loadFactor,
        anomalyDetected: this.anomalyDetected,
        queueDepth: this.queueDepth,
      });

      this.emit('interval_changed', {
        oldInterval,
        newInterval: this.currentInterval,
        loadFactor: this.loadFactor,
      });
    }
  }

  /**
   * Get current interval
   */
  getCurrentInterval(): number {
    return this.currentInterval;
  }

  /**
   * Get current metrics
   */
  getMetrics(): SchedulerMetrics {
    return {
      currentIntervalMs: this.currentInterval,
      baseIntervalMs: this.config.baseIntervalMs,
      loadFactor: this.loadFactor,
      anomalyDetected: this.anomalyDetected,
      queueDepth: this.queueDepth,
      lastAdjustmentAt: this.lastAdjustmentAt,
      totalAdjustments: this.totalAdjustments,
      rigPressure: this.rigPressure,
      lastPlacement: this.lastPlacement,
    };
  }

  recommendPlacement(request: PlacementRequest = {}): PlacementDecision {
    const priority = request.priority ?? 'normal';
    const workloadProfile = request.workloadProfile ?? 'balanced';
    const pressure = this.rigPressure;
    const pressureScore = pressure
      ? (
          pressure.cpuUtilization * 0.4 +
          pressure.memoryUtilization * 0.35 +
          pressure.diskUtilization * 0.15 +
          ((pressure.gpuUtilization ?? 0) * 0.1)
        )
      : this.loadFactor;

    let lane: PlacementDecision['lane'] = workloadProfile === 'io' ? 'io' : 'balanced';
    const reasons: string[] = [];

    if (request.requiresGpu || workloadProfile === 'gpu') {
      if (!pressure?.gpuAvailable) {
        lane = priority === 'critical' ? 'cpu' : 'defer';
        reasons.push('gpu requested but not available');
      } else if ((pressure.gpuUtilization ?? 0) > 0.9 && priority !== 'critical') {
        lane = 'defer';
        reasons.push('gpu currently saturated');
      } else {
        lane = 'gpu';
        reasons.push('gpu lane available');
      }
    } else if (workloadProfile === 'cpu') {
      lane = 'cpu';
      reasons.push('cpu-oriented workload');
    } else if (workloadProfile === 'memory') {
      lane = pressure && pressure.memoryUtilization > 0.85 ? 'defer' : 'balanced';
      reasons.push('memory-sensitive workload');
    }

    if (pressure?.diskUtilization && pressure.diskUtilization > 0.9 && workloadProfile === 'io') {
      lane = priority === 'critical' ? 'io' : 'defer';
      reasons.push('disk pressure is high');
    }

    if (pressure?.cpuUtilization && pressure.cpuUtilization > 0.9 && lane === 'cpu' && priority === 'background') {
      lane = 'defer';
      reasons.push('cpu pressure too high for background work');
    }

    if (request.latencySensitive && lane === 'balanced' && pressureScore < 0.8) {
      lane = 'cpu';
      reasons.push('latency-sensitive request on low-pressure rig');
    }

    const decision: PlacementDecision = {
      lane,
      priority,
      recommendedIntervalMs: lane === 'defer'
        ? Math.min(this.config.maxIntervalMs, Math.round(this.currentInterval * 1.25))
        : this.currentInterval,
      pressureScore: Number(pressureScore.toFixed(3)),
      rigHealth: pressure?.health ?? 'unknown',
      reason: reasons.join('; ') || 'default balanced placement',
    };

    this.lastPlacement = decision;
    this.emit('placement_decided', decision);
    return decision;
  }

  /**
   * Force set interval (for manual override)
   */
  setInterval(intervalMs: number): void {
    const clamped = Math.max(
      this.config.minIntervalMs,
      Math.min(this.config.maxIntervalMs, intervalMs)
    );

    if (clamped !== this.currentInterval) {
      const oldInterval = this.currentInterval;
      this.currentInterval = clamped;
      
      logger.info('AdaptiveScheduler', {
        message: 'Interval manually overridden',
        oldInterval,
        newInterval: this.currentInterval,
      });

      this.emit('interval_changed', {
        oldInterval,
        newInterval: this.currentInterval,
        manual: true,
      });
    }
  }

  /**
   * Reset to base interval
   */
  reset(): void {
    this.currentInterval = this.config.baseIntervalMs;
    this.loadFactor = 1.0;
    this.anomalyDetected = false;
    this.queueDepth = 0;
    this.metrics = [];
    
    logger.info('AdaptiveScheduler', {
      message: 'Scheduler reset to base interval',
      baseInterval: this.config.baseIntervalMs,
    });

    this.emit('reset', { baseInterval: this.config.baseIntervalMs });
  }

  /**
   * Get average load over recent measurements
   */
  getAverageLoad(): number {
    if (this.metrics.length === 0) return 0;
    return this.metrics.reduce((a, b) => a + b, 0) / this.metrics.length;
  }
}

// Factory function
export function createAdaptiveScheduler(
  config?: Partial<AdaptiveSchedulerConfig>
): AdaptiveScheduler {
  return new AdaptiveScheduler({ ...DEFAULT_SCHEDULER_CONFIG, ...config });
}

export const rigAdaptiveScheduler = createAdaptiveScheduler();
