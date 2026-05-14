#!/usr/bin/env node
/**
 * VERA 10-TOPIC CREATOR - Sequential Deployment
 * Creates topics one by one with progress tracking
 */

import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

const SHARDS = [
  { id: 0, name: 'Vera_DeFi_Data', emoji: '🔷', layer: 'data' },
  { id: 1, name: 'Vera_DOVU_Data', emoji: '🔶', layer: 'data' },
  { id: 2, name: 'Vera_Market_Data', emoji: '📈', layer: 'data' },
  { id: 3, name: 'Vera_Memory_Index', emoji: '💎', layer: 'memory' },
  { id: 4, name: 'Vera_Audit_Trail', emoji: '🔍', layer: 'memory' },
  { id: 5, name: 'Vera_Consensus', emoji: '🔗', layer: 'memory' },
  { id: 6, name: 'Vera_Metrics', emoji: '📊', layer: 'system' },
  { id: 7, name: 'Vera_Performance', emoji: '⚡', layer: 'system' },
  { id: 8, name: 'Vera_Security', emoji: '🔒', layer: 'system' },
  { id: 9, name: 'Vera_Coordination', emoji: '🌐', layer: 'coordination' }
];

async function createTopicsOneByOne() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🔥 VERA 10-TOPIC SEQUENTIAL CREATOR 🔥                          ║');
  console.log('║     Creating topics one by one for maximum reliability              ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  if (!accountId || !privateKeyStr) {
    console.log('❌ Missing credentials');
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
    console.log(`✅ Client: ${accountId}\n`);
  } catch (e) {
    console.log('❌ Client failed:', e.message);
    process.exit(1);
  }

  const topics = [];
  const startTime = Date.now();

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('CREATING 10 HCS TOPICS (ONE BY ONE)');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Create each topic sequentially
  for (let i = 0; i < SHARDS.length; i++) {
    const shard = SHARDS[i];
    console.log(`${shard.emoji} [${i+1}/10] Creating: ${shard.name} (${shard.layer} layer)`);
    
    try {
      // Create topic
      const tx = await new TopicCreateTransaction()
        .setTopicMemo(`Vera Lattice: ${shard.name} [${shard.layer}]`)
        .execute(client);

      const receipt = await tx.getReceipt(client);
      const topicId = receipt.topicId.toString();

      // Submit initial message
      const msgTx = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(JSON.stringify({
          type: 'lattice_init',
          shard: shard.name,
          layer: shard.layer,
          index: shard.id,
          timestamp: new Date().toISOString(),
          message: 'Topic initialized'
        }))
        .execute(client);

      const msgRecord = await msgTx.getRecord(client);
      const sequence = msgRecord.receipt.topicSequenceNumber.toString();

      topics.push({
        ...shard,
        topicId,
        sequence,
        url: `https://hashscan.io/mainnet/topic/${topicId}`
      });

      console.log(`   ✅ Topic: ${topicId}`);
      console.log(`   ✅ Message: Seq ${sequence}`);
      console.log(`   🔗 https://hashscan.io/mainnet/topic/${topicId}\n`);

      // Progress update
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`   📊 Progress: ${i+1}/10 topics (${((i+1)/10*100).toFixed(0)}%) | Time: ${elapsed}s\n`);

      // Brief pause between topics
      if (i < SHARDS.length - 1) {
        console.log('   ⏳ Pausing 2s before next topic...\n');
        await new Promise(r => setTimeout(r, 2000));
      }

    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
    }
  }

  const duration = Date.now() - startTime;

  // Summary
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('10-TOPIC DEPLOYMENT COMPLETE');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log(`📊 RESULTS:`);
  console.log(`   Topics Created: ${topics.length}/10`);
  console.log(`   Total Time: ${(duration/1000).toFixed(1)}s`);
  console.log(`   Average per topic: ${(duration/topics.length/1000).toFixed(1)}s\n`);

  // Group by layer
  const dataLayer = topics.filter(t => t.layer === 'data');
  const memoryLayer = topics.filter(t => t.layer === 'memory');
  const systemLayer = topics.filter(t => t.layer === 'system');
  const coordLayer = topics.filter(t => t.layer === 'coordination');

  console.log('🔗 LAYER BREAKDOWN:');
  console.log(`   📊 Data Layer: ${dataLayer.length}/3 topics`);
  console.log(`   💎 Memory Layer: ${memoryLayer.length}/3 topics`);
  console.log(`   ⚡ System Layer: ${systemLayer.length}/3 topics`);
  console.log(`   🌐 Coordination: ${coordLayer.length}/1 topic\n`);

  // All HashScan links
  console.log('🌐 ALL HASHSCAN LINKS:');
  console.log('─'.repeat(70));
  topics.forEach((t, i) => {
    console.log(`${i + 1}. ${t.emoji} ${t.name}`);
    console.log(`   Topic ID: ${t.topicId}`);
    console.log(`   Sequence: ${t.sequence}`);
    console.log(`   🔗 ${t.url}`);
    console.log('');
  });

  // Save results
  const report = {
    timestamp: new Date().toISOString(),
    totalTopics: topics.length,
    duration,
    topics,
    byLayer: {
      data: dataLayer,
      memory: memoryLayer,
      system: systemLayer,
      coordination: coordLayer
    }
  };

  fs.writeFileSync('./vera-10topic-lattice.json', JSON.stringify(report, null, 2));
  console.log('💾 Saved: ./vera-10topic-lattice.json\n');

  console.log('🏆 VERA 10-TOPIC LATTICE DEPLOYED!');
  console.log(`   ${topics.length} topics with HashScan visibility`);
  console.log('   Maximum efficiency infrastructure ready\n');

  client.close();
  process.exit(0);
}

createTopicsOneByOne().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
