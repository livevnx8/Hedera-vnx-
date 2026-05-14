/**
 * Dovu Payment Orchestrator
 * Manages DOVU token payments for verification services
 */

import { Client, ContractExecuteTransaction, ContractFunctionParameters, TransferTransaction, AccountBalanceQuery } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import crypto from 'crypto';

// DOVU Token ID (mainnet)
const DOVU_TOKEN_ID = '0.0.3716059';

// Payment amounts (in smallest token units)
const PAYMENT_AMOUNTS = {
  basicVerification: 100000000, // 1 DOVU
  standardVerification: 500000000, // 5 DOVU
  deepVerification: 1000000000, // 10 DOVU
  batchBonus: 200000000, // 2 DOVU bonus for batches >10
};

export interface PaymentRequest {
  id: string;
  notarizationId: string;
  recipientAccountId: string;
  amount: number;
  paymentType: 'smart_contract' | 'manual' | 'staking_reward';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: number;
  transactionId?: string;
}

export interface StakingPosition {
  id: string;
  stakedAmount: number;
  stakedAt: number;
  lockPeriodDays: number;
  rewardsEarned: number;
  lastRewardClaim: number;
  status: 'active' | 'unstaking' | 'withdrawn';
}

export interface PaymentStats {
  totalPayments: number;
  totalAmount: number;
  pendingPayments: number;
  failedPayments: number;
  averagePaymentAmount: number;
  stakingRewardsEarned: number;
}

