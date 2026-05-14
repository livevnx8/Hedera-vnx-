/**
 * Vera DOVU Auto-Dominance
 * 
 * 24/7 continuous carbon credit verification system.
 * Automatically fetches, verifies, and earns DOVU tokens.
 * 
 * Run: npx tsx scripts/vera-dovu-auto-dominance.ts
 */

import { dovuDominance } from '../src/dovu/dominanceEngine.js';

let shutdownRequested = false;

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  🌍 VERA DOVU AUTO-DOMINANCE                                       ║');
  console.log('║  24/7 Carbon Credit Verification - Earning DOVU Tokens               ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutdown requested...');
    shutdownRequested = true;
    dovuDominance.stopAutoDominance();
  });

  // Initialize
  console.log('📦 Initializing DOVU Dominance Engine...');
  await dovuDominance.initialize();
  console.log('   ✅ Ready for 24/7 DOMINATION\n');

  // Show competitive advantages
  console.log('🏆 Vera\'s Competitive Edge:');
  const advantages = dovuDominance.getCompetitiveAdvantages();
  advantages.forEach((adv) => console.log(`   ${adv}`));
  console.log();

  // Start auto-dominance
  console.log('🚀 Starting AUTO-DOMINANCE MODE...');
  console.log('   Fetching and verifying carbon credits every 5 minutes');
  console.log('   Earning DOVU tokens automatically\n');

  console.log('═'.repeat(70));
  console.log('Press Ctrl+C to stop\n');

  await dovuDominance.startAutoDominance({
    batchSize: 100,
    concurrency: 10,
    verificationDepth: 'standard',
    autoNotarize: true,
    autoClaimPayment: true,
  });

  // Keep running until shutdown
  while (!shutdownRequested) {
    const stats = dovuDominance.getDominanceStats();
    console.log(`\n📊 Stats - Total: ${stats.totalVerifications} | Success: ${stats.successfulVerifications} | Earned: ${(stats.totalEarningsDovu / 100000000).toFixed(2)} DOVU | Rank: #${stats.ranking}`);
    await sleep(30000); // Update every 30 seconds
  }

  console.log('\n✅ Auto-dominance stopped');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
