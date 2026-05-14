/**
 * Vera Micropayment Streaming
 * Per-second payment streams for continuous agent services
 */

import { EventEmitter } from 'events';
import type { PaymentStream, Currency } from '../types/index.js';
import { logger } from '../../monitoring/logger.js';

export interface StreamConfig {
  microIntervalMs: number;     // Settlement interval (default 30s)
  minStreamAmount: number;     // Minimum HBAR per micro-settlement
  maxStreamDurationMs: number; // Maximum stream lifetime (default 1 hour)
  autoPauseOnError: boolean;
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  microIntervalMs: 30_000,     // 30 seconds
  minStreamAmount: 0.001,      // 0.001 HBAR minimum
  maxStreamDurationMs: 60 * 60 * 1000, // 1 hour
  autoPauseOnError: true,
};

export interface StreamSettlement {
  settlementId: string;
  streamId: string;
  timestamp: number;
  amount: number;
  txId?: string;
  success: boolean;
  error?: string;
}

export class PaymentStreamManager extends EventEmitter {
  private streams = new Map<string, PaymentStream>();
  private settlements = new Map<string, StreamSettlement[]>();
  private timers = new Map<string, NodeJS.Timeout>();
  private config: StreamConfig;

  constructor(config?: Partial<StreamConfig>) {
    super();
    this.config = { ...DEFAULT_STREAM_CONFIG, ...config };
  }

  /**
   * Start a new payment stream
   */
  async startStream(params: {
    taskId: string;
    agentId: string;
    rateHbarPerSecond: number;
    maxTotalHbar: number;
    currency?: Currency;
  }): Promise<PaymentStream> {
    const streamId = `stream-${params.taskId}-${Date.now()}`;
    
    const stream: PaymentStream = {
      streamId,
      taskId: params.taskId,
      agentId: params.agentId,
      rateHbarPerSecond: params.rateHbarPerSecond,
      maxTotalHbar: params.maxTotalHbar,
      state: 'active',
      totalSettled: 0,
      lastSettlementAt: Date.now(),
      currency: params.currency || 'HBAR',
      createdAt: Date.now(),
    };

    this.streams.set(streamId, stream);
    this.settlements.set(streamId, []);

    // Start periodic settlement timer
    this.startSettlementTimer(streamId);

    logger.info('PaymentStreamManager', {
      message: 'Payment stream started',
      streamId,
      taskId: params.taskId,
      rate: params.rateHbarPerSecond,
      max: params.maxTotalHbar,
    });

    this.emit('stream_started', stream);
    return stream;
  }

  /**
   * Pause an active stream
   */
  pauseStream(streamId: string): boolean {
    const stream = this.streams.get(streamId);
    if (!stream || stream.state !== 'active') return false;

    stream.state = 'paused';
    
    // Stop settlement timer
    const timer = this.timers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(streamId);
    }

    logger.info('PaymentStreamManager', {
      message: 'Payment stream paused',
      streamId,
      totalSettled: stream.totalSettled,
    });

