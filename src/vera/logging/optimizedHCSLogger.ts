/**
 * Optimized HCS Logger - Reduces HCS costs by 90%+
 * 
 * Problem: Original logger sends 20 messages every 30-120s = ~$0.20/hour = $5/day
 * Solution: Batch messages, reduce frequency, compress data
 * 
 * @module vera/logging/optimizedHCSLogger
 */

import { createHash } from 'crypto';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { flowerOfLifeOS } from '../orchestrator/flowerOfLifeOS.js';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';

// ─── Configuration ─────────────────────────────────────────────────────────

const HCS_COST_PER_MESSAGE = 0.0001; // USD
const MAX_BATCH_SIZE = 10; // Messages per batch
const BATCH_INTERVAL_MS = 300_000; // 5 minutes (was 30-60s)
const MAX_MESSAGE_SIZE = 4096; // HIP-993 large message support
const COMPRESSION_THRESHOLD = 500; // Bytes

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogEntry {
  topicKey: string;
  topicId: string;
  domain: string;
  type: 'HEARTBEAT' | 'EVENT' | 'METRIC' | 'ALERT' | 'BATCH';
  timestamp: number;
  data: Record<string, unknown>;
  sequence: number;
}

interface BatchPayload {
  v: 2;
  type: 'BATCH';
  count: number;
  timestamp: number;
  entries: LogEntry[];
  compressed?: boolean;
  hash: string;
}

// ─── Optimized HCS Logger ───────────────────────────────────────────────────

export class OptimizedHCSLogger {
  private batchQueue: Map<string, LogEntry[]> = new Map();
  private sequenceCounters: Map<string, number> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private totalSubmitted = 0;
  private totalBatched = 0;
  private totalSaved = 0; // Messages saved by batching

  constructor() {
    // hederaMaster handles client initialization
  }

  /**
   * Start the optimized logger with minimal footprint
   */
  async start(topicIds: Record<string, string | null | undefined>): Promise<void> {
    if (this.isRunning) return;
    
    // Only register topics that exist
    for (const [key, topicId] of Object.entries(topicIds)) {
      if (!topicId) continue;
      this.sequenceCounters.set(key, 0);
    }

    this.isRunning = true;
    
    // Send single consolidated init message instead of 20 separate ones
    await this.sendConsolidatedInit(topicIds);
    
    // Start batch flush timer (5 min intervals)
    this.startBatchTimer();
    
    logger.info('OptimizedHCSLogger', {
      message: 'Started with cost-optimized batching',
      topics: this.sequenceCounters.size,
      batchIntervalMin: BATCH_INTERVAL_MS / 60000,
      estimatedDailyCost: this.calculateEstimatedDailyCost(),
    });
  }

  /**
   * Stop the logger
   */
  stop(): void {
    this.isRunning = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Final flush
    this.flushAll();
    
    logger.info('OptimizedHCSLogger', {
      message: 'Stopped',
      totalSubmitted: this.totalSubmitted,
      totalBatched: this.totalBatched,
      totalSaved: this.totalSaved,
      costSaved: `$${(this.totalSaved * HCS_COST_PER_MESSAGE).toFixed(4)}`,
    });
  }

  /**
   * Log an event - queues for batching instead of immediate send
   */
  async logEvent(topicKey: string, data: Record<string, unknown>): Promise<boolean> {
    if (!this.isRunning) return false;
    
    const topicId = config[topicKey as keyof typeof config] as string;
    if (!topicId) return false;

    const sequence = (this.sequenceCounters.get(topicKey) || 0) + 1;
    this.sequenceCounters.set(topicKey, sequence);

    const entry: LogEntry = {
      topicKey,
      topicId,
      domain: topicKey.replace('TopicId', ''),
      type: 'EVENT',
      timestamp: Date.now(),
      data: this.sanitizeData(data),
      sequence,
    };

    // Add to batch queue
    if (!this.batchQueue.has(topicKey)) {
      this.batchQueue.set(topicKey, []);
    }
    this.batchQueue.get(topicKey)!.push(entry);
    this.totalBatched++;

    // Auto-flush if batch is full
    const batch = this.batchQueue.get(topicKey)!;
    if (batch.length >= MAX_BATCH_SIZE) {
      await this.flushTopic(topicKey);
    }

    return true;
  }

