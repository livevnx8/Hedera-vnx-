#!/usr/bin/env node
/**
 * Vera Creates McLaren Topics - WORKING VERSION
 * Uses correct key handling for the actual account
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, PrivateKey, TopicCreateTransaction, AccountId } from '@hashgraph/sdk';

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
let privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
let network = process.env.HEDERA_NETWORK || 'mainnet';

if (!accountId || !privateKey) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

// Clean key
privateKey = privateKey.trim().replace(/^0x/, '');

console.log('\n🏎️  VERA CREATING MCLAREN HCS TOPICS\n');
console.log(`🔑 Account: ${accountId}`);

// Try testnet first (account might be on testnet)
console.log('🔄 Trying TESTNET first...\n');
network = 'testnet';

const client = Client.forTestnet();

let key;
try {
  // Try ED25519 first (most common)
  key = PrivateKey.fromStringED25519(privateKey);
  console.log('🔐 Using ED25519 key');
} catch {
  try {
    // Try ECDSA
    key = PrivateKey.fromStringECDSA(privateKey);
    console.log('🔐 Using ECDSA key');
  } catch {
    console.error('❌ Cannot parse key - must be 64 or 96 hex chars');
    process.exit(1);
  }
}

try {
  client.setOperator(accountId, key);
  console.log('✅ Connected to TESTNET\n');
} catch (e) {
  console.error('❌ Failed to set operator:', e.message);
  process.exit(1);
}

const topics = [];

async function createTopic(name, memo) {
  try {
    console.log(`📊 Creating: ${name}`);
    
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setAdminKey(key.publicKey)
      .setSubmitKey(key.publicKey)
      .freezeWith(client);
    
    const signed = await tx.sign(key);
    const response = await signed.execute(client);
    const receipt = await response.getReceipt(client);
    
    const topicId = receipt.topicId.toString();
    console.log(`   ✅ Topic ID: ${topicId}`);
    console.log(`   🔗 https://hashscan.io/testnet/topic/${topicId}\n`);
    
    topics.push({ name, topicId, memo });
    return topicId;
  } catch (e) {
    console.error(`   ❌ ${e.message}\n`);
    return null;
  }
}

async function main() {
  await createTopic('McLaren Carbon Audit Reports', 'Vera-McLaren F1 Carbon Audit');
  await createTopic('McLaren Season Summaries', 'Vera-McLaren F1 Season Summary');
  await createTopic('McLaren Offset Retirement', 'Vera-McLaren F1 Offset Retirement');
  
  if (topics.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`           ✅ ${topics.length} TOPICS CREATED ON TESTNET`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const fs = await import('fs');
    let envAdd = '\n# McLaren Topics (TESTNET - ' + new Date().toISOString() + ')\n';
    envAdd += 'HEDERA_NETWORK=testnet\n';
    topics.forEach(t => {
      const envName = 'MCLAREN_' + t.name.toUpperCase().replace(/ /g, '_') + '_TOPIC_ID';
      envAdd += `${envName}=${t.topicId}\n`;
    });
    fs.appendFileSync('.env', envAdd);
    
    console.log('💾 Saved to .env\n');
    console.log('📋 Copy these to use:');
    topics.forEach(t => {
      console.log(`  ${t.name}: ${t.topicId}`);
    });
    console.log('');
  } else {
    console.log('\n❌ Failed to create topics');
    console.log('💡 The key may not match this account on testnet either');
    console.log('   Try creating topics manually via HashScan wallet\n');
  }
  
  client.close();
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  client.close();
});
