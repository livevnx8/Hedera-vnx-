import { TopicMessageSubmitTransaction, Client, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const client = Client.forMainnet();
const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const pk = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

if (accountId && pk) {
  let privateKey;
  if (pk.length === 64) {
    try { privateKey = PrivateKey.fromStringECDSA(pk); }
    catch { privateKey = PrivateKey.fromStringED25519(pk); }
  } else {
    privateKey = PrivateKey.fromString(pk);
  }
  client.setOperator(accountId, privateKey);
}

// Topics that had no messages
const emptyTopics = [
  ['Fed Heartbeat', '0.0.10416136'],
  ['Swarm State', '0.0.10416097'],
  ['Swarm Meet', '0.0.10416100'],
  ['Payments', '0.0.10416193'],
  ['DeFi Intel', '0.0.10416145'],
  ['Carbon', '0.0.10416155'],
  ['Compliance', '0.0.10416164'],
  ['Learning', '0.0.10416181'],
];

async function sendToTopic(name, topicId) {
  try {
    const message = JSON.stringify({
      type: 'POPULATE',
      timestamp: Date.now(),
      agentId: 'vera-system',
      data: `Populating ${name}`,
      note: 'ABFT consensus active'
    });

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);

    const receipt = await tx.getReceipt(client);
    console.log(`✅ ${name} (${topicId}): Seq #${receipt.topicSequenceNumber}`);
    await new Promise(r => setTimeout(r, 800));
  } catch (err) {
    console.error(`❌ ${name} (${topicId}): ${err.message}`);
  }
}

console.log('🚀 POPULATING EMPTY HCS TOPICS...\n');

for (const [name, id] of emptyTopics) {
  await sendToTopic(name, id);
}

console.log('\n✅ DONE! Check Hashscan now:');
console.log('https://hashscan.io/mainnet/topic/0.0.10416136');
console.log('https://hashscan.io/mainnet/topic/0.0.10416097');
console.log('https://hashscan.io/mainnet/topic/0.0.10416100');
console.log('https://hashscan.io/mainnet/topic/0.0.10416193');
console.log('https://hashscan.io/mainnet/topic/0.0.10416145');

process.exit(0);
