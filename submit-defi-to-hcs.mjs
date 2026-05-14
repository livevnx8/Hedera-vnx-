#!/usr/bin/env node
/**
 * REAL HCS DeFi Research Submission
 * Actually submits to Hedera HCS - visible on HashScan
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const defiProtocols = [
  { name: 'SaucerSwap', type: 'DEX', contractId: '0.0.1462250', tvl: 25000000, confidence: 0.815, risk: 29, rec: 'RECOMMENDED' },
  { name: 'Stader', type: 'Liquid Staking', contractId: '0.0.1234197', tvl: 150000000, confidence: 0.94, risk: 5, rec: 'HIGHLY_RECOMMENDED' },
  { name: 'Hashport', type: 'Bridge', contractId: '0.0.1088622', tvl: 50000000, confidence: 0.84, risk: 23, rec: 'RECOMMENDED' },
  { name: 'HeliSwap', type: 'DEX', contractId: '0.0.1238628', tvl: 8000000, confidence: 0.798, risk: 32, rec: 'APPROVED' },
  { name: 'Tuum', type: 'Orderbook DEX', contractId: '0.0.0', tvl: 5000000, confidence: 0.795, risk: 33, rec: 'APPROVED' }
];

const TOPIC_ID = '0.0.10409351';

async function submitToHCS() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🔬 SUBMITTING DeFi RESEARCH TO HCS (REAL)                      ║');
  console.log('║     Will appear on HashScan                                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // Check credentials
  const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

  if (!accountId || !privateKeyStr) {
    console.log('❌ Missing Hedera credentials in .env');
    console.log('   Required: HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY');
    process.exit(1);
  }

  console.log(`🔑 Account: ${accountId}`);
  console.log(`📡 Topic: ${TOPIC_ID}`);
  console.log(`🌐 Network: MAINNET\n`);

  // Create client
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
    console.log('✅ Client initialized\n');
  } catch (error) {
    console.log('❌ Failed to initialize client:', error.message);
    process.exit(1);
  }

  const submissions = [];

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('SUBMITTING TO HCS - MAINNET');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Submit each protocol
  for (const protocol of defiProtocols) {
    const message = {
      type: 'defi_research',
      protocol: protocol.name,
      protocol_type: protocol.type,
      contract_id: protocol.contractId,
      tvl_usd: protocol.tvl,
      confidence: protocol.confidence,
      risk_score: protocol.risk,
      recommendation: protocol.rec,
      timestamp: new Date().toISOString(),
      researcher: 'Vera.h',
      model: 'veda-qvx:latest'
    };

    try {
      console.log(`📝 Submitting: ${protocol.name}`);
      
      const submitTx = await new TopicMessageSubmitTransaction()
        .setTopicId(TOPIC_ID)
        .setMessage(JSON.stringify(message))
        .execute(client);

      const receipt = await submitTx.getReceipt(client);
      const record = await submitTx.getRecord(client);

      const result = {
        protocol: protocol.name,
        transactionId: submitTx.transactionId.toString(),
        sequenceNumber: record.receipt.topicSequenceNumber.toString(),
        status: receipt.status.toString()
      };

      submissions.push(result);

      console.log(`   ✅ Submitted`);
      console.log(`   📍 Sequence: ${result.sequenceNumber}`);
      console.log(`   🆔 Tx ID: ${result.transactionId}`);
      console.log(`   🔗 HashScan: https://hashscan.io/mainnet/transaction/${result.transactionId}`);
      console.log('');

      // Small delay
      await new Promise(r => setTimeout(r, 500));

    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }

  // Summary report
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('SUBMISSION SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log(`✅ Successfully submitted: ${submissions.length}/${defiProtocols.length}`);
  console.log(`📡 Topic: ${TOPIC_ID}`);
  console.log(`🔗 View all: https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  console.log('📋 TRANSACTION IDs:');
  console.log('─'.repeat(70));
  submissions.forEach((sub, i) => {
    console.log(`${i + 1}. ${sub.protocol}`);
    console.log(`   Seq: ${sub.sequenceNumber}`);
    console.log(`   Tx: ${sub.transactionId}`);
    console.log(`   🔗 https://hashscan.io/mainnet/transaction/${sub.transactionId}`);
  });

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    network: 'mainnet',
    topicId: TOPIC_ID,
    submitted: submissions.length,
    transactions: submissions,
    hashscanUrl: `https://hashscan.io/mainnet/topic/${TOPIC_ID}`
  };

  fs.writeFileSync('./vera-hcs-defi-submissions.json', JSON.stringify(report, null, 2));

  console.log('\n✅ Report saved: ./vera-hcs-defi-submissions.json');
  console.log(`\n🌐 View on HashScan: https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  client.close();
  process.exit(0);
}

submitToHCS().catch(error => {
  console.error('Submission failed:', error);
  process.exit(1);
});
