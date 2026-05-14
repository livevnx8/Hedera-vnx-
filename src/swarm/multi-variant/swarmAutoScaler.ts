/**
 * Auto-Scaling System for Multi-Variant Swarm
 * 
 * Automatically adjusts swarm sizes based on:
 * - Load metrics (CPU, memory, task queue depth)
 * - Event rate (for micro swarms)
 * - Latency targets
 * - Health status
 */

import { EventEmitter } from 'events';
import { BaseSwarmAgent, SwarmClass } from './baseSwarmAgent.js';
import { SwarmMonitor, SystemMetrics } from './swarmMonitor.js';
import { logger } from '../../monitoring/logger.js';

export interface ScalingPolicy {
  scaleUpThreshold: number; // Load threshold to trigger scale up (0.0-1.0)
  scaleDownThreshold: number; // Load threshold to trigger scale down
  scaleUpFactor: number; // How many agents to add (multiplier)
  scaleDownFactor: number; // How many agents to remove (multiplier)
  minAgents: number;
  maxAgents: number;
  cooldownMs: number; // Time between scaling operations
  targetLatency: number; // Target latency in ms
}

export interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'maintain';
  swarmClass: SwarmClass;
  currentCount: number;
  targetCount: number;
  reason: string;
  metrics: {
    currentLoad: number;
    averageLatency: number;
    failedRatio: number;
  };
}

export class SwarmAutoScaler extends EventEmitter {
  private monitor: SwarmMonitor;
  private policies: Record<SwarmClass, ScalingPolicy>;
  private lastScalingAction: Record<SwarmClass, number> = {
    micro: 0,
    normal: 0,
    macro: 0
  };
  private scalingInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(monitor: SwarmMonitor) {
    super();
    this.monitor = monitor;
    
    // Default scaling policies
    this.policies = {
      micro: {
        scaleUpThreshold: 0.8,
        scaleDownThreshold: 0.3,
        scaleUpFactor: 1.5,
        scaleDownFactor: 0.7,
        minAgents: 10,
        maxAgents: 200,
        cooldownMs: 10000, // 10 seconds for fast micro scaling
        targetLatency: 100 // 100ms target
      },
      normal: {
        scaleUpThreshold: 0.75,
        scaleDownThreshold: 0.25,
        scaleUpFactor: 1.3,
        scaleDownFactor: 0.8,
        minAgents: 20,
        maxAgents: 1000,
        cooldownMs: 60000, // 1 minute for normal scaling
        targetLatency: 500 // 500ms target
      },
      macro: {
        scaleUpThreshold: 0.7,
        scaleDownThreshold: 0.2,
        scaleUpFactor: 1.2,
        scaleDownFactor: 0.9,
        minAgents: 5,
        maxAgents: 100,
        cooldownMs: 300000, // 5 minutes for slow macro scaling
        targetLatency: 2000 // 2s target
      }
    };
  }

  /**
   * Start auto-scaling
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;

    // Evaluate scaling every 10 seconds
    this.scalingInterval = setInterval(() => {
      this.evaluateScaling();
    }, 10000);

    logger.info('SwarmAutoScaler', { message: 'Auto-scaling started' });
    this.emit('started');
  }

  /**
   * Stop auto-scaling
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.scalingInterval) {
      clearInterval(this.scalingInterval);
      this.scalingInterval = null;
    }

    logger.info('SwarmAutoScaler', { message: 'Auto-scaling stopped' });
    this.emit('stopped');
  }

  /**
   * Evaluate scaling needs for all swarm classes
   */
  private evaluateScaling(): void {
    const metrics = this.monitor.getLatestMetrics();
    if (!metrics) return;

    for (const swarmClass of ['micro', 'normal', 'macro'] as SwarmClass[]) {
      const classMetrics = metrics.byClass[swarmClass];
      if (!classMetrics) continue;

      const decision = this.makeScalingDecision(swarmClass, classMetrics, metrics.timestamp);
      
      if (decision.action !== 'maintain') {
        this.emit('scalingDecision', decision);
        this.executeScaling(decision);
      }
    }
  }

