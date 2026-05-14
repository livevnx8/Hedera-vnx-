/**
 * Agent DAO Governance (Phase 14)
 * 
 * Self-governing organizations with liquid democracy,
 * reputation-weighted voting, and autonomous execution.
 */

import { logger } from '../monitoring/logger.js';
import type { 
  AgentDAO, 
  Proposal, 
  ProposalType, 
  Vote, 
  VoteRecord,
  Delegation,
  VotingPower,
  ExecutionResult 
} from './types.js';

interface DAOConfig {
  hederaTopicId: string;
  minQuorum: number;
  defaultVotingPeriod: number;
  executionDelay: number;
}

export class AgentDAOContract {
  private config: DAOConfig;
  private daos: Map<string, AgentDAO> = new Map();
  private proposals: Map<string, Proposal> = new Map();
  private votes: Map<string, VoteRecord[]> = new Map(); // proposalId -> votes
  private delegations: Map<string, Delegation[]> = new Map(); // delegator -> delegations
  private votingPower: Map<string, VotingPower> = new Map(); // agentId -> power
  private executionHistory: ExecutionResult[] = [];

  constructor(config: Partial<DAOConfig> = {}) {
    this.config = {
      hederaTopicId: '0.0.dao',
      minQuorum: 20, // 20%
      defaultVotingPeriod: 86400, // 24 hours
      executionDelay: 3600, // 1 hour
      ...config
    };
  }

