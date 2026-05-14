#!/usr/bin/env node
/**
 * MORE HCS SUBMISSIONS - Batch 2
 * Additional DeFi protocols and market data
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const additionalProtocols = [
  { name: 'LCX', type: 'Exchange', contractId: '0.0.859814', tvl: 12000000, confidence: 0.82, risk: 28, rec: 'RECOMMENDED' },
  { name: 'Dovu', type: 'Carbon Credits', contractId: '0.0.1040936', tvl: 8000000, confidence: 0.91, risk: 18, rec: 'HIGHLY_RECOMMENDED' },
  { name: 'HeadStarter', type: 'Launchpad', contractId: '0.0.1352215', tvl: 3500000, confidence: 0.77, risk: 35, rec: 'APPROVED' },
  { name: 'SaucerSwap V2', type: 'DEX V2', contractId: '0.0.1462251', tvl: 15000000, confidence: 0.85, risk: 22, rec: 'RECOMMENDED' },
  { name: 'HashGuild', type: 'NFT Marketplace', contractId: '0.0.982394', tvl: 2500000, confidence: 0.74, risk: 38, rec: 'APPROVED' }
];

const marketData = {
  hbarPrice: 0.185,
  marketCap: 7500000000,
  volume24h: 120000000,
  defiTvlTotal: 238000000,
  timestamp: new Date().toISOString()
};

const TOPIC_ID = '0.0.10409351';

async function submitMoreToHCS() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     📊 MORE HCS SUBMISSIONS - BATCH 2                              ║');
  console.log('║     Additional protocols + Market data                            ║');
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
    console.log('❌ Client init failed:', error.message);
    process.exit(1);
  }

  const submissions = [];

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('SUBMITTING ADDITIONAL PROTOCOLS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Submit protocols
  for (const protocol of additionalProtocols) {
    const message = {
      type: 'defi_research_batch2',
      protocol: protocol.name,
      protocol_type: protocol.type,
      contract_id: protocol.contractId,
      tvl_usd: protocol.tvl,
      confidence: protocol.confidence,
      risk_score: protocol.risk,
      recommendation: protocol.rec,
      timestamp: new Date().toISOString(),
      researcher: 'Vera.h',
      model: 'veda-qvx:latest',
      batch: 2
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

      console.log(`   ✅ Seq: ${result.sequenceNumber}`);
      console.log(`   🔗 ${result.transactionId}`);
      console.log('');

      await new Promise(r => setTimeout(r, 300));

    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }

  // Submit market data
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('SUBMITTING MARKET DATA');
  console.log('════════════════════════════════════════════════════════════════════\n');

  try {
    const marketMessage = {
      type: 'market_data',
      hbar_price: marketData.hbarPrice,
      market_cap: marketData.marketCap,
      volume_24h: marketData.volume24h,
      defi_tvl_total: marketData.defiTvlTotal,
      timestamp: new Date().toISOString(),
      researcher: 'Vera.h'
    };

    console.log('📝 Submitting market snapshot');
    
    const marketTx = await new TopicMessageSubmitTransaction()
      .setTopicId(TOPIC_ID)
      .setMessage(JSON.stringify(marketMessage))
      .execute(client);

    const marketReceipt = await marketTx.getReceipt(client);
    const marketRecord = await marketTx.getRecord(client);

    const marketResult = {
      type: 'market_data',
      transactionId: marketTx.transactionId.toString(),
      sequenceNumber: marketRecord.receipt.topicSequenceNumber.toString(),
      status: marketReceipt.status.toString()
    };

    submissions.push(marketResult);

    console.log(`   ✅ Seq: ${marketResult.sequenceNumber}`);
    console.log(`   💰 HBAR: $${marketData.hbarPrice} | TVL: $${(marketData.defiTvlTotal/1000000).toFixed(0)}M`);
    console.log('');

  } catch (error) {
    console.log(`   ❌ Market data failed: ${error.message}\n`);
  }

  // Summary
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('BATCH 2 COMPLETE');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log(`✅ Submitted: ${submissions.length} messages`);
  console.log(`📡 Topic: ${TOPIC_ID}`);
  console.log(`🔗 https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  console.log('📋 ALL SUBMISSIONS:');
  console.log('─'.repeat(70));
  submissions.forEach((sub, i) => {
    const name = sub.protocol || sub.type;
    console.log(`${i + 1}. ${name}`);
    console.log(`   Seq: ${sub.sequenceNumber}`);
    console.log(`   🔗 https://hashscan.io/mainnet/transaction/${sub.transactionId}`);
  });

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    network: 'mainnet',
    topicId: TOPIC_ID,
    batch: 2,
    submitted: submissions.length,
    transactions: submissions,
    protocols: additionalProtocols.map(p => p.name),
    hashscanUrl: `https://hashscan.io/mainnet/topic/${TOPIC_ID}`
  };

  fs.writeFileSync('./vera-hcs-batch2.json', JSON.stringify(report, null, 2));

  console.log('\n✅ Saved: ./vera-hcs-batch2.json');
  console.log(`\n🌐 View all: https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  client.close();
  process.exit(0);
}

submitMoreToHCS().catch(console.error);
