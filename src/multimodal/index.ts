/**
 * Multi-Modal AI Module (Phase 15)
 * 
 * Vision, audio, video understanding and chain-of-thought reasoning.
 */

export {
  MultiModalEngine,
  getMultiModalEngine
} from './multimodalEngine.js';

export {
  ToolAugmentedAI,
  getToolAugmentedAI
} from './toolUse.js';

export type {
  ImageAnalysis,
  Transcription,
  AudioSynthesis,
  VideoSummary,
  ReasoningStep,
  ReasoningChain,
  ToolDefinition,
  ToolExecution,
  ToolExecutionResult,
  CodeExecution
} from './types.js';
