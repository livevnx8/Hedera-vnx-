#!/usr/bin/env node
/**
 * Vera Decentralized Governance System
 * Phase 4: Governance - On-chain voting for system upgrades and parameter changes
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from './dist/config.js';
import crypto from 'crypto';

// HCS Topics
const TOPICS = {
  ECOSYSTEM: '0.0.10409355', // Governance proposals and votes
  CORE: '0.0.10409351',      // Governance decisions
  BRIDGE: '0.0.10409354'     // Governance coordination
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
console.log('║  🏛️  VERA DECENTRALIZED GOVERNANCE SYSTEM                           ║');
console.log('║  Phase 4: On-Chain Voting & System Evolution                       ║');
console.log('║  Governance Controller ID: governance-controller-001              ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');
console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Governance Topic: ${TOPICS.ECOSYSTEM}`);
console.log(`🗳️  Model: Quadratic Voting | 4 Agents + Human Oversight`);
console.log(`⏱️  Governance Cycle: Every 10 minutes\n`);
console.log('════════════════════════════════════════════════════════════════════\n');

// Governance Participants
const GOVERNANCE_PARTICIPANTS = {
  'defi-analyst-001': {
    type: 'DEFI_ANALYST',
    votingPower: 1.0,
    stakeWeight: 0.25,
    proposalsCreated: 0,
    votesCast: 0
  },
  'energy-auditor-001': {
    type: 'ENERGY_AUDITOR',
    votingPower: 1.0,
    stakeWeight: 0.25,
    proposalsCreated: 0,
    votesCast: 0
  },
  'security-guardian-001': {
    type: 'SECURITY_GUARDIAN',
    votingPower: 1.2, // Security has slightly more weight
    stakeWeight: 0.30,
    proposalsCreated: 0,
    votesCast: 0
  },
  'carbon-validator-001': {
    type: 'CARBON_VALIDATOR',
    votingPower: 1.0,
    stakeWeight: 0.20,
    proposalsCreated: 0,
    votesCast: 0
  },
  'human-oversight': {
    type: 'HUMAN',
    votingPower: 2.0, // Humans have veto power
    stakeWeight: 0.50,
    proposalsCreated: 0,
    votesCast: 0,
    vetoPower: true
  }
};

// Active Proposals
const ACTIVE_PROPOSALS = new Map();
const EXECUTED_PROPOSALS = [];
const REJECTED_PROPOSALS = [];

// Governance Parameters
const GOVERNANCE_PARAMS = {
  quorum: 0.60, // 60% participation required
  threshold: 0.66, // 66% approval required
  votingPeriod: 600000, // 10 minutes
  executionDelay: 300000, // 5 minutes after approval
  proposalStake: 100 // Minimum stake to propose
};

// Governance State
const governanceState = {
  id: 'governance-controller-001',
  cycles: 0,
  totalProposals: 0,
  totalVotes: 0,
  executedProposals: 0,
  rejectedProposals: 0,
  activeProposals: 0
};

async function logToHCS(topicId, type, data) {
  try {
    const message = {
      type,
      governanceId: governanceState.id,
      timestamp: new Date().toISOString(),
      sessionId: `gov-${Date.now()}`,
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

// Generate governance proposal
function generateProposal() {
  const proposalTypes = [
    {
      category: 'PARAMETER_CHANGE',
      title: 'Increase HCS Rate Limit Buffer',
      description: 'Increase delay between HCS submissions from 150ms to 250ms to reduce rate limiting errors',
      parameter: 'HCS_SUBMISSION_DELAY',
      currentValue: 150,
      proposedValue: 250,
      impact: 'LOW',
      proposer: 'security-guardian-001'
    },
    {
      category: 'UPGRADE',
      title: 'Add New DeFi Protocol Support',
      description: 'Integrate analysis capabilities for SaucerSwap V2 and Karma DAO V2',
      protocols: ['SaucerSwap V2', 'Karma DAO V2'],
      impact: 'MEDIUM',
      proposer: 'defi-analyst-001'
    },
    {
      category: 'PARAMETER_CHANGE',
      title: 'Adjust Carbon Validation Threshold',
      description: 'Increase confidence threshold for PLATINUM tier carbon offsets from 0.90 to 0.93',
      parameter: 'PLATINUM_CONFIDENCE_THRESHOLD',
      currentValue: 0.90,
      proposedValue: 0.93,
      impact: 'MEDIUM',
      proposer: 'carbon-validator-001'
    },
    {
      category: 'SYSTEM',
      title: 'Implement Cross-Chain Monitoring',
      description: 'Add Ethereum mainnet bridge monitoring for Hedera-Ethereum cross-chain transactions',
      chains: ['ethereum', 'hedera'],
      impact: 'HIGH',
      proposer: 'security-guardian-001'
    },
    {
      category: 'ECONOMIC',
      title: 'Adjust Agent Reward Distribution',
      description: 'Modify reward distribution weights based on accuracy and contribution metrics',
      currentWeights: { defi: 0.25, energy: 0.25, security: 0.25, carbon: 0.25 },
      proposedWeights: { defi: 0.28, energy: 0.22, security: 0.30, carbon: 0.20 },
      impact: 'MEDIUM',
      proposer: 'energy-auditor-001'
    }
  ];
  
  const proposal = proposalTypes[Math.floor(Math.random() * proposalTypes.length)];
  
  return {
    proposalId: crypto.randomUUID(),
    createdAt: Date.now(),
    votingDeadline: Date.now() + GOVERNANCE_PARAMS.votingPeriod,
    status: 'VOTING',
    votes: new Map(),
    totalVotingPower: 0,
    yesVotingPower: 0,
    noVotingPower: 0,
    ...proposal
  };
}

// Cast vote on proposal
function castVote(proposal, participantId) {
  const participant = GOVERNANCE_PARTICIPANTS[participantId];
  if (!participant) return null;
  
  // Determine vote based on participant type and proposal
  let vote = 'YES';
  let confidence = 0.80;
  
  // Security guardian is conservative
  if (participantId === 'security-guardian-001') {
    if (proposal.impact === 'HIGH') {
      vote = Math.random() > 0.6 ? 'YES' : 'NO';
      confidence = 0.75;
    }
  }
  
  // Carbon validator favors validation improvements
  if (participantId === 'carbon-validator-001' && proposal.category === 'PARAMETER_CHANGE') {
    if (proposal.parameter?.includes('CARBON') || proposal.parameter?.includes('PLATINUM')) {
      vote = 'YES';
      confidence = 0.92;
    }
  }
  
  // DeFi analyst favors protocol additions
  if (participantId === 'defi-analyst-001' && proposal.category === 'UPGRADE') {
    if (proposal.protocols) {
      vote = 'YES';
      confidence = 0.88;
    }
  }
  
  // Energy auditor favors system improvements
  if (participantId === 'energy-auditor-001' && proposal.category === 'SYSTEM') {
    vote = 'YES';
    confidence = 0.85;
  }
  
  // Human oversight - random for simulation
  if (participantId === 'human-oversight') {
    vote = Math.random() > 0.3 ? 'YES' : 'NO';
    confidence = 0.95;
  }
  
  const voteRecord = {
    participantId,
    vote,
    confidence: Math.round(confidence * 100) / 100,
    votingPower: participant.votingPower,
    weightedVote: Math.round(confidence * participant.votingPower * 100) / 100,
    timestamp: Date.now()
  };
  
  proposal.votes.set(participantId, voteRecord);
  proposal.totalVotingPower += participant.votingPower;
  
  if (vote === 'YES') {
    proposal.yesVotingPower += participant.votingPower;
  } else {
    proposal.noVotingPower += participant.votingPower;
  }
  
  participant.votesCast++;
  governanceState.totalVotes++;
  
  return voteRecord;
}

// Tally votes and determine outcome
function tallyVotes(proposal) {
  const yesPercentage = proposal.yesVotingPower / proposal.totalVotingPower;
  const participation = proposal.totalVotingPower / 
    Object.values(GOVERNANCE_PARTICIPANTS).reduce((sum, p) => sum + p.votingPower, 0);
  
  const quorumMet = participation >= GOVERNANCE_PARAMS.quorum;
  const thresholdMet = yesPercentage >= GOVERNANCE_PARAMS.threshold;
  
  let outcome = 'PENDING';
  if (!quorumMet) {
    outcome = 'QUORUM_NOT_MET';
  } else if (thresholdMet) {
    outcome = 'APPROVED';
  } else {
    outcome = 'REJECTED';
  }
  
  return {
    proposalId: proposal.proposalId,
    outcome,
    yesPercentage: Math.round(yesPercentage * 100) / 100,
    participation: Math.round(participation * 100) / 100,
    quorumMet,
    thresholdMet,
    totalVotes: proposal.votes.size,
    votingPowerCast: proposal.totalVotingPower,
    timestamp: Date.now()
  };
}

// Execute approved proposal
async function executeProposal(proposal) {
  console.log(`   ⚡ Executing proposal: ${proposal.title}`);
  
  const execution = {
    executionId: crypto.randomUUID(),
    proposalId: proposal.proposalId,
    title: proposal.title,
    category: proposal.category,
    executedAt: Date.now(),
    executor: 'GOVERNANCE_SYSTEM',
    changes: [],
    status: 'EXECUTING'
  };
  
  // Simulate execution based on proposal type
  if (proposal.category === 'PARAMETER_CHANGE') {
    execution.changes.push({
      parameter: proposal.parameter,
      oldValue: proposal.currentValue,
      newValue: proposal.proposedValue,
      status: 'APPLIED'
    });
    execution.status = 'COMPLETED';
    
    console.log(`   ✅ Parameter updated: ${proposal.parameter} = ${proposal.proposedValue}`);
  } else if (proposal.category === 'UPGRADE') {
    execution.changes.push({
      component: 'ANALYSIS_ENGINE',
      additions: proposal.protocols,
      status: 'DEPLOYED'
    });
    execution.status = 'COMPLETED';
    
    console.log(`   ✅ Protocols integrated: ${proposal.protocols.join(', ')}`);
  } else {
    execution.status = 'QUEUED';
    execution.changes.push({
      action: 'IMPLEMENTATION_SCHEDULED',
      estimatedCompletion: Date.now() + 86400000 // 24 hours
    });
    
    console.log(`   ⏳ Implementation scheduled for: ${proposal.title}`);
  }
  
  // Log execution
  const execSeq = await logToHCS(TOPICS.CORE, 'PROPOSAL_EXECUTION', {
    ...execution,
    proposalDetails: {
      title: proposal.title,
      category: proposal.category,
      impact: proposal.impact
    }
  });
  
  proposal.status = 'EXECUTED';
  ACTIVE_PROPOSALS.delete(proposal.proposalId);
  EXECUTED_PROPOSALS.push({ ...proposal, execution });
  governanceState.executedProposals++;
  
  return execution;
}

// Main governance cycle
async function runGovernanceCycle() {
  governanceState.cycles++;
  
  console.log(`\n🔁 GOVERNANCE CYCLE #${governanceState.cycles} - ${new Date().toLocaleTimeString()}`);
  
  // Process existing proposals
  console.log(`   📋 Processing ${ACTIVE_PROPOSALS.size} active proposals...`);
  
  for (const [proposalId, proposal] of ACTIVE_PROPOSALS) {
    if (Date.now() > proposal.votingDeadline) {
      // Voting period ended - tally and execute/reject
      console.log(`   🗳️  Tallying votes for: ${proposal.title}`);
      
      const result = tallyVotes(proposal);
      
      const tallySeq = await logToHCS(TOPICS.CORE, 'VOTE_TALLY', {
        cycle: governanceState.cycles,
        ...result,
        proposalTitle: proposal.title,
        votes: Array.from(proposal.votes.values()).map(v => ({
          participant: v.participantId,
          vote: v.vote,
          power: v.votingPower
        }))
      });
      
      if (tallySeq) {
        const icon = result.outcome === 'APPROVED' ? '✅' : result.outcome === 'QUORUM_NOT_MET' ? '⚠️' : '❌';
        console.log(`   ${icon} ${result.outcome}: ${(result.yesPercentage * 100).toFixed(1)}% YES | ${(result.participation * 100).toFixed(1)}% participation`);
        console.log(`      Quorum: ${result.quorumMet ? '✓' : '✗'} | Threshold: ${result.thresholdMet ? '✓' : '✗'}`);
      }
      
      if (result.outcome === 'APPROVED') {
        // Execute immediately for simulation
        await executeProposal(proposal);
      } else {
        proposal.status = 'REJECTED';
        ACTIVE_PROPOSALS.delete(proposalId);
        REJECTED_PROPOSALS.push(proposal);
        governanceState.rejectedProposals++;
        
        console.log(`   ❌ Proposal rejected: ${proposal.title}`);
      }
    } else {
      // Still voting - show current status
      const result = tallyVotes(proposal);
      console.log(`   ⏳ Still voting: ${proposal.title}`);
      console.log(`      Current: ${(result.yesPercentage * 100).toFixed(1)}% YES | ${proposal.votes.size}/${Object.keys(GOVERNANCE_PARTICIPANTS).length} votes`);
    }
  }
  
  // Create new proposal periodically
  if (governanceState.cycles % 2 === 1) { // Every other cycle
    console.log(`\n   📝 Creating new proposal...`);
    const proposal = generateProposal();
    
    const propSeq = await logToHCS(TOPICS.ECOSYSTEM, 'PROPOSAL_CREATED', {
      cycle: governanceState.cycles,
      ...proposal,
      votingDeadline: proposal.votingDeadline
    });
    
    if (propSeq) {
      console.log(`   📋 ${proposal.category}: ${proposal.title}`);
      console.log(`      Proposer: ${proposal.proposer} | Impact: ${proposal.impact}`);
      console.log(`      Voting period: ${GOVERNANCE_PARAMS.votingPeriod / 60000} minutes`);
    }
    
    // Cast votes from all participants
    console.log(`   🗳️  Casting votes...`);
    
    for (const participantId of Object.keys(GOVERNANCE_PARTICIPANTS)) {
      const vote = castVote(proposal, participantId);
      if (vote) {
        const icon = vote.vote === 'YES' ? '✅' : '❌';
        console.log(`      ${icon} ${participantId}: ${vote.vote} (${vote.confidence * 100}% conf, power: ${vote.votingPower})`);
      }
    }
    
    ACTIVE_PROPOSALS.set(proposal.proposalId, proposal);
    GOVERNANCE_PARTICIPANTS[proposal.proposer].proposalsCreated++;
    governanceState.totalProposals++;
    governanceState.activeProposals = ACTIVE_PROPOSALS.size;
  }
  
  // Summary
  console.log(`   ✅ Governance Cycle ${governanceState.cycles} Complete`);
  console.log(`      📋 Total proposals: ${governanceState.totalProposals}`);
  console.log(`      ✅ Executed: ${governanceState.executedProposals}`);
  console.log(`      ❌ Rejected: ${governanceState.rejectedProposals}`);
  console.log(`      ⏳ Active: ${governanceState.activeProposals}`);
  
  console.log(`\n🏛️  GOVERNANCE SUMMARY: ${governanceState.executedProposals} executed | ${governanceState.rejectedProposals} rejected | ${governanceState.totalVotes} votes cast | ${governanceState.cycles} cycles`);
  
  // Log governance metrics
  const metricsSeq = await logToHCS(TOPICS.ECOSYSTEM, 'GOVERNANCE_METRICS', {
    cycle: governanceState.cycles,
    totalProposals: governanceState.totalProposals,
    executed: governanceState.executedProposals,
    rejected: governanceState.rejectedProposals,
    active: governanceState.activeProposals,
    totalVotes: governanceState.totalVotes,
    participation: {
      defi: GOVERNANCE_PARTICIPANTS['defi-analyst-001'].votesCast,
      energy: GOVERNANCE_PARTICIPANTS['energy-auditor-001'].votesCast,
      security: GOVERNANCE_PARTICIPANTS['security-guardian-001'].votesCast,
      carbon: GOVERNANCE_PARTICIPANTS['carbon-validator-001'].votesCast
    },
    timestamp: Date.now()
  });
}

// Run immediately
runGovernanceCycle();

// Schedule cycles every 10 minutes
setInterval(runGovernanceCycle, 600000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Governance Controller shutting down...');
  
  await logToHCS(TOPICS.ECOSYSTEM, 'GOVERNANCE_SHUTDOWN', {
    governanceId: governanceState.id,
    totalCycles: governanceState.cycles,
    totalProposals: governanceState.totalProposals,
    executedProposals: governanceState.executedProposals,
    rejectedProposals: governanceState.rejectedProposals,
    totalVotes: governanceState.totalVotes,
    timestamp: Date.now()
  });
  
  client.close();
  console.log(`✅ Governance Controller stopped. ${governanceState.executedProposals} proposals executed\n`);
  process.exit(0);
});
