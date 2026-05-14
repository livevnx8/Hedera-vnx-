/**
 * Edge Computing Module (Phase 16)
 * 
 * Deploy lightweight agents to edge devices, IoT sensors,
 * and embedded systems with federated learning.
 */

export {
  EdgeAgentRuntime,
  getEdgeAgentRuntime
} from './edgeRuntime.js';

export {
  FederatedLearning,
  getFederatedLearning
} from './federatedLearning.js';

export type {
  EdgeDevice,
  DeviceType,
  DeviceStatus,
  DeploymentReceipt,
  SensorReading,
  InferenceResult,
  SyncResult,
  Model,
  GradientUpdate,
  AggregatedGradient,
  FLRound
} from './types.js';
