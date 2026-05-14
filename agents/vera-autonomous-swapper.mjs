#!/usr/bin/env node
/**
 * Vera Autonomous Swap Agent v1.0
 * Self-executing HBAR → token swaps using SaucerSwap DEX
 */

import { 
  Client, 
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  Hbar,
  AccountBalanceQuery,
  PrivateKey
} from '@hashgraph/sdk';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

// SaucerSwap V1 Router
const SAUCERSWAP_ROUTER = '0.0.3055450';
const WHBAR_ADDRESS = '0.0.1456986'; // Wrapped HBAR
const TOKEN_ID = '0.0.9356476'; // hbar.h
const SLIPPAGE = 0.005; // 0.5%

class VeraAutonomousSwapper {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.isRunning = false;
    this.metrics = {
      swapsAttempted: 0,
      swapsSuccessful: 0,
      hbarSpent: 0,
      tokensAcquired: 0,
      lastSwapTime: 0
    };
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

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🤖 VERA AUTONOMOUS SWAP AGENT v1.0                          ║
║  Self-Executing DEX Trader                                    ║
╠═══════════════════════════════════════════════════════════════╣
║  🎯 Target Token: ${TOKEN_ID} (hbar.h)                      ║
║  🔗 DEX: SaucerSwap V1 Router (${SAUCERSWAP_ROUTER})         ║
║  💰 Strategy: Micro-buy with HBAR                              ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  // Convert Hedera ID to EVM address
  hederaIdToEvmAddress(id) {
    const parts = id.split('.');
    const num = BigInt(parts[2] ?? parts[0]);
    return '0x' + num.toString(16).padStart(40, '0');
  }

  // Get current balances
  async getBalances() {
    const query = new AccountBalanceQuery().setAccountId(this.operatorId);
    const balance = await query.execute(this.client);
    
    const hbar = balance.hbars.toBigNumber().toNumber();
    const tokens = balance.tokens?._map || new Map();
    const rawTokenBalance = tokens.has(TOKEN_ID) ? parseInt(tokens.get(TOKEN_ID)) : 0;
    const tokenBalance = rawTokenBalance / 100000000;
    
    return { hbar, tokenBalance, rawTokenBalance };
  }

