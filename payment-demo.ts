/**
 * Vera Payment Source - Quick Demo (TypeScript)
 * Run with: npx tsx payment-demo.ts
 */

import { veraPaymentSource } from './src/dovu/index.js';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  💰 VERA PAYMENT SOURCE - DEMO                                     ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

await veraPaymentSource.initialize();

console.log('📦 System initialized\n');

// Create a client
console.log('STEP 1: Creating client...');
const client = await veraPaymentSource.createClient(
  'Carbon Project Inc',
  'payments@carbonproject.com',
  '0.0.1234567'
);
console.log(`✅ Client: ${client.name} (${client.id.slice(0, 8)}...)`);

// Create invoice
console.log('\nSTEP 2: Creating invoice...');
const invoice = await veraPaymentSource.createInvoice(client.id, 20, 5);
console.log(`✅ Invoice: ${invoice.amount} DOVU for ${invoice.verificationCount} verifications`);

// Show payment info
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  💳 PAYMENT INSTRUCTIONS FOR CLIENT                                 ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
console.log(`\nTo pay Vera ${invoice.amount} DOVU:`);
console.log(`1. Send ${invoice.amount} DOVU to: 0.0.10294360`);
console.log(`2. Token ID: 0.0.3716059`);
console.log(`3. Or use: ${invoice.paymentUrl}\n`);

// Show stats
const stats = veraPaymentSource.getStats();
console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  📊 CURRENT STATS                                                   ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
console.log(`Pending Invoices: ${stats.pendingInvoices}`);
console.log(`Current Balance: ${stats.currentBalance} DOVU`);
console.log(`\n✅ Payment source ready! Clients can now pay Vera for verification services.\n`);

console.log('NEXT STEPS:');
console.log('- Share payment URL with clients');
console.log('- Run: npx tsx vera-dovu-3716059-live.ts to continue verification work');
console.log('- Monitor balance at: https://hashscan.io/mainnet/account/0.0.10294360');
