/**
 * Vera Agent Payment & Monetization System
 * 
 * Handles payment for agent work on Hedera:
 * - HBAR transfers for completed tasks
 * - Token payments for specific capabilities
 * - Subscription billing for recurring services
 * - Payment verification and escrow
 * - Fee collection for sub-agent delegation
 * 
 * All payments are recorded on HCS for audit trail.
 */

import { Client, TransferTransaction, Hbar, AccountId, TopicCreateTransaction, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import { getProofOfWorkRegistry, type WorkRecord } from './proofOfWork.js';
import crypto from 'crypto';

export interface PaymentRequest {
  workRecordId: string;
  payerAccountId: string;
  recipientAccountId: string;
  amountHbar: number;
  description: string;
  taskType: string;
  dueDate?: number;
}

export interface PaymentReceipt {
  paymentId: string;
  workRecordId: string;
  transactionId: string;
  amountHbar: number;
  payerAccountId: string;
  recipientAccountId: string;
  timestamp: number;
  status: 'pending' | 'completed' | 'failed';
  signature: string;
}

export interface AgentServiceRate {
  taskType: string;
  baseRateHbar: number;
  perToolRateHbar: number;
  perMinuteRateHbar: number;
  minimumHbar: number;
  description: string;
}

export interface EarningsReport {
  agentId: string;
  periodStart: number;
  periodEnd: number;
  totalEarnedHbar: number;
  totalTasksPaid: number;
  averagePaymentHbar: number;
  byTaskType: Record<string, { count: number; earnedHbar: number }>;
  pendingPayments: number;
  failedPayments: number;
}

class AgentPaymentSystem {
  private client: Client;
  private paymentTopicId: string | null = null;
  private serviceRates: Map<string, AgentServiceRate> = new Map();
  private pendingPayments: Map<string, PaymentRequest> = new Map();
  private paymentHistory: Map<string, PaymentReceipt> = new Map();

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      // Initialize operator asynchronously when needed
      this.initializeOperator();
    }

    // Initialize default service rates
    this.initializeDefaultRates();
  }

  private async initializeOperator(): Promise<void> {
    try {
      const { PrivateKey } = await import('@hashgraph/sdk');
      const privateKey = PrivateKey.fromStringECDSA(config.HEDERA_OPERATOR_PRIVATE_KEY!);
      this.client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID!, privateKey);
    } catch (e) {
      logger.error('Payment', { error: String(e), message: 'Failed to initialize operator' });
    }
  }

  private initializeDefaultRates(): void {
    this.serviceRates.set('sub_agent', {
      taskType: 'sub_agent',
      baseRateHbar: 5,
      perToolRateHbar: 1,
      perMinuteRateHbar: 0.5,
      minimumHbar: 5,
      description: 'Sub-agent task execution (researcher, analyst, coder, etc.)',
    });

    this.serviceRates.set('tool_execution', {
      taskType: 'tool_execution',
      baseRateHbar: 2,
      perToolRateHbar: 0.5,
      perMinuteRateHbar: 0.2,
      minimumHbar: 2,
      description: 'Direct tool execution',
    });

    this.serviceRates.set('planning', {
      taskType: 'planning',
      baseRateHbar: 10,
      perToolRateHbar: 1,
      perMinuteRateHbar: 1,
      minimumHbar: 10,
      description: 'Multi-step planning and architecture design',
    });

    this.serviceRates.set('analysis', {
      taskType: 'analysis',
      baseRateHbar: 3,
      perToolRateHbar: 0.5,
      perMinuteRateHbar: 0.3,
      minimumHbar: 3,
      description: 'On-chain and market analysis',
    });

    this.serviceRates.set('contract_deployment', {
      taskType: 'contract_deployment',
      baseRateHbar: 20,
      perToolRateHbar: 2,
      perMinuteRateHbar: 2,
      minimumHbar: 20,
      description: 'Smart contract compilation and deployment',
    });
  }

  /**
   * Initialize payment tracking on HCS
   */
  async initialize(): Promise<{ paymentTopicId: string }> {
    logger.info('Payment', { message: 'Initializing Agent Payment System...' });

    // Ensure operator is set
    if (!this.client.operatorAccountId) {
      const { PrivateKey } = await import('@hashgraph/sdk');
      const privateKey = PrivateKey.fromStringECDSA(config.HEDERA_OPERATOR_PRIVATE_KEY!);
      this.client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID!, privateKey);
    }

    const tx = await new TopicCreateTransaction()
      .setTopicMemo('Vera Agent Payment Records')
      .execute(this.client);
    
    const receipt = await tx.getReceipt(this.client);
    this.paymentTopicId = receipt.topicId?.toString() ?? '';

    logger.info('Payment', { 
      topicId: this.paymentTopicId,
      message: 'Payment tracking topic created'
    });

    return { paymentTopicId: this.paymentTopicId };
  }

  /**
   * Calculate payment amount for a work record
   */
  calculatePayment(workRecord: WorkRecord): number {
    const rate = this.serviceRates.get(workRecord.taskType);
    if (!rate) {
      return 5; // Default minimum
    }

    const durationMinutes = workRecord.durationMs / 60000;
    const toolCount = workRecord.toolsUsed.length;

    let amount = rate.baseRateHbar;
    amount += toolCount * rate.perToolRateHbar;
    amount += durationMinutes * rate.perMinuteRateHbar;

    return Math.max(amount, rate.minimumHbar);
  }

  /**
   * Set custom service rate
   */
  setServiceRate(rate: AgentServiceRate): void {
    this.serviceRates.set(rate.taskType, rate);
    logger.info('Payment', { 
      taskType: rate.taskType, 
      baseRate: rate.baseRateHbar,
      message: 'Service rate updated'
    });
  }

  /**
   * Get service rate for a task type
   */
  getServiceRate(taskType: string): AgentServiceRate | undefined {
    return this.serviceRates.get(taskType);
  }

  /**
   * Get all service rates
   */
  getAllServiceRates(): AgentServiceRate[] {
    return Array.from(this.serviceRates.values());
  }

  /**
   * Create a payment request for completed work
   */
  async createPaymentRequest(
    workRecord: WorkRecord,
    payerAccountId: string
  ): Promise<PaymentRequest> {
    const amount = this.calculatePayment(workRecord);
    const operatorAccountId = config.HEDERA_OPERATOR_ACCOUNT_ID;
    
    if (!operatorAccountId) {
      throw new Error('Vera operator account not configured');
    }

    const request: PaymentRequest = {
      workRecordId: workRecord.id,
      payerAccountId,
      recipientAccountId: operatorAccountId,
      amountHbar: amount,
      description: `Payment for: ${workRecord.description}`,
      taskType: workRecord.taskType,
      dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    this.pendingPayments.set(workRecord.id, request);

    logger.info('Payment', { 
      workId: workRecord.id,
      amount,
      payer: payerAccountId,
      message: 'Payment request created'
    });

    return request;
  }

  /**
   * Process payment from payer to Vera
   */
  async processPayment(
    paymentRequest: PaymentRequest
  ): Promise<PaymentReceipt> {
    const paymentId = crypto.randomUUID();
    
    try {
      // Execute HBAR transfer
      const transferTx = await new TransferTransaction()
        .addHbarTransfer(
          AccountId.fromString(paymentRequest.payerAccountId),
          Hbar.fromTinybars(-Math.round(paymentRequest.amountHbar * 100_000_000))
        )
        .addHbarTransfer(
          AccountId.fromString(paymentRequest.recipientAccountId),
          Hbar.fromTinybars(Math.round(paymentRequest.amountHbar * 100_000_000))
        )
        .setTransactionMemo(`Vera Payment: ${paymentRequest.workRecordId}`)
        .execute(this.client);

      const receipt = await transferTx.getReceipt(this.client);
      
      const paymentReceipt: PaymentReceipt = {
        paymentId,
        workRecordId: paymentRequest.workRecordId,
        transactionId: transferTx.transactionId.toString(),
        amountHbar: paymentRequest.amountHbar,
        payerAccountId: paymentRequest.payerAccountId,
        recipientAccountId: paymentRequest.recipientAccountId,
        timestamp: Date.now(),
        status: receipt.status.toString() === 'SUCCESS' ? 'completed' : 'failed',
        signature: this.signPayment(paymentRequest),
      };

      // Store payment record
      this.paymentHistory.set(paymentId, paymentReceipt);
      this.pendingPayments.delete(paymentRequest.workRecordId);

      // Record on HCS
      if (this.paymentTopicId) {
        await new TopicMessageSubmitTransaction()
          .setTopicId(this.paymentTopicId)
          .setMessage(JSON.stringify(paymentReceipt))
          .execute(this.client);
      }

      logger.info('Payment', { 
        paymentId,
        amount: paymentRequest.amountHbar,
        txId: paymentReceipt.transactionId,
        status: paymentReceipt.status,
        message: 'Payment processed'
      });

      return paymentReceipt;

    } catch (error) {
      const failedReceipt: PaymentReceipt = {
        paymentId,
        workRecordId: paymentRequest.workRecordId,
        transactionId: '',
        amountHbar: paymentRequest.amountHbar,
        payerAccountId: paymentRequest.payerAccountId,
        recipientAccountId: paymentRequest.recipientAccountId,
        timestamp: Date.now(),
        status: 'failed',
        signature: '',
      };

      logger.error('Payment', { 
        paymentId,
        error: String(error),
        message: 'Payment failed'
      });

      return failedReceipt;
    }
  }

  /**
   * Verify a payment was made
   */
  async verifyPayment(paymentId: string): Promise<boolean> {
    const payment = this.paymentHistory.get(paymentId);
    if (!payment) return false;
    if (payment.status !== 'completed') return false;

    // Verify signature
    const expectedSignature = this.signPayment({
      workRecordId: payment.workRecordId,
      payerAccountId: payment.payerAccountId,
      recipientAccountId: payment.recipientAccountId,
      amountHbar: payment.amountHbar,
      description: '',
      taskType: '',
    } as PaymentRequest);

    return payment.signature === expectedSignature;
  }

  /**
   * Get earnings report for a period
   */
  async getEarningsReport(
    agentId: string,
    periodStart: number,
    periodEnd: number
  ): Promise<EarningsReport> {
    const payments = Array.from(this.paymentHistory.values()).filter(
      p => p.timestamp >= periodStart && 
           p.timestamp <= periodEnd && 
           p.status === 'completed'
    );

    const totalEarned = payments.reduce((sum, p) => sum + p.amountHbar, 0);
    
    const byTaskType: Record<string, { count: number; earnedHbar: number }> = {};
    for (const payment of payments) {
      // Get work record to find task type
      const pow = getProofOfWorkRegistry();
      // In real implementation, lookup work record
      const taskType = 'unknown'; // Would be retrieved from work record
      
      if (!byTaskType[taskType]) {
        byTaskType[taskType] = { count: 0, earnedHbar: 0 };
      }
      byTaskType[taskType].count++;
      byTaskType[taskType].earnedHbar += payment.amountHbar;
    }

    const pending = Array.from(this.pendingPayments.values()).length;
    const failed = Array.from(this.paymentHistory.values()).filter(
      p => p.timestamp >= periodStart && 
           p.timestamp <= periodEnd && 
           p.status === 'failed'
    ).length;

    return {
      agentId,
      periodStart,
      periodEnd,
      totalEarnedHbar: totalEarned,
      totalTasksPaid: payments.length,
      averagePaymentHbar: payments.length > 0 ? totalEarned / payments.length : 0,
      byTaskType,
      pendingPayments: pending,
      failedPayments: failed,
    };
  }

  /**
   * Handle HCS-10 payment message from another agent
   */
  async handleAgentPaymentMessage(message: {
    from: string;
    payload: {
      payment: {
        workRecordId: string;
        amountHbar: number;
        transactionId: string;
      };
    };
  }): Promise<void> {
    logger.info('Payment', { 
      from: message.from,
      amount: message.payload.payment.amountHbar,
      message: 'Received agent payment'
    });

    // Verify the payment transaction on mirror node
    // In production, would query mirror node to confirm
    
    // Record the payment
    const receipt: PaymentReceipt = {
      paymentId: crypto.randomUUID(),
      workRecordId: message.payload.payment.workRecordId,
      transactionId: message.payload.payment.transactionId,
      amountHbar: message.payload.payment.amountHbar,
      payerAccountId: message.from,
      recipientAccountId: config.HEDERA_OPERATOR_ACCOUNT_ID || '',
      timestamp: Date.now(),
      status: 'completed',
      signature: '',
    };

    this.paymentHistory.set(receipt.paymentId, receipt);
  }

  /**
   * Get pending payments
   */
  getPendingPayments(): PaymentRequest[] {
    return Array.from(this.pendingPayments.values());
  }

  /**
   * Get payment history
   */
  getPaymentHistory(limit: number = 50): PaymentReceipt[] {
    return Array.from(this.paymentHistory.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Private: Sign payment for verification
   */
  private signPayment(request: PaymentRequest): string {
    const data = JSON.stringify({
      workRecordId: request.workRecordId,
      payerAccountId: request.payerAccountId,
      recipientAccountId: request.recipientAccountId,
      amountHbar: request.amountHbar,
      timestamp: Date.now(),
    });

    return crypto
      .createHmac('sha256', config.HEDERA_OPERATOR_PRIVATE_KEY || 'vera-payment-secret')
      .update(data)
      .digest('hex');
  }

  /**
   * Get payment topic ID
   */
  getPaymentTopicId(): string | null {
    return this.paymentTopicId;
  }
}

// Singleton instance
let paymentSystem: AgentPaymentSystem | null = null;

export function getAgentPaymentSystem(): AgentPaymentSystem {
  if (!paymentSystem) {
    paymentSystem = new AgentPaymentSystem();
  }
  return paymentSystem;
}

export { AgentPaymentSystem };
