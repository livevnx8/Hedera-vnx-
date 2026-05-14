/**
 * Vera Auto-Scaling Service - Week 3 Implementation
 * Monitors and automatically scales the lattice infrastructure
 */

import { EventEmitter } from 'events';
import { TopicCreateTransaction, Client, PrivateKey } from '@hashgraph/sdk';
import { hederaMaster } from '../hedera/hederaMasterClass.js';
import dotenv from 'dotenv';

dotenv.config();

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

export interface ScalingThresholds {
  maxQueueDepth: number;      // Max messages waiting before scaling
  maxLatencyMs: number;       // Max submission time before scaling
  minUtilization: number;     // Min usage before scaling down
  maxTopics: number;          // Hard cap on topics
  scaleUpCooldownMs: number;  // Time between scale-up actions
  scaleDownCooldownMs: number; // Time between scale-down actions
}

export interface TopicMetrics {
  topicId: string;
  queueDepth: number;
  averageLatency: number;
  messagesPerHour: number;
  lastSubmissionTime: number;
  errorRate: number;
}

export interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'maintain';
  reason: string;
  urgency: 'low' | 'medium' | 'high';
  newTopicCount?: number;
  affectedTopics?: string[];
}

export class VeraAutoScaler extends EventEmitter {
  private client: Client;
  private thresholds: ScalingThresholds;
  private metrics: Map<string, TopicMetrics> = new Map();
  private topicIds: string[] = [];
  private lastScaleUp: number = 0;
  private lastScaleDown: number = 0;
  private totalTopicsCreated: number = 0;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(thresholds?: Partial<ScalingThresholds>) {
    super();
    this.client = this.initializeClient();
    this.thresholds = {
      maxQueueDepth: 50,
      maxLatencyMs: 5000,
      minUtilization: 0.2,
      maxTopics: 20,
      scaleUpCooldownMs: 60000,    // 1 minute
      scaleDownCooldownMs: 300000,  // 5 minutes
      ...thresholds
    };
  }

  private initializeClient(): Client {
    const client = Client.forMainnet();
    let privateKey;

    if (privateKeyStr) {
      if (privateKeyStr.length === 64) {
        try { privateKey = PrivateKey.fromStringECDSA(privateKeyStr); }
        catch { privateKey = PrivateKey.fromStringED25519(privateKeyStr); }
      } else {
        privateKey = PrivateKey.fromString(privateKeyStr);
      }
      client.setOperator(accountId!, privateKey);
    }

    return client;
  }

  /**
   * Register existing topics for monitoring
   */
  registerTopics(topicIds: string[]): void {
    this.topicIds = topicIds;
    for (const id of topicIds) {
      this.metrics.set(id, {
        topicId: id,
        queueDepth: 0,
        averageLatency: 0,
        messagesPerHour: 0,
        lastSubmissionTime: Date.now(),
        errorRate: 0
      });
    }
    console.log(`✅ Auto-scaler registered ${topicIds.length} topics`);
  }

  /**
   * Start monitoring and auto-scaling
   */
  start(): void {
    console.log('🚀 Auto-scaler started');
    console.log(`   Thresholds: Queue ${this.thresholds.maxQueueDepth}, Latency ${this.thresholds.maxLatencyMs}ms`);
    console.log(`   Max topics: ${this.thresholds.maxTopics}`);

    // Monitor every 10 seconds
    this.monitoringInterval = setInterval(() => {
      this.evaluateAndScale();
    }, 10000);

    this.emit('started', { thresholds: this.thresholds });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('🛑 Auto-scaler stopped');
    this.emit('stopped');
  }

