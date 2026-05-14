#!/usr/bin/env node
/**
 * VERA 4000 TPS EXTREME STRESS TEST
 * Ultimate Hedera capacity validation with DOVU + HCS
 * 
 * Goal: Push Hedera to absolute limits with massive parallel swarms
 * Reality check: Hedera HCS ~10 TPS limit per topic
 * This test will find the ACTUAL breaking point
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const TOPIC_ID = '0.0.10409351';

// Configuration - attempting 4000 TPS would need 400 swarms submitting 10 TPS each
// But realistically, let's test what Hedera ACTUALLY allows
const SWARM_COUNT = 200; // 200 parallel swarms
const CREDITS_PER_SWARM = 5; // 5 validations each = 1000 total validations
const BATCH_SIZE = 50; // Submit in batches to avoid overwhelming
const TOTAL_VALIDATIONS = SWARM_COUNT * CREDITS_PER_SWARM;

const regions = ['Asia', 'SA', 'EU', 'US', 'Africa', 'Oceania', 'NA', 'ME', 'CA', 'ANZ'];
const projects = ['Mangrove', 'Amazon', 'DAC', 'Soil', 'Solar', 'Wind', 'Methane', 'Ocean', 'Forest', 'Cookstoves'];

function generateSwarmCredits(swarmIndex) {
  const credits = [];
  const swarmId = swarmIndex < 26 
    ? String.fromCharCode(65 + swarmIndex) 
    : `S${swarmIndex}`;
  
  for (let i = 0; i < CREDITS_PER_SWARM; i++) {
    credits.push({
      id: `${swarmId}-${i + 1}`,
      project: `${projects[(swarmIndex + i) % projects.length]} ${regions[(swarmIndex + i) % regions.length]}`,
      tons: 1000 + Math.floor(Math.random() * 5000),
      price: 10 + Math.random() * 50,
      confidence: 0.85 + (Math.random() * 0.13),
      standard: ['VCS', 'Gold Standard', 'Puro'][i % 3],
      swarm: swarmId
    });
  }
  return credits;
}

async function extremeStressTest() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🔥🔥🔥 4000 TPS EXTREME STRESS TEST 🔥🔥🔥                      ║');
  console.log('║                                                                    ║');
  console.log('║     Goal: Push Hedera to ABSOLUTE LIMITS                            ║');
  console.log('║     Architecture: 200 Swarms × 5 Credits = 1000 Validations       ║');
  console.log('║     Target: Find ACTUAL Hedera TPS ceiling                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

  if (!accountId || !privateKeyStr) {
    console.log('❌ Missing credentials');
    process.exit(1);
  }

  console.log(`⚠️  WARNING: This test submits ${TOTAL_VALIDATIONS} HCS messages`);
  console.log(`   Target TPS: 4000 (theoretical) | Hedera limit: ~10 TPS (realistic)`);
  console.log(`   This will test WHERE Hedera actually breaks\n`);

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
    console.log(`✅ Client initialized: ${accountId}`);
    console.log(`🚀 Deploying ${SWARM_COUNT} parallel validation swarms\n`);
  } catch (e) {
    console.log('❌ Client failed:', e.message);
    process.exit(1);
  }

  // Initialize 200 swarms
  const swarms = [];
  for (let i = 0; i < SWARM_COUNT; i++) {
    swarms.push({
      index: i,
      id: i < 26 ? String.fromCharCode(65 + i) : `S${i}`,
      credits: generateSwarmCredits(i),
      submitted: 0,
      failed: 0,
      rateLimited: 0,
      latencies: [],
      startTime: 0,
      endTime: 0
    });
  }

  const globalStart = Date.now();
  const allResults = [];
  const rateLimitEvents = [];
  let totalRateLimitHits = 0;

  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`EXTREME TEST: ${SWARM_COUNT} SWARMS LAUNCHING`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Progress tracker
  let completedSwarms = 0;
  let totalSubmitted = 0;
  const progressInterval = setInterval(() => {
    const elapsed = ((Date.now() - globalStart) / 1000).toFixed(0);
    const currentThroughput = totalSubmitted / (Math.max(1, Date.now() - globalStart) / 1000);
    console.log(`⏱️  ${elapsed}s | Swarms: ${completedSwarms}/${SWARM_COUNT} | Validations: ${totalSubmitted}/${TOTAL_VALIDATIONS} | TPS: ${currentThroughput.toFixed(2)} | Rate Limits: ${totalRateLimitHits}`);
  }, 3000);

  // Launch swarms in controlled batches to prevent system overload
  const BATCH_SWARM_COUNT = 50; // Launch 50 swarms at a time
  const swarmBatches = [];
  
  for (let i = 0; i < swarms.length; i += BATCH_SWARM_COUNT) {
    swarmBatches.push(swarms.slice(i, i + BATCH_SWARM_COUNT));
  }

  console.log(`Launching in ${swarmBatches.length} batches of ${BATCH_SWARM_COUNT} swarms each...\n`);

  for (let batchIndex = 0; batchIndex < swarmBatches.length; batchIndex++) {
    const batch = swarmBatches[batchIndex];
    console.log(`🚀 Batch ${batchIndex + 1}/${swarmBatches.length}: Launching swarms ${batch[0].id} to ${batch[batch.length - 1].id}...`);
    
    const batchPromises = batch.map(swarm => 
      runSwarm(swarm, client, allResults, rateLimitEvents, () => {
        completedSwarms++;
        totalSubmitted = swarms.reduce((sum, s) => sum + s.submitted, 0);
      })
    );
    
    await Promise.all(batchPromises);
    
    // Brief pause between batches to let Hedera breathe
    if (batchIndex < swarmBatches.length - 1) {
      console.log(`   ⏳ Pausing 2s between batches...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  clearInterval(progressInterval);

  const globalEnd = Date.now();
  const totalDuration = globalEnd - globalStart;

  // Calculate final metrics
  const finalSubmitted = swarms.reduce((sum, s) => sum + s.submitted, 0);
  const finalFailed = swarms.reduce((sum, s) => sum + s.failed, 0);
  const allLatencies = swarms.flatMap(s => s.latencies);
  
  const throughput = finalSubmitted / (totalDuration / 1000);
  const avgLatency = allLatencies.length > 0 
    ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length 
    : 0;
  const successRate = (finalSubmitted / TOTAL_VALIDATIONS) * 100;

  // Print results
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('4000 TPS EXTREME TEST - FINAL RESULTS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log('📊 EXTREME PERFORMANCE:');
  console.log(`   Total Time: ${(totalDuration/1000).toFixed(2)}s (${(totalDuration/60000).toFixed(2)} mins)`);
  console.log(`   Validations: ${finalSubmitted}/${TOTAL_VALIDATIONS}`);
  console.log(`   Throughput: ${throughput.toFixed(2)} TPS`);
  console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
  console.log(`   Avg Latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`   Failed: ${finalFailed}`);
  console.log(`   Rate Limit Hits: ${totalRateLimitHits}\n`);

  // Swarm summary
  const perfectSwarms = swarms.filter(s => s.submitted === CREDITS_PER_SWARM).length;
  const partialSwarms = swarms.filter(s => s.submitted > 0 && s.submitted < CREDITS_PER_SWARM).length;
  const failedSwarms = swarms.filter(s => s.submitted === 0).length;
  const rateLimitedSwarms = swarms.filter(s => s.rateLimited > 0).length;

  console.log('🤖 200-SWARM BREAKDOWN:');
  console.log(`   ✅ Perfect swarms (5/5): ${perfectSwarms}/${SWARM_COUNT}`);
  console.log(`   ⚠️  Partial swarms: ${partialSwarms}/${SWARM_COUNT}`);
  console.log(`   ❌ Failed swarms: ${failedSwarms}/${SWARM_COUNT}`);
  console.log(`   🚫 Rate-limited swarms: ${rateLimitedSwarms}/${SWARM_COUNT}`);
  console.log(`   Fastest: ${Math.min(...swarms.filter(s => s.endTime > 0).map(s => s.endTime - s.startTime))}ms`);
  console.log(`   Slowest: ${Math.max(...swarms.filter(s => s.endTime > 0).map(s => s.endTime - s.startTime))}ms\n`);

  // Capacity analysis - THE REALITY CHECK
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('HEDERA CAPACITY - 4000 TPS REALITY CHECK');
  console.log('════════════════════════════════════════════════════════════════════\n');
  
  const hederaTheoreticalLimit = 10;
  const hederaActualLimit = throughput > hederaTheoreticalLimit ? throughput : hederaTheoreticalLimit;
  const utilization = (throughput / hederaTheoreticalLimit) * 100;
  
  console.log(`🎯 TARGET TPS: 4000 (user request)`);
  console.log(`⚡ Vera Achieved: ${throughput.toFixed(2)} TPS`);
  console.log(`🌐 Hedera Limit: ~${hederaTheoreticalLimit} TPS (HCS per topic)`);
  console.log(`📊 Utilization: ${utilization.toFixed(1)}%`);
  console.log(`💨 Gap to 4000 TPS: ${(4000 - throughput).toFixed(0)} TPS\n`);

  if (throughput >= 4000) {
    console.log('🏆🏆🏆 UNBELIEVABLE! Vera pushed Hedera beyond 4000 TPS!');
    console.log('   This is a blockchain performance breakthrough!\n');
  } else if (throughput >= 100) {
    console.log('🔥 EXCELLENT! Vera achieved 100+ TPS on Hedera!');
    console.log('   Far exceeding typical HCS limits!\n');
  } else if (throughput >= 10) {
    console.log('✅ GOOD! Vera hit Hedera\'s expected HCS limit (~10 TPS)');
    console.log('   Performing at theoretical maximum!\n');
  } else {
    console.log('📊 MODERATE: Operating below Hedera limit');
    console.log(`   Throughput: ${throughput.toFixed(2)} TPS (limit: ~10 TPS)\n`);
  }

  // Rate limiting analysis
  if (totalRateLimitHits > 0) {
    console.log('🚫 RATE LIMITING ANALYSIS:');
    console.log(`   Total hits: ${totalRateLimitHits}`);
    console.log(`   Affected swarms: ${rateLimitedSwarms}/${SWARM_COUNT}`);
    console.log('   Hedera throttled parallel submissions\n');
  }

  // The 4000 TPS analysis
  console.log('📈 4000 TPS FEASIBILITY:');
  console.log(`   Current: ${throughput.toFixed(2)} TPS with ${SWARM_COUNT} swarms`);
  console.log(`   To reach 4000 TPS would need: ${Math.ceil(4000 / (throughput / SWARM_COUNT))} swarms`);
  console.log(`   Or: ${(4000 / throughput).toFixed(1)}× more throughput`);
  console.log('   Reality: Hedera HCS has ~10 TPS limit per topic\n');
  console.log('   💡 Solution: Use multiple HCS topics for true parallelism\n');

  console.log('📡 Results on HashScan:');
  console.log(`   Topic: ${TOPIC_ID}`);
  console.log(`   🔗 https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    network: 'mainnet',
    testType: 'extreme_4000tps',
    swarmCount: SWARM_COUNT,
    creditsPerSwarm: CREDITS_PER_SWARM,
    totalValidations: TOTAL_VALIDATIONS,
    targetTPS: 4000,
    performance: {
      duration: totalDuration,
      throughput,
      successRate,
      avgLatency,
      totalSubmitted: finalSubmitted,
      totalFailed: finalFailed,
      fastestSwarm: Math.min(...swarms.filter(s => s.endTime > 0).map(s => s.endTime - s.startTime)),
      slowestSwarm: Math.max(...swarms.filter(s => s.endTime > 0).map(s => s.endTime - s.startTime))
    },
    rateLimiting: {
      totalHits: totalRateLimitHits,
      affectedSwarms: rateLimitedSwarms,
      events: rateLimitEvents.slice(0, 20) // First 20 events
    },
    capacity: {
      veraThroughput: throughput,
      hederaLimit: hederaTheoreticalLimit,
      hederaActual: hederaActualLimit,
      utilization: utilization,
      gapTo4000: 4000 - throughput,
      bottleneck: throughput > hederaTheoreticalLimit ? 'Testing Hardware' : 'Hedera Network'
    },
    conclusion: throughput >= 4000 ? 'ACHIEVED_4000_TPS' : 
                throughput >= 100 ? 'EXCEEDED_100_TPS' :
                throughput >= 10 ? 'HEDERA_LIMIT_REACHED' : 'BELOW_LIMIT'
  };

  fs.writeFileSync('./vera-extreme-4000tps-report.json', JSON.stringify(report, null, 2));
  console.log('✅ Report saved: ./vera-extreme-4000tps-report.json\n');

  console.log('🔥 EXTREME STRESS TEST COMPLETE!');
  console.log(`   Vera pushed Hedera with ${SWARM_COUNT} parallel swarms`);
  console.log(`   Achieved ${throughput.toFixed(2)} TPS (target: 4000 TPS)`);
  console.log(`   ${finalSubmitted} validations submitted to HCS\n`);

  client.close();
  process.exit(0);
}

async function runSwarm(swarm, client, allResults, rateLimitEvents, onComplete) {
  swarm.startTime = Date.now();

  for (const credit of swarm.credits) {
    const startTime = Date.now();
    
    const message = {
      type: `extreme_4000tps_${swarm.id}`,
      credit_id: credit.id,
      project: credit.project,
      tons: credit.tons,
      price: credit.price,
      confidence: credit.confidence,
      standard: credit.standard,
      status: credit.confidence > 0.9 ? 'HIGHLY_VERIFIED' : 'VERIFIED',
      swarm: swarm.id,
      swarmIndex: swarm.index,
      timestamp: new Date().toISOString(),
      target: '4000tps_test'
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
      
      if (error.message.includes('rate limit') || error.status === 429 || error.message.includes('BUSY')) {
        swarm.rateLimited++;
        rateLimitEvents.push({ swarm: swarm.id, credit: credit.id, error: error.message, time: Date.now() });
      }
    }
  }

  swarm.endTime = Date.now();
  onComplete();
}

extremeStressTest().catch(console.error);
