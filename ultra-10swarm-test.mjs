#!/usr/bin/env node
/**
 * VERA ULTRA STRESS TEST - 10 Swarm Architecture
 * 100 validations pushing absolute Hedera limits
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const TOPIC_ID = '0.0.10409351';
const SWARM_COUNT = 10;
const CREDITS_PER_SWARM = 10;
const TOTAL_VALIDATIONS = SWARM_COUNT * CREDITS_PER_SWARM;

const swarmEmojis = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔘'];
const regions = ['Asia', 'SA', 'EU', 'US', 'Africa', 'Oceania', 'NA', 'ME', 'CA', 'ANZ'];
const projects = ['Mangrove', 'Amazon', 'DAC', 'Soil', 'Solar', 'Wind', 'Methane', 'Ocean', 'Forest', 'Cookstoves'];

function generateSwarmData(swarmId) {
  const credits = [];
  for (let i = 0; i < CREDITS_PER_SWARM; i++) {
    credits.push({
      id: `${swarmId}-${String(i + 1).padStart(3, '0')}`,
      project: `${projects[i]} ${regions[(swarmId.charCodeAt(0) + i) % regions.length]}`,
      tons: 1000 + Math.floor(Math.random() * 5000),
      confidence: 0.85 + (Math.random() * 0.13),
      swarm: swarmId
    });
  }
  return credits;
}

async function ultraStressTest() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🚀 ULTRA STRESS TEST - 10 SWARM ARCHITECTURE                     ║');
  console.log('║                                                                    ║');
  console.log('║     10 Swarms × 10 Credits = 100 Validations                      ║');
  console.log('║     ABSOLUTE HEDERA CAPACITY TEST                                  ║');
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
    console.log(`🚀 ${SWARM_COUNT} Swarms × ${CREDITS_PER_SWARM} Credits = ${TOTAL_VALIDATIONS} Validations\n`);
  } catch (e) {
    console.log('❌ Client failed:', e.message);
    process.exit(1);
  }

  // Initialize 10 swarms
  const swarms = [];
  for (let i = 0; i < SWARM_COUNT; i++) {
    const swarmId = String.fromCharCode(65 + i); // A-J
    swarms.push({
      id: swarmId,
      emoji: swarmEmojis[i],
      credits: generateSwarmData(swarmId),
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
  console.log('LAUNCHING 10 SWARMS - ULTRA STRESS MODE');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Launch all 10 swarms in parallel
  const swarmPromises = swarms.map(swarm => runSwarm(swarm, client, allResults));
  await Promise.all(swarmPromises);

  const globalEnd = Date.now();
  const totalDuration = globalEnd - globalStart;

  // Calculate metrics
  const totalSubmitted = swarms.reduce((sum, s) => sum + s.submitted, 0);
  const totalFailed = swarms.reduce((sum, s) => sum + s.failed, 0);
  const allLatencies = swarms.flatMap(s => s.latencies);
  
  const throughput = totalSubmitted / (totalDuration / 1000);
  const avgLatency = allLatencies.length > 0 
    ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length 
    : 0;
  const successRate = (totalSubmitted / TOTAL_VALIDATIONS) * 100;

  // Print results
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('ULTRA STRESS TEST - FINAL RESULTS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log('📊 GLOBAL PERFORMANCE:');
  console.log(`   Total Time: ${(totalDuration/1000).toFixed(2)}s`);
  console.log(`   Validations: ${totalSubmitted}/${TOTAL_VALIDATIONS}`);
  console.log(`   Throughput: ${throughput.toFixed(2)} TPS`);
  console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
  console.log(`   Avg Latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`   Failed: ${totalFailed}\n`);

  console.log('🤖 10-SWARM BREAKDOWN:');
  swarms.forEach(swarm => {
    const avgLat = swarm.latencies.length > 0 
      ? swarm.latencies.reduce((a,b) => a+b, 0) / swarm.latencies.length 
      : 0;
    console.log(`   ${swarm.emoji} Swarm ${swarm.id}: ${swarm.submitted}/${CREDITS_PER_SWARM} (${avgLat.toFixed(0)}ms avg)`);
  });
  console.log('');

  // Capacity analysis
  const hederaLimit = 10;
  const utilization = (throughput / hederaLimit) * 100;
  
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('HEDERA CAPACITY ANALYSIS - 10 SWARMS');
  console.log('════════════════════════════════════════════════════════════════════\n');
  
  console.log(`⚡ Vera Throughput: ${throughput.toFixed(2)} TPS`);
  console.log(`🌐 Hedera Limit: ~${hederaLimit} TPS`);
  console.log(`📊 Utilization: ${utilization.toFixed(1)}%`);
  console.log(`📈 Headroom: ${(hederaLimit - throughput).toFixed(2)} TPS\n`);

  if (utilization > 90) {
    console.log('🚨 CRITICAL UTILIZATION');
    console.log('   Vera is at MAXIMUM Hedera capacity!');
    console.log('   Any more swarms will hit rate limits\n');
  } else if (utilization > 50) {
    console.log('⚠️  HIGH UTILIZATION');
    console.log('   Significant load on Hedera network\n');
  } else {
    console.log('✅ MODERATE UTILIZATION');
    console.log('   Room for more swarms before hitting limits\n');
  }

  // Scaling analysis
  console.log('📈 SCALING ANALYSIS:');
  console.log(`   Current: ${throughput.toFixed(2)} TPS with ${SWARM_COUNT} swarms`);
  console.log(`   Per-swarm: ${(throughput / SWARM_COUNT).toFixed(2)} TPS average`);
  console.log(`   Hedera bottleneck at: ~${hederaLimit} TPS`);
  console.log(`   Theoretical max swarms: ${Math.floor(hederaLimit / (throughput / SWARM_COUNT))}\n`);

  console.log('📡 Results on HashScan:');
  console.log(`   Topic: ${TOPIC_ID}`);
  console.log(`   🔗 https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    network: 'mainnet',
    testType: 'ultra_stress_10swarm',
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
      bottleneck: throughput > hederaLimit ? 'Hedera' : 'None',
      maxSwarmsBeforeLimit: Math.floor(hederaLimit / (throughput / SWARM_COUNT))
    }
  };

  fs.writeFileSync('./vera-ultra-10swarm-report.json', JSON.stringify(report, null, 2));
  console.log('✅ Report saved: ./vera-ultra-10swarm-report.json\n');

  client.close();
  process.exit(0);
}

async function runSwarm(swarm, client, allResults) {
  swarm.startTime = Date.now();
  console.log(`${swarm.emoji} [Swarm ${swarm.id}] Launching ${swarm.credits.length} credits...`);

  for (const credit of swarm.credits) {
    const startTime = Date.now();
    
    const message = {
      type: `ultra_stress_10swarm_${swarm.id}`,
      credit_id: credit.id,
      project: credit.project,
      tons: credit.tons,
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
      console.log(`${swarm.emoji} [Swarm ${swarm.id}] ❌ ${credit.id}: ${error.message}`);
    }
  }

  swarm.endTime = Date.now();
  console.log(`${swarm.emoji} [Swarm ${swarm.id}] Complete: ${swarm.submitted}/${CREDITS_PER_SWARM}`);
}

ultraStressTest().catch(console.error);
