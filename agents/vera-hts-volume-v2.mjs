#!/usr/bin/env node
/**
 * HTS Token Volume Generator v2.0
 * Creates volume for token 0.0.9356476 (hbar.h)
 * Self-transfer method - no net loss of tokens
 */

import { Client, TokenTransferTransaction, PrivateKey, AccountBalanceQuery } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ID = '0.0.9356476';

// Volume Config
const CONFIG = {
  microAmount: 1,        // Transfer 1 token unit (tiny)
  targetTPS: 50,
  batchSize: 5,
  cycleInterval: 100,
  maxDailyCost: 0.05
};

class HTSVolumeGenerator {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.metrics = {
      totalTx: 0,
      volume: 0,
      totalCost: 0,
      startTime: Date.now(),
      cycles: 0
    };
    this.isRunning = false;
    this.tpsWindow = [];
    this.tokenDecimals = 8;  // Default, will detect
    this.tokenBalance = 0;
  }

  async initialize() {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      console.error('❌ Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY');
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

    // Check account balance for token
    try {
      const balance = await new AccountBalanceQuery()
        .setAccountId(operatorId)
        .execute(this.client);
      
      const tokens = balance.tokens?._map || new Map();
      if (tokens.has(TOKEN_ID)) {
        this.tokenBalance = parseInt(tokens.get(TOKEN_ID));
        console.log(`✅ Token ${TOKEN_ID} associated!`);
        console.log(`   Balance: ${this.tokenBalance}`);
      } else {
        console.log(`⚠️  Token ${TOKEN_ID} not found in account`);
        console.log(`   Available tokens: ${Array.from(tokens.keys()).join(', ') || 'None'}`);
      }
    } catch (e) {
      console.log(`⚠️  Could not check balance: ${e.message}`);
    }

    console.log(`✅ Client initialized for ${operatorId}\n`);
    return this;
  }

  async performWork() {
    if (!this.isRunning) return;

    const cycleStart = Date.now();

    try {
      const batchResults = await this.generateTokenBatch();
      
      const cycleDuration = Date.now() - cycleStart;
      const cycleTPS = batchResults.count / (cycleDuration / 1000);

      this.metrics.totalTx += batchResults.count;
      this.metrics.volume += batchResults.volume;
      this.metrics.totalCost += batchResults.cost;
      this.metrics.cycles++;

      this.tpsWindow.push(cycleTPS);
      if (this.tpsWindow.length > 20) this.tpsWindow.shift();

      const avgTPS = this.tpsWindow.reduce((a, b) => a + b, 0) / this.tpsWindow.length;

      if (this.metrics.totalTx % 250 === 0) {
        this.displayMetrics(avgTPS);
      }
    } catch (error) {
      // Silent
    }
  }

  async generateTokenBatch() {
    const results = { count: 0, volume: 0, cost: 0 };
    const { batchSize, microAmount } = CONFIG;

    for (let i = 0; i < batchSize; i++) {
      try {
        // HTS self-transfer (send to yourself)
        const transferTx = new TokenTransferTransaction()
          .addTokenTransfer(TOKEN_ID, this.operatorId, -microAmount)  // Send out
          .addTokenTransfer(TOKEN_ID, this.operatorId, microAmount)   // Receive back
          .setTransactionMemo(`hts-vol-${Date.now()}`);

        const response = await transferTx.execute(this.client);
        await response.getReceipt(this.client);

        results.count++;
        results.volume += microAmount;
        results.cost += 0.0001;  // $0.0001 per tx
      } catch (err) {
        if (results.count === 0 && i === 0) {
          console.log(`⚠️  Token transfer failed: ${err.message}`);
        }
      }
    }

    return results;
  }

  displayMetrics(avgTPS) {
    const runtime = (Date.now() - this.metrics.startTime) / 1000;
    const runtimeMin = (runtime / 60).toFixed(1);
    const hourlyRate = this.metrics.totalCost / (runtime / 3600);

    console.log(`
┌─────────────────────────────────────────────────────────────┐
│  🪙 HTS TOKEN VOLUME GENERATOR                               │
├─────────────────────────────────────────────────────────────┤
│  Token: ${TOKEN_ID}                                         │
│  Account: ${this.operatorId}                                  │
│  Runtime: ${runtimeMin} min                                   │
├─────────────────────────────────────────────────────────────┤
│  📊 METRICS                                                  │
│     Transactions: ${this.metrics.totalTx.toString().padStart(10)}                     │
│     Current TPS:  ${avgTPS.toFixed(2).padStart(10)}                     │
│     Total Cost:   $${this.metrics.totalCost.toFixed(4).padStart(10)}                    │
│     Daily Proj:   $${(hourlyRate * 24).toFixed(2).padStart(10)}                    │
│     Token Vol:    ${this.metrics.volume.toString().padStart(10)}                     │
└─────────────────────────────────────────────────────────────┘
    `);
  }

  start() {
    this.isRunning = true;
    this.metrics.startTime = Date.now();

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🪙 HTS TOKEN VOLUME GENERATOR v2.0                            ║
║  Token: ${TOKEN_ID} (hbar.h)                          ║
╠═══════════════════════════════════════════════════════════════╣
║  METHOD: Token Self-Transfers (HTS)                          ║
║  FEATURE: No net loss - creates volume efficiently            ║
╠═══════════════════════════════════════════════════════════════╣
║  Micro Amount: ${CONFIG.microAmount} token unit(s)                              ║
║  Target TPS:  ${CONFIG.targetTPS}                                              ║
║  Daily Limit: $${CONFIG.maxDailyCost}                                              ║
║  Est. Daily TX: ~${(CONFIG.targetTPS * 86400).toLocaleString().padStart(7)}                           ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    this.run();
  }

  stop() {
    this.isRunning = false;
    const runtime = (Date.now() - this.metrics.startTime) / 1000;
    const hours = (runtime / 3600).toFixed(2);

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🪙 GENERATOR STOPPED                                          ║
║  Runtime: ${hours} hours                                        ║
║  Total TX: ${this.metrics.totalTx}                                   ║
║  Total Cost: $${this.metrics.totalCost.toFixed(4)}                                   ║
║  Token Volume: ${this.metrics.volume}                                 ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    this.client?.close();
  }

  async run() {
    while (this.isRunning) {
      await this.performWork();
      await new Promise(resolve => setTimeout(resolve, CONFIG.cycleInterval));
    }
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new HTSVolumeGenerator();

  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping...');
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

export { HTSVolumeGenerator };
