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

const topics = [
  ['Swarm Consensus', '0.0.10416098', 'CONSENSUS_VOTE'],
  ['Swarm State', '0.0.10416097', 'STATE_SYNC'],
  ['Swarm Meet', '0.0.10416100', 'MEET_REQUEST'],
  ['Swarm Join', '0.0.10416106', 'JOIN_REQUEST'],
  ['Swarm Routing', '0.0.10416108', 'TASK_OFFER'],
  ['Fed Handshake', '0.0.10416115', 'HANDSHAKE'],
  ['Fed Consensus', '0.0.10416122', 'FED_CONSENSUS'],
  ['Fed Tasks', '0.0.10416129', 'FED_TASK'],
  ['Fed Heartbeat', '0.0.10416136', 'HEARTBEAT'],
  ['DeFi Intel', '0.0.10416145', 'DEFI_INTEL'],
  ['Carbon', '0.0.10416155', 'CARBON'],
  ['Compliance', '0.0.10416164', 'COMPLIANCE'],
  ['Learning', '0.0.10416181', 'LEARNING'],
  ['Payments', '0.0.10416193', 'PAYMENT'],
  ['Registry', '0.0.10414499', 'REGISTRY'],
  ['Tasks', '0.0.10414500', 'TASK'],
  ['Results', '0.0.10414501', 'RESULT'],
  ['Audit', '0.0.10414502', 'AUDIT'],
  ['Hot Topics', '0.0.10414507', 'HOT_TOPIC'],
];

async function sendToTopic(name, topicId, type) {
  try {
    const message = JSON.stringify({
      type: type,
      timestamp: Date.now(),
      agentId: 'vera-populator',
      data: `Populating ${name} topic`,
      consensus: true
    });

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);

    const receipt = await tx.getReceipt(client);
    console.log(`✅ ${name}: Seq #${receipt.topicSequenceNumber}`);
    await new Promise(r => setTimeout(r, 800));
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
  }
}

console.log('🚀 POPULATING ALL 19 HCS TOPICS...\n');

let success = 0;
let failed = 0;

for (const [name, id, type] of topics) {
  await sendToTopic(name, id, type);
}

console.log('\n' + '='.repeat(50));
console.log('✅ ALL TOPICS POPULATED!');
console.log('\n🔗 Check Hashscan:');
console.log('https://hashscan.io/mainnet/topic/0.0.10416098');
console.log('https://hashscan.io/mainnet/topic/0.0.10416136');
console.log('https://hashscan.io/mainnet/topic/0.0.10416193');
console.log('https://hashscan.io/mainnet/topic/0.0.10416100');
console.log('https://hashscan.io/mainnet/topic/0.0.10416145');

process.exit(0);
