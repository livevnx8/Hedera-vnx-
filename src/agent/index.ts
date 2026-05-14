/**
 * Vera Agent System - Main Exports
 * Consolidated exports for all agent modules
 */

// Core execution
export { executeTool } from './executor.js';

// Tool definitions
export {
  HEDERA_TOOL_DEFINITIONS,
  SAUCERSWAP_TOOL_DEFINITIONS,
  QVX_TOOL_DEFINITIONS,
  WEB_TOOL_DEFINITIONS,
  SMART_CONTRACT_TOOL_DEFINITIONS,
  MEMORY_TOOL_DEFINITIONS,
  SUB_AGENT_TOOL_DEFINITIONS,
  AGENT_KIT_TOOL_DEFINITIONS,
  STAKING_TOOL_DEFINITIONS,
  FILE_SERVICE_TOOL_DEFINITIONS,
  ADVANCED_TOKEN_TOOL_DEFINITIONS,
  ALL_TOOL_DEFINITIONS,
} from './definitions.js';

// Workflow engine
export {
  WorkflowOrchestrator,
  workflowOrchestrator,
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowContext,
  type WorkflowResult,
  type WorkflowStatus,
} from './workflowEngine.js';

// Domain-specific agents
export {
  VeraDomainAgent,
  AgentRegistry,
  agentRegistry,
  AGENT_CONFIGS,
  type AgentConfig,
  type AgentCapability,
  type AgentTask,
} from './domainAgents.js';

// Learning system
export {
  AgentLearningSystem,
  agentLearningSystem,
  type ToolUsageRecord,
  type SkillNode,
  type AgentPerformanceMetrics,
  type LearningRecommendation,
} from './learningSystem.js';

// Agent system integration
export {
  VeraAgentSystem,
  veraAgentSystem,
  type SystemStatus,
  type AgentSystemConfig,
} from './agentSystem.js';

// Lattice findings logger (HCS distributed logging)
export {
  LatticeFindingsLogger,
  latticeFindingsLogger,
  type Finding,
  type FindingBatch,
  type LatticeReference,
} from './latticeFindings.js';

// Sovereign agent system exports
export { AgentFactory, agentFactory } from './factory.js';
export { RecruitmentEngine, recruitmentEngine } from './recruitment.js';
