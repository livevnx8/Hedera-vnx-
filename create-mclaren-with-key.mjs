#!/usr/bin/env node
/**
 * Create McLaren Topics with Updated Key
 * Run this after updating .env with correct private key
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, PrivateKey, TopicCreateTransaction, AccountBalanceQuery } from '@hashgraph/sdk';

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const network = process.env.HEDERA_NETWORK || 'mainnet';

console.log('\n🏎️  VERA: Creating McLaren Topics\n');

if (!accountId || !privateKey) {
  console.error('❌ Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY in .env');
  process.exit(1);
}

console.log(`🔑 Account: ${accountId}`);
console.log(`🌐 Network: ${network.toUpperCase()}`);

// Parse key
let key;
try {
  if (privateKey.length === 64) {
    key = PrivateKey.fromStringECDSA(privateKey);
    console.log('🔐 Key type: ECDSA');
  } else {
    key = PrivateKey.fromString(privateKey);
    console.log('🔐 Key type: Auto-detected');
  }
} catch (e) {
  console.error('❌ Cannot parse private key:', e.message);
  process.exit(1);
}

const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

try {
  client.setOperator(accountId, key);
  
  // Test connection
  const balance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(client);
  
  console.log(`💰 Balance: ${balance.hbars.toString()}`);
  console.log('✅ Connected successfully!\n');
  
} catch (e) {
  console.error(`❌ Connection failed: ${e.message}`);
  client.close();
  process.exit(1);
}

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
    console.log(`   🔗 https://hashscan.io/${network}/topic/${topicId}\n`);
    
    topics.push({ name, topicId });
    return topicId;
  } catch (e) {
    console.error(`   ❌ Failed: ${e.message}\n`);
    return null;
  }
}

// Create topics
await createTopic('McLaren Carbon Audit Reports', 'Vera-McLaren F1 Carbon Audit');
await createTopic('McLaren Season Summaries', 'Vera-McLaren F1 Season Summary');
await createTopic('McLaren Offset Retirement', 'Vera-McLaren F1 Offset Retirement');

if (topics.length > 0) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`     ✅ ${topics.length} MCLAREN TOPICS CREATED`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const fs = await import('fs');
  let envContent = '\n# McLaren Vera Topics - ' + new Date().toISOString() + '\n';
  topics.forEach(t => {
    const envVar = 'MCLAREN_' + t.name.toUpperCase().replace(/ /g, '_') + '_TOPIC_ID';
    envContent += `${envVar}=${t.topicId}\n`;
  });
  fs.appendFileSync('.env', envContent);
  
  console.log('💾 Saved to .env\n');
  console.log('📋 Topic Summary:');
  topics.forEach(t => {
    console.log(`  ${t.name}: ${t.topicId}`);
  });
  console.log('');
}

client.close();
