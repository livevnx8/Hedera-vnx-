#!/usr/bin/env node
/**
 * Vera Hummingbird Volume Generator v1.0
 * Micro-volume generation for token 0.0.9356476 (hbar.h)
 * Ultra-efficient, constant volume with minimal cost
 * "Hummingbird" method - rapid micro-transfers, no loss
 */

import { VeraAgent } from '../blueprints/agent-base.mjs';
import { Client, TransferTransaction, AccountId, Hbar, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

// Hummingbird Configuration - Ultra efficient
const HUMMER_CONFIG = {
  tokenId: '0.0.9356476',
  name: 'hbar.h',
  type: 'HBAR_WRAPPED',
  microAmount: 0.00001,     // Micro transfer: 0.00001 HBAR (tiny!)
  targetTPS: 50,            // Sustainable TPS for constant volume
  batchSize: 5,             // Small batches for rapid execution
  cycleInterval: 100,       // 100ms cycles = 10 cycles/second
  maxDailyCost: 0.05,       // Max $0.05/day (ultra low cost)
  mode: 'hummingbird',      // Self-transfer mode (no loss)
};

// Ultra-low cost configuration
const COST_CONFIG = {
  cryptoTransfer: 0.0001,   // $0.0001 per transfer
  targetHourlyCost: 0.002, // ~$0.002/hour for 24/7 operation
};

// HCS Topics for coordination
const TOPICS = {
  VOLUME_COORDINATION: process.env.VOLUME_COORD_TOPIC || '0.0.10414355',
  METRICS: process.env.VOLUME_METRICS_TOPIC || '0.0.10414357',
  PERFORMANCE: process.env.VOLUME_PERF_TOPIC || '0.0.10414362'
};

/**
 * HummingbirdVolumeGenerator - Ultra-efficient micro-volume generator
 * Creates constant volume through rapid self-transfers (no loss)
 * Like a hummingbird: fast, efficient, constant motion
 */
class HummingbirdVolumeGenerator extends VeraAgent {
  constructor(config) {
    super({
      id: config.id || 'vera-hummingbird-001',
      type: 'HUMMINGBIRD_GENERATOR',
      version: '1.0.0',
      credentials: {
        accountId: process.env.HEDERA_OPERATOR_ID,
        privateKey: process.env.HEDERA_OPERATOR_KEY
      },
      topics: TOPICS,
      cycleInterval: HUMMER_CONFIG.cycleInterval
    });

    this.config = { ...HUMMER_CONFIG, ...config.hummerConfig };
    this.costConfig = COST_CONFIG;
    this.metrics = {
      totalTx: 0,
      volumeHBAR: 0,
      totalCost: 0,
      avgTPS: 0,
      peakTPS: 0,
      startTime: Date.now(),
      cycles: 0
    };
    this.isRunning = false;
    this.tpsWindow = [];
    this.client = null;
    this.operatorId = null;
    this.maxSpendLimit = this.config.maxDailyCost;
  }

  /**
   * Initialize Hedera client with proper key parsing
   */
  async initialize() {
    // Parent class handles base initialization in constructor
    // Just set up the Hedera client here
    
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;
    
    if (operatorId && operatorKey) {
      this.client = Client.forMainnet();
      
      // Parse private key from hex string (detect key type automatically)
      let privateKey;
      if (operatorKey.length === 64) {
        // Raw hex key - try ECDSA first (common for Hedera), fallback to ED25519
        try {
          privateKey = PrivateKey.fromStringECDSA(operatorKey);
        } catch {
          try {
            privateKey = PrivateKey.fromStringED25519(operatorKey);
          } catch (e) {
            console.error('❌ Failed to parse private key:', e.message);
            process.exit(1);
          }
        }
      } else {
        // DER encoded key or other format
        privateKey = PrivateKey.fromString(operatorKey);
      }
      
      this.client.setOperator(operatorId, privateKey);
      this.operatorId = operatorId;
      
      this.log('HUMMINGBIRD', 'CLIENT_INIT', {
        operatorId,
        network: 'mainnet',
        mode: 'hummingbird'
      });
    } else {
      console.error('❌ Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY');
      process.exit(1);
    }
    
    return this;
  }

  /**
   * Hummingbird work cycle - rapid micro-transfers
   */
  async performWork() {
    if (!this.isRunning) return;
    
    // Safety: Stop if approaching spending limit
    if (this.metrics.totalCost >= this.maxSpendLimit) {
      console.log(`\n🛑 DAILY LIMIT REACHED: $${this.maxSpendLimit.toFixed(2)}`);
      this.stop();
      return;
    }
    
    const cycleStart = Date.now();
    const cycleId = crypto.randomUUID().substring(0, 8);
    
    try {
      // Generate hummingbird batch (rapid micro-transfers)
      const batchResults = await this.generateHummingbirdBatch();
      
      // Calculate metrics
      const cycleDuration = Date.now() - cycleStart;
      const cycleTPS = batchResults.count / (cycleDuration / 1000);
      
      // Update metrics
      this.metrics.totalTx += batchResults.count;
      this.metrics.volumeHBAR += batchResults.volume;
      this.metrics.totalCost += batchResults.cost;
      this.metrics.cycles++;
      
      // Track TPS
      this.tpsWindow.push(cycleTPS);
      if (this.tpsWindow.length > 20) this.tpsWindow.shift();
      this.metrics.avgTPS = this.tpsWindow.reduce((a, b) => a + b, 0) / this.tpsWindow.length;
      this.metrics.peakTPS = Math.max(this.metrics.peakTPS, cycleTPS);
      
      // Display metrics every 50 cycles (~5 seconds)
      if (this.metrics.cycles % 50 === 0) {
        this.displayHummingbirdMetrics();
      }
      
    } catch (error) {
      // Silent fail - hummingbird keeps flying
    }
  }

  /**
   * Generate hummingbird batch - rapid self-transfers (no loss!)
   */
  async generateHummingbirdBatch() {
    const results = {
      count: 0,
      volume: 0,
      cost: 0,
      txIds: []
    };
    
    const { batchSize, microAmount } = this.config;
    
    // HUMMINGBIRD METHOD: Rapid self-transfers (no loss of funds!)
    // Just move tiny amounts to yourself - creates volume without losing money
    for (let i = 0; i < batchSize; i++) {
      try {
        const txId = await this.createMicroSelfTransfer(microAmount);
        if (txId) {
          results.count++;
          results.volume += microAmount;
          results.cost += this.costConfig.cryptoTransfer;
          results.txIds.push(txId);
        }
      } catch (err) {
        // Hummingbird ignores individual failures
      }
    }
    
    return results;
  }

  /**
   * Create micro self-transfer (the hummingbird's wing flap)
   */
  async createMicroSelfTransfer(amount) {
    if (!this.client) return null;
    
    try {
      // Self-transfer: send to yourself (no loss!)
      const transferTx = new TransferTransaction()
        .addHbarTransfer(this.operatorId, Hbar.fromTinybars(-Math.floor(amount * 100000000)))
        .addHbarTransfer(AccountId.fromString(this.operatorId), Hbar.fromTinybars(Math.floor(amount * 100000000)))
        .setTransactionMemo(`hummer-${Date.now()}`);
      
      const response = await transferTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      
      return response.transactionId.toString();
    } catch (error) {
      return null;
    }
  }

  /**
   * Display hummingbird metrics dashboard
   */
  displayHummingbirdMetrics() {
    const runtime = (Date.now() - this.metrics.startTime) / 1000;
    const runtimeHours = (runtime / 3600).toFixed(2);
    const hourlyRate = this.metrics.totalCost / (runtime / 3600);
    
    console.log(`
┌─────────────────────────────────────────────────────────────┐
│  🐦 VERA HUMMINGBIRD - CONSTANT VOLUME ENGINE                │
├─────────────────────────────────────────────────────────────┤
│  Token: ${this.config.tokenId} (${this.config.name})                        │
│  Mode: ${this.config.mode.toUpperCase()} (NO LOSS)                              │
│  Runtime: ${runtimeHours.padStart(5)} hours                                     │
├─────────────────────────────────────────────────────────────┤
│  ⚡ SPEED                                                    │
│     Transactions: ${this.metrics.totalTx.toString().padStart(10)}                  │
│     Current TPS:  ${this.metrics.avgTPS.toFixed(2).padStart(10)}                   │
│     Peak TPS:     ${this.metrics.peakTPS.toFixed(2).padStart(10)}                   │
├─────────────────────────────────────────────────────────────┤
│  💰 EFFICIENCY                                               │
│     Total Cost:   $${this.metrics.totalCost.toFixed(4).padStart(9)}                   │
│     Hourly Rate:  $${hourlyRate.toFixed(4).padStart(9)}/hour               │
│     Daily Proj:   $${(hourlyRate * 24).toFixed(2).padStart(9)}                   │
│     Limit:        $${this.maxSpendLimit.toFixed(2).padStart(9)}                   │
├─────────────────────────────────────────────────────────────┤
│  📊 VOLUME                                                   │
│     Micro Amount: ${this.config.microAmount.toFixed(5).padStart(10)} HBAR          │
│     Total Vol:    ${this.metrics.volumeHBAR.toFixed(5).padStart(10)} HBAR          │
│     Cost per 1K:  $${(this.metrics.totalCost / Math.max(this.metrics.totalTx, 1) * 1000).toFixed(4).padStart(9)}                   │
├─────────────────────────────────────────────────────────────┤
│  🎯 TARGET: 0.0.9356476 (hbar.h)                            │
│     Constant micro-volume for token visibility                │
│     Ultra-low cost, sustainable 24/7 operation               │
└─────────────────────────────────────────────────────────────┘
    `);
  }

  /**
   * Start the hummingbird
   */
  start() {
    this.isRunning = true;
    this.metrics.startTime = Date.now();
    
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🐦 VERA HUMMINGBIRD VOLUME GENERATOR v1.0                     ║
║  Token: ${this.config.tokenId} (${this.config.name})                        ║
╠═══════════════════════════════════════════════════════════════╣
║  METHOD: Hummingbird (Rapid Micro Self-Transfers)             ║
║  FEATURE: No loss of funds - creates volume efficiently        ║
╠═══════════════════════════════════════════════════════════════╣
║  Micro Amount: ${this.config.microAmount.toFixed(5)} HBAR                              ║
║  Target TPS: ${this.config.targetTPS.toString().padStart(3)}                                               ║
║  Daily Limit: $${this.config.maxDailyCost.toFixed(2)}                                              ║
║  Est. Daily TX: ~${(this.config.targetTPS * 86400).toLocaleString().padStart(7)}                            ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    this.log('HUMMINGBIRD', 'GENERATOR_START', {
      token: this.config.tokenId,
      microAmount: this.config.microAmount,
      targetTPS: this.config.targetTPS,
      maxSpendLimit: this.maxSpendLimit,
      timestamp: Date.now()
    });
    
    this.run();
  }

  /**
   * Stop the hummingbird
   */
  stop() {
    this.isRunning = false;
    
    const runtime = (Date.now() - this.metrics.startTime) / 1000;
    const hours = (runtime / 3600).toFixed(2);
    
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🐦 HUMMINGBIRD STOPPED                                        ║
║  Runtime: ${hours.padStart(5)} hours                                         ║
║  Total TX: ${this.metrics.totalTx.toString().padStart(10)}                               ║
║  Total Cost: $${this.metrics.totalCost.toFixed(4).padStart(9)}                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    this.log('HUMMINGBIRD', 'GENERATOR_STOP', {
      totalTx: this.metrics.totalTx,
      totalVolume: this.metrics.volumeHBAR,
      totalCost: this.metrics.totalCost,
      runtime: Date.now() - this.metrics.startTime
    });
  }

  /**
   * Run loop
   */
  async run() {
    while (this.isRunning) {
      await this.performWork();
      await new Promise(resolve => setTimeout(resolve, this.config.cycleInterval));
    }
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new HummingbirdVolumeGenerator({
    id: process.env.HUMMER_AGENT_ID || 'vera-hummingbird-001'
  });
  
  process.on('SIGINT', () => {
    console.log('\n🐦 Graceful stop...');
    generator.stop();
    process.exit(0);
  });
  
  generator.initialize().then(() => {
    generator.start();
  }).catch(error => {
    console.error('Failed to start:', error);
    process.exit(1);
  });
}

export { HummingbirdVolumeGenerator };
