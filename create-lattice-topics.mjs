#!/usr/bin/env node
/**
 * Create 4 new HCS topics for the Multi-Topic Lattice Nervous System
 * Topics: DeFi, Carbon, Bridge, Ecosystem
 */

import { Client, TopicCreateTransaction, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

if (!accountId || !privateKeyStr) {
  console.error('❌ Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY');
  process.exit(1);
}

// Initialize client
const client = Client.forMainnet();

// Parse private key (handle both ECDSA and ED25519)
let privateKey;
if (privateKeyStr.startsWith('0x') || privateKeyStr.length === 66) {
  privateKey = PrivateKey.fromStringECDSA(privateKeyStr);
} else if (privateKeyStr.length === 96) {
  privateKey = PrivateKey.fromStringED25519(privateKeyStr);
} else {
  try {
    privateKey = PrivateKey.fromStringDer(privateKeyStr);
  } catch {
    privateKey = PrivateKey.fromString(privateKeyStr);
  }
}

client.setOperator(accountId, privateKey);

console.log('🔑 Operator:', accountId);
console.log('⏳ Creating 4 HCS topics for Lattice Nervous System...\n');

const topics = [
  { name: 'DeFi Intelligence', memo: 'vera-lattice-defi', category: 'defi' },
  { name: 'Carbon & Sustainability', memo: 'vera-lattice-carbon', category: 'carbon' },
  { name: 'Cross-Chain Bridge', memo: 'vera-lattice-bridge', category: 'bridge' },
  { name: 'Ecosystem Map', memo: 'vera-lattice-ecosystem', category: 'ecosystem' }
];

const createdTopics = [];

for (const topic of topics) {
  try {
    console.log(`📝 Creating ${topic.name}...`);
    
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(topic.memo)
      .setSubmitKey(privateKey.publicKey)
      .execute(client);
    
    const record = await tx.getRecord(client);
    const topicId = record.receipt.topicId.toString();
    
    createdTopics.push({
      name: topic.name,
      category: topic.category,
      topicId,
      memo: topic.memo
    });
    
    console.log(`   ✅ ${topic.name}: ${topicId}`);
    console.log(`   🔗 https://hashscan.io/mainnet/topic/${topicId}`);
    console.log();
    
    // Small delay between creations
    await new Promise(r => setTimeout(r, 2000));
    
  } catch (err) {
    console.error(`   ❌ Failed to create ${topic.name}:`, err.message);
  }
}

console.log('═'.repeat(70));
console.log('📊 TOPIC CONFIGURATION - Add this to latticeFindings.ts');
console.log('═'.repeat(70));
console.log();
console.log('const TOPIC_CONFIG = {');
console.log(`  core: { id: '0.0.10409351', priority: 'critical', retention: '24h' },`);
for (const t of createdTopics) {
  const priority = t.category === 'defi' || t.category === 'carbon' ? 'high' : 'medium';
  const retention = t.category === 'ecosystem' ? 'infinite' : t.category === 'defi' ? '12h' : t.category === 'carbon' ? '48h' : '6h';
  console.log(`  ${t.category}: { id: '${t.topicId}', priority: '${priority}', retention: '${retention}' },`);
}
console.log('};');
console.log();
console.log('// Save this config!');

client.close();
