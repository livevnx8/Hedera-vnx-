/**
 * Vera Lattice Micropayments
 * 
 * Reward alignment via lattice scores - faucet system integrated with HTS.
 * 
 * Key Concepts:
 * - Lattice score > threshold triggers micropayment
 * - HTS batch drips using join operations for multi-recipient
 * - Alignment-based rewards: better coordination = more earnings
 * - HCS logging of all payments for audit trail
 */

import { logger } from '../monitoring/logger.js';
import { veraHCS } from '../dovu/veraHCS.js';

// Micropayment configuration
export interface FaucetConfig {
  threshold: number;      // Minimum lattice score to qualify (0.0-1.0)
  baseAmount: number;     // Base tinybar amount
  scoreMultiplier: number; // Multiply by score for final amount
  batchSize: number;      // Batch payments to save gas
  cooldownMs: number;     // Minimum time between payments to same agent
}

// Payment record
export interface LatticePayment {
  id: string;
  agentId: string;
  score: number;
  amount: number;
  timestamp: number;
  transactionId?: string;
  hcsSequence?: number;
}

// Agent payment tracking
export interface AgentLedger {
  agentId: string;
  totalEarned: number;
  paymentCount: number;
  lastPayment: number;
  payments: LatticePayment[];
  averageScore: number;
}

/**
 * Vera Lattice Faucet - Score-based micropayments
 */
export class VeraLatticeFaucet {
  private config: FaucetConfig = {
    threshold: 0.85,      // 85% alignment required
    baseAmount: 1000,     // 0.00001 HBAR base
    scoreMultiplier: 10000, // 0.1 HBAR max for 100% score
    batchSize: 10,
    cooldownMs: 5000      // 5 second cooldown
  };

  private ledgers: Map<string, AgentLedger> = new Map();
  private pendingPayments: LatticePayment[] = [];
  private totalDistributed: number = 0;
  private paymentCount: number = 0;

  async initialize(config?: Partial<FaucetConfig>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    logger.info('VeraLatticeFaucet', {
      threshold: this.config.threshold,
      baseAmount: this.config.baseAmount,
      message: 'Lattice faucet initialized'
    });

    // Start batch processor
    this.startBatchProcessor();
  }

  /**
   * Evaluate agent performance and trigger payment if worthy
   */
  async evaluateAndReward(agentId: string, score: number): Promise<LatticePayment | null> {
    // Check threshold
    if (score < this.config.threshold) {
      logger.debug('VeraLatticeFaucet', { agentId, score, threshold: this.config.threshold, message: 'Below threshold' });
      return null;
    }

    // Get or create ledger
    let ledger = this.ledgers.get(agentId);
    if (!ledger) {
      ledger = {
        agentId,
        totalEarned: 0,
        paymentCount: 0,
        lastPayment: 0,
        payments: [],
        averageScore: 0
      };
      this.ledgers.set(agentId, ledger);
    }

    // Check cooldown
    const now = Date.now();
    if (now - ledger.lastPayment < this.config.cooldownMs) {
      logger.debug('VeraLatticeFaucet', { agentId, cooldown: this.config.cooldownMs, message: 'Cooldown active' });
      return null;
    }

    // Calculate reward
    const amount = this.calculateReward(score);

    // Create payment record
    const payment: LatticePayment = {
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      agentId,
      score,
      amount,
      timestamp: now
    };

    // Add to pending batch
    this.pendingPayments.push(payment);

    // Update ledger
    ledger.lastPayment = now;
    ledger.averageScore = (ledger.averageScore * ledger.paymentCount + score) / (ledger.paymentCount + 1);

    logger.info('VeraLatticeFaucet', {
      agentId,
      score: (score * 100).toFixed(1) + '%',
      amount: `${amount} tinybar (${(amount / 100000000).toFixed(8)} HBAR)`,
      message: 'Payment queued'
    });

    // If batch is full, process immediately
    if (this.pendingPayments.length >= this.config.batchSize) {
      await this.processBatch();
    }

    return payment;
  }

  /**
   * Calculate reward based on lattice score
   * Higher alignment = higher reward
   */
  private calculateReward(score: number): number {
    // Linear scaling: base + (score * multiplier)
    const scaled = Math.floor(this.config.baseAmount + (score * this.config.scoreMultiplier));
    
    // Bonus for exceptional performance (>95%)
    if (score > 0.95) {
      return Math.floor(scaled * 1.5);
    }
    
    // Bonus for excellent performance (>90%)
    if (score > 0.90) {
      return Math.floor(scaled * 1.2);
    }
    
    return scaled;
  }