  // Get token price from SaucerSwap API
  async getTokenPrice() {
    return new Promise((resolve, reject) => {
      https.get('https://api.saucerswap.finance/tokens/', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const tokens = JSON.parse(data);
            const token = tokens.find(t => t.id === TOKEN_ID);
            resolve(token?.priceUsd || 0);
          } catch (e) {
            resolve(0);
          }
        });
      }).on('error', () => resolve(0));
    });
  }

  // Execute HBAR → Token swap
  async swapHbarForTokens(hbarAmount, minTokensOut) {
    console.log(`🔄 Swapping ${hbarAmount.toFixed(4)} HBAR for tokens...`);
    
    try {
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 min
      const recipient = this.hederaIdToEvmAddress(this.operatorId);
      const whbarAddr = this.hederaIdToEvmAddress(WHBAR_ADDRESS);
      const tokenAddr = this.hederaIdToEvmAddress(TOKEN_ID);

      // Round to 8 decimals and convert to Hbar
      const roundedHbar = Math.round(hbarAmount * 100000000) / 100000000;
      const hbar = new Hbar(roundedHbar);

      const tx = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(SAUCERSWAP_ROUTER))
        .setGas(300_000)
        .setPayableAmount(hbar)
        .setFunction(
          'swapExactETHForTokens',
          new ContractFunctionParameters()
            .addUint256(Math.floor(minTokensOut))
            .addAddressArray([whbarAddr, tokenAddr])
            .addAddress(recipient)
            .addUint256(deadline)
        );

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      console.log(`✅ Swap complete: ${receipt.status}`);
      console.log(`   Tx ID: ${response.transactionId.toString()}`);
      
      this.metrics.swapsSuccessful++;
      this.metrics.hbarSpent += roundedHbar;
      this.metrics.lastSwapTime = Date.now();

      return {
        success: true,
        txId: response.transactionId.toString(),
        status: receipt.status.toString()
      };
    } catch (e) {
      console.error(`❌ Swap failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  // Autonomous swap decision
  async makeSwapDecision() {
    const balances = await this.getBalances();
    
    // Decision parameters
    const minHbarReserve = 100; // Keep at least 100 HBAR
    const maxSwapAmount = 1; // Max 1 HBAR per swap
    const swapInterval = 60000; // 1 minute between swaps
    
    // Check if we should swap
    if (balances.hbar < minHbarReserve + maxSwapAmount) {
      console.log(`⚠️  Insufficient HBAR (${balances.hbar.toFixed(2)}). Need ${minHbarReserve + maxSwapAmount}`);
      return false;
    }

    const timeSinceLastSwap = Date.now() - this.metrics.lastSwapTime;
    if (timeSinceLastSwap < swapInterval) {
      console.log(`⏳ Waiting ${Math.ceil((swapInterval - timeSinceLastSwap)/1000)}s before next swap`);
      return false;
    }

    // Determine swap amount (random between 0.01 and 0.1 HBAR)
    const swapAmount = 0.01 + Math.random() * 0.09;
    
    // Estimate minimum tokens out (use conservative estimate)
    const tokenPrice = await this.getTokenPrice();
    const estimatedTokens = (swapAmount * 0.15) / (tokenPrice || 0.001); // Assuming HBAR ~$0.15
    const minTokensOut = Math.floor(estimatedTokens * 0.95 * 100000000); // 5% slippage buffer

    console.log(`\n🎯 Swap Decision:`);
    console.log(`   HBAR Balance: ${balances.hbar.toFixed(4)}`);
    console.log(`   Token Balance: ${balances.tokenBalance.toFixed(4)}`);
    console.log(`   Swap Amount: ${swapAmount.toFixed(4)} HBAR`);
    console.log(`   Min Tokens: ${minTokensOut / 100000000}`);
    console.log(`   Token Price: $${tokenPrice.toFixed(6)}`);

    return { swapAmount, minTokensOut };
  }

  // Main autonomous loop
  async runAutonomousSwaps(maxSwaps = 10) {
    this.isRunning = true;
    
    console.log(`\n🚀 Starting autonomous swap loop (${maxSwaps} max swaps)`);
    console.log(`   Press Ctrl+C to stop\n`);

    while (this.isRunning && this.metrics.swapsAttempted < maxSwaps) {
      this.metrics.swapsAttempted++;
      
      console.log(`\n📊 Swap #${this.metrics.swapsAttempted}/${maxSwaps}`);
      
      const decision = await this.makeSwapDecision();
      
      if (decision) {
        const result = await this.swapHbarForTokens(decision.swapAmount, decision.minTokensOut);
        
        if (result.success) {
          const newBalances = await this.getBalances();
          console.log(`\n💰 New Balances: ${newBalances.hbar.toFixed(4)} HBAR | ${newBalances.tokenBalance.toFixed(4)} tokens`);
        }
        
        // Wait between swaps
        await new Promise(r => setTimeout(r, 5000));
      } else {
        // Wait before checking again
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    this.displaySummary();
  }

  displaySummary() {
    const runtime = (Date.now() - this.metrics.startTime) / 1000 / 60;
    
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  📊 AUTONOMOUS SWAP SUMMARY                                   ║
╠═══════════════════════════════════════════════════════════════╣
║  Runtime: ${runtime.toFixed(1)} minutes                                      ║
║  Swaps Attempted: ${this.metrics.swapsAttempted}                                     ║
║  Swaps Successful: ${this.metrics.swapsSuccessful}                                    ║
║  HBAR Spent: ${this.metrics.hbarSpent.toFixed(4)}                                    ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }

  stop() {
    this.isRunning = false;
    this.client?.close();
    console.log('\n🛑 Autonomous swapper stopped');
  }
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const swapper = new VeraAutonomousSwapper();
  
  process.on('SIGINT', () => {
    console.log('\n🛑 Graceful shutdown...');
    swapper.stop();
    process.exit(0);
  });

  swapper.initialize().then(() => {
    // Run 5 autonomous swaps
    swapper.metrics.startTime = Date.now();
    swapper.runAutonomousSwaps(5);
  }).catch(console.error);
}

export { VeraAutonomousSwapper };
