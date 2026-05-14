/**
 * VeraLattice Tools - Unified Exports
 * 
 * Central barrel file exporting all tools, registries, intelligence layer,
 * documentation, and testing utilities.
 */

// Core Types and Registry
export {
  type ToolDefinition,
  type ToolParameter,
  type ToolCategory,
  type ToolVersion,
  type ToolStats,
  ToolRegistry,
  getToolRegistry,
  resetToolRegistry,
} from './registry.js';

// Intelligence Layer
export {
  IntelligentToolRouter,
  type ToolContext,
  type ToolResult,
  type RetryOptions,
  type RateLimitBucket,
  type CircuitBreaker,
} from './intelligent/router.js';

export {
  ToolFallbacks,
  type FallbackStrategy,
} from './intelligent/fallback.js';

// Hedera Tools
export {
  getStakingInfo,
  updateStakedNode,
  claimStakingRewards,
  declineStakingRewards,
  getStakingNodes,
  stakingToolDefinitions,
} from './staking.js';

export {
  createFile,
  appendFile,
  getFileInfo,
  deleteFile,
  fileServiceToolDefinitions,
} from './fileService.js';

export {
  createProposal,
  castVote,
  finalizeProposal,
  executeProposal,
  getVotingPower,
  governanceToolDefinitions,
} from './governance.js';

export {
  approveHbarAllowance,
  approveTokenAllowance,
  approveNftAllowance,
  deleteHbarAllowance,
  deleteTokenAllowance,
  associateToken,
  dissociateToken,
  freezeToken,
  unfreezeToken,
  wipeTokens,
  pauseToken,
  unpauseToken,
  advancedTokenToolDefinitions,
} from './advancedTokens.js';

// Scheduling Tools
export {
  createScheduledTransfer,
  signScheduledTransaction,
  deleteScheduledTransaction,
  getScheduleInfo,
  createScheduledTopicMessage,
  scheduleToolDefinitions,
} from './scheduling.js';

// Documentation
export {
  DocumentationGenerator,
  type DocGeneratorOptions,
  type GeneratedDoc,
  createDocGenerator,
} from './docs/generator.js';

// Testing
export {
  ToolTestFramework,
  type TestCase,
  type TestSuite,
  type TestResult,
  type TestReport,
  type PerformanceResult,
  createTestFramework,
} from './testing/framework.js';

/**
 * Initialize all tools with the registry
 * 
 * This function registers all Hedera tools with the global tool registry,
 * making them available for discovery and execution.
 */
import { getToolRegistry, type ToolDefinition } from './registry.js';
import { stakingToolDefinitions } from './staking.js';
import { fileServiceToolDefinitions } from './fileService.js';
import { governanceToolDefinitions } from './governance.js';
import { advancedTokenToolDefinitions } from './advancedTokens.js';
import { scheduleToolDefinitions } from './scheduling.js';

export function initializeAllTools(): void {
  const registry = getToolRegistry();
  
  // Register all staking tools
  for (const def of stakingToolDefinitions as unknown[]) {
    registry.register(def as ToolDefinition);
  }
  
  // Register all file service tools
  for (const def of fileServiceToolDefinitions as unknown[]) {
    registry.register(def as ToolDefinition);
  }
  
  // Register all governance tools
  for (const def of governanceToolDefinitions as unknown[]) {
    registry.register(def as ToolDefinition);
  }
  
  // Register all advanced token tools
  for (const def of advancedTokenToolDefinitions as unknown[]) {
    registry.register(def as ToolDefinition);
  }
  
  // Register all scheduling tools
  for (const def of scheduleToolDefinitions as unknown[]) {
    registry.register(def as ToolDefinition);
  }
}

/**
 * Get tool statistics summary
 */
export function getToolsSummary(): {
  totalTools: number;
  categories: number;
  totalExecutions: number;
} {
  const registry = getToolRegistry();
  const stats = registry.getRegistryStats();
  
  return {
    totalTools: stats.totalTools,
    categories: stats.categories,
    totalExecutions: stats.totalExecutions,
  };
}