  /**
   * Process batch of pending payments
   * Uses join operation to aggregate payments efficiently
   */
  private async processBatch(): Promise<void> {
    if (this.pendingPayments.length === 0) return;

    const batch = [...this.pendingPayments];
    this.pendingPayments = [];

    logger.info('VeraLatticeFaucet', {
      batchSize: batch.length,
      totalAmount: batch.reduce((sum, p) => sum + p.amount, 0),
      message: 'Processing payment batch'
    });

    // Join payments by agent for efficiency
    const joinedByAgent = this.joinPaymentsByAgent(batch);

    // Execute payments (mock for now - would use HTS in production)
    for (const [agentId, payment] of joinedByAgent) {
      await this.executePayment(agentId, payment);
    }

    // Log batch to HCS
    await this.logBatchToHCS(batch);
  }

  /**
   * Join multiple payments to same agent into single transaction
   */
  private joinPaymentsByAgent(payments: LatticePayment[]): Map<string, LatticePayment> {
    const joined = new Map<string, LatticePayment>();

    for (const payment of payments) {
      if (joined.has(payment.agentId)) {
        // Join: sum amounts, average scores
        const existing = joined.get(payment.agentId)!;
        existing.amount += payment.amount;
        existing.score = (existing.score + payment.score) / 2;
      } else {
        joined.set(payment.agentId, { ...payment });
      }
    }

    return joined;
  }

  /**
   * Execute single payment (mock - would use HTS transfer)
   */
  private async executePayment(agentId: string, payment: LatticePayment): Promise<void> {
    // In production: use HTS to transfer HBAR to agent wallet
    // For now: simulate and track
    
    const ledger = this.ledgers.get(agentId)!;
    ledger.totalEarned += payment.amount;
    ledger.paymentCount++;
    ledger.payments.push(payment);

    this.totalDistributed += payment.amount;
    this.paymentCount++;

    payment.transactionId = `mock-tx-${Date.now()}`;

    logger.debug('VeraLatticeFaucet', {
      agentId,
      amount: payment.amount,
      txId: payment.transactionId,
      message: 'Payment executed'
    });
  }

  /**
   * Log batch to HCS for audit trail
   */
  private async logBatchToHCS(batch: LatticePayment[]): Promise<void> {
    const batchSummary = {
      type: 'LATTICE_PAYMENT_BATCH',
      timestamp: Date.now(),
      count: batch.length,
      totalAmount: batch.reduce((sum, p) => sum + p.amount, 0),
      agents: [...new Set(batch.map(p => p.agentId))],
      averageScore: batch.reduce((sum, p) => sum + p.score, 0) / batch.length,
      hash: this.hashBatch(batch)
    };

    try {
      await veraHCS.logPayment({
        invoiceId: `batch-${Date.now()}`,
        amount: batchSummary.totalAmount,
        fromAccount: 'veralattice-faucet',
        transactionId: batchSummary.hash,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.debug('VeraLatticeFaucet', { error, message: 'HCS log failed' });
    }
  }

  private hashBatch(batch: LatticePayment[]): string {
    const data = batch.map(p => `${p.agentId}:${p.amount}`).join(',');
    return Buffer.from(data).toString('base64').slice(0, 16);
  }

  /**
   * Start periodic batch processor
   */
  private startBatchProcessor(): void {
    // Process any remaining payments every 10 seconds
    setInterval(() => {
      if (this.pendingPayments.length > 0) {
        this.processBatch();
      }
    }, 10000);
  }

  /**
   * Get faucet statistics
   */
  getFaucetStats(): any {
    const pendingAmount = this.pendingPayments.reduce((sum, p) => sum + p.amount, 0);
    
    return {
      totalDistributed: this.totalDistributed,
      totalDistributedHBAR: (this.totalDistributed / 100000000).toFixed(8),
      paymentCount: this.paymentCount,
      pendingPayments: this.pendingPayments.length,
      pendingAmount: pendingAmount,
      pendingAmountHBAR: (pendingAmount / 100000000).toFixed(8),
      agentCount: this.ledgers.size,
      averagePayment: this.paymentCount > 0 
        ? Math.floor(this.totalDistributed / this.paymentCount) 
        : 0,
      config: this.config
    };
  }

  /**
   * Get individual agent ledger
   */
  getAgentLedger(agentId: string): AgentLedger | undefined {
    return this.ledgers.get(agentId);
  }

  /**
   * Get all agent ledgers
   */
  getAllLedgers(): AgentLedger[] {
    return Array.from(this.ledgers.values());
  }

  /**
   * Force process pending payments (for shutdown)
   */
  async flush(): Promise<void> {
    if (this.pendingPayments.length > 0) {
      await this.processBatch();
    }
  }
}

// Export singleton
export const veraLatticeFaucet = new VeraLatticeFaucet();
