#!/usr/bin/env node
/**
 * Quick validation that lattice findings logger works
 */

console.log('\n🔍 Testing Lattice Findings Logger...\n');

try {
  // Test 1: Import check
  const { latticeFindingsLogger, veraAgentSystem } = await import('./dist/agent/index.js');
  console.log('✅ Imports successful');

  // Test 2: Check logger exists
  if (!latticeFindingsLogger) throw new Error('Logger not exported');
  console.log('✅ Logger instance exists');

  // Test 3: Record a finding
  const finding = latticeFindingsLogger.recordFinding(
    'test',
    'validator',
    'Validation test: Logger works',
    { test: true },
    5,
    'validation'
  );
  
  if (!finding.id) throw new Error('Finding has no ID');
  console.log('✅ Finding recorded:', finding.id.substring(0, 20) + '...');

  // Test 4: Query findings
  const findings = latticeFindingsLogger.queryFindings({ category: 'validation' });
  if (findings.length === 0) throw new Error('Query returned no results');
  console.log('✅ Query works, found', findings.length, 'finding(s)');

  // Test 5: Status check
  const status = latticeFindingsLogger.getStatus();
  console.log('✅ Status retrieved');
  console.log('   Total findings:', status.totalFindings);
  console.log('   Pending:', status.pendingFindings);

  // Test 6: Integration check
  if (!veraAgentSystem.findings) throw new Error('Not integrated into veraAgentSystem');
  console.log('✅ Integrated with veraAgentSystem');

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ ALL VALIDATION TESTS PASSED');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\nThe Lattice Findings Logger is working correctly!');
  console.log('\nUsage:');
  console.log('  veraAgentSystem.findings.recordFinding(type, source, summary, details, importance, category)');
  console.log('  latticeFindingsLogger.submitPendingFindings()');
  console.log('\nRun this to start periodic logging:');
  console.log('  node init-lattice-logger.mjs\n');

} catch (error) {
  console.error('\n❌ VALIDATION FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
