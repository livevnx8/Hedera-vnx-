#!/usr/bin/env node
/**
 * SEQUENTIAL 10-TOPIC DEPLOYMENT
 * Creates topics one by one with progress feedback
 */

import { Client, TopicCreateTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const OPERATOR_ID = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const PRIVATE_KEY_STR = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

const TOPICS = [
  { name: 'Vera_DeFi_Data', emoji: '🔷', layer: 'data' },
  { name: 'Vera_Carbon_Credits', emoji: '🔶', layer: 'data' },
  { name: 'Vera_AI_Agents', emoji: '🤖', layer: 'data' },
  { name: 'Vera_Cross_Reference', emoji: '💎', layer: 'memory' },
  { name: 'Vera_Audit_Trail', emoji: '🔍', layer: 'memory' },
  { name: 'Vera_Knowledge_Graph', emoji: '📚', layer: 'memory' },
  { name: 'Vera_Metrics', emoji: '📊', layer: 'system' },
  { name: 'Vera_Security', emoji: '🔒', layer: 'system' },
  { name: 'Vera_System_Health', emoji: '❤️', layer: 'system' },
  { name: 'Vera_Coordination', emoji: '🌐', layer: 'coordination' }
];

async function main() {
  console.log('\n🔥 VERA 10-TOPIC LATTICE DEPLOYMENT\n');
  console.log(`Account: ${OPERATOR_ID}`);
  console.log(`Network: Hedera Mainnet\n`);

  const client = Client.forMainnet();
  let privateKey;

  try {
    if (PRIVATE_KEY_STR.length === 64) {
      try { privateKey = PrivateKey.fromStringECDSA(PRIVATE_KEY_STR); }
      catch { privateKey = PrivateKey.fromStringED25519(PRIVATE_KEY_STR); }
    } else {
      privateKey = PrivateKey.fromString(PRIVATE_KEY_STR);
    }
    client.setOperator(OPERATOR_ID, privateKey);
  } catch (e) {
    console.log('❌ Client failed:', e.message);
    process.exit(1);
  }

  const created = [];

  for (let i = 0; i < TOPICS.length; i++) {
    const topic = TOPICS[i];
    console.log(`[${i + 1}/10] ${topic.emoji} Creating ${topic.name}...`);
    
    try {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo(`Vera v3.0: ${topic.name} [${topic.layer}]`)
        .execute(client);

      const receipt = await tx.getReceipt(client);
      const topicId = receipt.topicId.toString();

      created.push({ ...topic, topicId, index: i });
      console.log(`✅ Created: ${topicId}`);
      console.log(`🔗 https://hashscan.io/mainnet/topic/${topicId}\n`);

      // Wait 3 seconds between topics
      if (i < TOPICS.length - 1) {
        console.log('⏳ Waiting 3s...\n');
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (error) {
      console.log(`❌ Failed: ${error.message}\n`);
    }
  }

  // Save topology
  const topology = {
    deploymentId: `v3-${Date.now()}`,
    timestamp: new Date().toISOString(),
    account: OPERATOR_ID,
    total: created.length,
    tps: created.length * 10,
    topics: created
  };

  fs.writeFileSync('./topology-v3.json', JSON.stringify(topology, null, 2));

  console.log('\n' + '═'.repeat(70));
  console.log('🏆 DEPLOYMENT COMPLETE');
  console.log('═'.repeat(70));
  console.log(`\nCreated: ${created.length}/10 topics`);
  console.log(`Capacity: ${created.length * 10} TPS`);
  console.log('\nAll HashScan Links:');
  created.forEach(t => {
    console.log(`${t.emoji} ${t.name}: ${t.topicId}`);
  });

  client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
