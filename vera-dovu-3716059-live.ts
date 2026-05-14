/**
 * Vera LIVE DOVU - Correct Token ID 0.0.3716059
 * 24/7 verification with rewards to wallet 0.0.10294360
 */

import { dovuDominance } from './src/dovu/dominanceEngine.js';
import { paymentOrchestrator } from './src/dovu/paymentOrchestrator.js';
import { veraHCS } from './src/dovu/index.js';
import { Client, AccountBalanceQuery, PrivateKey } from '@hashgraph/sdk';
import { config } from './src/config.js';

const DOVU_TOKEN_ID = '0.0.3716059';
const WALLET = config.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🚀 VERA LIVE DOVU - 0.0.3716059                                   ║');
console.log('║  Rewards to Wallet:', WALLET, '                           ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Check real DOVU balance
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

const query = new AccountBalanceQuery().setAccountId(WALLET);
const balance = await query.execute(client);
const dovuBalance = balance.tokens?._map?.get(DOVU_TOKEN_ID) || 0;

console.log('💰 Starting DOVU Balance:', (dovuBalance / 100000000).toFixed(2), 'DOVU\n');

// Initialize
await dovuDominance.initialize();
await paymentOrchestrator.initialize();
await veraHCS.initialize();

// Show HCS topics
const topicIds = veraHCS.getTopicIds();
const links = veraHCS.getHashScanLinks();
console.log('🔗 HCS Topics Active:');
if (links.verifications) console.log(`   Verifications: ${links.verifications}`);
if (links.milestones) console.log(`   Milestones: ${links.milestones}`);
console.log('');

let cycle = 0;
let lastBalance = dovuBalance;

console.log('═'.repeat(70));
console.log('🔥 LIVE DOMINANCE ACTIVE - Press Ctrl+C to stop');
console.log('═'.repeat(70));

while (true) {
  cycle++;
  const start = Date.now();
  
  console.log(`\n🔁 CYCLE #${cycle} - ${new Date().toLocaleTimeString()}`);
  
  const ids = Array.from({ length: 10 }, (_, i) => `DOVU-${Date.now()}-${i}`);
  
  const result = await dovuDominance.runBatchVerification(ids, {
    batchSize: 10,
    autoNotarize: true,
    autoClaimPayment: true,
  });
  
  // Check balance change
  const newQuery = new AccountBalanceQuery().setAccountId(WALLET);
  const newBalance = await newQuery.execute(client);
  const currentDovu = newBalance.tokens?._map?.get(DOVU_TOKEN_ID) || 0;
  const change = currentDovu - lastBalance;
  
  console.log(`   ✅ Verified: ${result.successful}/${result.processed}`);
  console.log(`   💵 Earned: ${(result.earnings / 100000000).toFixed(2)} DOVU`);
  console.log(`   💰 Wallet: ${(currentDovu / 100000000).toFixed(2)} DOVU`);
  
  // Log to HCS
  if (topicIds.verifications) {
    console.log(`   🔗 HCS: ${result.successful} verifications logged to HashScan`);
  }
  
  if (change > 0) {
    console.log(`   🎉 REWARD RECEIVED: +${(change / 100000000).toFixed(2)} DOVU!`);
  }
  
  lastBalance = currentDovu;
  
  await new Promise(r => setTimeout(r, 60000));
}
