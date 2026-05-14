/**
 * Edge Computing Types (Phase 16)
 * 
 * Type definitions for edge device management, federated learning,
 * and IoT agent deployment.
 */

export type DeviceType = 'raspberry_pi' | 'esp32' | 'mobile' | 'gateway' | 'industrial';
export type DeviceStatus = 'online' | 'offline' | 'syncing' | 'error';

export interface EdgeDevice {
  deviceId: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  location: {
    latitude: number;
    longitude: number;
    region: string;
  };
  capabilities: string[]; // e.g., ['camera', 'microphone', 'temperature', 'motion']
  lastSeen: number;
  agentVersion: string;
  computeUnits: number; // Relative compute power (1-100)
  memoryMb: number;
  storageMb: number;
  batteryLevel?: number; // 0-100
}

export interface DeploymentReceipt {
  deploymentId: string;
  deviceId: string;
  agentCode: string; // WASM module hash
  deployedAt: number;
  status: 'pending' | 'deployed' | 'failed' | 'running';
  endpoint?: string; // WebSocket endpoint for comms
}

export interface SensorReading {
  readingId: string;
  deviceId: string;
  sensorType: string;
  value: number;
  unit: string;
  timestamp: number;
  location?: {
    latitude: number;
    longitude: number;
  };
  metadata?: Record<string, unknown>;
}

export interface InferenceResult {
  inferenceId: string;
  deviceId: string;
  modelName: string;
  inputHash: string;
  output: unknown;
  confidence: number;
  latencyMs: number;
  executedAt: number;
}

export interface SyncResult {
  deviceId: string;
  syncedAt: number;
  readingsSent: number;
  readingsReceived: number;
  agentUpdated: boolean;
  modelsUpdated: string[];
  conflicts: number;
  status: 'success' | 'partial' | 'failed';
}

export interface Model {
  modelId: string;
  name: string;
  version: string;
  architecture: string;
  parameters: number;
  sizeBytes: number;
  quantized: boolean;
  targetDevices: DeviceType[];
}

export interface GradientUpdate {
  deviceId: string;
  modelId: string;
  round: number;
  gradients: Float32Array;
  sampleCount: number;
  loss: number;
  accuracy: number;
  timestamp: number;
  proof: string; // ZK proof of computation
}

export interface AggregatedGradient {
  modelId: string;
  round: number;
  aggregatedGradients: Float32Array;
  deviceCount: number;
  avgLoss: number;
  avgAccuracy: number;
  timestamp: number;
}

export interface FLRound {
  roundId: string;
  modelId: string;
  round: number;
  status: 'collecting' | 'aggregating' | 'completed' | 'failed';
  participatingDevices: string[];
  updatesReceived: number;
  startedAt: number;
  completedAt?: number;
}
