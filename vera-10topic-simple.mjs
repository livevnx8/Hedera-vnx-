#!/usr/bin/env node
/**
 * VERA 10-TOPIC LATTICE - SIMPLE VERSION
 * Creates 10 topics and submits messages
 */

import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

const SHARDS = [
  { name: 'DeFi_Data', emoji: '🔷' },
  { name: 'DOVU_Data', emoji: '🔶' },
  { name: 'Market_Data', emoji: '📈' },
  { name: 'Memory_Index', emoji: '💎' },
  { name: 'Audit_Trail', emoji: '🔍' },
  { name: 'Consensus', emoji: '🔗' },
  { name: 'Metrics', emoji: '📊' },
  { name: 'Performance', emoji: '⚡' },
  { name: 'Security', emoji: '🔒' },
  { name: 'Coordination', emoji: '🌐' }
];

async function create10Topics() {
  console.log('\n🔥 VERA 10-TOPIC LATTICE DEPLOYMENT 🔥\n');
  
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
    console.log('❌ Client failed:', e.message);
    process.exit(1);
  }

  console.log(`✅ Client: ${accountId}`);
  console.log(`🚀 Creating 10 HCS topics...\n`);

  const topics = [];
  const messages = [];
  const startTime = Date.now();

  // Create 10 topics
  for (let i = 0; i < SHARDS.length; i++) {
    const shard = SHARDS[i];
    console.log(`${shard.emoji} [${i+1}/10] Creating ${shard.name}...`);
    
    try {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo(`Vera: ${shard.name}`)
        .execute(client);

      const receipt = await tx.getReceipt(client);
      const topicId = receipt.topicId.toString();

      topics.push({ ...shard, topicId, index: i });
      console.log(`   ✅ Created: ${topicId}`);
      
      // Submit message to this topic
      const msgTx = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(JSON.stringify({
          type: 'lattice_init',
          shard: shard.name,
          index: i,
          timestamp: new Date().toISOString()
        }))
        .execute(client);

      const msgRecord = await msgTx.getRecord(client);
      messages.push({
        topic: shard.name,
        topicId,
        sequence: msgRecord.receipt.topicSequenceNumber.toString()
      });
      console.log(`   ✅ Message: Seq ${msgRecord.receipt.topicSequenceNumber}`);
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  const duration = Date.now() - startTime;
  
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('10-TOPIC LATTICE COMPLETE');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log(`📊 Results: ${topics.length}/10 topics created`);
  console.log(`📊 Messages: ${messages.length}/10 submitted`);
  console.log(`⏱️  Time: ${(duration/1000).toFixed(1)}s`);
  console.log(`⚡ Throughput: ${(messages.length / (duration/1000)).toFixed(2)} TPS\n`);

  console.log('🌐 HASHSCAN LINKS:');
  console.log('─'.repeat(70));
  messages.forEach((m, i) => {
    console.log(`${i + 1}. ${SHARDS[i].emoji} ${m.topic}`);
    console.log(`   Topic: ${m.topicId}`);
    console.log(`   Sequence: ${m.sequence}`);
    console.log(`   🔗 https://hashscan.io/mainnet/topic/${m.topicId}`);
    console.log('');
  });

  // Save results
  fs.writeFileSync('./vera-10topic-lattice.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    topicsCreated: topics.length,
    messagesSubmitted: messages.length,
    duration,
    throughput: messages.length / (duration / 1000),
    messages
  }, null, 2));

  console.log('✅ Saved: ./vera-10topic-lattice.json\n');
  console.log('🏆 VERA 10-TOPIC LATTICE DEPLOYED!');
  console.log(`   ${messages.length} topics with messages on HashScan\n`);

  client.close();
  process.exit(0);
}

create10Topics().catch(console.error);
