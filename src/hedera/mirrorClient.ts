import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../security/secureLogger.js';

const MIRROR_NODE_BASE = config.MIRROR_NODE_BASE_URL || 'https://mainnet-public.mirrornode.hedera.com';

export interface HederaTransaction {
  consensus_timestamp: string;
  transaction_id: string;
  transaction_type: string;
  transaction_result: string;
  entity_id: string;
  entity_type: string;
  fee_charged: number;
  memo_base64?: string;
  function_parameters?: any;
  valid_duration_seconds?: number;
  max_fee?: number;
  parent_consensus_timestamp?: string;
  scheduled?: boolean;
  ethereum_transaction?: string;
  staking_reward_account?: string;
  error_message?: string;
}

export interface HederaAccount {
  account: string;
  balance: {
    timestamp: string;
    balance: number;
    tokens: Array<{
      token_id: string;
      balance: number;
      decimals: number;
    }>;
  };
  created_timestamp: string;
  expiry_timestamp: string;
  key: any;
  memo: string;
  receiver_sig_required: boolean;
  auto_renew_period: number;
  max_automatic_token_associations: number;
  alias?: string;
  evm_address?: string;
}

export class HederaMirrorClient {
  private baseUrl: string;
  private requestTimeout: number;
  private maxRetries: number;

  constructor(baseUrl: string = MIRROR_NODE_BASE, timeout: number = 30000) {
    this.baseUrl = baseUrl;
    this.requestTimeout = timeout;
    this.maxRetries = 3;
  }

  private async makeRequest<T>(endpoint: string, retries: number = 0): Promise<T | null> {
    try {
      const url = `${this.baseUrl}/api/v1${endpoint}`;
      logger.debug(`Fetching from mirror node: ${url}`);
      
      const { data } = await axios.get(url, {
        timeout: this.requestTimeout,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      return data;
    } catch (error) {
      if (retries < this.maxRetries) {
        logger.warn(`Retry ${retries + 1} for ${endpoint}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)));
        return this.makeRequest(endpoint, retries + 1);
      }
      
      logger.error(`Failed to fetch ${endpoint}:`, error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  async getTransactions(
    options: {
      accountId?: string;
      limit?: number;
      order?: 'asc' | 'desc';
      timestamp?: string;
      transactionType?: string;
    } = {}
  ): Promise<HederaTransaction[]> {
    const params = new URLSearchParams();
    
    if (options.accountId) {
      params.append('account.id', options.accountId);
    }
    if (options.limit) {
      params.append('limit', String(options.limit));
    }
    if (options.order) {
      params.append('order', options.order);
    }
    if (options.timestamp) {
      params.append('timestamp', options.timestamp);
    }
    if (options.transactionType) {
      params.append('transactiontype', options.transactionType);
    }

    const query = params.toString() ? `?${params.toString()}` : '';
    const data = await this.makeRequest<{ transactions: any[] }>(`/transactions${query}`);
    
    if (!data?.transactions) return [];

    return data.transactions.map(tx => ({
      consensus_timestamp: tx.consensus_timestamp,
      transaction_id: tx.transaction_id,
      transaction_type: tx.name,
      transaction_result: tx.result,
      entity_id: tx.entity_id,
      entity_type: this.inferEntityType(tx),
      fee_charged: parseInt(tx.charged_tx_fee || '0'),
      memo_base64: tx.memo_base64,
      function_parameters: tx.function_parameters,
      valid_duration_seconds: tx.valid_duration_seconds,
      max_fee: parseInt(tx.max_fee || '0'),
      parent_consensus_timestamp: tx.parent_consensus_timestamp,
      scheduled: tx.scheduled,
      ethereum_transaction: tx.ethereum_hash,
      staking_reward_account: tx.staking_reward_account,
      error_message: tx.error_message
    }));
  }

  async getAccountTransactions(accountId: string, limit: number = 100): Promise<HederaTransaction[]> {
    return this.getTransactions({ accountId, limit, order: 'desc' });
  }

  async getAccountInfo(accountId: string): Promise<HederaAccount | null> {
    const data = await this.makeRequest<HederaAccount>(`/accounts/${accountId}`);
    return data;
  }

  async getRecentTransactions(limit: number = 100): Promise<HederaTransaction[]> {
    return this.getTransactions({ limit, order: 'desc' });
  }

  async getNetworkStats(): Promise<{
    timestamp: string;
    transactions: number;
    tps: number;
    accounts: number;
    tokens: number;
    contracts: number;
    fileSize: number;
  } | null> {
    const data = await this.makeRequest<any>('/network/exchangerate');
    if (!data) return null;

    // Get recent transactions to calculate TPS
    const recentTx = await this.getTransactions({ limit: 100, order: 'desc' });
    const tps = this.calculateTPS(recentTx);

    return {
      timestamp: data.current_rate?.expiration_time || new Date().toISOString(),
      transactions: recentTx.length,
      tps,
      accounts: 0, // Would need separate query
      tokens: 0,   // Would need separate query
      contracts: 0, // Would need separate query
      fileSize: 0  // Would need separate query
    };
  }

  async getTokenInfo(tokenId: string): Promise<any | null> {
    return this.makeRequest(`/tokens/${tokenId}`);
  }

  async getTokenTransactions(tokenId: string, limit: number = 100): Promise<any[]> {
    const data = await this.makeRequest<{ transactions: any[] }>(
      `/tokens/${tokenId}/transactions?limit=${limit}&order=desc`
    );
    return data?.transactions || [];
  }

  async searchTransactionsByMemo(memo: string, limit: number = 50): Promise<HederaTransaction[]> {
    // Note: Mirror node doesn't support direct memo search, this is a client-side filter
    const recentTx = await this.getRecentTransactions(1000);
    return recentTx
      .filter(tx => {
        if (!tx.memo_base64) return false;
        const decoded = Buffer.from(tx.memo_base64, 'base64').toString('utf-8');
        return decoded.toLowerCase().includes(memo.toLowerCase());
      })
      .slice(0, limit);
  }

  private inferEntityType(transaction: any): string {
    if (transaction.entity_id?.startsWith('0.0.')) {
      const id = parseInt(transaction.entity_id.split('.')[2]);
      if (id < 1000) return 'SYSTEM';
      // Rough heuristic based on typical ID ranges
      if (transaction.name?.includes('TOKEN')) return 'TOKEN';
      if (transaction.name?.includes('CONTRACT')) return 'CONTRACT';
      if (transaction.name?.includes('TOPIC')) return 'TOPIC';
      if (transaction.name?.includes('FILE')) return 'FILE';
      return 'ACCOUNT';
    }
    return 'UNKNOWN';
  }

  private calculateTPS(transactions: HederaTransaction[]): number {
    if (transactions.length < 2) return 0;
    
    const timestamps = transactions
      .map(tx => new Date(tx.consensus_timestamp).getTime())
      .sort((a, b) => a - b);
    
    const timeRange = timestamps[timestamps.length - 1] - timestamps[0];
    if (timeRange === 0) return transactions.length;
    
    return (transactions.length / (timeRange / 1000));
  }
}

// Export singleton instance
export const hederaMirrorClient = new HederaMirrorClient();
