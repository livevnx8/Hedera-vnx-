#!/usr/bin/env node
/**
 * Vera Cross-Agent Consensus Demo
 * Demonstrates agents communicating via BRIDGE topic
 */

import { Client, PrivateKey, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const BRIDGE_TOPIC = '0.0.10409354';

console.clear();
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🌉 CROSS-AGENT CONSENSUS DEMO                                      ║');
console.log('║  Demonstrating inter-agent communication via BRIDGE topic          ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Initialize client
const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';
const keyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY || '';

const client = Client.forMainnet();
let privateKey;
if (keyStr.length === 64) {
  try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
  catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
} else {
  privateKey = PrivateKey.fromString(keyStr);
}

client.setOperator(operatorId, privateKey);

console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Bridge Topic: ${BRIDGE_TOPIC}\n`);

// Simulate agents proposing actions
const agents = [
  { id: 'defi-analyst-v2-001', type: 'DEFI_ANALYST', weight: 0.30 },
  { id: 'energy-auditor-v2-001', type: 'ENERGY_AUDITOR', weight: 0.25 },
  { id: 'security-guardian-v2-001', type: 'SECURITY_GUARDIAN', weight: 0.25 },
  { id: 'carbon-validator-v2-001', type: 'CARBON_VALIDATOR', weight: 0.20 }
];

const proposals = [
  { type: 'ARBITRAGE_EXECUTION', description: 'Execute HBAR arbitrage opportunity', urgency: 'HIGH', confidence: 0.92 },
  { type: 'GRID_ALERT', description: 'WV grid frequency anomaly detected', urgency: 'CRITICAL', confidence: 0.88 },
  { type: 'CARBON_OFFSET', description: 'Corporate offset verification', urgency: 'NORMAL', confidence: 0.95 }
];

async function logToBridge(type, data) {
  try {
    const message = {
      type,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(BRIDGE_TOPIC)
      .setMessage(JSON.stringify(message))
      .execute(client);
    
    const receipt = await tx.getReceipt(client).catch(() => null);
    return receipt?.topicSequenceNumber?.toString() || tx.transactionId.toString();
  } catch (error) {
    console.error(`   ⚠️ Bridge log failed: ${error.message?.substring(0, 50)}`);
    return null;
  }
}

async function runDemo() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 CONSENSUS ROUND #1: Grid Anomaly Response');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const proposal = proposals[1]; // GRID_ALERT
  
  // Step 1: Agent detects anomaly and requests consensus
  console.log(`📤 ${agents[1].id} (${agents[1].type})`);
  console.log(`   Proposal: ${proposal.description}`);
  console.log(`   Urgency: ${proposal.urgency} | Confidence: ${(proposal.confidence * 100).toFixed(0)}%\n`);
  
  const consensusId = `consensus-${Date.now()}`;
  
  await logToBridge('CONSENSUS_REQUEST', {
    consensusId,
    fromAgent: agents[1].id,
    proposal,
    targetAgents: agents.map(a => a.id).filter(id => id !== agents[1].id),
    timeout: 30000,
    timestamp: Date.now()
  });
  
  console.log(`   📝 Logged to BRIDGE topic: ${BRIDGE_TOPIC}`);
  console.log(`   🔗 https://hashscan.io/mainnet/topic/${BRIDGE_TOPIC}\n`);
  
  // Step 2: Other agents vote
  console.log('🗳️  AGENT VOTES:\n');
  
  const votes = [];
  for (const agent of agents.filter(a => a.id !== agents[1].id)) {
    // Simulate decision logic
    const vote = agent.type === 'SECURITY_GUARDIAN' && proposal.urgency === 'CRITICAL' 
      ? 'APPROVE' 
      : Math.random() > 0.3 ? 'APPROVE' : 'ABSTAIN';
    
    const reasoning = vote === 'APPROVE' 
      ? 'Critical infrastructure risk - support immediate action'
      : 'Insufficient data for decision';
    
    votes.push({ agent: agent.id, vote, weight: agent.weight });
    
    console.log(`   ${agent.id}`);
    console.log(`   Vote: ${vote === 'APPROVE' ? '✅' : '⚪'} ${vote}`);
    console.log(`   Weight: ${(agent.weight * 100).toFixed(0)}% | Reasoning: ${reasoning}`);
    
    await logToBridge('CONSENSUS_VOTE', {
      consensusId,
      agentId: agent.id,
      agentType: agent.type,
      vote,
      reasoning,
      timestamp: Date.now()
    });
    console.log(`   📝 Vote logged to BRIDGE\n`);
  }
  
  // Step 3: Calculate result
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 CONSENSUS RESULT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const approvedWeight = votes
    .filter(v => v.vote === 'APPROVE')
    .reduce((sum, v) => sum + v.weight, 0);
  
  const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);
  const approvalRate = approvedWeight / totalWeight;
  
  const result = {
    consensusId,
    status: approvalRate >= 0.67 ? 'APPROVED' : 'REJECTED',
    approvedWeight,
    totalWeight,
    approvalRate: Math.round(approvalRate * 100),
    votes: votes.length,
    timestamp: Date.now()
  };
  
  console.log(`   Status: ${result.status === 'APPROVED' ? '✅' : '❌'} ${result.status}`);
  console.log(`   Approval Rate: ${result.approvalRate}% (threshold: 67%)`);
  console.log(`   Total Votes: ${result.votes}`);
  console.log(`   Weighted Support: ${(approvedWeight * 100).toFixed(0)}%\n`);
  
  await logToBridge('CONSENSUS_RESULT', result);
  console.log(`   📝 Result logged to BRIDGE\n`);
  
  // Step 4: Cross-agent alert if approved
  if (result.status === 'APPROVED') {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📡 CROSS-AGENT ALERT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    await logToBridge('CROSS_AGENT_ALERT', {
      alertType: 'GRID_EMERGENCY',
      message: 'Consensus reached: Execute grid stabilization protocol',
      fromAgent: agents[1].id,
      targetAgents: ['defi-analyst-v2-001', 'security-guardian-v2-001'],
      priority: 'CRITICAL',
      consensusId,
      timestamp: Date.now()
    });
    
    console.log(`   🚨 Alert sent to:`);
    console.log(`      - defi-analyst-v2-001 (pause high-energy arbitrage)`);
    console.log(`      - security-guardian-v2-001 (monitor network stability)`);
    console.log(`   📝 Alert logged to BRIDGE\n`);
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ DEMO COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('📊 Summary:');
  console.log(`   • Consensus requests: 1`);
  console.log(`   • Votes cast: ${votes.length}`);
  console.log(`   • Bridge messages: ${votes.length + 3}`);
  console.log(`   • Result: ${result.status}`);
  console.log(`\n🔗 View on HashScan:`);
  console.log(`   https://hashscan.io/mainnet/topic/${BRIDGE_TOPIC}\n`);
  
  client.close();
}

runDemo().catch(error => {
  console.error('❌ Demo failed:', error.message);
  client.close();
  process.exit(1);
});
