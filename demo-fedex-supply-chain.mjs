#!/usr/bin/env node
/**
 * Vera FedEx Demo - Run all agents in demo mode
 * 
 * This script runs all three FedEx agents with --demo flag
 * to demonstrate the supply chain verification capabilities.
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const agents = [
  {
    name: 'Supply Chain Agent',
    file: 'agents/vera-fedex-supply-agent.mjs',
    color: '\x1b[36m' // Cyan
  },
  {
    name: 'Route Optimization Agent', 
    file: 'agents/vera-fedex-route-agent.mjs',
    color: '\x1b[32m' // Green
  },
  {
    name: 'Compliance Agent',
    file: 'agents/vera-fedex-compliance-agent.mjs',
    color: '\x1b[35m' // Magenta
  }
];

const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';

console.log(`${YELLOW}╔════════════════════════════════════════════════════════════╗${RESET}`);
console.log(`${YELLOW}║         VERA FEDEX SUPPLY CHAIN - DEMO MODE                ║${RESET}`);
console.log(`${YELLOW}║              Hedera Consensus Service Powered                ║${RESET}`);
console.log(`${YELLOW}╚════════════════════════════════════════════════════════════╝${RESET}`);
console.log('');
console.log('Starting all agents in demo mode...');
console.log('Press Ctrl+C to stop all agents\n');

const processes = [];

for (const agent of agents) {
  console.log(`${agent.color}🚀 Starting ${agent.name}...${RESET}`);
  
  const proc = spawn('node', [agent.file, '--demo'], {
    stdio: 'inherit',
    detached: false
  });
  
  processes.push(proc);
  
  // Small delay between agent starts
  await setTimeout(500);
}

console.log(`\n${YELLOW}📊 All agents running in demo mode${RESET}\n`);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${YELLOW}\n🛑 Stopping all agents...${RESET}`);
  processes.forEach(p => p.kill('SIGINT'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`\n${YELLOW}\n🛑 Stopping all agents...${RESET}`);
  processes.forEach(p => p.kill('SIGTERM'));
  process.exit(0);
});

// Wait for all processes to complete
await Promise.all(processes.map(p => new Promise((resolve) => {
  p.on('close', resolve);
})));

console.log(`\n${YELLOW}✓ Demo complete${RESET}`);
