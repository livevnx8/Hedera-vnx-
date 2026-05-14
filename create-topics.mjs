#!/usr/bin/env node
/**
 * Create HCS Topics for Vera v2.0
 * Creates missing DEFI and BRIDGE topics on mainnet
 */

import { Client, PrivateKey, TopicCreateTransaction } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';
const keyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY || '';

const client = Client.forMainnet();
let privateKey;
if (keyStr.length === 64) {
  try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
  catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
} else {
  privateKey = PrivateKey.fromString(keyStr);
}
client.setOperator(operatorId, privateKey);

console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🔧 CREATE HCS TOPICS                                               ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

const topicsToCreate = [
  { name: 'DEFI', memo: 'Vera DeFi Analysis' },
  { name: 'BRIDGE', memo: 'Vera Cross-Agent Bridge' },
  { name: 'ENERGY', memo: 'Vera Energy Audits' }
];

async function createTopic(name, memo) {
  try {
    console.log(`Creating ${name} topic...`);
    
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .execute(client);
    
    const receipt = await tx.getReceipt(client);
    const topicId = receipt.topicId.toString();
    
    console.log(`✅ ${name} Topic Created: ${topicId}`);
    console.log(`   🔗 https://hashscan.io/mainnet/topic/${topicId}\n`);
    
    return topicId;
  } catch (error) {
    console.error(`❌ Failed to create ${name}: ${error.message}\n`);
    return null;
  }
}

async function main() {
  const results = {};
  
  for (const { name, memo } of topicsToCreate) {
    results[name] = await createTopic(name, memo);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 TOPIC IDs:\n');
  Object.entries(results).forEach(([name, id]) => {
    if (id) console.log(`   ${name}: '${id}',`);
  });
  
  client.close();
}

main().catch(console.error);
