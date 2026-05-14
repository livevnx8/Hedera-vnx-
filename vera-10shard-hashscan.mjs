#!/usr/bin/env node
/**
 * VERA 10-SHARD HCS TEST - With HashScan Verification
 * Submit 20 messages (2 per shard) and verify on HashScan
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const TOPIC_ID = '0.0.10409351';

const SHARDS = [
  { id: 'alpha', name: 'DeFi_Research', emoji: '🔷' },
  { id: 'beta', name: 'DOVU_Validation', emoji: '🔶' },
  { id: 'gamma', name: 'Memory_Index', emoji: '💎' },
  { id: 'delta', name: 'System_Metrics', emoji: '📊' },
  { id: 'epsilon', name: 'Market_Analysis', emoji: '📈' },
  { id: 'zeta', name: 'Risk_Assessment', emoji: '⚠️' },
  { id: 'eta', name: 'Audit_Trail', emoji: '🔍' },
  { id: 'theta', name: 'Performance_Opt', emoji: '⚡' },
  { id: 'iota', name: 'Security_Monitor', emoji: '🔒' },
  { id: 'kappa', name: 'Consensus_Layer', emoji: '🔗' }
];

async function test10Shard() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🔥 VERA 10-SHARD HCS TEST - HASHSCAN VERIFICATION 🔥           ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

  if (!accountId || !privateKeyStr) {
    console.log('❌ Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY');
    process.exit(1);
  }

  const client = Client.forMainnet();
  let privateKey;
  
  try {
    if (privateKeyStr.length === 64) {
      try { privateKey = PrivateKey.fromStringECDSA(privateKeyStr); }
      catch { privateKey = PrivateKey.fromStringED25519(privateKeyStr); }
    } else {
      privateKey = PrivateKey.fromString(privateKeyStr);
    }
    client.setOperator(accountId, privateKey);
  } catch (e) {
    console.log('❌ Client setup failed:', e.message);
    process.exit(1);
  }

  console.log(`✅ Client initialized: ${accountId}`);
  console.log(`📡 Target Topic: ${TOPIC_ID}`);
  console.log(`🚀 Submitting 20 messages (2 per shard)\n`);

  const startTime = Date.now();
  const results = [];

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('SUBMITTING TO 10 SHARDS IN PARALLEL');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Submit all shards in parallel
  const promises = SHARDS.map(shard => submitShard(shard, client, results));
  await Promise.all(promises);

  const duration = Date.now() - startTime;
  const throughput = results.length / (duration / 1000);

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('SUBMISSION COMPLETE - HASHSCAN LINKS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log(`📊 Results: ${results.length}/20 messages submitted`);
  console.log(`⏱️  Time: ${(duration/1000).toFixed(2)}s`);
  console.log(`⚡ Throughput: ${throughput.toFixed(2)} TPS\n`);

  // Show all HashScan links
  console.log('🌐 HASHSCAN VERIFICATION LINKS:');
  console.log('─'.repeat(70));
  
  SHARDS.forEach((shard, i) => {
    const shardResults = results.filter(r => r.shard === shard.id);
    console.log(`${i + 1}. ${shard.emoji} ${shard.name}`);
    console.log(`   Messages: ${shardResults.length}/2`);
    if (shardResults.length > 0) {
      console.log(`   Sequences: ${shardResults.map(r => r.seq).join(', ')}`);
    }
    console.log(`   🔗 https://hashscan.io/mainnet/topic/${TOPIC_ID}`);
    console.log('');
  });

  console.log('─'.repeat(70));
  console.log('✅ Check HashScan now: All 20 messages should be visible');
  console.log(`   Direct link: https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  // Save results
  const report = {
    timestamp: new Date().toISOString(),
    topic: TOPIC_ID,
    totalMessages: results.length,
    duration,
    throughput,
    sequences: results.map(r => r.seq),
    shards: SHARDS.map(s => ({
      id: s.id,
      name: s.name,
      messages: results.filter(r => r.shard === s.id).length,
      sequences: results.filter(r => r.shard === s.id).map(r => r.seq)
    }))
  };

  fs.writeFileSync('./vera-10shard-hashscan.json', JSON.stringify(report, null, 2));
  console.log('💾 Report saved: ./vera-10shard-hashscan.json\n');

  client.close();
  process.exit(0);
}

async function submitShard(shard, client, results) {
  console.log(`${shard.emoji} [${shard.id.toUpperCase()}] Starting...`);

  for (let i = 0; i < 2; i++) {
    const message = {
      type: `10shard_${shard.id}`,
      shard: shard.id,
      shard_name: shard.name,
      message_num: i + 1,
      timestamp: new Date().toISOString(),
      test_id: 'hashscan_verification'
    };

    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(TOPIC_ID)
        .setMessage(JSON.stringify(message))
        .execute(client);

      const record = await tx.getRecord(client);
      const seq = record.receipt.topicSequenceNumber.toString();
      
      results.push({ shard: shard.id, seq, num: i + 1 });
      console.log(`   ✅ ${shard.name} #${i+1}: Seq ${seq}`);

    } catch (error) {
      console.log(`   ❌ ${shard.name} #${i+1}: ${error.message}`);
    }
  }
}

test10Shard().catch(console.error);
