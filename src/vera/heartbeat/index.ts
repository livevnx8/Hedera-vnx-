/**
 * Vera Enterprise Heartbeat System
 *
 * Cost-optimized HCS heartbeats with HIP-993 format and enterprise capability advertisement.
 *
 * Features:
 * - Smart delta heartbeats: Full capabilities hourly, minimal status every 10 minutes
 * - 88% cost savings vs legacy 1-minute heartbeats
 * - Full enterprise capability schema (Hedera, AI, Domains, Hardware, Compliance)
 * - Capability-based discovery and routing
 */

// Capability Registry
export {
  CapabilityRegistry,
  capabilityRegistry,
  DEFAULT_ENTERPRISE_CAPABILITIES,
} from './capabilityRegistry.js';
export type {
  EnterpriseCapabilities,
  HederaCapabilities,
  AICapabilities,
  DomainCapabilities,
  HardwareCapabilities,
  ComplianceCapabilities,
  PerformanceCapabilities,
  MinimalCapabilityStatus,
  CapabilityQuery,
} from './capabilityRegistry.js';

// Enterprise Heartbeat Manager
export {
  EnterpriseHeartbeatManager,
  enterpriseHeartbeat,
  HEARTBEAT_VERSION,
  MAX_MESSAGE_SIZE,
  DEFAULT_MINIMAL_INTERVAL_MS,
  DEFAULT_FULL_INTERVAL_MS,
  FULL_HEARTBEAT_EVERY_N,
} from './enterpriseHeartbeatManager.js';
export type {
  HeartbeatConfig,
  HeartbeatMessage,
  CostStats,
  HeartbeatMetrics,
} from './enterpriseHeartbeatManager.js';

// Capability Discovery
export {
  CapabilityDiscovery,
  capabilityDiscovery,
} from './capabilityDiscovery.js';
export type {
  DiscoveredNode,
  DiscoveryResult,
  RoutingRecommendation,
} from './capabilityDiscovery.js';
