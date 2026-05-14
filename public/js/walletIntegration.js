/**
 * VeraBridge Wallet Integration
 * 
 * Supports:
 * - MetaMask (Ethereum, Polygon, Arbitrum, Optimism, Base)
 * - HashPack (Hedera)
 * - WalletConnect (mobile wallets)
 */

class WalletManager {
  constructor() {
    this.hederaWallet = null;
    this.evmWallet = null;
    this.hederaAccount = null;
    this.evmAddress = null;
    this.isConnected = false;
    this.callbacks = {};
  }

  on(event, callback) {
    this.callbacks[event] = callback;
  }

  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event](data);
    }
  }

  /**
   * Connect MetaMask for EVM chains
   */
  async connectMetaMask() {
    if (typeof window.ethereum === 'undefined') {
      throw new Error('MetaMask not installed. Please install MetaMask extension.');
    }

    try {
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      this.evmAddress = accounts[0];
      this.evmWallet = 'metamask';
      
      // Listen for account changes
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          this.disconnect();
        } else {
          this.evmAddress = accounts[0];
          this.emit('evmAccountChanged', accounts[0]);
        }
      });

      // Listen for chain changes
      window.ethereum.on('chainChanged', (chainId) => {
        this.emit('chainChanged', chainId);
      });

      this.isConnected = !!this.hederaAccount;
      this.emit('evmConnected', { address: this.evmAddress });
      
      return { success: true, address: this.evmAddress };
    } catch (error) {
      console.error('MetaMask connection failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Connect HashPack for Hedera
   */
  async connectHashPack() {
    // Check if HashPack is installed
    if (!window.hashpack) {
      throw new Error('HashPack not installed. Please install HashPack extension.');
    }

    try {
      const response = await window.hashpack.connect();
      
      if (response.success) {
        this.hederaAccount = response.accountId;
        this.hederaWallet = 'hashpack';
        this.isConnected = !!this.evmAddress;
        
        this.emit('hederaConnected', { accountId: this.hederaAccount });
        
        return { success: true, accountId: this.hederaAccount };
      } else {
        throw new Error(response.error || 'HashPack connection failed');
      }
    } catch (error) {
      console.error('HashPack connection failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get EVM balance
   */
  async getEVMBalance(token = 'ETH') {
    if (!this.evmAddress) return null;

    try {
      const balance = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [this.evmAddress, 'latest']
      });
      
      // Convert from wei to ETH
      const ethBalance = parseInt(balance, 16) / 1e18;
      return ethBalance;
    } catch (error) {
      console.error('Failed to get balance:', error);
      return null;
    }
  }

  /**
   * Switch to correct network
   */
  async switchNetwork(chain) {
    const chainIds = {
      'ethereum': '0x1',
      'polygon': '0x89',
      'arbitrum': '0xa4b1',
      'optimism': '0xa',
      'base': '0x2105'
    };

    const chainId = chainIds[chain];
    if (!chainId) return { success: false, error: 'Unknown chain' };

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId }]
      });
      return { success: true };
    } catch (error) {
      // Chain not added, try to add it
      if (error.code === 4902) {
        return await this.addNetwork(chain);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Add network to MetaMask
   */
  async addNetwork(chain) {
    const networks = {
      'polygon': {
        chainId: '0x89',
        chainName: 'Polygon Mainnet',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://polygon-rpc.com'],
        blockExplorerUrls: ['https://polygonscan.com']
      },
      'arbitrum': {
        chainId: '0xa4b1',
        chainName: 'Arbitrum One',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://arb1.arbitrum.io/rpc'],
        blockExplorerUrls: ['https://arbiscan.io']
      },
      'optimism': {
        chainId: '0xa',
        chainName: 'Optimism',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://mainnet.optimism.io'],
        blockExplorerUrls: ['https://optimistic.etherscan.io']
      },
      'base': {
        chainId: '0x2105',
        chainName: 'Base',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://mainnet.base.org'],
        blockExplorerUrls: ['https://basescan.org']
      }
    };

    const network = networks[chain];
    if (!network) return { success: false, error: 'Network config not found' };

    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [network]
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Disconnect wallets
   */
  disconnect() {
    this.hederaWallet = null;
    this.evmWallet = null;
    this.hederaAccount = null;
    this.evmAddress = null;
    this.isConnected = false;
    
    this.emit('disconnected');
  }

  /**
   * Check if fully connected (both wallets)
   */
  isFullyConnected() {
    return !!(this.evmAddress && this.hederaAccount);
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isFullyConnected(),
      evm: {
        connected: !!this.evmAddress,
        address: this.evmAddress,
        wallet: this.evmWallet
      },
      hedera: {
        connected: !!this.hederaAccount,
        accountId: this.hederaAccount,
        wallet: this.hederaWallet
      }
    };
  }
}

// Export singleton
const walletManager = new WalletManager();
export default walletManager;
