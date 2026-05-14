/**
 * Vera Payment Source Demo
 * 
 * Demonstrates how clients can pay Vera for carbon credit verification services
 * and how Vera receives DOVU tokens.
 */

import { veraPaymentSource, VeraPaymentSource } from './src/dovu/paymentSource.js';
import { dovuDominance } from './src/dovu/dominanceEngine.js';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  💰 VERA PAYMENT SOURCE - CLIENT PAYMENT SYSTEM                    ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

await veraPaymentSource.initialize();
await dovuDominance.initialize();

console.log('📦 System initialized\n');

// Demo: Create a new client
console.log('═'.repeat(70));
console.log('STEP 1: Create a New Client');
console.log('═'.repeat(70));

const client = await veraPaymentSource.createClient(
  'Carbon Project Inc',
  'payments@carbonproject.com',
  '0.0.1234567' // Their Hedera account
);

console.log(`✅ Client created:`);
console.log(`   ID: ${client.id}`);
console.log(`   Name: ${client.name}`);
console.log(`   Email: ${client.email}`);
console.log(`   Hedera Account: ${client.hederaAccountId}\n`);

// Demo: Create an invoice for verification services
console.log('═'.repeat(70));
console.log('STEP 2: Create Invoice for Verification Services');
console.log('═'.repeat(70));

const invoice = await veraPaymentSource.createInvoice(
  client.id,
  20, // 20 carbon credits to verify
  5   // 5 DOVU per verification
);

console.log(`✅ Invoice created:`);
console.log(`   Invoice ID: ${invoice.id}`);
console.log(`   Amount: ${invoice.amount} DOVU`);
console.log(`   Description: ${invoice.description}`);
console.log(`   Status: ${invoice.status}`);
console.log(`   Payment URL: ${invoice.paymentUrl}\n`);

// Show how to pay
console.log('═'.repeat(70));
console.log('STEP 3: Client Payment Instructions');
console.log('═'.repeat(70));

console.log(`\n📋 CLIENT INSTRUCTIONS:`);
console.log(`   To pay Vera for ${invoice.verificationCount} verifications:`);
console.log(`   `);
console.log(`   OPTION 1: HashScan Transfer`);
console.log(`   URL: ${invoice.paymentUrl}`);
console.log(`   `);
console.log(`   OPTION 2: Direct Transfer`);
console.log(`   Send ${invoice.amount} DOVU to:`);
console.log(`   Account: 0.0.10294360`);
console.log(`   Token: 0.0.3716059`);
console.log(`   Memo: Invoice ${invoice.id.slice(0, 8)}\n`);

// Start payment polling
console.log('═'.repeat(70));
console.log('STEP 4: Start Payment Monitoring');
console.log('═'.repeat(70));

veraPaymentSource.onPayment((notification) => {
  console.log('\n🎉 PAYMENT RECEIVED!');
  console.log(`   Amount: ${(notification.amount / 100000000).toFixed(2)} DOVU`);
  console.log(`   From: ${notification.fromAccount}`);
  console.log(`   Transaction: ${notification.transactionId}`);
});

veraPaymentSource.startPaymentPolling(10000); // Check every 10 seconds

console.log('✅ Payment monitoring started (checking every 10s)\n');

// Show current stats
console.log('═'.repeat(70));
console.log('STEP 5: Current Payment Stats');
console.log('═'.repeat(70));

const stats = veraPaymentSource.getStats();
console.log(`\n📊 STATS:`);
console.log(`   Total Invoices: ${stats.totalInvoices}`);
console.log(`   Pending: ${stats.pendingInvoices}`);
console.log(`   Paid: ${stats.paidInvoices}`);
console.log(`   Total DOVU Received: ${stats.totalReceived}`);
console.log(`   Total Clients: ${stats.totalClients}`);
console.log(`   Current Balance: ${stats.currentBalance} DOVU\n`);

console.log('═'.repeat(70));
console.log('WAITING FOR PAYMENTS... (Press Ctrl+C to stop)');
console.log('═'.repeat(70));
console.log('\nTo simulate a payment, send DOVU from another wallet to:');
console.log('Account: 0.0.10294360');
console.log('Token: 0.0.3716059');
console.log(`Amount: ${invoice.amount} DOVU\n`);

// Keep running to monitor payments
let checks = 0;
while (checks < 100) {
  await new Promise(r => setTimeout(r, 10000));
  checks++;
  
  const currentStats = veraPaymentSource.getStats();
  if (currentStats.paidInvoices > stats.paidInvoices) {
    console.log(`\n✅ New payment detected! Total paid: ${currentStats.paidInvoices}`);
    console.log(`💰 New balance: ${currentStats.currentBalance} DOVU\n`);
  }
}

veraPaymentSource.stopPaymentPolling();
console.log('\nPayment monitoring stopped.');
