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
  { name: 'Registry', id: '0.0.10414499', type: 'REGISTRY' },
  { name: 'Task Queue', id: '0.0.10414500', type: 'TASK' },
  { name: 'Results', id: '0.0.10414501', type: 'RESULT' },
  { name: 'Audit', id: '0.0.10414502', type: 'AUDIT' },
  { name: 'Hot Topics', id: '0.0.10414507', type: 'HOT' },
  { name: 'Swarm State', id: '0.0.10416097', type: 'STATE' },
  { name: 'Swarm Consensus', id: '0.0.10416098', type: 'CONSENSUS' },
  { name: 'Swarm Meet', id: '0.0.10416100', type: 'MEET' },
  { name: 'Swarm Join', id: '0.0.10416106', type: 'JOIN' },
  { name: 'Swarm Routing', id: '0.0.10416108', type: 'ROUTE' },
  { name: 'Fed Handshake', id: '0.0.10416115', type: 'HANDSHAKE' },
  { name: 'Fed Consensus', id: '0.0.10416122', type: 'FED_CONS' },
  { name: 'Fed Tasks', id: '0.0.10416129', type: 'FED_TASK' },
  { name: 'Fed Heartbeat', id: '0.0.10416136', type: 'HEARTBEAT' },
  { name: 'DeFi', id: '0.0.10416145', type: 'DEFI' },
  { name: 'Carbon', id: '0.0.10416155', type: 'CARBON' },
  { name: 'Compliance', id: '0.0.10416164', type: 'COMPLY' },
  { name: 'Learning', id: '0.0.10416181', type: 'LEARN' },
  { name: 'Payments', id: '0.0.10416193', type: 'PAY' },
];

async function send(topic) {
  try {
    const msg = JSON.stringify({
      type: topic.type,
      ts: Date.now(),
      agent: 'vera-populator',
      data: `Populating ${topic.name}`
    });

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topic.id)
      .setMessage(msg)
      .execute(client);

    const receipt = await tx.getReceipt(client);
    console.log(`✅ ${topic.name}: Seq #${receipt.topicSequenceNumber}`);
    await new Promise(r => setTimeout(r, 500));
  } catch (err) {
    console.error(`❌ ${topic.name}: ${err.message}`);
  }
}

console.log('🚀 Populating ALL 19 HCS Topics...\n');

for (const topic of topics) {
  await send(topic);
}

console.log('\n✅ Done! Check Hashscan:');
console.log('https://hashscan.io/mainnet/topic/0.0.10416098');
console.log('https://hashscan.io/mainnet/topic/0.0.10416136');
console.log('https://hashscan.io/mainnet/topic/0.0.10416193');

process.exit(0);
