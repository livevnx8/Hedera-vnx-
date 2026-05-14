/**
 * Agent-to-Agent Payment System (A2A)
 * 
 * Handles autonomous payments between agents with escrow,
 * multi-token support, and dispute resolution.
 */

import { logger } from '../monitoring/logger.js';
import type { A2ATransaction, EscrowRecord } from './types.js';

interface PaymentConfig {
  escrowTimeoutMs: number;
  platformFeePercent: number;
  supportedTokens: string[];
  minEscrowAmount: number;
  maxEscrowAmount: number;
}

export class A2APaymentSystem {
  private transactions: Map<string, A2ATransaction> = new Map();
  private escrows: Map<string, EscrowRecord> = new Map();
  private config: PaymentConfig;
  private balanceSheet: Map<string, Map<string, number>> = new Map(); // agentId -> token -> balance

  constructor(config: Partial<PaymentConfig> = {}) {
    this.config = {
      escrowTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
      platformFeePercent: 2.5,
      supportedTokens: ['HBAR'],
      minEscrowAmount: 1,
      maxEscrowAmount: 1000000,
      ...config
    };
  }

  /**
   * Initialize a new A2A transaction with escrow
   */
  async createTransaction(
    buyerAgentId: string,
    sellerAgentId: string,
    serviceId: string,
    amount: number,
    tokenId: string = 'HBAR'
  ): Promise<A2ATransaction> {
    try {
      // Validate amount
      if (amount < this.config.minEscrowAmount || amount > this.config.maxEscrowAmount) {
        throw new Error(`Amount ${amount} outside allowed range`);
      }

      // Check supported token
      if (!this.config.supportedTokens.includes(tokenId)) {
        throw new Error(`Token ${tokenId} not supported`);
      }

      // Check buyer balance
      const buyerBalance = this.getBalance(buyerAgentId, tokenId);
      if (buyerBalance < amount) {
        throw new Error(`Insufficient balance: ${buyerBalance} < ${amount}`);
      }

      const txId = `a2a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = Date.now();

      const transaction: A2ATransaction = {
        txId,
        buyerAgentId,
        sellerAgentId,
        serviceId,
        amount,
        tokenId,
        status: 'escrow',
        escrowReleaseTime: now + this.config.escrowTimeoutMs,
        buyerApproved: false,
        sellerApproved: false,
        createdAt: now
      };

      // Lock funds in escrow
      this.deductBalance(buyerAgentId, tokenId, amount);

      const escrow: EscrowRecord = {
        escrowId: `escrow-${txId}`,
        txId,
        amount,
        tokenId,
        buyerId: buyerAgentId,
        sellerId: sellerAgentId,
        releaseConditions: {
          buyerApproval: false,
          sellerApproval: false,
          timeout: transaction.escrowReleaseTime
        },
        status: 'locked',
        createdAt: now
      };

      this.transactions.set(txId, transaction);
      this.escrows.set(escrow.escrowId, escrow);

      logger.info('A2APaymentSystem', {
        message: 'A2A transaction created',
        txId,
        buyer: buyerAgentId,
        seller: sellerAgentId,
        amount,
        tokenId
      });

      return transaction;

    } catch (error) {
      logger.error('A2APaymentSystem', {
        message: 'Transaction creation failed',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Approve transaction completion (buyer or seller)
   */
  async approveTransaction(txId: string, approverId: string): Promise<A2ATransaction> {
    const transaction = this.transactions.get(txId);
    if (!transaction) {
      throw new Error(`Transaction ${txId} not found`);
    }

    if (transaction.status !== 'escrow') {
      throw new Error(`Transaction not in escrow (current: ${transaction.status})`);
    }

    const escrow = this.getEscrowForTransaction(txId);
    if (!escrow) {
      throw new Error(`Escrow not found for transaction ${txId}`);
    }

    // Check approver is buyer or seller
    if (approverId === transaction.buyerAgentId) {
      transaction.buyerApproved = true;
      escrow.releaseConditions.buyerApproval = true;
    } else if (approverId === transaction.sellerAgentId) {
      transaction.sellerApproved = true;
      escrow.releaseConditions.sellerApproval = true;
    } else {
      throw new Error('Approver is not buyer or seller');
    }

    // Check if both approved - release funds
    if (transaction.buyerApproved && transaction.sellerApproved) {
      await this.releaseEscrow(txId);
    }

    logger.info('A2APaymentSystem', {
      message: 'Transaction approved',
      txId,
      approver: approverId,
      buyerApproved: transaction.buyerApproved,
      sellerApproved: transaction.sellerApproved
    });

    return transaction;
  }

  /**
   * Raise dispute on transaction
   */
  async disputeTransaction(txId: string, reason: string, disputerId: string): Promise<A2ATransaction> {
    const transaction = this.transactions.get(txId);
    if (!transaction) {
      throw new Error(`Transaction ${txId} not found`);
    }

    if (transaction.status !== 'escrow') {
      throw new Error('Can only dispute escrow transactions');
    }

    // Verify disputer is buyer or seller
    if (disputerId !== transaction.buyerAgentId && disputerId !== transaction.sellerAgentId) {
      throw new Error('Only buyer or seller can dispute');
    }

    transaction.status = 'disputed';
    transaction.disputeReason = reason;

    const escrow = this.getEscrowForTransaction(txId);
    if (escrow) {
      escrow.status = 'locked'; // Keep locked during dispute
    }

    logger.warn('A2APaymentSystem', {
      message: 'Transaction disputed',
      txId,
      disputer: disputerId,
      reason
    });

    return transaction;
  }

  /**
   * Arbiter resolves dispute
   */
  async resolveDispute(txId: string, decision: 'release' | 'refund', arbiterId: string): Promise<A2ATransaction> {
    const transaction = this.transactions.get(txId);
    if (!transaction) {
      throw new Error(`Transaction ${txId} not found`);
    }

    if (transaction.status !== 'disputed') {
      throw new Error('Transaction not in dispute');
    }

    const escrow = this.getEscrowForTransaction(txId);
    if (!escrow) {
      throw new Error(`Escrow not found for transaction ${txId}`);
    }

    escrow.releaseConditions.arbiterDecision = decision;

    if (decision === 'release') {
      // Release to seller
      await this.releaseEscrow(txId);
    } else {
      // Refund to buyer
      await this.refundEscrow(txId);
    }

    logger.info('A2APaymentSystem', {
      message: 'Dispute resolved',
      txId,
      decision,
      arbiter: arbiterId
    });

    return transaction;
  }

  /**
   * Get transaction details
   */
  getTransaction(txId: string): A2ATransaction | undefined {
    return this.transactions.get(txId);
  }

  /**
   * Get agent's transaction history
   */
  getAgentTransactions(agentId: string): A2ATransaction[] {
    return Array.from(this.transactions.values()).filter(
      tx => tx.buyerAgentId === agentId || tx.sellerAgentId === agentId
    );
  }

  /**
   * Credit agent balance (e.g., from completed service)
   */
  creditBalance(agentId: string, tokenId: string, amount: number): void {
    if (!this.balanceSheet.has(agentId)) {
      this.balanceSheet.set(agentId, new Map());
    }
    
    const agentBalances = this.balanceSheet.get(agentId)!;
    const currentBalance = agentBalances.get(tokenId) || 0;
    agentBalances.set(tokenId, currentBalance + amount);

    logger.debug('A2APaymentSystem', {
      message: 'Balance credited',
      agentId,
      tokenId,
      amount,
      newBalance: currentBalance + amount
    });
  }

  /**
   * Get agent balance
   */
  getBalance(agentId: string, tokenId: string): number {
    return this.balanceSheet.get(agentId)?.get(tokenId) || 0;
  }

  /**
   * Get all balances for agent
   */
  getAllBalances(agentId: string): Record<string, number> {
    const balances = this.balanceSheet.get(agentId);
    if (!balances) return {};
    return Object.fromEntries(balances);
  }

  /**
   * Check for expired escrows and auto-refund
   */
  async processExpiredEscrows(): Promise<number> {
    const now = Date.now();
    let processed = 0;

    for (const [txId, transaction] of this.transactions) {
      if (transaction.status === 'escrow' && now > transaction.escrowReleaseTime) {
        if (!transaction.buyerApproved && !transaction.sellerApproved) {
          // Auto-refund if neither party approved
          await this.refundEscrow(txId);
          processed++;
        }
      }
    }

    if (processed > 0) {
      logger.info('A2APaymentSystem', {
        message: 'Processed expired escrows',
        count: processed
      });
    }

    return processed;
  }

  /**
   * Get payment system statistics
   */
  getStats() {
    const timestamp = Date.now();
    const transactions = Array.from(this.transactions.values());
    
    return {
      timestamp,
      totalTransactions: transactions.length,
      pendingEscrow: transactions.filter(tx => tx.status === 'escrow').length,
      completed: transactions.filter(tx => tx.status === 'completed').length,
      disputed: transactions.filter(tx => tx.status === 'disputed').length,
      refunded: transactions.filter(tx => tx.status === 'refunded').length,
      totalVolume: transactions.reduce((sum, tx) => sum + tx.amount, 0),
      lockedInEscrow: Array.from(this.escrows.values())
        .filter(e => e.status === 'locked')
        .reduce((sum, e) => sum + e.amount, 0),
      config: this.config
    };
  }

  // Private methods
  private deductBalance(agentId: string, tokenId: string, amount: number): void {
    if (!this.balanceSheet.has(agentId)) {
      this.balanceSheet.set(agentId, new Map());
    }
    
    const agentBalances = this.balanceSheet.get(agentId)!;
    const currentBalance = agentBalances.get(tokenId) || 0;
    
    if (currentBalance < amount) {
      throw new Error('Insufficient balance');
    }
    
    agentBalances.set(tokenId, currentBalance - amount);
  }

  private async releaseEscrow(txId: string): Promise<void> {
    const transaction = this.transactions.get(txId);
    if (!transaction) return;

    const escrow = this.getEscrowForTransaction(txId);
    if (!escrow) return;

    // Calculate platform fee
    const platformFee = Math.ceil(transaction.amount * (this.config.platformFeePercent / 100));
    const sellerAmount = transaction.amount - platformFee;

    // Credit seller (minus fee)
    this.creditBalance(transaction.sellerAgentId, transaction.tokenId, sellerAmount);

    // Mark completed
    transaction.status = 'completed';
    transaction.completedAt = Date.now();
    escrow.status = 'released';

    logger.info('A2APaymentSystem', {
      message: 'Escrow released to seller',
      txId,
      seller: transaction.sellerAgentId,
      amount: sellerAmount,
      fee: platformFee
    });
  }

  private async refundEscrow(txId: string): Promise<void> {
    const transaction = this.transactions.get(txId);
    if (!transaction) return;

    const escrow = this.getEscrowForTransaction(txId);
    if (!escrow) return;

    // Refund buyer
    this.creditBalance(transaction.buyerAgentId, transaction.tokenId, transaction.amount);

    // Mark refunded
    transaction.status = 'refunded';
    transaction.completedAt = Date.now();
    escrow.status = 'refunded';

    logger.info('A2APaymentSystem', {
      message: 'Escrow refunded to buyer',
      txId,
      buyer: transaction.buyerAgentId,
      amount: transaction.amount
    });
  }

  private getEscrowForTransaction(txId: string): EscrowRecord | undefined {
    return Array.from(this.escrows.values()).find(e => e.txId === txId);
  }
}

// Singleton
let paymentInstance: A2APaymentSystem | null = null;

export function getA2APaymentSystem(config?: Partial<PaymentConfig>): A2APaymentSystem {
  if (!paymentInstance) {
    paymentInstance = new A2APaymentSystem(config);
  }
  return paymentInstance;
}
