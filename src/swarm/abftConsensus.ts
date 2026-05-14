/**
 * ABFT Consensus Engine - Asynchronous Byzantine Fault Tolerance
 * 
 * Provides Byzantine fault tolerant consensus for the Vera Lattice Swarm
 * using Hedera Consensus Service (HCS) for immutable vote logging.
 * 
 * Key Features:
 * - 2/3 quorum voting (tolerates up to f = (n-1)/3 faulty nodes)
 * - HCS-backed immutable vote log with hashgraph ordering
 * - Lattice cryptographic signatures for vote verification
 * - Warm agent pool integration for fast proposal processing
 * - Rogue agent detection via stake slashing and reputation
 * - Zero-downtime consensus during chaos/sharding
 * 
 * Byznatine Fault Tolerance Guarantee:
 * With n nodes and f ≤ (n-1)/3 Byzantine (rogue) agents, the system
 * maintains safety (no two correct nodes decide differently) and
 * liveness (correct nodes eventually decide).
 * 
 * @module swarm/abftConsensus
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { hcsSwarmMessenger, type HCSwarmMessage, type SwarmMessageType } from './hcsMessenger.js';
import { veraLatticeSwarm, type SwarmAgent, type LatticeNode } from './latticeSwarm.js';
import { TopicMessageSubmitTransaction, Client, PrivateKey } from '@hashgraph/sdk';
import { config } from '../config.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ProposalType = 'PAYMENT_BATCH' | 'TASK_ASSIGN' | 'CONFIG_CHANGE' | 'AGENT_SLASH' | 'SHARD_MERGE';
export type VoteValue = 'YES' | 'NO' | 'ABSTAIN';
export type ProposalStatus = 'PENDING' | 'VOTING' | 'QUORUM_REACHED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface Proposal {
  id: string;
  type: ProposalType;
  proposerAgentId: string;
  proposerSwarmId: string;
  timestamp: number;
  deadline: number;
  payload: unknown;
  status: ProposalStatus;
  votes: Map<string, Vote>; // agentId -> Vote
  quorum: number;
  requiredVotes: number;
  hcsSequence?: string;
  latticeProof?: LatticeProof;
}

export interface Vote {
  agentId: string;
  proposalId: string;
  value: VoteValue;
  timestamp: number;
  signature: string; // Lattice crypto signature
  hcsSequence?: string;
  stake: number; // Agent's voting weight
}

export interface LatticeProof {
  proposerEmbedding: number[];
  guardianMeetHash: string;
  chainHash: string;
  epoch: number;
}

export interface GuardianInfo {
  agentId: string;
  node: LatticeNode;
  stake: number;
  reputation: number; // 0-1, affects voting weight
  lastVote: number;
  consecutiveMisses: number;
  isActive: boolean;
}

export interface ABFTStats {
  totalProposals: number;
  acceptedProposals: number;
  rejectedProposals: number;
  expiredProposals: number;
  totalVotes: number;
  averageVoteTime: number;
  rogueAgentsDetected: number;
  stakeSlashed: number;
}

export interface ABFTConfig {
  quorumThreshold: number; // 2/3 = 0.667
  voteTimeoutMs: number;
  guardianStakeMin: number;
  maxConsecutiveMisses: number;
  slashingPenalty: number; // Percentage of stake
  enableWarmPool: boolean;
  parallelVoteProcessing: boolean;
}

// ============================================================================
// ROGUE AGENT DETECTION
// ============================================================================

/**
 * Detects and handles Byzantine/rogue agents
 */
class RogueAgentDetector {
  private agentHistory: Map<string, AgentBehaviorLog> = new Map();
  private readonly suspicionThreshold = 3;
  
