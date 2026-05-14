#!/usr/bin/env node
/**
 * Run Lattice Logger with tsx (TypeScript execution)
 */

import { latticeFindingsLogger, veraAgentSystem } from './src/agent/index.ts';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('\n📡 LATTICE FINDINGS LOGGER - TSX\n');

  const status = veraAgentSystem.getStatus();
  console.log('System Status:');
  console.log(`  Agents: ${status.agents}`);
  console.log(`  Tools: ${status.tools}`);
  console.log(`  Workflows: ${status.workflows}\n`);

  // Record findings
  latticeFindingsLogger.recordFinding('insight', 'vera-system', 'Lattice logger test', { test: true }, 9, 'test');
  
  console.log('✅ Finding recorded\n');

  // Submit to HCS
  const ref = await latticeFindingsLogger.submitPendingFindings();
  
  if (ref) {
    console.log('✅ Submitted to HCS:');
    console.log(`  Sequence: ${ref.hcsSequenceNumber}`);
    console.log(`  Topic: ${ref.hcsTopicId}`);
    console.log(`  URL: https://hashscan.io/mainnet/topic/${ref.hcsTopicId}/${ref.hcsSequenceNumber}\n`);
  } else {
    console.log('ℹ️ No submissions (check credentials or pending findings)\n');
  }

  // Start periodic
  latticeFindingsLogger.startPeriodicSubmission();
  console.log('🔄 Periodic submission active\n');

  // Keep alive
  setInterval(() => {}, 60000);
}

main().catch(console.error);
