#!/usr/bin/env node
/**
 * Vera Next Big Phases - Integration Demo
 * Demonstrates all new components working together
 */

import {
  latticeManager,
  latticeOrchestrator,
  enhancedSettlement,
  streamManager,
  disasterRecovery,
  featureFlags,
  createAdaptiveScheduler,
  createSubAgent,
  VeraDefiAnalyst
} from './src/vera/index.js';

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║     VERA NEXT BIG PHASES - Integration Demo                        ║');
console.log('║     OADEL Loop + Lattice Reasoning + x402 + Enterprise            ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

async function runDemo() {
  try {
    // 1. Feature Flags Demo
    console.log('🚩 1. PRODUCTION SAFETY FLAGS');
    console.log('─────────────────────────────────────────────────────────────────');
    const flags = featureFlags.getAll();
    console.log(`   Lattice Enabled: ${flags.enableLatticeReasoning}`);
    console.log(`   x402 Traffic: ${flags.x402TrafficPercentage}%`);
    console.log(`   Max Settlement: ${flags.maxHbarPerSettlement} HBAR`);
    console.log(`   Mainnet Ops: ${flags.enableMainnetOperations ? 'ENABLED' : 'BLOCKED'}`);
    console.log(`   Circuit Breaker: ${flags.enableCircuitBreaker ? 'ACTIVE' : 'DISABLED'}`);
    console.log();

    // 2. Lattice Reasoning Demo
    console.log('🧠 2. LATTICE REASONING SYSTEM');
    console.log('─────────────────────────────────────────────────────────────────');
    
    // Create verification field
    const verificationField = latticeManager.createField('demo-verification', 'Demo Verification', [
      'authenticity', 'certification', 'timestamp', 'geography', 'standards'
    ]);
    
    // Superpose hypotheses
    const hypotheses = [
      'Credit is legitimate based on project data',
      'Credit has been double-counted',
      'Project is certified but credit expired',
    ];
    const nodes = verificationField.superposeHypotheses(hypotheses);
    console.log(`   Superposed ${nodes.length} hypotheses`);
    
    // Add evidence and collapse
    verificationField.collapseNode(nodes[0].id, ['Project data valid', 'Certification active'], 0.4);
    console.log(`   Collapsed primary hypothesis with evidence`);
    
    // Calculate interference
    const interference = verificationField.calculateInterference(nodes[0].id, nodes[1].id);
    console.log(`   Interference between hypotheses: ${interference.interference.toFixed(2)} (${interference.type})`);
    
    const stats = verificationField.getStats();
    console.log(`   Field Coherence: ${(stats.coherence * 100).toFixed(1)}%`);
    console.log(`   System Coherence: ${(latticeManager.getSystemCoherence() * 100).toFixed(1)}%`);
    console.log();

    // 3. Lattice-Orchestrator Integration Demo
    console.log('🎯 3. LATTICE-ORCHESTRATOR INTEGRATION');
    console.log('─────────────────────────────────────────────────────────────────');
    
    const mockTask = {
      taskId: 'demo-task-001',
      description: 'Analyze carbon credit from Brazilian reforestation project',
      serviceType: 'carbon_verification',
      budget: 100,
      requiredConfidence: 0.85,
      deadlineMs: Date.now() + 300000,
    };
    
    const taskAnalysis = await latticeOrchestrator.analyzeTask(mockTask);
    console.log(`   Task Analysis:`);
    console.log(`     Complexity: ${(taskAnalysis.complexity * 100).toFixed(0)}%`);
    console.log(`     Risk: ${(taskAnalysis.risk * 100).toFixed(0)}%`);
    console.log(`     Strategy: ${taskAnalysis.recommendedStrategy}`);
    console.log();

    // 4. Sub-Agent Demo
    console.log('🤖 4. SUB-AGENT ARCHITECTURE');
    console.log('─────────────────────────────────────────────────────────────────');
    
    const whaleTracker = createSubAgent('WHALE_TRACKER', 'demo-agent');
    const anomalyDetector = createSubAgent('ANOMALY_DETECTOR', 'demo-agent');
    
    // Execute whale tracking task
    const whaleResult = await whaleTracker.execute({
      id: 'whale-task-1',
      type: 'TRACK_WHALES',
      payload: {
        transactions: [
          { txId: '1', from: '0.0.1', to: '0.0.2', amount: 50000 },
          { txId: '2', from: '0.0.3', to: '0.0.4', amount: 150000 },
          { txId: '3', from: '0.0.5', to: '0.0.6', amount: 25000 },
        ],
        threshold: 100000
      },
      priority: 'high',
      timeoutMs: 5000
    });
    
    console.log(`   Whale Tracker Result:`);
    console.log(`     Success: ${whaleResult.success}`);
    if (whaleResult.data) {
      console.log(`     Whale Txs: ${whaleResult.data.whaleTxs}`);
      console.log(`     Volume: ${whaleResult.data.whaleVolume ? whaleResult.data.whaleVolume.toLocaleString() : 0} HBAR`);
    }
    
    const whaleHealth = whaleTracker.getHealth();
    console.log(`     Health: ${whaleHealth.successRate}% success rate`);
    console.log();

    // 5. Adaptive Scheduler Demo
    console.log('⏱️  5. ADAPTIVE SCHEDULING');
    console.log('─────────────────────────────────────────────────────────────────');
    
    const scheduler = createAdaptiveScheduler({
      baseIntervalMs: 180000,
      minIntervalMs: 30000,
      maxIntervalMs: 600000
    });
    
    console.log(`   Base Interval: ${scheduler.getCurrentInterval() / 1000}s`);
    
    // Simulate high load
    scheduler.recordLoad({ queueDepth: 15, anomalyDetected: true });
    console.log(`   Under High Load + Anomaly:`);
    console.log(`     New Interval: ${scheduler.getCurrentInterval() / 1000}s`);
    console.log(`     Load Factor: ${scheduler.getMetrics().loadFactor.toFixed(2)}`);
    console.log();

    // 6. x402 Settlement Demo
    console.log('💰 6. X402 SETTLEMENT WITH CIRCUIT BREAKER');
    console.log('─────────────────────────────────────────────────────────────────');
    
    const cbStats = enhancedSettlement.getCircuitBreakerStats();
    console.log(`   Circuit Breaker State: ${cbStats.state}`);
    console.log(`   Failures: ${cbStats.failureCount} | Successes: ${cbStats.successCount}`);
    
    const settlementStats = enhancedSettlement.getStats();
    console.log(`   Total Settlements: ${settlementStats.total}`);
    console.log(`   Success Rate: ${(settlementStats.successRate * 100).toFixed(1)}%`);
    console.log(`   Total HBAR Paid: ${settlementStats.totalHbarPaid.toLocaleString()}`);
    console.log();

    // 7. Payment Streaming Demo
    console.log('💸 7. MICROPAYMENT STREAMING');
    console.log('─────────────────────────────────────────────────────────────────');
    
    const stream = await streamManager.startStream({
      taskId: 'demo-stream-task',
      agentId: 'demo-agent-001',
      rateHbarPerSecond: 0.01, // 0.01 HBAR per second
      maxTotalHbar: 100
    });
    
    console.log(`   Stream Started: ${stream.streamId}`);
    console.log(`   Rate: ${stream.rateHbarPerSecond} HBAR/sec`);
    console.log(`   Max: ${stream.maxTotalHbar} HBAR`);
    
    // Simulate some time passing
    await new Promise(r => setTimeout(r, 100));
    
    const streamStats = streamManager.getStats();
    console.log(`   Active Streams: ${streamStats.active}`);
    console.log(`   Total Settled (all streams): ${streamStats.totalSettled.toFixed(4)} HBAR`);
    
    // Complete the stream
    await streamManager.completeStream(stream.streamId);
    console.log(`   Stream completed successfully`);
    console.log();

    // 8. Disaster Recovery Demo
    console.log('🔄 8. DISASTER RECOVERY & FAILOVER');
    console.log('─────────────────────────────────────────────────────────────────');
    
    const drStatus = disasterRecovery.getStatus();
    console.log(`   Backup Region: ${drStatus.backup.region}`);
    console.log(`   Last Backup: ${new Date(drStatus.backup.lastBackupTime).toISOString()}`);
    console.log(`   Failover Status: ${drStatus.failover.isFailoverActive ? 'ACTIVE' : 'STANDBY'}`);
    console.log(`   Current Region: ${drStatus.failover.currentRegion}`);
    console.log(`   Recovery Points Available: ${drStatus.recoveryPoints.length}`);
    console.log();

    // 9. Final Summary
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║                    DEMO COMPLETE ✅                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
    
    console.log('📊 Components Demonstrated:');
    console.log('   • Lattice Reasoning (superposition, collapse, interference)');
    console.log('   • Lattice-Orchestrator Integration (task analysis)');
    console.log('   • Sub-Agent Architecture (whale tracking, anomaly detection)');
    console.log('   • Adaptive Scheduling (dynamic intervals)');
    console.log('   • x402 Settlement (circuit breaker, retries)');
    console.log('   • Payment Streaming (per-second micropayments)');
    console.log('   • Disaster Recovery (backups, failover)');
    console.log('   • Production Safety (feature flags, limits)\n');

  } catch (error) {
    console.error('❌ Demo failed:', (error as Error).message);
    console.error(error);
    process.exit(1);
  }
}

// Run demo
runDemo().then(() => {
  console.log('✨ All systems operational');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
