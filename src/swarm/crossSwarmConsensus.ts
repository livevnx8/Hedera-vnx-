/**
 * CrossSwarmConsensus - Federated Consensus via HCS
 * 
 * Phase 5 Implementation: Multi-swarm voting and consensus with
 * verifiable HCS-backed decision making.
 * 
 * Features:
 * - HCS-backed consensus proposals
 * - Federated voting across multiple swarms
 * - Byzantine fault tolerance (2/3 quorum)
 * - Consensus proof for audit trails
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { hcsSwarmMessenger, type HCSwarmMessage } from './hcsMessenger.js';

export interface ConsensusProposal {
  id: string;
  type: string;
  data: unknown;
  proposerSwarm: string;
  proposerAgent: string;
  timestamp: number;
  deadline: number;
  requiredVotes: number;
}

export interface ConsensusVote {
  proposalId: string;
  swarmId: string;
  agentId: string;
  vote: 'YES' | 'NO' | 'ABSTAIN';
  reasoning?: string;
  timestamp: number;
}

export interface ConsensusResult {
  proposalId: string;
  status: 'PENDING' | 'PASSED' | 'REJECTED' | 'EXPIRED' | 'EXPIRED_PASSED' | 'EXPIRED_REJECTED' | 'COMMITTED';
  yesVotes: number;
  noVotes: number;
  abstainVotes: number;
  participatingSwarms: string[];
  resultHash: string;
  timestamp: number;
}

export interface FederatedConsensus {
  value: unknown;
  confidence: number;
  participatingSwarms: string[];
  meetScore: number;
  timestamp: number;
  proof: string;
}

interface ActiveProposal {
  proposal: ConsensusProposal;
  votes: Map<string, ConsensusVote>; // swarmId -> vote
  result?: ConsensusResult;
}

/**
 * Cross-swarm consensus coordinator with HCS backing
 */
export class CrossSwarmConsensus extends EventEmitter {
  private localSwarmId: string;
  private activeProposals: Map<string, ActiveProposal> = new Map();
  private proposalHistory: ConsensusResult[] = [];
  private participatingSwarms: Set<string> = new Set();
  private isInitialized = false;

  // Configuration
  private config = {
    defaultTimeout: 30000,      // 30 seconds
    minQuorum: 0.67,           // 2/3 majority required
    maxProposals: 100,         // Prevent memory bloat
  };

  constructor(localSwarmId: string) {
    super();
    this.localSwarmId = localSwarmId;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Initialize HCS messenger
    await hcsSwarmMessenger.initialize();

    // Register message handlers
    this.registerHandlers();

    logger.info('CrossSwarmConsensus', {
      localSwarm: this.localSwarmId,
      message: 'Federated consensus initialized'
    });

    this.isInitialized = true;
  }

  private registerHandlers(): void {
    // Handle incoming proposals
    hcsSwarmMessenger.onMessage('CONSENSUS_PROPOSE', async (message) => {
      await this.handleProposal(message);
    });

    // Handle incoming votes
    hcsSwarmMessenger.onMessage('CONSENSUS_VOTE', async (message) => {
      await this.handleVote(message);
    });

    // Handle commits
    hcsSwarmMessenger.onMessage('CONSENSUS_COMMIT', async (message) => {
      await this.handleCommit(message);
    });
  }

