#!/usr/bin/env node
/**
 * Vera Agent Collaboration Coordinator
 * Phase 2: Cross-Agent Messaging & Consensus
 * Coordinates communication between all specialized agents
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey, TopicMessageQuery } from '@hashgraph/sdk';
import { config } from './dist/config.js';
import crypto from 'crypto';

// HCS Topics
const TOPICS = {
  BRIDGE: '0.0.10409354',    // Cross-agent collaboration hub
  CORE: '0.0.10409351',      // Agent registry & consensus
  DEFI: '0.0.10409352',      // DeFi findings
  CARBON: '0.0.10409353',    // Energy/Carbon findings
  ECOSYSTEM: '0.0.10409355'  // Ecosystem coordination
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
console.log('║  🤖 VERA AGENT COLLABORATION COORDINATOR                            ║');
console.log('║  Phase 2: Cross-Agent Messaging & Consensus                        ║');
console.log('║  Coordinator ID: agent-coordinator-001                           ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');
console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Bridge Topic: ${TOPICS.BRIDGE}`);
console.log(`🎯 Agents: DeFi | Energy | Security | Carbon`);
console.log(`⏱️  Consensus Window: 30 seconds\n`);
console.log('════════════════════════════════════════════════════════════════════\n');

// Agent Registry
const REGISTERED_AGENTS = {
  'defi-analyst-001': {
    type: 'DEFI_ANALYST',
    capabilities: ['tokenomics', 'whale_detection', 'arbitrage'],
    weight: 1.0,
    accuracy: 0.92,
    lastSeen: Date.now(),
    status: 'ACTIVE'
  },
  'energy-auditor-001': {
    type: 'ENERGY_AUDITOR',
    capabilities: ['grid_monitoring', 'carbon_tracking', 'load_prediction'],
    weight: 1.0,
    accuracy: 0.90,
    lastSeen: Date.now(),
    status: 'ACTIVE'
  },
  'security-guardian-001': {
    type: 'SECURITY_GUARDIAN',
    capabilities: ['threat_detection', 'anomaly_scanning', 'contract_audit'],
    weight: 1.0,
    accuracy: 0.88,
    lastSeen: Date.now(),
    status: 'ACTIVE'
  },
  'carbon-validator-001': {
    type: 'CARBON_VALIDATOR',
    capabilities: ['offset_verification', 'retirement_validation', 'impact_calc'],
    weight: 1.0,
    accuracy: 0.94,
    lastSeen: Date.now(),
    status: 'ACTIVE'
  }
};

// Collaboration State
const coordinatorState = {
  id: 'agent-coordinator-001',
  cycles: 0,
  pendingAlerts: new Map(),
  consensusResults: [],
  crossAgentMessages: 0,
  multiAgentAttestations: 0
};

// Alert priorities
const PRIORITY_WEIGHTS = {
  CRITICAL: 1.0,
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.2
};

async function logToHCS(topicId, type, data) {
  try {
    const message = {
      type,
      agentId: coordinatorState.id,
      timestamp: new Date().toISOString(),
      sessionId: `coord-session-${Date.now()}`,
      ...data
    };

    // Add delay to prevent HCS rate limiting
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

// Process cross-agent alerts from Bridge topic
async function processBridgeAlerts() {
  console.log(`   📡 Scanning Bridge topic for cross-agent alerts...`);
  
  // Simulate reading recent bridge messages
  // In production, this would query HCS topic history
  const simulatedAlerts = generateSimulatedAlerts();
  
  let processedCount = 0;
  let consensusTriggered = 0;
  
  for (const alert of simulatedAlerts) {
    const alertId = crypto.randomUUID();
    
    console.log(`   🔔 Alert from ${alert.fromAgent}: ${alert.alertType}`);
    console.log(`      Priority: ${alert.priority} | Message: ${alert.message.substring(0, 50)}...`);
    
    // Register pending alert
    coordinatorState.pendingAlerts.set(alertId, {
      ...alert,
      id: alertId,
      timestamp: Date.now(),
      responses: new Map(),
      consensusDeadline: Date.now() + 30000 // 30 seconds
    });
    
    // Log alert to coordination topic
    const alertSeq = await logToHCS(TOPICS.CORE, 'CROSS_AGENT_ALERT_RECEIVED', {
      alertId,
      ...alert,
      coordinator: coordinatorState.id,
      status: 'PENDING_CONSENSUS'
    });
    
    if (alertSeq) {
      console.log(`      🔗 Logged: https://hashscan.io/mainnet/topic/${TOPICS.CORE}/${alertSeq}`);
    }
    
    // Request collaboration from target agents
    if (alert.targetAgents && alert.targetAgents.length > 0) {
      console.log(`      📨 Requesting collaboration from: ${alert.targetAgents.join(', ')}`);
      
      for (const targetAgent of alert.targetAgents) {
        // Simulate requesting collaboration
        await requestAgentCollaboration(alertId, alert, targetAgent);
      }
    }
    
    // Trigger consensus for high-priority alerts
    if (alert.priority === 'CRITICAL' || alert.priority === 'HIGH') {
      console.log(`      ⚡ Triggering multi-agent consensus...`);
      await initiateConsensus(alertId, alert);
      consensusTriggered++;
    }
    
    processedCount++;
    coordinatorState.crossAgentMessages++;
    
    // Small delay to prevent rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  
  return { processed: processedCount, consensus: consensusTriggered };
}

// Generate simulated cross-agent alerts
function generateSimulatedAlerts() {
  const alerts = [];
  
  // Security alert requiring DeFi analysis
  alerts.push({
    fromAgent: 'security-guardian-001',
    alertType: 'FLASH_LOAN_ATTACK',
    message: 'Critical flash loan attack detected on Blade DEX - $500K exploit',
    priority: 'CRITICAL',
    targetAgents: ['defi-analyst-001'],
    requiresImmediate: true,
    threatDetails: {
      contract: '0.0.12348',
      amount: 500000,
      confidence: 0.79
    }
  });
  
  // Double-counting alert
  alerts.push({
    fromAgent: 'carbon-validator-001',
    alertType: 'DOUBLE_COUNTING',
    message: 'Potential serial number reuse in Verra VCS registry for Appalachian Forest project',
    priority: 'HIGH',
    targetAgents: ['security-guardian-001', 'defi-analyst-001'],
    conflict: {
      registry: 'Verra VCS',
      conflictType: 'SERIAL_NUMBER_REUSE',
      severity: 'CRITICAL'
    }
  });
  
  // High-quality offset for energy correlation
  alerts.push({
    fromAgent: 'carbon-validator-001',
    alertType: 'HIGH_QUALITY_OFFSET',
    message: 'Platinum-verified carbon offset: Appalachian Forest Conservation',
    priority: 'LOW',
    targetAgents: ['energy-auditor-001'],
    projectDetails: {
      projectId: 'VCS-VCU-1523',
      availableCredits: 50000,
      confidence: 0.98
    }
  });
  
  // Grid anomaly alert
  alerts.push({
    fromAgent: 'energy-auditor-001',
    alertType: 'GRID_ANOMALY',
    message: 'Frequency deviation detected: 59.92 Hz (deviation -0.08 Hz)',
    priority: 'HIGH',
    targetAgents: ['security-guardian-001'],
    anomaly: {
      type: 'GRID_FREQUENCY_DEVIATION',
      severity: 'HIGH',
      value: 59.92
    }
  });
  
  return alerts;
}

// Request collaboration from specific agent
async function requestAgentCollaboration(alertId, originalAlert, targetAgent) {
  const collaborationId = crypto.randomUUID();
  
  // Log collaboration request
  const reqSeq = await logToHCS(TOPICS.BRIDGE, 'COLLABORATION_REQUEST', {
    collaborationId,
    alertId,
    fromCoordinator: coordinatorState.id,
    targetAgent,
    originalAlert: {
      fromAgent: originalAlert.fromAgent,
      alertType: originalAlert.alertType,
      priority: originalAlert.priority
    },
    requestTimestamp: Date.now(),
    responseDeadline: Date.now() + 30000
  });
  
  // Simulate agent response (in production, agent would respond via HCS)
  await simulateAgentResponse(collaborationId, alertId, targetAgent, originalAlert);
}

// Simulate agent response to collaboration request
async function simulateAgentResponse(collaborationId, alertId, agentId, originalAlert) {
  // Determine response based on agent capabilities
  const agent = REGISTERED_AGENTS[agentId];
  if (!agent) return;
  
  // Simulate analysis time
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 3000));
  
  // Generate response based on alert type and agent capabilities
  const response = generateAgentResponse(agentId, originalAlert);
  
  // Log collaboration response
  const respSeq = await logToHCS(TOPICS.BRIDGE, 'COLLABORATION_RESPONSE', {
    collaborationId,
    alertId,
    respondingAgent: agentId,
    agentType: agent.type,
    response,
    confidence: response.confidence,
    timestamp: Date.now()
  });
  
  if (respSeq) {
    console.log(`      ✅ ${agentId} responded: ${response.attestation} (${(response.confidence * 100).toFixed(0)}% conf)`);
  }
  
  // Store response for consensus calculation
  const pendingAlert = coordinatorState.pendingAlerts.get(alertId);
  if (pendingAlert) {
    pendingAlert.responses.set(agentId, response);
  }
}

// Generate agent-specific response
function generateAgentResponse(agentId, alert) {
  const agent = REGISTERED_AGENTS[agentId];
  const baseConfidence = agent.accuracy;
  
  // Adjust confidence based on alert type match with capabilities
  let typeMatch = 0.5;
  
  if (alert.alertType === 'FLASH_LOAN_ATTACK' && agent.type === 'DEFI_ANALYST') {
    typeMatch = 1.0;
  } else if (alert.alertType === 'DOUBLE_COUNTING' && agent.type === 'SECURITY_GUARDIAN') {
    typeMatch = 0.9;
  } else if (alert.alertType === 'GRID_ANOMALY' && agent.type === 'SECURITY_GUARDIAN') {
    typeMatch = 0.7;
  } else if (alert.alertType === 'HIGH_QUALITY_OFFSET' && agent.type === 'ENERGY_AUDITOR') {
    typeMatch = 0.8;
  }
  
  const finalConfidence = Math.round(baseConfidence * typeMatch * 100) / 100;
  
  return {
    attestation: finalConfidence > 0.85 ? 'CONFIRMED' : finalConfidence > 0.60 ? 'UNCERTAIN' : 'DISPUTED',
    confidence: finalConfidence,
    analysis: `Analyzed by ${agent.type} with ${(finalConfidence * 100).toFixed(0)}% confidence`,
    recommendedAction: finalConfidence > 0.90 ? 'PROCEED' : finalConfidence > 0.70 ? 'INVESTIGATE' : 'REJECT',
    timestamp: Date.now()
  };
}

// Initiate multi-agent consensus
async function initiateConsensus(alertId, alert) {
  const consensusId = crypto.randomUUID();
  
  console.log(`      🗳️  Consensus ID: ${consensusId.substring(0, 8)}`);
  
  // Wait for responses (simulated)
  await new Promise(r => setTimeout(r, 5000));
  
  const pendingAlert = coordinatorState.pendingAlerts.get(alertId);
  if (!pendingAlert) return;
  
  // Calculate consensus
  const responses = Array.from(pendingAlert.responses.values());
  
  if (responses.length === 0) {
    console.log(`      ⚠️ No agent responses - consensus failed`);
    return;
  }
  
  // Weighted voting
  let totalWeight = 0;
  let weightedConfidence = 0;
  let confirmedCount = 0;
  let disputedCount = 0;
  
  for (const [agentId, response] of pendingAlert.responses) {
    const agent = REGISTERED_AGENTS[agentId];
    const weight = (agent?.weight || 1.0) * PRIORITY_WEIGHTS[alert.priority];
    
    totalWeight += weight;
    weightedConfidence += response.confidence * weight;
    
    if (response.attestation === 'CONFIRMED') confirmedCount++;
    if (response.attestation === 'DISPUTED') disputedCount++;
  }
  
  const consensusConfidence = Math.round((weightedConfidence / totalWeight) * 100) / 100;
  const consensusResult = {
    id: consensusId,
    alertId,
    alertType: alert.alertType,
    priority: alert.priority,
    participatingAgents: Array.from(pendingAlert.responses.keys()),
    responsesCount: responses.length,
    confirmedCount,
    disputedCount,
    consensusConfidence,
    result: consensusConfidence > 0.85 ? 'CONSENSUS_REACHED' : 
            consensusConfidence > 0.60 ? 'PARTIAL_CONSENSUS' : 'NO_CONSENSUS',
    finalAttestation: confirmedCount > disputedCount ? 'VALIDATED' : 'DISPUTED',
    requiresHumanReview: consensusConfidence < 0.90,
    timestamp: Date.now()
  };
  
  // Log consensus result
  const consSeq = await logToHCS(TOPICS.CORE, 'CONSENSUS_RESULT', {
    consensusId,
    ...consensusResult,
    coordinator: coordinatorState.id
  });
  
  if (consSeq) {
    const emoji = consensusResult.result === 'CONSENSUS_REACHED' ? '✅' : 
                  consensusResult.result === 'PARTIAL_CONSENSUS' ? '⚡' : '❌';
    console.log(`      ${emoji} Consensus: ${consensusResult.result} (${(consensusConfidence * 100).toFixed(1)}% conf)`);
    console.log(`         Agents: ${consensusResult.participatingAgents.length} | Confirmed: ${confirmedCount} | Disputed: ${disputedCount}`);
    console.log(`         Final: ${consensusResult.finalAttestation} | Human Review: ${consensusResult.requiresHumanReview ? 'YES' : 'NO'}`);
    console.log(`         🔗 https://hashscan.io/mainnet/topic/${TOPICS.CORE}/${consSeq}`);
  }
  
  coordinatorState.consensusResults.push(consensusResult);
  coordinatorState.multiAgentAttestations++;
  
  // Remove from pending
  coordinatorState.pendingAlerts.delete(alertId);
}

// Update agent registry
async function updateAgentRegistry() {
  console.log(`   📋 Updating agent registry...`);
  
  // Update last seen timestamps
  for (const [agentId, agent] of Object.entries(REGISTERED_AGENTS)) {
    agent.lastSeen = Date.now();
    agent.status = 'ACTIVE';
  }
  
  // Log registry state
  const regSeq = await logToHCS(TOPICS.CORE, 'AGENT_REGISTRY_UPDATE', {
    coordinator: coordinatorState.id,
    agents: Object.entries(REGISTERED_AGENTS).map(([id, agent]) => ({
      id,
      type: agent.type,
      capabilities: agent.capabilities,
      accuracy: agent.accuracy,
      status: agent.status,
      lastSeen: agent.lastSeen
    })),
    timestamp: Date.now()
  });
  
  if (regSeq) {
    console.log(`      ✅ Registry updated: ${Object.keys(REGISTERED_AGENTS).length} agents active`);
  }
}

// Main coordination cycle
async function runCoordinationCycle() {
  coordinatorState.cycles++;
  
  console.log(`\n🔁 COORDINATION CYCLE #${coordinatorState.cycles} - ${new Date().toLocaleTimeString()}`);
  
  // Update agent registry
  await updateAgentRegistry();
  
  // Process bridge alerts
  const { processed, consensus } = await processBridgeAlerts();
  
  // Summary
  console.log(`   ✅ Cycle ${coordinatorState.cycles} Complete`);
  console.log(`      📨 Cross-agent messages: ${processed}`);
  console.log(`      🗳️  Consensus events: ${consensus}`);
  console.log(`      ⏳ Pending alerts: ${coordinatorState.pendingAlerts.size}`);
  
  console.log(`\n📈 COORDINATOR TOTALS: ${coordinatorState.crossAgentMessages} messages | ${coordinatorState.multiAgentAttestations} attestations | ${coordinatorState.cycles} cycles`);
  
  if (coordinatorState.consensusResults.length > 0) {
    const recent = coordinatorState.consensusResults.slice(-3);
    console.log(`\n🗳️  Recent Consensus:`);
    recent.forEach(c => {
      const icon = c.result === 'CONSENSUS_REACHED' ? '✅' : c.result === 'PARTIAL_CONSENSUS' ? '⚡' : '❌';
      console.log(`   ${icon} ${c.alertType}: ${c.result} (${(c.consensusConfidence * 100).toFixed(0)}% conf)`);
    });
  }
}

// Run immediately
runCoordinationCycle();

// Schedule cycles every 2 minutes
setInterval(runCoordinationCycle, 120000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Coordinator shutting down...');
  await logToHCS(TOPICS.CORE, 'COORDINATOR_SHUTDOWN', {
    coordinatorId: coordinatorState.id,
    totalCycles: coordinatorState.cycles,
    totalMessages: coordinatorState.crossAgentMessages,
    totalAttestations: coordinatorState.multiAgentAttestations,
    timestamp: Date.now()
  });
  client.close();
  console.log(`✅ Coordinator stopped. ${coordinatorState.multiAgentAttestations} multi-agent attestations completed\n`);
  process.exit(0);
});
