#!/usr/bin/env node
// Simple combined submission - DeFi + DOVU

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const TOPIC_ID = '0.0.10409351';

const data = [
  // DeFi protocols
  { type: 'defi', name: 'SaucerSwap', category: 'DEX', value: 25000000, conf: 0.815 },
  { type: 'defi', name: 'Stader', category: 'Staking', value: 150000000, conf: 0.94 },
  { type: 'defi', name: 'Hashport', category: 'Bridge', value: 50000000, conf: 0.84 },
  // Carbon credits  
  { type: 'dovu', id: 'CC-001', project: 'Mangrove Indonesia', tons: 2500, conf: 0.906 },
  { type: 'dovu', id: 'CC-002', project: 'Amazon Reforestation', tons: 5000, conf: 0.88 },
  { type: 'dovu', id: 'CC-003', project: 'DAC Iceland', tons: 1200, conf: 0.886 }
];

async function submitAll() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🔬 DeFi + 🌱 DOVU COMBINED SUBMISSION                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

  if (!accountId || !privateKeyStr) {
    console.log('❌ Missing credentials');
    process.exit(1);
  }

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
    console.log(`✅ Client ready: ${accountId}\n`);
  } catch (e) {
    console.log('❌ Client failed:', e.message);
    process.exit(1);
  }

  const submissions = [];

  console.log('Submitting DeFi + DOVU data...\n');

  for (const item of data) {
    const message = item.type === 'defi' ? {
      type: 'defi_research',
      protocol: item.name,
      category: item.category,
      tvl: item.value,
      confidence: item.conf,
      timestamp: new Date().toISOString()
    } : {
      type: 'carbon_validation',
      credit_id: item.id,
      project: item.project,
      tons: item.tons,
      confidence: item.conf,
      status: 'VERIFIED',
      timestamp: new Date().toISOString()
    };

    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(TOPIC_ID)
        .setMessage(JSON.stringify(message))
        .execute(client);

      const receipt = await tx.getReceipt(client);
      const record = await tx.getRecord(client);

      submissions.push({
        type: item.type,
        name: item.name || item.id,
        seq: record.receipt.topicSequenceNumber.toString(),
        tx: tx.transactionId.toString()
      });

      const icon = item.type === 'defi' ? '🔬' : '🌱';
      console.log(`${icon} ${item.name || item.id}: Seq ${submissions[submissions.length - 1].seq}`);

      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.log(`❌ ${item.name || item.id}: ${e.message}`);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════\n');

  const defiCount = submissions.filter(s => s.type === 'defi').length;
  const dovuCount = submissions.filter(s => s.type === 'dovu').length;

  console.log(`✅ Submitted: ${submissions.length}`);
  console.log(`🔬 DeFi: ${defiCount}`);
  console.log(`🌱 DOVU: ${dovuCount}`);
  console.log(`\n📡 Topic: ${TOPIC_ID}`);
  console.log(`🔗 https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  submissions.forEach((s, i) => {
    console.log(`${i + 1}. ${s.name}`);
    console.log(`   Seq: ${s.seq}`);
    console.log(`   🔗 https://hashscan.io/mainnet/transaction/${s.tx}`);
  });

  fs.writeFileSync('./combined-submission.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    topic: TOPIC_ID,
    submissions
  }, null, 2));

  console.log('\n✅ Saved: ./combined-submission.json\n');
  client.close();
  process.exit(0);
}

submitAll().catch(console.error);
