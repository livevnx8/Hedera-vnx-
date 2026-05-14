#!/usr/bin/env node
/**
 * Vera HBAR Volume Generator v1.0
 * High-frequency, low-cost volume generation for token 0.0.9356476
 * Demonstrates Hedera's 10,000+ TPS capability with sub-5s finality
 */

import { VeraAgent } from '../blueprints/agent-base.mjs';
import { Client, TransferTransaction, AccountId, Hbar, ScheduleCreateTransaction, ScheduleSignTransaction, ScheduleId, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

// Token Configuration
const TOKEN_CONFIG = {
  tokenId: '0.0.9356476',
  name: 'hbar.h',
  type: 'HBAR_WRAPPED',
  minTransfer: 0.0001,
  maxTransfer: 0.001,
  targetTPS: 100,
  batchSize: 10,
  scheduleEnabled: true,
  hcsCoordination: true,
  maxDailyCost: 0.1,        // SAFETY: Max $0.10/day spend limit
  simulationMode: true,       // DEFAULT: Simulation mode (no real money)
};

// Cost Optimization - Hedera fee schedule
const COST_CONFIG = {
  cryptoTransfer: 0.0001,     // $0.0001 per crypto transfer
  scheduleCreate: 0.001,    // $0.001 per schedule
  scheduleSign: 0.001,        // $0.001 per schedule sign
  hcsMessage: 0.0001,         // $0.0001 per HCS message
  targetDailyCost: 1.0,       // Target $1/day volume generation
};

// HCS Topics for coordination
const TOPICS = {
  VOLUME_COORDINATION: process.env.VOLUME_COORD_TOPIC || '0.0.10414355',
  METRICS: process.env.VOLUME_METRICS_TOPIC || '0.0.10414357',
  PERFORMANCE: process.env.VOLUME_PERF_TOPIC || '0.0.10414362'
};

/**
 * VolumeGenerator - High-frequency HBAR volume generator
 * Optimized for cheapest possible transaction costs on Hedera
 */
class VolumeGenerator extends VeraAgent {
  constructor(config) {
    super({
      id: config.id || 'hbar-volume-gen-001',
      type: 'VOLUME_GENERATOR',
      version: '1.1.0',
      credentials: config.credentials,
      topics: TOPICS,
      cycleInterval: 1000
    });

    this.tokenConfig = { ...TOKEN_CONFIG, ...config.tokenConfig };
    this.costConfig = COST_CONFIG;
    this.metrics = {
      totalTx: 0,
      scheduledTx: 0,
      directTx: 0,
      hcsMessages: 0,
      volumeHBAR: 0,
      totalCost: 0,
      avgTPS: 0,
      peakTPS: 0,
      startTime: Date.now()
    };
    this.cycleMetrics = [];
    this.isRunning = false;
    this.peakTpsWindow = [];
    this.client = null;
    this.operatorId = null;
    this.simulationMode = this.tokenConfig.simulationMode; // SAFETY: Default to simulation
    this.maxSpendLimit = this.tokenConfig.maxDailyCost;     // SAFETY: Spending cap
  }

  /**
   * Initialize Hedera client
   */
  async initialize() {
    await super.initialize();
    
    // Initialize Hedera client
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;
    
    if (operatorId && operatorKey) {
      this.client = Client.forTestnet();
      this.client.setOperator(operatorId, operatorKey);
      this.operatorId = operatorId;
      
      this.log('VOLUME', 'CLIENT_INIT', {
        operatorId,
        network: 'testnet',
        token: this.tokenConfig.tokenId
      });
    } else {
      this.log('VOLUME', 'CLIENT_INIT_SKIPPED', {
        reason: 'Missing credentials',
        mode: 'SIMULATION'
      });
    }
    
    return this;
  }

  /**
   * Main work cycle - high frequency volume generation
   */
  async performWork() {
    if (!this.isRunning) return;
    
    // SAFETY CHECK: Stop if approaching spending limit
    if (!this.simulationMode && this.metrics.totalCost >= this.maxSpendLimit) {
      console.log(`\n🛑 SPENDING LIMIT REACHED: $${this.maxSpendLimit.toFixed(2)}`);
      console.log('   Stopping generator to prevent further costs.\n');
      this.stop();
      return;
    }
    
    const cycleStart = Date.now();
    const cycleId = crypto.randomUUID().substring(0, 8);
    
    try {
      // Generate batch of transactions
      const batchResults = await this.generateBatch();
      
      // Calculate cycle metrics
      const cycleDuration = Date.now() - cycleStart;
      const cycleTPS = batchResults.count / (cycleDuration / 1000);
      
      // Update metrics
      this.metrics.totalTx += batchResults.count;
      this.metrics.scheduledTx += batchResults.scheduled;
      this.metrics.directTx += batchResults.direct;
      this.metrics.volumeHBAR += batchResults.volume;
      this.metrics.totalCost += batchResults.cost;
      
      // Track peak TPS
      this.peakTpsWindow.push(cycleTPS);
      if (this.peakTpsWindow.length > 10) this.peakTpsWindow.shift();
      this.metrics.avgTPS = this.peakTpsWindow.reduce((a, b) => a + b, 0) / this.peakTpsWindow.length;
      this.metrics.peakTPS = Math.max(this.metrics.peakTPS, cycleTPS);
      
      // Log performance metrics
      if (this.state.cycles % 10 === 0) {
        this.displayMetrics();
      }
      
      // Publish metrics to HCS
      await this.publishMetrics(cycleId, batchResults, cycleTPS);
      
    } catch (error) {
      this.log('VOLUME', 'CYCLE_ERROR', {
        cycleId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Generate a batch of transactions
   * Uses scheduled transactions for cost efficiency
   */
  async generateBatch() {
    const results = {
      count: 0,
      scheduled: 0,
      direct: 0,
      volume: 0,
      cost: 0,
      txIds: []
    };
    
    const { batchSize, minTransfer, maxTransfer } = this.tokenConfig;
    
    // SAFETY: Never create real transactions in simulation mode
    if (this.simulationMode) {
      for (let i = 0; i < batchSize; i++) {
        const amount = Math.random() * (maxTransfer - minTransfer) + minTransfer;
        results.count++;
        results.volume += amount;
        results.cost += this.costConfig.cryptoTransfer;
        results.txIds.push(`sim-${Date.now()}-${i}`);
      }
      return results;
    }
    
    // LIVE MODE only - create real Hedera transactions
    const amount = Math.random() * (maxTransfer - minTransfer) + minTransfer;
    
    for (let i = 0; i < batchSize; i++) {
      try {
        const txId = await this.createScheduledTransfer(amount);
        if (txId) {
          results.count++;
          results.scheduled++;
          results.volume += amount;
          results.cost += this.costConfig.scheduleCreate;
          results.txIds.push(txId);
        }
      } catch (e) {
        // Fallback to direct transfer
        try {
          const txId = await this.createDirectTransfer(amount);
          if (txId) {
            results.count++;
            results.direct++;
            results.volume += amount;
            results.cost += this.costConfig.cryptoTransfer;
            results.txIds.push(txId);
          }
        } catch (err) {
          // Silent fail for individual TX
        }
      }
    }
    
    return results;
  }

  /**
   * Create a scheduled transfer (cheapest for deferred execution)
   */
  async createScheduledTransfer(amount) {
    if (!this.client) return null;
    
    try {
      // Create a scheduled crypto transfer
      const transferTx = new TransferTransaction()
        .addHbarTransfer(this.operatorId, Hbar.fromTinybars(-Math.floor(amount * 100000000)))
        .addHbarTransfer(this.operatorId, Hbar.fromTinybars(Math.floor(amount * 100000000)));
      
      const scheduleTx = new ScheduleCreateTransaction()
        .setScheduledTransaction(transferTx)
        .setMemo(`hbar.h volume gen ${Date.now()}`);
      
      const response = await scheduleTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      
      return receipt.scheduleId?.toString() || response.transactionId.toString();
    } catch (error) {
      return null;
    }
  }

  /**
   * Create a direct crypto transfer
   */
  async createDirectTransfer(amount) {
    if (!this.client) return null;
    
    try {
      const transferTx = new TransferTransaction()
        .addHbarTransfer(this.operatorId, Hbar.fromTinybars(-Math.floor(amount * 100000000)))
        .addHbarTransfer(this.operatorId, Hbar.fromTinybars(Math.floor(amount * 100000000)));
      
      const response = await transferTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      
      return response.transactionId.toString();
    } catch (error) {
      return null;
    }
  }

  /**
   * Publish metrics to HCS for real-time monitoring
   */
  async publishMetrics(cycleId, batchResults, cycleTPS) {
    if (!this.client) return;
    
    try {
      const metricsMessage = {
        type: 'VOLUME_METRICS',
        cycleId,
        timestamp: Date.now(),
        token: this.tokenConfig.tokenId,
        batch: batchResults,
        cycleTPS: cycleTPS.toFixed(2),
        cumulative: {
          totalTx: this.metrics.totalTx,
          volumeHBAR: this.metrics.volumeHBAR.toFixed(4),
          totalCost: this.metrics.totalCost.toFixed(4),
          avgTPS: this.metrics.avgTPS.toFixed(2),
          peakTPS: this.metrics.peakTPS.toFixed(2)
        }
      };
      
      await this.log('PERFORMANCE', 'METRICS_UPDATE', metricsMessage);
      this.metrics.hcsMessages++;
    } catch (error) {
      // Silent fail for metrics
    }
  }

  /**
   * Display real-time metrics dashboard
   */
  displayMetrics() {
    const runtime = (Date.now() - this.metrics.startTime) / 1000;
    const runtimeMinutes = (runtime / 60).toFixed(1);
    
    console.log(`
┌─────────────────────────────────────────────────────────────┐
│  🔥 VERA HBAR VOLUME GENERATOR - REAL-TIME METRICS          │
├─────────────────────────────────────────────────────────────┤
│  Token: ${this.tokenConfig.tokenId} (${this.tokenConfig.name})                    │
│  Runtime: ${runtimeMinutes.padStart(6)} minutes                                       │
├─────────────────────────────────────────────────────────────┤
│  📊 TRANSACTION METRICS                                       │
│     Total Transactions: ${this.metrics.totalTx.toString().padStart(10)}                  │
│     Scheduled TX:      ${this.metrics.scheduledTx.toString().padStart(10)}                  │
│     Direct TX:         ${this.metrics.directTx.toString().padStart(10)}                  │
│     HCS Messages:      ${this.metrics.hcsMessages.toString().padStart(10)}                  │
├─────────────────────────────────────────────────────────────┤
│  ⚡ SPEED METRICS                                            │
│     Current Avg TPS:    ${this.metrics.avgTPS.toFixed(2).padStart(10)}                   │
│     Peak TPS:          ${this.metrics.peakTPS.toFixed(2).padStart(10)}                   │
│     Target TPS:        ${this.tokenConfig.targetTPS.toString().padStart(10)}                   │
├─────────────────────────────────────────────────────────────┤
│  💰 COST METRICS                                            │
│     Total Cost:        $${this.metrics.totalCost.toFixed(4).padStart(9)}                   │
│     Volume Generated:  ${this.metrics.volumeHBAR.toFixed(4).padStart(10)} HBAR            │
│     Cost per 1K TX:    $${(this.metrics.totalCost / this.metrics.totalTx * 1000).toFixed(4).padStart(9)}                   │
├─────────────────────────────────────────────────────────────┤
│  🚀 HEDERA ADVANTAGES                                       │
│     Finality:           ~3-5 seconds                        │
│     Max TPS:           10,000+ (sharded)                     │
│     TX Cost:           $0.0001 (crypto transfer)             │
│     Energy:            0.0001 kWh per TX (carbon negative)    │
└─────────────────────────────────────────────────────────────┘
    `);
  }

  /**
   * Start volume generation
   */
  start() {
    // SAFETY: Verify mode before starting
    if (!this.simulationMode && !process.env.HEDERA_OPERATOR_KEY) {
      console.error('\n❌ ERROR: LIVE mode requires HEDERA_OPERATOR_KEY');
      console.log('   Set credentials or enable simulation mode:\n');
      console.log('   export SIMULATION_MODE=true\n');
      process.exit(1);
    }
    
    this.isRunning = true;
    this.metrics.startTime = Date.now();
    
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🔥 VERA HBAR VOLUME GENERATOR v1.1                             ║
║  Token: ${this.tokenConfig.tokenId} (${this.tokenConfig.name})                        ║
╠═══════════════════════════════════════════════════════════════╣
║  ⚠️  MODE: ${this.simulationMode ? '🟢 SIMULATION (NO COST)' : '🔴 LIVE (REAL HBAR SPENT)'}                            ║
${!this.simulationMode ? '║  💰 Daily Limit: $' + this.maxSpendLimit.toFixed(2) + '                                    ║' : ''}
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    if (!this.simulationMode) {
      console.log('\n⚠️  WARNING: Running in LIVE mode - real HBAR will be spent!');
      console.log('   Auto-stop at $' + this.maxSpendLimit.toFixed(2) + ' spending limit\n');
    }
    
    this.log('VOLUME', 'GENERATOR_START', {
      token: this.tokenConfig.tokenId,
      targetTPS: this.tokenConfig.targetTPS,
      simulationMode: this.simulationMode,
      maxSpendLimit: this.maxSpendLimit,
      timestamp: Date.now()
    });
    
    // Start the work cycle
    this.run();
  }

  /**
   * Stop volume generation
   */
  stop() {
    this.isRunning = false;
    
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🛑 VOLUME GENERATOR STOPPED                                    ║
║  Total TX: ${this.metrics.totalTx.toString().padStart(15)}                          ║
║  Final TPS: ${this.metrics.avgTPS.toFixed(2).padStart(14)}                          ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    this.log('VOLUME', 'GENERATOR_STOP', {
      totalTx: this.metrics.totalTx,
      totalVolume: this.metrics.volumeHBAR,
      totalCost: this.metrics.totalCost,
      runtime: Date.now() - this.metrics.startTime
    });
  }

  /**
   * Run the generator loop
   */
  async run() {
    while (this.isRunning) {
      await this.performWork();
      await new Promise(resolve => setTimeout(resolve, this.config.cycleInterval));
    }
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new VolumeGenerator({
    id: process.env.VOLUME_AGENT_ID || 'vera-hbar-volume-001'
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Graceful shutdown...');
    generator.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    generator.stop();
    process.exit(0);
  });
  
  // Start the generator
  generator.initialize().then(() => {
    generator.start();
  }).catch(error => {
    console.error('Failed to start generator:', error);
    process.exit(1);
  });
}

export { VolumeGenerator };
