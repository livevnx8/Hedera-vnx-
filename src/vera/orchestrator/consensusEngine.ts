/**
 * Vera Cross-Agent Consensus Engine
 * Implements 2/3 majority voting for critical decisions
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface ConsensusConfig {
  voteThreshold: number;      // 0.5 = simple majority, 0.67 = 2/3
  timeoutMs: number;          // How long to wait for votes
  minVoters: number;          // Minimum voters required
  maxRetries: number;         // Retry attempts for failed consensus
}

export interface ConsensusVote {
  voterId: string;
  voterType: string;
  decision: boolean;
  confidence: number;
  timestamp: number;
  reason?: string;
}

export interface ConsensusRequest {
  proposalId: string;
  proposal: string;
  proposerId: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timeoutMs?: number;
}

export interface ConsensusResult {
  proposalId: string;
  status: 'APPROVED' | 'REJECTED' | 'TIMEOUT' | 'INCONCLUSIVE';
  votesFor: number;
  votesAgainst: number;
  totalVoters: number;
  confidence: number;
  timestamp: number;
  duration: number;
}

export const DEFAULT_CONSENSUS_CONFIG: ConsensusConfig = {
  voteThreshold: 0.67,  // 2/3 majority
  timeoutMs: 30000,     // 30 seconds
  minVoters: 3,
  maxRetries: 2,
};

export class ConsensusEngine extends EventEmitter {
  private activeProposals = new Map<string, {
    request: ConsensusRequest;
    votes: ConsensusVote[];
    startTime: number;
    timeout: NodeJS.Timeout;
  }>();

  private proposalHistory: ConsensusResult[] = [];
  private metrics = {
    totalProposals: 0,
    approved: 0,
    rejected: 0,
    timeouts: 0,
    avgDuration: 0,
  };

  constructor(private config: ConsensusConfig = DEFAULT_CONSENSUS_CONFIG) {
    super();
  }

  /**
   * Initiate a new consensus proposal
   */
  async propose(request: ConsensusRequest): Promise<ConsensusResult> {
    const proposalId = request.proposalId || `prop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    const timeoutMs = request.timeoutMs || this.config.timeoutMs;

    logger.info('ConsensusEngine', {
      message: 'Consensus proposal initiated',
      proposalId,
      proposal: request.proposal,
      proposer: request.proposerId,
      urgency: request.urgency,
    });

    // Set up timeout
    const timeout = setTimeout(() => {
      this.handleTimeout(proposalId);
    }, timeoutMs);

    // Store proposal
    this.activeProposals.set(proposalId, {
      request: { ...request, proposalId },
      votes: [],
      startTime,
      timeout,
    });

    this.metrics.totalProposals++;

    // Emit event for voters to respond
    this.emit('proposal_created', {
      proposalId,
      proposal: request.proposal,
      proposerId: request.proposerId,
      urgency: request.urgency,
      timeoutMs,
    });

    // Wait for votes (in production, this would be event-driven)
    return new Promise((resolve) => {
      this.once(`consensus_${proposalId}`, (result: ConsensusResult) => {
        resolve(result);
      });
    });
  }

  /**
   * Submit a vote for a proposal
   */
  submitVote(proposalId: string, vote: ConsensusVote): boolean {
    const proposal = this.activeProposals.get(proposalId);
    
    if (!proposal) {
      logger.warn('ConsensusEngine', {
        message: 'Vote submitted for unknown proposal',
        proposalId,
        voter: vote.voterId,
      });
      return false;
    }

    // Check for duplicate vote
    const existingVote = proposal.votes.find(v => v.voterId === vote.voterId);
    if (existingVote) {
      logger.warn('ConsensusEngine', {
        message: 'Duplicate vote rejected',
        proposalId,
        voter: vote.voterId,
      });
      return false;
    }

    proposal.votes.push(vote);

    logger.info('ConsensusEngine', {
      message: 'Vote recorded',
      proposalId,
      voter: vote.voterId,
      decision: vote.decision,
      confidence: vote.confidence,
      totalVotes: proposal.votes.length,
    });

    this.emit('vote_recorded', {
      proposalId,
      voterId: vote.voterId,
      decision: vote.decision,
      totalVotes: proposal.votes.length,
    });

    // Check if consensus is reached
    this.checkConsensus(proposalId);

    return true;
  }

  private normalizeRate(rate: number): number {
    return Number(rate.toFixed(2));
  }

  private meetsApprovalThreshold(votesFor: number, totalVotes: number): boolean {
    return this.normalizeRate(votesFor / totalVotes) >= this.config.voteThreshold;
  }

  /**
   * Check if consensus threshold is reached
   */
  private checkConsensus(proposalId: string): void {
    const proposal = this.activeProposals.get(proposalId);
    if (!proposal) return;

    const totalVotes = proposal.votes.length;
    const votesFor = proposal.votes.filter(v => v.decision).length;
    const votesAgainst = totalVotes - votesFor;

    // Calculate weighted confidence
    const avgConfidence = proposal.votes.reduce((sum, v) => sum + v.confidence, 0) / totalVotes;

    // Check if we have minimum voters
    if (totalVotes < this.config.minVoters) {
      return; // Not enough votes yet
    }

    const approvalRate = votesFor / totalVotes;
    const againstRate = votesAgainst / totalVotes;
    let status: ConsensusResult['status'];
    let completed = false;

    if (this.meetsApprovalThreshold(votesFor, totalVotes)) {
      status = 'APPROVED';
      completed = true;
      this.metrics.approved++;
    } else if (this.normalizeRate(againstRate) > this.normalizeRate(1 - this.config.voteThreshold)) {
      // Rejection threshold met (more than 1/3 against)
      status = 'REJECTED';
      completed = true;
      this.metrics.rejected++;
    }

    if (completed) {
      this.finalizeConsensus(proposalId, status, votesFor, votesAgainst, avgConfidence);
    }
  }

  /**
   * Handle proposal timeout
   */
  private handleTimeout(proposalId: string): void {
    const proposal = this.activeProposals.get(proposalId);
    if (!proposal) return;

    const totalVotes = proposal.votes.length;
    const votesFor = proposal.votes.filter(v => v.decision).length;
    const votesAgainst = totalVotes - votesFor;
    const avgConfidence = totalVotes > 0 
      ? proposal.votes.reduce((sum, v) => sum + v.confidence, 0) / totalVotes 
      : 0;

    let status: ConsensusResult['status'];

    if (totalVotes < this.config.minVoters) {
      status = 'TIMEOUT';
      this.metrics.timeouts++;
    } else {
      const approvalRate = votesFor / totalVotes;
      status = this.meetsApprovalThreshold(votesFor, totalVotes)
        ? 'APPROVED'
        : approvalRate > 0.5
          ? 'INCONCLUSIVE'
          : 'REJECTED';
    }

    this.finalizeConsensus(proposalId, status, votesFor, votesAgainst, avgConfidence);
  }

  /**
   * Finalize consensus and emit result
   */
  private finalizeConsensus(
    proposalId: string, 
    status: ConsensusResult['status'],
    votesFor: number,
    votesAgainst: number,
    confidence: number
  ): void {
    const proposal = this.activeProposals.get(proposalId);
    if (!proposal) return;

    // Clear timeout
    clearTimeout(proposal.timeout);

    const duration = Date.now() - proposal.startTime;
    
    const result: ConsensusResult = {
      proposalId,
      status,
      votesFor,
      votesAgainst,
      totalVoters: proposal.votes.length,
      confidence,
      timestamp: Date.now(),
      duration,
    };

    // Store in history
    this.proposalHistory.push(result);
    if (this.proposalHistory.length > 100) {
      this.proposalHistory.shift();
    }

    // Update metrics
    this.metrics.avgDuration = 
      (this.metrics.avgDuration * (this.metrics.totalProposals - 1) + duration) / 
      this.metrics.totalProposals;

    // Clean up
    this.activeProposals.delete(proposalId);

    logger.info('ConsensusEngine', {
      message: 'Consensus finalized',
      proposalId,
      status,
      votesFor,
      votesAgainst,
      confidence: confidence.toFixed(2),
      duration: `${duration}ms`,
    });

    this.emit('consensus_reached', result);
    this.emit(`consensus_${proposalId}`, result);
  }

  /**
   * Get proposal by ID
   */
  getProposal(proposalId: string) {
    return this.activeProposals.get(proposalId);
  }

  /**
   * Get consensus history
   */
  getHistory(limit = 10): ConsensusResult[] {
    return this.proposalHistory.slice(-limit);
  }

  /**
   * Get consensus statistics
   */
  getStats() {
    return {
      ...this.metrics,
      activeProposals: this.activeProposals.size,
      approvalRate: this.metrics.totalProposals > 0 
        ? (this.metrics.approved / this.metrics.totalProposals).toFixed(2)
        : '0.00',
      avgDurationMs: Math.round(this.metrics.avgDuration),
    };
  }

  /**
   * Get Prometheus-formatted metrics
   */
  getPrometheusMetrics(): string {
    return `
# HELP vera_consensus_proposals_total Total consensus proposals
# TYPE vera_consensus_proposals_total counter
vera_consensus_proposals_total ${this.metrics.totalProposals}

# HELP vera_consensus_approved_total Approved proposals
# TYPE vera_consensus_approved_total counter
vera_consensus_approved_total ${this.metrics.approved}

# HELP vera_consensus_rejected_total Rejected proposals
# TYPE vera_consensus_rejected_total counter
vera_consensus_rejected_total ${this.metrics.rejected}

# HELP vera_consensus_timeouts_total Timed out proposals
# TYPE vera_consensus_timeouts_total counter
vera_consensus_timeouts_total ${this.metrics.timeouts}

# HELP vera_consensus_active_proposals Current active proposals
# TYPE vera_consensus_active_proposals gauge
vera_consensus_active_proposals ${this.activeProposals.size}

# HELP vera_consensus_avg_duration_ms Average consensus duration
# TYPE vera_consensus_avg_duration_ms gauge
vera_consensus_avg_duration_ms ${Math.round(this.metrics.avgDuration)}
`.trim();
  }

  /**
   * Cancel an active proposal
   */
  cancelProposal(proposalId: string, reason: string): boolean {
    const proposal = this.activeProposals.get(proposalId);
    if (!proposal) return false;

    clearTimeout(proposal.timeout);
    this.activeProposals.delete(proposalId);

    logger.info('ConsensusEngine', {
      message: 'Proposal cancelled',
      proposalId,
      reason,
    });

    this.emit('proposal_cancelled', { proposalId, reason });

    return true;
  }
}

export default ConsensusEngine;
