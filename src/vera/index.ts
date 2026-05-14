/**
 * Vera Next Big Phases - Module Exports
 * Central export point for all new components
 */

// Types
export * from './types/index.js';

export { ReasoningFieldImpl, LatticeNodeImpl } from './lattice/core/LatticeField.js';
export { verificationLattice, VerificationLattice } from './lattice/fields/VerificationLattice.js';

// Orchestrator Integration
export { latticeOrchestrator, LatticeOrchestratorIntegration } from './orchestrator/latticeIntegration.js';
export { featureFlags } from './orchestrator/featureFlags.js';

// Payment Systems
export { enhancedSettlement, EnhancedX402Settlement, CircuitBreaker } from './payments/enhancedX402Settlement.js';
export { streamManager, PaymentStreamManager } from './payments/streaming.js';
export { batchSettlementEngine, AsyncBatchSettlementEngine } from './payments/asyncBatchSettlement.js';
export { MultiCurrencyHandler } from './payments/multiCurrency.js';

// Sub-Agents
export { SubAgent, createSubAgent } from './agents/sub-agents/index.js';

// Scaling
export { createAdaptiveScheduler, AdaptiveScheduler } from './scaling/adaptiveScheduler.js';
export { PredictiveAgentScaler } from './scaling/predictiveScaler.js';
export { AgentWarmPool } from './scaling/agentWarmPool.js';

// Consensus
export { ConsensusEngine } from './orchestrator/consensusEngine.js';

// Enterprise
export { SLAManager, SLA_POLICIES } from './enterprise/slaManager.js';

// Logging
export { QueueHCSLogger, createHCSLogger } from './logging/queueHCSLogger.js';
export { OptimizedHCSBatchLogger, createOptimizedHCSLogger } from './logging/optimizedHCSBatchLogger.js';

// Proof Kernel - Quantum Parallel System
export {
  quantumProofProcessor,
  QuantumProofProcessor,
  type QuantumProofConfig,
  type QuantumProofResult,
} from './proofKernel/quantumIntegration.js';

// Proof Kernel - Flower of Life Lattice Integration
export {
  latticeProofIntegrator,
  LatticeProofIntegrator,
  type LatticeProofConfig,
  type LatticeEnhancedProof,
  type LatticeProofMetrics,
} from './proofKernel/latticeProofIntegration.js';

// Proof Kernel - Main
export {
  VerifiableAIProofKernel,
  verifiableAIProofKernel,
  type ProofKernelOptions,
} from './proofKernel/proofKernel.js';

// Proof Kernel - Shadow Council Ensemble
export {
  shadowCouncil,
  ShadowCouncil,
  type EnsembleScore,
  type MeridianInstance,
  type ConsensusConfig,
} from './proofKernel/shadowCouncil.js';

// Notifications
export {
  slackNotifier,
  SlackNotifier,
  type NotificationPayload,
  type EscalationAlert,
  type TrainingAlert,
  type SystemHealthAlert,
} from './notifications/slackNotifier.js';

// Enterprise Heartbeat System (HIP-993 Smart Delta)
export {
  EnterpriseHeartbeatManager,
  enterpriseHeartbeat,
  CapabilityRegistry,
  capabilityRegistry,
  CapabilityDiscovery,
  capabilityDiscovery,
  HEARTBEAT_VERSION,
  MAX_MESSAGE_SIZE,
  DEFAULT_MINIMAL_INTERVAL_MS,
  DEFAULT_FULL_INTERVAL_MS,
  FULL_HEARTBEAT_EVERY_N,
} from './heartbeat/index.js';
export type {
  EnterpriseCapabilities,
  HeartbeatConfig,
  HeartbeatMessage,
  CostStats,
  CapabilityQuery,
  DiscoveredNode,
  DiscoveryResult,
} from './heartbeat/index.js';

// Disaster Recovery
export { disasterRecovery, DisasterRecoveryManager, FailoverOrchestrator } from './disaster-recovery/index.js';

// Task Chains
export { taskChainEngine, TaskChainEngine } from './orchestrator/taskChainEngine.js';

