#!/usr/bin/env node
/**
 * Vera Creates Real McLaren HCS Topics - Fixed Key Handling
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, PrivateKey, TopicCreateTransaction } from '@hashgraph/sdk';

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
let privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const network = process.env.HEDERA_NETWORK || 'mainnet';

if (!accountId || !privateKey) {
  console.error('❌ Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY');
  process.exit(1);
}

// Remove 0x prefix if present
privateKey = privateKey.replace(/^0x/, '');

console.log('\n🏎️  VERA CREATING MCLAREN HCS TOPICS\n');
console.log(`🔑 Account: ${accountId}`);
console.log(`🌐 Network: ${network.toUpperCase()}`);
console.log(`🔐 Key Length: ${privateKey.length} chars`);
console.log('⏳ Connecting to Hedera...\n');

const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

// Try to parse the key - could be ED25519 or ECDSA
let key;
try {
  if (privateKey.length === 64) {
    // Try ECDSA first (common for EVM-compatible keys)
    try {
      key = PrivateKey.fromStringECDSA(privateKey);
      console.log('🔐 Using ECDSA key format');
    } catch {
      // Fall back to ED25519
      key = PrivateKey.fromStringED25519(privateKey);
      console.log('🔐 Using ED25519 key format');
    }
  } else {
    key = PrivateKey.fromString(privateKey);
    console.log('🔐 Using auto-detected key format');
  }
} catch (e) {
  console.error('❌ Failed to parse private key:', e.message);
  process.exit(1);
}

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
    'Vera-McLaren F1 Carbon Audit Reports'
  );
  
  await createTopic(
    'McLaren Season Summaries', 
    'Vera-McLaren F1 Season Summaries'
  );
  
  await createTopic(
    'McLaren Offset Retirement',
    'Vera-McLaren F1 Offset Retirement'
  );
  
  // Summary
  if (topics.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`           ${topics.length} MCLAREN VERA TOPICS CREATED`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Save to env
    const fs = await import('fs');
    let envAdd = '\n# McLaren Vera HCS Topics (Created: ' + new Date().toISOString() + ')\n';
    topics.forEach(t => {
      const envName = t.name.toUpperCase().replace(/ /g, '_') + '_TOPIC_ID';
      envAdd += `${envName}=${t.topicId}\n`;
    });
    
    fs.appendFileSync('.env', envAdd);
    console.log('💾 Saved to .env');
  } else {
    console.log('❌ No topics were created');
  }
  
  client.close();
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  client.close();
  process.exit(1);
});
