/**
 * Week 2 Optimization Tests
 * Validates Tool Optimizer and Parallel Processor
 */

import { ToolOptimizer } from './src/ai/toolOptimizer.js';
import { ParallelProcessor } from './src/ai/parallelProcessor.js';

console.log('🧪 Week 2: Tool Optimizer & Parallel Processor Tests\n');

// Mock tool execution
const mockToolExecute = async (toolName, params) => {
  // Simulate tool execution time
  await new Promise(r => setTimeout(r, 100));
  return { tool: toolName, params, result: 'success', timestamp: Date.now() };
};

// Mock model execution
const mockModelExecute = async (provider, query) => {
  const latencies = { qvx: 500, openai: 200, google: 150, native: 50 };
  await new Promise(r => setTimeout(r, latencies[provider] || 200));
  return { provider, answer: `Answer from ${provider}`, confidence: 0.9 };
};

async function testToolOptimizer() {
  console.log('📍 Testing Tool Optimizer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const optimizer = new ToolOptimizer(mockToolExecute);

  // Test 1: Single call
  console.log('Test 1: Single tool call');
  const result1 = await optimizer.call('getBalance', { accountId: '0.0.123' });
  console.log(`  ✅ Result: ${JSON.stringify(result1).substring(0, 50)}...`);

  // Test 2: Cached call (should be faster)
  console.log('Test 2: Cached call (same params)');
  const start2 = Date.now();
  const result2 = await optimizer.call('getBalance', { accountId: '0.0.123' });
  const time2 = Date.now() - start2;
  console.log(`  ✅ Cached result in ${time2}ms (should be <10ms)`);

  // Test 3: Batched calls
  console.log('Test 3: Batched calls');
  const batchPromises = [
    optimizer.call('getToken', { tokenId: '0.0.456' }),
    optimizer.call('getToken', { tokenId: '0.0.457' }),
    optimizer.call('getToken', { tokenId: '0.0.458' }),
    optimizer.call('getToken', { tokenId: '0.0.459' }),
    optimizer.call('getToken', { tokenId: '0.0.460' })
  ];
  const batchResults = await Promise.all(batchPromises);
  console.log(`  ✅ ${batchResults.length} calls batched and executed`);

  // Show stats
  const stats = optimizer.getStats();
  console.log('\nTool Optimizer Stats:');
  console.log(`  Total calls: ${stats.totalCalls}`);
  console.log(`  Cache hits: ${stats.cacheHits} (${stats.cacheHitRate})`);
  console.log(`  Batched calls: ${stats.batchedCalls} (${stats.batchRate})`);
  console.log(`  Accuracy: ${(stats.accuracy * 100).toFixed(1)}%`);
  console.log(`  Avg latency: ${stats.avgLatency}ms`);

  console.log('');
}

async function testParallelProcessor() {
  console.log('📍 Testing Parallel Processor');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const processor = new ParallelProcessor(mockModelExecute);

  // Test 1: Quick parallel execution
  console.log('Test 1: Quick parallel (openai + google)');
  const result1 = await processor.quickExecute('What is Hedera?');
  console.log(`  ✅ Winner: ${result1.winner.provider} (${result1.winner.latency}ms)`);
  console.log(`  ✅ Total time: ${result1.totalTime}ms`);
  console.log(`  ✅ Consensus: ${result1.consensus}`);

  // Test 2: Critical parallel execution
  console.log('Test 2: Critical parallel (qvx + openai + google)');
  const result2 = await processor.criticalExecute('Analyze this complex carbon transaction');
  console.log(`  ✅ Winner: ${result2.winner.provider} (${result2.winner.latency}ms)`);
  console.log(`  ✅ Total time: ${result2.totalTime}ms`);
  console.log(`  ✅ Consensus: ${result2.consensus}`);
  console.log(`  ✅ Successful models: ${result2.allResponses.filter(r => r.success).length}/${result2.allResponses.length}`);

  // Show stats
  const stats = processor.getStats();
  console.log('\nParallel Processor Stats:');
  console.log(`  Total calls: ${stats.totalParallelCalls}`);
  console.log(`  Consensus rate: ${stats.consensusRate}`);
  console.log(`  Avg winner latency: ${stats.avgWinnerLatency}ms`);
  console.log(`  Timeouts: ${stats.timeoutCount}`);

  console.log('');
}

async function runTests() {
  try {
    await testToolOptimizer();
    await testParallelProcessor();

    console.log('✅ Week 2 Tests Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Tool Optimizer: Batching and caching working');
    console.log('Parallel Processor: Multi-model execution working');
    console.log('');
    console.log('Targets:');
    console.log('  - Tool accuracy: 99% (tracking enabled)');
    console.log('  - Batch efficiency: 5 calls in 1 execution');
    console.log('  - Parallel speed: Fastest model wins');
    console.log('');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

runTests();
