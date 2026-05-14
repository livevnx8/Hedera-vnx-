/**
 * Agent DAO Governance Types (Phase 14)
 * 
 * Type definitions for autonomous governance, liquid democracy,
 * and AI-generated proposals.
 */

export type ProposalType = 'treasury' | 'parameter' | 'upgrade' | 'membership' | 'general';
export type ProposalStatus = 'draft' | 'active' | 'passed' | 'rejected' | 'executed' | 'expired';
export type Vote = 'for' | 'against' | 'abstain';

export interface AgentDAO {
  daoId: string;
  name: string;
  description: string;
  createdAt: number;
  creator: string;
  members: string[]; // Agent IDs
  governanceToken?: string;
  treasury: Record<string, bigint>; // Asset ID -> Balance
  parameters: {
    quorum: number; // Percentage (0-100)
    votingPeriod: number; // seconds
    executionDelay: number; // seconds
    proposalThreshold: number; // Minimum voting power to create proposal
  };
  reputationWeight: number; // 0-1, how much reputation affects voting power
  stakeWeight: number; // 0-1, how much stake affects voting power
}

export interface Proposal {
  proposalId: string;
  daoId: string;
  type: ProposalType;
  title: string;
  description: string;
  status: ProposalStatus;
  proposer: string;
  createdAt: number;
  votingEndsAt: number;
  executionTime?: number;
  data: unknown; // Proposal-specific data
  votes: {
    for: bigint;
    against: bigint;
    abstain: bigint;
  };
  voterCount: number;
  executedAt?: number;
  executionResult?: unknown;
}

export interface VoteRecord {
  proposalId: string;
  voter: string;
  decision: Vote;
  votingPower: number;
  timestamp: number;
  delegatedFrom?: string[]; // Agents who delegated to this voter
}

export interface Delegation {
  delegator: string;
  delegate: string;
  percentage: number; // 0-100
  topic?: ProposalType; // Optional: delegation only for specific proposal types
  active: boolean;
  createdAt: number;
  expiresAt?: number;
}

export interface VotingPower {
  agentId: string;
  reputationScore: number;
  stakedAmount: bigint;
  reputationPower: number;
  stakePower: number;
  delegatedPower: number; // Power received from others
  totalPower: number;
}

export interface NetworkInsights {
  timestamp: number;
  metrics: {
    totalAgents: number;
    activeAgents: number;
    avgLoad: number;
    networkLatency: number;
    transactionVolume: bigint;
  };
  anomalies: string[];
  recommendations: string[];
}

export interface ProposalDraft {
  type: ProposalType;
  title: string;
  description: string;
  rationale: string;
  expectedImpact: {
    metric: string;
    currentValue: number;
    projectedValue: number;
    confidence: number;
  }[];
  data: unknown;
}

export interface SimulationResult {
  proposalId: string;
  simulated: boolean;
  success: boolean;
  outcomes: {
    metric: string;
    before: number;
    after: number;
    delta: number;
  }[];
  riskScore: number; // 0-100
  recommendations: string[];
}

export interface ExecutionResult {
  proposalId: string;
  executed: boolean;
  executor: string;
  executedAt: number;
  txHash?: string;
  result: unknown;
  error?: string;
}
