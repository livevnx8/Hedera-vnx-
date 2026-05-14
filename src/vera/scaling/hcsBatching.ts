/**
 * HCS Batching Manager
 * Buffers HCS messages for efficient batch submission
 */

import { EventEmitter } from 'events';
import { Client, TopicId, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { logger } from '../../monitoring/logger.js';
import { getClient } from '../../hedera/tools/client.js';

export interface BatchingConfig {
  maxBatchSize: number;
  maxWaitMs: number;
  maxMessageSize: number;
  enableCompression: boolean;
}

export interface QueuedMessage {
  id: string;
  topicId: string;
  message: string | Uint8Array;
  priority: number;
  timestamp: number;
  retryCount: number;
}

export class HCSBatchingManager extends EventEmitter {
  private queues = new Map<string, QueuedMessage[]>();
  private timers = new Map<string, NodeJS.Timeout>();
  private stats = {
    totalBatched: 0,
    totalSubmitted: 0,
    totalFailed: 0,
    avgBatchSize: 0,
    avgLatency: 0,
  };

  constructor(private config: BatchingConfig) {
    super();
  }

  /**
   * Queue a message for batch submission
   */
  queueMessage(
    topicId: string,
    message: string | Uint8Array,
    priority: number = 0
  ): string {
    const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const queued: QueuedMessage = {
      id,
      topicId,
      message,
      priority,
      timestamp: Date.now(),
      retryCount: 0,
    };

    // Get or create queue for this topic
    let queue = this.queues.get(topicId);
    if (!queue) {
      queue = [];
      this.queues.set(topicId, queue);
    }

    // Insert by priority (higher first)
    const insertIndex = queue.findIndex(m => m.priority < priority);
    if (insertIndex === -1) {
      queue.push(queued);
    } else {
      queue.splice(insertIndex, 0, queued);
    }

    // Check if we should flush
    if (queue.length >= this.config.maxBatchSize) {
      this.flushTopic(topicId);
    } else {
      // Schedule flush if not already scheduled
      this.scheduleFlush(topicId);
    }

    return id;
  }

  /**
   * Schedule flush for a topic
   */
  private scheduleFlush(topicId: string): void {
    if (this.timers.has(topicId)) return;

    const timer = setTimeout(() => {
      this.flushTopic(topicId);
    }, this.config.maxWaitMs);

    this.timers.set(topicId, timer);
  }

  /**
   * Flush all queued messages for a topic
   */
  async flushTopic(topicId: string): Promise<{ success: number; failed: number }> {
    // Clear timer
    const timer = this.timers.get(topicId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(topicId);
    }

    const queue = this.queues.get(topicId);
    if (!queue || queue.length === 0) {
      return { success: 0, failed: 0 };
    }

    // Take all messages from queue
    const messages = queue.splice(0);
    
    // Update stats
    this.stats.totalBatched += messages.length;
    
    const startTime = Date.now();
    let success = 0;
    let failed = 0;

    try {
      const client = getClient();

      // For simplicity, submit individually (can be optimized further)
      for (const msg of messages) {
        try {
          await new TopicMessageSubmitTransaction()
            .setTopicId(TopicId.fromString(topicId))
            .setMessage(msg.message)
            .execute(client);

          success++;
          this.emit('message_submitted', { id: msg.id, topicId });

        } catch (error) {
          failed++;
          
          // Re-queue if retryable
          if (msg.retryCount < 3) {
            msg.retryCount++;
            queue.push(msg);
          } else {
            this.emit('message_failed', { 
              id: msg.id, 
              topicId, 
              error: error instanceof Error ? error.message : String(error) 
            });
          }
        }
      }

      const latency = Date.now() - startTime;
      
      // Update stats
      this.stats.totalSubmitted += success;
      this.stats.totalFailed += failed;
      this.stats.avgBatchSize = 
        (this.stats.avgBatchSize * (this.stats.totalSubmitted - success) + messages.length) / 
        this.stats.totalSubmitted || messages.length;
      this.stats.avgLatency = 
        (this.stats.avgLatency * (this.stats.totalSubmitted - success) + latency) / 
        this.stats.totalSubmitted || latency;

      logger.info('HCSBatchingManager', {
        message: 'Batch submitted',
        topicId,
        count: messages.length,
        success,
        failed,
        latency: `${latency}ms`,
      });

      this.emit('batch_submitted', {
        topicId,
        count: messages.length,
        success,
        failed,
        latency,
      });

    } catch (error) {
      logger.error('HCSBatchingManager', {
        message: 'Batch submission failed',
        topicId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-queue all for retry
      queue.push(...messages);
    }

    return { success, failed };
  }

  /**
   * Flush all topics
   */
  async flushAll(): Promise<{ topics: number; totalSuccess: number; totalFailed: number }> {
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const topicId of this.queues.keys()) {
      const result = await this.flushTopic(topicId);
      totalSuccess += result.success;
      totalFailed += result.failed;
    }

    return {
      topics: this.queues.size,
      totalSuccess,
      totalFailed,
    };
  }

  /**
   * Get queue depth for a topic
   */
  getQueueDepth(topicId: string): number {
    return this.queues.get(topicId)?.length || 0;
  }

  /**
   * Get total queue depth across all topics
   */
  getTotalQueueDepth(): number {
    return Array.from(this.queues.values()).reduce((sum, q) => sum + q.length, 0);
  }

  /**
   * Get batching statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Clear all queues
   */
  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.queues.clear();
  }
}

export default HCSBatchingManager;
