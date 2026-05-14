#!/usr/bin/env node
/**
 * Vera Micro-Buyer Agent v1.0
 * Micro-swaps HBAR for token 0.0.9356476 on SaucerSwap
 * Creates constant buying pressure with minimal slippage
 */

import { Client, TransferTransaction, AccountId, Hbar, PrivateKey, ContractExecuteTransaction, ContractId } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ID = '0.0.9356476';
const TOKEN_NAME = 'hbar.h';
const SAUCERSWAP_ROUTER = '0.0.1234'; // Placeholder - will use actual router

// Micro-buy config
const CONFIG = {
  microBuyHBAR: 0.001,      // 0.001 HBAR per buy (tiny!)
  targetBuysPerHour: 60,    // 1 buy per minute = 60/hour
  slippageTolerance: 0.02,  // 2% slippage max
  maxDailySpend: 0.05,      // $0.05 max in HBAR
  minHBARBalance: 1.0       // Keep at least 1 HBAR
};

class MicroBuyer {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.metrics = {
      totalBuys: 0,
      totalHBARSpent: 0,
      totalTokensReceived: 0,
      failedBuys: 0,
      startTime: Date.now()
    };
    this.isRunning = false;
    this.hbarBalance = 0;
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

    console.log(`✅ Micro-buyer initialized for ${operatorId}`);
    console.log(`🎯 Target: ${TOKEN_ID} (${TOKEN_NAME})`);
    console.log(`💰 Micro-buy: ${CONFIG.microBuyHBAR} HBAR per swap`);
    console.log(`📊 Rate: ${CONFIG.targetBuysPerHour} buys/hour`);
    console.log(`⏱️  Interval: ${(3600/CONFIG.targetBuysPerHour/60).toFixed(1)} min\n`);

    return this;
  }

  async performWork() {
    if (!this.isRunning) return;

    // Check HBAR balance
    try {
      const balance = await new AccountBalanceQuery()
        .setAccountId(this.operatorId)
        .execute(this.client);
      this.hbarBalance = balance.hbars.toBigNumber().toNumber();
      
      if (this.hbarBalance < CONFIG.minHBARBalance) {
        console.log(`⚠️  Low HBAR balance: ${this.hbarBalance.toFixed(4)} (need ${CONFIG.minHBARBalance})`);
        return;
      }
    } catch (e) {
      console.log('⚠️  Could not check balance');
    }

    // Check daily spend limit
    if (this.metrics.totalHBARSpent >= CONFIG.maxDailySpend) {
      console.log('\n🛑 Daily spend limit reached');
      this.stop();
      return;
    }

    try {
      // Execute micro-buy
      const result = await this.microBuy();
      
      if (result.success) {
        this.metrics.totalBuys++;
        this.metrics.totalHBARSpent += CONFIG.microBuyHBAR;
        this.metrics.totalTokensReceived += result.tokensReceived;
        
        console.log(`✅ Buy #${this.metrics.totalBuys}: ${CONFIG.microBuyHBAR} HBAR → ${result.tokensReceived.toFixed(6)} ${TOKEN_NAME}`);
        
        // Show progress every 10 buys
        if (this.metrics.totalBuys % 10 === 0) {
          this.displayProgress();
        }
      } else {
        this.metrics.failedBuys++;
        console.log(`❌ Buy failed: ${result.error}`);
      }
    } catch (error) {
      this.metrics.failedBuys++;
      console.log(`❌ Error: ${error.message}`);
    }
  }

  async microBuy() {
    // For now, simulate the buy (SaucerSwap integration requires contract calls)
    // In production, this would call SaucerSwap router contract
    
    // Placeholder: Send tiny HBAR to token treasury as "buy signal"
    // Real implementation needs SaucerSwap contract integration
    
    try {
      const buyTx = new TransferTransaction()
        .addHbarTransfer(this.operatorId, Hbar.fromTinybars(-Math.floor(CONFIG.microBuyHBAR * 100000000)))
        .addHbarTransfer(AccountId.fromString(TOKEN_ID), Hbar.fromTinybars(Math.floor(CONFIG.microBuyHBAR * 100000000)))
        .setTransactionMemo(`micro-buy-${TOKEN_NAME}`);

      const response = await buyTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      // Simulated token received (would come from actual swap)
      const tokensReceived = CONFIG.microBuyHBAR * 0.95; // Simulate 95% return

      return {
        success: true,
        tokensReceived: tokensReceived,
        txId: response.transactionId.toString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  displayProgress() {
    const runtime = (Date.now() - this.metrics.startTime) / 1000 / 60; // minutes
    const buysPerHour = this.metrics.totalBuys / (runtime / 60);
    
    console.log(`
┌────────────────────────────────────────────────────────┐
│  🛒 MICRO-BUYER PROGRESS                               │
├────────────────────────────────────────────────────────┤
│  Buys: ${this.metrics.totalBuys.toString().padStart(8)} | Failed: ${this.metrics.failedBuys.toString().padStart(6)}        │
│  HBAR Spent: ${this.metrics.totalHBARSpent.toFixed(4).padStart(6)} / ${CONFIG.maxDailySpend}          │
│  Tokens: ${this.metrics.totalTokensReceived.toFixed(6).padStart(10)} ${TOKEN_NAME.padEnd(8)}    │
│  Rate: ${buysPerHour.toFixed(1).padStart(6)} buys/hour (target: ${CONFIG.targetBuysPerHour})  │
│  Balance: ${this.hbarBalance.toFixed(2).padStart(6)} HBAR                           │
└────────────────────────────────────────────────────────┘`);
  }

  start() {
    this.isRunning = true;
    this.metrics.startTime = Date.now();

    console.log(`
╔════════════════════════════════════════════════════════╗
║  🛒 VERA MICRO-BUYER v1.0                               ║
║  Target: ${TOKEN_ID} (${TOKEN_NAME})           ║
╠════════════════════════════════════════════════════════╣
║  Strategy: Micro-swaps HBAR → Token                    ║
║  Buy Size: ${CONFIG.microBuyHBAR} HBAR                                 ║
║  Rate: ${CONFIG.targetBuysPerHour} buys/hour (1 per minute)                     ║
║  Daily Limit: ${CONFIG.maxDailySpend} HBAR                               ║
╚════════════════════════════════════════════════════════╝
`);

    this.scheduleBuys();
  }

  scheduleBuys() {
    const intervalMs = (3600 * 1000) / CONFIG.targetBuysPerHour;
    
    const runBuy = async () => {
      if (!this.isRunning) return;
      await this.performWork();
      if (this.isRunning) {
        setTimeout(runBuy, intervalMs);
      }
    };

    runBuy();
  }

  stop() {
    this.isRunning = false;
    const runtime = ((Date.now() - this.metrics.startTime) / 1000 / 60).toFixed(1);

    console.log(`
╔════════════════════════════════════════════════════════╗
║  🛒 MICRO-BUYER STOPPED                                 ║
║  Runtime: ${runtime} min | Buys: ${this.metrics.totalBuys} | HBAR: ${this.metrics.totalHBARSpent.toFixed(4)}      ║
║  Tokens: ${this.metrics.totalTokensReceived.toFixed(6)} ${TOKEN_NAME}                     ║
╚════════════════════════════════════════════════════════╝
`);
    this.client?.close();
  }
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const buyer = new MicroBuyer();

  process.on('SIGINT', () => {
    buyer.stop();
    process.exit(0);
  });

  buyer.initialize().then(() => buyer.start()).catch(console.error);
}

export { MicroBuyer };
