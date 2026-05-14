#!/usr/bin/env node
/**
 * Vera Agent Swarm Launcher
 * 
 * Master script to launch and manage all agents in the swarm.
 * Supports auto-scaling, monitoring, and graceful shutdown.
 */

import { spawn } from 'child_process';
import { logger } from './blueprints/logger.mjs';
import { getAutoScaler } from './infrastructure/autoScaler.mjs';
import dotenv from 'dotenv';

dotenv.config();

// Debug: Verify credentials are loaded
console.log('🔧 Launch Swarm - Environment Check:');
console.log('  HEDERA_OPERATOR_ACCOUNT_ID:', process.env.HEDERA_OPERATOR_ACCOUNT_ID || 'NOT SET');
console.log('  HEDERA_OPERATOR_PRIVATE_KEY:', process.env.HEDERA_OPERATOR_PRIVATE_KEY ? 'SET (' + process.env.HEDERA_OPERATOR_PRIVATE_KEY.length + ' chars)' : 'NOT SET');
console.log('');

const AGENTS = [
  // Healthcare (2 active, room for 3 more)
  { file: 'healthcare-supply-1.mjs', type: 'healthcare-supply', count: 1 },
  { file: 'healthcare-hipaa-1.mjs', type: 'healthcare-compliance', count: 1 },
  
  // Finance (1 active, room for 7 more)
  { file: 'finance-fraud-1.mjs', type: 'finance-fraud', count: 1 },
  
  // Logistics (1 active, room for 5 more)
  { file: 'logistics-track-1.mjs', type: 'logistics-tracker', count: 1 }
];

const processes = new Map();
let scaler = null;

/**
 * Launch a single agent
 */
function launchAgent(agentDef) {
  for (let i = 0; i < agentDef.count; i++) {
    const agentId = `${agentDef.type}-${i + 1}`;
    
    try {
      const child = spawn('node', [`./agents/${agentDef.file}`], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { 
          ...process.env, 
          AGENT_ID: agentId,
          LOG_LEVEL: 'INFO',
          HEDERA_OPERATOR_ACCOUNT_ID: process.env.HEDERA_OPERATOR_ACCOUNT_ID,
          HEDERA_OPERATOR_PRIVATE_KEY: process.env.HEDERA_OPERATOR_PRIVATE_KEY
        }
      });
      
      child.stdout.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            try {
              const log = JSON.parse(line);
              if (log.level === 'INFO') {
                console.log(`[${agentId}] ${log.message}`);
              }
            } catch {
              console.log(`[${agentId}] ${line}`);
            }
          }
        });
      });
      
      child.stderr.on('data', (data) => {
        console.error(`[${agentId}] ERROR: ${data.toString().trim()}`);
      });
      
      child.on('exit', (code) => {
        logger.warn('Agent exited', { agentId, code });
        processes.delete(agentId);
      });
      
      processes.set(agentId, { pid: child.pid, type: agentDef.type, child });
      logger.info('Agent launched', { agentId, pid: child.pid });
      
    } catch (error) {
      logger.error('Failed to launch agent', { agentId, error: error.message });
    }
  }
}

/**
 * Launch all agents
 */
async function launchSwarm() {
  logger.info('Starting Vera Agent Swarm...');
  console.log('\n🚀 VERA AGENT SWARM LAUNCHER\n');
  
  for (const agent of AGENTS) {
    console.log(`📦 Launching ${agent.type}...`);
    launchAgent(agent);
    await new Promise(r => setTimeout(r, 1000)); // Stagger launches
  }
  
  console.log(`\n✅ Launched ${processes.size} agents`);
  console.log('\nAgent Status:');
  for (const [id, proc] of processes) {
    console.log(`  • ${id} (PID: ${proc.pid})`);
  }
  
  // Start auto-scaler
  scaler = getAutoScaler({
    highThreshold: 0.8,
    lowThreshold: 0.3,
    maxAgents: 40,
    cooldown: 300000
  });
  
  // Register running agents with scaler
  for (const [id, proc] of processes) {
    scaler.registerAgent(id, proc.pid, proc.type);
  }
  
  console.log('\n📊 Auto-scaler active (thresholds: 30%-80%)');
  console.log('💡 Press Ctrl+C to shutdown gracefully\n');
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  console.log('\n🛑 Shutting down agent swarm...');
  logger.info('Shutting down swarm');
  
  // Stop auto-scaler
  if (scaler) {
    scaler.stop();
  }
  
  // Kill all agents
  for (const [id, proc] of processes) {
    try {
      process.kill(proc.pid, 'SIGTERM');
      console.log(`  ✓ ${id} stopped`);
    } catch (error) {
      console.log(`  ⚠ ${id} already stopped`);
    }
  }
  
  console.log('\n👋 All agents stopped\n');
  process.exit(0);
}

// Handle signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start
launchSwarm();
