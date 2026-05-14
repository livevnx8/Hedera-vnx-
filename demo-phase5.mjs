#!/usr/bin/env node
/**
 * Phase 5 Demo - Swarm Intelligence & Autonomous Coordination
 */

import { SwarmConsensus, AutonomousCoordinator, TaskDelegator } from './blueprints/swarm-consensus.mjs';

console.clear();
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🐝 PHASE 5: SWARM INTELLIGENCE                                     ║');
console.log('║  Multi-Agent Consensus + Autonomous Decision Making                ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

async function runDemo() {
  
  // Demo 1: Swarm Voting
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1️⃣ MULTI-AGENT CONSENSUS VOTING\n');
  
  const swarm = new SwarmConsensus({ threshold: 0.6, timeout: 10000 });
  
  // Create emergency proposal
  const agents = [
    'vera-security-guardian',
    'vera-defi-analyst', 
    'vera-energy-auditor',
    'vera-carbon-validator'
  ];
  
  const proposal = await swarm.propose('EMERGENCY_SHUTDOWN', {
    threatLevel: 'HIGH',
    reason: 'Unusual network activity detected',
    affectedSystems: ['defi-pool-1', 'bridge-contract']
  }, agents);
  
  console.log(`   📝 Proposal: ${proposal.proposalId}`);
  console.log(`   Type: ${proposal.type}`);
  console.log(`   Participants: ${proposal.participants}`);
  console.log(`   Threshold: 60%\n`);
  
  // Cast votes
  console.log('   🗳️ Casting votes:');
  await swarm.vote(proposal.proposalId, 'vera-security-guardian', 'YES', { risk: 'critical' });
  console.log('      ✅ Security Guardian: YES (risk: critical)');
  
  await swarm.vote(proposal.proposalId, 'vera-defi-analyst', 'YES', { exposure: 'high' });
  console.log('      ✅ DeFi Analyst: YES (exposure: high)');
  
  await swarm.vote(proposal.proposalId, 'vera-energy-auditor', 'NO', { impact: 'grid stability' });
  console.log('      ❌ Energy Auditor: NO (impact: grid stability)');
  
  await swarm.vote(proposal.proposalId, 'vera-carbon-validator', 'ABSTAIN', { uncertainty: true });
  console.log('      ⚪ Carbon Validator: ABSTAIN (uncertainty)\n');
  
  const status = swarm.getStatus(proposal.proposalId);
  console.log(`   📊 Result: ${status.status}`);
  console.log(`      YES: ${status.yesRatio}% (${status.yes}/${agents.length})`);
  console.log(`      Participation: ${status.participation}%\n`);
  
  // Demo 2: Autonomous Decision
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2️⃣ AUTONOMOUS DECISION MAKING\n');
  
  const autoCoord = new AutonomousCoordinator({ threshold: 0.7 });
  
  const decision = await autoCoord.decide('SCALE_UP_MONITORING', {
    anomalyCount: 5,
    severity: 'MEDIUM',
    domain: 'energy'
  }, agents);
  
  console.log(`   🤖 Autonomous Decision: ${decision.type}`);
  console.log(`   Context: ${decision.context?.anomalyCount || 'N/A'} anomalies detected`);
  console.log(`   Result: ${decision.status}`);
  console.log(`   Consensus: ${decision.yesRatio}% YES votes\n`);
  
  // Demo 3: Task Delegation
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3️⃣ CROSS-AGENT TASK DELEGATION\n');
  
  const delegator = new TaskDelegator();
  
  const availableAgents = [
    { id: 'vera-security-guardian', capabilities: ['threat-analysis', 'scanning'], load: 2, successRate: 0.95, domain: 'security' },
    { id: 'vera-defi-analyst', capabilities: ['arbitrage', 'whale-tracking'], load: 5, successRate: 0.88, domain: 'defi' },
    { id: 'vera-energy-auditor', capabilities: ['load-prediction', 'anomaly-detection'], load: 1, successRate: 0.92, domain: 'energy' }
  ];
  
  const task = { type: 'anomaly-detection', domain: 'energy', priority: 'HIGH' };
  const delegation = await delegator.delegate(task, availableAgents);
  
  console.log(`   📋 Task: ${task.type} (${task.priority})`);
  console.log(`   🎯 Delegated to: ${delegation.assignedTo}`);
  console.log(`   Score: ${delegation.score}/100`);
  console.log(`   Reason: Best capability match + lowest load\n`);
  
  // Complete the task
  const completed = delegator.completeTask(delegation.taskId, {
    anomaliesFound: 3,
    confidence: 0.87
  });
  
  console.log(`   ✅ Task Completed:`);
  console.log(`      Anomalies found: ${completed.result.anomaliesFound}`);
  console.log(`      Confidence: ${Math.round(completed.result.confidence * 100)}%\n`);
  
  // Demo 4: Collective Intelligence
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('4️⃣ COLLECTIVE INTELLIGENCE METRICS\n');
  
  console.log('   📈 Consensus History:');
  const history = swarm.getHistory();
  history.forEach((h, i) => {
    console.log(`      ${i+1}. ${h.type}: ${h.status} (${h.yesRatio}% YES)`);
  });
  
  console.log('\n   🤖 Autonomous Decisions:');
  const decisions = autoCoord.getDecisionHistory();
  decisions.forEach((d, i) => {
    console.log(`      ${i+1}. ${d.type}: ${d.result.status} (${d.result.participation}% participation)`);
  });
  
  console.log('\n   📋 Completed Tasks:');
  const tasks = delegator.getCompleted();
  tasks.forEach((t, i) => {
    console.log(`      ${i+1}. ${t.task} → ${t.assignedTo} (${Math.round((t.completedAt - t.timestamp)/1000)}s)`);
  });
  
  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ PHASE 5 DEMO COMPLETE\n');
  
  console.log('🎯 Swarm Intelligence Features:');
  console.log('   • Multi-agent voting with configurable thresholds');
  console.log('   • Autonomous decision making without human input');
  console.log('   • Smart task delegation based on agent capabilities');
  console.log('   • Collective intelligence tracking');
  console.log('   • Cross-agent coordination via HCS BRIDGE topic');
  
  console.log('\n🚀 Integration Ready:');
  console.log('   • Integrate SwarmConsensus into AgentBase');
  console.log('   • Enable autonomous emergency responses');
  console.log('   • Cross-agent task distribution');
  console.log('   • Collective governance for critical decisions\n');
}

runDemo().catch(console.error);
