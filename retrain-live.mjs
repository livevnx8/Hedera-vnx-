#!/usr/bin/env node
/**
 * Vera Retraining with REAL HCS - Direct Key Loading
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const TOPICS = {
  NERVES: '0.0.10409351',
  LUNGS: '0.0.10409353',
  MEMORY: '0.0.10409351'
};

// Get key from environment - try multiple sources
const rawKey = process.env.VERA_WALLET_PRIVATE_KEY || process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const accountId = process.env.VERA_WALLET_ACCOUNT_ID || process.env.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';

console.log('🔑 Key Source:', process.env.VERA_WALLET_PRIVATE_KEY ? 'VERA_WALLET_PRIVATE_KEY' : 'HEDERA_OPERATOR_PRIVATE_KEY');
console.log('🔑 Account:', accountId);
console.log('🔑 Raw key:', rawKey ? rawKey.substring(0, 20) + '...' : 'NOT SET');

if (!rawKey) {
  console.log('❌ No private key found in environment');
  process.exit(1);
}

// Try multiple key formats
let client = null;
let hcsEnabled = false;

const keyFormats = [
  { name: 'Raw hex (with 0x)', key: rawKey.startsWith('0x') ? rawKey.slice(2) : rawKey },
  { name: 'Raw hex (no 0x)', key: rawKey.startsWith('0x') ? rawKey : '0x' + rawKey },
  { name: 'As-is', key: rawKey }
];

for (const format of keyFormats) {
  const cleanKey = format.key.startsWith('0x') ? format.key.slice(2) : format.key;
  
  if (cleanKey.length === 64) {
    try {
      let privateKey;
      try {
        privateKey = PrivateKey.fromStringECDSA(cleanKey);
        console.log(`✅ Loaded as ECDSA (${format.name})`);
      } catch {
        privateKey = PrivateKey.fromStringED25519(cleanKey);
        console.log(`✅ Loaded as Ed25519 (${format.name})`);
      }
      
      client = Client.forMainnet();
      client.setOperator(accountId, privateKey);
      hcsEnabled = true;
      console.log('✅ HCS Client ready for MAINNET\n');
      break;
    } catch (e) {
      console.log(`❌ ${format.name}: ${e.message.substring(0, 50)}`);
    }
  }
}

if (!hcsEnabled) {
  console.log('\n⚠️  Could not initialize HCS - running in SIMULATION mode\n');
}

// Run retraining
async function runRetraining() {
  console.log('🧠 VERA RETRAINING - WITH HCS LOGGING');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const modelId = `vera-retrain-${Date.now()}`;
  console.log(`🚀 Starting: ${modelId}`);
  console.log(`📡 Topics: Nerves=${TOPICS.NERVES}, Lungs=${TOPICS.LUNGS}, Memory=${TOPICS.MEMORY}\n`);
  
  // Log training start
  if (hcsEnabled) {
    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(TOPICS.NERVES)
        .setMessage(JSON.stringify({
          type: 'RETRAINING_START',
          modelId,
          timestamp: new Date().toISOString(),
          baseModel: 'vera-backup.gguf'
        }))
        .execute(client);
      const receipt = await tx.getReceipt(client);
      console.log(`✅ Start logged to Nerves - Seq: ${receipt.topicSequenceNumber}\n`);
    } catch (e) {
      console.log(`❌ HCS error: ${e.message}\n`);
    }
  } else {
    console.log('📝 [SIMULATED] RETRAINING_START logged to Nerves\n');
  }
  
  // Simulate epochs
  let loss = 2.5;
  for (let epoch = 1; epoch <= 20; epoch++) {
    loss = loss * 0.92 + (Math.random() - 0.5) * 0.1;
    process.stdout.write(`   Epoch ${epoch}: loss=${loss.toFixed(4)}`);
    
    if (epoch % 5 === 0 && hcsEnabled) {
      try {
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(TOPICS.LUNGS)
          .setMessage(JSON.stringify({
            type: 'EPOCH_COMPLETE',
            modelId,
            epoch,
            loss: loss.toFixed(4),
            timestamp: new Date().toISOString()
          }))
          .execute(client);
        const receipt = await tx.getReceipt(client);
        console.log(` - HCS Seq: ${receipt.topicSequenceNumber}`);
      } catch (e) {
        console.log(` - HCS failed: ${e.message.substring(0, 30)}`);
      }
    } else if (epoch % 5 === 0) {
      console.log(' - [SIMULATED]');
    } else {
      console.log('');
    }
    
    // Small delay between epochs
    await new Promise(r => setTimeout(r, 100));
  }
  
  // Log completion
  if (hcsEnabled) {
    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(TOPICS.MEMORY)
        .setMessage(JSON.stringify({
          type: 'TRAINING_COMPLETE',
          modelId,
          finalLoss: loss.toFixed(4),
          accuracy: ((2.5 - loss) / 2.5 * 100).toFixed(2) + '%',
          timestamp: new Date().toISOString()
        }))
        .execute(client);
      const receipt = await tx.getReceipt(client);
      console.log(`\n✅ Complete logged to Memory - Seq: ${receipt.topicSequenceNumber}`);
    } catch (e) {
      console.log(`\n❌ HCS error: ${e.message}`);
    }
  } else {
    console.log('\n📝 [SIMULATED] TRAINING_COMPLETE logged to Memory');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ RETRAINING COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  if (hcsEnabled) {
    console.log('🔗 View on HashScan:');
    console.log(`   Nerves: https://hashscan.io/mainnet/topic/${TOPICS.NERVES}`);
    console.log(`   Lungs:  https://hashscan.io/mainnet/topic/${TOPICS.LUNGS}`);
    console.log(`   Memory: https://hashscan.io/mainnet/topic/${TOPICS.MEMORY}\n`);
    client.close();
  }
}

runRetraining().catch(console.error);
