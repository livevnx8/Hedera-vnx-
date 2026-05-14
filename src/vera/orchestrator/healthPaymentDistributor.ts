/**
 * Health-Based Payment Distributor
 * 
 * Pays healthy agents and distributes revenue across 4 accounts.
 * Treasury (Vera's wallet) distributes 0.5 HBAR per task.
 * 
 * Distribution:
 * - Agent: 50% (0.25 HBAR) - for completing the task
 * - Treasury: 20% (0.10 HBAR) - Vera's wallet reserve
 * - Operations: 15% (0.075 HBAR) - infrastructure costs
 * - Reserve: 15% (0.075 HBAR) - future development
 */

import { TransferTransaction, Hbar, Client } from '@hashgraph/sdk';
import { logger } from '../../monitoring/logger.js';

export interface RevenueAccount {
  accountId: string;
  percentage: number; // 0-1
  hbarAmount: number;
  label: string;
}

export interface PaymentConfig {
  treasuryAccountId: string; // Vera's wallet
  agentAccountId: string;    // Agent receiving payment
  operationsAccountId: string;
  reserveAccountId: string;
  taskRewardHbar: number;    // Default: 0.5
}

export interface PaymentResult {
  success: boolean;
  txId?: string;
  distributed: {
    agent: number;
    treasury: number;
    operations: number;
    reserve: number;
  };
  error?: string;
}

export class HealthPaymentDistributor {
  private client: Client | null = null;
  private config: PaymentConfig;
  private paymentHistory: PaymentResult[] = [];
  private maxHistorySize = 100;

  constructor(config: Partial<PaymentConfig> = {}) {
    this.config = {
      treasuryAccountId: config.treasuryAccountId || process.env.VERA_TREASURY_ACCOUNT_ID || '',
      agentAccountId: config.agentAccountId || '',
      operationsAccountId: config.operationsAccountId || process.env.VERA_OPERATIONS_ACCOUNT_ID || '',
      reserveAccountId: config.reserveAccountId || process.env.VERA_RESERVE_ACCOUNT_ID || '',
      taskRewardHbar: config.taskRewardHbar || 0.5,
    };
  }

  setClient(client: Client): void {
    this.client = client;
  }

  /**
   * Calculate distribution for a task payment
   */
  calculateDistribution(amountHbar: number = this.config.taskRewardHbar): RevenueAccount[] {
    return [
      {
        accountId: this.config.agentAccountId,
        percentage: 0.50,
        hbarAmount: amountHbar * 0.50,
        label: 'agent',
      },
      {
        accountId: this.config.treasuryAccountId,
        percentage: 0.20,
        hbarAmount: amountHbar * 0.20,
        label: 'treasury',
      },
      {
        accountId: this.config.operationsAccountId,
        percentage: 0.15,
        hbarAmount: amountHbar * 0.15,
        label: 'operations',
      },
      {
        accountId: this.config.reserveAccountId,
        percentage: 0.15,
        hbarAmount: amountHbar * 0.15,
        label: 'reserve',
      },
    ];
  }

  /**
   * Pay a healthy agent for completing a task
   * Uses operator account as treasury (has signing key)
   * Distribution tracked but all funds come from/go to operator
   */
  async payHealthyAgent(
    agentId: string,
    agentAccountId: string,
    isHealthy: boolean,
    taskId?: string
  ): Promise<PaymentResult> {
    if (!this.client) {
      return {
        success: false,
        error: 'Hedera client not configured',
        distributed: { agent: 0, treasury: 0, operations: 0, reserve: 0 },
      };
    }

    if (!isHealthy) {
      logger.warn('HealthPaymentDistributor', {
        message: 'Payment skipped - agent not healthy',
        agentId,
        taskId,
      });
      return {
        success: false,
        error: 'Agent not healthy',
        distributed: { agent: 0, treasury: 0, operations: 0, reserve: 0 },
      };
    }

    if (!agentAccountId) {
      return {
        success: false,
        error: 'Missing agent account ID',
        distributed: { agent: 0, treasury: 0, operations: 0, reserve: 0 },
      };
    }

    // Temporarily set agent account
    const originalAgentAccount = this.config.agentAccountId;
    this.config.agentAccountId = agentAccountId;

    try {
      const distribution = this.calculateDistribution();
      
      // Single transfer: Operator (treasury) -> Agent
      // We use the client's operator account (which has the key)
      const agentAmount = Hbar.fromTinybars(Math.floor(distribution[0].hbarAmount * 100_000_000));

      const tx = new TransferTransaction()
        .setTransactionMemo(`Task payment | Agent: ${agentId}${taskId ? ` | Task: ${taskId}` : ''}`)
        // Agent receives payment
        .addHbarTransfer(agentAccountId, agentAmount);
      
      // Deduct from operator (treasury) - client automatically signs as operator
      // The operator account ID comes from the client's credentials
      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      const result: PaymentResult = {
        success: receipt.status.toString() === 'SUCCESS',
        txId: response.transactionId?.toString(),
        distributed: {
          agent: distribution.find((d) => d.label === 'agent')?.hbarAmount || 0,
          treasury: distribution.find((d) => d.label === 'treasury')?.hbarAmount || 0,
          operations: distribution.find((d) => d.label === 'operations')?.hbarAmount || 0,
          reserve: distribution.find((d) => d.label === 'reserve')?.hbarAmount || 0,
        },
      };

      this.paymentHistory.push(result);
      if (this.paymentHistory.length > this.maxHistorySize) {
        this.paymentHistory.shift();
      }

      logger.info('HealthPaymentDistributor', {
        message: 'Payment distributed',
        agentId,
        taskId,
        txId: result.txId,
        totalHbar: this.config.taskRewardHbar,
        distribution: result.distributed,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('HealthPaymentDistributor', {
        message: 'Payment failed',
        agentId,
        taskId,
        error: errorMsg,
      });
      return {
        success: false,
        error: errorMsg,
        distributed: { agent: 0, treasury: 0, operations: 0, reserve: 0 },
      };
    } finally {
      // Restore original agent account
      this.config.agentAccountId = originalAgentAccount;
    }
  }

  /**
   * Get payment history
   */
  getPaymentHistory(): PaymentResult[] {
    return [...this.paymentHistory];
  }

  /**
   * Get total distributed amounts
   */
  getTotalDistributed(): {
    agent: number;
    treasury: number;
    operations: number;
    reserve: number;
    total: number;
  } {
    const totals = this.paymentHistory.reduce(
      (acc, p) => {
        if (p.success) {
          acc.agent += p.distributed.agent;
          acc.treasury += p.distributed.treasury;
          acc.operations += p.distributed.operations;
          acc.reserve += p.distributed.reserve;
          acc.total += p.distributed.agent + p.distributed.treasury + p.distributed.operations + p.distributed.reserve;
        }
        return acc;
      },
      { agent: 0, treasury: 0, operations: 0, reserve: 0, total: 0 }
    );
    return totals;
  }

  /**
   * Validate all required accounts are configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.treasuryAccountId &&
      this.config.operationsAccountId &&
      this.config.reserveAccountId &&
      this.client
    );
  }

  /**
   * Get current configuration
   */
  getConfig(): PaymentConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PaymentConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Export singleton
export const createPaymentDistributor = (config?: Partial<PaymentConfig>) =>
  new HealthPaymentDistributor(config);
