#!/usr/bin/env node
/**
 * HCS Topic Test - Verify topics exist and can receive messages
 */

import { Client, PrivateKey, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const TOPICS = {
  CORE: '0.0.10409351',
  ENERGY: '0.0.10412579',
  DEFI: '0.0.10412577',
  SECURITY: '0.0.10409355',
  BRIDGE: '0.0.10412578'
};

async function testTopic(topicId, name) {
  console.log(`\n🧪 Testing ${name} (${topicId})...`);
  
  try {
    const client = Client.forMainnet();
    const keyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
    
    let privateKey;
    if (keyStr.length === 64) {
      try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
      catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
    } else {
      privateKey = PrivateKey.fromString(keyStr);
    }
    
    client.setOperator(process.env.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
    
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify({
        type: 'TEST_MESSAGE',
        timestamp: Date.now(),
        test: true
      }))
      .execute(client);
    
    const receipt = await tx.getReceipt(client);
    const sequence = receipt.topicSequenceNumber?.toString();
    
    console.log(`✅ SUCCESS! Sequence: ${sequence}`);
    console.log(`🔗 https://hashscan.io/mainnet/topic/${topicId}/${sequence}`);
    
    client.close();
    return true;
    
  } catch (error) {
    console.error(`❌ FAILED: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  HCS TOPIC VERIFICATION TEST');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Account: ${process.env.HEDERA_OPERATOR_ACCOUNT_ID}`);
  
  let passed = 0;
  let failed = 0;
  
  for (const [name, topicId] of Object.entries(TOPICS)) {
    const success = await testTopic(topicId, name);
    if (success) passed++;
    else failed++;
    
    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════');
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