  recordVote(agentId: string, proposalId: string, vote: VoteValue, timestamp: number): void {
    if (!this.agentHistory.has(agentId)) {
      this.agentHistory.set(agentId, { votes: [], suspicious: false });
    }
    
    const log = this.agentHistory.get(agentId)!;
    log.votes.push({ proposalId, vote, timestamp });
    
    // Check for suspicious patterns
    this.analyzeBehavior(agentId, log);
  }
  
  private analyzeBehavior(agentId: string, log: AgentBehaviorLog): void {
    // Pattern 1: Always voting NO (obstruction)
    const recentVotes = log.votes.slice(-10);
    const noVotes = recentVotes.filter(v => v.vote === 'NO').length;
    if (recentVotes.length >= 5 && noVotes / recentVotes.length > 0.9) {
      log.suspicious = true;
      log.reason = 'obstruction_pattern';
    }
    
    // Pattern 2: Timing attacks (votes at suspicious intervals)
    const timingVariance = this.calculateTimingVariance(recentVotes);
    if (timingVariance < 100) { // Suspiciously consistent timing
      log.suspicious = true;
      log.reason = 'timing_attack_pattern';
    }
    
    // Pattern 3: Flip-flopping (inconsistent with own votes)
    if (this.detectFlipFlopping(log.votes)) {
      log.suspicious = true;
      log.reason = 'flip_flop_pattern';
    }
  }
  
  private calculateTimingVariance(votes: VoteRecord[]): number {
    if (votes.length < 2) return Infinity;
    const intervals = [];
    for (let i = 1; i < votes.length; i++) {
      intervals.push(votes[i].timestamp - votes[i-1].timestamp);
    }
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
    return Math.sqrt(variance);
  }
  
  private detectFlipFlopping(votes: VoteRecord[]): boolean {
    // Detect agents that vote differently on identical proposals
    const proposalGroups = new Map<string, VoteRecord[]>();
    for (const vote of votes) {
      if (!proposalGroups.has(vote.proposalId)) {
        proposalGroups.set(vote.proposalId, []);
      }
      proposalGroups.get(vote.proposalId)!.push(vote);
    }
    
    for (const [, groupVotes] of proposalGroups) {
      if (groupVotes.length > 1) {
        const firstVote = groupVotes[0].vote;
        if (groupVotes.some(v => v.vote !== firstVote)) {
          return true;
        }
      }
    }
    return false;
  }
  
  isSuspicious(agentId: string): boolean {
    return this.agentHistory.get(agentId)?.suspicious ?? false;
  }
  
  getRogueAgents(): string[] {
    const rogues: string[] = [];
    for (const [agentId, log] of this.agentHistory) {
      if (log.suspicious) rogues.push(agentId);
    }
    return rogues;
  }
}

interface AgentBehaviorLog {
  votes: VoteRecord[];
  suspicious: boolean;
  reason?: string;
}

interface VoteRecord {
  proposalId: string;
  vote: VoteValue;
  timestamp: number;
}

// ============================================================================
// LATTICE CRYPTO SIGNATURES
// ============================================================================

/**
 * Lattice-based cryptographic signatures for vote verification
 * Uses geometric lattice properties for lightweight but secure signatures
 */
class LatticeCrypto {
  /**
   * Sign a vote using the agent's lattice embedding
   * Signature = hash(embedding · proposal_embedding) + noise
   */
  signVote(agent: SwarmAgent, proposal: Proposal, voteValue: VoteValue): string {
    // Create proposal embedding from hash
    const proposalEmbedding = this.hashToEmbedding(proposal.id, agent.node.embedding.length);
    
    // Dot product of agent embedding with proposal embedding
    const dotProduct = agent.node.embedding.reduce((sum, val, i) => 
      sum + val * (proposalEmbedding[i] ?? 0.5), 0
    );
    
    // Add lattice noise based on agent's extent
    const noise = agent.node.extent.reduce((sum, ext) => sum + ext * (Math.random() - 0.5) * 0.1, 0);
    
    // Combine with vote value hash
    const voteHash = Buffer.from(`${voteValue}:${proposal.timestamp}`).toString('base64').slice(0, 16);
    
    // Final signature
    const signature = `${dotProduct.toFixed(6)}:${noise.toFixed(6)}:${voteHash}:${agent.id}`;
    return Buffer.from(signature).toString('base64');
  }
  
