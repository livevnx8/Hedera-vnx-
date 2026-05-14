/**
 * Vera Orchestrator Module Exports
 *
 * Central export point for all orchestrator components including:
 * - Topic management
 * - Beacon system (SOS/heartbeat)
 * - Agent discovery
 * - Health-based payments
 * - Hot Topics Radar
 */

// Orchestrator components
export { VeraOrchestrator, veraOrchestrator } from './orchestratorLoop.js';
export { TaskChainEngine, taskChainEngine } from './taskChainEngine.js';
export { HierarchicalCoordinator, hierarchicalCoordinator } from './hierarchicalCoordinator.js';
export { FlowerOfLifeOS, flowerOfLifeOS } from './flowerOfLifeOS.js';
export { SwarmNavigator, swarmNavigator } from './swarmNavigator.js';

// Topic Management
export {
  PaymentTopics,
  PaymentTopicManager,
  paymentTopicManager,
} from './topicManager.js';

// Hot Topics Radar
export {
  HotTopicsConfig,
  HotTopicsScanResult,
  HotTopicEntry,
  WorkflowType,
  ActionFlag,
  NewTopicDiscovery,
  VolumeDelta,
  VolumeSpikeEvent,
  DEFAULT_HOT_TOPICS_CONFIG,
  INITIAL_MONITORED_TOPICS,
  DEFAULT_WORKFLOW_PATTERNS,
} from './hotTopicsTypes.js';

export {
  HotTopicsManager,
  hotTopicsManager,
} from './hotTopicsManager.js';

export {
  HotTopicsScanner,
  createHotTopicsScanner,
} from './hotTopicsScanner.js';

// Beacon System
export {
  BeaconMessage,
  BeaconConfig,
  AgentDiscoveryInfo,
  AgentHCSBeacon,
  createAgentBeacon,
} from './agentHCSBeacon.js';

// Beacon Listener
export {
  BeaconListenerConfig,
  BeaconListenerEvents,
  AgentHCSBeaconListener,
  createBeaconListener,
} from './agentHCSBeaconListener.js';

// Health-Based Payment Distributor
export {
  RevenueAccount,
  PaymentConfig,
  PaymentResult,
  HealthPaymentDistributor,
  createPaymentDistributor,
} from './healthPaymentDistributor.js';
