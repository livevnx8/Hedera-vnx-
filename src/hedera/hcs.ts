import { Client, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { config } from '../config.js';

export function getHederaClient() {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID || !config.HEDERA_OPERATOR_PRIVATE_KEY) return null;

  const client = config.HEDERA_NETWORK === 'testnet' ? Client.forTestnet() : Client.forMainnet();
  client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, config.HEDERA_OPERATOR_PRIVATE_KEY);
  return client;
}

export async function submitReceiptMessage(message: string) {
  if (!config.HCS_TOPIC_ID) return null;

  const client = getHederaClient();
  if (!client) return null;

  const tx = await new TopicMessageSubmitTransaction({
    topicId: config.HCS_TOPIC_ID,
    message
  }).execute(client);

  const receipt = await tx.getReceipt(client);

  return {
    topicId: config.HCS_TOPIC_ID,
    sequenceNumber: receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber) : null,
    transactionId: tx.transactionId.toString()
  };
}
