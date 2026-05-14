/**
 * Agent DAO Governance Module (Phase 14)
 * 
 * Self-governing organizations with liquid democracy,
 * reputation-weighted voting, and AI-generated proposals.
 */

export {
  AgentDAOContract,
  getAgentDAOContract
} from './agentDAO.js';

export {
  AIProposalEngine,
  getAIProposalEngine
} from './proposalEngine.js';

export type {
  AgentDAO,
  Proposal,
  ProposalType,
  ProposalStatus,
  Vote,
  VoteRecord,
  Delegation,
  VotingPower,
  NetworkInsights,
  ProposalDraft,
  SimulationResult,
  ExecutionResult
} from './types.js';
