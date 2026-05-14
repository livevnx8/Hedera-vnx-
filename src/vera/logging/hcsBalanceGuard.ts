/**
 * HCS Balance Guard
 * Prevents HCS submissions when account has insufficient balance
 * Implements circuit breaker pattern for HCS failures
 */

import { Client, AccountBalanceQuery, AccountId } from '@hashgraph/sdk';
import { logger } from '../../monitoring/logger.js';

export interface BalanceGuardConfig {
  minBalanceHbar: number;
  checkIntervalMs: number;
  maxConsecutiveFailures: number;
}

export interface BalanceStatus {
  hasBalance: boolean;
  currentBalanceHbar: number;
  consecutiveFailures: number;
  circuitOpen: boolean;
  lastCheck: Date;
}

/**
 * HCS Balance Guard
 * Monitors account balance and prevents HCS operations when balance is low
 */
export class HCSBalanceGuard {
  private client: Client;
  private accountId: string;
  private config: BalanceGuardConfig;
  private status: BalanceStatus;
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(
    client: Client,
    accountId: string,
    config: Partial<BalanceGuardConfig> = {}
  ) {
    this.client = client;
    this.accountId = accountId;
    this.config = {
      minBalanceHbar: config.minBalanceHbar ?? 1.0, // 1 HBAR minimum
      checkIntervalMs: config.checkIntervalMs ?? 60000, // Check every minute
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 10,
    };
    this.status = {
      hasBalance: false,
      currentBalanceHbar: 0,
      consecutiveFailures: 0,
      circuitOpen: false,
      lastCheck: new Date(),
    };
  }

  /**
   * Start balance monitoring
   */
  start(): void {
    // Initial check
    this.checkBalance();

    // Periodic checks
    this.checkTimer = setInterval(() => {
      this.checkBalance();
    }, this.config.checkIntervalMs);

    logger.info('HCSBalanceGuard', {
      message: 'Balance guard started',
      accountId: this.accountId,
      minBalanceHbar: this.config.minBalanceHbar,
    });
  }

  /**
   * Stop balance monitoring
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Check account balance
   */
  async checkBalance(): Promise<number> {
    try {
      const query = new AccountBalanceQuery()
        .setAccountId(AccountId.fromString(this.accountId));
      
      const balance = await query.execute(this.client);
      const hbarBalance = balance.hbars.toTinybars().toNumber() / 100_000_000;

      this.status.currentBalanceHbar = hbarBalance;
      this.status.hasBalance = hbarBalance >= this.config.minBalanceHbar;
      this.status.lastCheck = new Date();

      // Reset consecutive failures on successful check
      if (this.status.consecutiveFailures > 0) {
        this.status.consecutiveFailures = 0;
      }

      // Close circuit if balance recovered
      if (this.status.circuitOpen && this.status.hasBalance) {
        this.status.circuitOpen = false;
        logger.info('HCSBalanceGuard', {
          message: 'Circuit breaker closed - balance restored',
          balanceHbar: hbarBalance,
        });
      }

      if (!this.status.hasBalance) {
        logger.warn('HCSBalanceGuard', {
          message: 'Insufficient balance for HCS operations',
          balanceHbar: hbarBalance,
          minRequiredHbar: this.config.minBalanceHbar,
        });
      }

      return hbarBalance;
    } catch (error) {
      logger.error('HCSBalanceGuard', {
        message: 'Balance check failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return this.status.currentBalanceHbar;
    }
  }

  /**
   * Record a submission failure
   */
  recordFailure(error: Error): void {
    this.status.consecutiveFailures++;

    // Open circuit if too many consecutive failures
    if (this.status.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      if (!this.status.circuitOpen) {
        this.status.circuitOpen = true;
        logger.error('HCSBalanceGuard', {
          message: 'Circuit breaker opened - too many failures',
          consecutiveFailures: this.status.consecutiveFailures,
          error: error.message,
        });
      }
    }

    // Check for INSUFFICIENT_PAYER_BALANCE specifically
    if (error.message.includes('INSUFFICIENT_PAYER_BALANCE')) {
      this.status.hasBalance = false;
      logger.error('HCSBalanceGuard', {
        message: 'INSUFFICIENT_PAYER_BALANCE detected',
        accountId: this.accountId,
        action: 'HCS submissions paused',
      });
    }
  }

  /**
   * Record a successful submission
   */
  recordSuccess(): void {
    this.status.consecutiveFailures = 0;
  }

  /**
   * Check if HCS operations are allowed
   */
  canSubmit(): boolean {
    return this.status.hasBalance && !this.status.circuitOpen;
  }

  /**
   * Get current status
   */
  getStatus(): BalanceStatus {
    return { ...this.status };
  }

  /**
   * Get recommendations for fixing balance issues
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];

    if (!this.status.hasBalance) {
      recommendations.push(
        `Account ${this.accountId} has insufficient balance (${this.status.currentBalanceHbar.toFixed(4)} HBAR)`
      );
      recommendations.push(
        'Get free testnet HBAR at: https://portal.hedera.com/faucet'
      );
      recommendations.push(
        'Or use mainnet with funded account for production'
      );
    }

    if (this.status.circuitOpen) {
      recommendations.push(
        'Circuit breaker is open due to consecutive failures'
      );
      recommendations.push(
        'HCS operations will resume when balance is restored'
      );
    }

    return recommendations;
  }
}

// Singleton instance
let balanceGuardInstance: HCSBalanceGuard | null = null;

export function createBalanceGuard(
  client: Client,
  accountId: string,
  config?: Partial<BalanceGuardConfig>
): HCSBalanceGuard {
  balanceGuardInstance = new HCSBalanceGuard(client, accountId, config);
  return balanceGuardInstance;
}

export function getBalanceGuard(): HCSBalanceGuard | null {
  return balanceGuardInstance;
}