  /**
   * Create a new Agent DAO
   */
  async createDAO(
    name: string,
    description: string,
    creator: string,
    initialMembers: string[],
    parameters?: Partial<AgentDAO['parameters']>
  ): Promise<AgentDAO> {
    const daoId = `dao-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    const dao: AgentDAO = {
      daoId,
      name,
      description,
      createdAt: Date.now(),
      creator,
      members: [creator, ...initialMembers],
      treasury: {},
      parameters: {
        quorum: parameters?.quorum ?? 30,
        votingPeriod: parameters?.votingPeriod ?? this.config.defaultVotingPeriod,
        executionDelay: parameters?.executionDelay ?? this.config.executionDelay,
        proposalThreshold: parameters?.proposalThreshold ?? 100
      },
      reputationWeight: 0.6,
      stakeWeight: 0.4
    };

    this.daos.set(daoId, dao);

    // Initialize voting power for members
    initialMembers.forEach(member => this.calculateVotingPower(member));

    logger.info('AgentDAO', {
      message: 'DAO created',
      daoId,
      name,
      memberCount: dao.members.length
    });

    return dao;
  }

  /**
   * Create a proposal
   */
  async createProposal(
    daoId: string,
    type: ProposalType,
    title: string,
    description: string,
    proposer: string,
    data: unknown
  ): Promise<Proposal> {
    const dao = this.daos.get(daoId);
    if (!dao) {
      throw new Error('DAO not found');
    }

    // Check if proposer has enough voting power
    const proposerPower = this.getVotingPower(proposer);
    if (proposerPower.totalPower < dao.parameters.proposalThreshold) {
      throw new Error('Insufficient voting power to create proposal');
    }

    const proposalId = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const proposal: Proposal = {
      proposalId,
      daoId,
      type,
      title,
      description,
      status: 'active',
      proposer,
      createdAt: now,
      votingEndsAt: now + dao.parameters.votingPeriod * 1000,
      data,
      votes: { for: BigInt(0), against: BigInt(0), abstain: BigInt(0) },
      voterCount: 0
    };

    this.proposals.set(proposalId, proposal);
    this.votes.set(proposalId, []);

    logger.info('AgentDAO', {
      message: 'Proposal created',
      proposalId,
      daoId,
      type,
      proposer
    });

    return proposal;
  }

  /**
   * Vote on a proposal
   */
  async vote(
    proposalId: string,
    voter: string,
    decision: Vote,
    votingPower?: number
  ): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    if (proposal.status !== 'active') {
      throw new Error('Proposal is not active');
    }

    if (Date.now() > proposal.votingEndsAt) {
      throw new Error('Voting period has ended');
    }

    // Get voting power
    const power = votingPower ?? this.getVotingPower(voter).totalPower;

    // Check for existing vote
    const existingVotes = this.votes.get(proposalId) || [];
    const existingIndex = existingVotes.findIndex(v => v.voter === voter);

    if (existingIndex !== -1) {
      // Update existing vote
      const oldVote = existingVotes[existingIndex];
      proposal.votes[oldVote.decision] -= BigInt(oldVote.votingPower);
      existingVotes[existingIndex] = {
        proposalId,
        voter,
        decision,
        votingPower: power,
        timestamp: Date.now()
      };
    } else {
      // New vote
      existingVotes.push({
        proposalId,
        voter,
        decision,
        votingPower: power,
        timestamp: Date.now()
      });
      proposal.voterCount++;
    }

    // Update vote totals
    proposal.votes[decision] += BigInt(power);
    this.votes.set(proposalId, existingVotes);
    this.proposals.set(proposalId, proposal);

    logger.info('AgentDAO', {
      message: 'Vote recorded',
      proposalId,
      voter,
      decision,
      power
    });

    // Check if voting period ended and resolve
    if (Date.now() >= proposal.votingEndsAt) {
      await this.resolveProposal(proposalId);
    }
  }

  /**
   * Delegate voting power
   */
  async delegateVotingPower(
    from: string,
    to: string,
    percentage: number,
    topic?: ProposalType
  ): Promise<void> {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Percentage must be between 0 and 100');
    }

    const delegations = this.delegations.get(from) || [];
    
    // Remove existing delegation to same target if exists
    const existingIndex = delegations.findIndex(d => d.delegate === to && d.topic === topic);
    if (existingIndex !== -1) {
      delegations.splice(existingIndex, 1);
    }

    delegations.push({
      delegator: from,
      delegate: to,
      percentage,
      topic,
      active: true,
      createdAt: Date.now()
    });

    this.delegations.set(from, delegations);

    // Recalculate voting power
    this.calculateVotingPower(from);
    this.calculateVotingPower(to);

    logger.info('AgentDAO', {
      message: 'Voting power delegated',
      from,
      to,
      percentage,
      topic: topic || 'all'
    });
  }

  /**
   * Get voting power for an agent
   */
  getVotingPower(agentId: string): VotingPower {
    return this.votingPower.get(agentId) || {
      agentId,
      reputationScore: 0,
      stakedAmount: BigInt(0),
      reputationPower: 0,
      stakePower: 0,
      delegatedPower: 0,
      totalPower: 0
    };
  }

  /**
   * Execute a passed proposal
   */
  async executeProposal(proposalId: string, executor: string): Promise<ExecutionResult> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    if (proposal.status !== 'passed') {
      throw new Error('Proposal must be passed to execute');
    }

    if (proposal.executionTime && Date.now() < proposal.executionTime) {
      throw new Error('Execution delay not yet passed');
    }

    try {
      // Execute proposal data
      const result = await this.executeProposalData(proposal);

      proposal.status = 'executed';
      proposal.executedAt = Date.now();
      proposal.executionResult = result;
      this.proposals.set(proposalId, proposal);

      const executionResult: ExecutionResult = {
        proposalId,
        executed: true,
        executor,
        executedAt: Date.now(),
        result
      };

      this.executionHistory.push(executionResult);

      logger.info('AgentDAO', {
        message: 'Proposal executed',
        proposalId,
        executor,
        type: proposal.type
      });

      return executionResult;

    } catch (error) {
      const failedResult: ExecutionResult = {
        proposalId,
        executed: false,
        executor,
        executedAt: Date.now(),
        result: null,
        error: error instanceof Error ? error.message : String(error)
      };

      this.executionHistory.push(failedResult);
      throw error;
    }
  }

  /**
   * Get DAO by ID
   */
  getDAO(daoId: string): AgentDAO | undefined {
    return this.daos.get(daoId);
  }

  /**
   * Get proposal by ID
   */
  getProposal(proposalId: string): Proposal | undefined {
    return this.proposals.get(proposalId);
  }

  /**
   * Get all proposals for a DAO
   */
  getDAOProposals(daoId: string): Proposal[] {
    return Array.from(this.proposals.values()).filter(p => p.daoId === daoId);
  }

  /**
   * Get active proposals
   */
  getActiveProposals(): Proposal[] {
    return Array.from(this.proposals.values()).filter(p => p.status === 'active');
  }

  /**
   * Get delegation info
   */
  getDelegations(agentId: string): Delegation[] {
    return this.delegations.get(agentId) || [];
  }

  /**
   * Get DAO statistics
   */
  getStats() {
    const daos = Array.from(this.daos.values());
    const proposals = Array.from(this.proposals.values());

    return {
      timestamp: Date.now(),
      totalDAOs: daos.length,
      totalProposals: proposals.length,
      activeProposals: proposals.filter(p => p.status === 'active').length,
      executedProposals: proposals.filter(p => p.status === 'executed').length,
      totalMembers: daos.reduce((sum, d) => sum + d.members.length, 0),
      totalDelegations: Array.from(this.delegations.values()).reduce((sum, d) => sum + d.length, 0),
      recentExecutions: this.executionHistory.slice(-10)
    };
  }

  // Private methods
  private calculateVotingPower(agentId: string): VotingPower {
    // Mock reputation and stake data
    const reputationScore = Math.random() * 100;
    const stakedAmount = BigInt(Math.floor(Math.random() * 10000));

    // Calculate power from delegations
    let delegatedPower = 0;
    for (const [delegator, dels] of this.delegations) {
      for (const del of dels) {
        if (del.delegate === agentId && del.active) {
          const delegatorPower = this.getVotingPower(delegator);
          delegatedPower += (delegatorPower.totalPower * del.percentage) / 100;
        }
      }
    }

    // Apply weights (would come from DAO config in real implementation)
    const reputationPower = reputationScore * 0.6;
    const stakePower = Number(stakedAmount) * 0.4;
    const totalPower = reputationPower + stakePower + delegatedPower;

    const power: VotingPower = {
      agentId,
      reputationScore,
      stakedAmount,
      reputationPower,
      stakePower,
      delegatedPower,
      totalPower
    };

    this.votingPower.set(agentId, power);
    return power;
  }

  private async resolveProposal(proposalId: string): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'active') return;

    const dao = this.daos.get(proposal.daoId);
    if (!dao) return;

    const totalVotes = proposal.votes.for + proposal.votes.against + proposal.votes.abstain;
    const forPercentage = Number(proposal.votes.for) / Number(totalVotes) * 100;

    // Check quorum
    const quorumMet = Number(totalVotes) >= (dao.members.length * dao.parameters.quorum);

    if (quorumMet && forPercentage > 50) {
      proposal.status = 'passed';
      proposal.executionTime = Date.now() + dao.parameters.executionDelay * 1000;
      
      logger.info('AgentDAO', {
        message: 'Proposal passed',
        proposalId,
        forPercentage: forPercentage.toFixed(2),
        quorumMet
      });

      // Auto-execute after delay (in real implementation)
      setTimeout(() => {
        this.executeProposal(proposalId, 'autonomous-executor').catch(console.error);
      }, dao.parameters.executionDelay * 1000);

    } else {
      proposal.status = 'rejected';
      
      logger.info('AgentDAO', {
        message: 'Proposal rejected',
        proposalId,
        forPercentage: forPercentage.toFixed(2),
        quorumMet
      });
    }

    this.proposals.set(proposalId, proposal);
  }

  private async executeProposalData(proposal: Proposal): Promise<unknown> {
    // Mock execution based on proposal type
    switch (proposal.type) {
      case 'treasury':
        return { action: 'transfer', amount: 'executed' };
      case 'parameter':
        return { action: 'update-params', params: proposal.data };
      case 'upgrade':
        return { action: 'upgrade-contract', version: '2.0' };
      case 'membership':
        return { action: 'update-members', members: proposal.data };
      default:
        return { action: 'general', data: proposal.data };
    }
  }
}

// Singleton
let daoInstance: AgentDAOContract | null = null;

export function getAgentDAOContract(config?: Partial<DAOConfig>): AgentDAOContract {
  if (!daoInstance) {
    daoInstance = new AgentDAOContract(config);
  }
  return daoInstance;
}
