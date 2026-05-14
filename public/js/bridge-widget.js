/**
 * VeraBridge Embeddable Widget
 * 
 * Usage:
 * ```html
 * <div id="vera-bridge"></div>
 * <script src="https://veralattice.com/bridge-widget.js"></script>
 * <script>
 *   VeraBridge.init({
 *     container: '#vera-bridge',
 *     apiKey: 'your-api-key',
 *     theme: 'dark',
 *     chains: ['ethereum', 'hedera', 'solana'],
 *     primaryColor: '#667eea'
 *   });
 * </script>
 * ```
 */

(function(global) {
  'use strict';

  const WIDGET_VERSION = '1.0.0';
  const API_BASE_URL = 'https://api.veralattice.com/v1/bridge';
  const SUPPORTED_CHAINS = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism', 'base', 'avalanche', 'solana', 'hedera', 'sui'];

  class VeraBridgeWidget {
    constructor(config) {
      this.config = {
        container: config.container || '#vera-bridge',
        apiKey: config.apiKey,
        theme: config.theme || 'dark',
        chains: config.chains || SUPPORTED_CHAINS,
        primaryColor: config.primaryColor || '#667eea',
        partnerId: config.partnerId || 'default',
        defaultFromChain: config.defaultFromChain || 'ethereum',
        defaultToChain: config.defaultToChain || 'hedera',
        maxHeight: config.maxHeight || '600px',
        ...config
      };
      
      this.container = null;
      this.isOpen = false;
      this.walletConnected = false;
      this.userAddress = null;
      this.selectedFromChain = this.config.defaultFromChain;
      this.selectedToChain = this.config.defaultToChain;
      this.amount = '';
      this.loading = false;
      
      this.init();
    }

    init() {
      this.container = document.querySelector(this.config.container);
      if (!this.container) {
        console.error('VeraBridge: Container not found:', this.config.container);
        return;
      }
      
      this.injectStyles();
      this.render();
      this.attachEventListeners();
      
      console.log('✅ VeraBridge Widget initialized', { version: WIDGET_VERSION });
    }

    injectStyles() {
      const styles = `
        .vera-bridge-widget {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 480px;
          margin: 0 auto;
          background: ${this.config.theme === 'dark' ? '#1a1a2e' : '#ffffff'};
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
          color: ${this.config.theme === 'dark' ? '#ffffff' : '#1a1a2e'};
        }
        
        .vera-bridge-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .vera-bridge-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          font-size: 18px;
        }
        
        .vera-bridge-badge {
          background: ${this.config.primaryColor};
          color: white;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 600;
        }
        
        .vera-bridge-chain-selector {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 12px;
          align-items: center;
          margin-bottom: 16px;
        }
        
        .vera-bridge-chain-box {
          background: ${this.config.theme === 'dark' ? '#252542' : '#f5f5f5'};
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s;
          border: 2px solid transparent;
        }
        
        .vera-bridge-chain-box:hover {
          border-color: ${this.config.primaryColor};
        }
        
        .vera-bridge-chain-label {
          font-size: 12px;
          opacity: 0.7;
          margin-bottom: 4px;
        }
        
        .vera-bridge-chain-name {
          font-weight: 600;
          font-size: 14px;
        }
        
        .vera-bridge-swap-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: ${this.config.primaryColor};
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s;
        }
        
        .vera-bridge-swap-btn:hover {
          transform: rotate(180deg);
        }
        
        .vera-bridge-amount-input {
          width: 100%;
          background: ${this.config.theme === 'dark' ? '#252542' : '#f5f5f5'};
          border: 2px solid transparent;
          border-radius: 12px;
          padding: 16px;
          font-size: 24px;
          font-weight: 600;
          color: inherit;
          margin-bottom: 16px;
          transition: border-color 0.2s;
        }
        
        .vera-bridge-amount-input:focus {
          outline: none;
          border-color: ${this.config.primaryColor};
        }
        
        .vera-bridge-details {
          background: ${this.config.theme === 'dark' ? '#252542' : '#f5f5f5'};
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
        }
        
        .vera-bridge-detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .vera-bridge-detail-row:last-child {
          margin-bottom: 0;
          padding-top: 8px;
          border-top: 1px solid ${this.config.theme === 'dark' ? '#3a3a5c' : '#e0e0e0'};
          font-weight: 600;
        }
        
        .vera-bridge-action-btn {
          width: 100%;
          background: ${this.config.primaryColor};
          color: white;
          border: none;
          border-radius: 12px;
          padding: 16px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        
        .vera-bridge-action-btn:hover {
          opacity: 0.9;
        }
        
        .vera-bridge-action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .vera-bridge-loading {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 0.8s linear infinite;
          margin-right: 8px;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .vera-bridge-footer {
          margin-top: 16px;
          text-align: center;
          font-size: 12px;
          opacity: 0.6;
        }
        
        .vera-bridge-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
        
        .vera-bridge-modal.active {
          display: flex;
        }
        
        .vera-bridge-modal-content {
          background: ${this.config.theme === 'dark' ? '#1a1a2e' : '#ffffff'};
          border-radius: 16px;
          padding: 24px;
          max-width: 400px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
        }
        
        .vera-bridge-chain-list {
          display: grid;
          gap: 8px;
        }
        
        .vera-bridge-chain-option {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .vera-bridge-chain-option:hover {
          background: ${this.config.theme === 'dark' ? '#252542' : '#f5f5f5'};
        }
        
        .vera-bridge-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }
        
        .vera-bridge-status.success {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }
        
        .vera-bridge-status.error {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
      `;
      
      const styleSheet = document.createElement('style');
      styleSheet.textContent = styles;
      document.head.appendChild(styleSheet);
    }

    render() {
      this.container.innerHTML = `
        <div class="vera-bridge-widget">
          <div class="vera-bridge-header">
            <div class="vera-bridge-logo">
              <span>🌉</span>
              <span>VeraBridge</span>
            </div>
            <span class="vera-bridge-badge">${this.config.chains.length} Chains</span>
          </div>
          
          <div class="vera-bridge-chain-selector">
            <div class="vera-bridge-chain-box" id="vera-from-chain">
              <div class="vera-bridge-chain-label">From</div>
              <div class="vera-bridge-chain-name">${this.formatChainName(this.selectedFromChain)}</div>
            </div>
            
            <button class="vera-bridge-swap-btn" id="vera-swap-chains">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
            </button>
            
            <div class="vera-bridge-chain-box" id="vera-to-chain">
              <div class="vera-bridge-chain-label">To</div>
              <div class="vera-bridge-chain-name">${this.formatChainName(this.selectedToChain)}</div>
            </div>
          </div>
          
          <input 
            type="text" 
            class="vera-bridge-amount-input" 
            id="vera-amount"
            placeholder="0.00"
            autocomplete="off"
          />
          
          <div class="vera-bridge-details">
            <div class="vera-bridge-detail-row">
              <span>Bridge Fee (0.25%)</span>
              <span id="vera-bridge-fee">$0.00</span>
            </div>
            <div class="vera-bridge-detail-row">
              <span>Network Fee</span>
              <span id="vera-network-fee">~$2.50</span>
            </div>
            <div class="vera-bridge-detail-row">
              <span>You Receive</span>
              <span id="vera-receive-amount">0.00</span>
            </div>
          </div>
          
          <button class="vera-bridge-action-btn" id="vera-action-btn">
            Connect Wallet
          </button>
          
          <div class="vera-bridge-footer">
            <span>⚡ 2-5 min • 🔒 HTLC Security • Powered by Vera</span>
          </div>
        </div>
        
        <div class="vera-bridge-modal" id="vera-chain-modal">
          <div class="vera-bridge-modal-content">
            <h3 style="margin-top: 0; margin-bottom: 16px;">Select Chain</h3>
            <div class="vera-bridge-chain-list" id="vera-chain-list"></div>
          </div>
        </div>
      `;
    }

    attachEventListeners() {
      // Chain selection
      document.getElementById('vera-from-chain')?.addEventListener('click', () => this.openChainModal('from'));
      document.getElementById('vera-to-chain')?.addEventListener('click', () => this.openChainModal('to'));
      
      // Swap chains
      document.getElementById('vera-swap-chains')?.addEventListener('click', () => this.swapChains());
      
      // Amount input
      document.getElementById('vera-amount')?.addEventListener('input', (e) => this.handleAmountInput(e));
      
      // Action button
      document.getElementById('vera-action-btn')?.addEventListener('click', () => this.handleAction());
      
      // Close modal on click outside
      document.getElementById('vera-chain-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'vera-chain-modal') {
          this.closeChainModal();
        }
      });
    }

    openChainModal(type) {
      this.chainSelectType = type;
      const modal = document.getElementById('vera-chain-modal');
      const list = document.getElementById('vera-chain-list');
      
      list.innerHTML = this.config.chains.map(chain => `
        <div class="vera-bridge-chain-option" data-chain="${chain}">
          <span>${this.getChainEmoji(chain)}</span>
          <span>${this.formatChainName(chain)}</span>
        </div>
      `).join('');
      
      list.querySelectorAll('.vera-bridge-chain-option').forEach(el => {
        el.addEventListener('click', () => this.selectChain(el.dataset.chain));
      });
      
      modal.classList.add('active');
    }

    closeChainModal() {
      document.getElementById('vera-chain-modal')?.classList.remove('active');
    }

    selectChain(chain) {
      if (this.chainSelectType === 'from') {
        this.selectedFromChain = chain;
        document.querySelector('#vera-from-chain .vera-bridge-chain-name').textContent = this.formatChainName(chain);
      } else {
        this.selectedToChain = chain;
        document.querySelector('#vera-to-chain .vera-bridge-chain-name').textContent = this.formatChainName(chain);
      }
      this.closeChainModal();
      this.updateQuote();
    }

    swapChains() {
      [this.selectedFromChain, this.selectedToChain] = [this.selectedToChain, this.selectedFromChain];
      document.querySelector('#vera-from-chain .vera-bridge-chain-name').textContent = this.formatChainName(this.selectedFromChain);
      document.querySelector('#vera-to-chain .vera-bridge-chain-name').textContent = this.formatChainName(this.selectedToChain);
      this.updateQuote();
    }

    handleAmountInput(e) {
      this.amount = e.target.value;
      this.updateQuote();
    }

    updateQuote() {
      const amount = parseFloat(this.amount) || 0;
      const bridgeFee = amount * 0.0025;
      const networkFee = 2.5;
      const receiveAmount = amount - bridgeFee;
      
      document.getElementById('vera-bridge-fee').textContent = `$${bridgeFee.toFixed(2)}`;
      document.getElementById('vera-network-fee').textContent = `~$${networkFee.toFixed(2)}`;
      document.getElementById('vera-receive-amount').textContent = receiveAmount.toFixed(4);
    }

    async handleAction() {
      const btn = document.getElementById('vera-action-btn');
      
      if (!this.walletConnected) {
        await this.connectWallet();
        return;
      }
      
      if (!this.amount || parseFloat(this.amount) <= 0) {
        this.showStatus('Please enter an amount', 'error');
        return;
      }
      
      btn.disabled = true;
      btn.innerHTML = '<span class="vera-bridge-loading"></span>Processing...';
      
      try {
        await this.initiateBridge();
        this.showStatus('Bridge initiated successfully!', 'success');
        btn.textContent = 'Bridge Complete';
      } catch (error) {
        console.error('Bridge failed:', error);
        this.showStatus('Bridge failed: ' + error.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Try Again';
      }
    }

    async connectWallet() {
      // Check for MetaMask or other Web3 wallet
      if (typeof window.ethereum !== 'undefined') {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          this.walletConnected = true;
          this.userAddress = accounts[0];
          document.getElementById('vera-action-btn').textContent = 
            this.userAddress.slice(0, 6) + '...' + this.userAddress.slice(-4);
        } catch (error) {
          console.error('Wallet connection failed:', error);
        }
      } else {
        alert('Please install MetaMask or a Web3 wallet');
      }
    }

    async initiateBridge() {
      // Call VeraBridge API
      const response = await fetch(`${API_BASE_URL}/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
        },
        body: JSON.stringify({
          sourceChain: this.selectedFromChain,
          targetChain: this.selectedToChain,
          amount: this.amount,
          sender: this.userAddress,
          partnerId: this.config.partnerId,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Bridge API error');
      }
      
      const result = await response.json();
      console.log('Bridge initiated:', result);
      
      // Trigger callback if provided
      if (this.config.onBridgeInitiated) {
        this.config.onBridgeInitiated(result);
      }
      
      return result;
    }

    showStatus(message, type) {
      const widget = document.querySelector('.vera-bridge-widget');
      const existing = widget.querySelector('.vera-bridge-status');
      if (existing) existing.remove();
      
      const status = document.createElement('div');
      status.className = `vera-bridge-status ${type}`;
      status.innerHTML = `
        <span>${type === 'success' ? '✓' : '✗'}</span>
        <span>${message}</span>
      `;
      
      widget.insertBefore(status, widget.firstChild);
      
      setTimeout(() => status.remove(), 5000);
    }

    formatChainName(chain) {
      const names = {
        ethereum: 'Ethereum',
        bsc: 'BNB Chain',
        polygon: 'Polygon',
        arbitrum: 'Arbitrum',
        optimism: 'Optimism',
        base: 'Base',
        avalanche: 'Avalanche',
        solana: 'Solana',
        hedera: 'Hedera',
        sui: 'Sui',
      };
      return names[chain] || chain;
    }

    getChainEmoji(chain) {
      const emojis = {
        ethereum: '⬡',
        bsc: '🟡',
        polygon: '💜',
        arbitrum: '🔵',
        optimism: '🔴',
        base: '🔷',
        avalanche: '🔺',
        solana: '◎',
        hedera: '◆',
        sui: '🌊',
      };
      return emojis[chain] || '🔗';
    }
  }

  // Global API
  global.VeraBridge = {
    init: function(config) {
      return new VeraBridgeWidget(config);
    },
    version: WIDGET_VERSION,
    supportedChains: SUPPORTED_CHAINS,
  };

})(window);
