/**
 * Simple HCS Message Test - Send messages directly to topics
 */

import { TopicMessageSubmitTransaction, Client } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const client = Client.forMainnet();
client.setOperator(
  process.env.HEDERA_OPERATOR_ACCOUNT_ID!,
  process.env.HEDERA_OPERATOR_PRIVATE_KEY!
);

const topics = [
  '0.0.10416185', // swarmConsensus
  '0.0.10416192', // federationHeartbeat
  '0.0.10416186', // swarmState
];

async function sendTestMessages() {
  console.log('🚀 Sending test HCS messages...\n');

  for (const topicId of topics) {
    try {
      const message = JSON.stringify({
        type: 'ABFT_TEST',
        timestamp: Date.now(),
        data: 'Test consensus message',
        agentId: 'test-agent'
      });

      const response = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(message)
        .execute(client);

      const receipt = await response.getReceipt(client);
      console.log(`✅ Topic ${topicId}: Message sent, sequence ${receipt.topicSequenceNumber}`);
    } catch (error) {
      console.error(`❌ Topic ${topicId}: Failed - ${error}`);
    }
  }

  console.log('\n📊 Check Hashscan:');
  console.log('https://hashscan.io/mainnet/topic/0.0.10416185');
  console.log('https://hashscan.io/mainnet/topic/0.0.10416192');
  console.log('https://hashscan.io/mainnet/topic/0.0.10416186');

  process.exit(0);
}

sendTestMessages();
