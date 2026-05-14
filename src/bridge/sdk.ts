/**
 * VeraBridge SDK
 * 
 * Official JavaScript SDK for VeraBridge Multi-Chain Bridge
 * npm: @veralattice/bridge-sdk
 */

// Global type declarations for wallet providers
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      isMetaMask?: boolean;
    };
    solana?: {
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      disconnect: () => Promise<void>;
      isPhantom?: boolean;
    };
    solflare?: {
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      disconnect: () => Promise<void>;
    };
  }
}

export interface BridgeConfig {
  apiKey: string;
  partnerId: string;
  environment?: 'production' | 'sandbox';
  baseUrl?: string;
}

export interface QuoteParams {
  fromChain: string;
  toChain: string;
  amount: string;
  token: string;
}

export interface QuoteResult {
  sourceAmount: string;
  bridgeFee: string;
  networkFee: string;
  targetAmount: string;
  targetToken: string;
  exchangeRate: string;
  estimatedTime: number;
  validUntil: string;
}

export interface BridgeParams {
  fromChain: string;
  toChain: string;
  amount: string;
  token: string;
  recipient: string;
  webhookUrl?: string;
}

export interface BridgeResult {
  bridgeId: string;
  htlcId: string;
  status: 'pending' | 'confirmed' | 'completed' | 'failed';
  sourceTx: string;
  estimatedCompletion: string;
  hcsAttestation: string;
}

export interface BridgeStatus {
  bridgeId: string;
  status: 'pending' | 'awaiting_signatures' | 'processing' | 'confirmed' | 'completed' | 'failed' | 'refunded';
  progress: number;
  sourceTx: string;
  targetTx?: string;
  signatures?: number;
  completedAt?: string;
  failedAt?: string;
  error?: string;
}

export class VeraBridgeSDK {
  private apiKey: string;
  private partnerId: string;
  private baseUrl: string;
  private walletProvider: string | null = null;
  private walletAddress: string | null = null;

  constructor(config: BridgeConfig) {
    this.apiKey = config.apiKey;
    this.partnerId = config.partnerId;
    this.baseUrl = config.baseUrl || 
      (config.environment === 'sandbox' 
        ? 'https://sandbox-api.veralattice.com/v1/bridge'
        : 'https://api.veralattice.com/v1/bridge');
  }

  /**
   * Connect a wallet
   */
  async connectWallet(provider: 'metamask' | 'walletconnect' | 'phantom' | 'solflare'): Promise<string> {
    this.walletProvider = provider;

    switch (provider) {
      case 'metamask':
        return this.connectMetaMask();
      case 'walletconnect':
        return this.connectWalletConnect();
      case 'phantom':
        return this.connectPhantom();
      case 'solflare':
        return this.connectSolflare();
      default:
        throw new Error('Unsupported wallet provider');
    }
  }

  private async connectMetaMask(): Promise<string> {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask not installed');
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      this.walletAddress = accounts[0];
      return this.walletAddress;
    } catch (error) {
      throw new Error('MetaMask connection rejected: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  private async connectWalletConnect(): Promise<string> {
    // WalletConnect integration would go here
    // For now, throw not implemented
    throw new Error('WalletConnect not yet implemented');
  }

  private async connectPhantom(): Promise<string> {
    if (typeof window === 'undefined' || !window.solana) {
      throw new Error('Phantom not installed');
    }

    try {
      const response = await window.solana.connect();
      this.walletAddress = response.publicKey.toString();
      return this.walletAddress;
    } catch (error) {
      throw new Error('Phantom connection rejected: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  private async connectSolflare(): Promise<string> {
    if (typeof window === 'undefined' || !window.solflare) {
      throw new Error('Solflare not installed');
    }

    try {
      const response = await window.solflare.connect();
      this.walletAddress = response.publicKey.toString();
      return this.walletAddress;
    } catch (error) {
      throw new Error('Solflare connection rejected: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Get a bridge quote
   */
  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    const response = await fetch(`${this.baseUrl}/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        sourceChain: params.fromChain,
        targetChain: params.toChain,
        amount: params.amount,
        token: params.token,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get quote' }));
      throw new Error(error.message || 'Failed to get quote');
    }

    const data = await response.json();
    return data.quote;
  }

  /**
   * Initiate a bridge transfer
   */
  async bridge(params: BridgeParams): Promise<BridgeResult> {
    if (!this.walletAddress) {
      throw new Error('Wallet not connected. Call connectWallet() first.');
    }

    const response = await fetch(`${this.baseUrl}/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        sourceChain: params.fromChain,
        targetChain: params.toChain,
        amount: params.amount,
        token: params.token,
        sender: this.walletAddress,
        recipient: params.recipient,
        partnerId: this.partnerId,
        webhookUrl: params.webhookUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to initiate bridge' }));
      throw new Error(error.message || 'Failed to initiate bridge');
    }

    return await response.json();
  }

  /**
   * Get bridge status
   */
  async getStatus(bridgeId: string): Promise<BridgeStatus> {
    const response = await fetch(`${this.baseUrl}/status/${bridgeId}`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get status');
    }

    return await response.json();
  }

  /**
   * Wait for bridge completion
   */
  async waitForCompletion(
    bridgeId: string,
    options: {
      onProgress?: (progress: number) => void;
      timeout?: number;
      pollInterval?: number;
    } = {}
  ): Promise<BridgeStatus> {
    const { onProgress, timeout = 300000, pollInterval = 5000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getStatus(bridgeId);

      if (onProgress) {
        onProgress(status.progress);
      }

      if (status.status === 'completed' || status.status === 'failed' || status.status === 'refunded') {
        return status;
      }

      await this.sleep(pollInterval);
    }

    throw new Error('Bridge timeout');
  }

  /**
   * Get transaction history
   */
  async getHistory(
    address: string,
    options: {
      chain?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    transactions: any[];
    total: number;
    hasMore: boolean;
  }> {
    const params = new URLSearchParams({
      address,
      limit: (options.limit || 20).toString(),
      offset: (options.offset || 0).toString(),
    });

    if (options.chain) {
      params.append('chain', options.chain);
    }

    const response = await fetch(`${this.baseUrl}/history?${params}`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get history');
    }

    return await response.json();
  }

  /**
   * Validate an address
   */
  async validateAddress(chain: string, address: string): Promise<{ valid: boolean; normalized?: string }> {
    const response = await fetch(`${this.baseUrl}/validate-address`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({ chain, address }),
    });

    if (!response.ok) {
      throw new Error('Validation failed');
    }

    return await response.json();
  }

  /**
   * Get supported routes
   */
  async getRoutes(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/routes`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get routes');
    }

    const data = await response.json();
    return data.routes;
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    this.walletProvider = null;
    this.walletAddress = null;
  }

  /**
   * Get connected wallet address
   */
  getAddress(): string | null {
    return this.walletAddress;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default export
export default VeraBridgeSDK;

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VeraBridgeSDK };
}
