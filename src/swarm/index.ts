/**
 * Vera Swarm Optimization Exports
 * 
 * Advanced swarm intelligence components:
 * - Intelligent Task Router
 * - Adaptive Load Balancer
 * - Workload-Adaptive Variant Controller
 * - Predictive Scaler
 * - Task Deduplicator
 * - Enhanced Agent Lifecycle Manager
 */

// Intelligent Task Router
export {
  IntelligentTaskRouter,
  getIntelligentTaskRouter,
  resetTaskRouter,
  type TaskRequest,
  type RoutingScore,
  type RouterConfig,
} from './intelligentTaskRouter.js';

// Adaptive Load Balancer
export {
  AdaptiveLoadBalancer,
  getAdaptiveLoadBalancer,
  resetLoadBalancer,
  type NodeLoadState,
  type RebalanceAction,
  type LoadForecast,
  type BalancerConfig,
} from './adaptiveLoadBalancer.js';

// Variant Controller
export {
  VariantController,
  getVariantController,
  resetVariantController,
  type AgentVariant,
  type VariantState,
  type VariantConfig,
  type VariantMetrics,
} from './variantController.js';

// Predictive Scaler
export {
  PredictiveScaler,
  getPredictiveScaler,
  resetPredictiveScaler,
  type MetricPoint,
  type LoadForecast as ScalerLoadForecast,
  type ScalingDecision,
  type AgentPlacement,
  type ScalerConfig,
} from './predictiveScaler.js';

// Task Deduplicator
export {
  TaskDeduplicator,
  getTaskDeduplicator,
  resetTaskDeduplicator,
  type TaskFingerprint,
  type CoalescedBatch,
  type CacheEntry,
  type DeduplicatorConfig,
} from './taskDeduplicator.js';

// Agent Lifecycle Manager
export {
  AgentLifecycleManager,
  getAgentLifecycleManager,
  resetAgentLifecycleManager,
  type AgentHealth,
  type AgentStatus,
  type HealthLevel,
  type LifecycleConfig,
  type LatticeMemory,
} from './agentLifecycle.js';