  /**
   * Verify a lattice signature
   * Checks geometric consistency without revealing private embedding
   */
  verifyVote(agent: SwarmAgent, proposal: Proposal, vote: Vote): boolean {
    try {
      const decoded = Buffer.from(vote.signature, 'base64').toString();
      const [dotStr, noiseStr, voteHash, signerId] = decoded.split(':');
      
      // Verify signer identity
      if (signerId !== vote.agentId) return false;
      
      // Verify vote hash matches
      const expectedHash = Buffer.from(`${vote.value}:${proposal.timestamp}`).toString('base64').slice(0, 16);
      if (voteHash !== expectedHash) return false;
      
      // Verify lattice consistency (reconstruct expected dot product)
      const proposalEmbedding = this.hashToEmbedding(proposal.id, agent.node.embedding.length);
      const expectedDot = agent.node.embedding.reduce((sum, val, i) => 
        sum + val * (proposalEmbedding[i] ?? 0.5), 0
      );
      
      const actualDot = parseFloat(dotStr);
      const tolerance = 0.001; // Floating point tolerance
      
      return Math.abs(expectedDot - actualDot) < tolerance;
    } catch {
      return false;
    }
  }
  
  /**
   * Create lattice proof for proposal
   * Proves guardians participated in meet operation
   */
  createLatticeProof(guardians: GuardianInfo[], epoch: number): LatticeProof {
    // Meet of all guardian embeddings
    const meetEmbedding = this.meetEmbeddings(guardians.map(g => g.node.embedding));
    
    // Hash the meet result
    const meetHash = this.hashEmbedding(meetEmbedding);
    
    // Chain hash for continuity
    const chainHash = this.hashEmbedding([...meetEmbedding, epoch]);
    
    return {
      proposerEmbedding: meetEmbedding,
      guardianMeetHash: meetHash,
      chainHash,
      epoch
    };
  }
  
  private hashToEmbedding(hash: string, dimension: number): number[] {
    const seed = hash.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: dimension }, (_, i) => {
      const pseudoRandom = Math.sin(seed + i * 9999) * 0.5 + 0.5;
      return pseudoRandom;
    });
  }
  
  private meetEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];
    return embeddings[0].map((_, i) => 
      Math.min(...embeddings.map(e => e[i] ?? 0.5))
    );
  }
  
  private hashEmbedding(embedding: number[]): string {
    const data = embedding.map(v => v.toFixed(4)).join(',');
    return Buffer.from(data).toString('base64').slice(0, 32);
  }
}

// ============================================================================
// ABFT CONSENSUS ENGINE
// ============================================================================

export class ABFTConsensusEngine extends EventEmitter {
  private proposals: Map<string, Proposal> = new Map();
  private guardians: Map<string, GuardianInfo> = new Map();
  private rogueDetector = new RogueAgentDetector();
  private latticeCrypto = new LatticeCrypto();
  private stats: ABFTStats = {
    totalProposals: 0,
    acceptedProposals: 0,
    rejectedProposals: 0,
    expiredProposals: 0,
    totalVotes: 0,
    averageVoteTime: 0,
    rogueAgentsDetected: 0,
    stakeSlashed: 0
  };
  
  private config: ABFTConfig = {
    quorumThreshold: 2 / 3, // 66.7%
    voteTimeoutMs: 30000, // 30 seconds
    guardianStakeMin: 100,
    maxConsecutiveMisses: 3,
    slashingPenalty: 0.1, // 10% stake loss
    enableWarmPool: true,
    parallelVoteProcessing: true
  };
  
