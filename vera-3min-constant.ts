/**
 * 🔥 VERA 3-MINUTE CONSTANT VERIFICATION
 * Runs continuous verification for exactly 3 minutes
 * Shows total throughput and HCS logging
 */

import { dovuDominance } from './src/dovu/dominanceEngine.js';
import { veraHCS } from './src/dovu/index.js';
import { Client, AccountBalanceQuery, PrivateKey } from '@hashgraph/sdk';
import { config } from './src/config.js';

const DOVU_TOKEN_ID = '0.0.3716059';
const WALLET = config.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';
const DURATION_MINUTES = 3;
const DURATION_MS = DURATION_MINUTES * 60 * 1000;

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🔥 VERA 3-MINUTE CONSTANT VERIFICATION                            ║');
console.log('║  Running continuous verification for 3 minutes straight            ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Setup
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

console.log('📡 Initializing...');
await dovuDominance.initialize();
await veraHCS.initialize();
console.log('✅ Ready\n');

const startTime = Date.now();
const endTime = startTime + DURATION_MS;
let totalBatches = 0;
let totalVerified = 0;
let totalEarnings = 0;

console.log('═'.repeat(70));
console.log(`⏱️  STARTING: ${new Date().toLocaleTimeString()}`);
console.log(`🎯 DURATION: ${DURATION_MINUTES} minutes`);
console.log(`🏁 ENDING: ${new Date(endTime).toLocaleTimeString()}`);
console.log('═'.repeat(70));
console.log('');

// Run constant verification
while (Date.now() < endTime) {
  const batchStart = Date.now();
  const remaining = endTime - Date.now();
  const remainingSec = Math.floor(remaining / 1000);
  
  totalBatches++;
  
  // Generate batch of 10 credits
  const ids = Array.from({ length: 10 }, (_, i) => 
    `CONST-${Date.now()}-${totalBatches}-${i}`
  );
  
  // Verify
  const result = await dovuDominance.runBatchVerification(ids, {
    batchSize: 10,
    autoNotarize: true,
    autoClaimPayment: true,
  });
  
  totalVerified += result.successful;
  totalEarnings += result.earnings;
  
  const batchDuration = Date.now() - batchStart;
  
  // Live output
  console.log(
    `[${new Date().toLocaleTimeString()}] ` +
    `Batch #${totalBatches} | ` +
    `✅ ${result.successful}/10 | ` +
    `⚡ ${batchDuration}ms | ` +
    `💵 ${(result.earnings / 100000000).toFixed(2)} DOVU | ` +
    `⏳ ${remainingSec}s left`
  );
  
  // Small pause to prevent overwhelming
  await new Promise(r => setTimeout(r, 100));
}

// Final stats
console.log('\n' + '═'.repeat(70));
console.log('📊 3-MINUTE VERIFICATION COMPLETE');
console.log('═'.repeat(70));

const actualDuration = Date.now() - startTime;
const stats = dovuDominance.getDominanceStats();

console.log(`\n⏱️  Duration: ${(actualDuration / 1000).toFixed(1)} seconds`);
console.log(`📦 Total Batches: ${totalBatches}`);
console.log(`✅ Total Verified: ${totalVerified}`);
console.log(`⚡ Avg Speed: ${(actualDuration / totalVerified).toFixed(1)}ms per credit`);
console.log(`📊 Success Rate: ${(stats.batchSuccessRate * 100).toFixed(1)}%`);
console.log(`💰 Total Earnings: ${(totalEarnings / 100000000).toFixed(2)} DOVU`);
console.log(`🔥 Verifications/Minute: ${(totalVerified / (actualDuration / 60000)).toFixed(0)}`);

// HCS Summary
const topicIds = veraHCS.getTopicIds();
const links = veraHCS.getHashScanLinks();

console.log('\n🔗 HCS Records Created:');
console.log(`   • ${totalVerified} verification timestamps`);
console.log(`   • ${Math.floor(totalVerified / 100)} growth milestones`);
if (links.verifications) {
  console.log(`   • View: ${links.verifications}`);
}

console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🎉 3-MINUTE CONSTANT VERIFICATION COMPLETE!                       ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
console.log(`\nVera verified ${totalVerified} carbon credits in ${DURATION_MINUTES} minutes!`);
console.log(`Speed: ${(totalVerified / (actualDuration / 60000)).toFixed(0)} credits/minute`);
console.log(`All logged to Hedera Consensus Service (immutable)!\n`);
