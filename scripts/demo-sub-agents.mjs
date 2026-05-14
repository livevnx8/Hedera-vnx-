#!/usr/bin/env node
/**
 * Vera Sub-Agent System Demo
 * 
 * Shows how Vera can spawn, manage, and monitor specialized sub-agents
 */

import { subAgentCoordinator } from '../src/vera/orchestrator/subAgentCoordinator.js';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const NC = '\x1b[0m';

console.log(`${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}`);
console.log(`${BLUE}║           VERA SUB-AGENT SYSTEM                                ║${NC}`);
console.log(`${BLUE}║           Specialized Agent Orchestration                      ║${NC}`);
console.log(`${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n`);

async function demoSubAgents() {
  console.log(`${YELLOW}💡 Vera can now spawn specialized sub-agents for parallel monitoring!${NC}\n`);

  // Demo 1: Spawn Energy Sub-Agents
  console.log(`${BLUE}1️⃣  Spawning Energy Domain Sub-Agents${NC}`);
  
  const energyAgents = [
    { id: 'grid-monitor-001', role: 'GRID_MONITOR', interval: 60000 },
    { id: 'weather-analyzer-001', role: 'WEATHER_ANALYZER', interval: 300000 },
    { id: 'load-predictor-001', role: 'LOAD_PREDICTOR', interval: 180000 }
  ];

  for (const agent of energyAgents) {
    const status = await subAgentCoordinator.spawn({
      id: agent.id,
      parentId: 'vera-energy-auditor',
      role: agent.role,
      domain: 'energy',
      interval: agent.interval,
      params: { region: 'West Virginia', zone: 'PJM_AEP' }
    });
    console.log(`   ${GREEN}✓${NC} ${CYAN}${agent.role}${NC} spawned (${status.id})`);
    console.log(`      State: ${status.state} | Domain: ${status.domain}`);
  }

  // Demo 2: Spawn Security Sub-Agents
  console.log(`\n${BLUE}2️⃣  Spawning Security Domain Sub-Agents${NC}`);
  
  const securityAgents = [
    { id: 'threat-detector-001', role: 'THREAT_DETECTOR', interval: 30000 },
    { id: 'contract-monitor-001', role: 'CONTRACT_MONITOR', interval: 120000 },
    { id: 'access-analyzer-001', role: 'ACCESS_ANALYZER', interval: 60000 }
  ];

  for (const agent of securityAgents) {
    const status = await subAgentCoordinator.spawn({
      id: agent.id,
      parentId: 'vera-security-guardian',
      role: agent.role,
      domain: 'security',
      interval: agent.interval,
      params: { sensitivity: 'high', autoAlert: true }
    });
    console.log(`   ${GREEN}✓${NC} ${CYAN}${agent.role}${NC} spawned (${status.id})`);
  }

  // Demo 3: Spawn DeFi Sub-Agents
  console.log(`\n${BLUE}3️⃣  Spawning DeFi Domain Sub-Agents${NC}`);
  
  const defiAgents = [
    { id: 'whale-tracker-001', role: 'WHALE_TRACKER', interval: 60000 },
    { id: 'arb-opportunity-001', role: 'ARB_OPPORTUNITY', interval: 30000 },
    { id: 'yield-optimizer-001', role: 'YIELD_OPTIMIZER', interval: 300000 }
  ];

  for (const agent of defiAgents) {
    const status = await subAgentCoordinator.spawn({
      id: agent.id,
      parentId: 'vera-defi-analyst',
      role: agent.role,
      domain: 'defi',
      interval: agent.interval,
      params: { protocols: ['saucer', 'stader', 'heliswap'], minYield: 0.05 }
    });
    console.log(`   ${GREEN}✓${NC} ${CYAN}${agent.role}${NC} spawned (${status.id})`);
  }

  // Demo 4: Record Some Executions
  console.log(`\n${BLUE}4️⃣  Simulating Sub-Agent Executions${NC}`);
  
  for (let i = 0; i < 5; i++) {
    const agentId = energyAgents[i % 3].id;
    const executionTime = Math.floor(Math.random() * 1000) + 500;
    const success = Math.random() > 0.1; // 90% success rate
    
    subAgentCoordinator.recordExecution(agentId, executionTime, success);
    console.log(`   ${CYAN}→${NC} ${agentId}: ${executionTime}ms ${success ? GREEN + '✓' : RED + '✗'}${NC}`);
  }

  // Demo 5: Get All Sub-Agents
  console.log(`\n${BLUE}5️⃣  Sub-Agent Fleet Status${NC}`);
  const allAgents = subAgentCoordinator.getAllSubAgents();
  console.log(`   Total sub-agents: ${CYAN}${allAgents.length}${NC}`);
  
  for (const agent of allAgents) {
    console.log(`   ${CYAN}→${NC} ${agent.id}: ${agent.role} (${agent.state}) - ${agent.runCount} runs, ${agent.errorCount} errors`);
  }

  // Demo 6: Health Check
  console.log(`\n${BLUE}6️⃣  Fleet Health Summary${NC}`);
  const health = subAgentCoordinator.getHealth();
  console.log(`   Total: ${CYAN}${health.total}${NC}`);
  console.log(`   Running: ${GREEN}${health.running}${NC}`);
  console.log(`   Idle: ${YELLOW}${health.idle}${NC}`);
  console.log(`   Error: ${health.error > 0 ? RED : ''}${health.error}${NC}`);
  console.log(`   By Domain: ${JSON.stringify(health.byDomain)}`);

  // Demo 7: Get by Domain
  console.log(`\n${BLUE}7️⃣  Domain-Specific Views${NC}`);
  
  for (const domain of ['energy', 'security', 'defi']) {
    const domainAgents = subAgentCoordinator.getByDomain(domain);
    console.log(`   ${CYAN}${domain}:${NC} ${domainAgents.length} sub-agents`);
  }

  // Demo 8: Kill a Sub-Agent
  console.log(`\n${BLUE}8️⃣  Terminating Sub-Agent${NC}`);
  const killed = await subAgentCoordinator.kill('access-analyzer-001');
  console.log(`   ${killed ? GREEN + '✓' : RED + '✗'}${NC} access-analyzer-001 ${killed ? 'terminated' : 'not found'}`);

  console.log(`\n${GREEN}════════════════════════════════════════════════════════════════${NC}`);
  console.log(`${GREEN}✅ Sub-Agent System Demo Complete${NC}`);
  console.log(`${GREEN}════════════════════════════════════════════════════════════════${NC}\n`);

  console.log(`${YELLOW}Key Features:${NC}`);
  console.log(`  • spawn_sub_agent - Vera spawns specialized monitoring agents`);
  console.log(`  • kill_sub_agent - Vera terminates sub-agents when done`);
  console.log(`  • get_sub_agents - Vera lists all active sub-agents`);
  console.log(`  • get_sub_agent_health - Vera monitors fleet health`);

  console.log(`\n${BLUE}Supported Roles:${NC}`);
  console.log(`  Energy: GRID_MONITOR, WEATHER_ANALYZER, LOAD_PREDICTOR`);
  console.log(`  Security: THREAT_DETECTOR, CONTRACT_MONITOR, ACCESS_ANALYZER`);
  console.log(`  DeFi: WHALE_TRACKER, ARB_OPPORTUNITY, YIELD_OPTIMIZER`);

  console.log(`\n${CYAN}Example Usage:${NC}`);
  console.log(`  Vera: "I need to monitor the grid"`);
  console.log(`  → spawn_sub_agent({ id: 'grid-001', role: 'GRID_MONITOR', domain: 'energy' })`);
  console.log(`  `);
  console.log(`  Vera: "Check my sub-agents"`);
  console.log(`  → get_sub_agents() → Returns all 8 sub-agents with status`);
  console.log(`  `);
  console.log(`  Vera: "How healthy is my fleet?"`);
  console.log(`  → get_sub_agent_health() → { total: 8, running: 7, idle: 0, error: 0 }`);
}

// Run demo
demoSubAgents().catch(err => {
  console.error(`${RED}Demo failed: ${err.message}${NC}`);
  process.exit(1);
});
