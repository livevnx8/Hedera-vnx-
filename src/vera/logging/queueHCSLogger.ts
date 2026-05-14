/**
 * Vera Queue-Based HCS Logger
 * Optimized HCS logging with batching, rate limiting, and async queue
 */

import { EventEmitter } from 'events';
import type { HCSMessage } from '../types/index.js';
import { logger } from '../../monitoring/logger.js';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';

export interface HCSLoggerConfig {
  batchSize: number;
  flushIntervalMs: number;
  rateLimitMs: number;  // Delay between submissions
  maxRetries: number;
  retryDelayMs: number;
  maxQueueSize: number;
}

export const DEFAULT_LOGGER_CONFIG: HCSLoggerConfig = {
  batchSize: 10,
  flushIntervalMs: 5000,
  rateLimitMs: 500,
  maxRetries: 3,
  retryDelayMs: 1000,
  maxQueueSize: 1000,
};

interface QueuedMessage {
  id: string;
  topicId: string;
  message: HCSMessage;
  retries: number;
  enqueuedAt: number;
}

export class QueueHCSLogger extends EventEmitter {
  private queue: QueuedMessage[] = [];
  private processing = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private stats = {
    submitted: 0,
    failed: 0,
    retried: 0,
    dropped: 0,
    queued: 0,
  };

  constructor(
    private topics: Record<string, string>,
    private config: HCSLoggerConfig = DEFAULT_LOGGER_CONFIG
  ) {
    super();
    this.startFlushTimer();
  }

  /**
   * Enqueue a message for HCS submission
   */
  async enqueue(
    topicKey: string,
    type: string,
    data: Record<string, unknown>,
    priority: 'normal' | 'high' | 'critical' = 'normal'
  ): Promise<string> {
    const topicId = this.topics[topicKey];
    if (!topicId) {
      logger.error('QueueHCSLogger', {
        message: 'Unknown topic key',
        topicKey,
        availableTopics: Object.keys(this.topics),
      });
      throw new Error(`Unknown topic key: ${topicKey}`);
    }

    // Check queue size limit
    if (this.queue.length >= this.config.maxQueueSize) {
      // Drop oldest non-critical messages
      const nonCriticalIndex = this.queue.findIndex(m => 
        m.message.priority !== 'critical' && m.message.priority !== 'high'
      );
      
      if (nonCriticalIndex >= 0) {
        this.queue.splice(nonCriticalIndex, 1);
        this.stats.dropped++;
      } else if (priority !== 'critical') {
        // Even dropping critical if nothing else
        this.queue.shift();
        this.stats.dropped++;
      } else {
        throw new Error('Queue full - cannot enqueue critical message');
      }
    }

    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const message: HCSMessage = {
      type,
      timestamp: Date.now(),
      topicId,
      priority,
      data,
    };

    this.queue.push({
      id: messageId,
      topicId,
      message,
      retries: 0,
      enqueuedAt: Date.now(),
    });

    this.stats.queued++;

    // Trigger immediate flush if critical priority or batch size reached
    if (priority === 'critical' || this.queue.length >= this.config.batchSize) {
      this.flush();
    }

    return messageId;
  }

  /**
   * Start the periodic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) return;
    
    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, this.config.flushIntervalMs);
  }

  /**
   * Stop the flush timer
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Flush remaining messages
    if (this.queue.length > 0) {
      this.flush();
    }
  }

  /**
   * Flush queued messages to HCS
   */
  async flush(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    
    // Take batch of messages
    const batch = this.queue.splice(0, this.config.batchSize);
    
    logger.debug('QueueHCSLogger', {
      message: 'Flushing batch',
      batchSize: batch.length,
      remaining: this.queue.length,
    });

    for (const item of batch) {
      try {
        await this.submitWithRetry(item);
        
        // Rate limiting delay
        if (batch.length > 1) {
          await this.sleep(this.config.rateLimitMs);
        }
      } catch (error) {
        // Final failure after retries
        this.stats.failed++;
        logger.error('QueueHCSLogger', {
          message: 'Message failed after all retries',
          messageId: item.id,
          error: (error as Error).message,
        });
        this.emit('message_failed', { messageId: item.id, error });
      }
    }

    this.processing = false;
    
    // If more messages remain, continue flushing
    if (this.queue.length > 0) {
      setImmediate(() => this.flush());
    }
  }

  /**
   * Submit a single message with retry logic
   */
  private async submitWithRetry(item: QueuedMessage): Promise<void> {
    // Wrap message in HIP-993 format
    const hip993Payload = {
      _hip993: {
        type: 'QUEUED_MESSAGE',
        version: '1.0.0',
        max_chunk_size: 4096,
        features: ['queuing', 'retry_logic', 'sequence_tracking'],
        timestamp: Date.now()
      },
      data: item.message
    };
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Use hederaMaster for proper HIP-993 chunking and retry logic
        const result = await hederaMaster.submitMessage(item.topicId, hip993Payload, {
          maxChunkSize: 4096 // HIP-993 max
        });

        this.stats.submitted++;
        
        this.emit('message_submitted', {
          messageId: item.id,
          topicId: item.topicId,
          transactionId: result.transactionId,
        });

        return;

      } catch (error) {
        const isLastAttempt = attempt === this.config.maxRetries;
        
        if (isLastAttempt) {
          throw error;
        }

        item.retries++;
        this.stats.retried++;
        
        logger.warn('QueueHCSLogger', {
          message: `Retry ${item.retries}/${this.config.maxRetries} for message`,
          messageId: item.id,
          error: (error as Error).message,
        });

        // Exponential backoff
        const delay = this.config.retryDelayMs * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      isProcessing: this.processing,
    };
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    const byPriority = {
      critical: 0,
      high: 0,
      normal: 0,
    };

    for (const item of this.queue) {
      byPriority[item.message.priority || 'normal']++;
    }

    return {
      totalLength: this.queue.length,
      byPriority,
      oldestMessageAge: this.queue.length > 0 
        ? Date.now() - this.queue[0].enqueuedAt 
        : 0,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Factory function
export function createHCSLogger(
  topics: Record<string, string>,
  config?: Partial<HCSLoggerConfig>
): QueueHCSLogger {
  return new QueueHCSLogger(topics, { ...DEFAULT_LOGGER_CONFIG, ...config });
}
