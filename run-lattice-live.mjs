#!/usr/bin/env node
/**
 * Initialize Lattice Findings Logger - LIVE VERSION
 */

import { latticeFindingsLogger, veraAgentSystem } from './dist/agent/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('\n📡 LATTICE FINDINGS LOGGER - LIVE\n');

  const status = veraAgentSystem.getStatus();
  const findingsStatus = latticeFindingsLogger.getStatus();

  console.log('System Status:');
  console.log(`  Agents: ${status.agents}`);
  console.log(`  Tools: ${status.tools}`);
  console.log(`  Pending Findings: ${findingsStatus.pendingFindings}\n`);

  // Record initial findings
  latticeFindingsLogger.recordFinding('insight', 'vera-system', 'HBAR Agent System deployed', { tools: status.tools, agents: status.agents }, 9, 'deployment');

  console.log('✅ Initial findings recorded');

  // Start periodic submission
  latticeFindingsLogger.startPeriodicSubmission();
  console.log('🔄 Periodic HCS submission started (every 5 min)\n');

  // Submit immediately
  const ref = await latticeFindingsLogger.submitPendingFindings();
  if (ref) {
    console.log(`✅ Submitted to HCS: Seq ${ref.hcsSequenceNumber}`);
    console.log(`🔗 https://hashscan.io/mainnet/topic/${ref.hcsTopicId}/${ref.hcsSequenceNumber}\n`);
  }

  console.log('Press Ctrl+C to stop\n');
  setInterval(() => {}, 60000);
}

main().catch(console.error);
