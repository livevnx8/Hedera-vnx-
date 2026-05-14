#!/usr/bin/env node
/**
 * HTS Token Volume Generator for 0.0.9356476 (hbar.h)
 * Micro-volume generation with token self-transfers
 * No net loss - sends tokens to yourself
 */

import { Client, TransferTransaction, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ID = '0.0.9356476';
const TOKEN_NAME = 'hbar.h';

const CONFIG = {
  microAmount: 1,        // 1 token unit per transfer
  targetTPS: 50,         // 50 transfers/second
  batchSize: 5,          // 5 transfers per cycle
  cycleInterval: 100,    // 100ms between cycles
  maxDailyCost: 0.05     // $0.05 max spend
};

class HTSVolumeGenerator {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.metrics = {
      totalTx: 0,
      volume: 0,
      totalCost: 0,
      startTime: Date.now()
    };
    this.isRunning = false;
    this.tpsWindow = [];
  }

  async initialize() {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      console.error('❌ Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY');
      process.exit(1);
    }

    this.client = Client.forMainnet();

    // Parse key
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
    this.operatorId = operatorId;

    console.log(`✅ Initialized for ${operatorId}`);
    console.log(`🎯 Target: ${TOKEN_ID} (${TOKEN_NAME})`);
    console.log(`💰 Max daily cost: $${CONFIG.maxDailyCost}\n`);

    return this;
  }

  async performWork() {
    if (!this.isRunning) return;

    // Safety: stop at spending limit
    if (this.metrics.totalCost >= CONFIG.maxDailyCost) {
      console.log('\n🛑 Daily spending limit reached');
      this.stop();
      return;
    }

    const cycleStart = Date.now();

    try {
      const results = await this.generateBatch();
      
      const cycleDuration = Date.now() - cycleStart;
      const cycleTPS = results.count / (cycleDuration / 1000);

      this.metrics.totalTx += results.count;
      this.metrics.volume += results.volume;
      this.metrics.totalCost += results.cost;

      this.tpsWindow.push(cycleTPS);
      if (this.tpsWindow.length > 20) this.tpsWindow.shift();

      if (this.metrics.totalTx % 250 === 0) {
        this.displayMetrics();
      }
    } catch (error) {
      // Silent
    }
  }

  async generateBatch() {
    const results = { count: 0, volume: 0, cost: 0 };

    for (let i = 0; i < CONFIG.batchSize; i++) {
      try {
        // Self-transfer: send token to yourself (no net loss)
        const transferTx = new TransferTransaction()
          .addTokenTransfer(TOKEN_ID, this.operatorId, -CONFIG.microAmount)
          .addTokenTransfer(TOKEN_ID, this.operatorId, CONFIG.microAmount)
          .setTransactionMemo(`hts-${Date.now()}-${i}`);

        const response = await transferTx.execute(this.client);
        await response.getReceipt(this.client);

        results.count++;
        results.volume += CONFIG.microAmount;
        results.cost += 0.0001;  // ~$0.0001 per tx

      } catch (err) {
        if (results.count === 0) {
          console.log(`⚠️  Transfer failed: ${err.message}`);
          if (err.message.includes('TOKEN_NOT_ASSOCIATED')) {
            console.log('   Token not associated with account');
          } else if (err.message.includes('INSUFFICIENT_TOKEN_BALANCE')) {
            console.log('   Insufficient token balance');
          }
        }
      }
    }

    return results;
  }

  displayMetrics() {
    const runtime = (Date.now() - this.metrics.startTime) / 1000;
    const avgTPS = this.tpsWindow.reduce((a, b) => a + b, 0) / this.tpsWindow.length;
    const hourlyRate = this.metrics.totalCost / (runtime / 3600);

    console.log(`
┌────────────────────────────────────────────────────────┐
│  🪙 HTS Volume: ${TOKEN_NAME} (${TOKEN_ID})     │
├────────────────────────────────────────────────────────┤
│  TX: ${this.metrics.totalTx.toString().padStart(10)} | TPS: ${avgTPS.toFixed(1).padStart(6)} | Cost: $${this.metrics.totalCost.toFixed(4).padStart(8)} │
│  Vol: ${this.metrics.volume.toString().padStart(9)} | Day Proj: $${(hourlyRate * 24).toFixed(2).padStart(6)} | Limit: $${CONFIG.maxDailyCost.toFixed(2)} │
└────────────────────────────────────────────────────────┘`);
  }

  start() {
    this.isRunning = true;
    this.metrics.startTime = Date.now();

    console.log(`
╔════════════════════════════════════════════════════════╗
║  🪙 HTS TOKEN VOLUME GENERATOR                          ║
║  Token: ${TOKEN_ID} (${TOKEN_NAME})           ║
╠════════════════════════════════════════════════════════╣
║  Method: Self-transfers (no net loss)                  ║
║  Rate: ${CONFIG.targetTPS} TPS | Batch: ${CONFIG.batchSize} | Limit: $${CONFIG.maxDailyCost}/day    ║
╚════════════════════════════════════════════════════════╝
`);

    this.run();
  }

  stop() {
    this.isRunning = false;
    const hours = ((Date.now() - this.metrics.startTime) / 3600000).toFixed(2);

    console.log(`
╔════════════════════════════════════════════════════════╗
║  🪙 STOPPED                                             ║
║  Runtime: ${hours}h | TX: ${this.metrics.totalTx} | Cost: $${this.metrics.totalCost.toFixed(4)}          ║
╚════════════════════════════════════════════════════════╝
`);
    this.client?.close();
  }

  async run() {
    while (this.isRunning) {
      await this.performWork();
      await new Promise(r => setTimeout(r, CONFIG.cycleInterval));
    }
  }
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const gen = new HTSVolumeGenerator();

  process.on('SIGINT', () => {
    gen.stop();
    process.exit(0);
  });

  gen.initialize().then(() => gen.start()).catch(console.error);
}

export { HTSVolumeGenerator };
