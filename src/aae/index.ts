/**
 * Autonomous Agent Economy (AAE) - Phase 8
 * 
 * Self-sustaining agent marketplace with A2A payments,
 * reputation tracking, service discovery, and autonomous
 * value exchange between AI agents.
 */

export { 
  AgentMarketplace,
  getAgentMarketplace 
} from './marketplace.js';

export { 
  A2APaymentSystem,
  getA2APaymentSystem 
} from './a2aPayments.js';

export { 
  AgentReputation,
  getAgentReputation 
} from './reputation.js';

export { 
  ServiceDiscovery,
  getServiceDiscovery 
} from './serviceDiscovery.js';

export type {
  AgentListing,
  ServiceOffer,
  A2ATransaction,
  ReputationScore,
  ServiceQuery,
  EscrowRecord,
  Review
} from './types.js';