  /**
   * Evaluate metrics and make scaling decisions
   */
  private async evaluateAndScale(): Promise<void> {
    const now = Date.now();
    const metrics = Array.from(this.metrics.values());

    if (metrics.length === 0) return;

    // Calculate aggregate metrics
    const avgQueueDepth = metrics.reduce((sum, m) => sum + m.queueDepth, 0) / metrics.length;
    const maxQueueDepth = Math.max(...metrics.map(m => m.queueDepth));
    const avgLatency = metrics.reduce((sum, m) => sum + m.averageLatency, 0) / metrics.length;

    // Check if we should scale up
    if (this.shouldScaleUp(avgQueueDepth, maxQueueDepth, avgLatency, now)) {
      const decision: ScalingDecision = {
        action: 'scale_up',
        reason: `Queue depth ${avgQueueDepth.toFixed(1)} > threshold ${this.thresholds.maxQueueDepth}`,
        urgency: maxQueueDepth > this.thresholds.maxQueueDepth * 2 ? 'high' : 'medium',
        newTopicCount: this.topicIds.length + 1
      };

      this.emit('scaling_decision', decision);
      await this.executeScaleUp();
    }

    // Check if we should scale down
    if (this.shouldScaleDown(avgQueueDepth, avgLatency, now)) {
      const decision: ScalingDecision = {
        action: 'scale_down',
        reason: `Low utilization: ${avgQueueDepth.toFixed(1)} < ${this.thresholds.maxQueueDepth * this.thresholds.minUtilization}`,
        urgency: 'low',
        newTopicCount: Math.max(1, this.topicIds.length - 1)
      };

      this.emit('scaling_decision', decision);
      await this.executeScaleDown();
    }

    // Emit metrics update
    this.emit('metrics_update', {
      timestamp: now,
      topicCount: this.topicIds.length,
      avgQueueDepth,
      maxQueueDepth,
      avgLatency,
      metrics: metrics.map(m => ({ topicId: m.topicId, queueDepth: m.queueDepth, latency: m.averageLatency }))
    });
  }

  private shouldScaleUp(avgQueue: number, maxQueue: number, avgLatency: number, now: number): boolean {
    // Check cooldown
    if (now - this.lastScaleUp < this.thresholds.scaleUpCooldownMs) return false;

    // Check hard cap
    if (this.topicIds.length >= this.thresholds.maxTopics) return false;

    // Scale if queue or latency exceeds thresholds
    return avgQueue > this.thresholds.maxQueueDepth || avgLatency > this.thresholds.maxLatencyMs;
  }

  private shouldScaleDown(avgQueue: number, avgLatency: number, now: number): boolean {
    // Check cooldown
    if (now - this.lastScaleDown < this.thresholds.scaleDownCooldownMs) return false;

    // Don't scale below minimum
    if (this.topicIds.length <= 1) return false;

    // Scale down if underutilized
    const utilizationThreshold = this.thresholds.maxQueueDepth * this.thresholds.minUtilization;
    return avgQueue < utilizationThreshold && avgLatency < this.thresholds.maxLatencyMs * 0.5;
  }

  /**
   * Execute scale up by creating new topic
   */
  private async executeScaleUp(): Promise<string | null> {
    console.log(`📈 Scaling up: Creating new topic (${this.topicIds.length + 1}/${this.thresholds.maxTopics})`);

    try {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo(`Vera Auto-Scaled Topic #${this.topicIds.length + 1}`)
        .execute(this.client);

      const receipt = await tx.getReceipt(this.client);
      const newTopicId = receipt.topicId?.toString();

      if (newTopicId) {
        this.topicIds.push(newTopicId);
        this.metrics.set(newTopicId, {
          topicId: newTopicId,
          queueDepth: 0,
          averageLatency: 0,
          messagesPerHour: 0,
          lastSubmissionTime: Date.now(),
          errorRate: 0
        });

        this.totalTopicsCreated++;
        this.lastScaleUp = Date.now();

        // Log to coordination topic
        await this.logScalingEvent('scale_up', { newTopicId, totalTopics: this.topicIds.length });

        console.log(`✅ Created: ${newTopicId}`);
        this.emit('scaled_up', { topicId: newTopicId, totalTopics: this.topicIds.length });

        return newTopicId;
      }
    } catch (error) {
      console.error('❌ Scale up failed:', error);
      this.emit('scale_error', { action: 'scale_up', error });
    }

    return null;
  }