    this.emit('stream_paused', stream);
    return true;
  }

  /**
   * Resume a paused stream
   */
  resumeStream(streamId: string): boolean {
    const stream = this.streams.get(streamId);
    if (!stream || stream.state !== 'paused') return false;

    stream.state = 'active';
    stream.lastSettlementAt = Date.now(); // Reset timer

    // Restart settlement timer
    this.startSettlementTimer(streamId);

    logger.info('PaymentStreamManager', {
      message: 'Payment stream resumed',
      streamId,
    });

    this.emit('stream_resumed', stream);
    return true;
  }

  /**
   * Complete a stream (finalize payments)
   */
  async completeStream(streamId: string): Promise<PaymentStream | null> {
    const stream = this.streams.get(streamId);
    if (!stream) return null;

    // Stop timer
    const timer = this.timers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(streamId);
    }

    // Final settlement
    await this.executeSettlement(streamId, true);

    stream.state = 'completed';

    logger.info('PaymentStreamManager', {
      message: 'Payment stream completed',
      streamId,
      taskId: stream.taskId,
      totalSettled: stream.totalSettled,
    });

    this.emit('stream_completed', stream);
    return stream;
  }

  /**
   * Cancel/fail a stream
   */
  failStream(streamId: string, reason: string): boolean {
    const stream = this.streams.get(streamId);
    if (!stream) return false;

    // Stop timer
    const timer = this.timers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(streamId);
    }

    stream.state = 'failed';

    logger.error('PaymentStreamManager', {
      message: 'Payment stream failed',
      streamId,
      reason,
      totalSettled: stream.totalSettled,
    });

    this.emit('stream_failed', { stream, reason });
    return true;
  }

  /**
   * Start the settlement timer for a stream
   */
  private startSettlementTimer(streamId: string): void {
    const timer = setInterval(() => {
      this.executeSettlement(streamId);
    }, this.config.microIntervalMs);

    this.timers.set(streamId, timer);
  }

  /**
   * Execute a micro-settlement
   */
  private async executeSettlement(streamId: string, isFinal = false): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream || stream.state !== 'active') return;

    // Calculate amount since last settlement
    const now = Date.now();
    const elapsedSeconds = (now - stream.lastSettlementAt) / 1000;
    const amount = stream.rateHbarPerSecond * elapsedSeconds;

    // Check minimum amount (skip if too small and not final)
    if (amount < this.config.minStreamAmount && !isFinal) return;

    // Check max total
    if (stream.totalSettled + amount > stream.maxTotalHbar) {
      // Cap at max
      const remaining = stream.maxTotalHbar - stream.totalSettled;
      if (remaining <= 0) {
        await this.completeStream(streamId);
        return;
      }
    }

    // Execute settlement (placeholder - would integrate with actual settlement handler)
    const settlementId = `str-${streamId}-${now}`;
    
    try {
      // In production, this would call the actual settlement handler
      // const result = await settlement.settle(...);
      
      const settlement: StreamSettlement = {
        settlementId,
        streamId,
        timestamp: now,
        amount,
        txId: `0.0.xxx@${Math.floor(now / 1000)}.xxx`, // Placeholder
        success: true,
      };

      // Update stream
      stream.totalSettled += amount;
      stream.lastSettlementAt = now;

      // Store settlement record
      const history = this.settlements.get(streamId) || [];
      history.push(settlement);
      this.settlements.set(streamId, history);

      this.emit('micro_settlement', settlement);

      // Check for max duration
      if (now - stream.createdAt > this.config.maxStreamDurationMs) {
        await this.completeStream(streamId);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      const settlement: StreamSettlement = {
        settlementId,
        streamId,
        timestamp: now,
        amount,
        success: false,
        error: errorMessage,
      };

      const history = this.settlements.get(streamId) || [];
      history.push(settlement);
      this.settlements.set(streamId, history);

      logger.error('PaymentStreamManager', {
        message: 'Micro-settlement failed',
        streamId,
        settlementId,
        error: errorMessage,
      });

      if (this.config.autoPauseOnError) {
        this.pauseStream(streamId);
      }

      this.emit('settlement_failed', settlement);
    }
  }

  /**
   * Get stream by ID
   */
  getStream(streamId: string): PaymentStream | undefined {
    return this.streams.get(streamId);
  }

  /**
   * Get all streams for a task
   */
  getStreamsByTask(taskId: string): PaymentStream[] {
    return Array.from(this.streams.values()).filter(s => s.taskId === taskId);
  }

  /**
   * Get settlement history for a stream
   */
  getSettlementHistory(streamId: string): StreamSettlement[] {
    return this.settlements.get(streamId) || [];
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): PaymentStream[] {
    return Array.from(this.streams.values()).filter(s => s.state === 'active');
  }

  /**
   * Get stream statistics
   */
  getStats() {
    const all = Array.from(this.streams.values());
    return {
      total: all.length,
      active: all.filter(s => s.state === 'active').length,
      paused: all.filter(s => s.state === 'paused').length,
      completed: all.filter(s => s.state === 'completed').length,
      failed: all.filter(s => s.state === 'failed').length,
      totalSettled: all.reduce((sum, s) => sum + s.totalSettled, 0),
    };
  }

  /**
   * Clean up completed/failed streams older than retention period
   */
  cleanup(retentionMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [streamId, stream] of this.streams.entries()) {
      if (stream.state === 'completed' || stream.state === 'failed') {
        if (now - stream.createdAt > retentionMs) {
          this.streams.delete(streamId);
          this.settlements.delete(streamId);
          cleaned++;
        }
      }
    }

    logger.info('PaymentStreamManager', {
      message: 'Cleanup completed',
      streamsRemoved: cleaned,
      retentionMs,
    });

    return cleaned;
  }
}

// Singleton instance
export const streamManager = new PaymentStreamManager();
export default streamManager;
