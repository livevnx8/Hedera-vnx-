/**
 * Intersection Consensus Points
 *
 * Implements consensus at the "vesica piscis" boundaries where rings overlap.
 * These intersection points are critical for cross-shard and cross-ring decisions.
 *
 * Key concepts:
 * - Boundary agents participate in consensus for both rings
 * - Intersection consensus requires approval from both parent rings
 * - Acts as a bridge for cross-cutting concerns (security, policy, emergency)
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { NestedConsensusRings, ConsensusProposal, ConsensusVote, ConsensusResult } from './nestedConsensusRings.js';

export interface IntersectionPoint {
  id: string;
  parentA: string; // Layer identifier (e.g., 'inner', 'shard-1')
  parentB: string; // Layer identifier
  members: string[]; // Agents at intersection
  decisionTypes: string[]; // What decisions this intersection handles
  requiredApprovals: number; // How many approvals needed from each parent
}

export interface CrossCuttingProposal {
  id: string;
  intersectionId: string;
  type: 'security' | 'policy' | 'emergency' | 'reconfiguration';
  data: any;
  proposer: string;
  timestamp: number;
  approvalsA: string[]; // Approvals from parent A
  approvalsB: string[]; // Approvals from parent B
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export class IntersectionConsensusPoints extends EventEmitter {
  private intersections: Map<string, IntersectionPoint> = new Map();
  private proposals: Map<string, CrossCuttingProposal> = new Map();
  private nestedRings: NestedConsensusRings;
  private isRunning = false;
  private proposalTimeoutMs = 120000; // 2 minutes

  // Stats
  private stats = {
    intersectionsCreated: 0,
    proposalsApproved: 0,
    proposalsRejected: 0,
    crossRingDecisions: 0,
  };

  constructor(nestedRings: NestedConsensusRings) {
    super();
    this.nestedRings = nestedRings;
    this.initializeDefaultIntersections();
  }

  /**
   * Initialize default intersection points
   */
  private initializeDefaultIntersections(): void {
    // Inner-Middle intersection (7 agents)
    this.createIntersection('inner-middle', 'inner', 'middle', {
      decisionTypes: ['security_policy', 'agent_promotion', 'emergency_pause'],
      requiredApprovals: 3,
    });

    // Middle-Outer intersection (13 agents overlap)
    this.createIntersection('middle-outer', 'middle', 'outer', {
      decisionTypes: ['resource_allocation', 'load_balancing', 'reputation_sync'],
      requiredApprovals: 5,
    });

    // Ring-Shard intersections for cross-shard decisions
    this.createIntersection('ring-shard-global', 'outer', 'shards', {
      decisionTypes: ['shard_merge', 'shard_split', 'global_config'],
      requiredApprovals: 7,
    });

    logger.info('IntersectionConsensusPoints', {
      message: 'Default intersections initialized',
      count: this.intersections.size,
    });
  }

  /**
   * Create a new intersection point
   */
  createIntersection(
    id: string,
    parentA: string,
    parentB: string,
    options: {
      decisionTypes: string[];
      requiredApprovals: number;
      initialMembers?: string[];
    }
  ): IntersectionPoint {
    const intersection: IntersectionPoint = {
      id,
      parentA,
      parentB,
      members: options.initialMembers || [],
      decisionTypes: options.decisionTypes,
      requiredApprovals: options.requiredApprovals,
    };

    this.intersections.set(id, intersection);
    this.stats.intersectionsCreated++;

    logger.info('IntersectionConsensusPoints', {
      message: 'Intersection point created',
      intersectionId: id,
      parentA,
      parentB,
      decisionTypes: options.decisionTypes,
    });

    this.emit('intersection_created', intersection);
    return intersection;
  }

  /**
   * Start intersection consensus engine
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('IntersectionConsensusPoints', {
      message: 'Intersection consensus started',
      activeIntersections: this.intersections.size,
    });

    this.emit('started');
  }

  /**
   * Stop intersection consensus engine
   */
  stop(): void {
    this.isRunning = false;

    logger.info('IntersectionConsensusPoints', {
      message: 'Intersection consensus stopped',
    });

    this.emit('stopped');
  }

  /**
   * Register agent at an intersection
   */
  registerAgentAtIntersection(intersectionId: string, agentId: string): boolean {
    const intersection = this.intersections.get(intersectionId);
    if (!intersection) {
      logger.warn('IntersectionConsensusPoints', {
        message: 'Unknown intersection',
        intersectionId,
      });
      return false;
    }

    // Verify agent is in both parent rings
    const ringA = this.getRingMembers(intersection.parentA);
    const ringB = this.getRingMembers(intersection.parentB);

    if (!ringA.includes(agentId) || !ringB.includes(agentId)) {
      logger.warn('IntersectionConsensusPoints', {
        message: 'Agent not in both parent rings',
        agentId,
        intersectionId,
      });
      return false;
    }

    if (!intersection.members.includes(agentId)) {
      intersection.members.push(agentId);
      this.emit('agent_registered', { intersectionId, agentId });
    }

    return true;
  }

  /**
   * Get members of a ring/shard by identifier
   */
  private getRingMembers(ringId: string): string[] {
    if (ringId === 'inner' || ringId === 'middle' || ringId === 'outer') {
      const composition = this.nestedRings.getRingComposition();
      return composition[ringId]?.members || [];
    }
    // For shards, would query shard manager
    return [];
  }

  /**
   * Create a cross-cutting proposal
   */
  createCrossCuttingProposal(
    intersectionId: string,
    type: CrossCuttingProposal['type'],
    data: any,
    proposer: string
  ): CrossCuttingProposal | null {
    const intersection = this.intersections.get(intersectionId);
    if (!intersection) {
      logger.warn('IntersectionConsensusPoints', {
        message: 'Cannot create proposal at unknown intersection',
        intersectionId,
      });
      return null;
    }

    // Verify proposer is at intersection
    if (!intersection.members.includes(proposer)) {
      logger.warn('IntersectionConsensusPoints', {
        message: 'Proposer not at intersection',
        proposer,
        intersectionId,
      });
      return null;
    }

    const proposal: CrossCuttingProposal = {
      id: `cross-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      intersectionId,
      type,
      data,
      proposer,
      timestamp: Date.now(),
      approvalsA: [],
      approvalsB: [],
      status: 'pending',
    };

    this.proposals.set(proposal.id, proposal);
    this.stats.crossRingDecisions++;

    logger.info('IntersectionConsensusPoints', {
      message: 'Cross-cutting proposal created',
      proposalId: proposal.id,
      intersectionId,
      type,
    });

    this.emit('proposal_created', proposal);
    return proposal;
  }

  /**
   * Approve a cross-cutting proposal
   */
  approveProposal(proposalId: string, agentId: string): CrossCuttingProposal | null {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'pending') {
      return null;
    }

    const intersection = this.intersections.get(proposal.intersectionId)!;

    // Verify agent is at intersection
    if (!intersection.members.includes(agentId)) {
      logger.warn('IntersectionConsensusPoints', {
        message: 'Approver not at intersection',
        agentId,
        intersectionId: proposal.intersectionId,
      });
      return null;
    }

    // Determine which parent ring this agent belongs to
    const ringA = this.getRingMembers(intersection.parentA);
    const ringB = this.getRingMembers(intersection.parentB);

    if (ringA.includes(agentId) && !proposal.approvalsA.includes(agentId)) {
      proposal.approvalsA.push(agentId);
    } else if (ringB.includes(agentId) && !proposal.approvalsB.includes(agentId)) {
      proposal.approvalsB.push(agentId);
    } else {
      return proposal; // Already approved or invalid
    }

    this.emit('approval_received', { proposalId, agentId });

    // Check if consensus reached
    return this.checkIntersectionConsensus(proposalId);
  }

  /**
   * Check if intersection consensus is reached
   */
  private checkIntersectionConsensus(proposalId: string): CrossCuttingProposal | null {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return null;

    const intersection = this.intersections.get(proposal.intersectionId)!;

    const hasEnoughA = proposal.approvalsA.length >= intersection.requiredApprovals;
    const hasEnoughB = proposal.approvalsB.length >= intersection.requiredApprovals;

    if (hasEnoughA && hasEnoughB) {
      proposal.status = 'approved';
      this.stats.proposalsApproved++;

      logger.info('IntersectionConsensusPoints', {
        message: 'Cross-cutting proposal approved',
        proposalId,
        approvalsA: proposal.approvalsA.length,
        approvalsB: proposal.approvalsB.length,
      });

      this.emit('proposal_approved', proposal);
    }

    return proposal;
  }

  /**
   * Reject a cross-cutting proposal
   */
  rejectProposal(proposalId: string, agentId: string): CrossCuttingProposal | null {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'pending') {
      return null;
    }

    const intersection = this.intersections.get(proposal.intersectionId)!;

    // Verify agent can reject (must be at intersection)
    if (!intersection.members.includes(agentId)) {
      return null;
    }

    proposal.status = 'rejected';
    this.stats.proposalsRejected++;

    logger.info('IntersectionConsensusPoints', {
      message: 'Cross-cutting proposal rejected',
      proposalId,
      rejectedBy: agentId,
    });

    this.emit('proposal_rejected', proposal);
    return proposal;
  }

  /**
   * Cleanup expired proposals
   */
  cleanupExpiredProposals(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, proposal] of this.proposals) {
      if (proposal.status === 'pending' && now - proposal.timestamp > this.proposalTimeoutMs) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      const proposal = this.proposals.get(id);
      if (proposal) {
        proposal.status = 'expired';
        logger.info('IntersectionConsensusPoints', {
          message: 'Cross-cutting proposal expired',
          proposalId: id,
        });
        this.emit('proposal_expired', proposal);
      }
    }
  }

  /**
   * Get intersection visualization data
   */
  getIntersectionVisualization(): {
    intersections: IntersectionPoint[];
    activeProposals: number;
    stats: typeof this.stats;
  } {
    return {
      intersections: Array.from(this.intersections.values()),
      activeProposals: Array.from(this.proposals.values()).filter((p) => p.status === 'pending')
        .length,
      stats: this.stats,
    };
  }

  /**
   * Get pending proposals for an intersection
   */
  getPendingProposals(intersectionId?: string): CrossCuttingProposal[] {
    const proposals = Array.from(this.proposals.values()).filter((p) => p.status === 'pending');
    if (intersectionId) {
      return proposals.filter((p) => p.intersectionId === intersectionId);
    }
    return proposals;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeProposals: this.getPendingProposals().length,
      totalProposals: this.proposals.size,
      intersectionCount: this.intersections.size,
    };
  }
}

export default IntersectionConsensusPoints;
