/**
 * Populate ALL HCS Topics with Messages
 * Sends messages to every configured topic to verify Hashscan logging
 */

import { TopicMessageSubmitTransaction, Client, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';
import { paymentTopicManager } from '../src/vera/orchestrator/topicManager.js';

dotenv.config();

const client = Client.forMainnet();
if (process.env.HEDERA_OPERATOR_ACCOUNT_ID && process.env.HEDERA_OPERATOR_PRIVATE_KEY) {
  let privateKey;
  const pk = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  if (pk.length === 64) {
    try { privateKey = PrivateKey.fromStringECDSA(pk); }
    catch { privateKey = PrivateKey.fromStringED25519(pk); }
  } else {
    privateKey = PrivateKey.fromString(pk);
  }
  client.setOperator(process.env.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
}

async function populateAllTopics() {
  console.log('🚀 Populating ALL HCS Topics with Messages...\n');

  const topics = await paymentTopicManager.ensureTopics();

  const topicConfigs = [
    { key: 'registryTopicId', name: 'Payment Registry', type: 'REGISTRY' },
    { key: 'taskTopicId', name: 'Task Queue', type: 'TASK' },
    { key: 'resultTopicId', name: 'Task Results', type: 'RESULT' },
    { key: 'auditTopicId', name: 'Audit Log', type: 'AUDIT' },
    { key: 'beaconTopicId', name: 'Agent Beacon', type: 'BEACON' },
    { key: 'hotTopicsTopicId', name: 'Hot Topics', type: 'HOT_TOPIC' },
    { key: 'swarmStateTopicId', name: 'Swarm State', type: 'STATE_SYNC' },
    { key: 'swarmConsensusTopicId', name: 'Swarm Consensus', type: 'CONSENSUS' },
    { key: 'swarmMeetTopicId', name: 'Swarm Meet', type: 'MEET' },
    { key: 'swarmJoinTopicId', name: 'Swarm Join', type: 'JOIN' },
    { key: 'swarmRoutingTopicId', name: 'Swarm Routing', type: 'ROUTING' },
    { key: 'federationHandshakeTopicId', name: 'Federation Handshake', type: 'HANDSHAKE' },
    { key: 'federationConsensusTopicId', name: 'Federation Consensus', type: 'FED_CONSENSUS' },
    { key: 'federationTaskTopicId', name: 'Federation Tasks', type: 'FED_TASK' },
    { key: 'federationHeartbeatTopicId', name: 'Federation Heartbeat', type: 'FED_HEARTBEAT' },
    { key: 'defiIntelligenceTopicId', name: 'DeFi Intelligence', type: 'DEFI' },
    { key: 'carbonVerificationTopicId', name: 'Carbon Verification', type: 'CARBON' },
    { key: 'complianceAuditTopicId', name: 'Compliance Audit', type: 'COMPLIANCE' },
    { key: 'agentLearningTopicId', name: 'Agent Learning', type: 'LEARNING' },
    { key: 'paymentStreamTopicId', name: 'Payment Streams', type: 'PAYMENT' },
  ];

  let successCount = 0;
  let failCount = 0;

  for (const { key, name, type } of topicConfigs) {
    const topicId = topics[key as keyof typeof topics];
    if (!topicId) {
      console.log(`⏭️  ${name}: No topic ID configured`);
      continue;
    }

    try {
      const message = JSON.stringify({
        type: type,
        subtype: 'TEST_MESSAGE',
        timestamp: Date.now(),
        agentId: 'vera-populator',
        data: `Test message for ${name}`,
        sequence: Math.floor(Math.random() * 1000000)
      });

      const response = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(message)
        .execute(client);

      const receipt = await response.getReceipt(client);
      const seq = receipt.topicSequenceNumber?.toString() || 'unknown';

      console.log(`✅ ${name} (${topicId}): Message #${seq}`);
      successCount++;

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));

    } catch (error) {
      console.error(`❌ ${name} (${topicId}): Failed - ${error}`);
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Results: ${successCount} sent, ${failCount} failed`);
  console.log('\n🔗 Hashscan Links:');
  console.log('https://hashscan.io/mainnet/topic/' + topics.swarmConsensusTopicId);
  console.log('https://hashscan.io/mainnet/topic/' + topics.federationHeartbeatTopicId);
  console.log('https://hashscan.io/mainnet/topic/' + topics.swarmStateTopicId);
  console.log('https://hashscan.io/mainnet/topic/' + topics.auditTopicId);
  console.log('https://hashscan.io/mainnet/topic/' + topics.beaconTopicId);

  process.exit(0);
}

populateAllTopics();
