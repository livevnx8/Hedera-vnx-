#!/usr/bin/env node
/**
 * Create HCS Topic for Falcon Handshakes
 */

import { Client, TopicCreateTransaction, PrivateKey } from '@hashgraph/sdk';

const operatorId = process.env.HEDERA_OPERATOR_ID;
const operatorKey = process.env.HEDERA_OPERATOR_KEY;

if (!operatorId || !operatorKey) {
  console.error('❌ Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY env vars');
  process.exit(1);
}

const client = Client.forMainnet();

let privateKey;
if (operatorKey.length === 64 || operatorKey.length === 66) {
  // Try ECDSA first (most common)
  try {
    privateKey = PrivateKey.fromStringECDSA(operatorKey);
  } catch {
    // Fallback to ED25519
    privateKey = PrivateKey.fromStringED25519(operatorKey);
  }
} else {
  privateKey = PrivateKey.fromString(operatorKey);
}

client.setOperator(operatorId, privateKey);

console.log('🦅 Creating HCS Topic for Falcon Handshakes...\n');

const tx = new TopicCreateTransaction()
  .setTopicMemo('QVX Falcon Handshake Protocol - Post-Quantum Authentication')
  .setSubmitKey(privateKey);

try {
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  
  console.log('✅ Topic Created!');
  console.log(`   Topic ID: ${receipt.topicId.toString()}`);
  console.log('   Update the topicId in vera-qvx-falcon-handshake.mjs with this ID');
  
  client.close();
  process.exit(0);
} catch (error) {
  console.error('❌ Failed:', error.message);
  client.close();
  process.exit(1);
}
