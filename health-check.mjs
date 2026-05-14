#!/usr/bin/env node
/**
 * Vera Agent Health Monitor
 * Checks all v2 agents are running and logging correctly
 */

import { readFileSync } from 'fs';
import { Client, TopicMessageQuery } from '@hashgraph/sdk';

const LOG_DIR = './logs';
const AGENTS = [
  { name: 'defi-analyst', log: 'defi-analyst.log', topic: '0.0.10409352' },
  { name: 'energy-auditor', log: 'energy-auditor.log', topic: '0.0.10409353' },
  { name: 'security-guardian', log: 'security-guardian.log', topic: '0.0.10409351' },
  { name: 'carbon-validator', log: 'carbon-validator.log', topic: '0.0.10409353' }
];

console.clear();
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🏥 VERA AGENT HEALTH MONITOR                                       ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

function checkAgentHealth(agent) {
  try {
    const logContent = readFileSync(`${LOG_DIR}/${agent.log}`, 'utf8');
    const lines = logContent.split('\n');
    
    // Count cycles
    const cycles = logContent.match(/CYCLE #\d+/g) || [];
    const lastCycle = cycles.length > 0 ? cycles[cycles.length - 1] : 'None';
    
    // Check for errors
    const errors = logContent.match(/❌|Error|failed/gi) || [];
    
    // Get last activity
    const lastLines = lines.slice(-5);
    const lastActivity = lastLines.find(l => l.includes('CYCLE') || l.includes('Complete')) || 'Unknown';
    
    // Check if running (PID exists)
    const pidFile = `${LOG_DIR}/${agent.name}.pid`;
    let isRunning = false;
    try {
      const pid = readFileSync(pidFile, 'utf8').trim();
      // Check if process exists (simplified - just check file exists for now)
      isRunning = true;
    } catch {
      isRunning = false;
    }
    
    return {
      name: agent.name,
      status: isRunning ? (errors.length === 0 ? '🟢 HEALTHY' : '🟡 WARNINGS') : '🔴 STOPPED',
      cycles: cycles.length,
      errors: errors.length,
      lastCycle,
      lastActivity: lastActivity.substring(0, 50),
      topic: agent.topic
    };
  } catch (error) {
    return {
      name: agent.name,
      status: '🔴 ERROR',
      error: error.message,
      cycles: 0,
      errors: 0
    };
  }
}

// Check each agent
console.log('📊 Agent Status:\n');
AGENTS.forEach(agent => {
  const health = checkAgentHealth(agent);
  
  console.log(`┌─ ${health.name.toUpperCase()}`);
  console.log(`│  Status: ${health.status}`);
  console.log(`│  Cycles: ${health.cycles} | Errors: ${health.errors}`);
  console.log(`│  Last: ${health.lastActivity}`);
  console.log(`│  Topic: https://hashscan.io/mainnet/topic/${health.topic}`);
  console.log(`└─`);
  console.log();
});

// Overall swarm health
const allHealth = AGENTS.map(checkAgentHealth);
const healthy = allHealth.filter(h => h.status.includes('🟢')).length;
const warnings = allHealth.filter(h => h.status.includes('🟡')).length;
const stopped = allHealth.filter(h => h.status.includes('🔴')).length;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📈 SWARM HEALTH: ${healthy} healthy | ${warnings} warnings | ${stopped} stopped`);
console.log(`🔄 Total Cycles: ${allHealth.reduce((sum, h) => sum + h.cycles, 0)}`);
console.log(`❌ Total Errors: ${allHealth.reduce((sum, h) => sum + h.errors, 0)}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (stopped > 0) {
  console.log('⚠️  Some agents stopped. Restart with: ./launch-v2-agents.sh\n');
}