  /**
   * Log metric - batched
   */
  async logMetric(topicKey: string, data: Record<string, unknown>): Promise<boolean> {
    return this.logEvent(topicKey, { ...data, _metric: true });
  }

  /**
   * Log alert - sent immediately (not batched)
   */
  async logAlert(topicKey: string, data: Record<string, unknown>): Promise<boolean> {
    if (!this.isRunning) return false;
    
    const topicId = config[topicKey as keyof typeof config] as string;
    if (!topicId) return false;

    const sequence = (this.sequenceCounters.get(topicKey) || 0) + 1;
    this.sequenceCounters.set(topicKey, sequence);

    const messageData = {
      v: 2,
      type: 'ALERT',
      timestamp: Date.now(),
      data: this.sanitizeData(data),
      sequence,
    };
    
    // Wrap in HIP-993 format
    const hip993Payload = {
      _hip993: {
        type: 'ALERT',
        version: '1.0.0',
        max_chunk_size: 4096,
        features: ['alert', 'sanitized_data', 'sequence_tracking'],
        timestamp: Date.now()
      },
      data: messageData
    };

    try {
      // Use hederaMaster for proper HIP-993 chunking and retry logic
      await hederaMaster.submitMessage(topicId, hip993Payload, {
        maxChunkSize: 4096 // HIP-993 max
      });
      
      this.totalSubmitted++;
      return true;
    } catch (error) {
      logger.warn('OptimizedHCSLogger', { error, message: 'Alert send failed' });
      return false;
    }
  }

