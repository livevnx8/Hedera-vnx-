/**
 * Vera Continuous Growth & Proof Generation Engine
 * 
 * This script continuously:
 * 1. Executes tasks to grow Vera's capabilities
 * 2. Monitors performance and triggers retraining when needed
 * 3. Generates proof of actions on HCS
 * 4. Expands tool coverage
 * 5. Records all activities immutably
 * 
 * Run this on a loop to continuously grow Vera.
 */

import { getVeraAdvancedTools } from '../src/hedera/veraAdvancedTools.js';
import { getProofOfWorkRegistry } from '../src/hedera/proofOfWork.js';
import { getAgentPaymentSystem } from '../src/hedera/agentPayment.js';
import { getHCS10AgentKit } from '../src/hedera/hcs10Agent.js';
import { runSubAgent } from '../src/agent/subAgent.js';
import { executeTool } from '../src/agent/executor.js';
import { logger } from '../src/monitoring/logger.js';

interface GrowthMetrics {
  iteration: number;
  totalTasksCompleted: number;
  newCapabilitiesDiscovered: string[];
  proofsGenerated: string[];
  performanceScore: number;
  retrainingTriggered: boolean;
}

const metrics: GrowthMetrics[] = [];
let iteration = 0;

async function runGrowthIteration(): Promise<GrowthMetrics> {
  iteration++;
  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║  GROWTH ITERATION #${iteration.toString().padStart(3, '0')}                                    ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);

  const advancedTools = getVeraAdvancedTools();
  const pow = getProofOfWorkRegistry();
  const proofs: string[] = [];
  let tasksCompleted = 0;
  let retrainingTriggered = false;

  // ═══════════════════════════════════════════════════════════
  // PHASE 1: Advanced Tool Testing
  // ═══════════════════════════════════════════════════════════
  console.log('🔧 PHASE 1: Advanced Tools Expansion\n');

  // 1.1 Performance Analysis & Retraining Check
  try {
    console.log('  ▶️ Analyzing performance & checking retraining needs...');
    const analysis = await advancedTools.analyzePerformanceAndRetrain();
    
    if (analysis.trigger.shouldRetrain) {
      console.log(`     ⚠️ Retraining triggered: ${analysis.trigger.reason}`);
      retrainingTriggered = true;
    } else {
      console.log(`     ✅ Performance optimal: ${analysis.report.successRate.toFixed(1)}% success rate`);
    }
    
    const proof = await advancedTools.generateProofOfAction('performance_analysis', {
      trigger: analysis.trigger,
      report: analysis.report,
    });
    proofs.push(proof.proofId);
    tasksCompleted++;
    console.log(`     📝 Proof: ${proof.proofId.slice(0, 16)}...`);
  } catch (error) {
    console.log(`     ❌ Performance analysis failed: ${String(error).slice(0, 50)}`);
  }

  // 1.2 DeFi Portfolio Analysis
  try {
    console.log('\n  ▶️ Testing DeFi Portfolio Analyzer...');
    const portfolio = await advancedTools.analyzeDeFiPortfolio('0.0.10294360');
    
    const proof = await advancedTools.generateProofOfAction('defi_analysis', {
      totalValue: portfolio.totalValueUsd,
      positions: portfolio.positions.length,
    });
    proofs.push(proof.proofId);
    tasksCompleted++;
    console.log(`     ✅ Analyzed ${portfolio.positions.length} positions, $${portfolio.totalValueUsd} total`);
    console.log(`     📝 Proof: ${proof.proofId.slice(0, 16)}...`);
  } catch (error) {
    console.log(`     ❌ DeFi analysis failed: ${String(error).slice(0, 50)}`);
  }

  // 1.3 Market Prediction
  try {
    console.log('\n  ▶️ Testing Market Prediction Engine...');
    const prediction = await advancedTools.generateMarketPrediction('0.0.4292746');
    
    const proof = await advancedTools.generateProofOfAction('market_prediction', {
      direction: prediction.direction,
      confidence: prediction.confidence,
    });
    proofs.push(proof.proofId);
    tasksCompleted++;
    console.log(`     ✅ Prediction: ${prediction.direction} (${(prediction.confidence * 100).toFixed(1)}% confidence)`);
    console.log(`     📝 Proof: ${proof.proofId.slice(0, 16)}...`);
  } catch (error) {
    console.log(`     ❌ Market prediction failed: ${String(error).slice(0, 50)}`);
  }

  // 1.4 Contract Vulnerability Scan
  try {
    console.log('\n  ▶️ Testing Contract Vulnerability Scanner...');
    const scan = await advancedTools.scanContractVulnerabilities('0.0.3595746');
    
    const proof = await advancedTools.generateProofOfAction('contract_scan', {
      riskScore: scan.riskScore,
      vulnerabilities: scan.vulnerabilities.length,
    });
    proofs.push(proof.proofId);
    tasksCompleted++;
    console.log(`     ✅ Scan complete: Risk score ${scan.riskScore}/100, ${scan.vulnerabilities.length} issues`);
    console.log(`     📝 Proof: ${proof.proofId.slice(0, 16)}...`);
  } catch (error) {
    console.log(`     ❌ Contract scan failed: ${String(error).slice(0, 50)}`);
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: Sub-Agent Expansion
  // ═══════════════════════════════════════════════════════════
  console.log('\n🎭 PHASE 2: Sub-Agent Capability Expansion\n');

  const expandedTasks = [
    { role: 'researcher', task: 'Research emerging L1 blockchain technologies', newCapability: 'l1_research' },
    { role: 'analyst', task: 'Analyze NFT market trends on Hedera', newCapability: 'nft_analysis' },
    { role: 'coder', task: 'Design a DAO governance contract', newCapability: 'dao_design' },
    { role: 'planner', task: 'Create a cross-chain bridge strategy', newCapability: 'bridge_strategy' },
    { role: 'critic', task: 'Review tokenomics of major DeFi protocols', newCapability: 'tokenomics_review' },
  ];

  const newCapabilities: string[] = [];

  for (const task of expandedTasks) {
    try {
      console.log(`  ▶️ ${task.role}: ${task.task.slice(0, 40)}...`);
      const start = Date.now();
      const result = await runSubAgent({ role: task.role as any, task: task.task });
      const duration = Date.now() - start;

      const record = await pow.recordWork({
        taskType: 'sub_agent',
        description: `${task.role}: ${task.task}`,
        inputs: { task: task.task },
        outputs: { result: result.result?.slice(0, 100) || 'completed' },
        toolsUsed: result.tools_called,
        durationMs: duration,
        success: true,
      });

      const proof = await advancedTools.generateProofOfAction('sub_agent_expansion', {
        role: task.role,
        capability: task.newCapability,
        recordId: record.id,
      });
      proofs.push(proof.proofId);

      tasksCompleted++;
      newCapabilities.push(task.newCapability);
      console.log(`     ✅ ${duration}ms - New capability: ${task.newCapability}`);
      console.log(`     📝 Proof: ${proof.proofId.slice(0, 16)}...`);
    } catch (error) {
      console.log(`     ❌ Failed: ${String(error).slice(0, 50)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 3: Continuous Learning Loop
  // ═══════════════════════════════════════════════════════════
  console.log('\n🧠 PHASE 3: Continuous Learning Execution\n');

  try {
    console.log('  ▶️ Running learning loop...');
    const learning = await advancedTools.runContinuousLearningIteration();
    
    tasksCompleted += learning.tasksExecuted;
    proofs.push(...learning.proofsGenerated);
    
    console.log(`     ✅ Executed ${learning.tasksExecuted} learning tasks`);
    console.log(`     📈 Performance improvement: ${(learning.performanceImprovement * 100).toFixed(1)}%`);
    console.log(`     🆕 New capabilities: ${learning.newCapabilities.join(', ')}`);
    newCapabilities.push(...learning.newCapabilities);
  } catch (error) {
    console.log(`     ❌ Learning loop failed: ${String(error).slice(0, 50)}`);
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 4: Issue Growth Certificate
  // ═══════════════════════════════════════════════════════════
  console.log('\n📜 PHASE 4: Issue Growth Certificate\n');

  try {
    const history = await pow.getVerifiedWorkHistory(100);
    const recentRecords = history.records.slice(-10).map(r => r.id);
    
    const cert = await pow.createCompletionCertificate(
      `Growth Iteration #${iteration}`,
      `Completed ${tasksCompleted} tasks, discovered ${newCapabilities.length} new capabilities`,
      recentRecords
    );

    console.log(`  ✅ Certificate: ${cert.id}`);
    console.log(`  🔏 Signature: ${cert.signature.slice(0, 24)}...`);
    console.log(`  📊 Records: ${history.records.length} total`);
  } catch (error) {
    console.log(`  ❌ Certificate failed: ${String(error).slice(0, 50)}`);
  }

  // ═══════════════════════════════════════════════════════════
  // METRICS
  // ═══════════════════════════════════════════════════════════
  const metric: GrowthMetrics = {
    iteration,
    totalTasksCompleted: tasksCompleted,
    newCapabilitiesDiscovered: newCapabilities,
    proofsGenerated: proofs,
    performanceScore: tasksCompleted * 10 + newCapabilities.length * 20,
    retrainingTriggered,
  };
  metrics.push(metric);

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  ITERATION SUMMARY                                     ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`📊 Performance Score: ${metric.performanceScore}`);
  console.log(`✅ Tasks Completed: ${tasksCompleted}`);
  console.log(`🆕 New Capabilities: ${newCapabilities.length} (${newCapabilities.join(', ')})`);
  console.log(`📝 Proofs Generated: ${proofs.length}`);
  console.log(`🔄 Retraining: ${retrainingTriggered ? 'Triggered' : 'Not needed'}`);
  console.log(`📈 Total Growth Score: ${metrics.reduce((sum, m) => sum + m.performanceScore, 0)}\n`);

  return metric;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  VERA CONTINUOUS GROWTH ENGINE                         ║');
  console.log('║  Growing tools, abilities & generating proofs          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Initialize systems
  const pow = getProofOfWorkRegistry();
  let topics = pow.getTopicIds();
  if (!topics.powTopicId) {
    console.log('🚀 Initializing systems...');
    topics = await pow.initialize();
    console.log(`   ✅ Ready\n`);
  }

  // Run continuous iterations
  const targetIterations = 3; // Run 3 iterations for demo
  
  for (let i = 0; i < targetIterations; i++) {
    await runGrowthIteration();
    
    if (i < targetIterations - 1) {
      console.log('\n⏳ Waiting 5 seconds before next iteration...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Final summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  GROWTH ENGINE COMPLETE                              ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  const totalTasks = metrics.reduce((sum, m) => sum + m.totalTasksCompleted, 0);
  const totalProofs = metrics.reduce((sum, m) => sum + m.proofsGenerated.length, 0);
  const totalCapabilities = new Set(metrics.flatMap(m => m.newCapabilitiesDiscovered)).size;
  const retrainingCount = metrics.filter(m => m.retrainingTriggered).length;

  console.log(`📈 TOTAL GROWTH:`);
  console.log(`   Iterations: ${metrics.length}`);
  console.log(`   Tasks: ${totalTasks}`);
  console.log(`   Proofs: ${totalProofs}`);
  console.log(`   Unique Capabilities: ${totalCapabilities}`);
  console.log(`   Retraining Triggers: ${retrainingCount}`);
  console.log(`   Final Score: ${metrics.reduce((sum, m) => sum + m.performanceScore, 0)}\n`);

  console.log('✨ Run again to continue growing:');
  console.log('   npx tsx scripts/vera-growth-engine.ts\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
