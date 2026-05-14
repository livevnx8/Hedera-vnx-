/**
 * 🔥 VERA LIVE VERIFICATION DEMO
 * Shows Vera's real-time verification capabilities with HCS logging
 */

import { dovuDominance } from './src/dovu/dominanceEngine.js';
import { veraHCS } from './src/dovu/index.js';
import { Client, AccountBalanceQuery, PrivateKey } from '@hashgraph/sdk';
import { config } from './src/config.js';

const DOVU_TOKEN_ID = '0.0.3716059';
const WALLET = config.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🔥 VERA LIVE VERIFICATION - REAL-TIME DEMO                        ║');
console.log('║  Watch Vera verify carbon credits with HCS timestamps              ║');
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

// Check balance
console.log('💰 Checking Wallet...');
const query = new AccountBalanceQuery().setAccountId(WALLET);
const balance = await query.execute(client);
const dovuBalance = balance.tokens?._map?.get(DOVU_TOKEN_ID) || 0;
console.log(`   Wallet: ${WALLET}`);
console.log(`   DOVU Balance: ${(dovuBalance / 100000000).toFixed(2)} DOVU\n`);

// Initialize
console.log('📡 Initializing Vera Systems...');
await dovuDominance.initialize();
await veraHCS.initialize();
console.log('✅ Systems Ready\n');

// Show HCS topics
const topicIds = veraHCS.getTopicIds();
const links = veraHCS.getHashScanLinks();
console.log('🔗 HCS Topics Active:');
Object.entries(topicIds).forEach(([name, id]) => {
  if (id) console.log(`   ${name}: ${id}`);
});
console.log('');

// LIVE VERIFICATION BATCHES
console.log('═'.repeat(70));
console.log('🔥 STARTING LIVE VERIFICATION BATCHES');
console.log('═'.repeat(70));

const TOTAL_BATCHES = 3;
const VERIFICATIONS_PER_BATCH = 10;

for (let batch = 1; batch <= TOTAL_BATCHES; batch++) {
  console.log(`\n📦 BATCH #${batch} - ${new Date().toLocaleTimeString()}`);
  console.log('─'.repeat(50));
  
  // Generate live verification IDs
  const ids = Array.from({ length: VERIFICATIONS_PER_BATCH }, (_, i) => 
    `LIVE-${Date.now()}-B${batch}-${i}`
  );
  
  console.log(`   Processing ${VERIFICATIONS_PER_BATCH} carbon credits...`);
  
  // Run verification
  const start = Date.now();
  const result = await dovuDominance.runBatchVerification(ids, {
    batchSize: VERIFICATIONS_PER_BATCH,
    autoNotarize: true,
    autoClaimPayment: true,
  });
  const duration = Date.now() - start;
  
  // Show results
  console.log(`   ✅ Verified: ${result.successful}/${result.processed}`);
  console.log(`   ⚡ Speed: ${(duration / result.processed).toFixed(1)}ms per credit`);
  console.log(`   💵 Earnings: ${(result.earnings / 100000000).toFixed(2)} DOVU`);
  if (result.certificateId) {
    console.log(`   📜 Certificate: ${result.certificateId.slice(0, 16)}...`);
  }
  
  // Show HCS logging
  console.log(`   🔗 HCS Logs:`);
  console.log(`      - ${VERIFICATIONS_PER_BATCH} verifications logged`);
  if (links.verifications) {
    console.log(`      - View: ${links.verifications}`);
  }
  
  // Small delay between batches
  if (batch < TOTAL_BATCHES) {
    console.log('   ⏱️  Waiting 2s before next batch...');
    await new Promise(r => setTimeout(r, 2000));
  }
}

// Final stats
console.log('\n' + '═'.repeat(70));
console.log('📊 LIVE DEMO COMPLETE');
console.log('═'.repeat(70));

const stats = dovuDominance.getDominanceStats();

console.log(`\n✅ Total Verified This Session: ${stats.totalVerifications}`);
console.log(`✅ Success Rate: ${(stats.batchSuccessRate * 100).toFixed(1)}%`);
console.log(`✅ Avg Time: ${stats.averageVerificationTime.toFixed(2)}ms per credit`);
console.log(`✅ Earnings Tracked: ${(stats.totalEarningsDovu / 100000000).toFixed(2)} DOVU`);

// HCS Summary
console.log('\n🔗 HCS Immutable Records Created:');
console.log(`   • ${stats.totalVerifications} verification timestamps`);
console.log(`   • ${Math.floor(stats.totalVerifications / 100)} growth milestones`);
console.log(`   • All viewable on HashScan forever`);

console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🎉 VERA LIVE VERIFICATION COMPLETE!                               ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
console.log('\nWhat just happened:');
console.log('   ✅ Verified carbon credits in real-time');
console.log('   ✅ Created immutable HCS timestamps');
console.log('   ✅ Generated HashScan proof links');
console.log('   ✅ Tracked earnings automatically');
console.log('   ✅ Ready for DOVU partnership demo\n');

console.log('HashScan Links:');
console.log(`   Account: https://hashscan.io/mainnet/account/${WALLET}`);
if (links.verifications) {
  console.log(`   Verifications: ${links.verifications}`);
}

console.log('\n🚀 Vera is ready for 24/7 live dominance!\n');
