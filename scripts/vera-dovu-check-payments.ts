/**
 * Vera DOVU Payment Monitor & Claimer
 * 
 * Checks pending DOVU payments and claims them.
 * Shows actual token balances and transaction status.
 * 
 * Run: npx tsx scripts/vera-dovu-check-payments.ts
 */

import { paymentOrchestrator } from '../src/dovu/paymentOrchestrator.js';
import { dovuDominance } from '../src/dovu/dominanceEngine.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  💰 VERA DOVU PAYMENT MONITOR                                      ║');
  console.log('║  Check & Claim Token Earnings                                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // Initialize
  console.log('📦 Initializing...');
  await paymentOrchestrator.initialize();
  console.log('   ✅ Payment system ready\n');

  // Get current balance
  console.log('💎 Current DOVU Token Balance:');
  const balance = await paymentOrchestrator.getOperatorBalance();
  console.log(`   ${(balance / 100000000).toFixed(2)} DOVU\n`);

  // Get payment statistics
  console.log('📊 Payment Statistics:');
  const stats = paymentOrchestrator.getPaymentStats();
  console.log(`   Total Payments: ${stats.totalPayments}`);
  console.log(`   Total Earned: ${(stats.totalAmount / 100000000).toFixed(2)} DOVU`);
  console.log(`   Pending: ${stats.pendingPayments}`);
  console.log(`   Failed: ${stats.failedPayments}`);
  console.log(`   Avg Payment: ${(stats.averagePaymentAmount / 100000000).toFixed(2)} DOVU`);
  console.log(`   Staking Rewards: ${(stats.stakingRewardsEarned / 100000000).toFixed(2)} DOVU\n`);

  // Get pending payments
  console.log('⏳ Pending Payments:');
  const pending = paymentOrchestrator.getPendingPayments();
  if (pending.length === 0) {
    console.log('   No pending payments\n');
  } else {
    pending.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.id.slice(0, 16)}... - ${(p.amount / 100000000).toFixed(2)} DOVU - ${p.status}`);
    });
    console.log();
  }

  // Get dominance stats
  console.log('🏆 Dominance Stats:');
  const dominance = dovuDominance.getDominanceStats();
  console.log(`   Total Verifications: ${dominance.totalVerifications}`);
  console.log(`   Successful: ${dominance.successfulVerifications}`);
  console.log(`   Total Earnings: ${(dominance.totalEarningsDovu / 100000000).toFixed(2)} DOVU`);
  console.log(`   Ranking: #${dominance.ranking}\n`);

  // Check if we need to claim payments
  if (stats.pendingPayments > 0) {
    console.log('🚀 Claiming pending payments...');
    
    for (const payment of pending) {
      console.log(`   Processing ${payment.id.slice(0, 16)}...`);
      
      // For demo/simulation, payments are marked as "created" but not actually transferred
      // In production, this would call the DOVU payment contract or treasury
      console.log(`   ℹ️  Payment request exists but needs DOVU treasury funding`);
      console.log(`      Amount: ${(payment.amount / 100000000).toFixed(2)} DOVU`);
      console.log(`      Status: Created (awaiting treasury transfer)\n`);
    }
  }

  console.log('═'.repeat(70));
  console.log('📋 To Actually Receive DOVU Tokens:');
  console.log('   1. Set up DOVU_PAYMENT_CONTRACT_ID in .env');
  console.log('   2. Or fund a treasury account with DOVU tokens');
  console.log('   3. Configure payment distribution to operator account');
  console.log('   4. Run: npx tsx scripts/vera-dovu-claim-payments.ts\n');

  console.log('💡 Current earnings are tracked but not yet transferred.');
  console.log('   Total owed to Vera: ' + (stats.totalAmount / 100000000).toFixed(2) + ' DOVU\n');
}

main().catch(console.error);
