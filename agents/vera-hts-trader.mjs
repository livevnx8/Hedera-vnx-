#!/usr/bin/env node
/**
 * HTS Token Trader v1.0
 * Direct token trading on Hedera (no DEX needed)
 * Check balances, transfer tokens, create volume
 */

import { Client, TransferTransaction, AccountBalanceQuery, PrivateKey, AccountId } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ID = '0.0.9356476';
const TOKEN_NAME = 'hbar.h';

const CONFIG = {
  checkInterval: 5000,  // Check every 5 seconds
};

class HTSTokenTrader {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.tokenBalance = 0;
    this.hbarBalance = 0;
    this.isRunning = false;
  }

  async initialize() {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      console.error('❌ Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY');
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

    console.log(`✅ Trader initialized for ${operatorId}\n`);
    
    // Check balances immediately
    await this.checkBalances();
    
    return this;
  }

  async checkBalances() {
    try {
      const balance = await new AccountBalanceQuery()
        .setAccountId(this.operatorId)
        .execute(this.client);
      
      this.hbarBalance = balance.hbars.toBigNumber().toNumber();
      
      const tokens = balance.tokens?._map || new Map();
      this.tokenBalance = tokens.has(TOKEN_ID) ? parseInt(tokens.get(TOKEN_ID)) : 0;
      
      console.clear();
      console.log(`
╔════════════════════════════════════════════════════════╗
║  💼 VERA TOKEN TRADER                                    ║
║  Account: ${this.operatorId}                              ║
╠════════════════════════════════════════════════════════╣
║  💰 BALANCES                                             ║
║     HBAR:  ${this.hbarBalance.toFixed(4).padStart(12)}                                 ║
║     ${TOKEN_NAME}: ${this.tokenBalance.toString().padStart(12)} ${this.tokenBalance > 0 ? '✅' : '❌'}                          ║
║     Token ID: ${TOKEN_ID}                                ║
╠════════════════════════════════════════════════════════╣
║  🎯 AVAILABLE ACTIONS                                     ║
║     1. Transfer tokens to another account              ║
║     2. Check token details                               ║
║     3. Create volume (self-transfers)                    ║
║     4. Exit                                              ║
╚════════════════════════════════════════════════════════╝
`);
      
      return {
        hbar: this.hbarBalance,
        token: this.tokenBalance,
        tokenId: TOKEN_ID
      };
    } catch (e) {
      console.error('❌ Error checking balances:', e.message);
      return null;
    }
  }

  async transferTokens(toAccountId, amount) {
    try {
      console.log(`\n🔄 Transferring ${amount} ${TOKEN_NAME} to ${toAccountId}...`);
      
      const transferTx = new TransferTransaction()
        .addTokenTransfer(TOKEN_ID, this.operatorId, -amount)
        .addTokenTransfer(TOKEN_ID, AccountId.fromString(toAccountId), amount)
        .setTransactionMemo(`vera-transfer-${Date.now()}`);

      const response = await transferTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      
      console.log(`✅ Transfer complete!`);
      console.log(`   Tx ID: ${response.transactionId.toString()}`);
      console.log(`   Status: ${receipt.status.toString()}`);
      
      // Update balance
      await this.checkBalances();
      
      return true;
    } catch (e) {
      console.error(`❌ Transfer failed: ${e.message}`);
      return false;
    }
  }

  async createVolume() {
    console.log(`\n🚀 Starting volume generation for ${TOKEN_NAME}...`);
    console.log(`   This will create self-transfers (no net loss)\n`);
    
    let volume = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < 10; i++) {
      try {
        const transferTx = new TransferTransaction()
          .addTokenTransfer(TOKEN_ID, this.operatorId, -1)  // Send 1 token
          .addTokenTransfer(TOKEN_ID, this.operatorId, 1)     // Receive 1 token
          .setTransactionMemo(`volume-${Date.now()}-${i}`);

        const response = await transferTx.execute(this.client);
        await response.getReceipt(this.client);
        
        volume++;
        process.stdout.write(`\r✅ Volume: ${volume} transactions`);
        
        await new Promise(r => setTimeout(r, 200)); // Small delay
      } catch (e) {
        process.stdout.write(`\r❌ Failed: ${e.message}`);
        break;
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n\n✅ Created ${volume} transactions in ${duration}s`);
    
    await this.checkBalances();
  }

  async getTokenDetails() {
    console.log(`\n📊 Token Details for ${TOKEN_ID}:`);
    console.log(`   Name: ${TOKEN_NAME}`);
    console.log(`   Your Balance: ${this.tokenBalance}`);
    console.log(`   Token ID: ${TOKEN_ID}`);
    console.log(`   Network: Hedera Mainnet`);
    console.log(`   Associated: ${this.tokenBalance > 0 ? '✅ Yes' : '❌ No'}\n`);
  }

  async interactiveMode() {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    while (true) {
      await this.checkBalances();
      
      const choice = await ask('\nSelect action (1-4): ');
      
      switch(choice.trim()) {
        case '1':
          if (this.tokenBalance === 0) {
            console.log('❌ No tokens to transfer');
            break;
          }
          const to = await ask('Enter recipient account ID (0.0.xxxx): ');
          const amount = await ask(`Enter amount (max ${this.tokenBalance}): `);
          await this.transferTokens(to, parseInt(amount));
          break;
          
        case '2':
          await this.getTokenDetails();
          break;
          
        case '3':
          await this.createVolume();
          break;
          
        case '4':
          console.log('👋 Exiting...');
          rl.close();
          this.client.close();
          process.exit(0);
          
        default:
          console.log('Invalid choice');
      }
    }
  }

  start() {
    console.log(`
╔════════════════════════════════════════════════════════╗
║  💼 HTS TOKEN TRADER v1.0                                ║
║  Direct Hedera Token Service Trading                     ║
║  No DEX or SaucerSwap required                          ║
╚════════════════════════════════════════════════════════╝
`);
    
    this.interactiveMode();
  }
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const trader = new HTSTokenTrader();
  trader.initialize().then(() => trader.start()).catch(console.error);
}

export { HTSTokenTrader };
