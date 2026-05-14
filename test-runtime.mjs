#!/usr/bin/env node
/**
 * Vera Agent System - Runtime Test (using tsx)
 */

import { execSync } from 'child_process';

const testScript = `
import { veraAgentSystem, agentRegistry, workflowOrchestrator } from './src/agent/index.js';

console.log('\\n🚀 Vera Agent System Test\\n');

const status = veraAgentSystem.getStatus();
console.log('📊 System Status:');
console.log('   Agents:', status.agents);
console.log('   Workflows:', status.workflows);
console.log('   Tools:', status.tools);
console.log('   Learning:', status.learningEnabled ? 'enabled' : 'disabled');

console.log('\\n🤖 Domain Agents:');
for (const agent of agentRegistry.listAgents()) {
  console.log('   •', agent.name, '-', agent.tools, 'tools');
}

console.log('\\n📋 Workflows:');
for (const wf of workflowOrchestrator.listWorkflows()) {
  console.log('   •', wf.name, '(', wf.id, ')');
}

console.log('\\n✅ All Systems Operational\\n');
`;

console.log('Running test with tsx...\n');
try {
  execSync(`npx tsx -e "${testScript.replace(/"/g, '\\"')}"`, {
    cwd: '/home/vera-live-0-1/hedera-llm-api',
    stdio: 'inherit'
  });
} catch (e) {
  console.error('Test failed:', e.message);
}
