#!/usr/bin/env node
/**
 * HTS Token Volume Generator v1.0
 * Creates volume for HTS token 0.0.9356476 (hbar.h)
 * Uses token transfers instead of HBAR transfers
 */

import { Client, TokenTransferTransaction, AccountId, PrivateKey, TokenAssociateTransaction, TokenInfoQuery } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ID = '0.0.9356476';
const TOKEN_NAME = 'hbar.h';

// Volume Config
const CONFIG = {
  tokenId: TOKEN_ID,
  name: TOKEN_NAME,
  microAmount: 0.00001,  // Tiny amounts for micro-volume
  targetTPS: 50,
  batchSize: 5,
  cycleInterval: 100,
  maxDailyCost: 0.05
};

class HTSTokenVolumeGenerator {
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
      console.error('❌ Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY');
      process.exit(1);
    }

    this.client = Client.forMainnet();

    // Parse private key
    let privateKey;
    if (operatorKey.length === 64) {
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
      privateKey = PrivateKey.fromString(operatorKey);
    }

    this.client.setOperator(operatorId, privateKey);
    this.operatorId = operatorId;

    console.log(`✅ Client initialized for ${operatorId}`);

    // Check if token exists
    try {
      const tokenInfo = await new TokenInfoQuery()
        .setTokenId(TOKEN_ID)
        .execute(this.client);

      console.log(`✅ Token found: ${tokenInfo.name} (${tokenInfo.symbol})`);
      console.log(`   Type: ${tokenInfo.tokenType?.toString() || 'Unknown'}`);
      console.log(`   Decimals: ${tokenInfo.decimals}`);
      console.log(`   Supply: ${tokenInfo.totalSupply?.toString() || 'N/A'}`);
    } catch (e) {
      console.error(`\n❌ Token ${TOKEN_ID} not found on mainnet`);
      console.log(`   Error: ${e.message}\n`);
      process.exit(1);
    }

    return this;
  }

  async performWork() {
    if (!this.isRunning) return;

    const cycleStart = Date.now();

    try {
      // Generate token transfer batch
      const batchResults = await this.generateTokenBatch();

      const cycleDuration = Date.now() - cycleStart;
      const cycleTPS = batchResults.count / (cycleDuration / 1000);

      this.metrics.totalTx += batchResults.count;
      this.metrics.volume += batchResults.volume;
      this.metrics.totalCost += batchResults.cost;

      this.tpsWindow.push(cycleTPS);
      if (this.tpsWindow.length > 20) this.tpsWindow.shift();

      const avgTPS = this.tpsWindow.reduce((a, b) => a + b, 0) / this.tpsWindow.length;

      // Display metrics every 50 cycles
      if (this.metrics.totalTx % 250 === 0) {
        this.displayMetrics(avgTPS);
      }

    } catch (error) {
      // Silent fail
    }
  }

  async generateTokenBatch() {
    const results = {
      count: 0,
      volume: 0,
      cost: 0
    };

    const { batchSize, microAmount } = CONFIG;

    for (let i = 0; i < batchSize; i++) {
      try {
        // Token self-transfer (send to yourself = no net loss)
        const transferTx = new TokenTransferTransaction()
          .addTokenTransfer(TOKEN_ID, this.operatorId, -1)  // Send 1 token unit out
          .addTokenTransfer(TOKEN_ID, this.operatorId, 1)   // Receive 1 token unit back
          .setTransactionMemo(`hts-vol-${Date.now()}`);

        const response = await transferTx.execute(this.client);
        const receipt = await response.getReceipt(this.client);

        results.count++;
        results.volume += microAmount;
        results.cost += 0.0001;  // $0.0001 per transaction

      } catch (err) {
        // Log first error then silent
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

    console.log(`
┌─────────────────────────────────────────────────────────────┐
│  🪙 HTS TOKEN VOLUME GENERATOR                               │
├─────────────────────────────────────────────────────────────┤
│  Token: ${TOKEN_ID} (${TOKEN_NAME})                         │
│  Account: ${this.operatorId}                                  │
│  Runtime: ${runtimeMin} min                                   │
├─────────────────────────────────────────────────────────────┤
│  📊 METRICS                                                  │
│     Transactions: ${this.metrics.totalTx.toString().padStart(8)}                     │
│     Current TPS:  ${avgTPS.toFixed(2).padStart(8)}                     │
│     Total Cost:   $${this.metrics.totalCost.toFixed(4).padStart(8)}                    │
└─────────────────────────────────────────────────────────────┘
    `);
  }

  start() {
    this.isRunning = true;
    this.metrics.startTime = Date.now();

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🪙 HTS TOKEN VOLUME GENERATOR v1.0                            ║
║  Token: ${TOKEN_ID} (${TOKEN_NAME})                        ║
╠═══════════════════════════════════════════════════════════════╣
║  METHOD: Token Self-Transfers (HTS)                          ║
║  FEATURE: Creates volume without net token loss               ║
╠═══════════════════════════════════════════════════════════════╣
║  Target TPS:  ${CONFIG.targetTPS}                                              ║
║  Daily Limit: $${CONFIG.maxDailyCost}                                              ║
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
║  Runtime: ${hours} hours                                      ║
║  Total TX: ${this.metrics.totalTx}                                   ║
║  Total Cost: $${this.metrics.totalCost.toFixed(4)}                                   ║
╚═══════════════════════════════════════════════════════════════╝
    `);
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
  const generator = new HTSTokenVolumeGenerator();

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

export { HTSTokenVolumeGenerator };
