/**
 * Vera Defender Wallet Integration
 * HashConnect SDK integration for Hedera wallet connections
 */

(function() {
  'use strict';

  const WalletIntegration = {
    // Connection state
    connected: false,
    accountId: null,
    provider: null,
    hashconnect: null,
    saveData: {
      topic: '',
      pairingString: '',
      pairedAccounts: [],
      pairedWalletData: null
    },

    // App metadata
    appMetadata: {
      name: "Vera Defender",
      description: "Hedera-powered space shooter with NFT skins",
      icon: "https://veralattice.com/vera-defender/icon.png",
      url: window.location.origin
    },

    // Initialize
    init: async function() {
      console.log('[WalletIntegration] Initializing...');
      
      // Check for existing connection
      this.loadSavedData();
      
      // Initialize HashConnect if available
      if (typeof HashConnect !== 'undefined') {
        await this.initHashConnect();
      }
      
      // Update UI
      this.updateUI();
    },

    // Load saved connection data
    loadSavedData: function() {
      try {
        const saved = localStorage.getItem('veraDefender_walletData');
        if (saved) {
          this.saveData = JSON.parse(saved);
          if (this.saveData.pairedAccounts.length > 0) {
            this.accountId = this.saveData.pairedAccounts[0];
            this.connected = true;
          }
        }
      } catch (e) {
        console.warn('[WalletIntegration] Failed to load saved data');
      }
    },

    // Save connection data
    saveConnectionData: function() {
      try {
        localStorage.setItem('veraDefender_walletData', JSON.stringify(this.saveData));
      } catch (e) {
        console.warn('[WalletIntegration] Failed to save connection data');
      }
    },

    // Initialize HashConnect
    initHashConnect: async function() {
      try {
        this.hashconnect = new HashConnect();
        
        // Register events
        this.hashconnect.foundExtensionEvent.on((data) => {
          console.log('[WalletIntegration] Found extension:', data);
        });
        
        this.hashconnect.pairingEvent.on((pairingData) => {
          console.log('[WalletIntegration] Paired with wallet:', pairingData);
          this.handlePairing(pairingData);
        });
        
        this.hashconnect.connectionEvent.on((connectionData) => {
          console.log('[WalletIntegration] Connection event:', connectionData);
        });
        
        // Initialize
        const initData = await this.hashconnect.init(this.appMetadata, 'mainnet', false);
        this.saveData.topic = initData.topic;
        this.saveData.pairingString = initData.pairingString;
        
        console.log('[WalletIntegration] HashConnect initialized');
        
        // Check for existing session
        if (this.saveData.pairedAccounts.length > 0) {
          await this.restoreConnection();
        }
        
      } catch (error) {
        console.error('[WalletIntegration] HashConnect initialization failed:', error);
      }
    },

    // Handle wallet pairing
    handlePairing: function(pairingData) {
      this.saveData.pairedWalletData = pairingData;
      this.saveData.pairedAccounts = pairingData.accountIds;
      this.saveConnectionData();
      
      this.accountId = pairingData.accountIds[0];
      this.connected = true;
      
      this.updateUI();
      this.emitWalletEvent('connected', { accountId: this.accountId });
      
      console.log('[WalletIntegration] Wallet connected:', this.accountId);
    },

    // Restore existing connection
    restoreConnection: async function() {
      try {
        if (this.hashconnect && this.saveData.topic) {
          await this.hashconnect.connect(
            this.saveData.topic,
            this.saveData.pairedWalletData?.metadata
          );
          console.log('[WalletIntegration] Connection restored');
        }
      } catch (error) {
        console.warn('[WalletIntegration] Failed to restore connection:', error);
        this.clearConnection();
      }
    },

    // Connect wallet
    connect: async function() {
      if (this.connected) {
        console.log('[WalletIntegration] Already connected');
        return;
      }

      try {
        if (this.hashconnect) {
          // Open pairing modal
          this.hashconnect.connectToLocalWallet();
          console.log('[WalletIntegration] Pairing modal opened');
        } else {
          // Fallback: simulate connection for demo
          console.log('[WalletIntegration] HashConnect not available, using fallback');
          await this.fallbackConnect();
        }
      } catch (error) {
        console.error('[WalletIntegration] Connection failed:', error);
        this.emitWalletEvent('error', { message: error.message });
      }
    },

    // Fallback connection for demo
    fallbackConnect: async function() {
      // Simulate connection delay
      await new Promise(r => setTimeout(r, 1000));
      
      this.accountId = `0.0.${Math.floor(100000 + Math.random() * 900000)}`;
      this.connected = true;
      
      this.saveData.pairedAccounts = [this.accountId];
      this.saveConnectionData();
      
      this.updateUI();
      this.emitWalletEvent('connected', { accountId: this.accountId });
    },

    // Disconnect wallet
    disconnect: async function() {
      try {
        if (this.hashconnect) {
          await this.hashconnect.disconnect(this.saveData.topic);
        }
      } catch (e) {
        console.warn('[WalletIntegration] Disconnect error:', e);
      }
      
      this.clearConnection();
      this.emitWalletEvent('disconnected');
    },

    // Clear connection data
    clearConnection: function() {
      this.connected = false;
      this.accountId = null;
      this.saveData.pairedAccounts = [];
      this.saveData.pairedWalletData = null;
      this.saveConnectionData();
      this.updateUI();
    },

    // Sign message
    signMessage: async function(message) {
      if (!this.connected || !this.hashconnect) {
        throw new Error('Wallet not connected');
      }

      try {
        const response = await this.hashconnect.sign(
          this.saveData.topic,
          this.accountId,
          message
        );
        
        return response;
      } catch (error) {
        console.error('[WalletIntegration] Sign failed:', error);
        throw error;
      }
    },

    // Send transaction
    sendTransaction: async function(transaction) {
      if (!this.connected || !this.hashconnect) {
        throw new Error('Wallet not connected');
      }

      try {
        const response = await this.hashconnect.sendTransaction(
          this.saveData.topic,
          transaction
        );
        
        return response;
      } catch (error) {
        console.error('[WalletIntegration] Transaction failed:', error);
        throw error;
      }
    },

    // Get account balance
    getBalance: async function() {
      if (!this.connected) {
        return null;
      }

      try {
        // In real implementation, query mirror node
        // For demo, return mock data
        return {
          hbar: 100.5,
          hbarUsd: 5.025,
          tokens: []
        };
      } catch (error) {
        console.error('[WalletIntegration] Balance query failed:', error);
        return null;
      }
    },

    // Update UI elements
    updateUI: function() {
      const walletBtn = document.getElementById('connect-wallet-btn');
      const walletStatus = document.getElementById('wallet-status');
      
      if (walletBtn) {
        if (this.connected) {
          walletBtn.textContent = '🔓 Disconnect';
          walletBtn.onclick = () => this.disconnect();
        } else {
          walletBtn.textContent = '🔗 Connect Wallet';
          walletBtn.onclick = () => this.connect();
        }
      }
      
      if (walletStatus) {
        if (this.connected) {
          walletStatus.className = 'connected';
          walletStatus.innerHTML = `🟢 ${this.formatAccountId(this.accountId)}`;
        } else {
          walletStatus.className = 'disconnected';
          walletStatus.innerHTML = '🔴 Wallet: Not Connected';
        }
      }
    },

    // Format account ID for display
    formatAccountId: function(accountId) {
      if (!accountId) return '';
      if (accountId.length > 12) {
        return `${accountId.slice(0, 6)}...${accountId.slice(-4)}`;
      }
      return accountId;
    },

    // Emit wallet event
    emitWalletEvent: function(type, data = {}) {
      const event = new CustomEvent('walletEvent', {
        detail: { type, ...data }
      });
      window.dispatchEvent(event);
    },

    // Check if connected
    isConnected: function() {
      return this.connected;
    },

    // Get account ID
    getAccountId: function() {
      return this.accountId;
    },

    // Associate token (for receiving NFTs)
    associateToken: async function(tokenId) {
      if (!this.connected) {
        throw new Error('Wallet not connected');
      }

      // In real implementation, create and sign token associate transaction
      console.log('[WalletIntegration] Associating token:', tokenId);
      return true;
    }
  };

  // Expose to global scope
  if (typeof window !== 'undefined') {
    window.WalletIntegration = WalletIntegration;
    
    // Auto-initialize
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => WalletIntegration.init());
    } else {
      WalletIntegration.init();
    }
  }
})();
