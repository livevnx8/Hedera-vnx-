#!/usr/bin/env node
/**
 * Create McLaren Topics on TESTNET
 * Uses testnet which may have the account
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, PrivateKey, TopicCreateTransaction } from '@hashgraph/sdk';

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
let privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY?.replace(/^0x/, '');

console.log('\n🏎️  VERA: Creating McLaren Topics on TESTNET\n');

if (!accountId || !privateKey) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

const client = Client.forTestnet();

let key;
try {
  key = PrivateKey.fromStringED25519(privateKey);
} catch {
  key = PrivateKey.fromStringECDSA(privateKey);
}

try {
  client.setOperator(accountId, key);
  console.log('✅ Connected to TESTNET\n');
} catch (e) {
  console.error('❌ Connection failed:', e.message);
  process.exit(1);
}

// Create one topic first as a test
console.log('📊 Creating: McLaren Carbon Audit Reports...');

try {
  const tx = await new TopicCreateTransaction()
    .setTopicMemo('Vera-McLaren F1 Carbon Audit Reports')
    .execute(client);
  
  const receipt = await tx.getReceipt(client);
  const topicId = receipt.topicId.toString();
  
  console.log(`✅ SUCCESS!`);
  console.log(`📊 Topic ID: ${topicId}`);
  console.log(`🔗 https://hashscan.io/testnet/topic/${topicId}\n`);
  
  // Save it
  const fs = await import('fs');
  fs.appendFileSync('.env', `\n# McLaren Topic (TESTNET)\nMCLAREN_CARBON_TOPIC_ID=${topicId}\n`);
  console.log('💾 Saved to .env');
  
} catch (e) {
  console.error(`❌ Failed: ${e.message}`);
  console.log('\n💡 The account/key may not exist on testnet either');
  console.log('   Create a new testnet account at:');
  console.log('   https://portal.hedera.com/\n');
}

client.close();
