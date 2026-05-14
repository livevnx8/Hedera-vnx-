#!/usr/bin/env node
/**
 * VERA MEGA STRESS TEST - 4 Swarm Architecture
 * Pushes Hedera to absolute capacity limits
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const TOPIC_ID = '0.0.10409351';
const SWARM_COUNT = 4;
const CREDITS_PER_SWARM = 10;
const TOTAL_VALIDATIONS = SWARM_COUNT * CREDITS_PER_SWARM;

// Generate credits for each swarm
function generateSwarmData(swarmId) {
  const credits = [];
  const projects = [
    'Mangrove', 'Amazon', 'DAC', 'Soil', 'Solar', 
    'Wind', 'Methane', 'Ocean', 'Forest', 'Cookstoves'
  ];
  
  for (let i = 0; i < CREDITS_PER_SWARM; i++) {
    credits.push({
      id: `${swarmId}-${String(i + 1).padStart(3, '0')}`,
      project: `${projects[i]} ${['Asia', 'SA', 'EU', 'US', 'Africa'][i % 5]}`,
      tons: 1000 + Math.floor(Math.random() * 5000),
      price: 10 + Math.random() * 50,
      confidence: 0.85 + (Math.random() * 0.13),
      swarm: swarmId
    });
  }
  return credits;
}

async function megaStressTest() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🚀 MEGA STRESS TEST - 4 SWARM ARCHITECTURE                     ║');
  console.log('║                                                                    ║');
  console.log('║     4 Swarms × 10 Credits = 40 Validations                         ║');
  console.log('║     Pushing Hedera to ABSOLUTE LIMITS                              ║');
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
    console.log(`✅ Client ready: ${accountId}`);
    console.log(`⚡ ${SWARM_COUNT} Swarms × ${CREDITS_PER_SWARM} Credits = ${TOTAL_VALIDATIONS} Validations\n`);
  } catch (e) {
    console.log('❌ Client failed:', e.message);
    process.exit(1);
  }

  // Initialize all swarms
  const swarms = [];
  const swarmNames = ['🔴', '🟠', '🟡', '🟢'];
  
  for (let i = 0; i < SWARM_COUNT; i++) {
    swarms.push({
      id: String.fromCharCode(65 + i), // A, B, C, D
      name: swarmNames[i],
      credits: generateSwarmData(String.fromCharCode(65 + i)),
      submitted: 0,
      failed: 0,
      latencies: [],
      startTime: 0,
      endTime: 0
    });
  }

  const globalStart = Date.now();
  const allResults = [];

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('MEGA STRESS TEST - ALL SWARMS LAUNCHING');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Run all swarms in parallel
  const swarmPromises = swarms.map(swarm => runSwarm(swarm, client, allResults));
  await Promise.all(swarmPromises);

  const globalEnd = Date.now();
  const totalDuration = globalEnd - globalStart;

  // Calculate metrics
  const totalSubmitted = swarms.reduce((sum, s) => sum + s.submitted, 0);
  const totalFailed = swarms.reduce((sum, s) => sum + s.failed, 0);
  const allLatencies = swarms.flatMap(s => s.latencies);
  
  const throughput = totalSubmitted / (totalDuration / 1000);
  const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
  const successRate = (totalSubmitted / TOTAL_VALIDATIONS) * 100;

  // Print results
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('MEGA STRESS TEST RESULTS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log('📊 GLOBAL PERFORMANCE:');
  console.log(`   Total Time: ${(totalDuration/1000).toFixed(2)}s`);
  console.log(`   Validations: ${totalSubmitted}/${TOTAL_VALIDATIONS}`);
  console.log(`   Throughput: ${throughput.toFixed(2)} TPS`);
  console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
  console.log(`   Avg Latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`   Failed: ${totalFailed}\n`);

  console.log('🤖 SWARM BREAKDOWN:');
  swarms.forEach(swarm => {
    const avgLat = swarm.latencies.length > 0 
      ? swarm.latencies.reduce((a,b) => a+b, 0) / swarm.latencies.length 
      : 0;
    console.log(`   ${swarm.name} Swarm ${swarm.id}:`);
    console.log(`     Processed: ${swarm.submitted}/${CREDITS_PER_SWARM}`);
    console.log(`     Failed: ${swarm.failed}`);
    console.log(`     Duration: ${(swarm.endTime - swarm.startTime)}ms`);
    console.log(`     Avg Latency: ${avgLat.toFixed(0)}ms\n`);
  });

  // Capacity analysis
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('HEDERA CAPACITY BREAKDOWN');
  console.log('════════════════════════════════════════════════════════════════════\n');
  
  const hederaLimit = 10;
  const utilization = (throughput / hederaLimit) * 100;
  
  console.log(`⚡ Vera Throughput: ${throughput.toFixed(2)} TPS`);
  console.log(`🌐 Hedera Limit: ~${hederaLimit} TPS`);
  console.log(`📊 Utilization: ${utilization.toFixed(1)}%`);
  console.log(`📈 Headroom: ${(hederaLimit - throughput).toFixed(2)} TPS\n`);

  if (utilization > 80) {
    console.log('🚨 HIGH UTILIZATION WARNING');
    console.log('   Approaching Hedera capacity limits!');
  } else if (utilization > 50) {
    console.log('⚠️  MODERATE UTILIZATION');
    console.log('   Room for growth but monitor closely');
  } else {
    console.log('✅ LOW UTILIZATION');
    console.log('   Massive headroom for scaling');
  }

  // Theoretical max
  console.log('\n📈 THEORETICAL SCALING:');
  console.log(`   Current: ${throughput.toFixed(2)} TPS with ${SWARM_COUNT} swarms`);
  console.log(`   With 10 swarms: ${(throughput * 2.5).toFixed(2)} TPS (est)`);
  console.log(`   With 20 swarms: ${(throughput * 5).toFixed(2)} TPS (est)`);
  console.log(`   With 100 swarms: ${(throughput * 25).toFixed(2)} TPS (est)`);
  console.log(`   Hedera would bottleneck at ~${hederaLimit} TPS\n`);

  console.log('📡 All results on HashScan:');
  console.log(`   Topic: ${TOPIC_ID}`);
  console.log(`   🔗 https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    network: 'mainnet',
    swarmCount: SWARM_COUNT,
    creditsPerSwarm: CREDITS_PER_SWARM,
    totalValidations: TOTAL_VALIDATIONS,
    performance: {
      duration: totalDuration,
      throughput,
      successRate,
      avgLatency,
      totalSubmitted,
      totalFailed
    },
    swarms: swarms.map(s => ({
      id: s.id,
      submitted: s.submitted,
      failed: s.failed,
      duration: s.endTime - s.startTime,
      avgLatency: s.latencies.length > 0 
        ? s.latencies.reduce((a,b) => a+b, 0) / s.latencies.length 
        : 0
    })),
    capacity: {
      veraThroughput: throughput,
      hederaLimit,
      utilization: utilization,
      headroom: hederaLimit - throughput,
      bottleneck: throughput > hederaLimit ? 'Hedera' : 'None'
    }
  };

  fs.writeFileSync('./vera-mega-stress-report.json', JSON.stringify(report, null, 2));
  console.log('✅ Report saved: ./vera-mega-stress-report.json\n');

  client.close();
  process.exit(0);
}

async function runSwarm(swarm, client, allResults) {
  swarm.startTime = Date.now();
  console.log(`${swarm.name} [Swarm ${swarm.id}] Launching...`);

  for (const credit of swarm.credits) {
    const startTime = Date.now();
    
    const message = {
      type: `mega_stress_swarm_${swarm.id}`,
      credit_id: credit.id,
      project: credit.project,
      tons: credit.tons,
      price: credit.price,
      confidence: credit.confidence,
      status: credit.confidence > 0.9 ? 'HIGHLY_VERIFIED' : 'VERIFIED',
      swarm: swarm.id,
      timestamp: new Date().toISOString()
    };

    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(TOPIC_ID)
        .setMessage(JSON.stringify(message))
        .execute(client);

      const record = await tx.getRecord(client);
      const latency = Date.now() - startTime;
      
      swarm.latencies.push(latency);
      swarm.submitted++;
      
      allResults.push({
        swarm: swarm.id,
        credit: credit.id,
        seq: record.receipt.topicSequenceNumber.toString(),
        latency
      });

    } catch (error) {
      swarm.failed++;
      console.log(`${swarm.name} [Swarm ${swarm.id}] ❌ ${credit.id}: ${error.message}`);
    }
  }

  swarm.endTime = Date.now();
  console.log(`${swarm.name} [Swarm ${swarm.id}] Complete: ${swarm.submitted}/${CREDITS_PER_SWARM}`);
}

megaStressTest().catch(console.error);
