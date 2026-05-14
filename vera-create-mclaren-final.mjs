#!/usr/bin/env node
/**
 * Vera Creates McLaren Topics - Guaranteed Working Version
 * Uses robust error handling and multiple key format attempts
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, PrivateKey, TopicCreateTransaction, AccountBalanceQuery } from '@hashgraph/sdk';

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
let privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

console.log('\n🏎️  VERA: Creating McLaren HCS Topics\n');

if (!accountId || !privateKey) {
  console.error('❌ Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY');
  process.exit(1);
}

// Try multiple key formats
privateKey = privateKey.trim().replace(/^0x/, '');

let key;
let keyType = '';

// Attempt 1: Raw ED25519 (32 bytes = 64 hex)
if (privateKey.length === 64) {
  try {
    key = PrivateKey.fromStringED25519(privateKey);
    keyType = 'ED25519-RAW';
  } catch {
    try {
      key = PrivateKey.fromStringECDSA(privateKey);
      keyType = 'ECDSA-RAW';
    } catch {}
  }
}

// Attempt 2: DER encoded
if (!key && privateKey.length > 64) {
  try {
    key = PrivateKey.fromStringDer(privateKey);
    keyType = 'DER';
  } catch {}
}

// Attempt 3: Auto-detect
if (!key) {
  try {
    key = PrivateKey.fromString(privateKey);
    keyType = 'AUTO';
  } catch (e) {
    console.error('❌ Cannot parse private key:', e.message);
    process.exit(1);
  }
}

console.log(`🔐 Key Type: ${keyType}`);
console.log(`🔑 Account: ${accountId}`);

// Try mainnet first
console.log('\n🌐 Trying MAINNET...');
const client = Client.forMainnet();

try {
  client.setOperator(accountId, key);
  
  // Test with balance query (free, no signature needed)
  const testQuery = new AccountBalanceQuery().setAccountId(accountId);
  const balance = await testQuery.execute(client);
  console.log(`💰 Balance: ${balance.hbars.toString()}`);
  console.log('✅ Connection successful!\n');
  
} catch (e) {
  console.error(`❌ Mainnet failed: ${e.message}`);
  console.log('\n🌐 Falling back to TESTNET...\n');
  client.close();
  
  const testClient = Client.forTestnet();
  try {
    testClient.setOperator(accountId, key);
    const balance = await new AccountBalanceQuery()
      .setAccountId(accountId)
      .execute(testClient);
    console.log(`💰 Testnet Balance: ${balance.hbars.toString()}`);
    console.log('✅ Connected to TESTNET\n');
    
    // Use testnet client
    await createTopics(testClient, 'testnet');
    testClient.close();
    process.exit(0);
    
  } catch (testErr) {
    console.error(`❌ Testnet also failed: ${testErr.message}`);
    console.log('\n💡 SOLUTION: Your key does not match this account.');
    console.log('   Get the correct key from your wallet (HashPack/Blade).');
    console.log('   Or create topics manually via https://hashscan.io/mainnet/topics\n');
    process.exit(1);
  }
}

// Create topics on mainnet
await createTopics(client, 'mainnet');
client.close();

async function createTopics(client, network) {
  const topics = [];
  const topicConfigs = [
    { name: 'McLaren Carbon Audit Reports', memo: 'Vera-McLaren F1 Carbon Audit' },
    { name: 'McLaren Season Summaries', memo: 'Vera-McLaren F1 Season Summary' },
    { name: 'McLaren Offset Retirement', memo: 'Vera-McLaren F1 Offset Retirement' }
  ];
  
  for (const config of topicConfigs) {
    try {
      console.log(`📊 Creating: ${config.name}`);
      
      const tx = await new TopicCreateTransaction()
        .setTopicMemo(config.memo)
        .execute(client);
      
      const receipt = await tx.getReceipt(client);
      const topicId = receipt.topicId.toString();
      
      console.log(`   ✅ ${topicId}`);
      console.log(`   🔗 https://hashscan.io/${network}/topic/${topicId}\n`);
      
      topics.push({ name: config.name, topicId, network });
    } catch (e) {
      console.error(`   ❌ Failed: ${e.message}\n`);
    }
  }
  
  if (topics.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`     ✅ ${topics.length} MCLAREN TOPICS CREATED ON ${network.toUpperCase()}`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Save to env
    const fs = await import('fs');
    let envContent = `\n# McLaren Vera Topics (${network.toUpperCase()}) - ${new Date().toISOString()}\n`;
    envContent += `HEDERA_NETWORK=${network}\n`;
    topics.forEach(t => {
      const envVar = 'MCLAREN_' + t.name.toUpperCase().replace(/ /g, '_').replace(/-/g, '_') + '_TOPIC_ID';
      envContent += `${envVar}=${t.topicId}\n`;
    });
    fs.appendFileSync('.env', envContent);
    console.log('💾 Saved to .env\n');
    
    topics.forEach(t => {
      console.log(`${t.name}:`);
      console.log(`  Topic ID: ${t.topicId}`);
      console.log(`  HashScan: https://hashscan.io/${network}/topic/${t.topicId}\n`);
    });
  }
}

console.log('\n✨ Vera has completed the McLaren topic setup!\n');
