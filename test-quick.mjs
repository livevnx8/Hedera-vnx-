#!/usr/bin/env node
/**
 * Quick test of Vera Agent System
 */

import { 
  veraAgentSystem, 
  agentRegistry, 
  workflowOrchestrator 
} from './dist/agent/index.js';

console.log('\n🚀 Vera Agent System Test\n');

// Test 1: System Status
const status = veraAgentSystem.getStatus();
console.log('📊 System Status:');
console.log(`   Agents: ${status.agents}`);
console.log(`   Workflows: ${status.workflows}`);
console.log(`   Tools: ${status.tools}`);
console.log(`   Learning: ${status.learningEnabled ? 'enabled' : 'disabled'}`);

// Test 2: List Agents
console.log('\n🤖 Domain Agents:');
for (const agent of agentRegistry.listAgents()) {
  console.log(`   • ${agent.name} (${agent.id}) - ${agent.tools} tools`);
}

// Test 3: List Workflows
console.log('\n📋 Available Workflows:');
for (const wf of workflowOrchestrator.listWorkflows()) {
  console.log(`   • ${wf.name} (${wf.id}) - ${wf.category}`);
}

// Test 4: Tool Categories
console.log('\n🔧 Tool Categories:');
const categories = veraAgentSystem.listToolsByCategory();
for (const [cat, tools] of Object.entries(categories)) {
  console.log(`   • ${cat}: ${tools.length} tools`);
}

console.log('\n✅ Agent System Fully Operational\n');