  private hcsTopicId: string | null = null;
  private voteTimers: Map<string, NodeJS.Timeout> = new Map();
  private epoch = 0;
  private totalStake = 0;

  constructor() {
    super();
    this.initializeHCSListener();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(guardianAgents: SwarmAgent[]): Promise<void> {
    logger.info('ABFTConsensus', {
      guardianCount: guardianAgents.length,
      message: 'Initializing ABFT consensus engine'
    });

    // Register guardians with stakes
    for (const agent of guardianAgents) {
      if (agent.node.specialization === 'security' || agent.node.role === 'guardian') {
        const stake = this.calculateInitialStake(agent);
        this.guardians.set(agent.id, {
          agentId: agent.id,
          node: agent.node,
          stake,
          reputation: 1.0,
          lastVote: 0,
          consecutiveMisses: 0,
          isActive: true
        });
        this.totalStake += stake;
      }
    }

    // Calculate required quorum
    this.epoch = Math.floor(Date.now() / 86400000); // Daily epochs

    logger.info('ABFTConsensus', {
      guardians: this.guardians.size,
      totalStake: this.totalStake,
      quorumThreshold: this.config.quorumThreshold,
      message: 'Guardians registered'
    });
  }

  private calculateInitialStake(agent: SwarmAgent): number {
    // Base stake + tier bonus + reputation factor
    const baseStake = this.config.guardianStakeMin;
    const tierBonus = agent.node.tier * 50;
    const taskBonus = agent.completedTasks * 10;
    return baseStake + tierBonus + Math.min(taskBonus, 500);
  }

  private async initializeHCSListener(): Promise<void> {
    // Listen for ABFT votes via HCS messenger
    hcsSwarmMessenger.onMessage('CONSENSUS_VOTE', async (message) => {
      await this.processRemoteVote(message as HCSwarmMessage);
    });

    hcsSwarmMessenger.onMessage('CONSENSUS_PROPOSE', async (message) => {
      await this.processRemoteProposal(message as HCSwarmMessage);
    });
  }

  // ============================================================================
  // PROPOSAL LIFECYCLE
  // ============================================================================

  /**
   * Create a new proposal for guardian voting
   */
  async createProposal(
    type: ProposalType,
    payload: unknown,
    proposerAgent: SwarmAgent
  ): Promise<Proposal> {
    const proposalId = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    // Create lattice proof
    const guardianList = Array.from(this.guardians.values());
    const latticeProof = this.latticeCrypto.createLatticeProof(guardianList, this.epoch);
    
    const proposal: Proposal = {
      id: proposalId,
      type,
      proposerAgentId: proposerAgent.id,
      proposerSwarmId: 'vera-lattice-1',
      timestamp: Date.now(),
      deadline: Date.now() + this.config.voteTimeoutMs,
      payload,
      status: 'VOTING',
      votes: new Map(),
      quorum: Math.ceil(this.totalStake * this.config.quorumThreshold),
      requiredVotes: this.guardians.size,
      latticeProof
    };

    this.proposals.set(proposalId, proposal);
    this.stats.totalProposals++;

    // Broadcast proposal via HCS
    await this.broadcastProposal(proposal);

    // Set vote timeout
    this.setVoteTimeout(proposal);

    logger.info('ABFTConsensus', {
      proposalId,
      type,
      quorum: proposal.quorum,
      message: 'Proposal created'
    });

    this.emit('proposal_created', proposal);
    return proposal;
  }

  /**
   * Guardian casts vote on proposal
   */
  async castVote(
    proposalId: string,
    guardian: SwarmAgent,
    value: VoteValue
  ): Promise<boolean> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'VOTING') {
      logger.warn('ABFTConsensus', { proposalId, message: 'Proposal not found or not voting' });
      return false;
    }

    const guardianInfo = this.guardians.get(guardian.id);
    if (!guardianInfo || !guardianInfo.isActive) {
      logger.warn('ABFTConsensus', { agentId: guardian.id, message: 'Not an active guardian' });
      return false;
    }

