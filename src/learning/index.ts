/**
 * Vera Learning System - Unified Exports
 * 
 * Complete knowledge management and learning infrastructure:
 * 
 * 1. HCS Brain Retrieval - Query historical HCS messages from mirror nodes
 * 2. Vector Sync - Semantic search with embeddings (Pinecone/pgvector/memory)
 * 3. Knowledge Graph - Connected memories, patterns, and concepts
 * 4. Predictive Memory - Pre-fetch relevant knowledge before user asks
 * 5. Implementation Patterns - Log and retrieve reusable solutions
 * 6. Knowledge Health - Monitor and auto-remediate knowledge quality
 * 7. Knowledge Federation - Multi-instance learning without sharing raw data
 * 8. NVIDIA Acceleration - GPU-accelerated graph analytics (optional)
 * 
 * All modules work standalone or together for comprehensive AI knowledge.
 */

// Core knowledge retrieval
export { hcsBrainRetrieval, RetrievedMemory, HCSBrainRetrieval } from './hcsBrainRetrieval.js';

// Vector database sync
export { hcsVectorSync, SemanticQueryResult, VectorDBConfig } from './hcsVectorSync.js';

// Knowledge graph
export { 
  knowledgeGraph, 
  KnowledgeNode, 
  KnowledgeEdge,
  KnowledgeGraph 
} from './knowledgeGraph.js';

// Predictive memory
export { predictiveMemory, PredictedMemory, PredictiveMemory } from './predictiveMemory.js';

// Implementation patterns
export { 
  implementationPatterns, 
  ImplementationPattern,
  PatternCategory
} from './implementationPatterns.js';

// Knowledge health monitoring
export { knowledgeHealth, KnowledgeHealthMonitor } from './knowledgeHealth.js';

// Knowledge federation
export { 
  knowledgeFederation, 
  KnowledgeFederation,
  KnowledgeDigest
} from './knowledgeFederation.js';

// NVIDIA GPU acceleration (optional)
export { 
  nvidiaKnowledgeAcceleration,
  NvidiaKnowledgeAcceleration
} from './nvidiaKnowledgeAcceleration.js';

// NVIDIA FLARE integration (optional)
export {
  nvidiaFlare,
  NvidiaFlareIntegration
} from './nvidiaFlareIntegration.js';

// GPU configuration
export {
  gpuConfigurator,
  GPUConfig,
  RTX4060TI_CONFIG,
  CPU_CONFIG
} from './gpuConfig.js';

// Vera Hedera Assistant (from hedera module)
export {
  veraHederaAssistant,
  VeraHederaAssistant
} from '../hedera/veraHederaAssistant.js';

/**
 * Quick start example:
 * 
 * ```typescript
 * import { 
 *   hcsBrainRetrieval,
 *   knowledgeGraph,
 *   implementationPatterns 
 * } from './learning/index.js';
 * 
 * // Retrieve memories
 * const memories = await hcsBrainRetrieval.retrieveContextualMemories({
 *   query: 'HTS token creation',
 *   limit: 10
 * });
 * 
 * // Add to knowledge graph
 * for (const memory of memories) {
 *   await knowledgeGraph.addMemory(memory);
 * }
 * 
 * // Find implementation patterns
 * const patterns = await implementationPatterns.findPatterns({
 *   category: 'token_creation',
 *   limit: 5
 * });
 * ```
 */
