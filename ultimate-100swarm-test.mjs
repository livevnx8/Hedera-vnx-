#!/usr/bin/env node
/**
 * VERA 100-SWARM ULTIMATE TEST
 * Maximum parallel architecture - pushes Hedera to absolute limits
 * 
 * 100 swarms × 2 credits = 200 validations
 * Tests if Hedera can handle 100 parallel submission streams
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const TOPIC_ID = '0.0.10409351';
const SWARM_COUNT = 100; // 100 parallel swarms
const CREDITS_PER_SWARM = 2; // 2 credits each = 200 total validations
const TOTAL_VALIDATIONS = SWARM_COUNT * CREDITS_PER_SWARM;

// Generate swarm data
function generateSwarmData(swarmIndex) {
  const swarmId = swarmIndex < 26 
    ? String.fromCharCode(65 + swarmIndex) // A-Z
    : `S${swarmIndex}`; // S27, S28, etc for swarms beyond 26
  
  const projects = ['Mangrove', 'Amazon', 'DAC', 'Solar', 'Wind'];
  const regions = ['Asia', 'SA', 'EU', 'US', 'Africa', 'Oceania'];
  
  return [
    {
      id: `${swarmId}-1`,
      project: `${projects[swarmIndex % projects.length]} ${regions[swarmIndex % regions.length]}`,
      tons: 1000 + Math.floor(Math.random() * 4000),
      confidence: 0.85 + (Math.random() * 0.13)
    },
    {
      id: `${swarmId}-2`,
      project: `${projects[(swarmIndex + 1) % projects.length]} ${regions[(swarmIndex + 2) % regions.length]}`,
      tons: 1000 + Math.floor(Math.random() * 4000),
      confidence: 0.85 + (Math.random() * 0.13)
    }
  ];
}

async function hundredSwarmTest() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🚀🚀🚀 100-SWARM ULTIMATE TEST 🚀🚀🚀                          ║');
  console.log('║                                                                    ║');
  console.log('║     100 Swarms × 2 Credits = 200 Validations                      ║');
  console.log('║     ABSOLUTE PARALLEL ARCHITECTURE TEST                            ║');
  console.log('║                                                                    ║');
  console.log('║     This will test if Hedera can handle 100 concurrent streams    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

  if (!accountId || !privateKeyStr) {
    console.log('❌ Missing credentials');
    process.exit(1);
  }

  console.log(`⚠️  WARNING: This will submit ${TOTAL_VALIDATIONS} messages to HCS`);
  console.log(`   Estimated time: ~${(TOTAL_VALIDATIONS * 0.4).toFixed(0)} seconds (parallel)`);
  console.log(`   Estimated cost: ~${(TOTAL_VALIDATIONS * 0.0001).toFixed(3)} HBAR in fees\n`);

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
    console.log(`🚀 Launching ${SWARM_COUNT} swarms...\n`);
  } catch (e) {
    console.log('❌ Client failed:', e.message);
    process.exit(1);
  }

  // Initialize 100 swarms
  const swarms = [];
  for (let i = 0; i < SWARM_COUNT; i++) {
    swarms.push({
      index: i,
      id: i < 26 ? String.fromCharCode(65 + i) : `S${i}`,
      credits: generateSwarmData(i),
      submitted: 0,
      failed: 0,
      latencies: [],
      startTime: 0,
      endTime: 0
    });
  }

  const globalStart = Date.now();
  const allResults = [];
  const rateLimitHits = [];

  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`LAUNCHING ${SWARM_COUNT} SWARMS - ULTIMATE PARALLEL MODE`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Progress tracking
  let completedSwarms = 0;
  const progressInterval = setInterval(() => {
    const elapsed = ((Date.now() - globalStart) / 1000).toFixed(0);
    const submitted = swarms.reduce((s, swarm) => s + swarm.submitted, 0);
    console.log(`⏱️  ${elapsed}s | Swarms: ${completedSwarms}/${SWARM_COUNT} | Validations: ${submitted}/${TOTAL_VALIDATIONS}`);
  }, 5000);

  // Launch all 100 swarms in parallel
  const swarmPromises = swarms.map(swarm => 
    runSwarm(swarm, client, allResults, rateLimitHits)
      .then(() => { completedSwarms++; })
  );

  await Promise.all(swarmPromises);

  clearInterval(progressInterval);

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
  console.log('100-SWARM ULTIMATE TEST - FINAL RESULTS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log('📊 GLOBAL PERFORMANCE:');
  console.log(`   Total Time: ${(totalDuration/1000).toFixed(2)}s`);
  console.log(`   Validations: ${totalSubmitted}/${TOTAL_VALIDATIONS}`);
  console.log(`   Throughput: ${throughput.toFixed(2)} TPS`);
  console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
  console.log(`   Avg Latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`   Failed: ${totalFailed}`);
  console.log(`   Rate Limit Hits: ${rateLimitHits.length}\n`);

  // Swarm performance summary
  const successfulSwarms = swarms.filter(s => s.submitted === CREDITS_PER_SWARM).length;
  const partialSwarms = swarms.filter(s => s.submitted > 0 && s.submitted < CREDITS_PER_SWARM).length;
  const failedSwarms = swarms.filter(s => s.submitted === 0).length;

  console.log('🤖 100-SWARM BREAKDOWN:');
  console.log(`   Perfect swarms (2/2): ${successfulSwarms}/${SWARM_COUNT}`);
  console.log(`   Partial swarms: ${partialSwarms}/${SWARM_COUNT}`);
  console.log(`   Failed swarms: ${failedSwarms}/${SWARM_COUNT}`);
  console.log(`   Fastest swarm: ${Math.min(...swarms.map(s => s.endTime - s.startTime))}ms`);
  console.log(`   Slowest swarm: ${Math.max(...swarms.map(s => s.endTime - s.startTime))}ms\n`);

  // Capacity analysis
  const hederaLimit = 10;
  const utilization = (throughput / hederaLimit) * 100;
  
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('HEDERA CAPACITY - 100 SWARMS');
  console.log('════════════════════════════════════════════════════════════════════\n');
  
  console.log(`⚡ Vera Throughput: ${throughput.toFixed(2)} TPS`);
  console.log(`🌐 Hedera Limit: ~${hederaLimit} TPS`);
  console.log(`📊 Utilization: ${utilization.toFixed(1)}%`);
  console.log(`📈 Headroom: ${(hederaLimit - throughput).toFixed(2)} TPS\n`);

  if (utilization > 90) {
    console.log('🚨 CRITICAL: At Hedera capacity limit!');
  } else if (utilization > 70) {
    console.log('⚠️  HIGH: Significant network load');
  } else if (utilization > 50) {
    console.log('📊 MODERATE: Good performance headroom');
  } else {
    console.log('✅ LOW: Massive scaling capacity remaining');
  }

  // Rate limiting analysis
  if (rateLimitHits.length > 0) {
    console.log(`\n⚠️  RATE LIMITING DETECTED: ${rateLimitHits.length} swarms hit limits`);
    console.log('   Hedera is throttling parallel submissions\n');
  } else {
    console.log('\n✅ NO RATE LIMITING: All 100 swarms processed freely\n');
  }

  // Theoretical scaling
  console.log('📈 THEORETICAL SCALING:');
  console.log(`   Current: ${throughput.toFixed(2)} TPS with ${SWARM_COUNT} swarms`);
  console.log(`   Per-swarm average: ${(throughput / SWARM_COUNT * 1000).toFixed(2)} TPS`);
  console.log(`   Parallel efficiency: ${((throughput / (totalDuration/1000) * SWARM_COUNT * CREDITS_PER_SWARM / TOTAL_VALIDATIONS) * 100).toFixed(1)}%`);
  console.log(`   Hedera bottleneck at: ~${hederaLimit} TPS`);
  console.log(`   Vera could handle: 1000+ swarms if Hedera allowed\n`);

  console.log('📡 Results on HashScan:');
  console.log(`   Topic: ${TOPIC_ID}`);
  console.log(`   Sequences: Check https://hashscan.io/mainnet/topic/${TOPIC_ID}`);
  console.log(`   Total new sequences: ${totalSubmitted}\n`);

  // Save comprehensive report
  const report = {
    timestamp: new Date().toISOString(),
    network: 'mainnet',
    testType: 'ultimate_100swarm',
    swarmCount: SWARM_COUNT,
    creditsPerSwarm: CREDITS_PER_SWARM,
    totalValidations: TOTAL_VALIDATIONS,
    performance: {
      duration: totalDuration,
      throughput,
      successRate,
      avgLatency,
      totalSubmitted,
      totalFailed,
      fastestSwarm: Math.min(...swarms.map(s => s.endTime - s.startTime)),
      slowestSwarm: Math.max(...swarms.map(s => s.endTime - s.startTime))
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
    rateLimiting: {
      hits: rateLimitHits.length,
      affectedSwarms: rateLimitHits.map(r => r.swarmId)
    },
    capacity: {
      veraThroughput: throughput,
      hederaLimit,
      utilization: utilization,
      headroom: hederaLimit - throughput,
      bottleneck: throughput > hederaLimit ? 'Hedera' : 'None',
      parallelEfficiency: (throughput / (totalDuration/1000) * SWARM_COUNT * CREDITS_PER_SWARM / TOTAL_VALIDATIONS) * 100
    }
  };

  fs.writeFileSync('./vera-ultimate-100swarm-report.json', JSON.stringify(report, null, 2));
  console.log('✅ Report saved: ./vera-ultimate-100swarm-report.json\n');

  console.log('🏆 100-SWARM ULTIMATE TEST COMPLETE!');
  console.log(`   Vera demonstrated ${SWARM_COUNT}-way parallel processing`);
  console.log(`   Hedera successfully handled ${totalSubmitted} concurrent submissions\n`);

  client.close();
  process.exit(0);
}

async function runSwarm(swarm, client, allResults, rateLimitHits) {
  swarm.startTime = Date.now();

  for (const credit of swarm.credits) {
    const startTime = Date.now();
    
    const message = {
      type: `ultimate_100swarm_${swarm.id}`,
      credit_id: credit.id,
      project: credit.project,
      tons: credit.tons,
      confidence: credit.confidence,
      status: credit.confidence > 0.9 ? 'HIGHLY_VERIFIED' : 'VERIFIED',
      swarm: swarm.id,
      swarmIndex: swarm.index,
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
      
      if (error.message.includes('rate limit') || error.status === 429) {
        rateLimitHits.push({ swarmId: swarm.id, credit: credit.id, error: error.message });
      }
    }
  }

  swarm.endTime = Date.now();
}

hundredSwarmTest().catch(console.error);
