#!/usr/bin/env node
/**
 * Vera Creates Real McLaren HCS Topics
 * Uses Hedera SDK to create actual topics on mainnet
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, PrivateKey, TopicCreateTransaction } from '@hashgraph/sdk';

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const network = process.env.HEDERA_NETWORK || 'mainnet';

if (!accountId || !privateKey) {
  console.error('❌ Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY in .env');
  process.exit(1);
}

console.log('\n🏎️  VERA CREATING MCLAREN HCS TOPICS\n');
console.log(`🔑 Account: ${accountId}`);
console.log(`🌐 Network: ${network.toUpperCase()}`);
console.log('⏳ Connecting to Hedera...\n');

const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
const key = PrivateKey.fromString(privateKey);
client.setOperator(accountId, key);

const topics = [];

async function createTopic(name, memo) {
  try {
    console.log(`📊 Creating: ${name}`);
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .execute(client);
    
    const receipt = await tx.getReceipt(client);
    const topicId = receipt.topicId.toString();
    
    console.log(`   ✅ Topic ID: ${topicId}`);
    console.log(`   🔗 HashScan: https://hashscan.io/${network}/topic/${topicId}\n`);
    
    topics.push({ name, topicId, memo });
    return topicId;
  } catch (e) {
    console.error(`   ❌ Failed: ${e.message}\n`);
    return null;
  }
}

async function main() {
  // Create McLaren Vera Topics
  await createTopic(
    'McLaren Carbon Audit Reports',
    'Vera-McLaren F1 Carbon Audit Reports - Race emission records'
  );
  
  await createTopic(
    'McLaren Season Summaries', 
    'Vera-McLaren F1 Season Summaries - Annual carbon performance'
  );
  
  await createTopic(
    'McLaren Offset Retirement',
    'Vera-McLaren F1 Carbon Offset Retirement Records'
  );
  
  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('           MCLAREN VERA TOPICS CREATED');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  for (const t of topics) {
    console.log(`${t.name}:`);
    console.log(`   Topic ID: ${t.topicId}`);
    console.log(`   HashScan: https://hashscan.io/${network}/topic/${t.topicId}\n`);
  }
  
  // Save to env
  const fs = await import('fs');
  let envAdd = '\n# McLaren Vera HCS Topics (Created: ' + new Date().toISOString() + ')\n';
  topics.forEach(t => {
    const envName = t.name.toUpperCase().replace(/ /g, '_').replace(/-/g, '_') + '_TOPIC_ID';
    envAdd += `${envName}=${t.topicId}\n`;
  });
  
  fs.appendFileSync('.env', envAdd);
  console.log('💾 Saved to .env');
  
  client.close();
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  client.close();
  process.exit(1);
});