// Negotiation Protocol
export { negotiationProtocol, NegotiationProtocol } from './orchestrator/negotiationProtocol.js';

// Fiat On-Ramp
export { fiatOnramp, FiatOnramp } from './payments/fiatOnramp.js';

// Security
export { hmacVerifier, HMACVerifier } from './security/hmacVerifier.js';
export { sybilProtection, SybilProtection } from './security/sybilProtection.js';
export { securityManager, SecurityManager } from './security/compliance.js';

// Observability
export { correlationIds, CorrelationIdManager } from './observability/correlationId.js';

// Agent SDK v2
export { VeraAgentSDK } from './sdk/agentSdkV2.js';

// Sharding & Coordination
export { hcsShardingManager, HCSTopicShardingManager } from './orchestrator/hcsTopicSharding.js';
export { hierarchicalCoordinator, HierarchicalCoordinator } from './orchestrator/hierarchicalCoordinator.js';
export { FlowerOfLifeOS, flowerOfLifeOS } from './orchestrator/flowerOfLifeOS.js';
export { HCSDomainLogger, hcsDomainLogger } from './logging/hcsDomainLogger.js';

// Visualization
export { VesicaPiscisVisualizer, vesicaPiscisVisualizer } from './visualization/vesicaPiscisVisualizer.js';
export { FlowerOfLifeGenerator, flowerOfLifeGenerator } from './visualization/flowerOfLife.js';
export { MetatronCubeGenerator, metatronCubeGenerator } from './visualization/metatronCube.js';
export { SacredGeometryRenderer, sacredGeometryRenderer } from './visualization/sacredGeometryRenderer.js';
export { SacredGeometrySwarmNavigator, swarmNavigator } from './visualization/swarmNavigator.js';
export { VesicaPiscisGossip } from './gossip/vesicaPiscisGossip.js';
export { TriangularRouter } from './routing/triangularRouter.js';
export { RadialShardManager } from './sharding/radialShardManager.js';

// Phase 5: Nested Consensus & Harmonic Balancing
export { NestedConsensusRings } from './consensus/nestedConsensusRings.js';
export { IntersectionConsensusPoints } from './consensus/intersectionConsensusPoints.js';
export { HarmonicLoadBalancer } from './balancing/harmonicLoadBalancer.js';

// Phase 6: Quantum Routing & Metatron's Grid
export { MetatronGridRouter } from './routing/metatronGridRouter.js';
export { EntanglementProtocol } from './quantum/entanglementProtocol.js';

// Sovereign LLM Router (Hybrid Local + API Fallback)
export {
  SovereignLlmRouter,
  sovereignLlmRouter,
  type InferenceRequest,
  type InferenceResult,
  type ComplexityFeatures,
  type StreamCallback,
} from '../llm/sovereignRouter.js';

// Harmonic Resonance System
export {
  HarmonicResonator,
  harmonicResonator,
  SACRED_FREQUENCIES,
  RESONANCE_PATTERNS,
  type HarmonicState,
  type ResonancePattern,
} from './lattice/harmonicResonator.js';

// Voice & Natural Interface
export {
  VoiceEngine,
  voiceEngine,
  ConversationContextManager,
  conversationContext,
  registerCommand,
  getAllCommands,
  executeCommand,
  type VoiceConfig,
  type CommandDefinition,
  type ConversationSession,
} from '../voice/index.js';

// TTS (Text-to-Speech)
export {
  TTSEngine,
  ttsEngine,
  type TTSConfig,
} from './voice/ttsEngine.js';

// Vision (Image Analysis)
export {
  VisionEngine,
  visionEngine,
  type VisionRequest,
  type VisionResult,
} from './vision/visionEngine.js';

// Tools (Code Execution, File Operations, Web Search)
export {
  ToolEngine,
  toolEngine,
  type Tool,
  type ToolCall,
} from './tools/toolEngine.js';

// Multi-Model Ensemble
export {
  ModelEnsemble,
  modelEnsemble,
  type EnsembleRequest,
  type EnsembleResult,
  type ModelConfig,
} from '../llm/modelEnsemble.js';

