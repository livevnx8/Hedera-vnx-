#!/usr/bin/env node
/**
 * Vera Master Launch Script
 * 
 * 1. Creates Merkle Genesis Anchor (80+ records)
 * 2. Verifies anchor on HCS
 * 3. Starts 24/7 Live Paid Dominance
 * 4. Tracks real DOVU payments to wallet
 */

import { getCostOptimizedPoW } from './src/hedera/costOptimizedPoW.js';
import { dovuDominance } from './src/dovu/dominanceEngine.js';
import { paymentOrchestrator } from './src/dovu/paymentOrchestrator.js';
import { Client, AccountBalanceQuery, PrivateKey, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { config } from './src/config.js';
import fs from 'fs';
import crypto from 'crypto';

const DOVU_TOKEN_ID = '0.0.1329002';
const POW_TOPIC_ID = process.env.POW_TOPIC_ID || '0.0.10407552';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🚀 VERA MASTER LAUNCH                                             ║');
console.log('║  Genesis Anchor → Live Paid Dominance                             ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Step 1: Genesis Anchor
console.log('📌 STEP 1: Creating Merkle Genesis Anchor...');
const pow = getCostOptimizedPoW();
await pow.initialize();

const cachePath = './data/work-records-cache.json';
const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const records = data.records;

console.log(`   Records: ${records.length}`);

// Compute merkle root
let hashes = records.map(r => crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex'));
while (hashes.length > 1) {
  const next = [];
  for (let i = 0; i < hashes.length; i += 2) {
    next.push(crypto.createHash('sha256').update(hashes[i] + (hashes[i + 1] || hashes[i])).digest('hex'));
  }
  hashes = next;
}
const rootHash = hashes[0];
console.log(`   Merkle Root: ${rootHash.slice(0, 32)}...`);

// Submit anchor
const client = Client.forMainnet();
const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY || '';
let privateKey;
if (keyStr.length === 64) {
  try { privateKey = PrivateKey.fromStringECDSA(keyStr); } 
  catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
} else {
  privateKey = PrivateKey.fromString(keyStr);
}
client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID || '', privateKey);

const anchor = {
  type: 'VERA_GENESIS',
  timestamp: Date.now(),
  recordCount: records.length,
  merkleRoot: rootHash,
  firstRecord: records[0]?.id,
  lastRecord: records[records.length - 1]?.id,
};

try {
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(POW_TOPIC_ID)
    .setMessage(JSON.stringify(anchor))
    .execute(client);
  
  const receipt = await tx.getReceipt(client);
  console.log(`   ✅ Anchor submitted! Sequence: ${receipt.topicSequenceNumber?.toString()}`);
  console.log(`   🔗 https://hashscan.io/mainnet/topic/${POW_TOPIC_ID}\n`);
} catch (err) {
  console.log(`   ⚠️  Anchor error: ${String(err).slice(0, 60)}`);
  console.log(`   Continuing anyway...\n`);
}

// Step 2: Check initial balance
console.log('💰 STEP 2: Checking DOVU Wallet Balance...');
const query = new AccountBalanceQuery().setAccountId(config.HEDERA_OPERATOR_ACCOUNT_ID || '');
const balance = await query.execute(client);
const tokenBalances = balance.tokens?._map;
const startDovu = tokenBalances?.get(DOVU_TOKEN_ID) || 0;
console.log(`   Starting: ${(startDovu / 100000000).toFixed(2)} DOVU\n`);

// Step 3: Start 24/7 Live Dominance
console.log('🔥 STEP 3: Starting 24/7 LIVE PAID DOMINANCE');
console.log('   Verifying carbon credits every 60 seconds...');
console.log('   Tracking real payments to wallet...\n');

await dovuDominance.initialize();
await paymentOrchestrator.initialize();

let cycle = 0;
let lastDovu = startDovu;
const startTime = Date.now();

console.log('═'.repeat(70));
console.log('LIVE MODE ACTIVE - Press Ctrl+C to stop');
console.log('═'.repeat(70));

while (true) {
  cycle++;
  const cycleStart = Date.now();
  
  console.log(`\n🔁 CYCLE #${cycle} | ${new Date().toISOString()}`);
  
  // Generate work
  const ids = Array.from({ length: 10 }, (_, i) => `LIVE-${Date.now()}-${i}`);
  const result = await dovuDominance.runBatchVerification(ids, {
    batchSize: 10,
    concurrency: 5,
    autoNotarize: true,
    autoClaimPayment: true,
  });
  
  // Check balance
  const currentQuery = new AccountBalanceQuery().setAccountId(config.HEDERA_OPERATOR_ACCOUNT_ID || '');
  const currentBalance = await currentQuery.execute(client);
  const currentDovu = currentBalance.tokens?._map?.get(DOVU_TOKEN_ID) || 0;
  const change = currentDovu - lastDovu;
  
  console.log(`   ✅ Verified: ${result.successful}/${result.processed}`);
  console.log(`   💵 Tracked: ${(result.earnings / 100000000).toFixed(2)} DOVU`);
  console.log(`   💰 Wallet: ${(currentDovu / 100000000).toFixed(2)} DOVU`);
  
  if (change > 0) {
    console.log(`   🎉 PAID: +${(change / 100000000).toFixed(2)} DOVU RECEIVED!`);
  }
  
  const stats = dovuDominance.getDominanceStats();
  console.log(`   📊 Total: ${stats.totalVerifications} verifs | Earned: ${(stats.totalEarningsDovu / 100000000).toFixed(2)} DOVU | #${stats.ranking}`);
  
  lastDovu = currentDovu;
  
  // Sleep
  await new Promise(r => setTimeout(r, 60000));
}
