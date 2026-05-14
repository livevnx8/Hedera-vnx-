#!/usr/bin/env node
/**
 * SINGLE LIVE PROOF - ONE MESSAGE
 * Submit one message to HCS right now
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const TOPIC_ID = '0.0.10409351';

async function singleProof() {
  console.log('\n🔥 SINGLE LIVE PROOF - SUBMITTING NOW\n');
  console.log(`Account: ${accountId}`);
  console.log(`Topic: ${TOPIC_ID}`);
  console.log(`Time: ${new Date().toLocaleString()}`);
  console.log('\n⏳ Submitting...\n');

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

  const message = {
    type: 'single_live_proof',
    timestamp: Date.now(),
    date: new Date().toISOString(),
    content: 'Vera lattice operational proof - March 28, 2026 10:40 AM',
    proof: { live: true, operational: true, network: 'mainnet' }
  };

  try {
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(TOPIC_ID)
      .setMessage(JSON.stringify(message))
      .execute(client);

    const record = await tx.getRecord(client);
    const sequence = record.receipt.topicSequenceNumber.toString();
    
    console.log('✅ MESSAGE CONFIRMED ON HEDERA MAINNET!\n');
    console.log(`Sequence: ${sequence}`);
    console.log(`HashScan: https://hashscan.io/mainnet/topic/${TOPIC_ID}/${sequence}`);
    console.log(`\n⏰ ${new Date().toLocaleString()}`);
    console.log('\nVerify this link to see the live proof on-chain!\n');

  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
  }

  client.close();
  process.exit(0);
}

singleProof();
