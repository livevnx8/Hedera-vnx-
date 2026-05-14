#!/usr/bin/env node
/**
 * Create McLaren Vera HCS Topic - Single Topic
 */

import dotenv from 'dotenv';
dotenv.config();

const { Client, PrivateKey, TopicCreateTransaction } = await import('@hashgraph/sdk');

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const network = process.env.HEDERA_NETWORK || 'mainnet';

if (!accountId || !privateKey) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

console.log(`🌐 Using ${network} with account ${accountId}`);
console.log('⏳ Creating McLaren Vera Carbon Audit topic...\n');

const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
const key = PrivateKey.fromString(privateKey);
client.setOperator(accountId, key);

try {
  const tx = await new TopicCreateTransaction()
    .setTopicMemo('Vera-McLaren F1 Carbon Audit Reports - Created 2026-03-30')
    .execute(client);
  
  const receipt = await tx.getReceipt(client);
  const topicId = receipt.topicId.toString();
  
  console.log('✅ SUCCESS!');
  console.log(`📊 Topic ID: ${topicId}`);
  console.log(`🔗 HashScan: https://hashscan.io/${network}/topic/${topicId}`);
  console.log(`
💾 Add to .env:`);
  console.log(`MCLAREN_CARBON_TOPIC_ID=${topicId}`);
  
  // Save to a file
  const fs = await import('fs');
  fs.appendFileSync('.env', `\n# McLaren Vera Topic (Created: ${new Date().toISOString()})\n`);
  fs.appendFileSync('.env', `MCLAREN_CARBON_TOPIC_ID=${topicId}\n`);
  console.log('📁 Saved to .env');
  
} catch (e) {
  console.error('❌ Error:', e.message);
  process.exit(1);
} finally {
  client.close();
}
