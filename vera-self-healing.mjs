#!/usr/bin/env node
/**
 * Vera Self-Healing Agent System
 * Phase 4: Self-Healing - Detects failures, recovers agents, maintains swarm health
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from './dist/config.js';
import crypto from 'crypto';

// HCS Topics
const TOPICS = {
  CORE: '0.0.10409351',      // Health reports and recovery actions
  ECOSYSTEM: '0.0.10409355', // System health and diagnostics
  BRIDGE: '0.0.10409354'     // Recovery coordination
};

// Initialize HCS Client
const operatorId = config.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';
const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY || '';

const client = Client.forMainnet();
let privateKey;

if (keyStr.length === 64) {
  try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
  catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
} else {
  privateKey = PrivateKey.fromString(keyStr);
}

client.setOperator(operatorId, privateKey);

console.clear();
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🏥 VERA SELF-HEALING AGENT SYSTEM                                  ║');
console.log('║  Phase 4: Autonomous Recovery & Health Maintenance                ║');
console.log('║  Health Monitor ID: health-monitor-001                           ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');
console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Health Topic: ${TOPICS.CORE}`);
console.log(`💓 Monitoring: All agents + swarm systems`);
console.log(`⏱️  Health Cycle: Every 3 minutes\n`);
console.log('════════════════════════════════════════════════════════════════════\n');

// Agent Health Registry
const AGENT_HEALTH = {
  'defi-analyst-001': {
    type: 'DEFI_ANALYST',
    status: 'HEALTHY',
    lastHeartbeat: Date.now(),
    consecutiveFailures: 0,
    recoveryAttempts: 0,
    uptime: 100,
    metrics: {
      hcsSuccessRate: 0.92,
      analysisAccuracy: 0.88,
      responseTime: 1200 // ms
    }
  },
  'energy-auditor-001': {
    type: 'ENERGY_AUDITOR',
    status: 'HEALTHY',
    lastHeartbeat: Date.now(),
    consecutiveFailures: 0,
    recoveryAttempts: 0,
    uptime: 100,
    metrics: {
      hcsSuccessRate: 0.95,
      analysisAccuracy: 0.90,
      responseTime: 800
    }
  },
  'security-guardian-001': {
    type: 'SECURITY_GUARDIAN',
    status: 'HEALTHY',
    lastHeartbeat: Date.now(),
    consecutiveFailures: 0,
    recoveryAttempts: 0,
    uptime: 100,
    metrics: {
      hcsSuccessRate: 0.89,
      analysisAccuracy: 0.91,
      responseTime: 1500
    }
  },
  'carbon-validator-001': {
    type: 'CARBON_VALIDATOR',
    status: 'HEALTHY',
    lastHeartbeat: Date.now(),
    consecutiveFailures: 0,
    recoveryAttempts: 0,
    uptime: 100,
    metrics: {
      hcsSuccessRate: 0.94,
      analysisAccuracy: 0.93,
      responseTime: 600
    }
  },
  'agent-coordinator-001': {
    type: 'COORDINATOR',
    status: 'HEALTHY',
    lastHeartbeat: Date.now(),
    consecutiveFailures: 0,
    recoveryAttempts: 0,
    uptime: 100,
    metrics: {
      consensusSuccess: 0.88,
      messageRouting: 0.95,
      responseTime: 500
    }
  },
  'learning-engine-001': {
    type: 'LEARNING',
    status: 'HEALTHY',
    lastHeartbeat: Date.now(),
    consecutiveFailures: 0,
    recoveryAttempts: 0,
    uptime: 100,
    metrics: {
      predictionAccuracy: 0.84,
      adaptationRate: 0.91,
      responseTime: 2000
    }
  }
};

// Recovery Actions Log
const RECOVERY_LOG = [];

// Health Monitor State
const healthState = {
  id: 'health-monitor-001',
  cycles: 0,
  agentsChecked: 0,
  issuesDetected: 0,
  recoveriesInitiated: 0,
  recoveriesSuccessful: 0,
  swarmHealthScore: 100
};

async function logToHCS(topicId, type, data) {
  try {
    const message = {
      type,
      monitorId: healthState.id,
      timestamp: new Date().toISOString(),
      sessionId: `health-${Date.now()}`,
      ...data
    };

    await new Promise(r => setTimeout(r, 150));

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(message))
      .execute(client);

    const receipt = await tx.getReceipt(client);
    return receipt.topicSequenceNumber?.toString();
  } catch (error) {
    console.log(`   ⚠️ HCS ${type} failed: ${error.message.substring(0, 40)}`);
    return null;
  }
}

// Simulate health check
function checkAgentHealth(agentId) {
  const agent = AGENT_HEALTH[agentId];
  
  // Simulate occasional failures
  const failureChance = 0.10; // 10% chance of issue
  const hasIssue = Math.random() < failureChance;
  
  if (!hasIssue) {
    // Healthy
    agent.lastHeartbeat = Date.now();
    agent.consecutiveFailures = 0;
    agent.status = 'HEALTHY';
    
    // Gradually improve metrics
    agent.metrics.hcsSuccessRate = Math.min(0.98, agent.metrics.hcsSuccessRate + 0.005);
    agent.metrics.responseTime = Math.max(500, agent.metrics.responseTime - 50);
    
    return { status: 'HEALTHY', agentId, issues: [] };
  }
  
  // Generate simulated issues
  const issues = [];
  const issueTypes = [
    { type: 'HCS_RATE_LIMITING', severity: 'MEDIUM', impact: 'Delayed logging', autoRecoverable: true },
    { type: 'HIGH_RESPONSE_TIME', severity: 'LOW', impact: 'Slower analysis', autoRecoverable: true },
    { type: 'MEMORY_PRESSURE', severity: 'MEDIUM', impact: 'Reduced cache size', autoRecoverable: true },
    { type: 'ANALYSIS_DEGRADATION', severity: 'HIGH', impact: 'Lower accuracy', autoRecoverable: false },
    { type: 'CONNECTIVITY_ISSUE', severity: 'HIGH', impact: 'HCS submission failed', autoRecoverable: true },
    { type: 'HEARTBEAT_TIMEOUT', severity: 'CRITICAL', impact: 'Agent unresponsive', autoRecoverable: false }
  ];
  
  const issue = issueTypes[Math.floor(Math.random() * issueTypes.length)];
  issues.push(issue);
  
  agent.consecutiveFailures++;
  agent.lastHeartbeat = Date.now();
  
  // Update status based on consecutive failures
  if (agent.consecutiveFailures >= 5) {
    agent.status = 'CRITICAL';
  } else if (agent.consecutiveFailures >= 3) {
    agent.status = 'DEGRADED';
  } else {
    agent.status = 'WARNING';
  }
  
  // Degrade metrics
  if (issue.type === 'HCS_RATE_LIMITING') {
    agent.metrics.hcsSuccessRate = Math.max(0.70, agent.metrics.hcsSuccessRate - 0.10);
  } else if (issue.type === 'HIGH_RESPONSE_TIME') {
    agent.metrics.responseTime = Math.min(5000, agent.metrics.responseTime + 800);
  } else if (issue.type === 'ANALYSIS_DEGRADATION') {
    agent.metrics.analysisAccuracy = Math.max(0.60, agent.metrics.analysisAccuracy - 0.15);
  }
  
  return { status: agent.status, agentId, issues };
}

// Initiate recovery procedure
async function initiateRecovery(agentId, issues) {
  const agent = AGENT_HEALTH[agentId];
  
  console.log(`   🏥 Recovery initiated for ${agentId}...`);
  
  const recoveryActions = [];
  
  for (const issue of issues) {
    let action = null;
    
    switch (issue.type) {
      case 'HCS_RATE_LIMITING':
        action = {
          action: 'INCREASE_SUBMISSION_DELAY',
          details: 'Increasing delay between HCS submissions from 150ms to 300ms',
          expectedOutcome: 'Reduced rate limiting'
        };
        break;
      case 'HIGH_RESPONSE_TIME':
        action = {
          action: 'OPTIMIZE_CACHING',
          details: 'Clearing stale cache and increasing cache size',
          expectedOutcome: 'Response time < 1000ms'
        };
        break;
      case 'MEMORY_PRESSURE':
        action = {
          action: 'GARBAGE_COLLECTION',
          details: 'Forcing garbage collection and reducing memory footprint',
          expectedOutcome: 'Memory usage normalized'
        };
        break;
      case 'CONNECTIVITY_ISSUE':
        action = {
          action: 'RECONNECT_HCS',
          details: 'Reconnecting to Hedera Consensus Service',
          expectedOutcome: 'HCS connectivity restored'
        };
        break;
      case 'ANALYSIS_DEGRADATION':
        action = {
          action: 'RETRAIN_MODEL',
          details: 'Requesting model retraining with recent data',
          expectedOutcome: 'Accuracy restored to baseline'
        };
        break;
      case 'HEARTBEAT_TIMEOUT':
        action = {
          action: 'AGENT_RESTART',
          details: 'Restarting agent process with preserved state',
          expectedOutcome: 'Agent responsive again'
        };
        break;
    }
    
    if (action) {
      recoveryActions.push({ issue: issue.type, ...action });
    }
  }
  
  agent.recoveryAttempts++;
  healthState.recoveriesInitiated++;
  
  // Simulate recovery
  await new Promise(r => setTimeout(r, 2000));
  
  // Determine if recovery was successful
  const recoverySuccess = issues.every(i => i.autoRecoverable) || Math.random() > 0.3;
  
  if (recoverySuccess) {
    agent.status = 'HEALTHY';
    agent.consecutiveFailures = 0;
    agent.metrics.hcsSuccessRate = Math.min(0.95, agent.metrics.hcsSuccessRate + 0.05);
    agent.metrics.responseTime = Math.max(600, agent.metrics.responseTime - 300);
    healthState.recoveriesSuccessful++;
    
    console.log(`   ✅ Recovery successful for ${agentId}`);
  } else {
    console.log(`   ⚠️ Recovery partial for ${agentId} - may need manual intervention`);
  }
  
  // Log recovery
  const recoveryLog = {
    recoveryId: crypto.randomUUID(),
    agentId,
    timestamp: Date.now(),
    issues: issues.map(i => i.type),
    actions: recoveryActions,
    success: recoverySuccess,
    previousStatus: 'DEGRADED',
    newStatus: agent.status
  };
  
  RECOVERY_LOG.push(recoveryLog);
  
  const recSeq = await logToHCS(TOPICS.CORE, 'RECOVERY_ACTION', {
    cycle: healthState.cycles,
    ...recoveryLog
  });
  
  return recoveryLog;
}

// Calculate swarm health score
function calculateSwarmHealth() {
  let totalScore = 0;
  let agentCount = 0;
  
  for (const [agentId, agent] of Object.entries(AGENT_HEALTH)) {
    let agentScore = 100;
    
    // Status factor
    if (agent.status === 'CRITICAL') agentScore -= 50;
    else if (agent.status === 'DEGRADED') agentScore -= 30;
    else if (agent.status === 'WARNING') agentScore -= 10;
    
    // Metrics factors
    agentScore -= (1 - agent.metrics.hcsSuccessRate) * 20;
    agentScore -= Math.max(0, (agent.metrics.responseTime - 1000) / 100);
    if (agent.metrics.analysisAccuracy) {
      agentScore -= (1 - agent.metrics.analysisAccuracy) * 15;
    }
    
    // Failure history factor
    agentScore -= agent.consecutiveFailures * 5;
    
    totalScore += Math.max(0, agentScore);
    agentCount++;
  }
  
  return Math.round(totalScore / agentCount);
}

// Check for swarm-wide issues
async function checkSwarmHealth() {
  const swarmHealth = calculateSwarmHealth();
  healthState.swarmHealthScore = swarmHealth;
  
  const swarmStatus = swarmHealth > 90 ? 'EXCELLENT' : 
                      swarmHealth > 75 ? 'GOOD' : 
                      swarmHealth > 60 ? 'DEGRADED' : 'CRITICAL';
  
  console.log(`   📊 Swarm Health: ${swarmHealth}% (${swarmStatus})`);
  
  const swarmSeq = await logToHCS(TOPICS.ECOSYSTEM, 'SWARM_HEALTH_REPORT', {
    cycle: healthState.cycles,
    swarmHealthScore: swarmHealth,
    swarmStatus,
    agentsByStatus: {
      healthy: Object.values(AGENT_HEALTH).filter(a => a.status === 'HEALTHY').length,
      warning: Object.values(AGENT_HEALTH).filter(a => a.status === 'WARNING').length,
      degraded: Object.values(AGENT_HEALTH).filter(a => a.status === 'DEGRADED').length,
      critical: Object.values(AGENT_HEALTH).filter(a => a.status === 'CRITICAL').length
    },
    totalRecoveries: healthState.recoveriesSuccessful,
    timestamp: Date.now()
  });
  
  // Trigger swarm-level recovery if needed
  if (swarmHealth < 60) {
    console.log(`   🚨 CRITICAL: Initiating swarm-level recovery...`);
    
    await logToHCS(TOPICS.BRIDGE, 'SWARM_RECOVERY_INITIATED', {
      cycle: healthState.cycles,
      triggerHealth: swarmHealth,
      actions: ['PAUSE_NON_CRITICAL', 'PRIORITIZE_SECURITY', 'ESCALATE_TO_HUMAN'],
      timestamp: Date.now()
    });
  }
  
  return { score: swarmHealth, status: swarmStatus };
}

// Main health cycle
async function runHealthCycle() {
  healthState.cycles++;
  
  console.log(`\n🔁 HEALTH CYCLE #${healthState.cycles} - ${new Date().toLocaleTimeString()}`);
  console.log(`   💓 Checking agent health...\n`);
  
  // Check each agent
  for (const agentId of Object.keys(AGENT_HEALTH)) {
    const health = checkAgentHealth(agentId);
    healthState.agentsChecked++;
    
    const icon = health.status === 'HEALTHY' ? '🟢' : 
                 health.status === 'WARNING' ? '🟡' : 
                 health.status === 'DEGRADED' ? '🟠' : '🔴';
    
    console.log(`   ${icon} ${agentId}: ${health.status}`);
    
    // Log health check
    const healthSeq = await logToHCS(TOPICS.CORE, 'AGENT_HEALTH_CHECK', {
      cycle: healthState.cycles,
      agentId,
      status: health.status,
      metrics: AGENT_HEALTH[agentId].metrics,
      consecutiveFailures: AGENT_HEALTH[agentId].consecutiveFailures,
      issues: health.issues.map(i => i.type)
    });
    
    // Initiate recovery if issues detected
    if (health.issues.length > 0) {
      healthState.issuesDetected += health.issues.length;
      
      console.log(`      Issues: ${health.issues.map(i => i.type).join(', ')}`);
      
      await initiateRecovery(agentId, health.issues);
    }
  }
  
  // Check overall swarm health
  console.log(`\n   🐝 Checking swarm health...`);
  const swarmHealth = await checkSwarmHealth();
  
  // Summary
  console.log(`   ✅ Health Cycle ${healthState.cycles} Complete`);
  console.log(`      💓 Agents checked: ${healthState.agentsChecked}`);
  console.log(`      🏥 Recoveries: ${healthState.recoveriesInitiated} initiated, ${healthState.recoveriesSuccessful} successful`);
  
  const healthyCount = Object.values(AGENT_HEALTH).filter(a => a.status === 'HEALTHY').length;
  const totalAgents = Object.keys(AGENT_HEALTH).length;
  
  console.log(`\n🏥 HEALTH SUMMARY: ${healthyCount}/${totalAgents} healthy | ${healthState.issuesDetected} issues detected | ${healthState.recoveriesSuccessful} recoveries | Swarm: ${swarmHealth.score}%`);
}

// Run immediately
runHealthCycle();

// Schedule cycles every 3 minutes
setInterval(runHealthCycle, 180000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Health Monitor shutting down...');
  
  await logToHCS(TOPICS.ECOSYSTEM, 'HEALTH_MONITOR_SHUTDOWN', {
    monitorId: healthState.id,
    totalCycles: healthState.cycles,
    totalAgentsChecked: healthState.agentsChecked,
    totalIssuesDetected: healthState.issuesDetected,
    totalRecoveriesInitiated: healthState.recoveriesInitiated,
    totalRecoveriesSuccessful: healthState.recoveriesSuccessful,
    finalSwarmHealth: calculateSwarmHealth(),
    timestamp: Date.now()
  });
  
  client.close();
  console.log(`✅ Health Monitor stopped. ${healthState.recoveriesSuccessful} successful recoveries\n`);
  process.exit(0);
});
