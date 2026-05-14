/**
 * Create Vera Payment Orchestration Topics
 * 
 * Creates 4 topics on Hedera:
 * - Registry: Agent registration
 * - Task: Task assignment queue
 * - Result: Task results
 * - Audit: Payment audit log
 */

import dotenv from 'dotenv';
dotenv.config();

import {
  Client,
  TopicCreateTransaction,
  PrivateKey
} from '@hashgraph/sdk';
import fs from 'fs';

// Get credentials from environment
const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const keyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

if (!operatorId || !keyStr) {
  console.error('❌ HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY must be set');
  process.exit(1);
}

// Parse private key
let privateKey;
if (keyStr.length === 64) {
  try {
    privateKey = PrivateKey.fromStringECDSA(keyStr);
    console.log('🔑 Using ECDSA key');
  } catch {
    privateKey = PrivateKey.fromStringED25519(keyStr);
    console.log('🔑 Using Ed25519 key');
  }
} else {
  privateKey = PrivateKey.fromString(keyStr);
}

// Setup client
const network = process.env.HEDERA_NETWORK || 'mainnet';
const client = network === 'mainnet' 
  ? Client.forMainnet()
  : Client.forTestnet();
client.setOperator(operatorId, privateKey);

console.log('\n🌐 Creating Vera Payment Topics on', network.toUpperCase());
console.log('Operator:', operatorId);
console.log('==============================\n');

async function createTopic(name, memo) {
  try {
    console.log(`📡 Creating ${name} topic...`);
    
    const transaction = new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setAdminKey(privateKey.publicKey)
      .setSubmitKey(privateKey.publicKey);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    const topicId = receipt.topicId.toString();

    console.log(`✅ ${name} created: ${topicId}`);
    console.log(`   HashScan: https://hashscan.io/${network}/topic/${topicId}\n`);
    
    return topicId;
  } catch (error) {
    console.error(`❌ Failed to create ${name}:`, error.message);
    return null;
  }
}

// Create the four payment topics
async function main() {
  const topics = {
    REGISTRY: await createTopic('REGISTRY', 'Vera Payment - Agent Registry'),
    TASK: await createTopic('TASK', 'Vera Payment - Task Queue'),
    RESULT: await createTopic('RESULT', 'Vera Payment - Task Results'),
    AUDIT: await createTopic('AUDIT', 'Vera Payment - Audit Log')
  };

  console.log('\n==============================');
  console.log('📋 TOPIC IDs (Save these!):');
  console.log('==============================');
  console.log(`VERA_REGISTRY_TOPIC_ID=${topics.REGISTRY || 'FAILED'}`);
  console.log(`VERA_TASK_TOPIC_ID=${topics.TASK || 'FAILED'}`);
  console.log(`VERA_RESULT_TOPIC_ID=${topics.RESULT || 'FAILED'}`);
  console.log(`VERA_AUDIT_TOPIC_ID=${topics.AUDIT || 'FAILED'}`);
  console.log('==============================\n');

  // Save to file
  const config = {
    network,
    operatorId,
    topics,
    createdAt: new Date().toISOString(),
    hashscanUrls: {
      registry: topics.REGISTRY ? `https://hashscan.io/${network}/topic/${topics.REGISTRY}` : null,
      task: topics.TASK ? `https://hashscan.io/${network}/topic/${topics.TASK}` : null,
      result: topics.RESULT ? `https://hashscan.io/${network}/topic/${topics.RESULT}` : null,
      audit: topics.AUDIT ? `https://hashscan.io/${network}/topic/${topics.AUDIT}` : null,
    }
  };
  fs.writeFileSync('vera-payment-topics.json', JSON.stringify(config, null, 2));
  console.log('💾 Topic IDs saved to vera-payment-topics.json');
  console.log('\n👉 Add these to your .env file to use them!');
}

main().catch(console.error);
