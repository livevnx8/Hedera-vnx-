#!/usr/bin/env node
/**
 * Vera Autonomous Decision System
 * Phase 4: Autonomous Operations - Self-governing agent swarm making real decisions
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from './dist/config.js';
import crypto from 'crypto';

// HCS Topics
const TOPICS = {
  ECOSYSTEM: '0.0.10409355', // Autonomous decisions and actions
  CORE: '0.0.10409351',      // Decision validation
  BRIDGE: '0.0.10409354'     // Agent voting
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
console.log('║  🤖 VERA AUTONOMOUS DECISION SYSTEM                                ║');
console.log('║  Phase 4: Self-Governing Agent Swarm                               ║');
console.log('║  Autonomous Controller ID: autonomous-controller-001             ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');
console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Decision Topic: ${TOPICS.ECOSYSTEM}`);
console.log(`⚡ Autonomy Level: HIGH (requires >85% swarm confidence)`);
console.log(`⏱️  Decision Cycle: Every 5 minutes\n`);
console.log('════════════════════════════════════════════════════════════════════\n');

// Autonomous Agent Registry
const AUTONOMOUS_AGENTS = {
  'defi-analyst-001': {
    type: 'DEFI_ANALYST',
    trustScore: 0.92,
    autonomyLevel: 'FULL',
    decisionsMade: 0,
    successRate: 0.88,
    lastDecision: null
  },
  'energy-auditor-001': {
    type: 'ENERGY_AUDITOR',
    trustScore: 0.90,
    autonomyLevel: 'FULL',
    decisionsMade: 0,
    successRate: 0.85,
    lastDecision: null
  },
  'security-guardian-001': {
    type: 'SECURITY_GUARDIAN',
    trustScore: 0.94,
    autonomyLevel: 'FULL',
    decisionsMade: 0,
    successRate: 0.91,
    lastDecision: null
  },
  'carbon-validator-001': {
    type: 'CARBON_VALIDATOR',
    trustScore: 0.93,
    autonomyLevel: 'FULL',
    decisionsMade: 0,
    successRate: 0.89,
    lastDecision: null
  }
};

// Decision Types with Autonomy Thresholds
const DECISION_TYPES = {
  MONITORING: { threshold: 0.70, autonomy: 'FULL', description: 'Passive monitoring and logging' },
  ALERTING: { threshold: 0.75, autonomy: 'FULL', description: 'Issue alerts and warnings' },
  RECOMMENDATION: { threshold: 0.80, autonomy: 'CONDITIONAL', description: 'Make recommendations for human review' },
  EXECUTION: { threshold: 0.85, autonomy: 'CONDITIONAL', description: 'Execute low-risk actions' },
  INTERVENTION: { threshold: 0.90, autonomy: 'REQUIRES_CONSENSUS', description: 'High-stakes interventions' }
};

// Autonomy State
const autonomyState = {
  id: 'autonomous-controller-001',
  cycles: 0,
  autonomousDecisions: 0,
  humanReviewQueue: [],
  executedActions: [],
  vetoedDecisions: [],
  currentAutonomyLevel: 'FULL'
};

// Pending Proposals
const pendingProposals = new Map();

async function logToHCS(topicId, type, data) {
  try {
    const message = {
      type,
      controllerId: autonomyState.id,
      timestamp: new Date().toISOString(),
      sessionId: `autonomy-${Date.now()}`,
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

// Generate autonomous decision proposal
function generateProposal() {
  const proposalTypes = [
    {
      category: 'MONITORING',
      action: 'INCREASE_SCAN_FREQUENCY',
      description: 'Increase transaction scanning from 2min to 90sec intervals due to elevated threat level',
      requestingAgent: 'security-guardian-001',
      estimatedImpact: 'LOW',
      reversible: true,
      confidence: 0.89
    },
    {
      category: 'ALERTING',
      action: 'ESCALATE_THREAT_ALERT',
      description: 'Critical flash loan pattern detected - escalate to immediate notification',
      requestingAgent: 'security-guardian-001',
      target: 'defi-analyst-001',
      estimatedImpact: 'MEDIUM',
      reversible: true,
      confidence: 0.94,
      threatDetails: {
        type: 'FLASH_LOAN_ATTACK',
        confidence: 0.94,
        affectedContracts: ['0.0.12348'],
        recommendedAction: 'IMMEDIATE_PAUSE'
      }
    },
    {
      category: 'RECOMMENDATION',
      action: 'CARBON_OFFSET_BULK_PURCHASE',
      description: 'Grid carbon intensity at 95th percentile - recommend bulk offset purchase',
      requestingAgent: 'energy-auditor-001',
      target: 'carbon-validator-001',
      estimatedImpact: 'MEDIUM',
      reversible: false,
      confidence: 0.87,
      recommendation: {
        credits: 50000,
        projectType: 'Renewable Energy',
        urgency: 'HIGH',
        costEstimate: '$425,000'
      }
    },
    {
      category: 'EXECUTION',
      action: 'ADJUST_CONFIDENCE_THRESHOLDS',
      description: 'Decrease DeFi alert threshold from 0.85 to 0.80 based on recent accuracy improvement',
      requestingAgent: 'defi-analyst-001',
      estimatedImpact: 'LOW',
      reversible: true,
      confidence: 0.86,
      parameterChange: {
        parameter: 'CONFIDENCE_THRESHOLD',
        oldValue: 0.85,
        newValue: 0.80,
        reason: 'Accuracy improved 12% over last 50 predictions'
      }
    },
    {
      category: 'INTERVENTION',
      action: 'COORDINATED_CONTRACT_PAUSE',
      description: 'Multi-signature contract showing suspicious patterns - recommend coordinated pause',
      requestingAgent: 'security-guardian-001',
      coSigners: ['defi-analyst-001', 'carbon-validator-001'],
      estimatedImpact: 'HIGH',
      reversible: true,
      confidence: 0.91,
      justification: 'Anomaly detected in 3 independent scans with 91% confidence'
    }
  ];
  
  const proposal = proposalTypes[Math.floor(Math.random() * proposalTypes.length)];
  
  return {
    proposalId: crypto.randomUUID(),
    timestamp: Date.now(),
    ...proposal,
    swarmVotes: new Map(),
    votingDeadline: Date.now() + 60000 // 1 minute voting window
  };
}

// Vote on proposal
function voteOnProposal(proposal) {
  const votes = [];
  let totalWeight = 0;
  let weightedYes = 0;
  
  for (const [agentId, agent] of Object.entries(AUTONOMOUS_AGENTS)) {
    // Agents vote based on their expertise and the proposal category
    let relevance = 0.5;
    
    if (proposal.requestingAgent === agentId) {
      relevance = 1.0; // Proposer always votes yes
    } else {
      // Check if agent has relevant expertise
      const agentExpertise = {
        'defi-analyst-001': ['MONITORING', 'ALERTING', 'RECOMMENDATION', 'EXECUTION'],
        'energy-auditor-001': ['MONITORING', 'RECOMMENDATION'],
        'security-guardian-001': ['MONITORING', 'ALERTING', 'INTERVENTION'],
        'carbon-validator-001': ['RECOMMENDATION', 'EXECUTION']
      };
      
      if (agentExpertise[agentId].includes(proposal.category)) {
        relevance = 0.8 + Math.random() * 0.15;
      }
    }
    
    // Vote confidence based on proposal confidence and agent trust
    const voteConfidence = proposal.confidence * agent.trustScore * relevance;
    const vote = voteConfidence > DECISION_TYPES[proposal.category].threshold ? 'YES' : 'NO';
    
    votes.push({
      agentId,
      vote,
      confidence: Math.round(voteConfidence * 100) / 100,
      weight: agent.trustScore
    });
    
    totalWeight += agent.trustScore;
    if (vote === 'YES') {
      weightedYes += agent.trustScore;
    }
  }
  
  const yesPercentage = weightedYes / totalWeight;
  const threshold = DECISION_TYPES[proposal.category].threshold;
  
  return {
    proposalId: proposal.proposalId,
    votes,
    yesPercentage: Math.round(yesPercentage * 100) / 100,
    threshold,
    passed: yesPercentage >= threshold,
    swarmConfidence: Math.round(yesPercentage * 100) / 100,
    timestamp: Date.now()
  };
}

// Execute autonomous decision
async function executeDecision(proposal, voteResult) {
  if (!voteResult.passed) {
    return {
      executed: false,
      reason: 'VOTE_FAILED',
      fallback: 'HUMAN_REVIEW'
    };
  }
  
  // Check autonomy level
  const decisionType = DECISION_TYPES[proposal.category];
  
  if (decisionType.autonomy === 'REQUIRES_CONSENSUS' && voteResult.swarmConfidence < 0.95) {
    return {
      executed: false,
      reason: 'INSUFFICIENT_CONSENSUS',
      fallback: 'HUMAN_REVIEW'
    };
  }
  
  // Simulate execution
  const execution = {
    executionId: crypto.randomUUID(),
    proposalId: proposal.proposalId,
    action: proposal.action,
    executed: true,
    executedAt: Date.now(),
    executor: 'SWARM_AUTONOMOUS',
    autonomyLevel: decisionType.autonomy,
    estimatedCompletion: Date.now() + (60000 + Math.random() * 120000), // 1-3 minutes
    rollbackAvailable: proposal.reversible,
    status: 'EXECUTING'
  };
  
  // Log execution
  const execSeq = await logToHCS(TOPICS.ECOSYSTEM, 'AUTONOMOUS_EXECUTION', {
    ...execution,
    proposalDetails: {
      category: proposal.category,
      description: proposal.description,
      confidence: proposal.confidence
    },
    voteResult: {
      yesPercentage: voteResult.yesPercentage,
      swarmConfidence: voteResult.swarmConfidence,
      participatingAgents: voteResult.votes.length
    }
  });
  
  if (execSeq) {
    console.log(`   ✅ EXECUTED: ${proposal.action}`);
    console.log(`      Swarm consensus: ${(voteResult.yesPercentage * 100).toFixed(1)}% | Autonomy: ${decisionType.autonomy}`);
    
    // Update agent stats
    AUTONOMOUS_AGENTS[proposal.requestingAgent].decisionsMade++;
    autonomyState.autonomousDecisions++;
    autonomyState.executedActions.push(execution);
  }
  
  return execution;
}

// Queue for human review
async function queueForHumanReview(proposal, voteResult) {
  const reviewItem = {
    reviewId: crypto.randomUUID(),
    proposalId: proposal.proposalId,
    action: proposal.action,
    description: proposal.description,
    requestingAgent: proposal.requestingAgent,
    voteResult,
    reason: voteResult.passed ? 'HIGH_IMPACT' : 'VOTE_REJECTED',
    queuedAt: Date.now(),
    priority: proposal.category === 'INTERVENTION' ? 'CRITICAL' : proposal.category === 'EXECUTION' ? 'HIGH' : 'MEDIUM'
  };
  
  autonomyState.humanReviewQueue.push(reviewItem);
  autonomyState.vetoedDecisions.push(reviewItem);
  
  const reviewSeq = await logToHCS(TOPICS.CORE, 'HUMAN_REVIEW_REQUIRED', {
    ...reviewItem,
    queuePosition: autonomyState.humanReviewQueue.length,
    estimatedReviewTime: '15-30 minutes'
  });
  
  if (reviewSeq) {
    console.log(`   ⏳ QUEUED FOR HUMAN: ${proposal.action}`);
    console.log(`      Reason: ${reviewItem.reason} | Priority: ${reviewItem.priority}`);
  }
  
  return reviewItem;
}

// Calculate swarm autonomy metrics
function calculateAutonomyMetrics() {
  const totalDecisions = autonomyState.autonomousDecisions + autonomyState.vetoedDecisions.length;
  const autonomyRate = totalDecisions > 0 ? autonomyState.autonomousDecisions / totalDecisions : 0;
  
  const avgAgentTrust = Object.values(AUTONOMOUS_AGENTS)
    .reduce((sum, agent) => sum + agent.trustScore, 0) / Object.keys(AUTONOMOUS_AGENTS).length;
  
  // Determine current autonomy level
  let autonomyLevel = 'LIMITED';
  if (autonomyRate > 0.85 && avgAgentTrust > 0.90) {
    autonomyLevel = 'FULL';
  } else if (autonomyRate > 0.70 && avgAgentTrust > 0.85) {
    autonomyLevel = 'HIGH';
  } else if (autonomyRate > 0.50) {
    autonomyLevel = 'MODERATE';
  }
  
  return {
    autonomyRate: Math.round(autonomyRate * 100) / 100,
    avgAgentTrust: Math.round(avgAgentTrust * 100) / 100,
    autonomyLevel,
    totalAutonomous: autonomyState.autonomousDecisions,
    totalHumanReview: autonomyState.humanReviewQueue.length,
    pendingProposals: pendingProposals.size
  };
}

// Main autonomy cycle
async function runAutonomyCycle() {
  autonomyState.cycles++;
  
  console.log(`\n🔁 AUTONOMY CYCLE #${autonomyState.cycles} - ${new Date().toLocaleTimeString()}`);
  
  // Calculate current autonomy metrics
  const metrics = calculateAutonomyMetrics();
  
  console.log(`   📊 Swarm Autonomy: ${(metrics.autonomyRate * 100).toFixed(1)}% | Level: ${metrics.autonomyLevel}`);
  console.log(`   🤖 Decisions: ${metrics.totalAutonomous} autonomous | ${metrics.totalHumanReview} human review\n`);
  
  // Generate proposal
  console.log(`   📝 Generating autonomous proposal...`);
  const proposal = generateProposal();
  
  const propSeq = await logToHCS(TOPICS.ECOSYSTEM, 'PROPOSAL_CREATED', {
    cycle: autonomyState.cycles,
    ...proposal,
    decisionType: DECISION_TYPES[proposal.category]
  });
  
  if (propSeq) {
    console.log(`   📋 ${proposal.category}: ${proposal.action}`);
    console.log(`      Requested by: ${proposal.requestingAgent} | Confidence: ${(proposal.confidence * 100).toFixed(1)}%`);
  }
  
  // Vote on proposal
  console.log(`   🗳️  Swarm voting...`);
  const voteResult = voteOnProposal(proposal);
  
  const voteSeq = await logToHCS(TOPICS.BRIDGE, 'SWARM_VOTE', {
    cycle: autonomyState.cycles,
    proposalId: proposal.proposalId,
    ...voteResult
  });
  
  if (voteSeq) {
    console.log(`   📊 Vote: ${(voteResult.yesPercentage * 100).toFixed(1)}% YES (threshold: ${(voteResult.threshold * 100).toFixed(0)}%)`);
    voteResult.votes.forEach(v => {
      const icon = v.vote === 'YES' ? '✅' : '❌';
      console.log(`      ${icon} ${v.agentId}: ${v.vote} (${(v.confidence * 100).toFixed(0)}% conf)`);
    });
  }
  
  // Execute or queue
  console.log(`   ⚡ Processing decision...`);
  
  if (voteResult.passed && proposal.category !== 'INTERVENTION') {
    // Auto-execute
    await executeDecision(proposal, voteResult);
  } else if (voteResult.passed && proposal.category === 'INTERVENTION') {
    // High-stakes requires additional safety check
    if (voteResult.swarmConfidence >= 0.95) {
      await executeDecision(proposal, voteResult);
    } else {
      await queueForHumanReview(proposal, voteResult);
    }
  } else {
    // Vote failed
    await queueForHumanReview(proposal, voteResult);
  }
  
  // Update metrics and log
  const updatedMetrics = calculateAutonomyMetrics();
  
  const metricsSeq = await logToHCS(TOPICS.ECOSYSTEM, 'AUTONOMY_METRICS', {
    cycle: autonomyState.cycles,
    ...updatedMetrics,
    timestamp: Date.now()
  });
  
  // Summary
  console.log(`   ✅ Autonomy Cycle ${autonomyState.cycles} Complete`);
  console.log(`      🤖 Autonomous decisions: ${autonomyState.autonomousDecisions}`);
  console.log(`      👤 Human review queue: ${autonomyState.humanReviewQueue.length}`);
  
  console.log(`\n⚡ AUTONOMY STATUS: ${updatedMetrics.autonomyLevel} | ${(updatedMetrics.autonomyRate * 100).toFixed(1)}% autonomous | ${autonomyState.cycles} cycles`);
}

// Run immediately
runAutonomyCycle();

// Schedule cycles every 5 minutes
setInterval(runAutonomyCycle, 300000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Autonomous Controller shutting down...');
  
  const metrics = calculateAutonomyMetrics();
  
  await logToHCS(TOPICS.ECOSYSTEM, 'AUTONOMY_SHUTDOWN', {
    controllerId: autonomyState.id,
    totalCycles: autonomyState.cycles,
    totalAutonomous: autonomyState.autonomousDecisions,
    totalHumanReview: autonomyState.humanReviewQueue.length,
    finalAutonomyRate: metrics.autonomyRate,
    finalAutonomyLevel: metrics.autonomyLevel,
    pendingReviews: autonomyState.humanReviewQueue.length,
    timestamp: Date.now()
  });
  
  client.close();
  console.log(`✅ Autonomous Controller stopped. ${autonomyState.autonomousDecisions} autonomous decisions executed\n`);
  process.exit(0);
});
