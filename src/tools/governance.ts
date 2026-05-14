/**
 * Hedera Governance & DAO Tools
 * 
 * Tools for creating and managing DAO governance proposals using HCS topics.
 * Includes proposal creation, voting, and execution tracking.
 */

import { logger } from '../monitoring/logger.js';

export interface GovernanceProposal {
  id: string;
  topicId: string;
  title: string;
  description: string;
  creator: string;
  votingToken: string;
  startTime: Date;
  endTime: Date;
  quorum: number; // Minimum participation %
  threshold: number; // Pass threshold %
  status: 'pending' | 'active' | 'passed' | 'failed' | 'executed';
  votes: {
    for: number;
    against: number;
    abstain: number;
  };
  voters: Array<{
    accountId: string;
    vote: 'FOR' | 'AGAINST' | 'ABSTAIN';
    votingPower: number;
    timestamp: Date;
  }>;
  executionData?: string; // Encoded transaction data
}

export interface VoteCast {
  proposalId: string;
  voter: string;
  vote: 'FOR' | 'AGAINST' | 'ABSTAIN';
  votingPower: number;
  timestamp: Date;
  txId?: string;
}

/**
 * Create a new governance proposal
 * Creates an HCS topic for the proposal and returns the proposal structure
 */
export async function createProposal(
  options: {
    title: string;
    description: string;
    creator: string;
    votingToken: string;
    votingDuration: number; // in hours
    quorum: number; // 0-100
    threshold: number; // 0-100
    executionData?: string;
  }
): Promise<{ success: boolean; proposal?: GovernanceProposal; error?: string }> {
  try {
    const now = new Date();
    const endTime = new Date(now.getTime() + options.votingDuration * 60 * 60 * 1000);

    // In production, this would create an HCS topic
    // For now, we simulate with a generated ID
    const topicId = `0.0.${Math.floor(Math.random() * 1000000 + 100000)}`;
    const proposalId = `prop-${Date.now()}`;

    const proposal: GovernanceProposal = {
      id: proposalId,
      topicId,
      title: options.title,
      description: options.description,
      creator: options.creator,
      votingToken: options.votingToken,
      startTime: now,
      endTime,
      quorum: options.quorum,
      threshold: options.threshold,
      status: now.getTime() >= endTime.getTime() ? 'active' : 'pending',
      votes: { for: 0, against: 0, abstain: 0 },
      voters: [],
      executionData: options.executionData,
    };

    logger.info('Governance', { 
      message: 'Proposal created', 
      proposalId,
      title: options.title,
      creator: options.creator,
    });

    return { success: true, proposal };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Governance', { message: 'Failed to create proposal', error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Cast a vote on a proposal
 */
export async function castVote(
  proposal: GovernanceProposal,
  options: {
    voter: string;
    vote: 'FOR' | 'AGAINST' | 'ABSTAIN';
    votingPower: number;
    txId?: string;
  }
): Promise<{ success: boolean; proposal?: GovernanceProposal; error?: string }> {
  try {
    const now = new Date();

    // Check if voting is active
    if (now < proposal.startTime) {
      return { success: false, error: 'Voting has not started yet' };
    }

    if (now > proposal.endTime) {
      return { success: false, error: 'Voting period has ended' };
    }

    // Check if voter already voted
    const existingVote = proposal.voters.find(v => v.accountId === options.voter);
    if (existingVote) {
      return { success: false, error: 'Account has already voted on this proposal' };
    }

    // Record the vote
    const voteRecord = {
      accountId: options.voter,
      vote: options.vote,
      votingPower: options.votingPower,
      timestamp: now,
      txId: options.txId,
    };

    proposal.voters.push(voteRecord);

    // Update vote totals
    switch (options.vote) {
      case 'FOR':
        proposal.votes.for += options.votingPower;
        break;
      case 'AGAINST':
        proposal.votes.against += options.votingPower;
        break;
      case 'ABSTAIN':
        proposal.votes.abstain += options.votingPower;
        break;
    }

    logger.info('Governance', { 
      message: 'Vote cast', 
      proposalId: proposal.id,
      voter: options.voter,
      vote: options.vote,
      power: options.votingPower,
    });

    return { success: true, proposal };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Governance', { message: 'Failed to cast vote', error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Get proposal results and finalize
 */
export async function finalizeProposal(
  proposal: GovernanceProposal,
  totalSupply: number // Total supply of voting token
): Promise<{ success: boolean; proposal?: GovernanceProposal; passed?: boolean; error?: string }> {
  try {
    const now = new Date();

    // Check if voting period has ended
    if (now <= proposal.endTime && proposal.status !== 'active') {
      return { success: false, error: 'Voting period has not ended yet' };
    }

    // Calculate participation
    const totalVotes = proposal.votes.for + proposal.votes.against + proposal.votes.abstain;
    const participation = totalSupply > 0 ? (totalVotes / totalSupply) * 100 : 0;

    // Check quorum
    if (participation < proposal.quorum) {
      proposal.status = 'failed';
      logger.info('Governance', { 
        message: 'Proposal failed - quorum not met', 
        proposalId: proposal.id,
        participation,
        quorum: proposal.quorum,
      });
      return { success: true, proposal, passed: false };
    }

    // Calculate pass/fail (excluding abstain)
    const decisiveVotes = proposal.votes.for + proposal.votes.against;
    const forPercentage = decisiveVotes > 0 ? (proposal.votes.for / decisiveVotes) * 100 : 0;

    if (forPercentage >= proposal.threshold) {
      proposal.status = 'passed';
      logger.info('Governance', { 
        message: 'Proposal passed', 
        proposalId: proposal.id,
        forPercentage,
        threshold: proposal.threshold,
      });
      return { success: true, proposal, passed: true };
    } else {
      proposal.status = 'failed';
      logger.info('Governance', { 
        message: 'Proposal failed - threshold not met', 
        proposalId: proposal.id,
        forPercentage,
        threshold: proposal.threshold,
      });
      return { success: true, proposal, passed: false };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Governance', { message: 'Failed to finalize proposal', error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Execute a passed proposal
 */
export async function executeProposal(
  proposal: GovernanceProposal,
  executor: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    if (proposal.status !== 'passed') {
      return { success: false, error: 'Proposal must be passed before execution' };
    }

    if (!proposal.executionData) {
      return { success: false, error: 'No execution data attached to proposal' };
    }

    // In production, this would execute the transaction encoded in executionData
    // For now, simulate
    const txId = `0.0.${Math.floor(Math.random() * 1000000)}@${Date.now()}`;
    proposal.status = 'executed';

    logger.info('Governance', { 
      message: 'Proposal executed', 
      proposalId: proposal.id,
      executor,
      txId,
    });

    return { success: true, txId };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Governance', { message: 'Failed to execute proposal', error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Get voting power for an account
 * In production, this would query token balances or delegated stakes
 */
export async function getVotingPower(
  accountId: string,
  votingToken: string
): Promise<{ success: boolean; power?: number; error?: string }> {
  try {
    // Simulate - in production, query token balance
    // This would integrate with HTS tools
    const simulatedPower = Math.floor(Math.random() * 10000);

    return { success: true, power: simulatedPower };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Tool definitions for governance operations
 */
export const governanceToolDefinitions = [
  {
    name: 'dao_create_proposal',
    description: 'Create a new DAO governance proposal with HCS topic for on-chain voting. Returns proposal ID and topic ID.',
    parameters: {
      type: 'object',
      properties: {
        title: { 
          type: 'string', 
          description: 'Proposal title - clear and concise' 
        },
        description: { 
          type: 'string', 
          description: 'Detailed proposal description with rationale' 
        },
        creator: { 
          type: 'string', 
          description: 'Creator Hedera account ID' 
        },
        voting_token: { 
          type: 'string', 
          description: 'Token ID used for voting power calculation' 
        },
        voting_duration_hours: { 
          type: 'number', 
          description: 'How long voting remains open (default 72 hours)' 
        },
        quorum: { 
          type: 'number', 
          description: 'Minimum participation % for valid vote (default 10%)' 
        },
        threshold: { 
          type: 'number', 
          description: 'Pass threshold % (default 51%)' 
        },
        execution_data: { 
          type: 'string', 
          description: 'Optional: encoded transaction to execute if passed' 
        },
      },
      required: ['title', 'description', 'creator', 'voting_token'],
    },
  },
  {
    name: 'dao_cast_vote',
    description: 'Cast a vote on an active governance proposal. Requires holding voting token.',
    parameters: {
      type: 'object',
      properties: {
        proposal_id: { 
          type: 'string', 
          description: 'Proposal ID to vote on' 
        },
        voter: { 
          type: 'string', 
          description: 'Voting account ID' 
        },
        vote: { 
          type: 'string', 
          enum: ['FOR', 'AGAINST', 'ABSTAIN'],
          description: 'Vote choice' 
        },
        voting_power: { 
          type: 'number', 
          description: 'Voting power (token balance or delegated stake)' 
        },
      },
      required: ['proposal_id', 'voter', 'vote', 'voting_power'],
    },
  },
  {
    name: 'dao_get_proposal',
    description: 'Get proposal details including current votes, status, and voter list.',
    parameters: {
      type: 'object',
      properties: {
        proposal_id: { 
          type: 'string', 
          description: 'Proposal ID to query' 
        },
      },
      required: ['proposal_id'],
    },
  },
  {
    name: 'dao_finalize_proposal',
    description: 'Finalize a proposal after voting period ends. Calculates results and updates status.',
    parameters: {
      type: 'object',
      properties: {
        proposal_id: { 
          type: 'string', 
          description: 'Proposal ID to finalize' 
        },
        total_supply: { 
          type: 'number', 
          description: 'Total supply of voting token for quorum calculation' 
        },
      },
      required: ['proposal_id', 'total_supply'],
    },
  },
  {
    name: 'dao_execute_proposal',
    description: 'Execute a passed proposal. Requires admin key or meeting execution threshold.',
    parameters: {
      type: 'object',
      properties: {
        proposal_id: { 
          type: 'string', 
          description: 'Passed proposal ID to execute' 
        },
        executor: { 
          type: 'string', 
          description: 'Account executing the proposal' 
        },
      },
      required: ['proposal_id', 'executor'],
    },
  },
  {
    name: 'dao_get_voting_power',
    description: 'Get voting power for an account based on token holdings and delegations.',
    parameters: {
      type: 'object',
      properties: {
        account_id: { 
          type: 'string', 
          description: 'Account to check' 
        },
        voting_token: { 
          type: 'string', 
          description: 'Voting token ID' 
        },
      },
      required: ['account_id', 'voting_token'],
    },
  },
];

/**
 * DAO storage - in production, this would be HCS or database
 */
class DAOStorage {
  private proposals: Map<string, GovernanceProposal> = new Map();

  save(proposal: GovernanceProposal): void {
    this.proposals.set(proposal.id, proposal);
  }

  get(id: string): GovernanceProposal | undefined {
    return this.proposals.get(id);
  }

  list(): GovernanceProposal[] {
    return Array.from(this.proposals.values());
  }

  getActive(): GovernanceProposal[] {
    return this.list().filter(p => p.status === 'active');
  }

  getPending(): GovernanceProposal[] {
    return this.list().filter(p => p.status === 'pending');
  }
}

export const daoStorage = new DAOStorage();
