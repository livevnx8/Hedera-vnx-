#!/usr/bin/env tsx
/**
 * Show Metrics Script
 * Displays current system metrics
 */

function showMetrics() {
  console.log('📊 VeraLattice Metrics\n');
  console.log('=' .repeat(50));
  
  // Simulated metrics - in production, query from Prometheus/MetricsEndpoint
  const metrics = {
    hcsMessagesPerSecond: 42.5,
    settlementLatency: 850,
    settlementSuccessRate: 99.2,
    errorRate: 0.8,
    activeAgents: 847,
    queueDepth: 12,
    circuitBreakerStatus: 'CLOSED',
    connectionPool: {
      total: 8,
      available: 6,
      inUse: 2,
    },
  };
  
  console.log('\n🚀 Performance:');
  console.log(`   HCS Messages/sec: ${metrics.hcsMessagesPerSecond.toFixed(1)} (target: 50)`);
  console.log(`   Settlement Latency: ${metrics.settlementLatency}ms (target: <1000)`);
  console.log(`   Success Rate: ${metrics.settlementSuccessRate}% (target: >99)`);
  
  console.log('\n📈 System:');
  console.log(`   Active Agents: ${metrics.activeAgents}`);
  console.log(`   Queue Depth: ${metrics.queueDepth}`);
  console.log(`   Error Rate: ${metrics.errorRate}%`);
  
  console.log('\n🔌 Connection Pool:');
  console.log(`   Total: ${metrics.connectionPool.total}`);
  console.log(`   Available: ${metrics.connectionPool.available}`);
  console.log(`   In Use: ${metrics.connectionPool.inUse}`);
  
  console.log('\n🛡️  Circuit Breaker:');
  console.log(`   Status: ${metrics.circuitBreakerStatus}`);
  
  console.log('\n' + '='.repeat(50));
  console.log('For live metrics: http://localhost:8080/metrics');
}

showMetrics();