export class PaymentOrchestrator {
  private client: Client;
  private paymentRequests = new Map<string, PaymentRequest>();
  private stakingPositions = new Map<string, StakingPosition>();
  private paymentContractId: string | null = null;
  private operatorBalance: number = 0;

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      this.client.setOperator(
        config.HEDERA_OPERATOR_ACCOUNT_ID,
        config.HEDERA_OPERATOR_PRIVATE_KEY
      );
    }

    this.paymentContractId = process.env.DOVU_PAYMENT_CONTRACT_ID || null;
  }

  /**
   * Initialize payment orchestrator
   */
  async initialize(): Promise<void> {
    logger.info('PaymentOrchestrator', { message: 'Initializing payment orchestrator...' });

    // Check operator balance
    await this.updateOperatorBalance();

    logger.info('PaymentOrchestrator', { 
      balance: this.operatorBalance,
      contractId: this.paymentContractId,
      message: 'Payment orchestrator initialized' 
    });
  }

  /**
   * Create payment request for verification work
   */
  async createPaymentRequest(
    notarizationId: string,
    verificationDepth: 'basic' | 'standard' | 'deep',
    batchSize: number = 1
  ): Promise<PaymentRequest> {
    const amount = this.calculatePaymentAmount(verificationDepth, batchSize);
    
    const request: PaymentRequest = {
      id: crypto.randomUUID(),
      notarizationId,
      recipientAccountId: config.HEDERA_OPERATOR_ACCOUNT_ID || '',
      amount,
      paymentType: 'smart_contract',
      status: 'pending',
      timestamp: Date.now(),
    };

    this.paymentRequests.set(request.id, request);

    logger.info('PaymentOrchestrator', { 
      requestId: request.id,
      notarizationId,
      amount,
      verificationDepth,
      message: 'Payment request created' 
    });

    return request;
  }

  /**
   * Process payment via smart contract automation
   */
  async processSmartContractPayment(requestId: string): Promise<boolean> {
    const request = this.paymentRequests.get(requestId);
    if (!request) {
      logger.error('PaymentOrchestrator', { requestId, message: 'Payment request not found' });
      return false;
    }

    if (!this.paymentContractId) {
      logger.warn('PaymentOrchestrator', { message: 'No payment contract configured, using manual transfer' });
      return this.processManualPayment(requestId);
    }

    try {
      request.status = 'processing';

      // Execute smart contract to release payment
      const params = new ContractFunctionParameters()
        .addString(request.notarizationId)
        .addString(request.recipientAccountId)
        .addUint64(request.amount);

      const tx = await new ContractExecuteTransaction()
        .setContractId(this.paymentContractId)
        .setGas(100000)
        .setFunction('releasePayment', params)
        .execute(this.client);

      const receipt = await tx.getReceipt(this.client);
      const record = await tx.getRecord(this.client);

      request.status = receipt.status.toString() === 'SUCCESS' ? 'completed' : 'failed';
      request.transactionId = record.transactionId.toString();

      logger.info('PaymentOrchestrator', { 
        requestId,
        transactionId: request.transactionId,
        status: request.status,
        message: 'Smart contract payment processed' 
      });

      return request.status === 'completed';
    } catch (error) {
      request.status = 'failed';
      logger.error('PaymentOrchestrator', { requestId, error, message: 'Smart contract payment failed' });
      return false;
    }
  }

  /**
   * Process manual payment (token transfer from treasury)
   * Uses self-funded treasury model where operator pays themselves
   */
  async processManualPayment(requestId: string): Promise<boolean> {
    const request = this.paymentRequests.get(requestId);
    if (!request) {
      logger.error('PaymentOrchestrator', { requestId, message: 'Payment request not found' });
      return false;
    }

    try {
      request.status = 'processing';

      // Check treasury balance first
      await this.updateOperatorBalance();
      if (this.operatorBalance < request.amount) {
        logger.warn('PaymentOrchestrator', { 
          balance: this.operatorBalance,
          required: request.amount,
          message: 'Insufficient treasury balance for payment' 
        });
        // Mark as pending for later when treasury is funded
        request.status = 'pending';
        return false;
      }

      // Self-funded model: Transfer from treasury (same account) to claimable balance
      // This represents the "payment" event - the treasury deducts and credits the operator
      const operatorId = config.HEDERA_OPERATOR_ACCOUNT_ID || '';
      
      // In self-funded model, we "spend" from treasury to credit earnings
      // The transfer is symbolic - we're tracking that the work was paid for
      const tx = await new TransferTransaction()
        .addTokenTransfer(DOVU_TOKEN_ID, operatorId, -request.amount)  // Deduct from treasury
        .addTokenTransfer(DOVU_TOKEN_ID, operatorId, request.amount)    // Credit to operator (same account for tracking)
        .setTransactionMemo(`Vera verification payment: ${request.notarizationId}`)
        .execute(this.client);

      const receipt = await tx.getReceipt(this.client);
      const record = await tx.getRecord(this.client);

      request.status = receipt.status.toString() === 'SUCCESS' ? 'completed' : 'failed';
      request.transactionId = record.transactionId.toString();

      // Update balance after transfer
      await this.updateOperatorBalance();

      logger.info('PaymentOrchestrator', { 
        requestId,
        transactionId: request.transactionId,
        amount: request.amount,
        treasuryBalance: this.operatorBalance,
        status: request.status,
        message: 'Treasury payment processed' 
      });

      return request.status === 'completed';
    } catch (error) {
      request.status = 'failed';
      logger.error('PaymentOrchestrator', { requestId, error, message: 'Treasury payment failed' });
      return false;
    }
  }

  /**
   * Create staking position
   */
  async createStakingPosition(amount: number, lockPeriodDays: number = 30): Promise<StakingPosition | null> {
    try {
      const position: StakingPosition = {
        id: crypto.randomUUID(),
        stakedAmount: amount,
        stakedAt: Date.now(),
        lockPeriodDays,
        rewardsEarned: 0,
        lastRewardClaim: Date.now(),
        status: 'active',
      };

      // In production, interact with staking smart contract
      // For now, track locally
      this.stakingPositions.set(position.id, position);

      logger.info('PaymentOrchestrator', { 
        positionId: position.id,
        amount,
        lockPeriodDays,
        message: 'Staking position created' 
      });

      return position;
    } catch (error) {
      logger.error('PaymentOrchestrator', { error, message: 'Failed to create staking position' });
      return null;
    }
  }

  /**
   * Calculate and distribute staking rewards
   */
  async distributeStakingRewards(): Promise<void> {
    const rewardRate = 0.0001; // 0.01% per day
    
    for (const [id, position] of this.stakingPositions) {
      if (position.status !== 'active') continue;

      const daysSinceLastClaim = (Date.now() - position.lastRewardClaim) / (24 * 60 * 60 * 1000);
      const reward = position.stakedAmount * rewardRate * daysSinceLastClaim;

      position.rewardsEarned += reward;
      position.lastRewardClaim = Date.now();

      logger.info('PaymentOrchestrator', { 
        positionId: id,
        reward,
        totalRewards: position.rewardsEarned,
        message: 'Staking rewards calculated' 
      });
    }
  }

  /**
   * Slash staking for incorrect verification
   */
  async slashStaking(positionId: string, percentage: number = 10): Promise<boolean> {
    const position = this.stakingPositions.get(positionId);
    if (!position) {
      logger.error('PaymentOrchestrator', { positionId, message: 'Staking position not found' });
      return false;
    }

    const slashAmount = position.stakedAmount * (percentage / 100);
    position.stakedAmount -= slashAmount;

    logger.warn('PaymentOrchestrator', { 
      positionId,
      slashAmount,
      remainingStake: position.stakedAmount,
      message: 'Staking slashed for incorrect verification' 
    });

    return true;
  }

  /**
   * Get payment statistics
   */
  getPaymentStats(): PaymentStats {
    const payments = Array.from(this.paymentRequests.values());
    const completed = payments.filter(p => p.status === 'completed');
    const failed = payments.filter(p => p.status === 'failed');
    const pending = payments.filter(p => p.status === 'pending' || p.status === 'processing');

    const totalAmount = completed.reduce((sum, p) => sum + p.amount, 0);

    const stakingRewards = Array.from(this.stakingPositions.values())
      .reduce((sum, p) => sum + p.rewardsEarned, 0);

    return {
      totalPayments: completed.length,
      totalAmount,
      pendingPayments: pending.length,
      failedPayments: failed.length,
      averagePaymentAmount: completed.length > 0 ? totalAmount / completed.length : 0,
      stakingRewardsEarned: stakingRewards,
    };
  }

  /**
   * Get operator balance
   */
  async getOperatorBalance(): Promise<number> {
    await this.updateOperatorBalance();
    return this.operatorBalance;
  }

  // Helper methods
  private calculatePaymentAmount(
    depth: 'basic' | 'standard' | 'deep',
    batchSize: number
  ): number {
    let baseAmount = PAYMENT_AMOUNTS[`${depth}Verification`];
    
    // Add batch bonus for large batches
    if (batchSize > 10) {
      baseAmount += PAYMENT_AMOUNTS.batchBonus * Math.floor(batchSize / 10);
    }

    return baseAmount;
  }

  private async updateOperatorBalance(): Promise<void> {
    try {
      const query = new AccountBalanceQuery()
        .setAccountId(config.HEDERA_OPERATOR_ACCOUNT_ID || '');
      
      const balance = await query.execute(this.client);
      
      // Get DOVU token balance if available
      const tokenBalances = balance.tokens?._map;
      if (tokenBalances && tokenBalances.has(DOVU_TOKEN_ID)) {
        this.operatorBalance = tokenBalances.get(DOVU_TOKEN_ID) || 0;
      } else {
        this.operatorBalance = balance.hbars.toTinybars().toNumber();
      }
    } catch (error) {
      logger.error('PaymentOrchestrator', { error, message: 'Failed to update balance' });
    }
  }

  /**
   * Get all pending payments
   */
  getPendingPayments(): PaymentRequest[] {
    return Array.from(this.paymentRequests.values())
      .filter(p => p.status === 'pending' || p.status === 'processing');
  }

  /**
   * Get staking positions
   */
  getStakingPositions(): StakingPosition[] {
    return Array.from(this.stakingPositions.values());
  }
}

// Singleton instance
export const paymentOrchestrator = new PaymentOrchestrator();
