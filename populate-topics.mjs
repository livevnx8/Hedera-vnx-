import { TopicMessageSubmitTransaction, Client, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

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

// Read topics from config file
import { readFileSync } from 'fs';
const topics = JSON.parse(readFileSync('./data/vera-payment-topics.json', 'utf-8'));

async function sendToTopic(name, topicId, type) {
  if (!topicId) {
    console.log(`⏭️  ${name}: No topic ID`);
    return;
  }
  try {
    const message = JSON.stringify({
      type: type,
      timestamp: Date.now(),
      agentId: 'populator',
      data: `Test message for ${name}`,
      seq: Math.floor(Math.random() * 1000000)
    });

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);

    const receipt = await tx.getReceipt(client);
    console.log(`✅ ${name} (${topicId}): Seq #${receipt.topicSequenceNumber}`);
    await new Promise(r => setTimeout(r, 600));
  } catch (err) {
    console.error(`❌ ${name} (${topicId}): ${err.message}`);
  }
}

async function main() {
  console.log('🚀 Populating ALL HCS Topics...\n');

  const topicList = [
    ['Swarm Consensus', topics.swarmConsensusTopicId, 'CONSENSUS'],
    ['Swarm State', topics.swarmStateTopicId, 'STATE'],
    ['Swarm Meet', topics.swarmMeetTopicId, 'MEET'],
    ['Swarm Join', topics.swarmJoinTopicId, 'JOIN'],
    ['Swarm Routing', topics.swarmRoutingTopicId, 'ROUTING'],
    ['Fed Consensus', topics.federationConsensusTopicId, 'FED_CONSENSUS'],
    ['Fed Heartbeat', topics.federationHeartbeatTopicId, 'HEARTBEAT'],
    ['Fed Handshake', topics.federationHandshakeTopicId, 'HANDSHAKE'],
    ['Fed Tasks', topics.federationTaskTopicId, 'FED_TASK'],
    ['Registry', topics.registryTopicId, 'REGISTRY'],
    ['Task Queue', topics.taskTopicId, 'TASK'],
    ['Audit Log', topics.auditTopicId, 'AUDIT'],
    ['Beacon', topics.beaconTopicId, 'BEACON'],
    ['DeFi', topics.defiIntelligenceTopicId, 'DEFI'],
    ['Carbon', topics.carbonVerificationTopicId, 'CARBON'],
    ['Learning', topics.agentLearningTopicId, 'LEARNING'],
  ];

  for (const [name, topicId, type] of topicList) {
    await sendToTopic(name, topicId, type);
  }

  console.log('\n✅ All topics populated!');
  console.log('\n🔗 Hashscan Links:');
  console.log(`https://hashscan.io/mainnet/topic/${topics.swarmConsensusTopicId}`);
  console.log(`https://hashscan.io/mainnet/topic/${topics.federationHeartbeatTopicId}`);
  console.log(`https://hashscan.io/mainnet/topic/${topics.swarmStateTopicId}`);
  process.exit(0);
}

main().catch(console.error);
