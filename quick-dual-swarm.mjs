#!/usr/bin/env node
// Quick dual swarm capacity test - 3 credits per swarm for speed

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const TOPIC_ID = '0.0.10409351';

const swarmACredits = [
  { id: 'A-001', project: 'Mangrove Indonesia', tons: 2500, conf: 0.91 },
  { id: 'A-002', project: 'Solar Kenya', tons: 3200, conf: 0.88 },
  { id: 'A-003', project: 'DAC Iceland', tons: 1200, conf: 0.95 }
];

const swarmBCredits = [
  { id: 'B-001', project: 'Amazon Reforestation', tons: 5000, conf: 0.87 },
  { id: 'B-002', project: 'Soil Carbon Iowa', tons: 800, conf: 0.92 },
  { id: 'B-003', project: 'Wind Norway', tons: 2100, conf: 0.89 }
];

async function quickDualSwarmTest() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     ⚡ QUICK DUAL SWARM CAPACITY TEST                               ║');
  console.log('║     2 Swarms × 3 Credits = 6 Parallel Validations                  ║');
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

  const results = [];
  const startTime = Date.now();

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('DUAL SWARM EXECUTION');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Swarm A
  async function runSwarmA() {
    console.log('🔵 [Swarm A] Starting...');
    const swarmStart = Date.now();
    
    for (const credit of swarmACredits) {
      const msg = {
        type: 'validation_swarm_a',
        credit_id: credit.id,
        project: credit.project,
        tons: credit.tons,
        confidence: credit.conf,
        status: 'VERIFIED',
        timestamp: new Date().toISOString()
      };

      try {
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(TOPIC_ID)
          .setMessage(JSON.stringify(msg))
          .execute(client);

        const record = await tx.getRecord(client);
        results.push({
          swarm: 'A',
          credit: credit.id,
          seq: record.receipt.topicSequenceNumber.toString(),
          latency: Date.now() - swarmStart
        });
        console.log(`   🔵 ${credit.id}: Seq ${results[results.length-1].seq}`);
      } catch (e) {
        console.log(`   ❌ ${credit.id}: ${e.message}`);
      }
    }
  }

  // Swarm B
  async function runSwarmB() {
    console.log('🟢 [Swarm B] Starting...');
    const swarmStart = Date.now();
    
    for (const credit of swarmBCredits) {
      const msg = {
        type: 'validation_swarm_b',
        credit_id: credit.id,
        project: credit.project,
        tons: credit.tons,
        confidence: credit.conf,
        status: 'VERIFIED',
        timestamp: new Date().toISOString()
      };

      try {
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(TOPIC_ID)
          .setMessage(JSON.stringify(msg))
          .execute(client);

        const record = await tx.getRecord(client);
        results.push({
          swarm: 'B',
          credit: credit.id,
          seq: record.receipt.topicSequenceNumber.toString(),
          latency: Date.now() - swarmStart
        });
        console.log(`   🟢 ${credit.id}: Seq ${results[results.length-1].seq}`);
      } catch (e) {
        console.log(`   ❌ ${credit.id}: ${e.message}`);
      }
    }
  }

  // Run both in parallel
  await Promise.all([runSwarmA(), runSwarmB()]);

  const endTime = Date.now();
  const duration = endTime - startTime;

  // Calculate metrics
  const swarmAResults = results.filter(r => r.swarm === 'A');
  const swarmBResults = results.filter(r => r.swarm === 'B');
  const avgLatency = results.reduce((s, r) => s + r.latency, 0) / results.length;
  const throughput = results.length / (duration / 1000);

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('CAPACITY TEST RESULTS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log(`⏱️  Total Time: ${duration}ms (${(duration/1000).toFixed(2)}s)`);
  console.log(`✅ Validations: ${results.length}/6`);
  console.log(`⚡ Throughput: ${throughput.toFixed(2)} validations/sec`);
  console.log(`📊 Avg Latency: ${avgLatency.toFixed(0)}ms\n`);

  console.log('🤖 SWARM PERFORMANCE:');
  console.log(`   Swarm A: ${swarmAResults.length}/3 validated`);
  console.log(`   Swarm B: ${swarmBResults.length}/3 validated\n`);

  // Hedera capacity analysis
  const hederaLimit = 10; // TPS
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('HEDERA CAPACITY ANALYSIS');
  console.log('════════════════════════════════════════════════════════════════════\n');
  console.log(`⚡ Vera Throughput: ${throughput.toFixed(2)} TPS`);
  console.log(`🌐 Hedera Limit: ~${hederaLimit} TPS`);
  console.log(`📊 Utilization: ${((throughput/hederaLimit)*100).toFixed(1)}%\n`);

  if (throughput > hederaLimit) {
    console.log('🚨 Vera is FASTER than Hedera can handle!');
    console.log(`   Vera: ${throughput.toFixed(2)} TPS`);
    console.log(`   Hedera: ~${hederaLimit} TPS`);
    console.log('   ⚠️  Bottleneck: Hedera network capacity');
    console.log('   💡 Dual swarm creates backpressure on HCS\n');
  } else {
    console.log('✅ Within Hedera capacity limits\n');
  }

  console.log('📡 Results on HashScan:');
  console.log(`   Topic: ${TOPIC_ID}`);
  console.log(`   🔗 https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  results.forEach((r, i) => {
    console.log(`${i+1}. ${r.credit} (Swarm ${r.swarm}): Seq ${r.seq}`);
  });

  fs.writeFileSync('./dual-swarm-test.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    duration,
    throughput,
    results,
    exceedsHedera: throughput > hederaLimit
  }, null, 2));

  console.log('\n✅ Saved: ./dual-swarm-test.json\n');
  client.close();
  process.exit(0);
}

quickDualSwarmTest().catch(console.error);