// Nexus Graph Intelligence (GitNexus-style for Flower of Life)
export {
  LatticeGraphEngine,
  latticeGraph,
  type LatticeNode,
  type LatticeEdge,
  type LatticeGraph,
  type QueryResult,
  type NodeType,
} from './nexus/latticeGraph.js';

// Vera Self-Knowledge (for RAG memory)
export {
  VERA_SELF_KNOWLEDGE,
  VERA_ARCHITECTURE_DOCS,
  loadVeraSelfKnowledge,
} from './memory/veraSelfKnowledge.js';

// Qdrant Vector Engine (Persistent Memory)
export {
  QdrantEngine,
  qdrantEngine,
  type QdrantDocument,
  type QdrantSearchResult,
  type QdrantStats,
} from './memory/qdrantEngine.js';

// Hybrid Memory Engine (Qdrant + Local fallback)
export {
  HybridMemoryEngine,
  hybridMemory,
  type MemoryDocument,
  type MemorySearchResult,
  type MemoryStats,
} from './memory/hybridMemory.js';

// CrewAI Multi-Agent System
export {
  VeraCrewManager,
  crewManager,
  type AgentRole,
  type CrewTask,
  type CrewConfig,
  type CrewResult,
} from './agents/crewManager.js';

// Agent Dispatcher for automatic routing
export {
  AgentDispatcher,
  agentDispatcher,
  type AgentIntent,
  type DispatchResult,
} from './agents/agentDispatcher.js';

// Kùzu Graph Database
export {
  KuzuEngine,
  kuzuEngine,
  type GraphNode,
  type GraphEdge,
  type CypherResult,
  type GraphPath,
} from './graph/kuzuEngine.js';

// Quantum Entanglement Layer
export {
  QuantumLayer,
  quantumLayer,
  type QuantumState,
  type EntanglementPair,
  type QuantumTunnel,
} from './quantum/quantumLayer.js';

// Unified Intelligence Orchestrator
export {
  UnifiedIntelligence,
  unifiedIntelligence,
  type UnifiedRequest,
  type UnifiedResponse,
} from './orchestrator/unifiedIntelligence.js';

// OpenShell Runtime (NVIDIA Agent Safety)
export {
  OpenShellRuntime,
  openShellRuntime,
  type OpenShellPolicy,
  type AgentSandbox,
  type HeartbeatPulse,
  type LatticeCoordination,
} from './agents/openShellRuntime.js';

// OpenShell Agent Dispatcher
export {
  OpenShellAgentDispatcher,
  openShellDispatcher,
  SOVEREIGN_POLICIES,
  type SecureDispatchRequest,
  type SecureDispatchResult,
} from './agents/openShellAgentDispatcher.js';

// NemoClaw Memory (Personal AI Memory)
export {
  NemoClawMemory,
  nemoClawMemory,
  type MemoryQuery,
  type MemoryQueryResult,
  type RAGContext,
} from './memory/nemoClawMemory.js';

// Nemotron Router (Optimized NVIDIA Models)
export {
  NemotronRouter,
  nemotronRouter,
  type NemotronConfig,
  type NemotronRequest,
  type NemotronResult,
  type NemotronCapabilities,
} from '../llm/nemotronRouter.js';

// AI-Q Blueprint (Structured Multi-Agent Workflows)
export {
  AIQBlueprint,
  aiqBlueprint,
  type AIQAgent,
  type AIQWorkflow,
  type AIQStep,
  type AIQPerception,
  type AIQReasoning,
  type AIQAction,
  type AIQWorkflowResult,
} from './orchestrator/aiqBlueprint.js';

// NVIDIA + Hedera Integration
export {
  NvidiaHederaIntegration,
  nvidiaHedera,
  type HederaCarbonCalculation,
  type MultiStepTransaction,
  type HederaTransactionMemory,
} from '../hedera/nvidiaHederaIntegration.js';

// HCS Balance Guard
export {
  HCSBalanceGuard,
  createBalanceGuard,
  getBalanceGuard,
  type BalanceGuardConfig,
  type BalanceStatus,
} from './logging/hcsBalanceGuard.js';
