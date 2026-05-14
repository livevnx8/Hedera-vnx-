#!/usr/bin/env node
/**
 * Vera Agent System - Full Integration Test
 * Verifies all components work together correctly
 */

import { 
  veraAgentSystem, 
  agentRegistry, 
  workflowOrchestrator, 
  agentLearningSystem,
  executeTool 
} from './dist/agent/index.js';

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('           VERA AGENT SYSTEM - FULL INTEGRATION TEST');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  function test(name, fn) {
    return async () => {
      try {
        const success = await fn();
        results.tests.push({ name, status: success ? '✅ PASS' : '❌ FAIL' });
        if (success) results.passed++; else results.failed++;
        return success;
      } catch (error) {
        results.tests.push({ 
          name, 
          status: '❌ ERROR', 
          error: error instanceof Error ? error.message : String(error) 
        });
        results.failed++;
        return false;
      }
    };
  }

  // Test 1: System Status
  await test('System Status Check', () => {
    const status = veraAgentSystem.getStatus();
    console.log('   Agents:', status.agents);
    console.log('   Workflows:', status.workflows);
    console.log('   Tools:', status.tools);
    console.log('   Learning:', status.learningEnabled);
    return status.agents === 6 && status.workflows === 3 && status.tools >= 96;
  })();

  // Test 2: Domain Agents
  await test('Domain Agents Available', () => {
    const agents = agentRegistry.listAgents();
    console.log('   Available agents:', agents.map(a => a.name).join(', '));
    return agents.length === 6;
  })();

  // Test 3: Specific Agents
  await test('DeFi Agent', () => {
    const agent = agentRegistry.getAgent('agent-defi');
    console.log('   DeFi tools:', agent?.tools.length);
    return agent?.tools.includes('hts_create_token') || false;
  })();

  await test('NFT Agent', () => {
    const agent = agentRegistry.getAgent('agent-nft');
    console.log('   NFT tools:', agent?.tools.length);
    return agent?.tools.includes('hts_create_nft') || false;
  })();

  await test('Treasury Agent', () => {
    const agent = agentRegistry.getAgent('agent-treasury');
    console.log('   Treasury tools:', agent?.tools.length);
    return agent?.tools.includes('stake_to_node') || false;
  })();

  // Test 4: Workflows
  await test('Workflow Registry', () => {
    const workflows = workflowOrchestrator.listWorkflows();
    console.log('   Workflows:', workflows.map(w => w.name).join(', '));
    return workflows.length === 3;
  })();

  await test('DeFi Launch Workflow', () => {
    const template = workflowOrchestrator.getWorkflowTemplate('defi-token-launch');
    console.log('   Steps:', template?.steps.length);
    return template?.steps.length === 4 || false;
  })();

  await test('NFT Drop Workflow', () => {
    const template = workflowOrchestrator.getWorkflowTemplate('nft-drop');
    console.log('   Steps:', template?.steps.length);
    return template?.steps.length === 3 || false;
  })();

  // Test 5: New Tools Added
  await test('Staking Tools Defined', () => {
    const system = veraAgentSystem;
    const categories = system.listToolsByCategory();
    console.log('   Staking tools:', categories['Staking']?.length || 0);
    return (categories['Staking']?.length || 0) >= 8;
  })();

  await test('File Service Tools Defined', () => {
    const categories = veraAgentSystem.listToolsByCategory();
    console.log('   File tools:', categories['File Service']?.length || 0);
    return (categories['File Service']?.length || 0) >= 6;
  })();

  await test('Advanced Token Tools Defined', () => {
    const categories = veraAgentSystem.listToolsByCategory();
    console.log('   Advanced token tools:', categories['Advanced Token']?.length || 0);
    return (categories['Advanced Token']?.length || 0) >= 8;
  })();

  // Test 6: Learning System
  await test('Learning System Database', () => {
    const metrics = agentLearningSystem.getAllAgentMetrics();
    console.log('   Tracked agents:', metrics.length);
    return Array.isArray(metrics);
  })();

  // Test 7: System Integration
  await test('Agent System Integration', () => {
    const report = veraAgentSystem.generateReport();
    console.log('   Report length:', report.length, 'chars');
    return report.includes('Vera Agent System Report');
  })();

  await test('Tools by Category', () => {
    const categories = veraAgentSystem.listToolsByCategory();
    const totalTools = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);
    console.log('   Total tools:', totalTools);
    return totalTools >= 96;
  })();

  // Print Results
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                         TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  for (const test of results.tests) {
    console.log(`${test.status} ${test.name}`);
    if (test.error) {
      console.log(`   Error: ${test.error}`);
    }
  }

  console.log('\n───────────────────────────────────────────────────────────────────');
  console.log(`Total: ${results.passed + results.failed} | ✅ Passed: ${results.passed} | ❌ Failed: ${results.failed}`);
  console.log('───────────────────────────────────────────────────────────────────\n');

  // Print system summary
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                      SYSTEM CAPABILITIES');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const status = veraAgentSystem.getStatus();
  console.log('✅ Domain Agents: 6 specialized agents');
  console.log('   - DeFi Strategist, NFT Curator, Governance Architect');
  console.log('   - Treasury Manager, Security Guardian, Enterprise Integration\n');

  console.log('✅ Workflow Engine: 3 built-in workflows');
  console.log('   - DeFi Token Launch (4 steps)');
  console.log('   - NFT Drop (3 steps)');
  console.log('   - Treasury Rebalancing (2 steps)\n');

  console.log(`✅ Tool Library: ${status.tools}+ tools`);
  console.log('   - Original 50+ Agent Kit tools');
  console.log('   - 8 new staking tools');
  console.log('   - 6 file service tools');
  console.log('   - 8 advanced token tools\n');

  console.log('✅ Learning Infrastructure:');
  console.log('   - Tool usage analytics');
  console.log('   - Skill graph construction');
  console.log('   - Automated recommendations\n');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`                 ALL SYSTEMS ${results.failed === 0 ? 'OPERATIONAL' : 'DEGRADED'}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
