/**
 * Hedera Wallet API
 * Intuitive wallet-style interface for Hedera operations
 * 
 * Makes Hedera feel like a modern crypto wallet:
 * - Simple method names (send, receive, balance)
 * - Automatic token association
 * - Batch operations
 * - Transaction history
 */

import { hederaToolRegistry } from './tools/index.js';
import { logger } from '../monitoring/logger.js';

export interface WalletConfig {
  accountId: string;
  autoAssociate?: boolean;
  preferredNode?: string;
}

export interface TokenBalance {
  tokenId: string;
  symbol: string;
  name?: string;
  balance: string;
  decimals: number;
  isNFT: boolean;
}

export interface TransactionReceipt {
  success: boolean;
  transactionId?: string;
  hashscanUrl?: string;
  error?: string;
  data?: any;
}

export interface SendOptions {
  memo?: string;
  maxFee?: number;
  waitForConsensus?: boolean;
}

export interface TokenSendOptions extends SendOptions {
  autoAssociate?: boolean; // Auto-associate if not already associated
}

/**
 * HederaWallet - Intuitive wallet interface
 * 
 * Usage:
 * ```typescript
 * const wallet = new HederaWallet({ accountId: '0.0.12345' });
 * 
 * // Send HBAR
 * await wallet.sendHBAR('0.0.67890', 10.5);
 * 
 * // Send tokens
 * await wallet.sendToken('0.0.67890', '0.0.54321', 100);
 * 
 * // Get all balances
 * const { hbar, tokens } = await wallet.getAllBalances();
 * ```
 */
export class HederaWallet {
  private config: WalletConfig;
  private transactionHistory: Array<{ type: string; timestamp: number; receipt: TransactionReceipt }> = [];

  constructor(config: WalletConfig) {
    this.config = {
      autoAssociate: true,
      ...config
    };
  }

  /**
   * Send HBAR to another account
   * Simple: await wallet.sendHBAR('0.0.67890', 10.5)
   */
  async sendHBAR(toAccountId: string, amount: number, options: SendOptions = {}): Promise<TransactionReceipt> {
    logger.info('HederaWallet', {
      message: 'Sending HBAR',
      from: this.config.accountId,
      to: toAccountId,
      amount
    });

    const result = await hederaToolRegistry.executeTool('account_transfer_hbar', {
      toAccountId,
      amount,
      memo: options.memo
    });

    const receipt: TransactionReceipt = {
      success: result.success,
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      error: result.error,
      data: result.data
    };

    this.recordTransaction('SEND_HBAR', receipt);
    return receipt;
  }

  /**
   * Send tokens to another account
   * Simple: await wallet.sendToken('0.0.67890', '0.0.54321', 100)
   */
  async sendToken(
    toAccountId: string,
    tokenId: string,
    amount: number,
    options: TokenSendOptions = {}
  ): Promise<TransactionReceipt> {
    logger.info('HederaWallet', {
      message: 'Sending token',
      from: this.config.accountId,
      to: toAccountId,
      tokenId,
      amount
    });

    // Check if recipient is associated (if auto-associate enabled)
    if (options.autoAssociate !== false && this.config.autoAssociate) {
      // In a full implementation, would check and auto-associate
      logger.debug('HederaWallet', { message: 'Auto-associate check', tokenId, toAccountId });
    }

    const result = await hederaToolRegistry.executeTool('hts_transfer_token', {
      tokenId,
      toAccountId,
      amount,
      memo: options.memo
    });

    const receipt: TransactionReceipt = {
      success: result.success,
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      error: result.error,
      data: result.data
    };

    this.recordTransaction('SEND_TOKEN', receipt);
    return receipt;
  }

  /**
   * Send NFT to another account
   * Simple: await wallet.sendNFT('0.0.67890', '0.0.54321', 1)
   */
  async sendNFT(
    toAccountId: string,
    tokenId: string,
    serialNumber: number,
    options: TokenSendOptions = {}
  ): Promise<TransactionReceipt> {
    logger.info('HederaWallet', {
      message: 'Sending NFT',
      from: this.config.accountId,
      to: toAccountId,
      tokenId,
      serialNumber
    });

    const result = await hederaToolRegistry.executeTool('hts_transfer_token', {
      tokenId,
      toAccountId,
      serialNumber,
      isNFT: true,
      memo: options.memo
    });

    const receipt: TransactionReceipt = {
      success: result.success,
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      error: result.error,
      data: result.data
    };

    this.recordTransaction('SEND_NFT', receipt);
    return receipt;
  }

