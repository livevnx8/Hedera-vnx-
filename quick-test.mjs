#!/usr/bin/env node
/**
 * Quick test - run this to verify lattice logger works
 */

console.log('Testing Lattice Logger...\n');

try {
  // Use dynamic import with correct path
  const agentModule = await import('./dist/agent/index.js');
  const { latticeFindingsLogger, veraAgentSystem } = agentModule;

  console.log('✅ Import successful');
  console.log('Logger exists:', !!latticeFindingsLogger);
  console.log('VeraAgentSystem exists:', !!veraAgentSystem);

  // Record a test finding
  const finding = latticeFindingsLogger.recordFinding(
    'test',
    'validator',
    'Test: Lattice logger is working',
    { test: true, timestamp: Date.now() },
    5,
    'validation'
  );

  console.log('\n✅ Finding recorded:');
  console.log('  ID:', finding.id);
  console.log('  Type:', finding.type);
  console.log('  Importance:', finding.importance);

  // Query findings
  const results = latticeFindingsLogger.queryFindings({ category: 'validation' });
  console.log('\n✅ Query returned', results.length, 'finding(s)');

  // Get status
  const status = latticeFindingsLogger.getStatus();
  console.log('\n📊 Status:');
  console.log('  Total findings:', status.totalFindings);
  console.log('  Pending:', status.pendingFindings);

  console.log('\n✅ ALL TESTS PASSED - Lattice Logger is working!');
  console.log('\nNext: Run node init-lattice-logger.mjs to start periodic logging');

} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
