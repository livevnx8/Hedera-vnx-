/**
 * HCS Batch Optimizer
 * Measurable: Increases HCS throughput by batching messages
 */

import { logger } from '../monitoring/logger.js';

interface BatchConfig {
  maxBatchSize: number;
  maxWaitMs: number;
  topicId: string;
}

interface QueuedMessage {
  data: any;
  timestamp: number;
  resolve: (value: boolean) => void;
  reject: (reason: any) => void;
}

export class HCSBatchOptimizer {
  private queue: Map<string, QueuedMessage[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private stats = {
    batchesSent: 0,
    messagesBatched: 0,
    avgBatchSize: 0,
    timeSaved: 0
  };

  constructor(private submitFn: (topicId: string, messages: any[]) => Promise<boolean>) {}

  async submit(topicId: string, data: any, priority: 'high' | 'normal' = 'normal'): Promise<boolean> {
    // High priority = send immediately
    if (priority === 'high') {
      return this.submitFn(topicId, [data]);
    }

    // Normal priority = batch
    return new Promise((resolve, reject) => {
      if (!this.queue.has(topicId)) {
        this.queue.set(topicId, []);
      }

      this.queue.get(topicId)!.push({
        data,
        timestamp: Date.now(),
        resolve,
        reject
      });

      this.scheduleBatch(topicId);
    });
  }

  private scheduleBatch(topicId: string): void {
    // Clear existing timer
    if (this.timers.has(topicId)) {
      clearTimeout(this.timers.get(topicId)!);
    }

    const messages = this.queue.get(topicId) || [];
    const config: BatchConfig = {
      maxBatchSize: 10,
      maxWaitMs: 100,
      topicId
    };

    // Send immediately if batch is full
    if (messages.length >= config.maxBatchSize) {
      this.flushBatch(topicId);
      return;
    }

    // Schedule batch send
    const timer = setTimeout(() => {
      this.flushBatch(topicId);
    }, config.maxWaitMs);

    this.timers.set(topicId, timer);
  }

  private async flushBatch(topicId: string): Promise<void> {
    const messages = this.queue.get(topicId);
    if (!messages || messages.length === 0) return;

    // Clear queue
    this.queue.set(topicId, []);
    this.timers.delete(topicId);

    const batchSize = messages.length;
    const startTime = Date.now();

    try {
      // Submit batch
      const success = await this.submitFn(
        topicId,
        messages.map(m => m.data)
      );

      // Resolve all promises
      messages.forEach(m => m.resolve(success));

      // Update stats
      this.stats.batchesSent++;
      this.stats.messagesBatched += batchSize;
      this.stats.avgBatchSize = this.stats.messagesBatched / this.stats.batchesSent;
      // Estimate: 1 submission vs batchSize individual submissions
      this.stats.timeSaved += (batchSize - 1) * 50; // ~50ms per HCS submit

      logger.info(`HCS batch sent: ${batchSize} messages to ${topicId}`, {
        batchSize,
        topicId,
        timeMs: Date.now() - startTime
      });
    } catch (error) {
      messages.forEach(m => m.reject(error));
      logger.error(`HCS batch failed: ${topicId}`, { error });
    }
  }

  getStats() {
    return {
      ...this.stats,
      pendingBatches: this.queue.size,
      pendingMessages: Array.from(this.queue.values()).reduce((a, b) => a + b.length, 0)
    };
  }

  // Flush all pending batches (useful for shutdown)
  async flushAll(): Promise<void> {
    const promises = Array.from(this.queue.keys()).map(topicId =>
      this.flushBatch(topicId)
    );
    await Promise.all(promises);
  }
}
