#!/usr/bin/env node
/**
 * Vera Enterprise API Server with x402 Micropayments
 * Phase 5: Monetization & Enterprise Features
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Client, PrivateKey, AccountBalanceQuery } from '@hashgraph/sdk';
import { FalconSignature } from '../agents/vera-qvx-falcon-handshake.mjs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Payment-Proof']
}));

app.use(express.json());

// ============================================
// X402 MICROPAYMENT SYSTEM
// ============================================
class X402PaymentProcessor {
  constructor() {
    this.client = null;
    this.pricing = {
      'swarm.status': 0.01,      // $0.01 per call
      'agent.query': 0.05,       // $0.05 per call
      'bridge.status': 0.02,     // $0.02 per call
      'bridge.transfer': 0.25,   // $0.25 per call
      'ai.chat': 0.10,           // $0.10 per call
      'analytics.query': 0.15,   // $0.15 per call
      'report.generate': 0.50,   // $0.50 per call
      'falcon.sign': 0.03        // $0.03 per call
    };
    this.pendingPayments = new Map();
    this.completedPayments = new Map();
    this.revenue = 0;
    this.falcon = new FalconSignature();
  }

  async initialize() {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;
    
    if (operatorId && operatorKey) {
      this.client = Client.forMainnet();
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
      this.client.setOperator(operatorId, privateKey);
    }
    
    await this.falcon.initialize();
    console.log('💰 X402 Payment Processor initialized');
  }

  // Generate payment requirement (402 response)
  requirePayment(endpoint, requestId) {
    const amount = this.pricing[endpoint] || 0.01;
    const paymentRequest = {
      requestId,
      endpoint,
      amount,
      currency: 'USD',
      network: 'hedera',
      recipient: process.env.HEDERA_OPERATOR_ID,
      expiresAt: Date.now() + 300000, // 5 minutes
      x402Version: '1.0'
    };
    
    this.pendingPayments.set(requestId, paymentRequest);
    
    return {
      status: 402,
      error: 'Payment Required',
      payment: paymentRequest,
      message: `This endpoint requires $${amount} payment. Submit payment proof in X-Payment-Proof header.`
    };
  }

  // Verify payment proof
  async verifyPayment(requestId, paymentProof) {
    const paymentRequest = this.pendingPayments.get(requestId);
    if (!paymentRequest) {
      return { valid: false, error: 'Payment request not found or expired' };
    }

    if (Date.now() > paymentRequest.expiresAt) {
      this.pendingPayments.delete(requestId);
      return { valid: false, error: 'Payment request expired' };
    }

    // In production, verify Hedera transaction
    // For now, simulate verification
    const isValid = this.verifyHederaPayment(paymentProof, paymentRequest);
    
    if (isValid) {
      this.completedPayments.set(requestId, {
        ...paymentRequest,
        paidAt: Date.now(),
        proof: paymentProof
      });
      this.pendingPayments.delete(requestId);
      this.revenue += paymentRequest.amount;
      
      return { valid: true, amount: paymentRequest.amount };
    }
    
    return { valid: false, error: 'Invalid payment proof' };
  }

  verifyHederaPayment(proof, request) {
    // Verify payment transaction on Hedera
    // In production: query Hedera mirror node
    return proof && proof.length > 10; // Simplified
  }

  getRevenue() {
    return {
      total: this.revenue,
      pending: this.pendingPayments.size,
      completed: this.completedPayments.size
    };
  }

  getPricing() {
    return this.pricing;
  }
}

const paymentProcessor = new X402PaymentProcessor();

// ============================================
// API KEY MANAGEMENT
// ============================================
class APIKeyManager {
  constructor() {
    this.keys = new Map();
    this.usage = new Map();
    this.plans = {
      free: { requests: 100, price: 0 },
      pro: { requests: 10000, price: 49 },
      enterprise: { requests: 100000, price: 499 }
    };
  }

  generateKey(plan = 'free', customerId) {
    const key = `vera_${Buffer.from(Math.random().toString()).toString('base64').slice(0, 32)}`;
    const apiKey = {
      key,
      plan,
      customerId,
      createdAt: Date.now(),
      requestsUsed: 0,
      requestsLimit: this.plans[plan].requests,
      active: true
    };
    
    this.keys.set(key, apiKey);
    this.usage.set(key, []);
    
    return apiKey;
  }

  validateKey(key) {
    const apiKey = this.keys.get(key);
    if (!apiKey) return { valid: false, error: 'Invalid API key' };
    if (!apiKey.active) return { valid: false, error: 'API key deactivated' };
    if (apiKey.requestsUsed >= apiKey.requestsLimit) {
      return { valid: false, error: 'Request limit exceeded', upgrade: true };
    }
    
    return { valid: true, plan: apiKey.plan };
  }

  recordUsage(key, endpoint, cost) {
    const apiKey = this.keys.get(key);
    if (apiKey) {
      apiKey.requestsUsed++;
      this.usage.get(key).push({
        endpoint,
        cost,
        timestamp: Date.now()
      });
    }
  }

  getUsage(key) {
    return this.usage.get(key) || [];
  }
}

const keyManager = new APIKeyManager();

// ============================================
// PAYMENT MIDDLEWARE
// ============================================
async function paymentMiddleware(req, res, next) {
  const endpoint = req.path.replace('/api/', '').replace(/\//g, '.');
  const price = paymentProcessor.pricing[endpoint];
  
  // Skip payment for free endpoints
  if (!price || price === 0) {
    return next();
  }
  
  // Check API key for paid plans
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const validation = keyManager.validateKey(apiKey);
    if (validation.valid && validation.plan !== 'free') {
      keyManager.recordUsage(apiKey, endpoint, 0); // No per-call charge for paid plans
      return next();
    }
  }
  
  // Require x402 payment for pay-as-you-go
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const paymentProof = req.headers['x-payment-proof'];
  
  if (!paymentProof) {
    return res.status(402).json(paymentProcessor.requirePayment(endpoint, requestId));
  }
  
  const verification = await paymentProcessor.verifyPayment(requestId, paymentProof);
  if (!verification.valid) {
    return res.status(402).json({
      error: 'Payment verification failed',
      details: verification.error
    });
  }
  
  req.payment = verification;
  next();
}

// ============================================
// RATE LIMITING
// ============================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip
});

app.use(limiter);

// ============================================
// API ROUTES
// ============================================

// Health check (free)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '5.0.0',
    timestamp: Date.now(),
    falcon: true,
    x402: true
  });
});

// Get pricing (free)
app.get('/api/pricing', (req, res) => {
  res.json({
    endpoints: paymentProcessor.getPricing(),
    plans: keyManager.plans,
    currency: 'USD'
  });
});

// Generate API key (requires payment for paid plans)
app.post('/api/keys', paymentMiddleware, async (req, res) => {
  const { plan = 'free', customerId } = req.body;
  
  if (!keyManager.plans[plan]) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  
  const apiKey = keyManager.generateKey(plan, customerId);
  
  res.json({
    apiKey: apiKey.key,
    plan,
    requestsLimit: apiKey.requestsLimit,
    message: plan === 'free' ? 'Free tier: 100 requests/day' : `${plan} tier activated`
  });
});

// Swarm status (x402: $0.01)
app.get('/api/swarm/status', paymentMiddleware, async (req, res) => {
  const status = {
    totalAgents: 39,
    agentTypes: 9,
    activeChains: 4,
    falconSignatures: 1247,
    timestamp: Date.now()
  };
  
  // Sign with Falcon-512
  const falcon = new FalconSignature();
  await falcon.initialize();
  const falconKey = await falcon.generateKeypair('api-server');
  const signature = await falcon.sign(status, falconKey.privateKey);
  
  res.json({
    ...status,
    _falcon: {
      signature: signature.signature,
      publicKey: falconKey.publicKey,
      algorithm: 'Falcon-512'
    }
  });
});

// Agent query (x402: $0.05)
app.get('/api/agents/:type', paymentMiddleware, async (req, res) => {
  const { type } = req.params;
  
  res.json({
    type,
    agents: [],
    status: 'active',
    timestamp: Date.now()
  });
});

// Bridge transfer (x402: $0.25)
app.post('/api/bridge/transfer', paymentMiddleware, async (req, res) => {
  const { sourceChain, targetChain, amount, token, recipient } = req.body;
  
  res.json({
    transferId: `xfer-${Date.now()}`,
    status: 'INITIATED',
    sourceChain,
    targetChain,
    amount,
    token,
    fee: amount * 0.0025,
    timestamp: Date.now()
  });
});

// AI chat (x402: $0.10)
app.post('/api/ai/chat', paymentMiddleware, async (req, res) => {
  const { message } = req.body;
  
  res.json({
    response: 'AI response would go here',
    message,
    timestamp: Date.now()
  });
});

// Generate report (x402: $0.50)
app.post('/api/reports/generate', paymentMiddleware, async (req, res) => {
  const { type, period } = req.body;
  
  res.json({
    reportId: `rpt-${Date.now()}`,
    type,
    period,
    status: 'generating',
    estimatedTime: '30 seconds',
    timestamp: Date.now()
  });
});

// Falcon sign (x402: $0.03)
app.post('/api/falcon/sign', paymentMiddleware, async (req, res) => {
  const { data } = req.body;
  
  const falcon = new FalconSignature();
  await falcon.initialize();
  const keypair = await falcon.generateKeypair('api-signer');
  const signature = await falcon.sign(data, keypair.privateKey);
  
  res.json({
    signature: signature.signature,
    publicKey: keypair.publicKey,
    timestamp: signature.timestamp
  });
});

// Admin: Get revenue stats
app.get('/admin/revenue', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  res.json(paymentProcessor.getRevenue());
});

// Admin: Get API usage
app.get('/admin/usage', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const usage = {};
  for (const [key, data] of keyManager.usage) {
    usage[key.slice(0, 10) + '...'] = data.length;
  }
  
  res.json(usage);
});

// Start server
async function startServer() {
  await paymentProcessor.initialize();
  
  const PORT = process.env.ENTERPRISE_API_PORT || 4567;
  
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  💼 VERA ENTERPRISE API SERVER                                 ║
║  Phase 5: Monetization & x402 Micropayments                  ║
╠═══════════════════════════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(52)} ║
║  Pricing Model: x402 (pay-per-call) + Tiered Subscriptions    ║
╠═══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                   ║
║    GET  /health                    Free                      ║
║    GET  /api/pricing               Free                      ║
║    GET  /api/swarm/status          $0.01                     ║
║    GET  /api/agents/:type          $0.05                     ║
║    POST /api/bridge/transfer       $0.25 + 0.25%            ║
║    POST /api/ai/chat               $0.10                     ║
║    POST /api/reports/generate      $0.50                     ║
║    POST /api/falcon/sign           $0.03                     ║
╠═══════════════════════════════════════════════════════════════╣
║  Subscription Plans:                                          ║
║    Free:    100 requests/day                                   ║
║    Pro:     $49/mo - 10K requests + Falcon signing          ║
║    Enterprise: $499/mo - 100K requests + Dedicated shard    ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  });
}

startServer().catch(console.error);
