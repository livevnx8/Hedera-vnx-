#!/usr/bin/env tsx
/**
 * Launch New Agents Script (Phase 3)
 * Initializes DeFi 2.0, AI Oracle, and Cross-Chain Bridge agents
 */

import { DeFi2Agent } from '../src/agents/defi2-agent.js';
import { AIOracleAgent } from '../src/agents/oracle-agent.js';
import { BridgeAgent } from '../src/agents/bridge-agent.js';
import { logger } from '../src/monitoring/logger.js';

console.log('🚀 Launching Phase 3: New Agent Types\n');

async function launchNewAgents() {
  const agents = [];

  // 1. DeFi 2.0 Agent
  console.log('1️⃣  Initializing DeFi 2.0 Agent...');
  const defi2Agent = new DeFi2Agent();
  await defi2Agent.initialize();
  agents.push(defi2Agent);
  console.log('   ✅ DeFi 2.0 Agent ready\n');

  // 2. AI Oracle Agent
  console.log('2️⃣  Initializing AI Oracle Agent...');
  const oracleAgent = new AIOracleAgent();
  await oracleAgent.initialize();
  agents.push(oracleAgent);
  console.log('   ✅ AI Oracle Agent ready\n');

  // 3. Cross-Chain Bridge Agent
  console.log('3️⃣  Initializing Bridge Agent...');
  const bridgeAgent = new BridgeAgent();
  await bridgeAgent.initialize();
  agents.push(bridgeAgent);
  console.log('   ✅ Bridge Agent ready\n');

  console.log('📊 All New Agents Launched:');
  console.log('   DeFi 2.0:   Liquid staking, DEX aggregation, yield optimization');
  console.log('   AI Oracle:  Price feeds, sentiment analysis, data verification');
  console.log('   Bridge:     Cross-chain monitoring, exploit detection, wrapped assets\n');

  // Start execution cycles
  console.log('🔄 Starting agent execution cycles...\n');
  
  setInterval(async () => {
    for (const agent of agents) {
      try {
        await agent.executeCycle();
      } catch (error) {
        logger.error('AgentCycle', {
          agent: agent.constructor.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }, 30000); // Every 30 seconds

  console.log('✅ Phase 3 Complete: New agents running!\n');
}

launchNewAgents().catch(error => {
  console.error('❌ Failed to launch agents:', error);
  process.exit(1);
});
