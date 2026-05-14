/**
 * Vera LIVE - Simple JavaScript Version
 * No TypeScript compilation needed
 */

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  🚀 VERA LIVE DOVU - 0.0.3716059                                   ║');
  console.log('║  Wallet: 0.0.10294360                                              ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // Dynamic import of ES modules
  const { dovuDominance } = await import('./src/dovu/dominanceEngine.js');
  const { paymentOrchestrator } = await import('./src/dovu/paymentOrchestrator.js');

  console.log('📦 Initializing...');
  await dovuDominance.initialize();
  await paymentOrchestrator.initialize();

  const stats = dovuDominance.getDominanceStats();
  console.log(`   Starting: ${stats.totalVerifications} verifications`);
  console.log('   Status: LIVE\n');

  console.log('═'.repeat(70));
  console.log('🔥 RUNNING - Press Ctrl+C to stop');
  console.log('═'.repeat(70));

  let cycle = 0;
  while (true) {
    cycle++;
    console.log(`\n🔁 CYCLE #${cycle} - ${new Date().toLocaleTimeString()}`);
    
    const ids = Array.from({length: 10}, (_, i) => `LIVE-${Date.now()}-${i}`);
    
    try {
      const result = await dovuDominance.runBatchVerification(ids, {
        batchSize: 10,
        autoNotarize: true,
        autoClaimPayment: true,
      });
      
      const currentStats = dovuDominance.getDominanceStats();
      
      console.log(`   ✅ Verified: ${result.successful}/${result.processed}`);
      console.log(`   💵 Earned: ${(result.earnings / 100000000).toFixed(2)} DOVU`);
      console.log(`   📊 Total: ${currentStats.totalVerifications}`);
      console.log(`   🏆 Rank: #${currentStats.ranking}`);
      
      if (result.earnings > 0) {
        console.log(`   🎉 +${(result.earnings / 100000000).toFixed(2)} DOVU tracked!`);
      }
    } catch (e) {
      console.log(`   ⚠️  Error: ${String(e).slice(0, 40)}`);
    }
    
    console.log('   😴 60s...');
    await new Promise(r => setTimeout(r, 60000));
  }
}

main().catch(console.error);