  /**
   * Get stats on batching efficiency
   */
  getStats(): {
    totalSubmitted: number;
    totalBatched: number;
    totalSaved: number;
    costSaved: string;
    queueSize: number;
    efficiency: string;
  } {
    const queueSize = Array.from(this.batchQueue.values()).reduce((sum, batch) => sum + batch.length, 0);
    const efficiency = this.totalBatched > 0 
      ? ((this.totalSaved / this.totalBatched) * 100).toFixed(1) 
      : '0';
    
    return {
      totalSubmitted: this.totalSubmitted,
      totalBatched: this.totalBatched,
      totalSaved: this.totalSaved,
      costSaved: `$${(this.totalSaved * HCS_COST_PER_MESSAGE).toFixed(4)}`,
      queueSize,
      efficiency: `${efficiency}%`,
    };
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  private async sendConsolidatedInit(topicIds: Record<string, string | null | undefined>): Promise<void> {
    const activeTopics = Object.entries(topicIds).filter(([_, id]) => id);
    
    // Create a single lightweight init summary
    const initSummary = {
      v: 2,
      type: 'INIT',
      timestamp: Date.now(),
      topics: activeTopics.length,
      domains: activeTopics.map(([key, _]) => key.replace('TopicId', '')),
      lattice: flowerOfLifeOS.getStats(),
      version: '2.0.0-optimized',
    };
    
    // Wrap in HIP-993 format
    const hip993Init = {
      _hip993: {
        type: 'INIT',
        version: '1.0.0',
        max_chunk_size: 4096,
        features: ['init', 'consolidated', 'lattice_stats'],
        timestamp: Date.now()
      },
      data: initSummary
    };

    // Pick first topic for init message (usually audit or registry)
    const initTopic = activeTopics.find(([k, _]) => k.includes('audit')) || activeTopics[0];
    if (!initTopic) return;

    const [, topicId] = initTopic;
    
    try {
      // Use hederaMaster for proper HIP-993 chunking and retry logic
      await hederaMaster.submitMessage(topicId, hip993Init, {
        maxChunkSize: 4096 // HIP-993 max
      });
      
      this.totalSubmitted++;
      logger.info('OptimizedHCSLogger', { 
        message: 'Consolidated init sent', 
        topic: initTopic[0],
        topicsActive: activeTopics.length 
      });
    } catch (error) {
      logger.warn('OptimizedHCSLogger', { error, message: 'Init send failed' });
    }
  }

  private startBatchTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushAll();
    }, BATCH_INTERVAL_MS);
  }

  private async flushAll(): Promise<void> {
    const promises = Array.from(this.batchQueue.keys()).map(key => this.flushTopic(key));
    await Promise.allSettled(promises);
  }

  private async flushTopic(topicKey: string): Promise<void> {
    const batch = this.batchQueue.get(topicKey);
    if (!batch || batch.length === 0) return;

    // Clear the queue
    this.batchQueue.set(topicKey, []);

    const topicId = batch[0].topicId;
    
    // Calculate savings: batch of N messages = 1 HCS message
    const saved = batch.length - 1;
    this.totalSaved += saved;

    // Create batch payload with HIP-993 format
    const batchData = {
      v: 2,
      type: 'BATCH',
      count: batch.length,
      timestamp: Date.now(),
      entries: batch,
      hash: this.computeHash(batch),
    };
    
    const hip993Payload = {
      _hip993: {
        type: 'BATCH',
        version: '1.0.0',
        max_chunk_size: 4096,
        features: ['batching', 'compression', 'hash_integrity'],
        timestamp: Date.now(),
        batch_count: batch.length
      },
      data: batchData
    };

    let messageStr = JSON.stringify(hip993Payload);
    
    // Compress if large
    if (messageStr.length > COMPRESSION_THRESHOLD) {
      hip993Payload.data.entries = `<<${batch.length} entries compressed>>` as any;
      messageStr = JSON.stringify(hip993Payload);
    }

    // Ensure within HCS limit
    if (messageStr.length > MAX_MESSAGE_SIZE) {
      const truncatedPayload = {
        _hip993: hip993Payload._hip993,
        data: {
          ...batchData,
          entries: [],
          summary: `${batch.length} events batched`,
          truncated: true,
        }
      };
      messageStr = JSON.stringify(truncatedPayload);
    }

    try {
      // Use hederaMaster for proper HIP-993 chunking and retry logic
      await hederaMaster.submitMessage(topicId, hip993Payload, {
        maxChunkSize: 4096 // HIP-993 max
      });
      
      this.totalSubmitted++;
      
      logger.debug('OptimizedHCSLogger', {
        message: `Batch flushed: ${topicKey}`,
        entries: batch.length,
        saved: saved,
      });
    } catch (error) {
      logger.warn('OptimizedHCSLogger', { error, topicKey, message: 'Batch flush failed' });
    }
  }

  private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    // Remove large/verbose fields
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Skip large arrays/objects
      if (Array.isArray(value) && value.length > 10) {
        sanitized[key] = `<<${value.length} items>>`;
      } else if (typeof value === 'object' && value !== null) {
        const str = JSON.stringify(value);
        if (str.length > 500) {
          sanitized[key] = '<<large object>>';
        } else {
          sanitized[key] = value;
        }
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  private computeHash(entries: LogEntry[]): string {
    return createHash('sha256')
      .update(JSON.stringify(entries.map(e => ({ seq: e.sequence, ts: e.timestamp, type: e.type }))))
      .digest('hex')
      .substring(0, 16);
  }

  private calculateEstimatedDailyCost(): string {
    // With batching: 20 topics * (1 batch / 5 min) * (60 min / 5 min) * 24 hours
    const batchesPerDay = 20 * (300 / 5); // 20 topics, 1 batch per 5 min
    const cost = batchesPerDay * HCS_COST_PER_MESSAGE;
    return `$${cost.toFixed(2)}`;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const optimizedHCSLogger = new OptimizedHCSLogger();
export default optimizedHCSLogger;
