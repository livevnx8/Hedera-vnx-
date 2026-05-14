/**
 * Vera Affordable Deployment Script
 * 
 * Uses cost-optimized architecture:
 * - Single consolidated topic (not 12+ topic pairs)
 * - Batched work records (10 records per HCS message)
 * - Local SQLite storage with periodic HCS anchors
 * - Lazy initialization
 * 
 * Cost: ~$0.02 for 1000 work records (vs $2.00+ with old architecture)
 */

import { getCostOptimizedPoW } from '../src/hedera/costOptimizedPoW.js';
import { runSubAgent } from '../src/agent/subAgent.js';
import { executeTool } from '../src/agent/executor.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  VERA AFFORDABLE DEPLOYMENT                            ║');
  console.log('║  Cost-Optimized: ~$0.02 for 1000 records              ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const pow = getCostOptimizedPoW();

  // Lazy initialization - only creates topic when needed
  console.log('📦 Phase 1: Lazy Initialization');
  const { topicId } = await pow.initialize();
  console.log(`✅ Using topic: ${topicId}\n`);

  // Execute tasks with batched recording
  console.log('🔨 Phase 2: Batched Task Execution');
  console.log('   (10 records will be batched into 1 HCS message)\n');

  const tasks = [
    { role: 'researcher', task: 'Research DeFi yield strategies' },
    { role: 'analyst', task: 'Analyze token vesting schedules' },
    { role: 'coder', task: 'Design staking contract' },
    { role: 'planner', task: 'Plan DApp launch phases' },
    { role: 'critic', task: 'Review security exploits' },
    { role: 'researcher', task: 'Research L2 solutions' },
    { role: 'analyst', task: 'Compare gas costs' },
    { role: 'coder', task: 'Optimize contract' },
    { role: 'planner', task: 'Roadmap Q2-Q4' },
    { role: 'critic', task: 'Audit findings review' },
  ];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    try {
      console.log(`  ▶️ Task ${i + 1}/${tasks.length}: ${task.role}`);
      const start = Date.now();
      const result = await runSubAgent({ role: task.role as any, task: task.task });
      const duration = Date.now() - start;

      // Record with batching (FREE locally, batched to HCS)
      const record = await pow.recordWork({
        taskType: 'sub_agent',
        description: `${task.role}: ${task.task}`,
        inputs: { task: task.task },
        outputs: { result: result.result?.slice(0, 80) },
        toolsUsed: result.tools_called,
        durationMs: duration,
        success: true,
      });

      console.log(`     ✅ ${duration}ms - Local ID: ${record.id.slice(0, 16)}...`);
    } catch (error) {
      console.log(`     ❌ ${String(error).slice(0, 50)}`);
    }
  }

  // Force flush batch to HCS
  console.log('\n📤 Phase 3: Flush Batch to HCS');
  await pow.forceFlush();

  // Get metrics
  const metrics = pow.getCostMetrics();
  const history = await pow.getWorkHistory(100);

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  AFFORDABLE DEPLOYMENT COMPLETE                          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('📊 Results:');
  console.log(`   Work records: ${history.length}`);
  console.log(`   HCS messages: ${metrics.messagesSubmitted}`);
  console.log(`   Cost: ${metrics.totalCostHbar.toFixed(4)} ℏ (~$${metrics.estimatedUsd.toFixed(4)})`);
  console.log(`   Savings: ${((1 - (metrics.messagesSubmitted / history.length)) * 100).toFixed(0)}% vs non-batched\n`);

  console.log('💡 With batching, you can record 1000 tasks for ~$0.02!');
  console.log('🔗 HashScan:', `https://hashscan.io/mainnet/topic/${topicId}\n`);
}

main().catch(console.error);
