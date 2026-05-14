/**
 * Nested Consensus Rings
 *
 * Implements multi-layer Byzantine consensus following the "Seed of Life" pattern.
 * 3 layers of consensus:
 * - Inner Ring: Critical decisions (2/3 majority, highest security)
 * - Middle Ring: Standard decisions (simple majority, balanced)
 * - Outer Ring: Advisory decisions (plurality, fastest)
 *
 * Each ring nests within the next like concentric circles in sacred geometry.
 * The vesica piscis (intersection) between rings determines which agents
 * participate in cross-ring consensus.
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../../monitoring/logger.js';

export type ConsensusLayer = 'inner' | 'middle' | 'outer';
export type DecisionType = 'critical' | 'standard' | 'advisory';

export interface ConsensusRing {
  layer: ConsensusLayer;
  members: string[]; // Agent IDs
  requiredQuorum: number; // e.g., 7 for inner, 13 for middle, 19 for outer
  requiredMajority: number; // 0.67 for inner, 0.51 for middle, 0.34 for outer
}

export interface ConsensusProposal {
  id: string;
  type: DecisionType;
  data: any;
  proposer: string;
  timestamp: number;
  layer: ConsensusLayer;
}

export interface ConsensusVote {
  proposalId: string;
  voter: string;
  decision: 'yes' | 'no' | 'abstain';
  timestamp: number;
  signature: string;
}

export interface ConsensusResult {
  proposalId: string;
  status: 'accepted' | 'rejected' | 'pending' | 'expired';
  yesVotes: number;
  noVotes: number;
  abstainVotes: number;
  totalVoters: number;
  requiredQuorum: number;
  layer: ConsensusLayer;
  timestamp: number;
  finality: 'final' | 'tentative';
}

export interface NestedConsensusConfig {
  innerRingSize: number;
  middleRingSize: number;
  outerRingSize: number;
  proposalTimeoutMs: number;
  maxConcurrentProposals: number;
  enableCrossRingValidation: boolean;
  secretKey?: string;
}

const DEFAULT_CONFIG: NestedConsensusConfig = {
  innerRingSize: 7, // Seed of life center + 6 petals
  middleRingSize: 13, // Next ring of the flower
  outerRingSize: 19, // Perimeter ring
  proposalTimeoutMs: 60000,
  maxConcurrentProposals: 10,
  enableCrossRingValidation: true,
  secretKey: process.env.VERA_CONSENSUS_SECRET || '',
};

export class NestedConsensusRings extends EventEmitter {
  private config: NestedConsensusConfig;
  private rings: Map<ConsensusLayer, ConsensusRing> = new Map();
  private proposals: Map<string, ConsensusProposal> = new Map();
  private votes: Map<string, ConsensusVote[]> = new Map();
  private results: Map<string, ConsensusResult> = new Map();
  private activeProposals: Set<string> = new Set();
  private isRunning = false;
  private cleanupTimer: NodeJS.Timeout | null = null;

  // Stats
  private stats = {
    proposalsAccepted: 0,
    proposalsRejected: 0,
    proposalsExpired: 0,
    totalVotesCast: 0,
    crossRingValidations: 0,
  };

  constructor(config: Partial<NestedConsensusConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeRings();
  }

  /**
   * Initialize the three nested rings
   */
  private initializeRings(): void {
    // Inner ring: 7 agents for critical decisions
    this.rings.set('inner', {
      layer: 'inner',
      members: [],
      requiredQuorum: 5, // 5 of 7 for quorum
      requiredMajority: 0.67, // 2/3 supermajority
    });

    // Middle ring: 13 agents for standard decisions
    this.rings.set('middle', {
      layer: 'middle',
      members: [],
      requiredQuorum: 7, // 7 of 13 for quorum
      requiredMajority: 0.51, // Simple majority
    });

    // Outer ring: 19 agents for advisory decisions
    this.rings.set('outer', {
      layer: 'outer',
      members: [],
      requiredQuorum: 7, // 7 of 19 for quorum
      requiredMajority: 0.34, // Plurality
    });

    logger.info('NestedConsensusRings', {
      message: 'Consensus rings initialized',
      rings: {
        inner: this.config.innerRingSize,
        middle: this.config.middleRingSize,
        outer: this.config.outerRingSize,
      },
    });
  }

  /**
   * Start consensus engine
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Periodic cleanup of expired proposals
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredProposals();
    }, 10000);

    logger.info('NestedConsensusRings', {
      message: 'Consensus engine started',
    });

    this.emit('started');
  }

  /**
   * Stop consensus engine
   */
  stop(): void {
    this.isRunning = false;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    logger.info('NestedConsensusRings', { message: 'Consensus engine stopped' });
    this.emit('stopped');
  }

  /**
   * Assign agent to appropriate ring based on reputation/stake
   */
  assignAgent(agentId: string, reputation: number, stake: number): ConsensusLayer {
    // Sort agents by reputation + stake to determine ring assignment
    // Inner ring: highest reputation agents
    // Middle ring: medium reputation
    // Outer ring: all other agents

    const inner = this.rings.get('inner')!;
    const middle = this.rings.get('middle')!;

    if (inner.members.length < this.config.innerRingSize) {
      inner.members.push(agentId);
      this.emit('agent_assigned', { agentId, layer: 'inner' });
      return 'inner';
    } else if (middle.members.length < this.config.middleRingSize) {
      middle.members.push(agentId);
      this.emit('agent_assigned', { agentId, layer: 'middle' });
      return 'middle';
    } else {
      this.rings.get('outer')!.members.push(agentId);
      this.emit('agent_assigned', { agentId, layer: 'outer' });
      return 'outer';
    }
  }

  /**
   * Determine which layer should handle a decision type
   */
  private getLayerForDecisionType(type: DecisionType): ConsensusLayer {
    switch (type) {
      case 'critical':
        return 'inner';
      case 'standard':
        return 'middle';
      case 'advisory':
        return 'outer';
      default:
        return 'middle';
    }
  }

  /**
   * Create a new proposal
   */
  createProposal(
    type: DecisionType,
    data: any,
    proposer: string
  ): ConsensusProposal | null {
    if (this.activeProposals.size >= this.config.maxConcurrentProposals) {
      logger.warn('NestedConsensusRings', {
        message: 'Max concurrent proposals reached',
        max: this.config.maxConcurrentProposals,
      });
      return null;
    }

    const layer = this.getLayerForDecisionType(type);
    const ring = this.rings.get(layer)!;

    // Verify proposer is in the appropriate ring
    if (!ring.members.includes(proposer)) {
      logger.warn('NestedConsensusRings', {
        message: 'Proposer not in required ring',
        proposer,
        requiredLayer: layer,
      });
      return null;
    }

    const proposal: ConsensusProposal = {
      id: this.generateProposalId(),
      type,
      data,
      proposer,
      timestamp: Date.now(),
      layer,
    };

    this.proposals.set(proposal.id, proposal);
    this.votes.set(proposal.id, []);
    this.activeProposals.add(proposal.id);

    logger.info('NestedConsensusRings', {
      message: 'Proposal created',
      proposalId: proposal.id,
      type,
      layer,
    });

    this.emit('proposal_created', proposal);

    return proposal;
  }

  /**
   * Cast a vote on a proposal
   */
  castVote(
    proposalId: string,
    voter: string,
    decision: 'yes' | 'no' | 'abstain'
  ): ConsensusResult | null {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      logger.warn('NestedConsensusRings', {
        message: 'Vote on unknown proposal',
        proposalId,
      });
      return null;
    }

    if (!this.activeProposals.has(proposalId)) {
      logger.warn('NestedConsensusRings', {
        message: 'Proposal no longer active',
        proposalId,
      });
      return null;
    }

    const ring = this.rings.get(proposal.layer)!;

    // Verify voter is in the appropriate ring
    if (!ring.members.includes(voter)) {
      logger.warn('NestedConsensusRings', {
        message: 'Voter not in required ring',
        voter,
        requiredLayer: proposal.layer,
      });
      return null;
    }

    // Check for duplicate vote
    const existingVotes = this.votes.get(proposalId) || [];
    if (existingVotes.some((v) => v.voter === voter)) {
      logger.warn('NestedConsensusRings', {
        message: 'Duplicate vote',
        voter,
        proposalId,
      });
      return null;
    }

    const vote: ConsensusVote = {
      proposalId,
      voter,
      decision,
      timestamp: Date.now(),
      signature: this.signVote(voter, proposalId, decision),
    };

    existingVotes.push(vote);
    this.votes.set(proposalId, existingVotes);
    this.stats.totalVotesCast++;

    this.emit('vote_cast', vote);

    // Check if consensus reached
    return this.checkConsensus(proposalId);
  }

  /**
   * Check if consensus has been reached
   */
  private checkConsensus(proposalId: string): ConsensusResult | null {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return null;

    const votes = this.votes.get(proposalId) || [];
    const ring = this.rings.get(proposal.layer)!;

    const yesVotes = votes.filter((v) => v.decision === 'yes').length;
    const noVotes = votes.filter((v) => v.decision === 'no').length;
    const abstainVotes = votes.filter((v) => v.decision === 'abstain').length;

    const totalVoters = votes.length;
    const requiredQuorum = ring.requiredQuorum;
    const requiredMajority = Math.ceil(ring.requiredMajority * totalVoters);

    // Check quorum
    if (totalVoters < requiredQuorum) {
      return {
        proposalId,
        status: 'pending',
        yesVotes,
        noVotes,
        abstainVotes,
        totalVoters,
        requiredQuorum,
        layer: proposal.layer,
        timestamp: Date.now(),
        finality: 'tentative',
      };
    }

    // Determine outcome
    let status: ConsensusResult['status'];
    let finality: ConsensusResult['finality'] = 'tentative';

    if (yesVotes >= requiredMajority) {
      status = 'accepted';
      finality = proposal.layer === 'inner' ? 'final' : 'tentative';
      this.stats.proposalsAccepted++;
      this.activeProposals.delete(proposalId);

      // For non-inner ring decisions, escalate to inner ring for final validation
      if (proposal.layer !== 'inner' && this.config.enableCrossRingValidation) {
        this.escalateToInnerRing(proposal);
      }
    } else if (noVotes >= requiredMajority) {
      status = 'rejected';
      finality = 'final';
      this.stats.proposalsRejected++;
      this.activeProposals.delete(proposalId);
    } else {
      status = 'pending';
    }

    const result: ConsensusResult = {
      proposalId,
      status,
      yesVotes,
      noVotes,
      abstainVotes,
      totalVoters,
      requiredQuorum,
      layer: proposal.layer,
      timestamp: Date.now(),
      finality,
    };

    this.results.set(proposalId, result);

    if (status === 'accepted' || status === 'rejected') {
      this.emit('consensus_reached', result);
      logger.info('NestedConsensusRings', {
        message: 'Consensus reached',
        proposalId,
        status,
        yesVotes,
        noVotes,
        layer: proposal.layer,
      });
    }

    return result;
  }

  /**
   * Escalate a proposal to inner ring for final validation
   * (cross-ring consensus like vesica piscis intersection)
   */
  private escalateToInnerRing(proposal: ConsensusProposal): void {
    this.stats.crossRingValidations++;

    // Create validation proposal in inner ring
    const validationProposal = this.createProposal('critical', {
      originalProposal: proposal,
      validationType: 'cross_ring_confirmation',
    }, proposal.proposer);

    if (validationProposal) {
      logger.info('NestedConsensusRings', {
        message: 'Proposal escalated to inner ring',
        originalProposal: proposal.id,
        validationProposal: validationProposal.id,
      });
    }
  }

  /**
   * Cleanup expired proposals
   */
  private cleanupExpiredProposals(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, proposal] of this.proposals) {
      if (now - proposal.timestamp > this.config.proposalTimeoutMs) {
        if (this.activeProposals.has(id)) {
          expired.push(id);
        }
      }
    }

    for (const id of expired) {
      this.activeProposals.delete(id);
      this.stats.proposalsExpired++;

      const result: ConsensusResult = {
        proposalId: id,
        status: 'expired',
        yesVotes: 0,
        noVotes: 0,
        abstainVotes: 0,
        totalVoters: 0,
        requiredQuorum: 0,
        layer: this.proposals.get(id)?.layer || 'middle',
        timestamp: Date.now(),
        finality: 'final',
      };

      this.results.set(id, result);

      logger.info('NestedConsensusRings', {
        message: 'Proposal expired',
        proposalId: id,
      });

      this.emit('proposal_expired', { proposalId: id });
    }
  }

  /**
   * Get proposal status
   */
  getProposalStatus(proposalId: string): ConsensusResult | null {
    return this.results.get(proposalId) || null;
  }

  /**
   * Get active proposals for a layer
   */
  getActiveProposals(layer?: ConsensusLayer): ConsensusProposal[] {
    const proposals = Array.from(this.proposals.values()).filter((p) =>
      this.activeProposals.has(p.id)
    );

    if (layer) {
      return proposals.filter((p) => p.layer === layer);
    }

    return proposals;
  }

  /**
   * Get ring composition
   */
  getRingComposition(): Record<ConsensusLayer, { members: string[]; size: number; capacity: number }> {
    return {
      inner: {
        members: this.rings.get('inner')!.members,
        size: this.rings.get('inner')!.members.length,
        capacity: this.config.innerRingSize,
      },
      middle: {
        members: this.rings.get('middle')!.members,
        size: this.rings.get('middle')!.members.length,
        capacity: this.config.middleRingSize,
      },
      outer: {
        members: this.rings.get('outer')!.members,
        size: this.rings.get('outer')!.members.length,
        capacity: this.config.outerRingSize,
      },
    };
  }

  /**
   * Get visualization data for the nested rings
   */
  getVisualization() {
    const composition = this.getRingComposition();

    return {
      type: 'seed_of_life',
      layers: [
        {
          layer: 'inner',
          radius: 50,
          color: '#gold',
          ...composition.inner,
        },
        {
          layer: 'middle',
          radius: 100,
          color: '#silver',
          ...composition.middle,
        },
        {
          layer: 'outer',
          radius: 150,
          color: '#bronze',
          ...composition.outer,
        },
      ],
      activeProposals: this.activeProposals.size,
    };
  }

  /**
   * Get consensus statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeProposals: this.activeProposals.size,
      totalProposals: this.proposals.size,
      ringComposition: this.getRingComposition(),
    };
  }

  /**
   * Generate unique proposal ID
   */
  private generateProposalId(): string {
    return `prop-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Sign a vote
   */
  private signVote(voter: string, proposalId: string, decision: string): string {
    if (!this.config.secretKey) return '';

    const data = `${voter}:${proposalId}:${decision}:${Date.now()}`;
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Manually force consensus (admin operation)
   */
  forceConsensus(proposalId: string, decision: 'accepted' | 'rejected'): ConsensusResult | null {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return null;

    const ring = this.rings.get(proposal.layer)!;
    const votes = this.votes.get(proposalId) || [];

    const result: ConsensusResult = {
      proposalId,
      status: decision,
      yesVotes: decision === 'accepted' ? ring.requiredQuorum : 0,
      noVotes: decision === 'rejected' ? ring.requiredQuorum : 0,
      abstainVotes: 0,
      totalVoters: votes.length,
      requiredQuorum: ring.requiredQuorum,
      layer: proposal.layer,
      timestamp: Date.now(),
      finality: 'final',
    };

    this.results.set(proposalId, result);
    this.activeProposals.delete(proposalId);

    if (decision === 'accepted') {
      this.stats.proposalsAccepted++;
    } else {
      this.stats.proposalsRejected++;
    }

    this.emit('consensus_reached', result);
    return result;
  }
}

export default NestedConsensusRings;
