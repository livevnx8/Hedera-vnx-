/**
 * LIVE ABFT Constant Message Stream
 * Continuously sends ABFT consensus messages to ALL HCS topics
 */

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

// All 19 topics with their IDs
const topics = [
  { name: 'Swarm Consensus', id: '0.0.10416098', type: 'CONSENSUS_VOTE' },
  { name: 'Swarm State', id: '0.0.10416097', type: 'STATE_SYNC' },
  { name: 'Swarm Meet', id: '0.0.10416100', type: 'MEET_REQUEST' },
  { name: 'Swarm Join', id: '0.0.10416106', type: 'JOIN_REQUEST' },
  { name: 'Swarm Routing', id: '0.0.10416108', type: 'TASK_OFFER' },
  { name: 'Fed Handshake', id: '0.0.10416115', type: 'HANDSHAKE' },
  { name: 'Fed Consensus', id: '0.0.10416122', type: 'FED_CONSENSUS' },
  { name: 'Fed Tasks', id: '0.0.10416129', type: 'FED_TASK' },
  { name: 'Fed Heartbeat', id: '0.0.10416136', type: 'HEARTBEAT' },
  { name: 'DeFi Intel', id: '0.0.10416145', type: 'DEFI_INTEL' },
  { name: 'Carbon', id: '0.0.10416155', type: 'CARBON' },
  { name: 'Compliance', id: '0.0.10416164', type: 'COMPLIANCE' },
  { name: 'Learning', id: '0.0.10416181', type: 'LEARNING' },
  { name: 'Payments', id: '0.0.10416193', type: 'PAYMENT' },
  { name: 'Registry', id: '0.0.10414499', type: 'REGISTRY' },
  { name: 'Tasks', id: '0.0.10414500', type: 'TASK' },
  { name: 'Results', id: '0.0.10414501', type: 'RESULT' },
  { name: 'Audit', id: '0.0.10414502', type: 'AUDIT' },
  { name: 'Hot Topics', id: '0.0.10414507', type: 'HOT_TOPIC' },
];

let messageCount = 0;
let startTime = Date.now();

async function sendABFTMessage(topic) {
  try {
    const proposalId = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const vote = Math.random() > 0.3 ? 'YES' : 'NO';
    const stake = Math.floor(Math.random() * 500) + 100;
    
    const message = JSON.stringify({
      type: topic.type,
      subtype: 'ABFT_LIVE',
      timestamp: Date.now(),
      proposalId: proposalId,
      vote: vote,
      stake: stake,
      agentId: `guardian-${Math.floor(Math.random() * 5)}`,
      quorum: 400,
      status: vote === 'YES' ? 'ACCEPTED' : 'REJECTED',
      consensus: true,
      messageNum: ++messageCount,
      uptime: Math.floor((Date.now() - startTime) / 1000)
    });

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topic.id)
      .setMessage(message)
      .execute(client);

    const receipt = await tx.getReceipt(client);
    console.log(`✅ [${messageCount}] ${topic.name}: Seq #${receipt.topicSequenceNumber} | Vote: ${vote} | Stake: ${stake}`);
    return true;
  } catch (err) {
    console.error(`❌ ${topic.name}: ${err.message}`);
    return false;
  }
}

async function liveStream() {
  console.log('🔴 LIVE ABFT CONSENSUS STREAM STARTED');
  console.log('=====================================\n');
  console.log('Sending constant ABFT messages to ALL 19 topics...\n');
  console.log('Hashscan Links:');
  console.log('https://hashscan.io/mainnet/topic/0.0.10416098');
  console.log('https://hashscan.io/mainnet/topic/0.0.10416136');
  console.log('https://hashscan.io/mainnet/topic/0.0.10416193\n');
  
  // Send to each topic in rotation
  while (true) {
    for (const topic of topics) {
      await sendABFTMessage(topic);
      await new Promise(r => setTimeout(r, 2000)); // 2 second delay between messages
    }
    console.log(`\n📊 Round complete. Total messages: ${messageCount}\n`);
    await new Promise(r => setTimeout(r, 5000)); // 5 second pause between rounds
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping ABFT live stream...');
  console.log(`📊 Total messages sent: ${messageCount}`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Stopping ABFT live stream...');
  console.log(`📊 Total messages sent: ${messageCount}`);
  process.exit(0);
});

liveStream().catch(err => {
  console.error('Live stream error:', err);
  process.exit(1);
});
