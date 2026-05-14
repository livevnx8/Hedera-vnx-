/**
 * Vera Baseline Performance Test
 * Measures current performance before optimizations
 */

import { performance } from 'perf_hooks';

console.log('🔬 BASELINE PERFORMANCE TEST\n');

const TESTS = {
  apiHealth: 0,
  apiCarbon: 0,
  hcsTopicQuery: 0,
  memoryUsage: 0
};

async function runTests() {
  // Test 1: API Health Endpoint
  console.log('Test 1: API Health Response Time');
  const healthTimes = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    try {
      await fetch('http://localhost:8088/health');
    } catch (e) {
      // Ignore errors, just measure
    }
    healthTimes.push(performance.now() - start);
  }
  TESTS.apiHealth = healthTimes.reduce((a, b) => a + b, 0) / healthTimes.length;
  console.log(`  Average: ${TESTS.apiHealth.toFixed(2)}ms`);
  console.log(`  Min: ${Math.min(...healthTimes).toFixed(2)}ms`);
  console.log(`  Max: ${Math.max(...healthTimes).toFixed(2)}ms\n`);

  // Test 2: Memory Usage
  console.log('Test 2: Memory Usage');
  const mem = process.memoryUsage();
  TESTS.memoryUsage = mem.rss / 1024 / 1024;
  console.log(`  RSS: ${TESTS.memoryUsage.toFixed(2)} MB`);
  console.log(`  Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB\n`);

  // Results
  console.log('='.repeat(50));
  console.log('📊 BASELINE RESULTS');
  console.log('='.repeat(50));
  console.log(`API Health:     ${TESTS.apiHealth.toFixed(2)}ms`);
  console.log(`Memory (RSS):   ${TESTS.memoryUsage.toFixed(2)} MB`);
  console.log('='.repeat(50));
  
  // Save for comparison
  const fs = await import('fs');
  fs.writeFileSync('/mnt/vera-mirror-shards/vera-lattice/baseline.json', 
    JSON.stringify(TESTS, null, 2));
  console.log('\n✅ Baseline saved to: baseline.json');
}

runTests();
