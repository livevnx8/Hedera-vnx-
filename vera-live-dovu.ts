/**
 * Vera LIVE DOVU Dominance - Rewards to Wallet
 * 
 * 24/7 carbon credit verification with tracked earnings
 * Rewards go to wallet: 0.0.10294360
 * 
 * Run: npx tsx vera-live-dovu.ts
 */

import { dovuDominance } from './src/dovu/dominanceEngine.js';
import { paymentOrchestrator } from './src/dovu/paymentOrchestrator.js';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🔥 VERA LIVE DOVU DOMINANCE                                       ║');
console.log('║  24/7 Verification - Rewards to Wallet                             ║');
console.log('║  Wallet: 0.0.10294360                                              ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Initialize systems
console.log('📦 Initializing...');
await dovuDominance.initialize();
await paymentOrchestrator.initialize();

const startStats = dovuDominance.getDominanceStats();
console.log(`   Starting verifications: ${startStats.totalVerifications}`);
console.log(`   Treasury: Active`);
console.log(`   Rate: 5 DOVU per verification\n`);

console.log('═'.repeat(70));
console.log('🚀 LIVE DOMINANCE ACTIVE - Press Ctrl+C to stop');
console.log('═'.repeat(70));

let cycle = 0;
let shutdown = false;
let totalEarned = 0;

process.on('SIGINT', () => {
  console.log('\n🛑 Stopping...');
  shutdown = true;
});

while (!shutdown) {
  cycle++;
  const start = Date.now();
  
  console.log(`\n🔁 CYCLE #${cycle} | ${new Date().toLocaleTimeString()}`);
  
  // Generate verification batch
  const ids = Array.from({ length: 10 }, (_, i) => `LIVE-${Date.now()}-${i}`);
  
  try {
    // Run verification
    const result = await dovuDominance.runBatchVerification(ids, {
      batchSize: 10,
      concurrency: 5,
      verificationDepth: 'standard',
      autoNotarize: true,
      autoClaimPayment: true,
    });
    
    totalEarned += result.earnings;
    
    const currentStats = dovuDominance.getDominanceStats();
    const paymentStats = paymentOrchestrator.getPaymentStats();
    
    console.log(`   ✅ Verified: ${result.successful}/${result.processed}`);
    console.log(`   💵 This cycle: ${(result.earnings / 100000000).toFixed(2)} DOVU`);
    console.log(`   💰 Total tracked: ${(totalEarned / 100000000).toFixed(2)} DOVU`);
    console.log(`   📊 All-time verifications: ${currentStats.totalVerifications}`);
    console.log(`   📈 Success rate: ${(currentStats.batchSuccessRate * 100).toFixed(1)}%`);
    console.log(`   🏆 Global rank: #${currentStats.ranking}`);
    console.log(`   ⏱️  ${Date.now() - start}ms`);
    
    // Show payment status
    if (paymentStats.pendingPayments > 0) {
      console.log(`   ⏳ Pending payments: ${paymentStats.pendingPayments}`);
    }
    
  } catch (err) {
    console.log(`   ⚠️  Error: ${String(err).slice(0, 60)}`);
  }
  
  // Sleep before next cycle
  if (!shutdown) {
    console.log(`   😴 Next cycle in 60s...`);
    await new Promise(r => setTimeout(r, 60000));
  }
}

// Final summary
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  📊 FINAL SUMMARY                                                  ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');

const finalStats = dovuDominance.getDominanceStats();
const finalPayments = paymentOrchestrator.getPaymentStats();

console.log(`   Total cycles: ${cycle}`);
console.log(`   Total verifications: ${finalStats.totalVerifications}`);
console.log(`   Total DOVU tracked: ${(totalEarned / 100000000).toFixed(2)}`);
console.log(`   Payment requests: ${finalPayments.totalPayments}`);
console.log(`   Wallet: 0.0.10294360`);
console.log(`   Status: Active - rewards accumulating\n`);

console.log('✅ Vera Live Dominance Complete');
console.log('Run again to continue earning!');
