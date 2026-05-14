/**
 * x402 Payment Streaming Integration
 * 
 * Implements real-time micropayments for API usage with:
 * - Payment stream initialization
 * - Continuous verification (every 30s)
 * - Automatic service termination on payment failure
 * - HCS audit trail for all transactions
 * 
 * @module revenue/payments/x402Integration
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { Client, TransferTransaction, AccountId } from '@hashgraph/sdk';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaymentStream {
  streamId: string;
  clientAddress: string;
  resource: string;
  ratePerSecond: number; // in USD or HBAR
  maxDurationSeconds: number;
  currency: 'HBAR' | 'USD';
  status: 'active' | 'paused' | 'terminated' | 'completed';
  startTime: number;
  lastVerificationTime: number;
  totalPaid: number;
  verificationCount: number;
}

export interface PaymentVerification {
  streamId: string;
  timestamp: number;
  amountPaid: number;
  expectedAmount: number;
  isValid: boolean;
  transactionHash?: string;
}

export interface X402Config {
  platformWallet: string; // Hedera account ID
  verificationIntervalMs: number;
  gracePeriodMs: number;
  minPaymentConfirmation: number;
  hcsTopicId?: string;
}

// ─── x402 Payment Manager ───────────────────────────────────────────────────

export class X402PaymentManager extends EventEmitter {
  private activeStreams = new Map<string, PaymentStream>();
  private verifications = new Map<string, PaymentVerification[]>();
  private verificationTimers = new Map<string, NodeJS.Timeout>();
  private config: X402Config;
  private hederaClient: Client | null = null;

  constructor(config: Partial<X402Config> = {}) {
    super();
    
    this.config = {
      platformWallet: '0.0.10409351', // Default platform wallet
      verificationIntervalMs: 30000, // 30 seconds
      gracePeriodMs: 60000, // 1 minute grace period
      minPaymentConfirmation: 1,
      ...config,
    };
  }

  /**
   * Initialize Hedera client
   */
  async initialize(client: Client): Promise<void> {
    this.hederaClient = client;
    logger.info('X402PaymentManager', { message: 'Initialized', wallet: this.config.platformWallet });
  }

  /**
   * Open a new payment stream
   */
  async openPaymentStream(params: {
    clientAddress: string;
    resource: string;
    ratePerSecond: number;
    maxDurationSeconds: number;
    currency: 'HBAR' | 'USD';
  }): Promise<PaymentStream> {
    const streamId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const stream: PaymentStream = {
      streamId,
      clientAddress: params.clientAddress,
      resource: params.resource,
      ratePerSecond: params.ratePerSecond,
      maxDurationSeconds: params.maxDurationSeconds,
      currency: params.currency,
      status: 'active',
      startTime: Date.now(),
      lastVerificationTime: Date.now(),
      totalPaid: 0,
      verificationCount: 0,
    };

    this.activeStreams.set(streamId, stream);
    this.verifications.set(streamId, []);

    // Start verification loop
    this.startVerificationLoop(streamId);

    // Emit event
    this.emit('stream_opened', stream);
    
    logger.info('X402PaymentManager', {
      message: 'Payment stream opened',
      streamId,
      client: params.clientAddress,
      rate: params.ratePerSecond,
    });

    return stream;
  }

  /**
   * Start continuous verification loop
   */
  private startVerificationLoop(streamId: string): void {
    const timer = setInterval(async () => {
      await this.verifyPayment(streamId);
    }, this.config.verificationIntervalMs);

    this.verificationTimers.set(streamId, timer);

    // Also set max duration timeout
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      setTimeout(() => {
        this.completeStream(streamId);
      }, stream.maxDurationSeconds * 1000);
    }
  }

  /**
   * Verify current payment status
   */
  private async verifyPayment(streamId: string): Promise<PaymentVerification> {
    const stream = this.activeStreams.get(streamId);
    if (!stream || (stream.status !== 'active' && stream.status !== 'paused')) {
      return {
        streamId,
        timestamp: Date.now(),
        amountPaid: 0,
        expectedAmount: 0,
        isValid: false,
      };
    }

    const now = Date.now();
    const elapsedSeconds = (now - stream.startTime) / 1000;
    const expectedAmount = elapsedSeconds * stream.ratePerSecond;

    // In production: Query mirror node for actual payments
    // For now: Simulate verification (would integrate with actual payment checking)
    const verification = await this.checkActualPayment(stream, expectedAmount);

    // Store verification
    const verifications = this.verifications.get(streamId) || [];
    verifications.push(verification);
    this.verifications.set(streamId, verifications);

    stream.lastVerificationTime = now;
    stream.verificationCount++;

    // Check if payment is valid
    if (!verification.isValid) {
      const timeSinceLastValid = now - stream.lastVerificationTime;
      
      if (timeSinceLastValid > this.config.gracePeriodMs) {
        // Grace period exceeded, terminate service
        await this.terminateStream(streamId, 'payment_failure');
      } else {
        // Still in grace period, pause service
        await this.pauseStream(streamId);
      }
    } else {
      stream.totalPaid = verification.amountPaid;
      
      // If was paused, resume
      if (stream.status === 'paused') {
        await this.resumeStream(streamId);
      }
    }

    // Log to HCS if configured
    if (this.config.hcsTopicId) {
      await this.logVerificationToHCS(verification);
    }

    this.emit('verification', verification);
    return verification;
  }

  /**
   * Check actual payment from client
   * 
   * In production, this would:
   * 1. Query Hedera mirror node for transfers to platform wallet
   * 2. Verify payment amount >= expected
   * 3. Confirm transaction is confirmed
   */
  private async checkActualPayment(
    stream: PaymentStream,
    expectedAmount: number
  ): Promise<PaymentVerification> {
    // STUB: In production, query mirror node
    // For now, simulate success after first verification
    const verifications = this.verifications.get(stream.streamId) || [];
    const isValid = verifications.length > 0; // Simulate success after first check
    
    return {
      streamId: stream.streamId,
      timestamp: Date.now(),
      amountPaid: isValid ? expectedAmount : expectedAmount * 0.5,
      expectedAmount,
      isValid,
      transactionHash: isValid ? `0.0.${Math.floor(Math.random() * 1000000)}` : undefined,
    };
  }

  /**
   * Pause service due to payment issue
   */
  private async pauseStream(streamId: string): Promise<void> {
    const stream = this.activeStreams.get(streamId);
    if (stream && stream.status === 'active') {
      stream.status = 'paused';
      this.emit('stream_paused', stream);
      logger.warn('X402PaymentManager', { message: 'Stream paused', streamId });
    }
  }

  /**
   * Resume service after payment restored
   */
  private async resumeStream(streamId: string): Promise<void> {
    const stream = this.activeStreams.get(streamId);
    if (stream && stream.status === 'paused') {
      stream.status = 'active';
      this.emit('stream_resumed', stream);
      logger.info('X402PaymentManager', { message: 'Stream resumed', streamId });
    }
  }

  /**
   * Terminate service due to payment failure
   */
  async terminateStream(streamId: string, reason: string): Promise<void> {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;

    // Stop verification loop
    const timer = this.verificationTimers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.verificationTimers.delete(streamId);
    }

    stream.status = 'terminated';
    
    this.emit('stream_terminated', { stream, reason });
    logger.error('X402PaymentManager', {
      message: 'Stream terminated',
      streamId,
      reason,
      totalPaid: stream.totalPaid,
    });

    // Log final state to HCS
    if (this.config.hcsTopicId) {
      await this.logToHCS({
        type: 'stream_terminated',
        streamId,
        reason,
        finalStats: {
          duration: (Date.now() - stream.startTime) / 1000,
          totalPaid: stream.totalPaid,
          verificationCount: stream.verificationCount,
        },
      });
    }
  }

  /**
   * Complete stream normally (max duration reached)
   */
  private async completeStream(streamId: string): Promise<void> {
    const stream = this.activeStreams.get(streamId);
    if (!stream || stream.status === 'terminated') return;

    // Stop verification loop
    const timer = this.verificationTimers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.verificationTimers.delete(streamId);
    }

    stream.status = 'completed';
    
    this.emit('stream_completed', stream);
    logger.info('X402PaymentManager', {
      message: 'Stream completed',
      streamId,
      totalPaid: stream.totalPaid,
      duration: (Date.now() - stream.startTime) / 1000,
    });
  }

  /**
   * Close stream and clean up
   */
  async closeStream(streamId: string): Promise<PaymentStream | null> {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return null;

    // Stop verification
    const timer = this.verificationTimers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.verificationTimers.delete(streamId);
    }

    // Final verification
    await this.verifyPayment(streamId);

    const finalStream = { ...stream };
    this.activeStreams.delete(streamId);
    this.verifications.delete(streamId);

    this.emit('stream_closed', finalStream);
    return finalStream;
  }

  /**
   * Get stream status
   */
  getStream(streamId: string): PaymentStream | undefined {
    return this.activeStreams.get(streamId);
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): PaymentStream[] {
    return Array.from(this.activeStreams.values()).filter(
      s => s.status === 'active' || s.status === 'paused'
    );
  }

  /**
   * Get verification history
   */
  getVerificationHistory(streamId: string): PaymentVerification[] {
    return this.verifications.get(streamId) || [];
  }

  /**
   * Log verification to HCS
   */
  private async logVerificationToHCS(verification: PaymentVerification): Promise<void> {
    try {
      const { hcsDomainLogger } = await import('../../vera/logging/hcsDomainLogger.js');
      await hcsDomainLogger.logEvent('paymentTopicId', {
        type: 'x402_verification',
        ...verification,
      });
    } catch (error) {
      logger.warn('X402PaymentManager', {
        message: 'Failed to log to HCS',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generic HCS logging
   */
  private async logToHCS(data: any): Promise<void> {
    try {
      const { hcsDomainLogger } = await import('../../vera/logging/hcsDomainLogger.js');
      await hcsDomainLogger.logEvent('paymentTopicId', data);
    } catch (error) {
      logger.warn('X402PaymentManager', {
        message: 'Failed to log to HCS',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get revenue statistics
   */
  getRevenueStats(): {
    totalRevenue: number;
    activeStreams: number;
    terminatedStreams: number;
    completedStreams: number;
    averageStreamDuration: number;
  } {
    const streams = Array.from(this.activeStreams.values());
    const terminated = streams.filter(s => s.status === 'terminated').length;
    const completed = streams.filter(s => s.status === 'completed').length;
    const active = streams.filter(s => s.status === 'active' || s.status === 'paused').length;
    
    const totalRevenue = streams.reduce((sum, s) => sum + s.totalPaid, 0);
    const avgDuration = streams.length > 0
      ? streams.reduce((sum, s) => sum + (Date.now() - s.startTime) / 1000, 0) / streams.length
      : 0;

    return {
      totalRevenue,
      activeStreams: active,
      terminatedStreams: terminated,
      completedStreams: completed,
      averageStreamDuration: avgDuration,
    };
  }
}

// ─── Usage Tracker for Metered Billing ───────────────────────────────────────

export class UsageTracker extends EventEmitter {
  private usage = new Map<string, {
    userId: string;
    apiKey: string;
    tier: 'free' | 'pro' | 'enterprise';
    callsThisMonth: number;
    callsToday: number;
    totalSpend: number;
    lastCall: number;
  }>();

  private tierLimits = {
    free: 100,        // 100 calls/month
    pro: 10000,     // 10K calls/month
    enterprise: Infinity,
  };

  private pricing = {
    'agent/list': 0,
    'agent/execute': 0.01,
    'handshake/initiate': 0.05,
    'swarm/coordinate': 0.10,
    'bridge/cross-chain': 0.25,
    'llm/query': 0.001, // per token
    'vera/oasis/think': 0.02,
  };

  /**
   * Record API call
   */
  async recordCall(
    userId: string,
    apiKey: string,
    endpoint: string,
    tier: 'free' | 'pro' | 'enterprise',
    metadata?: { tokens?: number }
  ): Promise<{ allowed: boolean; cost: number; reason?: string }> {
    const key = `${userId}:${apiKey}`;
    let record = this.usage.get(key);

    if (!record) {
      record = {
        userId,
        apiKey,
        tier,
        callsThisMonth: 0,
        callsToday: 0,
        totalSpend: 0,
        lastCall: Date.now(),
      };
      this.usage.set(key, record);
    }

    // Check tier limit
    const limit = this.tierLimits[tier];
    if (record.callsThisMonth >= limit) {
      return { allowed: false, cost: 0, reason: 'Monthly quota exceeded' };
    }

    // Calculate cost
    const baseCost = this.pricing[endpoint as keyof typeof this.pricing] || 0.01;
    const cost = endpoint === 'llm/query' 
      ? baseCost * (metadata?.tokens || 1000)
      : baseCost;

    // Update usage
    record.callsThisMonth++;
    record.callsToday++;
    record.totalSpend += cost;
    record.lastCall = Date.now();

    this.emit('usage_recorded', {
      userId,
      endpoint,
      cost,
      tier,
      callsRemaining: limit - record.callsThisMonth,
    });

    return { allowed: true, cost };
  }

  /**
   * Get usage for user
   */
  getUsage(userId: string, apiKey: string) {
    return this.usage.get(`${userId}:${apiKey}`);
  }

  /**
   * Reset monthly usage (call at month end)
   */
  resetMonthlyUsage(): void {
    for (const [key, record] of this.usage) {
      record.callsThisMonth = 0;
      record.totalSpend = 0;
    }
    this.emit('monthly_reset');
    logger.info('UsageTracker', { message: 'Monthly usage reset' });
  }
}

// ─── Singleton Exports ─────────────────────────────────────────────────────

export const x402Payments = new X402PaymentManager();
export const usageTracker = new UsageTracker();
export default x402Payments;
