/**
 * Vera Parallel Wallet Manager
 * Distributes HCS costs across multiple wallets for unlimited scaling
 */

import { Client, PrivateKey, AccountId } from '@hashgraph/sdk';
import { logger } from '../../monitoring/logger.js';

interface Wallet {
  id: string;
  accountId: AccountId;
  privateKey: PrivateKey;
  client: Client;
  dailySpend: number; // HBAR
  messageCount: number;
  lastUsed: number;
  isActive: boolean;
}

interface WalletStats {
  walletId: string;
  accountId: string;
  dailySpend: number;
  messageCount: number;
  health: 'healthy' | 'degraded' | 'exhausted';
}

export class ParallelWalletManager {
  private wallets: Map<string, Wallet> = new Map();
  private currentIndex: number = 0;
  private dailyBudgetPerWallet: number = 50; // HBAR per wallet per day
  private rotationStrategy: 'round-robin' | 'least-loaded' | 'cost-optimized' = 'cost-optimized';
  private stats: Map<string, { dailySpend: number; messageCount: number }> = new Map();

  constructor() {
    this.loadWalletsFromEnv();
    this.startDailyReset();
  }

  /**
   * Load multiple wallets from environment variables
   * VERA_WALLET_1_ACCOUNT_ID, VERA_WALLET_1_PRIVATE_KEY
   * VERA_WALLET_2_ACCOUNT_ID, VERA_WALLET_2_PRIVATE_KEY
   * etc.
   */
  private loadWalletsFromEnv(): void {
    let walletIndex = 1;
    
    while (true) {
      const accountIdEnv = process.env[`VERA_WALLET_${walletIndex}_ACCOUNT_ID`];
      const privateKeyEnv = process.env[`VERA_WALLET_${walletIndex}_PRIVATE_KEY`];
      
      if (!accountIdEnv || !privateKeyEnv) {
        break;
      }

      try {
        const accountId = AccountId.fromString(accountIdEnv);
        let privateKey: PrivateKey;

        // Detect key type
        if (privateKeyEnv.length === 64) {
          try {
            privateKey = PrivateKey.fromStringECDSA(privateKeyEnv);
          } catch {
            privateKey = PrivateKey.fromStringED25519(privateKeyEnv);
          }
        } else {
          privateKey = PrivateKey.fromString(privateKeyEnv);
        }

        // Create dedicated client for this wallet
        const client = Client.forMainnet();
        client.setOperator(accountId, privateKey);

        const wallet: Wallet = {
          id: `wallet-${walletIndex}`,
          accountId,
          privateKey,
          client,
          dailySpend: 0,
          messageCount: 0,
          lastUsed: 0,
          isActive: true,
        };

        this.wallets.set(wallet.id, wallet);
        this.stats.set(wallet.id, { dailySpend: 0, messageCount: 0 });

        logger.info('ParallelWalletManager', {
          message: `Loaded wallet ${walletIndex}`,
          accountId: accountId.toString(),
        });

        walletIndex++;
      } catch (error) {
        logger.error('ParallelWalletManager', {
          message: `Failed to load wallet ${walletIndex}`,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }

    if (this.wallets.size === 0) {
      // Fall back to single wallet
      logger.warn('ParallelWalletManager', {
        message: 'No parallel wallets configured, falling back to default',
      });
      this.loadDefaultWallet();
    } else {
      logger.info('ParallelWalletManager', {
        message: `Loaded ${this.wallets.size} parallel wallets`,
        strategy: this.rotationStrategy,
      });
    }
  }

  /**
   * Load default single wallet as fallback
   */
  private loadDefaultWallet(): void {
    const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

    if (!accountId || !privateKey) {
      throw new Error('No wallets configured');
    }

    const client = Client.forMainnet();
    let pk: PrivateKey;

    if (privateKey.length === 64) {
      try {
        pk = PrivateKey.fromStringECDSA(privateKey);
      } catch {
        pk = PrivateKey.fromStringED25519(privateKey);
      }
    } else {
      pk = PrivateKey.fromString(privateKey);
    }

    client.setOperator(AccountId.fromString(accountId), pk);

    const wallet: Wallet = {
      id: 'wallet-default',
      accountId: AccountId.fromString(accountId),
      privateKey: pk,
      client,
      dailySpend: 0,
      messageCount: 0,
      lastUsed: 0,
      isActive: true,
    };

    this.wallets.set(wallet.id, wallet);
    this.stats.set(wallet.id, { dailySpend: 0, messageCount: 0 });
  }

  /**
   * Get next wallet using rotation strategy
   */
  getNextWallet(): Wallet {
    const activeWallets = Array.from(this.wallets.values()).filter(w => w.isActive);

    if (activeWallets.length === 0) {
      throw new Error('No active wallets available');
    }

    let selected: Wallet;

    switch (this.rotationStrategy) {
      case 'round-robin':
        selected = activeWallets[this.currentIndex % activeWallets.length];
        this.currentIndex++;
        break;

      case 'least-loaded':
        selected = activeWallets.reduce((min, w) => 
          w.messageCount < min.messageCount ? w : min
        );
        break;

      case 'cost-optimized':
        // Select wallet with lowest daily spend that's under budget
        selected = activeWallets
          .filter(w => w.dailySpend < this.dailyBudgetPerWallet)
          .sort((a, b) => a.dailySpend - b.dailySpend)[0] || activeWallets[0];
        break;

      default:
        selected = activeWallets[0];
    }

    selected.lastUsed = Date.now();
    return selected;
  }

  /**
   * Get Hedera client for next operation
   */
  getClient(): Client {
    return this.getNextWallet().client;
  }

  /**
   * Record spend for cost tracking
   */
  recordSpend(walletId: string, cost: number): void {
    const wallet = this.wallets.get(walletId);
    if (wallet) {
      wallet.dailySpend += cost;
      wallet.messageCount++;
    }

    const stats = this.stats.get(walletId);
    if (stats) {
      stats.dailySpend += cost;
      stats.messageCount++;
    }
  }

  /**
   * Check if wallet is exhausted (over budget)
   */
  isWalletExhausted(walletId: string): boolean {
    const wallet = this.wallets.get(walletId);
    return wallet ? wallet.dailySpend >= this.dailyBudgetPerWallet : true;
  }

  /**
   * Get wallet statistics
   */
  getStats(): WalletStats[] {
    return Array.from(this.wallets.values()).map(wallet => ({
      walletId: wallet.id,
      accountId: wallet.accountId.toString(),
      dailySpend: wallet.dailySpend,
      messageCount: wallet.messageCount,
      health: wallet.dailySpend >= this.dailyBudgetPerWallet ? 'exhausted' :
              wallet.dailySpend >= this.dailyBudgetPerWallet * 0.8 ? 'degraded' : 'healthy',
    }));
  }

  /**
   * Get aggregate statistics
   */
  getAggregateStats(): {
    totalWallets: number;
    activeWallets: number;
    exhaustedWallets: number;
    totalDailySpend: number;
    totalMessages: number;
    averageCostPerMessage: number;
  } {
    const wallets = Array.from(this.wallets.values());
    const totalSpend = wallets.reduce((sum, w) => sum + w.dailySpend, 0);
    const totalMessages = wallets.reduce((sum, w) => sum + w.messageCount, 0);

    return {
      totalWallets: wallets.length,
      activeWallets: wallets.filter(w => w.isActive).length,
      exhaustedWallets: wallets.filter(w => w.dailySpend >= this.dailyBudgetPerWallet).length,
      totalDailySpend: totalSpend,
      totalMessages,
      averageCostPerMessage: totalMessages > 0 ? totalSpend / totalMessages : 0,
    };
  }

  /**
   * Start daily reset timer
   */
  private startDailyReset(): void {
    // Reset at midnight UTC
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      this.resetDailyStats();
      // Then reset every 24 hours
      setInterval(() => this.resetDailyStats(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  /**
   * Reset daily statistics
   */
  private resetDailyStats(): void {
    for (const wallet of this.wallets.values()) {
      wallet.dailySpend = 0;
      wallet.messageCount = 0;
      wallet.isActive = true;
    }

    for (const stats of this.stats.values()) {
      stats.dailySpend = 0;
      stats.messageCount = 0;
    }

    logger.info('ParallelWalletManager', {
      message: 'Daily stats reset',
      walletCount: this.wallets.size,
    });
  }

  /**
   * Set rotation strategy
   */
  setStrategy(strategy: 'round-robin' | 'least-loaded' | 'cost-optimized'): void {
    this.rotationStrategy = strategy;
    logger.info('ParallelWalletManager', {
      message: 'Rotation strategy updated',
      strategy,
    });
  }

  /**
   * Add wallet dynamically
   */
  addWallet(accountId: string, privateKey: string): string {
    const id = `wallet-${this.wallets.size + 1}`;
    
    const client = Client.forMainnet();
    let pk: PrivateKey;

    if (privateKey.length === 64) {
      try {
        pk = PrivateKey.fromStringECDSA(privateKey);
      } catch {
        pk = PrivateKey.fromStringED25519(privateKey);
      }
    } else {
      pk = PrivateKey.fromString(privateKey);
    }

    client.setOperator(AccountId.fromString(accountId), pk);

    const wallet: Wallet = {
      id,
      accountId: AccountId.fromString(accountId),
      privateKey: pk,
      client,
      dailySpend: 0,
      messageCount: 0,
      lastUsed: 0,
      isActive: true,
    };

    this.wallets.set(id, wallet);
    this.stats.set(id, { dailySpend: 0, messageCount: 0 });

    logger.info('ParallelWalletManager', {
      message: 'Wallet added',
      id,
      accountId,
    });

    return id;
  }
}

// Export singleton
export const parallelWalletManager = new ParallelWalletManager();

// Factory function
export function createParallelWalletManager(): ParallelWalletManager {
  return new ParallelWalletManager();
}
