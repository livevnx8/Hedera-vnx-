/**
 * Create HCS Topics for Vera Retraining
 * 
 * Creates 3 topics on Hedera mainnet:
 * - Nerves: Training data ingestion
 * - Lungs: Training progress
 * - Memory: Model attestation
 */

import {
  Client,
  TopicCreateTransaction,
  PrivateKey
} from '@hashgraph/sdk';

// Get credentials from environment
const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';
const keyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

if (!keyStr) {
  console.error('❌ HEDERA_OPERATOR_PRIVATE_KEY not set');
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

console.log('\n🌐 Creating HCS Topics on', network.toUpperCase());
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

// Create the three topics
async function main() {
  const topics = {
    NERVES: await createTopic('NERVES', 'Vera Retraining - Data Ingestion'),
    LUNGS: await createTopic('LUNGS', 'Vera Retraining - Analysis Progress'),
    MEMORY: await createTopic('MEMORY', 'Vera Retraining - Model Attestation')
  };

  console.log('\n==============================');
  console.log('📋 TOPIC IDs (Save these!):');
  console.log('==============================');
  console.log(`NERVES:  ${topics.NERVES || 'FAILED'}`);
  console.log(`LUNGS:   ${topics.LUNGS || 'FAILED'}`);
  console.log(`MEMORY:  ${topics.MEMORY || 'FAILED'}`);
  console.log('==============================\n');

  // Save to file
  const fs = await import('fs');
  const config = {
    network,
    operatorId,
    topics,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync('hcs-topics.json', JSON.stringify(config, null, 2));
  console.log('💾 Topic IDs saved to hcs-topics.json');
}

main().catch(console.error);