  /**
   * Create a new federated consensus proposal
   */
  async propose(
    type: string,
    data: unknown,
    options?: { timeout?: number; requiredVotes?: number }
  ): Promise<string> {
    if (!this.isInitialized) await this.initialize();

    const proposalId = `consensus-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const timeout = options?.timeout || this.config.defaultTimeout;

    const proposal: ConsensusProposal = {
      id: proposalId,
      type,
      data,
      proposerSwarm: this.localSwarmId,
      proposerAgent: 'consensus-coordinator',
      timestamp: Date.now(),
      deadline: Date.now() + timeout,
      requiredVotes: options?.requiredVotes || this.calculateQuorum()
    };

    // Store locally
    this.activeProposals.set(proposalId, {
      proposal,
      votes: new Map()
    });

    // Broadcast to all swarms via HCS
    const message = hcsSwarmMessenger.createMessage(
      this.localSwarmId,
      'consensus-coordinator',
      'broadcast',
      'CONSENSUS_PROPOSE',
      proposal,
      { requiredVotes: proposal.requiredVotes }
    );

    const result = await hcsSwarmMessenger.submitMessage(message);

    if (result.success) {
      logger.info('CrossSwarmConsensus', {
        proposalId,
        type,
        deadline: proposal.deadline,
        requiredVotes: proposal.requiredVotes,
        message: 'Consensus proposal broadcast'
      });

      // Auto-vote YES as proposer
      await this.vote(proposalId, 'YES', 'Proposer auto-vote');

      // Set expiration timeout
      setTimeout(() => this.closeProposal(proposalId), timeout);
    } else {
      logger.error('CrossSwarmConsensus', {
        proposalId,
        error: result.error,
        message: 'Failed to broadcast proposal'
      });
    }

    return proposalId;
  }

  /**
   * Cast a vote on an active proposal
   */
  async vote(
    proposalId: string,
    vote: 'YES' | 'NO' | 'ABSTAIN',
    reasoning?: string
  ): Promise<boolean> {
    if (!this.isInitialized) await this.initialize();

    const voteData: ConsensusVote = {
      proposalId,
      swarmId: this.localSwarmId,
      agentId: 'consensus-voter',
      vote,
      reasoning,
      timestamp: Date.now()
    };

    // Find the proposal
    const activeProposal = this.activeProposals.get(proposalId);
    if (!activeProposal) {
      logger.warn('CrossSwarmConsensus', {
        proposalId,
        message: 'Cannot vote - proposal not found'
      });
      return false;
    }

    // Check deadline
    if (Date.now() > activeProposal.proposal.deadline) {
      logger.warn('CrossSwarmConsensus', {
        proposalId,
        message: 'Cannot vote - proposal expired'
      });
      return false;
    }

    // Broadcast vote via HCS
    const message = hcsSwarmMessenger.createMessage(
      this.localSwarmId,
      'consensus-voter',
      activeProposal.proposal.proposerSwarm,
      'CONSENSUS_VOTE',
      voteData
    );

    const result = await hcsSwarmMessenger.submitMessage(message);

    if (result.success) {
      // Store locally
      activeProposal.votes.set(this.localSwarmId, voteData);
      
      logger.info('CrossSwarmConsensus', {
        proposalId,
        vote,
        swarmId: this.localSwarmId,
        message: 'Vote submitted'
      });

      // Check if consensus reached
      await this.checkConsensus(proposalId);
    } else {
      logger.error('CrossSwarmConsensus', {
        proposalId,
        vote,
        error: result.error,
        message: 'Failed to submit vote'
      });
    }

    return result.success;
  }

  /**
   * Handle incoming proposal from another swarm
   */
  private async handleProposal(message: HCSwarmMessage): Promise<void> {
    const proposal = message.payload as ConsensusProposal;

    // Ignore if already exists
    if (this.activeProposals.has(proposal.id)) {
      return;
    }

    // Validate proposal
    if (Date.now() > proposal.deadline) {
      logger.debug('CrossSwarmConsensus', {
        proposalId: proposal.id,
        message: 'Ignoring expired proposal'
      });
      return;
    }

    // Store proposal
    this.activeProposals.set(proposal.id, {
      proposal,
      votes: new Map()
    });

    // Track participating swarm
    this.participatingSwarms.add(proposal.proposerSwarm);

    logger.info('CrossSwarmConsensus', {
      proposalId: proposal.id,
      fromSwarm: proposal.proposerSwarm,
      type: proposal.type,
      message: 'Received consensus proposal'
    });

    // Emit for local decision making
    this.emit('proposal_received', proposal);

    // Set expiration timeout
    const timeUntilExpiry = proposal.deadline - Date.now();
    if (timeUntilExpiry > 0) {
      setTimeout(() => this.closeProposal(proposal.id), timeUntilExpiry);
    }
  }

  /**
   * Handle incoming vote
   */
  private async handleVote(message: HCSwarmMessage): Promise<void> {
    const vote = message.payload as ConsensusVote;
    const activeProposal = this.activeProposals.get(vote.proposalId);

    if (!activeProposal) {
      logger.debug('CrossSwarmConsensus', {
        proposalId: vote.proposalId,
        message: 'Vote for unknown proposal'
      });
      return;
    }

    // Store vote
    activeProposal.votes.set(vote.swarmId, vote);

    logger.debug('CrossSwarmConsensus', {
      proposalId: vote.proposalId,
      fromSwarm: vote.swarmId,
      vote: vote.vote,
      totalVotes: activeProposal.votes.size,
      message: 'Vote received'
    });

    // Check consensus
    await this.checkConsensus(vote.proposalId);
  }

  /**
   * Handle commit notification
   */
  private async handleCommit(message: HCSwarmMessage): Promise<void> {
    const result = message.payload as ConsensusResult;
    const activeProposal = this.activeProposals.get(result.proposalId);

    if (activeProposal) {
      activeProposal.result = result;
      
      logger.info('CrossSwarmConsensus', {
        proposalId: result.proposalId,
        status: result.status,
        message: 'Consensus committed'
      });

      this.emit('consensus_committed', result);
    }
  }

  /**
   * Check if consensus threshold is reached
   */
  private async checkConsensus(proposalId: string): Promise<void> {
    const activeProposal = this.activeProposals.get(proposalId);
    if (!activeProposal) return;

    const votes = Array.from(activeProposal.votes.values());
    const yesCount = votes.filter(v => v.vote === 'YES').length;
    const noCount = votes.filter(v => v.vote === 'NO').length;
    const abstainCount = votes.filter(v => v.vote === 'ABSTAIN').length;

    const total = votes.length;
    const required = activeProposal.proposal.requiredVotes;

    let status: ConsensusResult['status'] = 'PENDING';
    let shouldCommit = false;

    // Check thresholds
    if (yesCount >= required) {
      status = 'PASSED';
      shouldCommit = true;
    } else if (noCount >= required) {
      status = 'REJECTED';
      shouldCommit = true;
    } else if (Date.now() > activeProposal.proposal.deadline) {
      // Deadline reached - decide based on current votes
      status = yesCount > noCount ? 'PASSED' : 'REJECTED';
      shouldCommit = true;
    }

    if (shouldCommit && !activeProposal.result) {
      const participatingSwarms = votes.map(v => v.swarmId);
      
      const result: ConsensusResult = {
        proposalId,
        status,
        yesVotes: yesCount,
        noVotes: noCount,
        abstainVotes: abstainCount,
        participatingSwarms,
        resultHash: this.hashResult(proposalId, status, participatingSwarms),
        timestamp: Date.now()
      };

      activeProposal.result = result;

      // Broadcast commit
      const commitMessage = hcsSwarmMessenger.createMessage(
        this.localSwarmId,
        'consensus-coordinator',
        'broadcast',
        'CONSENSUS_COMMIT',
        result
      );

      await hcsSwarmMessenger.submitMessage(commitMessage);

      // Archive
      this.proposalHistory.push(result);

      logger.info('CrossSwarmConsensus', {
        proposalId,
        status,
        yes: yesCount,
        no: noCount,
        abstain: abstainCount,
        participating: participatingSwarms.length,
        message: 'Consensus reached and committed'
      });

      this.emit('consensus_reached', result);
    }
  }

  /**
   * Close proposal and calculate final result
   */
  private closeProposal(proposalId: string): void {
    const activeProposal = this.activeProposals.get(proposalId);
    if (!activeProposal || activeProposal.result) return;

    // Force close with current votes
    const votes = Array.from(activeProposal.votes.values());
    const yesCount = votes.filter(v => v.vote === 'YES').length;
    const noCount = votes.filter(v => v.vote === 'NO').length;

    const status: ConsensusResult['status'] = yesCount > noCount ? 'EXPIRED_PASSED' : 'EXPIRED_REJECTED';
    
    logger.info('CrossSwarmConsensus', {
      proposalId,
      status,
      yes: yesCount,
      no: noCount,
      message: 'Proposal expired'
    });

    // Cleanup
    this.activeProposals.delete(proposalId);
  }

  /**
   * Calculate quorum based on participating swarms
   */
  private calculateQuorum(): number {
    const totalSwarms = Math.max(this.participatingSwarms.size + 1, 3); // At least 3
    return Math.ceil(totalSwarms * this.config.minQuorum);
  }

  /**
   * Get proposal status
   */
  getProposalStatus(proposalId: string): ConsensusResult | undefined {
    return this.activeProposals.get(proposalId)?.result;
  }

  /**
   * Get active proposals
   */
  getActiveProposals(): Array<{ id: string; type: string; votes: number; required: number }> {
    return Array.from(this.activeProposals.values())
      .filter(p => !p.result)
      .map(p => ({
        id: p.proposal.id,
        type: p.proposal.type,
        votes: p.votes.size,
        required: p.proposal.requiredVotes
      }));
  }

  /**
   * Get consensus statistics
   */
  getStats(): {
    activeProposals: number;
    totalProposals: number;
    participatingSwarms: number;
    committed: number;
    passed: number;
    rejected: number;
  } {
    const committed = this.proposalHistory;
    return {
      activeProposals: this.getActiveProposals().length,
      totalProposals: this.activeProposals.size + committed.length,
      participatingSwarms: this.participatingSwarms.size,
      committed: committed.length,
      passed: committed.filter(r => r.status === 'PASSED' || r.status === 'COMMITTED').length,
      rejected: committed.filter(r => r.status === 'REJECTED').length
    };
  }

  private hashResult(proposalId: string, status: string, swarms: string[]): string {
    const data = `${proposalId}:${status}:${swarms.sort().join(',')}`;
    return Buffer.from(data).toString('base64').slice(0, 32);
  }
}

// Export factory (needs swarm ID)
export function createCrossSwarmConsensus(localSwarmId: string): CrossSwarmConsensus {
  return new CrossSwarmConsensus(localSwarmId);
}
