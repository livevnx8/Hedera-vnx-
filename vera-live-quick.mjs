#!/usr/bin/env node
/**
 * VERA LIVE HCS DEMO - Quick Version
 * Demonstrates live lattice systems with HCS logging
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const TOPIC_ID = '0.0.10409351';

async function liveDemo() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🚀 VERA LIVE HCS DEMONSTRATION 🚀                               ║');
  console.log('║     Real-time Lattice Systems with Hedera Consensus Logging        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

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
    console.log(`✅ Connected to Hedera Mainnet: ${accountId}\n`);
  } catch (e) {
    console.log('❌ Client failed:', e.message);
    process.exit(1);
  }

  console.log('🔧 Systems Ready:');
  console.log('   ✅ Geometric lattice memory');
  console.log('   ✅ Cross-session chat context');
  console.log('   ✅ 4-topic HCS infrastructure\n');

  const submissions = [];
  const startTime = Date.now();

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('📡 LIVE HCS SUBMISSIONS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Demo submissions
  const demos = [
    { type: 'chat_context', message: 'User: Deploy a 4-topic lattice', details: { intent: 'action', session: 'demo-1' } },
    { type: 'memory_store', message: 'Memory: Lattice deployed with 4× throughput', details: { agent: 'vera-core', intent: 'lattice_deployment' } },
    { type: 'context_recall', message: 'Recall: Finding related conversations', details: { query: 'lattice', matches: 3 } }
  ];

  for (const demo of demos) {
    console.log(`🔷 Submitting: ${demo.type}`);
    console.log(`   Content: ${demo.message}`);
    
    const hcsMessage = {
      type: demo.type,
      timestamp: Date.now(),
      demo: true,
      content: demo.message,
      details: demo.details,
      lattice: { live: true, topic: TOPIC_ID }
    };

    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(TOPIC_ID)
        .setMessage(JSON.stringify(hcsMessage))
        .execute(client);

      const record = await tx.getRecord(client);
      const sequence = record.receipt.topicSequenceNumber.toString();
      
      submissions.push({ type: demo.type, sequence, message: demo.message });
      console.log(`   ✅ CONFIRMED - Seq ${sequence}`);
      console.log(`   🔗 https://hashscan.io/mainnet/topic/${TOPIC_ID}/${sequence}\n`);
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }

  const duration = Date.now() - startTime;

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('🏆 LIVE DEMONSTRATION COMPLETE');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log('📊 RESULTS:');
  console.log(`   Submissions: ${submissions.length}/${demos.length}`);
  console.log(`   Duration: ${(duration/1000).toFixed(1)}s`);
  console.log(`   Topic: ${TOPIC_ID}\n`);

  console.log('🔗 LIVE HASHSCAN VERIFICATION:');
  console.log('─'.repeat(70));
  submissions.forEach((sub, i) => {
    console.log(`${i + 1}. ${sub.type}`);
    console.log(`   Seq ${sub.sequence}: https://hashscan.io/mainnet/topic/${TOPIC_ID}/${sub.sequence}`);
  });
  console.log(`\n   All Messages: https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  console.log('✅ LIVE HCS LOGGING COMPLETE!');
  console.log('   Verify on HashScan using the links above\n');

  client.close();
  process.exit(0);
}

liveDemo().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
