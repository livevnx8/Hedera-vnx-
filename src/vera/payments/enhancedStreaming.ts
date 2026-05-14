/**
 * Enhanced Streaming Payments with Settlement Integration
 * Connects PaymentStreamManager to X402SettlementHandler
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import type { X402SettlementHandler } from '../orchestrator/x402Settlement.js';
import type { PaymentStream, Currency } from '../types/index.js';

export interface EnhancedStreamConfig {
  microIntervalMs: number;
  minStreamAmount: number;
  maxStreamDurationMs: number;
  autoPauseOnError: boolean;
  enableSettlementIntegration: boolean;
}

export const DEFAULT_ENHANCED_CONFIG: EnhancedStreamConfig = {
  microIntervalMs: 30_000,
  minStreamAmount: 0.001,
  maxStreamDurationMs: 60 * 60 * 1000,
  autoPauseOnError: true,
  enableSettlementIntegration: true,
};

export interface EnhancedPaymentStream extends PaymentStream {
  recipientAccountId: string;
  settlementIds: string[];
  failedSettlements: number;
  lastSettlementTxId?: string;
}

export class EnhancedStreamManager extends EventEmitter {
  private streams = new Map<string, EnhancedPaymentStream>();
  private timers = new Map<string, NodeJS.Timeout>();
  private config: EnhancedStreamConfig;

  constructor(
    private settlementHandler: X402SettlementHandler,
    config?: Partial<EnhancedStreamConfig>
  ) {
    super();
    this.config = { ...DEFAULT_ENHANCED_CONFIG, ...config };
  }

  /**
   * Start a new payment stream with settlement integration
   */
  async startStream(params: {
    taskId: string;
    agentId: string;
    recipientAccountId: string;
    rateHbarPerSecond: number;
    maxTotalHbar: number;
    currency?: Currency;
  }): Promise<EnhancedPaymentStream> {
    const streamId = `stream-${params.taskId}-${Date.now()}`;

    const stream: EnhancedPaymentStream = {
      streamId,
      taskId: params.taskId,
      agentId: params.agentId,
      recipientAccountId: params.recipientAccountId,
      rateHbarPerSecond: params.rateHbarPerSecond,
      maxTotalHbar: params.maxTotalHbar,
      state: 'active',
      totalSettled: 0,
      lastSettlementAt: Date.now(),
      currency: params.currency || 'HBAR',
      createdAt: Date.now(),
      settlementIds: [],
      failedSettlements: 0,
    };

    this.streams.set(streamId, stream);
    this.startSettlementTimer(streamId);

    logger.info('EnhancedStreamManager', {
      message: 'Payment stream started',
      streamId,
      taskId: params.taskId,
      recipient: params.recipientAccountId,
    });

    this.emit('stream_started', stream);
    return stream;
  }

  /**
   * Execute settlement using x402 handler
   */
  private async executeSettlement(
    streamId: string,
    isFinal = false
  ): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream || stream.state !== 'active') return;

    const now = Date.now();
    const elapsedSeconds = (now - stream.lastSettlementAt) / 1000;
    const amount = stream.rateHbarPerSecond * elapsedSeconds;

    if (amount < this.config.minStreamAmount && !isFinal) return;

    if (stream.totalSettled + amount > stream.maxTotalHbar) {
      const remaining = stream.maxTotalHbar - stream.totalSettled;
      if (remaining <= 0) {
        await this.completeStream(streamId);
        return;
      }
    }

    try {
      // Use settlement handler for actual payment
      const result = await this.settlementHandler.settle(
        stream.taskId,
        stream.agentId,
        stream.recipientAccountId,
        amount
      );

      if (result.state === 'settled') {
        stream.totalSettled += amount;
        stream.lastSettlementAt = now;
        stream.settlementIds.push(result.settlementId);
        stream.lastSettlementTxId = result.txId;

        this.emit('micro_settlement', {
          streamId,
          settlementId: result.settlementId,
          amount,
          txId: result.txId,
          timestamp: now,
        });
      } else {
        stream.failedSettlements++;
        if (this.config.autoPauseOnError && stream.failedSettlements >= 3) {
          this.pauseStream(streamId);
        }
      }

      // Check max duration
      if (now - stream.createdAt > this.config.maxStreamDurationMs) {
        await this.completeStream(streamId);
      }
    } catch (error) {
      stream.failedSettlements++;
      logger.error('EnhancedStreamManager', {
        message: 'Settlement failed',
        streamId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (this.config.autoPauseOnError) {
        this.pauseStream(streamId);
      }
    }
  }

  /**
   * Start settlement timer
   */
  private startSettlementTimer(streamId: string): void {
    const timer = setInterval(() => {
      this.executeSettlement(streamId);
    }, this.config.microIntervalMs);

    this.timers.set(streamId, timer);
  }

  /**
   * Pause stream
   */
  pauseStream(streamId: string): boolean {
    const stream = this.streams.get(streamId);
    if (!stream || stream.state !== 'active') return false;

    stream.state = 'paused';
    const timer = this.timers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(streamId);
    }

    this.emit('stream_paused', stream);
    return true;
  }

  /**
   * Resume stream
   */
  resumeStream(streamId: string): boolean {
    const stream = this.streams.get(streamId);
    if (!stream || stream.state !== 'paused') return false;

    stream.state = 'active';
    stream.lastSettlementAt = Date.now();
    this.startSettlementTimer(streamId);

    this.emit('stream_resumed', stream);
    return true;
  }

  /**
   * Complete stream with final settlement
   */
  async completeStream(streamId: string): Promise<EnhancedPaymentStream | null> {
    const stream = this.streams.get(streamId);
    if (!stream) return null;

    const timer = this.timers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(streamId);
    }

    // Final settlement
    await this.executeSettlement(streamId, true);

    stream.state = 'completed';

    logger.info('EnhancedStreamManager', {
      message: 'Payment stream completed',
      streamId,
      totalSettled: stream.totalSettled,
      settlements: stream.settlementIds.length,
    });

    this.emit('stream_completed', stream);
    return stream;
  }

  /**
   * Get stream stats
   */
  getStats() {
    const all = Array.from(this.streams.values());
    return {
      total: all.length,
      active: all.filter(s => s.state === 'active').length,
      totalSettled: all.reduce((sum, s) => sum + s.totalSettled, 0),
      totalSettlements: all.reduce((sum, s) => sum + s.settlementIds.length, 0),
      failedSettlements: all.reduce((sum, s) => sum + s.failedSettlements, 0),
    };
  }
}

export default EnhancedStreamManager;
