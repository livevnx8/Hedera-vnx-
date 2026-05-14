/**
 * Vera AI Module - Unified Exports
 * 
 * Fine-tuning, reasoning, multi-modal AI, and 4-Week Optimization System
 * 
 * @module ai
 */

// ═════════════════════════════════════════════════════════════════════════════
// 4-WEEK AI OPTIMIZATION SYSTEM (Weeks 1-4)
// ═════════════════════════════════════════════════════════════════════════════

// Week 1: Smart Routing & Response Caching
export { smartRouter, SmartModelRouter } from './smartRouter.js';
export { responseCache, ResponseCache } from './responseCache.js';

// Week 2: Tool Optimization & Parallel Processing
export { ToolOptimizer } from './toolOptimizer.js';
export { ParallelProcessor } from './parallelProcessor.js';

// Week 4: Integration & Monitoring
export { VeraAIIntegration, createVeraAI } from './veraAIIntegration.js';
export { MonitoringDashboard, createDashboard } from './monitoringDashboard.js';
export { VeraAIOptimizationLayer, createOptimizationLayer } from './veraIntegrationLayer.js';

// ═════════════════════════════════════════════════════════════════════════════
// EXISTING CAPABILITIES
// ═════════════════════════════════════════════════════════════════════════════

// Fine-tuning
export {
  UnslothTrainer,
  HederaDatasetCurator,
  unslothTrainer,
  datasetCurator,
  type UnslothConfig,
  type LoRAConfig,
  type TrainingConfig,
  type TrainingDataset,
  type TrainingProgress,
} from './fineTuning/unslothTrainer.js';

// Reasoning
export {
  ChainOfThoughtEngine,
  SelfConsistencyEngine,
  chainOfThought,
  selfConsistency,
  type ReasoningStep,
  type ChainOfThoughtResult,
  type Tool,
  type ToolCall,
} from './reasoning/chainOfThought.js';

// Re-export default
export { unslothTrainer as default } from './fineTuning/unslothTrainer.js';
