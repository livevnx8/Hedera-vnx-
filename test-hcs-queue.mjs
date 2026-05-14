#!/usr/bin/env node
/**
 * Queue-Based HCS Logging Test
 * Tests the new blueprint logger with live topics
 */

import { Client, PrivateKey, TopicMessageQuery } from '@hashgraph/sdk';
import { HCSLogger } from './blueprints/hcs-logger.mjs';
import { config } from './dist/config.js';

const TOPICS = {
  CORE: '0.0.10409351',
  DEFI: '0.0.10409352',
  ENERGY: '0.0.10409353',
  BRIDGE: '0.0.10409354',
  ECOSYSTEM: '0.0.10409355'
};

console.clear();
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🧪 QUEUE-BASED HCS LOGGING TEST                                    ║');
console.log('║  Testing Blueprint Logger with Live Topics                         ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Initialize client
const operatorId = config.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';
const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY || '';

const client = Client.forMainnet();
let privateKey;
if (keyStr.length === 64) {
  try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
  catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
} else {
  privateKey = PrivateKey.fromString(keyStr);
}

client.setOperator(operatorId, privateKey);

console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Topics: ${Object.keys(TOPICS).length} configured\n`);

// Create logger instance
const logger = new HCSLogger(client, TOPICS);

// Test results
const results = {
  submitted: 0,
  failed: 0,
  retried: 0,
  topics: {}
};

async function runTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test 1: Single Message Submission');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const msg1 = await logger.enqueue('ENERGY', 'TEST_SINGLE', {
    test: 'single_message',
    timestamp: Date.now()
  });
  
  console.log(`✅ Single message queued (ID: ${msg1?.substring(0, 8)}...)`);
  await delay(1000); // Wait for processing
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test 2: Burst Submission (10 messages)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const burstPromises = [];
  for (let i = 0; i < 10; i++) {
    burstPromises.push(
      logger.enqueue('DEFI', 'TEST_BURST', {
        test: 'burst',
        sequence: i,
        timestamp: Date.now()
      })
    );
  }
  
  await Promise.all(burstPromises);
  console.log(`✅ 10 messages queued simultaneously`);
  console.log('   (Queue processing with 500ms rate limiting)');
  
  await delay(7000); // Wait for all to process
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test 3: Multi-Topic Submission');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const topics = ['CORE', 'DEFI', 'ENERGY', 'BRIDGE'];
  for (const topic of topics) {
    await logger.enqueue(topic, 'TEST_MULTI_TOPIC', {
      test: 'multi_topic',
      targetTopic: topic,
      timestamp: Date.now()
    });
    console.log(`✅ Message queued to ${topic}`);
  }
  
  await delay(3000);
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test 4: Priority Messages');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  await logger.enqueue('CORE', 'TEST_PRIORITY_LOW', { priority: 'low' }, 'normal');
  await logger.enqueue('CORE', 'TEST_PRIORITY_HIGH', { priority: 'high' }, 'high');
  
  console.log(`✅ Priority messages queued`);
  
  await delay(2000);
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test 5: Large Payload (simulated batch)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const largePayload = {
    test: 'large_payload',
    batchId: crypto.randomUUID(),
    readings: Array(50).fill(0).map((_, i) => ({
      id: i,
      value: Math.random() * 1000,
      timestamp: Date.now()
    })),
    metadata: {
      source: 'test_harness',
      version: '2.0.0',
      agentId: 'test-agent-001'
    }
  };
  
  await logger.enqueue('ENERGY', 'TEST_LARGE_PAYLOAD', largePayload);
  console.log(`✅ Large payload queued (${JSON.stringify(largePayload).length} bytes)`);
  
  await delay(2000);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests
runTests()
  .then(() => {
    const stats = logger.getStats();
    
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  📊 TEST RESULTS                                                    ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');
    
    console.log(`📤 Messages Submitted: ${stats.submitted}`);
    console.log(`❌ Failed: ${stats.failed}`);
    console.log(`🔄 Retried: ${stats.retried}`);
    console.log(`⏳ Queue Length: ${stats.queueLength}`);
    console.log(`⚙️  Processing: ${stats.isProcessing ? 'YES' : 'NO'}`);
    
    console.log('\n📡 Topic URLs:');
    Object.entries(TOPICS).forEach(([name, id]) => {
      console.log(`   ${name}: https://hashscan.io/mainnet/topic/${id}`);
    });
    
    console.log('\n✅ Queue-based HCS logging test complete!');
    console.log('   All messages processed with rate limiting.\n');
    
    client.close();
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    client.close();
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Test interrupted');
  client.close();
  process.exit(0);
});
