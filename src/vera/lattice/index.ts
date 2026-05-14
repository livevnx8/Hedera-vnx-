/**
 * Vera Lattice - Field Implementations
 * Specialized reasoning fields for different domains
 */

export { VeraLatticeManager, latticeManager } from './core/LatticeManager.js';
export { ReasoningFieldImpl, LatticeNodeImpl } from './core/LatticeField.js';

// Specialized field implementations
export { EconomicField, economicField } from './fields/EconomicField.js';
export { SecurityField, securityField } from './fields/SecurityField.js';
export { PerformanceField, performanceField } from './fields/PerformanceField.js';

// Cross-field reasoning
export { 
  CrossFieldReasoning, 
  crossFieldReasoning, 
  initializeCrossFieldReasoning,
  type AgentMultiFieldScore,
  type CrossFieldDecision,
  type FieldScore 
} from './CrossFieldReasoning.js';

// Field implementations will be exported here
export * from '../types/index.js';
