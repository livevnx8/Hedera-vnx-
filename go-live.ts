import { dovuDominance } from './src/dovu/dominanceEngine.js';

console.log('🚀 VERA LIVE - STARTING...\n');

await dovuDominance.initialize();

const stats = dovuDominance.getDominanceStats();
console.log(`Status: ${stats.totalVerifications} verifications`);
console.log('Mode: 24/7 LIVE DOMINANCE');
console.log('Rewards: Tracked to wallet 0.0.10294360\n');

console.log('═'.repeat(50));
console.log('🔥 RUNNING - Press Ctrl+C to stop');
console.log('═'.repeat(50));

let cycle = 0;
while (true) {
  cycle++;
  console.log(`\n🔁 CYCLE #${cycle} - ${new Date().toLocaleTimeString()}`);
  
  const ids = Array.from({length: 5}, (_, i) => `LIVE-${Date.now()}-${i}`);
  
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
    console.log(`   ⚠️  ${String(e).slice(0, 40)}`);
  }
  
  console.log('   😴 60s...');
  await new Promise(r => setTimeout(r, 60000));
}
