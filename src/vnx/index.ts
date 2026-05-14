/**
 * VNX (Vera Nexum) Framework - Index
 * 
 * Sovereign Validation Agent architecture for Hedera
 * Moving from "Brain without a Body" to "Verifiable Research & Audit"
 */

// DID Identity System
export { VNXDIDManager } from './didManager.js';
export type { DIDDocument, VNXIdentity } from './didManager.js';

// Validation Workflow (Ingestion → Analysis → Attestation)
export { VNXValidationWorkflow } from './validationWorkflow.js';
export type { 
  VNXIngestionData, 
  VNXAnalysisResult, 
  VNXAttestation 
} from './validationWorkflow.js';

// PJM Grid Data Service
export { PJMGridService } from './pjmGridService.js';
export type { PJMNode, PJMEmissionData } from './pjmGridService.js';

// VNX-LM swarm prompt context
export {
  VNX_SWARM_MODELS,
  buildVnxSwarmPromptContext,
  listVnxSwarmModels,
  selectVnxSwarmSpecialists,
} from './swarmPromptContext.js';
export type {
  VnxSwarmModelMeta,
  VnxSwarmOutput,
  VnxSwarmPromptContext,
  VnxSwarmSelection,
} from './swarmPromptContext.js';

// VNX-LM swarm evaluation and promotion gates
export {
  VNX_SWARM_EVAL_CASES,
  deriveVnxSwarmRouteWeights,
  evaluateVnxSwarmSelection,
  runVnxSwarmEvaluation,
  runVnxSwarmSelectionEvaluation,
} from './swarmEvaluation.js';
export type {
  VnxSwarmEvalCase,
  VnxSwarmEvalCaseResult,
  VnxSwarmEvalReport,
  VnxSwarmSpecialistStats,
} from './swarmEvaluation.js';

// VNX lattice workflow planning
export {
  planVnxLatticeWorkflow,
} from './latticeWorkflowPlanner.js';
export type {
  VnxLatticeWorkflowPlan,
  VnxLearningHook,
  VnxWorkflowLane,
  VnxWorkflowMode,
  VnxWorkflowStage,
} from './latticeWorkflowPlanner.js';

// Topic IDs for VNX System
export const VNX_TOPICS = {
  BRAINSTEM: '0.0.10409351',  // Identity / DID
  LUNGS: '0.0.10409353',      // Analysis
  NERVES: '0.0.10409354',     // Ingestion
  MEMORY: '0.0.10409355'      // Attestation / VC
} as const;

// Account ID for Vera
export const VERA_ACCOUNT = '0.0.10294360';
