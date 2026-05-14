#!/usr/bin/env node
/**
 * Sub-Agent Demo
 * Demonstrates Phase 3: Sub-agents + Adaptive Scheduling
 */

import { coordinator, AgentCoordinator } from './blueprints/coordinator.mjs';
import { AdaptiveScheduler, PriorityQueue, CircuitBreaker } from './blueprints/adaptive-scheduler.mjs';

console.clear();
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🤖 PHASE 3: SUB-AGENTS + ADAPTIVE SCHEDULING                       ║');
console.log('║  Demonstration of Micro-Agent Architecture                         ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

async function runDemo() {
  // Demo 1: Spawn Sub-Agents
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1️⃣ SPAWNING SPECIALIZED SUB-AGENTS\n');
  
  const loadPredictor = coordinator.spawnSubAgent('LOAD_PREDICTOR', 'energy-auditor-v2-001');
  const anomalyDetector = coordinator.spawnSubAgent('ANOMALY_DETECTOR', 'security-guardian-v2-001');
  const whaleTracker = coordinator.spawnSubAgent('WHALE_TRACKER', 'defi-analyst-v2-001');
  
  console.log(`   ✅ Load Predictor: ${loadPredictor.id}`);
  console.log(`   ✅ Anomaly Detector: ${anomalyDetector.id}`);
  console.log(`   ✅ Whale Tracker: ${whaleTracker.id}`);
  console.log(`   📊 Total Sub-Agents: ${coordinator.health.activeSubAgents}\n`);
  
  // Demo 2: Route Tasks
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2️⃣ ROUTING TASKS TO SUB-AGENTS\n');
  
  // Task 1: Load Prediction
  const predictionTask = await coordinator.routeTask(
    'energy-auditor-v2-001',
    'predict_load',
    {
      historicalData: [4500, 4800, 5200, 4900, 5100],
      weatherData: { temperature: 88, humidity: 65 },
      timeHorizon: '1h'
    },
    2 // High priority
  );
  console.log(`   ⚡ Load Prediction Task: ${predictionTask}`);
  
  // Task 2: Anomaly Detection
  const anomalyTask = await coordinator.routeTask(
    'security-guardian-v2-001',
    'detect_anomaly',
    {
      data: [100, 102, 105, 200, 103, 101, 99],
      baseline: 102,
      threshold: 2
    },
    1 // Critical priority
  );
  console.log(`   🔍 Anomaly Detection Task: ${anomalyTask}`);
  
  // Task 3: Whale Tracking
  const whaleTask = await coordinator.routeTask(
    'defi-analyst-v2-001',
    'track_whales',
    {
      transactions: [
        { from: 'wallet1', amount: 5000 },
        { from: 'wallet2', amount: 25000 },
        { from: 'wallet3', amount: 800 }
      ],
      threshold: 10000
    },
    3
  );
  console.log(`   🐋 Whale Tracking Task: ${whaleTask}\n`);
  
  // Wait for processing
  await new Promise(r => setTimeout(r, 2000));
  
  // Demo 3: Adaptive Scheduling
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3️⃣ ADAPTIVE SCHEDULING\n');
  
  const energyScheduler = new AdaptiveScheduler({
    baseInterval: 180000, // 3 min
    minInterval: 60000,   // 1 min
    maxInterval: 300000   // 5 min
  });
  
  // Scenario: High volatility
  const highVolatilityInterval = energyScheduler.getNextInterval({
    volatility: 0.35,
    errorRate: 0.05,
    anomalyCount: 2
  });
  console.log(`   ⚠️ High Volatility Scenario:`);
  console.log(`      Volatility: 35% | Errors: 5% | Anomalies: 2`);
  console.log(`      → Adjusted interval: ${highVolatilityInterval / 1000}s (from 180s to 60s)`);
  console.log(`      → Mode: ${energyScheduler.getStats().currentMode}\n`);
  
  // Scenario: Low volatility
  const lowVolatilityInterval = energyScheduler.getNextInterval({
    volatility: 0.03,
    errorRate: 0,
    anomalyCount: 0
  });
  console.log(`   ✅ Low Volatility Scenario:`);
  console.log(`      Volatility: 3% | Errors: 0% | Anomalies: 0`);
  console.log(`      → Adjusted interval: ${lowVolatilityInterval / 1000}s (from 180s to 270s)`);
  console.log(`      → Mode: ${energyScheduler.getStats().currentMode}\n`);
  
  // Demo 4: Circuit Breaker
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('4️⃣ CIRCUIT BREAKER PROTECTION\n');
  
  const cb = new CircuitBreaker(3, 5000); // 3 failures, 5s timeout
  console.log(`   Initial State: ${cb.getStatus().state}`);
  
  // Simulate failures
  for (let i = 0; i < 4; i++) {
    try {
      await cb.execute(() => {
        if (i < 3) throw new Error('Simulated failure');
        return 'success';
      });
    } catch (e) {
      console.log(`   Attempt ${i + 1}: ❌ Failed (${cb.getStatus().state})`);
    }
  }
  
  console.log(`   Final State: ${cb.getStatus().state}`);
  console.log(`   Can Execute: ${cb.getStatus().canExecute ? 'Yes' : 'No (cooldown)'}`);
  console.log(`   Failures: ${cb.getStatus().failures}/${cb.getStatus().threshold}\n`);
  
  // Demo 5: Coordinator Health
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('5️⃣ COORDINATOR HEALTH REPORT\n');
  
  const report = coordinator.generateReport();
  
  console.log(`   Coordinator ID: ${report.coordinatorId}`);
  console.log(`   Tasks Routed: ${report.summary.tasksRouted}`);
  console.log(`   Tasks Completed: ${report.summary.tasksCompleted}`);
  console.log(`   Success Rate: ${report.summary.successRate}%`);
  console.log(`   Active Sub-Agents: ${report.summary.activeSubAgents}`);
  console.log(`   Queue Backlog: ${report.summary.queueBacklog}`);
  console.log(`\n   📋 Recommendations:`);
  report.recommendations.forEach(rec => console.log(`      • ${rec}`));
  
  // Demo 6: Sub-Agent Health
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('6️⃣ SUB-AGENT HEALTH STATUS\n');
  
  report.subAgents.forEach(sa => {
    console.log(`   ${sa.type}`);
    console.log(`      Status: ${sa.status}`);
    console.log(`      Tasks Completed: ${sa.tasksCompleted}`);
    console.log(`      Success Rate: ${sa.successRate}%`);
    console.log(`      Avg Response: ${sa.avgResponseTime}ms`);
    console.log();
  });
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ PHASE 3 DEMO COMPLETE\n');
  
  console.log('🎯 Key Features Demonstrated:');
  console.log('   • Sub-agent spawning with specialized roles');
  console.log('   • Priority-based task routing');
  console.log('   • Adaptive interval adjustment');
  console.log('   • Circuit breaker failure protection');
  console.log('   • Health monitoring and reporting');
  
  console.log('\n📊 Next Steps:');
  console.log('   • Integrate coordinator into v2 agents');
  console.log('   • Enable real-time task distribution');
  console.log('   • Add cross-agent task delegation\n');
}

runDemo().catch(console.error);
