#!/usr/bin/env node
/**
 * Vera Token Trader v1.0
 * Trade HTS tokens with real transfers
 */

import { 
  Client, 
  TransferTransaction,
  AccountBalanceQuery,
  PrivateKey
} from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ID = '0.0.9356476';

class VeraTokenTrader {
  constructor() {
    this.client = null;
    this.operatorId = null;
  }

  async initialize() {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      console.error('❌ Missing credentials');
      process.exit(1);
    }

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
    this.operatorId = operatorId;

    return this;
  }

  async getBalance() {
    const query = new AccountBalanceQuery().setAccountId(this.operatorId);
    const balance = await query.execute(this.client);
    
    const hbar = balance.hbars.toBigNumber().toNumber();
    const tokens = balance.tokens?._map || new Map();
    const rawBalance = tokens.has(TOKEN_ID) ? parseInt(tokens.get(TOKEN_ID)) : 0;
    const tokenBalance = rawBalance / 100000000; // Divide by 10^8 for decimals
    
    return { hbar, tokenBalance, rawBalance };
  }

  async transferToken(toAccountId, amount) {
    console.log(`🔄 Transferring ${amount} tokens to ${toAccountId}`);
    
    const tx = new TransferTransaction()
      .addTokenTransfer(TOKEN_ID, this.operatorId, -amount)
      .addTokenTransfer(TOKEN_ID, toAccountId, amount)
      .setTransactionMemo(`vera-trade-${Date.now()}`);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Transfer complete: ${receipt.status}`);
    return receipt.status.toString();
  }

  async microTrade() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🪙 VERA TOKEN TRADER - hbar.h (0.0.9356476)                  ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    const balance = await this.getBalance();
    console.log(`📊 Balance: ${balance.tokenBalance.toFixed(3)} tokens | ${balance.hbar} HBAR`);

    // Self-transfer (creates volume, no net loss)
    const microAmount = 1000000; // 1 million tokens (tiny % of supply)
    
    console.log(`\n🔄 Micro-transfer: ${(microAmount/100000000).toFixed(2)} tokens (self-transfer)`);
    await this.transferToken(this.operatorId, microAmount);
    
    const newBalance = await this.getBalance();
    console.log(`\n📊 New Balance: ${newBalance.tokenBalance.toFixed(3)} tokens`);
    
    console.log(`\n✅ Micro-trade complete!`);
    this.client.close();
  }
}

const trader = new VeraTokenTrader();
trader.initialize().then(() => trader.microTrade()).catch(console.error);