  /**
   * Make scaling decision for a swarm class
   */
  private makeScalingDecision(
    swarmClass: SwarmClass,
    classMetrics: SystemMetrics['byClass'][string],
    timestamp: number
  ): ScalingDecision {
    const policy = this.policies[swarmClass];
    const currentCount = classMetrics.totalAgents;
    
    // Check cooldown
    const timeSinceLastScaling = timestamp - this.lastScalingAction[swarmClass];
    if (timeSinceLastScaling < policy.cooldownMs) {
      return {
        action: 'maintain',
        swarmClass,
        currentCount,
        targetCount: currentCount,
        reason: 'Cooldown period active',
        metrics: {
          currentLoad: classMetrics.averageLoad,
          averageLatency: 0, // Would get from latency metrics
          failedRatio: classMetrics.failedAgents / (currentCount || 1)
        }
      };
    }

    const failedRatio = classMetrics.failedAgents / (currentCount || 1);
    
    // Decision metrics
    const decisionMetrics = {
      currentLoad: classMetrics.averageLoad,
      averageLatency: 0, // Would calculate from actual latency data
      failedRatio
    };

    // Scale up conditions
    if (classMetrics.averageLoad > policy.scaleUpThreshold || 
        failedRatio > 0.3 ||
        classMetrics.healthyAgents < policy.minAgents) {
      
      const targetCount = Math.min(
        Math.floor(currentCount * policy.scaleUpFactor),
        policy.maxAgents
      );

      return {
        action: 'scale_up',
        swarmClass,
        currentCount,
        targetCount,
        reason: `High load (${(classMetrics.averageLoad * 100).toFixed(1)}%) or failures (${(failedRatio * 100).toFixed(1)}%)`,
        metrics: decisionMetrics
      };
    }

    // Scale down conditions
    if (classMetrics.averageLoad < policy.scaleDownThreshold && 
        currentCount > policy.minAgents &&
        failedRatio < 0.1) {
      
      const targetCount = Math.max(
        Math.floor(currentCount * policy.scaleDownFactor),
        policy.minAgents
      );

      return {
        action: 'scale_down',
        swarmClass,
        currentCount,
        targetCount,
        reason: `Low load (${(classMetrics.averageLoad * 100).toFixed(1)}%)`,
        metrics: decisionMetrics
      };
    }

    // Maintain current
    return {
      action: 'maintain',
      swarmClass,
      currentCount,
      targetCount: currentCount,
      reason: 'Within optimal range',
      metrics: decisionMetrics
    };
  }

  /**
   * Execute scaling decision
   */
  private executeScaling(decision: ScalingDecision): void {
    const { action, swarmClass, currentCount, targetCount } = decision;
    const delta = targetCount - currentCount;

    logger.info('SwarmAutoScaler', {
      action,
      swarmClass,
      currentCount,
      targetCount,
      delta,
      reason: decision.reason,
      message: `Executing scaling: ${action}`
    });

    this.lastScalingAction[swarmClass] = Date.now();

    if (action === 'scale_up') {
      this.emit('scaleUp', {
        swarmClass,
        count: delta,
        reason: decision.reason
      });
    } else if (action === 'scale_down') {
      this.emit('scaleDown', {
        swarmClass,
        count: Math.abs(delta),
        reason: decision.reason
      });
    }
  }

  /**
   * Update scaling policy
   */
  updatePolicy(swarmClass: SwarmClass, policy: Partial<ScalingPolicy>): void {
    this.policies[swarmClass] = {
      ...this.policies[swarmClass],
      ...policy
    };

    logger.info('SwarmAutoScaler', {
      swarmClass,
      policy: this.policies[swarmClass],
      message: 'Scaling policy updated'
    });
  }

  /**
   * Get current policies
   */
  getPolicies(): Record<SwarmClass, ScalingPolicy> {
    return { ...this.policies };
  }

  /**
   * Get scaling statistics
   */
  getStats(): {
    isRunning: boolean;
    lastScalingActions: Record<SwarmClass, number>;
    policies: Record<SwarmClass, ScalingPolicy>;
  } {
    return {
      isRunning: this.isRunning,
      lastScalingActions: { ...this.lastScalingAction },
      policies: this.getPolicies()
    };
  }

  /**
   * Force scale up (manual override)
   */
  forceScaleUp(swarmClass: SwarmClass, count: number): void {
    this.emit('scaleUp', {
      swarmClass,
      count,
      reason: 'Manual override'
    });

    this.lastScalingAction[swarmClass] = Date.now();
  }

  /**
   * Force scale down (manual override)
   */
  forceScaleDown(swarmClass: SwarmClass, count: number): void {
    this.emit('scaleDown', {
      swarmClass,
      count,
      reason: 'Manual override'
    });

    this.lastScalingAction[swarmClass] = Date.now();
  }

  /**
   * Print auto-scaler status
   */
  printStatus(): void {
    const stats = this.getStats();

    console.log('\n📈 Auto-Scaler Status');
    console.log('=====================\n');
    console.log(`Running: ${stats.isRunning ? '✅' : '❌'}`);
    
    console.log('\nPolicies:');
    for (const [swarmClass, policy] of Object.entries(stats.policies)) {
      console.log(`  ${swarmClass.toUpperCase()}:`);
      console.log(`    Scale up at: ${(policy.scaleUpThreshold * 100).toFixed(0)}% load`);
      console.log(`    Scale down at: ${(policy.scaleDownThreshold * 100).toFixed(0)}% load`);
      console.log(`    Range: ${policy.minAgents}-${policy.maxAgents} agents`);
      console.log(`    Cooldown: ${policy.cooldownMs / 1000}s`);
    }

    console.log('\nLast Actions:');
    for (const [swarmClass, timestamp] of Object.entries(stats.lastScalingActions)) {
      const ago = timestamp > 0 ? `${Math.round((Date.now() - timestamp) / 1000)}s ago` : 'never';
      console.log(`  ${swarmClass.toUpperCase()}: ${ago}`);
    }

    console.log('\n=====================\n');
  }
}