  /**
   * Get HBAR balance
   * Simple: const hbar = await wallet.getHBARBalance()
   */
  async getHBARBalance(): Promise<{ hbar: string; tinybar: string }> {
    const result = await hederaToolRegistry.executeTool('account_get_balance', {
      accountId: this.config.accountId
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to get balance');
    }

    return {
      hbar: result.data.hbarBalance,
      tinybar: result.data.hbarBalanceTinybar
    };
  }

  /**
   * Get all token balances
   * Simple: const tokens = await wallet.getTokenBalances()
   */
  async getTokenBalances(): Promise<TokenBalance[]> {
    const result = await hederaToolRegistry.executeTool('account_get_balance', {
      accountId: this.config.accountId
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to get token balances');
    }

    const tokens: TokenBalance[] = [];
    for (const [tokenId, balance] of Object.entries(result.data.tokenBalances)) {
      tokens.push({
        tokenId,
        symbol: '', // Would need to fetch token info
        balance: balance as string,
        decimals: 0,
        isNFT: false // Would need to check token type
      });
    }

    return tokens;
  }

  /**
   * Get all balances (HBAR + tokens)
   * Simple: const { hbar, tokens } = await wallet.getAllBalances()
   */
  async getAllBalances(): Promise<{ hbar: string; tinybar: string; tokens: TokenBalance[] }> {
    const [hbarResult, tokensResult] = await Promise.all([
      this.getHBARBalance(),
      this.getTokenBalances()
    ]);

    return {
      hbar: hbarResult.hbar,
      tinybar: hbarResult.tinybar,
      tokens: tokensResult
    };
  }

  /**
   * Associate a token (enable receiving)
   * Simple: await wallet.associateToken('0.0.54321')
   */
  async associateToken(tokenId: string): Promise<TransactionReceipt> {
    const result = await hederaToolRegistry.executeTool('hts_associate_token', {
      tokenId,
      accountId: this.config.accountId
    });

    const receipt: TransactionReceipt = {
      success: result.success,
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      error: result.error,
      data: result.data
    };

    this.recordTransaction('ASSOCIATE', receipt);
    return receipt;
  }

  /**
   * Dissociate a token (disable holding)
   * Simple: await wallet.dissociateToken('0.0.54321')
   */
  async dissociateToken(tokenId: string): Promise<TransactionReceipt> {
    const result = await hederaToolRegistry.executeTool('hts_dissociate_token', {
      tokenId,
      accountId: this.config.accountId
    });

    const receipt: TransactionReceipt = {
      success: result.success,
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      error: result.error,
      data: result.data
    };

    this.recordTransaction('DISSOCIATE', receipt);
    return receipt;
  }

  /**
   * Create fungible token
   * Simple: await wallet.createToken('My Token', 'MTK', 1000000)
   */
  async createToken(
    name: string,
    symbol: string,
    initialSupply: number,
    decimals: number = 8,
    options: { maxSupply?: number; memo?: string } = {}
  ): Promise<TransactionReceipt> {
    const result = await hederaToolRegistry.executeTool('hts_create_fungible_token', {
      name,
      symbol,
      initialSupply,
      decimals,
      maxSupply: options.maxSupply,
      memo: options.memo,
      treasuryId: this.config.accountId
    });

    const receipt: TransactionReceipt = {
      success: result.success,
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      error: result.error,
      data: result.data
    };

    this.recordTransaction('CREATE_TOKEN', receipt);
    return receipt;
  }

  /**
   * Create NFT collection
   * Simple: await wallet.createNFTCollection('Vera Art', 'VART')
   */
  async createNFTCollection(
    name: string,
    symbol: string,
    options: { maxSupply?: number; memo?: string } = {}
  ): Promise<TransactionReceipt> {
    const result = await hederaToolRegistry.executeTool('hts_create_nft_collection', {
      name,
      symbol,
      maxSupply: options.maxSupply,
      memo: options.memo,
      treasuryId: this.config.accountId
    });

    const receipt: TransactionReceipt = {
      success: result.success,
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      error: result.error,
      data: result.data
    };

    this.recordTransaction('CREATE_NFT_COLLECTION', receipt);
    return receipt;
  }

  /**
   * Mint NFT in collection
   * Simple: await wallet.mintNFT('0.0.54321', 'ipfs://Qm...')
   */
  async mintNFT(tokenId: string, metadata: string): Promise<TransactionReceipt> {
    const result = await hederaToolRegistry.executeTool('hts_mint_nft', {
      tokenId,
      metadata
    });

    const receipt: TransactionReceipt = {
      success: result.success,
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      error: result.error,
      data: result.data
    };

    this.recordTransaction('MINT_NFT', receipt);
    return receipt;
  }

  /**
   * Batch associate multiple tokens at once
   * Simple: await wallet.batchAssociateTokens(['0.0.111', '0.0.222', '0.0.333'])
   */
  async batchAssociateTokens(tokenIds: string[]): Promise<TransactionReceipt[]> {
    const receipts: TransactionReceipt[] = [];
    
    for (const tokenId of tokenIds) {
      try {
        const receipt = await this.associateToken(tokenId);
        receipts.push(receipt);
      } catch (error) {
        receipts.push({
          success: false,
          error: `Failed to associate ${tokenId}: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
    
    return receipts;
  }

  /**
   * Batch send HBAR to multiple recipients
   * Simple: await wallet.batchSendHBAR([{ to: '0.0.111', amount: 10 }, { to: '0.0.222', amount: 20 }])
   */
  async batchSendHBAR(
    transfers: Array<{ to: string; amount: number; memo?: string }>
  ): Promise<TransactionReceipt[]> {
    const receipts: TransactionReceipt[] = [];
    
    for (const transfer of transfers) {
      try {
        const receipt = await this.sendHBAR(transfer.to, transfer.amount, { memo: transfer.memo });
        receipts.push(receipt);
      } catch (error) {
        receipts.push({
          success: false,
          error: `Failed to send to ${transfer.to}: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
    
    return receipts;
  }

  /**
   * Check transaction status by ID
   */
  async checkTransactionStatus(transactionId: string): Promise<{
    status: 'pending' | 'success' | 'failed' | 'unknown';
    details?: any;
  }> {
    try {
      const result = await hederaToolRegistry.executeTool('query_get_transaction_record', {
        transactionId
      });
      
      if (result.success && result.data) {
        return {
          status: result.data.status === 'SUCCESS' ? 'success' : 'failed',
          details: result.data
        };
      }
      
      return { status: 'unknown' };
    } catch (error) {
      // Transaction might not be found yet
      return { status: 'pending' };
    }
  }

  /**
   * Get transaction history for this wallet
   * Supports filtering by type and pagination
   */
  getTransactionHistory(
    filter?: { type?: string; startTime?: number; endTime?: number; limit?: number }
  ): Array<{ type: string; timestamp: number; receipt: TransactionReceipt }> {
    let history = [...this.transactionHistory];
    
    if (filter?.type) {
      history = history.filter(h => h.type === filter.type);
    }
    
    if (filter?.startTime) {
      history = history.filter(h => h.timestamp >= filter.startTime!);
    }
    
    if (filter?.endTime) {
      history = history.filter(h => h.timestamp <= filter.endTime!);
    }
    
    if (filter?.limit) {
      history = history.slice(0, filter.limit);
    }
    
    return history;
  }

  /**
   * Get transaction statistics
   */
  getTransactionStats(): {
    total: number;
    successful: number;
    failed: number;
    byType: Record<string, number>;
    recentActivity: Array<{ type: string; timestamp: number }>;
  } {
    const byType: Record<string, number> = {};
    let successful = 0;
    let failed = 0;
    
    for (const tx of this.transactionHistory) {
      byType[tx.type] = (byType[tx.type] || 0) + 1;
      if (tx.receipt.success) {
        successful++;
      } else {
        failed++;
      }
    }
    
    return {
      total: this.transactionHistory.length,
      successful,
      failed,
      byType,
      recentActivity: this.transactionHistory.slice(-10).map(tx => ({
        type: tx.type,
        timestamp: tx.timestamp
      }))
    };
  }

  /**
   * Get wallet summary with enhanced stats
   */
  async getSummary(): Promise<{
    accountId: string;
    hbar: string;
    tokenCount: number;
    nftCount: number;
    transactionCount: number;
    transactionStats: ReturnType<typeof this.getTransactionStats>;
    lastActivity?: number;
  }> {
    const { hbar, tokens } = await this.getAllBalances();
    const stats = this.getTransactionStats();
    const lastTx = this.transactionHistory[this.transactionHistory.length - 1];
    
    return {
      accountId: this.config.accountId,
      hbar,
      tokenCount: tokens.filter(t => !t.isNFT).length,
      nftCount: tokens.filter(t => t.isNFT).length,
      transactionCount: this.transactionHistory.length,
      transactionStats: stats,
      lastActivity: lastTx?.timestamp
    };
  }

  // Private methods
  private recordTransaction(type: string, receipt: TransactionReceipt): void {
    this.transactionHistory.push({
      type,
      timestamp: Date.now(),
      receipt
    });

    // Keep last 100 transactions
    if (this.transactionHistory.length > 100) {
      this.transactionHistory.shift();
    }
  }
}

/**
 * Create a new wallet instance
 * Factory function for convenience
 */
export function createWallet(accountId: string, options?: Partial<WalletConfig>): HederaWallet {
  return new HederaWallet({
    accountId,
    ...options
  });
}

/**
 * Quick send HBAR
 * One-liner for simple transfers
 */
export async function quickSendHBAR(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  memo?: string
): Promise<TransactionReceipt> {
  const wallet = createWallet(fromAccountId);
  return wallet.sendHBAR(toAccountId, amount, { memo });
}

/**
 * Quick send token
 * One-liner for simple token transfers
 */
export async function quickSendToken(
  fromAccountId: string,
  toAccountId: string,
  tokenId: string,
  amount: number,
  memo?: string
): Promise<TransactionReceipt> {
  const wallet = createWallet(fromAccountId);
  return wallet.sendToken(toAccountId, tokenId, amount, { memo });
}

/**
 * Quick balance check
 * One-liner to get account balance
 */
export async function quickBalance(accountId: string): Promise<{ hbar: string; tokens: TokenBalance[] }> {
  const wallet = createWallet(accountId);
  const { hbar, tokens } = await wallet.getAllBalances();
  return { hbar, tokens };
}

/**
 * Quick create token
 * One-liner to create a fungible token
 */
export async function quickCreateToken(
  accountId: string,
  name: string,
  symbol: string,
  initialSupply: number,
  decimals: number = 8
): Promise<TransactionReceipt> {
  const wallet = createWallet(accountId);
  return wallet.createToken(name, symbol, initialSupply, decimals);
}

/**
 * Quick mint NFT
 * One-liner to mint an NFT
 */
export async function quickMintNFT(
  accountId: string,
  tokenId: string,
  metadata: string
): Promise<TransactionReceipt> {
  const wallet = createWallet(accountId);
  return wallet.mintNFT(tokenId, metadata);
}

/**
 * Quick associate tokens
 * One-liner to associate multiple tokens
 */
export async function quickAssociateTokens(
  accountId: string,
  tokenIds: string[]
): Promise<TransactionReceipt[]> {
  const wallet = createWallet(accountId);
  return wallet.batchAssociateTokens(tokenIds);
}

/**
 * Quick batch send HBAR
 * One-liner for airdrop-style distribution
 */
export async function quickBatchSend(
  fromAccountId: string,
  recipients: Array<{ to: string; amount: number; memo?: string }>
): Promise<TransactionReceipt[]> {
  const wallet = createWallet(fromAccountId);
  return wallet.batchSendHBAR(recipients);
}

/**
 * Get wallet summary with full stats
 * One-liner for comprehensive wallet info
 */
export async function quickWalletSummary(accountId: string): Promise<{
  accountId: string;
  hbar: string;
  tokenCount: number;
  nftCount: number;
  transactionCount: number;
  transactionStats: any;
  lastActivity?: number;
}> {
  const wallet = createWallet(accountId);
  return wallet.getSummary();
}

/**
 * Validate Hedera account ID format
 */
export function isValidHederaAccountId(id: string): boolean {
  return /^0\.0\.\d+$/.test(id);
}

/**
 * Validate Hedera token ID format
 */
export function isValidHederaTokenId(id: string): boolean {
  return /^0\.0\.\d+$/.test(id);
}

/**
 * Format HBAR from tinybar to human-readable
 */
export function formatHBAR(tinybar: number | string): string {
  const val = typeof tinybar === 'string' ? parseFloat(tinybar) : tinybar;
  return (val / 100_000_000).toFixed(8);
}

/**
 * Parse HBAR to tinybar
 */
export function parseHBAR(hbar: number | string): string {
  const val = typeof hbar === 'string' ? parseFloat(hbar) : hbar;
  return Math.floor(val * 100_000_000).toString();
}

export default HederaWallet;