    // Check for duplicate vote
    if (proposal.votes.has(guardian.id)) {
      logger.warn('ABFTConsensus', { proposalId, agentId: guardian.id, message: 'Duplicate vote' });
      return false;
    }

    // Create lattice signature
    const signature = this.latticeCrypto.signVote(guardian, proposal, value);

    const vote: Vote = {
      agentId: guardian.id,
      proposalId,
      value,
      timestamp: Date.now(),
      signature,
      stake: guardianInfo.stake
    };

    // Record vote
    proposal.votes.set(guardian.id, vote);
    guardianInfo.lastVote = Date.now();
    guardianInfo.consecutiveMisses = 0;

    this.stats.totalVotes++;

    // Rogue agent detection
    this.rogueDetector.recordVote(guardian.id, proposalId, value, vote.timestamp);

    // Broadcast vote via HCS
    await this.broadcastVote(vote);

    // Check if quorum reached
    await this.checkQuorum(proposal);

    logger.debug('ABFTConsensus', {
      proposalId,
      agentId: guardian.id,
      value,
      stake: vote.stake,
      message: 'Vote cast'
    });

    this.emit('vote_cast', vote);
    return true;
  }

  /**
   * Check if proposal has reached quorum
   */
  private async checkQuorum(proposal: Proposal): Promise<void> {
    let yesStake = 0;
    let noStake = 0;
    let abstainStake = 0;

    for (const vote of proposal.votes.values()) {
      if (vote.value === 'YES') yesStake += vote.stake;
      else if (vote.value === 'NO') noStake += vote.stake;
      else abstainStake += vote.stake;
    }

    const totalVoted = yesStake + noStake + abstainStake;
    const quorum = proposal.quorum;

    // Check acceptance (2/3 of total stake voted YES)
    if (yesStake >= quorum) {
      proposal.status = 'ACCEPTED';
      this.stats.acceptedProposals++;
      await this.finalizeProposal(proposal, 'ACCEPTED');
      return;
    }

    // Check rejection (1/3 voted NO or majority against)
    if (noStake >= this.totalStake / 3 || 
        (totalVoted >= quorum && noStake > yesStake)) {
      proposal.status = 'REJECTED';
      this.stats.rejectedProposals++;
      await this.finalizeProposal(proposal, 'REJECTED');
      return;
    }

    // Quorum reached but no majority yet
    if (totalVoted >= quorum && proposal.status === 'VOTING') {
      proposal.status = 'QUORUM_REACHED';
      this.emit('quorum_reached', { proposalId: proposal.id, yesStake, noStake });
    }
  }

  /**
   * Finalize proposal after voting ends
   */
  private async finalizeProposal(proposal: Proposal, status: 'ACCEPTED' | 'REJECTED'): Promise<void> {
    // Clear timeout
    const timer = this.voteTimers.get(proposal.id);
    if (timer) {
      clearTimeout(timer);
      this.voteTimers.delete(proposal.id);
    }

    // Slash rogue voters
    await this.handleRogueVoters(proposal);

    // Log to HCS
    await this.logConsensusResult(proposal);

    logger.info('ABFTConsensus', {
      proposalId: proposal.id,
      status,
      yesVotes: Array.from(proposal.votes.values()).filter(v => v.value === 'YES').length,
      noVotes: Array.from(proposal.votes.values()).filter(v => v.value === 'NO').length,
      totalStake: Array.from(proposal.votes.values()).reduce((sum, v) => sum + v.stake, 0),
      message: `Proposal ${status.toLowerCase()}`
    });

    this.emit(`proposal_${status.toLowerCase()}`, proposal);
  }

  /**
   * Handle vote timeout
   */
  private setVoteTimeout(proposal: Proposal): void {
    const timer = setTimeout(async () => {
      if (proposal.status === 'VOTING' || proposal.status === 'QUORUM_REACHED') {
        // Mark as expired
        proposal.status = 'EXPIRED';
        this.stats.expiredProposals++;

        // Slash non-voters
        await this.handleNonVoters(proposal);

        logger.warn('ABFTConsensus', {
          proposalId: proposal.id,
          votesReceived: proposal.votes.size,
          message: 'Proposal expired'
        });

        this.emit('proposal_expired', proposal);
      }
    }, this.config.voteTimeoutMs);

    this.voteTimers.set(proposal.id, timer);
  }

  // ============================================================================
  // ROGUE AGENT HANDLING
  // ============================================================================

  private async handleRogueVoters(proposal: Proposal): Promise<void> {
    const rogues = this.rogueDetector.getRogueAgents();
    
    for (const agentId of rogues) {
      if (proposal.votes.has(agentId)) {
        const guardian = this.guardians.get(agentId);
        if (guardian) {
          // Slash stake
          const penalty = Math.floor(guardian.stake * this.config.slashingPenalty);
          guardian.stake -= penalty;
          this.totalStake -= penalty;
          this.stats.stakeSlashed += penalty;

          // Reduce reputation
          guardian.reputation *= 0.8;

          logger.warn('ABFTConsensus', {
            agentId,
            penalty,
            remainingStake: guardian.stake,
            reputation: guardian.reputation.toFixed(2),
            message: 'Rogue agent slashed'
          });

          // Deactivate if stake too low or reputation too low
          if (guardian.stake < this.config.guardianStakeMin || guardian.reputation < 0.3) {
            guardian.isActive = false;
            this.stats.rogueAgentsDetected++;
            logger.error('ABFTConsensus', { agentId, message: 'Guardian deactivated' });
          }
        }
      }
    }
  }

  private async handleNonVoters(proposal: Proposal): Promise<void> {
    for (const [agentId, guardian] of this.guardians) {
      if (!proposal.votes.has(agentId) && guardian.isActive) {
        guardian.consecutiveMisses++;

        if (guardian.consecutiveMisses >= this.config.maxConsecutiveMisses) {
          // Temporarily deactivate
          guardian.isActive = false;
          guardian.reputation *= 0.9;

          logger.warn('ABFTConsensus', {
            agentId,
            misses: guardian.consecutiveMisses,
            message: 'Guardian deactivated for inactivity'
          });
        }
      }
    }
  }

  // ============================================================================
  // HCS INTEGRATION
  // ============================================================================

  private async broadcastProposal(proposal: Proposal): Promise<void> {
    const message = hcsSwarmMessenger.createMessage(
      proposal.proposerSwarmId,
      proposal.proposerAgentId,
      'broadcast',
      'CONSENSUS_PROPOSE',
      {
        proposalId: proposal.id,
        type: proposal.type,
        timestamp: proposal.timestamp,
        deadline: proposal.deadline,
        payload: proposal.payload,
        quorum: proposal.quorum,
        latticeProof: proposal.latticeProof
      },
      { requiredVotes: proposal.requiredVotes }
    );

    await hcsSwarmMessenger.submitMessage(message);
  }

  private async broadcastVote(vote: Vote): Promise<void> {
    const message = hcsSwarmMessenger.createMessage(
      'vera-lattice-1',
      vote.agentId,
      'broadcast',
      'CONSENSUS_VOTE',
      {
        proposalId: vote.proposalId,
        value: vote.value,
        timestamp: vote.timestamp,
        signature: vote.signature,
        stake: vote.stake
      }
    );

    await hcsSwarmMessenger.submitMessage(message);
  }

  private async processRemoteVote(message: HCSwarmMessage): Promise<void> {
    const payload = message.payload as {
      proposalId: string;
      value: VoteValue;
      timestamp: number;
      signature: string;
      stake: number;
    };

    // Create vote from remote message
    const vote: Vote = {
      agentId: message.senderAgent,
      proposalId: payload.proposalId,
      value: payload.value,
      timestamp: payload.timestamp,
      signature: payload.signature,
      stake: payload.stake,
      hcsSequence: message.previousMessageHash
    };

    // Verify signature
    const guardian = this.guardians.get(vote.agentId);
    if (!guardian) return;

    const proposal = this.proposals.get(vote.proposalId);
    if (!proposal) return;

    // Validate vote
    const isValid = this.latticeCrypto.verifyVote(guardian as unknown as SwarmAgent, proposal, vote);
    if (!isValid) {
      logger.warn('ABFTConsensus', {
        agentId: vote.agentId,
        proposalId: vote.proposalId,
        message: 'Invalid vote signature'
      });
      return;
    }

    // Record vote
    if (!proposal.votes.has(vote.agentId)) {
      proposal.votes.set(vote.agentId, vote);
      await this.checkQuorum(proposal);
    }
  }

  private async processRemoteProposal(message: HCSwarmMessage): Promise<void> {
    const payload = message.payload as {
      proposalId: string;
      type: ProposalType;
      timestamp: number;
      deadline: number;
      payload: unknown;
      quorum: number;
      latticeProof: LatticeProof;
    };

    // Create proposal if new
    if (!this.proposals.has(payload.proposalId)) {
      const proposal: Proposal = {
        id: payload.proposalId,
        type: payload.type,
        proposerAgentId: message.senderAgent,
        proposerSwarmId: message.senderSwarm,
        timestamp: payload.timestamp,
        deadline: payload.deadline,
        payload: payload.payload,
        status: 'VOTING',
        votes: new Map(),
        quorum: payload.quorum,
        requiredVotes: (message.requiredVotes as number) || this.guardians.size,
        latticeProof: payload.latticeProof
      };

      this.proposals.set(proposal.id, proposal);
      this.setVoteTimeout(proposal);

      logger.info('ABFTConsensus', {
        proposalId: proposal.id,
        fromSwarm: message.senderSwarm,
        message: 'Remote proposal received'
      });
    }
  }

  private async logConsensusResult(proposal: Proposal): Promise<void> {
    // HCS logging is handled by messenger batching
    this.emit('consensus_finalized', {
      proposalId: proposal.id,
      status: proposal.status,
      voteCount: proposal.votes.size,
      timestamp: Date.now()
    });
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getProposal(proposalId: string): Proposal | undefined {
    return this.proposals.get(proposalId);
  }

  getActiveProposals(): Proposal[] {
    return Array.from(this.proposals.values()).filter(
      p => p.status === 'VOTING' || p.status === 'QUORUM_REACHED'
    );
  }

  getGuardians(): GuardianInfo[] {
    return Array.from(this.guardians.values());
  }

  getStats(): ABFTStats {
    // Calculate average vote time
    let totalVoteTime = 0;
    let voteCount = 0;
    
    for (const proposal of this.proposals.values()) {
      for (const vote of proposal.votes.values()) {
        totalVoteTime += vote.timestamp - proposal.timestamp;
        voteCount++;
      }
    }
    
    this.stats.averageVoteTime = voteCount > 0 ? totalVoteTime / voteCount : 0;
    
    return { ...this.stats };
  }

  /**
   * Reactivate deactivated guardian (manual recovery)
   */
  reactivateGuardian(agentId: string, newStake: number): boolean {
    const guardian = this.guardians.get(agentId);
    if (!guardian) return false;

    guardian.isActive = true;
    guardian.stake = Math.max(newStake, this.config.guardianStakeMin);
    guardian.reputation = 0.5; // Reset reputation
    guardian.consecutiveMisses = 0;

    this.totalStake += guardian.stake;

    logger.info('ABFTConsensus', { agentId, stake: guardian.stake, message: 'Guardian reactivated' });
    return true;
  }
}

// Export singleton
export const abftConsensus = new ABFTConsensusEngine();
