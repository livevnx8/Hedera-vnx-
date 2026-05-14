/**
 * VERA Token (Hedera HTS)
 * Native token for Vera's sovereign economy
 * 
 * Tokenomics:
 * - Supply: 1 billion VERA, fixed
 * - Utility: Staking, payments, governance
 * - Distribution: Agent mining, liquidity, treasury, community
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { config } from '../config.js';
import {
  Client,
  TokenCreateTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  TokenMintTransaction,
  TokenBurnTransaction,
  AccountBalanceQuery,
  Hbar,
  PrivateKey,
} from '@hashgraph/sdk';

export interface VeraTokenConfig {
  tokenId?: string;           // Existing token ID (if already created)
  treasuryAccount: string;    // Treasury account ID
  treasuryKey: PrivateKey;      // Treasury private key
  initialSupply?: number;       // Initial supply (default: 1B)
  decimals?: number;            // Token decimals (default: 8)
}

export interface TokenHolder {
  accountId: string;
  balance: number;
  staked: number;               // Amount staked for reputation/governance
  rewards: number;              // Unclaimed rewards
}

export interface AgentMiningReward {
  agentId: string;
  accountId: string;
  amount: number;
  reason: 'task_completion' | 'high_reputation' | 'consensus_participation';
  timestamp: number;
}

export class VeraToken extends EventEmitter {
  private client: Client;
  private tokenId: string | null = null;
  private treasuryAccount: string;
  private treasuryKey: PrivateKey;
  private decimals: number;
  private holders = new Map<string, TokenHolder>();
  private totalStaked = 0;
  private rewardHistory: AgentMiningReward[] = [];

  constructor(tokenConfig: VeraTokenConfig) {
    super();
    
    // Initialize Hedera client
    this.client = Client.forName(config.HEDERA_NETWORK || 'mainnet');
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      this.client.setOperator(
        config.HEDERA_OPERATOR_ACCOUNT_ID,
        config.HEDERA_OPERATOR_PRIVATE_KEY
      );
    }

    this.tokenId = tokenConfig.tokenId || config.VERA_TOKEN_ID || null;
    this.treasuryAccount = tokenConfig.treasuryAccount || config.VERA_TOKEN_TREASURY_ACCOUNT || '';
    this.treasuryKey = tokenConfig.treasuryKey;
    this.decimals = tokenConfig.decimals || 8;
  }

  /**
   * Create VERA token on Hedera (one-time operation)
   */
  async createToken(initialSupply = 1_000_000_000): Promise<string> {
    if (this.tokenId) {
      throw new Error(`Token already exists: ${this.tokenId}`);
    }

    logger.info('VeraToken', {
      message: 'Creating VERA token',
      initialSupply,
      decimals: this.decimals,
      treasury: this.treasuryAccount,
    });

    try {
      const transaction = new TokenCreateTransaction()
        .setTokenName('VERA')
        .setTokenSymbol('VERA')
        .setDecimals(this.decimals)
        .setInitialSupply(initialSupply * Math.pow(10, this.decimals))
        .setTreasuryAccountId(this.treasuryAccount)
        .setAdminKey(this.treasuryKey.publicKey)
        .setSupplyKey(this.treasuryKey.publicKey)
        .setFreezeKey(this.treasuryKey.publicKey)
        .setWipeKey(this.treasuryKey.publicKey)
        .setMaxTransactionFee(new Hbar(30));

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      
      this.tokenId = receipt.tokenId?.toString() || null;
      
      if (!this.tokenId) {
        throw new Error('Token creation failed - no token ID in receipt');
      }

      this.emit('token_created', {
        tokenId: this.tokenId,
        initialSupply,
        treasury: this.treasuryAccount,
      });

      logger.info('VeraToken', {
        message: 'VERA token created',
        tokenId: this.tokenId,
        initialSupply,
      });

      return this.tokenId;
    } catch (error) {
      logger.error('VeraToken', {
        message: 'Token creation failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get token ID
   */
  getTokenId(): string | null {
    return this.tokenId;
  }

  /**
   * Check if token is initialized
   */
  isInitialized(): boolean {
    return this.tokenId !== null;
  }

  /**
   * Get balance for an account
   */
  async getBalance(accountId: string): Promise<number> {
    if (!this.tokenId) {
      throw new Error('Token not initialized');
    }

    try {
      const query = new AccountBalanceQuery()
        .setAccountId(accountId);

      const balance = await query.execute(this.client);
      const tokenBalance = balance.tokens?.get(this.tokenId) || 0;
      
      return Number(tokenBalance) / Math.pow(10, this.decimals);
    } catch (error) {
      logger.error('VeraToken', {
        message: 'Balance query failed',
        accountId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Transfer VERA tokens
   */
  async transfer(from: string, to: string, amount: number): Promise<void> {
    if (!this.tokenId) {
      throw new Error('Token not initialized');
    }

    const tokenAmount = amount * Math.pow(10, this.decimals);

    try {
      const transaction = new TransferTransaction()
        .addTokenTransfer(this.tokenId, from, -tokenAmount)
        .addTokenTransfer(this.tokenId, to, tokenAmount)
        .setTransactionMemo('VERA transfer');

      await transaction.execute(this.client);

      this.emit('transfer', { from, to, amount, tokenId: this.tokenId });

      logger.debug('VeraToken', {
        message: 'Transfer complete',
        from,
        to,
        amount,
      });
    } catch (error) {
      logger.error('VeraToken', {
        message: 'Transfer failed',
        from,
        to,
        amount,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Reward agent for task completion (Agent Mining)
   */
  async rewardAgent(reward: Omit<AgentMiningReward, 'timestamp'>): Promise<void> {
    if (!this.tokenId) {
      throw new Error('Token not initialized');
    }

    const fullReward: AgentMiningReward = {
      ...reward,
      timestamp: Date.now(),
    };

    try {
      // Transfer from treasury to agent
      await this.transfer(
        this.treasuryAccount,
        reward.accountId,
        reward.amount
      );

      // Record reward
      this.rewardHistory.push(fullReward);

      // Update holder record
      const holder = this.holders.get(reward.accountId);
      if (holder) {
        holder.rewards += reward.amount;
      } else {
        this.holders.set(reward.accountId, {
          accountId: reward.accountId,
          balance: reward.amount,
          staked: 0,
          rewards: reward.amount,
        });
      }

      this.emit('agent_rewarded', fullReward);

      logger.info('VeraToken', {
        message: 'Agent rewarded',
        agentId: reward.agentId,
        accountId: reward.accountId,
        amount: reward.amount,
        reason: reward.reason,
      });
    } catch (error) {
      logger.error('VeraToken', {
        message: 'Agent reward failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Stake VERA tokens for reputation/governance
   */
  async stake(accountId: string, amount: number): Promise<void> {
    const holder = this.holders.get(accountId);
    if (!holder) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (holder.balance < amount) {
      throw new Error('Insufficient balance to stake');
    }

    holder.balance -= amount;
    holder.staked += amount;
    this.totalStaked += amount;

    this.emit('staked', { accountId, amount });

    logger.info('VeraToken', {
      message: 'Tokens staked',
      accountId,
      amount,
      totalStaked: holder.staked,
    });
  }

  /**
   * Unstake VERA tokens
   */
  async unstake(accountId: string, amount: number): Promise<void> {
    const holder = this.holders.get(accountId);
    if (!holder) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (holder.staked < amount) {
      throw new Error('Insufficient staked amount');
    }

    holder.staked -= amount;
    holder.balance += amount;
    this.totalStaked -= amount;

    this.emit('unstaked', { accountId, amount });

    logger.info('VeraToken', {
      message: 'Tokens unstaked',
      accountId,
      amount,
      remainingStaked: holder.staked,
    });
  }

  /**
   * Get staking stats
   */
  getStakingStats(): {
    totalStaked: number;
    stakerCount: number;
    averageStake: number;
  } {
    const stakers = Array.from(this.holders.values()).filter(h => h.staked > 0);
    return {
      totalStaked: this.totalStaked,
      stakerCount: stakers.length,
      averageStake: stakers.length > 0 ? this.totalStaked / stakers.length : 0,
    };
  }

  /**
   * Get token statistics
   */
  getStats(): {
    tokenId: string | null;
    totalSupply: number;
    decimals: number;
    treasuryBalance?: number;
    totalStaked: number;
    rewardCount: number;
    holderCount: number;
  } {
    return {
      tokenId: this.tokenId,
      totalSupply: 1_000_000_000, // Fixed supply
      decimals: this.decimals,
      totalStaked: this.totalStaked,
      rewardCount: this.rewardHistory.length,
      holderCount: this.holders.size,
    };
  }

  /**
   * Get reward history for an agent
   */
  getAgentRewards(agentId: string): AgentMiningReward[] {
    return this.rewardHistory.filter(r => r.agentId === agentId);
  }

  /**
   * Get top holders by balance
   */
  getTopHolders(limit = 10): TokenHolder[] {
    return Array.from(this.holders.values())
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);
  }
}

// Singleton instance (requires initialization with config)
export let veraToken: VeraToken | null = null;

export function initializeVeraToken(config: VeraTokenConfig): VeraToken {
  veraToken = new VeraToken(config);
  return veraToken;
}
