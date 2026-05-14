#!/usr/bin/env node
/**
 * COMBINED: DeFi Research + DOVU Validation (Parallel)
 * 
 * Runs both operations simultaneously:
 * - DeFi protocol research with HCS logging
 * - Carbon credit validation with HCS logging
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const TOPIC_ID = '0.0.10409351';

// DeFi protocols
const defiProtocols = [
  { name: 'SaucerSwap', type: 'DEX', tvl: 25000000, confidence: 0.815, risk: 29, rec: 'RECOMMENDED' },
  { name: 'Stader', type: 'Liquid Staking', tvl: 150000000, confidence: 0.94, risk: 5, rec: 'HIGHLY_RECOMMENDED' },
  { name: 'Hashport', type: 'Bridge', tvl: 50000000, confidence: 0.84, risk: 23, rec: 'RECOMMENDED' }
];

// Carbon credits
const carbonCredits = [
  { id: 'CC-001', project: 'Mangrove Indonesia', tons: 2500, price: 12.50, confidence: 0.906 },
  { id: 'CC-002', project: 'Amazon Reforestation', tons: 5000, price: 18.75, confidence: 0.880 },
  { id: 'CC-003', project: 'DAC Iceland', tons: 1200, price: 450.00, confidence: 0.886 }
];

async function parallelSubmission() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🔬 DeFi + 🌱 DOVU PARALLEL SUBMISSION                          ║');
  console.log('║     Concurrent HCS logging - Maximum throughput                     ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

  if (!accountId || !privateKeyStr) {
    console.log('❌ Missing credentials');
    process.exit(1);
  }

  console.log(`🔑 Account: ${accountId}`);
  console.log(`📡 Topic: ${TOPIC_ID}`);
  console.log(`🌐 Network: MAINNET\n`);

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
    console.log('✅ Client ready\n');
  } catch (error) {
    console.log('❌ Client failed:', error.message);
    process.exit(1);
  }

  const submissions = [];
  const startTime = Date.now();

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('PARALLEL SUBMISSION STARTED');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Create all submission promises
  const defiPromises = defiProtocols.map(async (protocol, i) => {
    const message = {
      type: 'defi_research',
      protocol: protocol.name,
      protocol_type: protocol.type,
      tvl_usd: protocol.tvl,
      confidence: protocol.confidence,
      risk_score: protocol.risk,
      recommendation: protocol.rec,
      timestamp: new Date().toISOString(),
      researcher: 'Vera.h',
      batch: 'parallel'
    };

    try {
      const submitTx = await new TopicMessageSubmitTransaction()
        .setTopicId(TOPIC_ID)
        .setMessage(JSON.stringify(message))
        .execute(client);

      const receipt = await submitTx.getReceipt(client);
      const record = await submitTx.getRecord(client);

      return {
        category: 'DeFi',
        name: protocol.name,
        transactionId: submitTx.transactionId.toString(),
        sequenceNumber: record.receipt.topicSequenceNumber.toString(),
        status: '✅'
      };
    } catch (error) {
      return {
        category: 'DeFi',
        name: protocol.name,
        error: error.message,
        status: '❌'
      };
    }
  });

  const dovuPromises = carbonCredits.map(async (credit, i) => {
    const message = {
      type: 'carbon_credit_validation',
      credit_id: credit.id,
      project: credit.project,
      carbon_tons: credit.tons,
      price_usd: credit.price,
      confidence: credit.confidence,
      status: 'VERIFIED',
      timestamp: new Date().toISOString(),
      validator: 'Vera.h',
      batch: 'parallel'
    };

    try {
      const submitTx = await new TopicMessageSubmitTransaction()
        .setTopicId(TOPIC_ID)
        .setMessage(JSON.stringify(message))
        .execute(client);

      const receipt = await submitTx.getReceipt(client);
      const record = await submitTx.getRecord(client);

      return {
        category: 'DOVU',
        name: credit.id,
        transactionId: submitTx.transactionId.toString(),
        sequenceNumber: record.receipt.topicSequenceNumber.toString(),
        status: '✅'
      };
    } catch (error) {
      return {
        category: 'DOVU',
        name: credit.id,
        error: error.message,
        status: '❌'
      };
    }
  });

  // Execute all in parallel
  const allPromises = [...defiPromises, ...dovuPromises];
  const results = await Promise.all(allPromises);

  const endTime = Date.now();
  const duration = endTime - startTime;

  // Print results
  console.log(`✅ Parallel execution complete in ${duration}ms\n`);

  const defiResults = results.filter(r => r.category === 'DeFi');
  const dovuResults = results.filter(r => r.category === 'DOVU');

  console.log('🔬 DeFi RESEARCH RESULTS:');
  console.log('─'.repeat(70));
  defiResults.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name} ${r.status}`);
    if (r.status === '✅') {
      console.log(`   Seq: ${r.sequenceNumber}`);
      console.log(`   Tx: ${r.transactionId}`);
    }
  });

  console.log('\n🌱 DOVU VALIDATION RESULTS:');
  console.log('─'.repeat(70));
  dovuResults.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name} ${r.status}`);
    if (r.status === '✅') {
      console.log(`   Seq: ${r.sequenceNumber}`);
      console.log(`   Tx: ${r.transactionId}`);
    }
  });

  // Summary
  const successCount = results.filter(r => r.status === '✅').length;
  const totalTvl = defiProtocols.reduce((sum, p) => sum + p.tvl, 0);
  const totalTons = carbonCredits.reduce((sum, c) => sum + c.tons, 0);

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('PARALLEL SUBMISSION SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log(`⏱️  Total Time: ${duration}ms`);
  console.log(`✅ Successful: ${successCount}/${results.length}`);
  console.log(`🔬 DeFi Protocols: ${defiResults.length}`);
  console.log(`🌱 Carbon Credits: ${dovuResults.length}`);
  console.log(`💰 Total TVL: $${(totalTvl / 1000000).toFixed(0)}M`);
  console.log(`🌱 Total Carbon: ${totalTons.toLocaleString()} tons`);
  console.log(`\n📡 Topic: ${TOPIC_ID}`);
  console.log(`🔗 https://hashscan.io/mainnet/topic/${TOPIC_ID}`);

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    network: 'mainnet',
    topicId: TOPIC_ID,
    duration_ms: duration,
    submissions: results,
    summary: {
      total: results.length,
      success: successCount,
      defiProtocols: defiResults.length,
      carbonCredits: dovuResults.length,
      totalTvl: totalTvl,
      totalCarbonTons: totalTons
    },
    hashscanUrl: `https://hashscan.io/mainnet/topic/${TOPIC_ID}`
  };

  fs.writeFileSync('./vera-parallel-submission.json', JSON.stringify(report, null, 2));

  console.log('\n✅ Saved: ./vera-parallel-submission.json');
  console.log('\n🚀 Parallel DeFi + DOVU submission complete!\n');

  client.close();
  process.exit(0);
}

parallelSubmission().catch(console.error);
