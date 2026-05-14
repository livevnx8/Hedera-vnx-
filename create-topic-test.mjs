#!/usr/bin/env node
/**
 * SINGLE TOPIC CREATOR - For testing
 */

import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

async function createSingleTopic() {
  console.log('Creating single HCS topic...\n');
  
  const client = Client.forMainnet();
  let privateKey;
  
  try {
    if (privateKeyStr.length === 64) {
      try { privateKey = PrivateKey.fromStringECDSA(privateKeyStr); }
      catch { privateKey = PrivateKey.fromStringED25519(privateKeyStr); }
    } else {
      privateKey = PrivateKey.fromString(privateKeyStr);
    }
    client.setOperator(accountId, privateKey);
  } catch (e) {
    console.log('❌ Client failed:', e.message);
    process.exit(1);
  }

  console.log('Creating topic...');
  
  try {
    const tx = await new TopicCreateTransaction()
      .setTopicMemo('Vera Test Topic')
      .execute(client);

    const receipt = await tx.getReceipt(client);
    const topicId = receipt.topicId.toString();

    console.log(`✅ Topic created: ${topicId}`);
    console.log(`🔗 https://hashscan.io/mainnet/topic/${topicId}`);

    // Submit message
    const msgTx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify({ test: 'hello' }))
      .execute(client);

    const msgRecord = await msgTx.getRecord(client);
    console.log(`✅ Message: Seq ${msgRecord.receipt.topicSequenceNumber}`);

  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
  }

  client.close();
  process.exit(0);
}

createSingleTopic().catch(console.error);
