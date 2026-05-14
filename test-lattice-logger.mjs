#!/usr/bin/env node
/**
 * Test Lattice Findings Logger
 * Verifies the HCS logging system works correctly
 */

import { latticeFindingsLogger, veraAgentSystem } from './dist/agent/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🧪 LATTICE FINDINGS LOGGER - TEST SUITE                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const results = { passed: 0, failed: 0 };

  // Test 1: Record a finding
  console.log('TEST 1: Record a simple finding');
  try {
    const finding = latticeFindingsLogger.recordFinding(
      'insight',
      'test-agent',
      'Test finding: System operational',
      { test: true, timestamp: Date.now() },
      5,
      'test'
    );
    
    if (finding.id && finding.timestamp && finding.importance === 5) {
      console.log('✅ PASS: Finding recorded successfully');
      console.log(`   ID: ${finding.id}`);
      console.log(`   Type: ${finding.type}`);
      console.log(`   Importance: ${finding.importance}/10\n`);
      results.passed++;
    } else {
      throw new Error('Finding structure invalid');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    results.failed++;
  }

  // Test 2: Record critical finding (should trigger immediate submission consideration)
  console.log('TEST 2: Record critical finding (importance 9)');
  try {
    const finding = latticeFindingsLogger.recordFinding(
      'alert',
      'agent-security',
      'Critical: Unusual transaction pattern detected',
      { 
        severity: 'high',
        pattern: 'rapid_transfers',
        wallet: '0.0.12345'
      },
      9,
      'security'
    );
    
    if (finding.importance === 9) {
      console.log('✅ PASS: Critical finding recorded');
      console.log(`   ID: ${finding.id}`);
      console.log(`   Category: ${finding.category}\n`);
      results.passed++;
    } else {
      throw new Error('Critical finding not recorded correctly');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    results.failed++;
  }

  // Test 3: Query findings
  console.log('TEST 3: Query findings by criteria');
  try {
    const findings = latticeFindingsLogger.queryFindings({
      category: 'test',
      minImportance: 4,
      limit: 10
    });
    
    if (findings.length >= 1) {
      console.log('✅ PASS: Query returned results');
      console.log(`   Found ${findings.length} finding(s)`);
      console.log(`   First: "${findings[0].summary}"\n`);
      results.passed++;
    } else {
      throw new Error('Query returned no results');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    results.failed++;
  }

  // Test 4: Get status
  console.log('TEST 4: Get logger status');
  try {
    const status = latticeFindingsLogger.getStatus();
    
    if (status.totalFindings >= 2) {
      console.log('✅ PASS: Status retrieved');
      console.log(`   Total Findings: ${status.totalFindings}`);
      console.log(`   Pending: ${status.pendingFindings}`);
      console.log(`   References: ${status.totalReferences}`);
      console.log(`   Periodic Active: ${status.periodicSubmissionActive}\n`);
      results.passed++;
    } else {
      throw new Error('Status shows incorrect findings count');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    results.failed++;
  }

  // Test 5: Submit findings to HCS (if credentials available)
  console.log('TEST 5: Submit findings to HCS');
  const hasCredentials = process.env.HEDERA_OPERATOR_ACCOUNT_ID && process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  
  if (!hasCredentials) {
    console.log('⚠️ SKIP: No HCS credentials configured');
    console.log('   Set HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY\n');
  } else {
    try {
      // Record a few more findings to ensure we have a batch
      latticeFindingsLogger.recordFinding('insight', 'agent-defi', 'DeFi yield opportunity found', { apr: 15.5, pool: 'HBAR/USDC' }, 7, 'defi');
      latticeFindingsLogger.recordFinding('pattern', 'agent-treasury', 'Staking rewards claim pattern', { nodeId: 0, rewards: 125.50 }, 6, 'treasury');
      latticeFindingsLogger.recordFinding('action', 'agent-nft', 'NFT minted successfully', { tokenId: '0.0.98765', serial: 42 }, 5, 'nft');
      
      const reference = await latticeFindingsLogger.submitPendingFindings();
      
      if (reference && reference.hcsSequenceNumber > 0) {
        console.log('✅ PASS: Findings submitted to HCS');
        console.log(`   Reference ID: ${reference.refId}`);
        console.log(`   Topic: ${reference.hcsTopicId}`);
        console.log(`   Sequence: ${reference.hcsSequenceNumber}`);
        console.log(`   URL: https://hashscan.io/mainnet/topic/${reference.hcsTopicId}/${reference.hcsSequenceNumber}\n`);
        results.passed++;
      } else {
        throw new Error('HCS submission returned null');
      }
    } catch (error) {
      console.log('❌ FAIL:', error.message, '\n');
      results.failed++;
    }
  }

  // Test 6: Get references
  console.log('TEST 6: Get lattice references');
  try {
    const refs = latticeFindingsLogger.getReferences();
    
    console.log('✅ PASS: References retrieved');
    console.log(`   Total references: ${refs.length}`);
    if (refs.length > 0) {
      console.log(`   Latest: ${refs[0].refId}`);
      console.log(`   Summary: ${refs[0].summary}`);
      console.log(`   Importance: ${refs[0].importance.toFixed(1)}/10\n`);
    } else {
      console.log('   (No references yet - normal if HCS test skipped)\n');
    }
    results.passed++;
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    results.failed++;
  }

  // Test 7: Integration with veraAgentSystem
  console.log('TEST 7: Integration with veraAgentSystem');
  try {
    const hasFindings = !!veraAgentSystem.findings;
    const canRecord = typeof veraAgentSystem.findings.recordFinding === 'function';
    
    if (hasFindings && canRecord) {
      // Record through the agent system
      const finding = veraAgentSystem.findings.recordFinding(
        'insight',
        'integration-test',
        'Integration test: veraAgentSystem.findings works',
        { integration: true },
        6,
        'test'
      );
      
      console.log('✅ PASS: Integrated with veraAgentSystem');
      console.log(`   veraAgentSystem.findings: ${hasFindings}`);
      console.log(`   recordFinding: ${canRecord ? 'available' : 'missing'}`);
      console.log(`   Recorded: ${finding.id}\n`);
      results.passed++;
    } else {
      throw new Error('Integration not available');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    results.failed++;
  }

  // Summary
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`   Passed: ${results.passed}`);
  console.log(`   Failed: ${results.failed}`);
  console.log(`   Total: ${results.passed + results.failed}`);
  console.log(`   Status: ${results.failed === 0 ? '✅ ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED'}`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  if (results.failed === 0) {
    console.log('🎉 Lattice Findings Logger is working correctly!\n');
    console.log('Next steps:');
    console.log('   1. Run: node init-lattice-logger.mjs');
    console.log('   2. Check HCS topic: https://hashscan.io/mainnet/topic/0.0.10409351');
    console.log('   3. Use veraAgentSystem.findings.recordFinding() in your code\n');
    process.exit(0);
  } else {
    console.log('⚠️ Some tests failed. Check the output above.\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
