/**
 * Vera Live Proof of Existence
 * 
 * Executes a simple, verifiable task and records it on HCS.
 * Demonstrates:
 * - Vera is operational
 * - Work is recorded immutably on Hedera
 * - Record count grows with each task
 * - Anyone can verify on HashScan
 */

import { getHCS10AgentKit } from '../src/hedera/hcs10Agent.js';
import { getProofOfWorkRegistry } from '../src/hedera/proofOfWork.js';
import { runSubAgent } from '../src/agent/subAgent.js';
import { executeTool } from '../src/agent/executor.js';
import { logger } from '../src/monitoring/logger.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  VERA LIVE PROOF OF EXISTENCE                          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const pow = getProofOfWorkRegistry();
  const hcs10 = getHCS10AgentKit();

  // Initialize if needed
  let topics = pow.getTopicIds();
  if (!topics.powTopicId) {
    console.log('🚀 Initializing Proof of Work registry...');
    const result = await pow.initialize();
    console.log(`   ✅ Work Topic: ${result.powTopicId}`);
    console.log(`   ✅ Cert Topic: ${result.certificateTopicId}\n`);
    topics = result;
  }

  const profile = hcs10.getProfile();

  // Show current state
  console.log('📋 Current Status:');
  console.log(`   Agent ID: ${profile?.id || 'Not registered'}`);
  
  const finalTopics = pow.getTopicIds();
  console.log(`   Work Topic: ${finalTopics.powTopicId || 'Not initialized'}`);
  console.log(`   Cert Topic: ${finalTopics.certificateTopicId || 'Not initialized'}`);
  
  const history = await pow.getVerifiedWorkHistory(100);
  console.log(`   Records: ${history.records.length} work entries\n`);

  // ═══════════════════════════════════════════════════════════
  // TASK 1: Quick Research
  // ═══════════════════════════════════════════════════════════
  console.log('🔍 TASK 1: Quick Research (Hedera Ecosystem)');
  console.log('   Executing...');
  
  const task1Start = Date.now();
  const task1Result = await runSubAgent({
    role: 'researcher',
    task: 'What makes Hedera unique among blockchains?',
  });
  const task1Duration = Date.now() - task1Start;

  const record1 = await pow.recordWork({
    taskType: 'sub_agent',
    description: 'Research Hedera uniqueness',
    inputs: { task: 'What makes Hedera unique among blockchains?' },
    outputs: { 
      summary: task1Result.result.slice(0, 200),
      fullLength: task1Result.result.length 
    },
    toolsUsed: task1Result.tools_called,
    durationMs: task1Duration,
    success: true,
  });

  console.log(`   ✅ Complete: ${task1Duration}ms`);
  console.log(`   📝 Recorded: ${record1.id.slice(0, 16)}...\n`);

  // ═══════════════════════════════════════════════════════════
  // TASK 2: On-Chain Check
  // ═══════════════════════════════════════════════════════════
  console.log('⛓️  TASK 2: On-Chain Verification (Account Check)');
  console.log('   Executing...');
  
  const task2Start = Date.now();
  let task2Output: any = {};
  let task2Success = false;
  
  try {
    const balanceResult = await executeTool('hedera_get_balance', {
      account_id: '0.0.2', // Hedera treasury
    });
    task2Output = { balance: balanceResult };
    task2Success = true;
  } catch (e) {
    task2Output = { note: 'Balance check attempted', network: 'mainnet' };
  }
  const task2Duration = Date.now() - task2Start;

  const record2 = await pow.recordWork({
    taskType: 'analysis',
    description: 'Verify Hedera treasury account',
    inputs: { account_id: '0.0.2' },
    outputs: task2Output,
    toolsUsed: ['hedera_get_balance'],
    durationMs: task2Duration,
    success: task2Success,
  });

  console.log(`   ✅ Complete: ${task2Duration}ms`);
  console.log(`   📝 Recorded: ${record2.id.slice(0, 16)}...\n`);

  // ═══════════════════════════════════════════════════════════
  // TASK 3: Quick Analysis
  // ═══════════════════════════════════════════════════════════
  console.log('📊 TASK 3: Quick Analysis (Token Assessment)');
  console.log('   Executing...');
  
  const task3Start = Date.now();
  const task3Result = await runSubAgent({
    role: 'analyst',
    task: 'Analyze HBAR token utility and demand drivers',
  });
  const task3Duration = Date.now() - task3Start;

  const record3 = await pow.recordWork({
    taskType: 'analysis',
    description: 'Analyze HBAR token utility',
    inputs: { task: 'Analyze HBAR token utility and demand drivers' },
    outputs: { 
      analysis: task3Result.result.slice(0, 150),
      length: task3Result.result.length 
    },
    toolsUsed: task3Result.tools_called,
    durationMs: task3Duration,
    success: true,
  });

  console.log(`   ✅ Complete: ${task3Duration}ms`);
  console.log(`   📝 Recorded: ${record3.id.slice(0, 16)}...\n`);

  // ═══════════════════════════════════════════════════════════
  // UPDATE CAPABILITY PROOF
  // ═══════════════════════════════════════════════════════════
  console.log('🎯 Updating Capability Proof...');
  
  if (profile) {
    const proof = await pow.generateCapabilityProof(profile.id);
    console.log(`   📊 Total Tasks: ${proof.totalTasksCompleted}`);
    console.log(`   ✅ Success Rate: ${(proof.successRate * 100).toFixed(0)}%`);
    console.log(`   🎯 Capabilities: ${proof.capabilities.join(', ')}\n`);
  }

  // ═══════════════════════════════════════════════════════════
  // FINAL STATE
  // ═══════════════════════════════════════════════════════════
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  PROOF OF EXISTENCE COMPLETE                           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const finalHistory = await pow.getVerifiedWorkHistory(100);
  
  console.log('📈 Records Growing:');
  console.log(`   Before: ${history.records.length} entries`);
  console.log(`   After:  ${finalHistory.records.length} entries`);
  console.log(`   Added:  3 new work records\n`);

  console.log('🔗 Verify on HashScan:');
  console.log(`   Work Topic: https://hashscan.io/mainnet/topic/${finalTopics.powTopicId}`);
  console.log(`   Cert Topic: https://hashscan.io/mainnet/topic/${finalTopics.certificateTopicId}\n`);

  console.log('✨ Vera exists and works are being recorded!');
  console.log(`   Latest records:`);
  console.log(`   1. ${record1.id} - Research`);
  console.log(`   2. ${record2.id} - On-chain Check`);
  console.log(`   3. ${record3.id} - Analysis\n`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
