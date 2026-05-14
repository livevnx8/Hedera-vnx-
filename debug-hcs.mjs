import { TopicMessageSubmitTransaction, Client, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 DEBUG: HCS Message Test\n');

// Check env vars
console.log('Account ID:', process.env.HEDERA_OPERATOR_ACCOUNT_ID ? '✓ Set' : '✗ Missing');
console.log('Private Key:', process.env.HEDERA_OPERATOR_PRIVATE_KEY ? '✓ Set' : '✗ Missing');

const client = Client.forMainnet();
const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const pk = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

if (!accountId || !pk) {
  console.error('❌ Missing credentials!');
  process.exit(1);
}

let privateKey;
if (pk.length === 64) {
  try { 
    privateKey = PrivateKey.fromStringECDSA(pk); 
    console.log('Key type: ECDSA');
  }
  catch { 
    privateKey = PrivateKey.fromStringED25519(pk); 
    console.log('Key type: ED25519');
  }
} else {
  privateKey = PrivateKey.fromString(pk);
  console.log('Key type: Auto');
}

client.setOperator(accountId, privateKey);
console.log('Client initialized ✓\n');

// Test topic - Swarm Consensus
const topicId = '0.0.10416098';
console.log(`Sending to topic: ${topicId}`);

async function testSend() {
  try {
    const message = JSON.stringify({
      type: 'TEST',
      timestamp: Date.now(),
      data: 'Debug message'
    });

    console.log('Submitting transaction...');
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);

    console.log('Getting receipt...');
    const receipt = await tx.getReceipt(client);
    
    console.log(`\n✅ SUCCESS!`);
    console.log(`   Sequence: ${receipt.topicSequenceNumber}`);
    console.log(`   Topic: ${topicId}`);
    console.log(`\n🔗 Check: https://hashscan.io/mainnet/topic/${topicId}`);
    
  } catch (err) {
    console.error(`\n❌ FAILED: ${err.message}`);
    console.error(err);
  }
}

testSend();
