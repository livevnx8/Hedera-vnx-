/**
 * Vera LIVE DOVU - With Payment Source
 * 24/7 verification with external client payments
 * Token: 0.0.3716059 | Wallet: 0.0.10294360
 */

import { dovuDominance } from './src/dovu/dominanceEngine.js';
import { paymentOrchestrator } from './src/dovu/paymentOrchestrator.js';
import { veraPaymentSource } from './src/dovu/index.js';
import { Client, AccountBalanceQuery, PrivateKey } from '@hashgraph/sdk';
import { config } from './src/config.js';

const DOVU_TOKEN_ID = '0.0.3716059';
const WALLET = config.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🚀 VERA LIVE DOVU + PAYMENT SOURCE                                ║');
console.log('║  Token: 0.0.3716059 | Wallet:', WALLET, '                           ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Setup Hedera client
const client = Client.forMainnet();
const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY || '';
let privateKey;
if (keyStr.length === 64) {
  try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
  catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
} else {
  privateKey = PrivateKey.fromString(keyStr);
}
client.setOperator(WALLET, privateKey);

// Check real DOVU balance
const query = new AccountBalanceQuery().setAccountId(WALLET);
const balance = await query.execute(client);
const dovuBalance = balance.tokens?._map?.get(DOVU_TOKEN_ID) || 0;

console.log('💰 Starting DOVU Balance:', (dovuBalance / 100000000).toFixed(2), 'DOVU\n');

// Initialize all systems
console.log('📦 Initializing systems...');
await dovuDominance.initialize();
await paymentOrchestrator.initialize();
await veraPaymentSource.initialize();
console.log('✅ All systems ready\n');

// Setup payment source monitoring
veraPaymentSource.onPayment((notification) => {
  console.log('\n🎉🎉🎉 EXTERNAL PAYMENT RECEIVED! 🎉🎉🎉');
  console.log(`   From: ${notification.fromAccount}`);
  console.log(`   Amount: ${(notification.amount / 100000000).toFixed(2)} DOVU`);
  console.log(`   Invoice: ${notification.invoiceId}`);
  console.log(`   Tx: ${notification.transactionId}\n`);
});

// Start monitoring for external payments
veraPaymentSource.startPaymentPolling(30000); // Check every 30 seconds
console.log('🔔 Payment monitoring active (checking every 30s)\n');

let cycle = 0;
let lastBalance = dovuBalance;
let lastStats = veraPaymentSource.getStats();

console.log('═'.repeat(70));
console.log('🔥 LIVE DOMINANCE + PAYMENT SOURCE ACTIVE');
console.log('═'.repeat(70));

while (true) {
  cycle++;
  const start = Date.now();
  
  console.log(`\n🔁 CYCLE #${cycle} - ${new Date().toLocaleTimeString()}`);
  
  // Run verification batch
  const ids = Array.from({ length: 10 }, (_, i) => `DOVU-${Date.now()}-${i}`);
  
  const result = await dovuDominance.runBatchVerification(ids, {
    batchSize: 10,
    autoNotarize: true,
    autoClaimPayment: true,
  });
  
  // Check balance change
  const newQuery = new AccountBalanceQuery().setAccountId(WALLET);
  const newBalance = await newQuery.execute(client);
  const currentDovu = newBalance.tokens?._map?.get(DOVU_TOKEN_ID) || 0;
  const change = currentDovu - lastBalance;
  
  // Check for new payments
  const currentStats = veraPaymentSource.getStats();
  const newPayments = currentStats.paidInvoices - lastStats.paidInvoices;
  
  console.log(`   ✅ Verified: ${result.successful}/${result.processed}`);
  console.log(`   💵 System Earnings: ${(result.earnings / 100000000).toFixed(2)} DOVU`);
  console.log(`   💰 Wallet Balance: ${(currentDovu / 100000000).toFixed(2)} DOVU`);
  console.log(`   📋 Pending Invoices: ${currentStats.pendingInvoices}`);
  
  if (change > 0) {
    console.log(`   🎉 BALANCE INCREASED: +${(change / 100000000).toFixed(2)} DOVU!`);
  }
  
  if (newPayments > 0) {
    console.log(`   💸 NEW CLIENT PAYMENTS: ${newPayments} invoices paid!`);
  }
  
  lastBalance = currentDovu;
  lastStats = currentStats;
  
  // Show payment source info every 5 cycles
  if (cycle % 5 === 0) {
    console.log('\n   📊 PAYMENT SOURCE STATS:');
    console.log(`      Total Clients: ${currentStats.totalClients}`);
    console.log(`      Total Invoices: ${currentStats.totalInvoices}`);
    console.log(`      Total Received: ${currentStats.totalReceived.toFixed(2)} DOVU`);
  }
  
  await new Promise(r => setTimeout(r, 60000));
}
