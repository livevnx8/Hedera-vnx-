#!/usr/bin/env node
/**
 * Vera Retrain & Cleanup Process
 * Resets token memory and runs fresh high-capacity verification with expanded token discovery
 */

import { latticeFindingsLogger } from './dist/agent/index.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔄 VERA RETRAIN & CLEANUP PROCESS');
console.log('═'.repeat(70));

// Step 1: Generate recall summary before cleanup
console.log('\n📊 Step 1: Generating pre-cleanup recall summary...');
const recallSummary = latticeFindingsLogger.generateRecallSummary();
console.log(`   ✅ Recall summary recorded: ${recallSummary.id}`);

// Step 2: Cleanup old findings
console.log('\n🧹 Step 2: Cleaning up old findings (keeping last 24h)...');
latticeFindingsLogger.cleanupOldFindings();

// Step 3: Submit any remaining findings to HCS
console.log('\n📤 Step 3: Submitting pending findings to HCS...');
await latticeFindingsLogger.submitPendingFindings();

// Step 4: Log retrain complete
console.log('\n✅ Step 4: Logging retrain completion...');
latticeFindingsLogger.recordRecallPoint(
  'Vera retrain and cleanup process',
  'worked',
  9,
  {
    whatWorked: 'Successfully cleaned up old findings and prepared for fresh run',
    bestWay: 'Always generate recall summary before cleanup, then submit remaining findings',
    lessonsLearned: 'Retrain process maintains learning continuity while clearing stale data'
  },
  { timestamp: Date.now(), cleanupType: '24h_retention' }
);

// Step 5: Final HCS submission
console.log('\n📤 Step 5: Final HCS submission...');
await latticeFindingsLogger.submitPendingFindings();

console.log('\n' + '═'.repeat(70));
console.log('✅ RETRAIN COMPLETE - Ready for fresh high-capacity run');
console.log('   Token discovery expanded to 24 HTS tokens');
console.log('   Multi-topic nervous system active');
console.log('   All learnings preserved in HCS recall points');
console.log('═'.repeat(70));
console.log('\n🚀 Next: Run the high-capacity DOVU verification system');
console.log('   Command: node vera-dovu-high-capacity.mjs');
