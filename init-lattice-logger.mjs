#!/usr/bin/env node
/**
 * Initialize Lattice Findings Logger
 * Starts periodic HCS logging of important agent findings
 */

import { latticeFindingsLogger, veraAgentSystem } from './dist/agent/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     📡 LATTICE FINDINGS LOGGER INITIALIZATION                      ║');
  console.log('║     Periodic HCS Logging for Agent Work                             ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // Get system status
  const status = veraAgentSystem.getStatus();
  const findingsStatus = latticeFindingsLogger.getStatus();

  console.log('📊 System Status:');
  console.log(`   Agents: ${status.agents}`);
  console.log(`   Workflows: ${status.workflows}`);
  console.log(`   Tools: ${status.tools}`);
  console.log(`   Pending Findings: ${findingsStatus.pendingFindings}`);
  console.log(`   Total References: ${findingsStatus.totalReferences}\n`);

  // Record initial findings
  console.log('📝 Recording initial findings...\n');

  // Connect agent system for proactive monitoring
  latticeFindingsLogger.connectAgentSystem(veraAgentSystem);

  // System deployment finding
  latticeFindingsLogger.recordFinding(
    'insight',
    'vera-system',
    'HBAR Agent System deployed with 109 tools, 6 agents, 3 workflows',
    {
      tools: status.tools,
      agents: status.agents,
      workflows: status.workflows,
      newTools: 22,
      toolCategories: ['Staking', 'File Service', 'Advanced Token', 'DeFi', 'NFT', 'Governance']
    },
    9,
    'deployment'
  );

  // Agent capability findings
  const agents = veraAgentSystem.registry.listAgents();
  agents.forEach(agent => {
    latticeFindingsLogger.recordFinding(
      'insight',
      agent.id,
      `${agent.name} ready with ${agent.tools} tools`,
      { role: agent.role, toolCount: agent.tools },
      7,
      'agent'
    );
  });

  // Workflow availability findings
  const workflows = veraAgentSystem.workflows.listWorkflows();
  workflows.forEach(wf => {
    latticeFindingsLogger.recordFinding(
      'insight',
      'workflow-engine',
      `Workflow available: ${wf.name}`,
      { category: wf.category, version: wf.version },
      6,
      'workflow'
    );
  });

  // Learning system finding
  latticeFindingsLogger.recordFinding(
    'insight',
    'learning-system',
    'Agent learning infrastructure active with analytics and recommendations',
    { enabled: status.learningEnabled },
    7,
    'learning'
  );

  console.log(`✅ Recorded ${findingsStatus.pendingFindings + 1 + agents.length + workflows.length} initial findings\n`);

  // Run initial tool test suite
  console.log('🔧 Running initial tool test suite...');
  const toolResults = await latticeFindingsLogger.runToolTestSuite();
  const toolSuccessCount = toolResults.filter(r => r.success).length;
  console.log(`✅ Initial tool tests: ${toolSuccessCount}/${toolResults.length} passed\n`);

  // Start periodic submission
  console.log('🔄 Starting periodic HCS submission (every 5 minutes)...');
  latticeFindingsLogger.startPeriodicSubmission();

  // Listen to findings events
  latticeFindingsLogger.on('findings_submitted', (data) => {
    console.log(`\n📤 Findings submitted to HCS:`);
    console.log(`   Batch: ${data.batch.batchId}`);
    console.log(`   Findings: ${data.batch.findings.length}`);
    console.log(`   Sequence: ${data.sequenceNumber}`);
    console.log(`   URL: https://hashscan.io/mainnet/topic/0.0.10409351/${data.sequenceNumber}`);
  });

  latticeFindingsLogger.on('finding_recorded', (finding) => {
    if (finding.importance >= 8) {
      console.log(`\n🔔 Critical finding recorded:`);
      console.log(`   [${finding.type.toUpperCase()}] ${finding.summary}`);
      console.log(`   Importance: ${finding.importance}/10`);
      console.log(`   Source: ${finding.source}`);
    }
  });

  // Initial submission
  console.log('\n📤 Submitting initial batch to HCS...');
  const ref = await latticeFindingsLogger.submitPendingFindings();
  
  if (ref) {
    console.log(`✅ Initial batch submitted`);
    console.log(`   Reference ID: ${ref.refId}`);
    console.log(`   Sequence: ${ref.hcsSequenceNumber}`);
    console.log(`   URL: https://hashscan.io/mainnet/topic/${ref.hcsTopicId}/${ref.hcsSequenceNumber}\n`);
  }

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('✅ LATTICE FINDINGS LOGGER ACTIVE');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log('📋 Features:');
  console.log('   • Auto-logs findings every 5 minutes');
  console.log('   • Critical findings (importance ≥9) logged immediately');
  console.log('   • Tool testing & execution verification');
  console.log('   • Tool performance tracking & optimization');
  console.log('   • Lattice references for cross-node sync');
  console.log('   • Queryable history by type, category, source');
  console.log('   • HCS topic: 0.0.10409351\n');

  console.log('🛠️  API Usage:');
  console.log('   latticeFindingsLogger.recordFinding(type, source, summary, details, importance, category)');
  console.log('   latticeFindingsLogger.queryFindings({ type, category, minImportance })');
  console.log('   latticeFindingsLogger.getLatestReference()\n');

  // Keep running for periodic submissions
  console.log('⏳ Logger running (Ctrl+C to stop)...\n');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down lattice findings logger...');
    latticeFindingsLogger.stopPeriodicSubmission();
    
    // Final submission
    latticeFindingsLogger.submitPendingFindings().then(() => {
      console.log('✅ Final findings submitted');
      process.exit(0);
    });
  });

  // Keep process alive
  setInterval(() => {}, 60000);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
