/**
 * Vera Quick Launch - 137 DOVU Treasury
 * Minimal version to start earning immediately
 */

import { dovuDominance } from './src/dovu/dominanceEngine.js';

console.log('🚀 VERA 137 DOVU - QUICK LAUNCH\n');

await dovuDominance.initialize();

const stats = dovuDominance.getDominanceStats();
console.log(`Initial: ${stats.totalVerifications} verifications`);
console.log(`Treasury: 137 DOVU ready`);
console.log(`Rate: 5 DOVU per verification\n`);

console.log('═'.repeat(50));
console.log('🔥 LIVE DOMINANCE STARTED');
console.log('═'.repeat(50));

let cycle = 0;
while (true) {
  cycle++;
  console.log(`\n🔁 CYCLE #${cycle} - ${new Date().toLocaleTimeString()}`);
  
  const ids = Array.from({ length: 5 }, (_, i) => `C${cycle}-${i}`);
  
  try {
    const result = await dovuDominance.runBatchVerification(ids, {
      batchSize: 5,
      autoNotarize: true,
      autoClaimPayment: true,
    });
    
    console.log(`   ✅ Verified: ${result.successful}/${result.processed}`);
    console.log(`   💵 Earned: ${(result.earnings / 100000000).toFixed(2)} DOVU`);
    console.log(`   📊 Total: ${dovuDominance.getDominanceStats().totalVerifications}`);
    
  } catch (e) {
    console.log(`   ⚠️  ${String(e).slice(0, 50)}`);
  }
  
  console.log('   😴 60s...');
  await new Promise(r => setTimeout(r, 60000));
}
