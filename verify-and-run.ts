/**
 * VERA LIVE - Quick Test & Start
 * Verifies rewards then runs 24/7
 */

import { dovuDominance } from './src/dovu/dominanceEngine.js';
import { paymentOrchestrator } from './src/dovu/paymentOrchestrator.js';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🔥 VERA LIVE DOVU - REWARD VERIFICATION                           ║');
console.log('║  Token: 0.0.3716059 | Wallet: 0.0.10294360                         ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

await dovuDominance.initialize();
await paymentOrchestrator.initialize();

const stats = dovuDominance.getDominanceStats();
const payments = paymentOrchestrator.getPaymentStats();

console.log('📊 INITIAL STATUS:');
console.log(`   Verifications: ${stats.totalVerifications}`);
console.log(`   Success Rate: ${(stats.batchSuccessRate * 100).toFixed(1)}%`);
console.log(`   Ranking: #${stats.ranking}`);
console.log(`   Pending Payments: ${payments.pendingPayments}`);
console.log(`   Total Payments: ${payments.totalPayments}\n`);

console.log('═'.repeat(70));
console.log('🚀 STARTING LIVE DOMINANCE - VERIFYING REWARDS');
console.log('═'.repeat(70));

let cycle = 0;

while (true) {
  cycle++;
  const start = Date.now();
  
  console.log(`\n🔁 CYCLE #${cycle} | ${new Date().toLocaleTimeString()}`);
  
  const ids = Array.from({ length: 10 }, (_, i) => `LIVE-${Date.now()}-${i}`);
  
  const result = await dovuDominance.runBatchVerification(ids, {
    batchSize: 10,
    autoNotarize: true,
    autoClaimPayment: true,
  });
  
  const currentStats = dovuDominance.getDominanceStats();
  const currentPayments = paymentOrchestrator.getPaymentStats();
  
  console.log(`   ✅ Verified: ${result.successful}/${result.processed}`);
  console.log(`   💵 This Cycle: ${(result.earnings / 100000000).toFixed(2)} DOVU`);
  console.log(`   💰 Total Earned: ${(result.earnings * cycle / 100000000).toFixed(2)} DOVU`);
  console.log(`   📊 Total Verifications: ${currentStats.totalVerifications}`);
  console.log(`   🏆 Global Rank: #${currentStats.ranking}`);
  console.log(`   ⏱️  ${Date.now() - start}ms`);
  
  // Show if payment was processed
  if (currentPayments.pendingPayments > 0) {
    console.log(`   ⏳ Pending: ${currentPayments.pendingPayments} payments`);
  }
  
  if (result.earnings > 0) {
    console.log(`   🎉 REWARD TRACKED: +${(result.earnings / 100000000).toFixed(2)} DOVU!`);
  }
  
  console.log(`   😴 Next cycle in 60s...`);
  await new Promise(r => setTimeout(r, 60000));
}
