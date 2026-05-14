#!/usr/bin/env tsx
/**
 * Load Test Runner
 * Simple load test execution script
 */

import { LoadTestHarness } from './loadTest.js';

async function runLoadTest() {
  console.log('🚀 Starting Load Test\n');
  
  const config = {
    targetHcsMessagesPerSecond: 50,
    targetLatencyMs: 1000,
    maxConcurrentAgents: 1000,
    testDurationSeconds: 300, // 5 minutes
    rampUpSeconds: 60,
  };
  
  console.log('Configuration:');
  console.log(`  Target: ${config.targetHcsMessagesPerSecond} HCS msg/s`);
  console.log(`  Max Latency: ${config.targetLatencyMs}ms`);
  console.log(`  Max Agents: ${config.maxConcurrentAgents}`);
  console.log(`  Duration: ${config.testDurationSeconds}s\n`);
  
  const harness = new LoadTestHarness(config);
  
  harness.on('test_started', () => console.log('✅ Test started'));
  harness.on('test_complete', (result) => {
    console.log('\n📊 Results:');
    console.log(`  Success: ${result.success ? '✅' : '❌'}`);
    console.log(`  Messages/sec: ${result.messagesPerSecond.toFixed(1)}`);
    console.log(`  Avg Latency: ${result.averageLatency.toFixed(1)}ms`);
    console.log(`  Max Latency: ${result.maxLatency.toFixed(1)}ms`);
    console.log(`  Failed: ${result.failedMessages}`);
  });
  
  const result = await harness.runTest();
  
  console.log('\n' + (result.success ? '✅ Load test PASSED' : '❌ Load test FAILED'));
  process.exit(result.success ? 0 : 1);
}

runLoadTest();
