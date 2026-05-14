/**
 * Vera SDK - JavaScript/TypeScript Client
 * Official SDK for Vera Enterprise API
 * Phase 5: Enterprise Integration
 */

import { Client, TopicMessageSubmitTransaction } from '@hashgraph/sdk';

class VeraSDK {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.VERA_API_KEY;
    this.baseURL = config.baseURL || 'https://api.veralattice.com';
    this.network = config.network || 'mainnet';
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    
    // Hedera client for x402 payments
    this.hederaClient = null;
    if (config.hederaOperatorId && config.hederaOperatorKey) {
      this.initializeHedera(config.hederaOperatorId, config.hederaOperatorKey);
    }
  }

  async initializeHedera(operatorId, operatorKey) {
    const { Client, PrivateKey } = await import('@hashgraph/sdk');
    this.hederaClient = Client.forMainnet();
    
    let privateKey;
    if (operatorKey.length === 64) {
      try {
        privateKey = PrivateKey.fromStringECDSA(operatorKey);
      } catch {
        privateKey = PrivateKey.fromStringED25519(operatorKey);
      }
    } else {
      privateKey = PrivateKey.fromString(operatorKey);
    }
    
    this.hederaClient.setOperator(operatorId, privateKey);
  }

  // HTTP request with retry logic
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      ...options.headers
    };

    let lastError;
    for (let i = 0; i < this.retries; i++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers,
          timeout: this.timeout
        });

        if (!response.ok) {
          // Handle 402 Payment Required
          if (response.status === 402) {
            const errorData = await response.json();
            return this.handlePaymentRequired(errorData, endpoint, options);
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        if (i < this.retries - 1) {
          await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
      }
    }

    throw lastError;
  }

  // Handle x402 payment
  async handlePaymentRequired(errorData, endpoint, options) {
    if (!this.hederaClient) {
      throw new Error('Hedera client not initialized for x402 payments');
    }

    const { payment } = errorData;
    console.log(`💰 x402 Payment required: $${payment.amount} for ${endpoint}`);

    // Create and submit payment transaction
    const paymentTx = await new TopicMessageSubmitTransaction()
      .setTopicId(payment.recipient)
      .setMessage(JSON.stringify({
        requestId: payment.requestId,
        amount: payment.amount,
        endpoint: payment.endpoint,
        timestamp: Date.now()
      }))
      .execute(this.hederaClient);

    const receipt = await paymentTx.getReceipt(this.hederaClient);
    const paymentProof = receipt.topicSequenceNumber.toString();

    // Retry request with payment proof
    return this.request(endpoint, {
      ...options,
      headers: {
        ...options.headers,
        'X-Payment-Proof': paymentProof
      }
    });
  }

  // ============================================
  // SWARM API
  // ============================================
  
  async getSwarmStatus() {
    return this.request('/api/swarm/status');
  }

  async getAgentStatus(agentType) {
    return this.request(`/api/agents/${agentType}`);
  }

  async deployAgent(config) {
    return this.request('/api/agents/deploy', {
      method: 'POST',
      body: JSON.stringify(config)
    });
  }

  // ============================================
  // BRIDGE API
  // ============================================

  async getBridgeStatus() {
    return this.request('/api/bridge/status');
  }

  async initiateTransfer(params) {
    const { sourceChain, targetChain, amount, token, recipient } = params;
    return this.request('/api/bridge/transfer', {
      method: 'POST',
      body: JSON.stringify({
        sourceChain,
        targetChain,
        amount,
        token,
        recipient
      })
    });
  }

  // ============================================
  // AI API
  // ============================================

  async chat(message, sessionId = 'default') {
    return this.request('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, sessionId })
    });
  }

  async generateReport(type, period = '24h') {
    return this.request('/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ type, period })
    });
  }

  // ============================================
  // FALCON SIGNING
  // ============================================

  async falconSign(data) {
    return this.request('/api/falcon/sign', {
      method: 'POST',
      body: JSON.stringify({ data })
    });
  }

  // ============================================
  // STREAMING (WebSocket)
  // ============================================

  connectWebSocket(sessionId = 'default') {
    const ws = new WebSocket(this.baseURL.replace('https', 'wss'));
    
    ws.onopen = () => {
      console.log('🔌 Vera WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.emit('message', data);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    };

    ws.onclose = () => {
      console.log('🔌 Vera WebSocket disconnected');
    };

    this.ws = ws;
    return ws;
  }

  sendWebSocketMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ message }));
    }
  }

  // Event emitter functionality
  listeners = {};
  on(event, callback) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}

// Export for different module systems
export { VeraSDK };
export default VeraSDK;

// Browser global
if (typeof window !== 'undefined') {
  window.VeraSDK = VeraSDK;
}
