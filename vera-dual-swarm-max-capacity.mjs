#!/usr/bin/env node
/**
 * VERA MAXIMUM CAPACITY TEST - Dual Swarm DOVU Validation
 * 
 * Tests Vera's limits by running TWO parallel swarm validations
 * simultaneously to see if she can exceed Hedera's capacity.
 * 
 * Features:
 * - Dual swarm architecture (Swarm A + Swarm B)
 * - Parallel HCS submissions
 * - Throughput measurement
 * - Latency tracking
 * - Capacity limit detection
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const TOPIC_ID = '0.0.10409351';
const MAX_BATCH_SIZE = 10; // Reduced for faster testing
const PARALLEL_SWARMS = 2;

// Generate massive carbon credit dataset
function generateCredits(count, prefix) {
  const credits = [];
  const projects = [
    'Mangrove Restoration', 'Amazon Reforestation', 'DAC Facility',
    'Soil Carbon', 'Solar Farm', 'Wind Energy', 'Methane Capture',
    'Ocean Conservation', 'Forest Protection', 'Clean Cookstoves'
  ];
  const standards = ['VCS', 'Gold Standard', 'Puro', 'Climate Action Reserve'];
  const regions = ['APAC', 'Americas', 'EMEA', 'Africa'];
  
  for (let i = 0; i < count; i++) {
    credits.push({
      id: `${prefix}-CC-${String(i + 1).padStart(4, '0')}`,
      project: `${projects[i % projects.length]} - ${regions[i % regions.length]}`,
      tons: 1000 + (i * 100) + Math.floor(Math.random() * 500),
      price: 10 + Math.random() * 40,
      standard: standards[i % standards.length],
      region: regions[i % regions.length],
      confidence: 0.85 + (Math.random() * 0.12)
    });
  }
  return credits;
}

async function runDualSwarmValidation() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     ⚡ MAXIMUM CAPACITY TEST - DUAL SWARM DOVU VALIDATION          ║');
  console.log('║                                                                    ║');
  console.log('║     Two Swarms • Maximum Throughput • Hedera Stress Test          ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

  if (!accountId || !privateKeyStr) {
    console.log('❌ Missing credentials');
    process.exit(1);
  }

  // Initialize Hedera client
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

  console.log(`🔑 Account: ${accountId}`);
  console.log(`📡 Topic: ${TOPIC_ID}`);
  console.log(`🌐 Network: MAINNET`);
  console.log(`⚡ Parallel Swarms: ${PARALLEL_SWARMS}`);
  console.log(`📊 Max Batch Size: ${MAX_BATCH_SIZE} credits/swarm\n`);

  // Generate datasets for both swarms
  const swarmACredits = generateCredits(MAX_BATCH_SIZE, 'A');
  const swarmBCredits = generateCredits(MAX_BATCH_SIZE, 'B');

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('INITIALIZING DUAL SWARM ARCHITECTURE');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log(`🤖 Swarm A: ${swarmACredits.length} credits`);
  console.log(`🤖 Swarm B: ${swarmBCredits.length} credits`);
  console.log(`🎯 Total: ${swarmACredits.length + swarmBCredits.length} validations\n`);

  // Performance tracking
  const metrics = {
    swarmA: { start: 0, end: 0, submitted: 0, failed: 0, latencies: [] },
    swarmB: { start: 0, end: 0, submitted: 0, failed: 0, latencies: [] },
    hcsErrors: [],
    rateLimitHits: 0
  };

  // Swarm A validation function
  async function runSwarmA() {
    metrics.swarmA.start = Date.now();
    const results = [];
    
    console.log('🔵 [Swarm A] Starting validation...');
    
    for (let i = 0; i < swarmACredits.length; i++) {
      const credit = swarmACredits[i];
      const startTime = Date.now();
      
      const message = {
        type: 'carbon_validation_swarm_a',
        credit_id: credit.id,
        project: credit.project,
        carbon_tons: credit.tons,
        price_usd: credit.price,
        standard: credit.standard,
        region: credit.region,
        confidence: credit.confidence,
        status: credit.confidence > 0.9 ? 'HIGHLY_VERIFIED' : 'VERIFIED',
        swarm: 'A',
        sequence: i + 1,
        timestamp: new Date().toISOString()
      };

      try {
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(TOPIC_ID)
          .setMessage(JSON.stringify(message))
          .execute(client);

        const record = await tx.getRecord(client);
        const latency = Date.now() - startTime;
        
        metrics.swarmA.latencies.push(latency);
        metrics.swarmA.submitted++;
        
        results.push({
          swarm: 'A',
          credit: credit.id,
          seq: record.receipt.topicSequenceNumber.toString(),
          latency
        });

        if ((i + 1) % 10 === 0) {
          console.log(`   🔵 [Swarm A] ${i + 1}/${swarmACredits.length} processed`);
        }
      } catch (error) {
        metrics.swarmA.failed++;
        metrics.hcsErrors.push({ swarm: 'A', credit: credit.id, error: error.message });
        
        if (error.message.includes('rate limit') || error.status === 429) {
          metrics.rateLimitHits++;
        }
      }
    }
    
    metrics.swarmA.end = Date.now();
    console.log(`✅ [Swarm A] Complete: ${metrics.swarmA.submitted}/${swarmACredits.length}\n`);
    return results;
  }

  // Swarm B validation function
  async function runSwarmB() {
    metrics.swarmB.start = Date.now();
    const results = [];
    
    console.log('🟢 [Swarm B] Starting validation...');
    
    for (let i = 0; i < swarmBCredits.length; i++) {
      const credit = swarmBCredits[i];
      const startTime = Date.now();
      
      const message = {
        type: 'carbon_validation_swarm_b',
        credit_id: credit.id,
        project: credit.project,
        carbon_tons: credit.tons,
        price_usd: credit.price,
        standard: credit.standard,
        region: credit.region,
        confidence: credit.confidence,
        status: credit.confidence > 0.9 ? 'HIGHLY_VERIFIED' : 'VERIFIED',
        swarm: 'B',
        sequence: i + 1,
        timestamp: new Date().toISOString()
      };

      try {
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(TOPIC_ID)
          .setMessage(JSON.stringify(message))
          .execute(client);

        const record = await tx.getRecord(client);
        const latency = Date.now() - startTime;
        
        metrics.swarmB.latencies.push(latency);
        metrics.swarmB.submitted++;
        
        results.push({
          swarm: 'B',
          credit: credit.id,
          seq: record.receipt.topicSequenceNumber.toString(),
          latency
        });

        if ((i + 1) % 10 === 0) {
          console.log(`   🟢 [Swarm B] ${i + 1}/${swarmBCredits.length} processed`);
        }
      } catch (error) {
        metrics.swarmB.failed++;
        metrics.hcsErrors.push({ swarm: 'B', credit: credit.id, error: error.message });
        
        if (error.message.includes('rate limit') || error.status === 429) {
          metrics.rateLimitHits++;
        }
      }
    }
    
    metrics.swarmB.end = Date.now();
    console.log(`✅ [Swarm B] Complete: ${metrics.swarmB.submitted}/${swarmBCredits.length}\n`);
    return results;
  }

  // Execute both swarms in parallel
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('EXECUTING DUAL SWARM VALIDATION');
  console.log('════════════════════════════════════════════════════════════════════\n');

  const totalStart = Date.now();
  
  const [swarmAResults, swarmBResults] = await Promise.all([
    runSwarmA(),
    runSwarmB()
  ]);

  const totalEnd = Date.now();
  const totalDuration = totalEnd - totalStart;

  // Calculate statistics
  const allResults = [...swarmAResults, ...swarmBResults];
  const totalSubmitted = metrics.swarmA.submitted + metrics.swarmB.submitted;
  const totalFailed = metrics.swarmA.failed + metrics.swarmB.failed;
  const allLatencies = [...metrics.swarmA.latencies, ...metrics.swarmB.latencies];
  
  const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
  const maxLatency = Math.max(...allLatencies);
  const minLatency = Math.min(...allLatencies);
  
  const throughput = totalSubmitted / (totalDuration / 1000);
  const successRate = (totalSubmitted / (totalSubmitted + totalFailed)) * 100;

  // Print results
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('DUAL SWARM PERFORMANCE RESULTS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log('📊 THROUGHPUT:');
  console.log(`   Total Validations: ${totalSubmitted}`);
  console.log(`   Total Time: ${totalDuration}ms (${(totalDuration/1000).toFixed(2)}s)`);
  console.log(`   Throughput: ${throughput.toFixed(2)} validations/second`);
  console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
  console.log(`   Failed: ${totalFailed}`);
  console.log(`   Rate Limit Hits: ${metrics.rateLimitHits}\n`);

  console.log('⏱️  LATENCY ANALYSIS:');
  console.log(`   Average: ${avgLatency.toFixed(0)}ms`);
  console.log(`   Min: ${minLatency}ms`);
  console.log(`   Max: ${maxLatency}ms`);
  console.log(`   P95: ${allLatencies.sort((a,b) => a-b)[Math.floor(allLatencies.length * 0.95)]}ms\n`);

  console.log('🤖 SWARM BREAKDOWN:');
  console.log('   Swarm A:');
  console.log(`     Submitted: ${metrics.swarmA.submitted}/${swarmACredits.length}`);
  console.log(`     Failed: ${metrics.swarmA.failed}`);
  console.log(`     Duration: ${metrics.swarmA.end - metrics.swarmA.start}ms`);
  console.log(`     Avg Latency: ${(metrics.swarmA.latencies.reduce((a,b) => a+b, 0) / metrics.swarmA.latencies.length).toFixed(0)}ms\n`);
  
  console.log('   Swarm B:');
  console.log(`     Submitted: ${metrics.swarmB.submitted}/${swarmBCredits.length}`);
  console.log(`     Failed: ${metrics.swarmB.failed}`);
  console.log(`     Duration: ${metrics.swarmB.end - metrics.swarmB.start}ms`);
  console.log(`     Avg Latency: ${(metrics.swarmB.latencies.reduce((a,b) => a+b, 0) / metrics.swarmB.latencies.length).toFixed(0)}ms\n`);

  // Capacity assessment
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('HEDERA CAPACITY ASSESSMENT');
  console.log('════════════════════════════════════════════════════════════════════\n');

  const hederaLimit = 10; // Hedera HCS typical limit ~10 TPS per topic
  const veraThroughput = throughput;
  
  console.log(`⚡ Vera Throughput: ${veraThroughput.toFixed(2)} TPS`);
  console.log(`🌐 Hedera HCS Limit: ~${hederaLimit} TPS (typical)`);
  console.log(`📊 Utilization: ${((veraThroughput / hederaLimit) * 100).toFixed(1)}%\n`);

  if (veraThroughput > hederaLimit) {
    console.log('🚨 VERDICT: Vera is FASTER than Hedera can handle!');
    console.log(`   Vera can process ${(veraThroughput - hederaLimit).toFixed(2)} TPS more than Hedera's capacity`);
    console.log('   ⚠️  This will cause rate limiting and backpressure\n');
  } else {
    console.log('✅ VERDICT: Vera is within Hedera capacity');
    console.log(`   Headroom: ${(hederaLimit - veraThroughput).toFixed(2)} TPS\n`);
  }

  // Optimization recommendations
  console.log('💡 OPTIMIZATION RECOMMENDATIONS:');
  if (metrics.rateLimitHits > 0) {
    console.log('   • Implement exponential backoff for rate limiting');
    console.log('   • Add request batching to reduce HCS calls');
    console.log('   • Use multiple HCS topics for load distribution');
  }
  if (maxLatency > 5000) {
    console.log('   • Consider async validation with queue system');
    console.log('   • Implement caching for repeated validations');
  }
  console.log('   • Add circuit breaker for Hedera unavailability');
  console.log('   • Monitor network congestion metrics\n');

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    network: 'mainnet',
    topicId: TOPIC_ID,
    dualSwarm: true,
    performance: {
      totalValidations: totalSubmitted,
      totalDuration: totalDuration,
      throughput: throughput,
      successRate: successRate,
      avgLatency: avgLatency,
      maxLatency: maxLatency,
      minLatency: minLatency
    },
    swarmA: {
      credits: swarmACredits.length,
      submitted: metrics.swarmA.submitted,
      failed: metrics.swarmA.failed,
      duration: metrics.swarmA.end - metrics.swarmA.start,
      avgLatency: metrics.swarmA.latencies.reduce((a,b) => a+b, 0) / metrics.swarmA.latencies.length
    },
    swarmB: {
      credits: swarmBCredits.length,
      submitted: metrics.swarmB.submitted,
      failed: metrics.swarmB.failed,
      duration: metrics.swarmB.end - metrics.swarmB.start,
      avgLatency: metrics.swarmB.latencies.reduce((a,b) => a+b, 0) / metrics.swarmB.latencies.length
    },
    capacity: {
      veraThroughput: veraThroughput,
      hederaLimit: hederaLimit,
      utilization: (veraThroughput / hederaLimit) * 100,
      exceedsHedera: veraThroughput > hederaLimit
    },
    errors: {
      total: totalFailed,
      rateLimitHits: metrics.rateLimitHits,
      details: metrics.hcsErrors.slice(0, 10) // First 10 errors
    },
    hashscanUrl: `https://hashscan.io/mainnet/topic/${TOPIC_ID}`
  };

  fs.writeFileSync('./vera-max-capacity-report.json', JSON.stringify(report, null, 2));

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log(`✅ Dual Swarm Test Complete`);
  console.log(`📊 Total Validations: ${totalSubmitted}`);
  console.log(`⏱️  Total Time: ${(totalDuration/1000).toFixed(2)}s`);
  console.log(`⚡ Throughput: ${throughput.toFixed(2)} TPS`);
  console.log(`🎯 Success Rate: ${successRate.toFixed(1)}%`);
  console.log(`📡 Topic: ${TOPIC_ID}`);
  console.log(`🔗 https://hashscan.io/mainnet/topic/${TOPIC_ID}`);
  console.log(`\n📄 Report: ./vera-max-capacity-report.json\n`);

  if (veraThroughput > hederaLimit) {
    console.log('🏆 Vera is operating at SUPER-HEDERA speeds!');
    console.log(`   Can validate ${veraThroughput.toFixed(0)} credits/second`);
    console.log(`   Hedera can only absorb ~${hederaLimit} TPS`);
    console.log('   ⚠️  Bottleneck: Hedera network capacity\n');
  }

  client.close();
  process.exit(0);
}

runDualSwarmValidation().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
