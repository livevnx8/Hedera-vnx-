/**
 * Multi-Variant Swarm Architecture - Index
 * 
 * Exports all components for the three-class swarm system:
 * - Micro swarms (streaming layer)
 * - Normal swarms (processing layer)  
 * - Macro swarms (bus layer)
 */

// Infrastructure
export { HCSTopicInfrastructure, DEFAULT_HIERARCHY } from './hcsTopicInfrastructure.js';
export type { TopicConfig, TopicHierarchyConfig, SwarmClass } from './hcsTopicInfrastructure.js';

// Base Agent
export { BaseSwarmAgent } from './baseSwarmAgent.js';
export type { AgentConfig, AgentTier, AgentRole, AgentStatus, Task, AgentMetrics } from './baseSwarmAgent.js';

// Specialized Agents
export { MicroAgent } from './microAgent.js';
export type { StreamEvent, StreamBatch } from './microAgent.js';

export { NormalAgent } from './normalAgent.js';
export type { Workflow, WorkflowStep } from './normalAgent.js';

export { MacroAgent } from './macroAgent.js';
export type { BusMessage, FederatedState } from './macroAgent.js';

// Relay
export { LatticeRelay } from './latticeRelay.js';
export type { RelayMessage, MeetOperation, JoinOperation } from './latticeRelay.js';

// Orchestrator
export { MultiVariantSwarmOrchestrator } from './swarmOrchestrator.js';
export type { SwarmConfig, SwarmMetrics } from './swarmOrchestrator.js';

// Hedera Integration
export { HederaToolAgent } from './hederaToolAgent.js';
export type { HederaToolTask, HederaToolResult } from './hederaToolAgent.js';

export { HederaIntegratedSwarm } from './hederaIntegratedSwarm.js';
export type { HederaSwarmConfig } from './hederaIntegratedSwarm.js';

// Monitoring & Auto-scaling
export { SwarmMonitor } from './swarmMonitor.js';
export type { AgentHealth, SwarmClassHealth, SystemMetrics } from './swarmMonitor.js';

export { SwarmAutoScaler } from './swarmAutoScaler.js';
export type { ScalingPolicy, ScalingDecision } from './swarmAutoScaler.js';

// Complete System
export { CompleteMultiVariantSystem } from './completeSystem.js';