  /**
   * Execute scale down by removing least utilized topic
   */
  private async executeScaleDown(): Promise<string | null> {
    console.log(`📉 Scaling down: Removing least utilized topic`);

    // Find least utilized topic
    const metrics = Array.from(this.metrics.values());
    metrics.sort((a, b) => a.queueDepth - b.queueDepth);

    const victim = metrics[0];
    if (!victim || victim.topicId === this.topicIds[0]) {
      console.log('⚠️ No suitable topic for scale down');
      return null;
    }

    // Remove from tracking (topic remains on Hedera for audit)
    this.topicIds = this.topicIds.filter(id => id !== victim.topicId);
    this.metrics.delete(victim.topicId);
    this.lastScaleDown = Date.now();

    // Log to coordination topic
    await this.logScalingEvent('scale_down', { removedTopicId: victim.topicId, totalTopics: this.topicIds.length });

    console.log(`✅ Removed: ${victim.topicId} (had ${victim.queueDepth} queued)`);
    this.emit('scaled_down', { topicId: victim.topicId, totalTopics: this.topicIds.length });

    return victim.topicId;
  }

  /**
   * Update metrics for a topic (called after submission)
   */
  updateMetrics(topicId: string, submissionTime: number, success: boolean): void {
    const metric = this.metrics.get(topicId);
    if (!metric) return;

    const now = Date.now();
    const latency = now - submissionTime;

    // Update rolling average (exponential moving average)
    metric.averageLatency = metric.averageLatency * 0.7 + latency * 0.3;
    metric.lastSubmissionTime = now;

    if (success) {
      metric.errorRate = metric.errorRate * 0.9;  // Decay error rate
      metric.messagesPerHour++;
    } else {
      metric.errorRate = metric.errorRate * 0.9 + 0.1;  // Increase error rate
    }

    // Simulate queue depth changes
    metric.queueDepth = Math.max(0, metric.queueDepth + (Math.random() - 0.5) * 10);

    this.metrics.set(topicId, metric);
  }

  /**
   * Log scaling event to coordination topic
   */
  private async logScalingEvent(type: string, data: unknown): Promise<void> {
    try {
      const coordinationTopic = this.topicIds[0] || '0.0.10409351';
      await hederaMaster.submitMessage(coordinationTopic, {
        type: 'auto_scaling_event',
        event: type,
        timestamp: Date.now(),
        data,
        metrics: this.getSummary()
      }, {
        maxChunkSize: 4096 // HIP-993 max
      });
    } catch (error) {
      console.debug('Failed to log scaling event:', error);
    }
  }

  /**
   * Get auto-scaler statistics
   */
  getSummary(): any {
    return {
      activeTopics: this.topicIds.length,
      totalTopicsCreated: this.totalTopicsCreated,
      thresholds: this.thresholds,
      lastScaleUp: this.lastScaleUp,
      lastScaleDown: this.lastScaleDown,
      averageMetrics: {
        queueDepth: Array.from(this.metrics.values()).reduce((sum, m) => sum + m.queueDepth, 0) / Math.max(1, this.metrics.size),
        latency: Array.from(this.metrics.values()).reduce((sum, m) => sum + m.averageLatency, 0) / Math.max(1, this.metrics.size),
        errorRate: Array.from(this.metrics.values()).reduce((sum, m) => sum + m.errorRate, 0) / Math.max(1, this.metrics.size)
      }
    };
  }

  /**
   * Get recommendations for manual scaling
   */
  getRecommendations(): string[] {
    const avgQueue = Array.from(this.metrics.values()).reduce((sum, m) => sum + m.queueDepth, 0) / Math.max(1, this.metrics.size);
    const avgLatency = Array.from(this.metrics.values()).reduce((sum, m) => sum + m.averageLatency, 0) / Math.max(1, this.metrics.size);

    const recommendations: string[] = [];

    if (avgQueue > this.thresholds.maxQueueDepth * 0.8) {
      recommendations.push(`⚠️ Queue depth ${avgQueue.toFixed(1)} approaching limit ${this.thresholds.maxQueueDepth}`);
    }

    if (avgLatency > this.thresholds.maxLatencyMs * 0.8) {
      recommendations.push(`⚠️ Latency ${avgLatency.toFixed(0)}ms approaching limit ${this.thresholds.maxLatencyMs}ms`);
    }

    if (avgQueue < this.thresholds.maxQueueDepth * 0.2 && this.topicIds.length > 2) {
      recommendations.push(`💡 Consider scaling down - utilization is low (${(avgQueue / this.thresholds.maxQueueDepth * 100).toFixed(1)}%)`);
    }

    return recommendations;
  }
}

// Export singleton
export const autoScaler = new VeraAutoScaler();
