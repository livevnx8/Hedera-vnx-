/**
 * Edge Agent Runtime (Phase 16)
 * 
 * Deploy and manage lightweight agents on edge devices.
 */

import { logger } from '../monitoring/logger.js';
import type { 
  EdgeDevice, 
  DeploymentReceipt, 
  SensorReading,
  InferenceResult,
  SyncResult,
  DeviceType,
  DeviceStatus
} from './types.js';

interface RuntimeConfig {
  hederaTopicId: string;
  syncIntervalMs: number;
  offlineQueueSize: number;
}

export class EdgeAgentRuntime {
  private config: RuntimeConfig;
  private devices: Map<string, EdgeDevice> = new Map();
  private deployments: Map<string, DeploymentReceipt> = new Map();
  private sensorData: Map<string, SensorReading[]> = new Map(); // deviceId -> readings
  private offlineQueue: Map<string, unknown[]> = new Map(); // deviceId -> queued data

  constructor(config: Partial<RuntimeConfig> = {}) {
    this.config = {
      hederaTopicId: '0.0.edge',
      syncIntervalMs: 60000, // 1 minute
      offlineQueueSize: 1000,
      ...config
    };
  }

  /**
   * Register an edge device
   */
  async registerDevice(
    deviceId: string,
    name: string,
    type: DeviceType,
    capabilities: string[],
    location: EdgeDevice['location']
  ): Promise<EdgeDevice> {
    const device: EdgeDevice = {
      deviceId,
      name,
      type,
      status: 'online',
      location,
      capabilities,
      lastSeen: Date.now(),
      agentVersion: '1.0.0',
      computeUnits: this.getComputeUnits(type),
      memoryMb: this.getDefaultMemory(type),
      storageMb: this.getDefaultStorage(type)
    };

    this.devices.set(deviceId, device);
    this.sensorData.set(deviceId, []);
    this.offlineQueue.set(deviceId, []);

    logger.info('EdgeAgentRuntime', {
      message: 'Device registered',
      deviceId,
      type,
      capabilities: capabilities.length
    });

    return device;
  }

  /**
   * Deploy agent code to device
   */
  async deploy(
    agentCode: string, // WASM module or script
    device: EdgeDevice
  ): Promise<DeploymentReceipt> {
    const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Validate device compatibility
    if (agentCode.length > device.storageMb * 1024) {
      throw new Error('Agent code exceeds device storage capacity');
    }

    const receipt: DeploymentReceipt = {
      deploymentId,
      deviceId: device.deviceId,
      agentCode: Buffer.from(agentCode).toString('base64').slice(0, 16), // Hash
      deployedAt: Date.now(),
      status: 'deployed',
      endpoint: `wss://edge.vera.network/${device.deviceId}`
    };

    this.deployments.set(deploymentId, receipt);

    // Simulate deployment
    setTimeout(() => {
      receipt.status = 'running';
      this.deployments.set(deploymentId, receipt);
      
      logger.info('EdgeAgentRuntime', {
        message: 'Agent running on device',
        deploymentId,
        deviceId: device.deviceId
      });
    }, 2000);

    logger.info('EdgeAgentRuntime', {
      message: 'Agent deployed',
      deploymentId,
      deviceId: device.deviceId,
      codeSize: agentCode.length
    });

    return receipt;
  }

  /**
   * Collect sensor data from device
   */
  async collectSensorData(deviceId: string): Promise<SensorReading[]> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    // Update last seen
    device.lastSeen = Date.now();
    this.devices.set(deviceId, device);

    // Return cached readings (in production, would fetch from device)
    const readings = this.sensorData.get(deviceId) || [];
    
    logger.debug('EdgeAgentRuntime', {
      message: 'Sensor data collected',
      deviceId,
      readings: readings.length
    });

    return readings;
  }

  /**
   * Store sensor reading
   */
  async storeReading(reading: SensorReading): Promise<void> {
    const readings = this.sensorData.get(reading.deviceId) || [];
    readings.push(reading);
    
    // Keep only last 1000 readings per device
    if (readings.length > 1000) {
      readings.shift();
    }
    
    this.sensorData.set(reading.deviceId, readings);

    logger.debug('EdgeAgentRuntime', {
      message: 'Sensor reading stored',
      deviceId: reading.deviceId,
      sensorType: reading.sensorType,
      value: reading.value
    });
  }

  /**
   * Execute local inference on device
   */
  async executeLocalInference(
    deviceId: string,
    modelName: string,
    input: Float32Array
  ): Promise<InferenceResult> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    const startTime = Date.now();

    // Mock inference execution
    await new Promise(resolve => setTimeout(resolve, 100));

    const inferenceId = `inf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    const result: InferenceResult = {
      inferenceId,
      deviceId,
      modelName,
      inputHash: Buffer.from(input.buffer).toString('base64').slice(0, 16),
      output: { prediction: Math.random(), class: 'example' },
      confidence: 0.85 + Math.random() * 0.14,
      latencyMs: Date.now() - startTime,
      executedAt: Date.now()
    };

    logger.info('EdgeAgentRuntime', {
      message: 'Local inference executed',
      inferenceId,
      deviceId,
      modelName,
      latency: result.latencyMs
    });

    return result;
  }

  /**
   * Sync device with lattice
   */
  async syncWithLattice(deviceId: string): Promise<SyncResult> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    const readings = this.sensorData.get(deviceId) || [];
    const queue = this.offlineQueue.get(deviceId) || [];

    // Simulate sync
    await new Promise(resolve => setTimeout(resolve, 500));

    // Clear synced data
    this.sensorData.set(deviceId, []);
    this.offlineQueue.set(deviceId, []);

    const result: SyncResult = {
      deviceId,
      syncedAt: Date.now(),
      readingsSent: readings.length,
      readingsReceived: 0,
      agentUpdated: false,
      modelsUpdated: [],
      conflicts: 0,
      status: 'success'
    };

    device.status = 'online';
    device.lastSeen = Date.now();
    this.devices.set(deviceId, device);

    logger.info('EdgeAgentRuntime', {
      message: 'Device synced with lattice',
      deviceId,
      readingsSent: result.readingsSent
    });

    return result;
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): EdgeDevice | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Get all devices
   */
  getDevices(): EdgeDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get devices by status
   */
  getDevicesByStatus(status: DeviceStatus): EdgeDevice[] {
    return Array.from(this.devices.values()).filter(d => d.status === status);
  }

  /**
   * Get deployment by ID
   */
  getDeployment(deploymentId: string): DeploymentReceipt | undefined {
    return this.deployments.get(deploymentId);
  }

  /**
   * Get runtime statistics
   */
  getStats() {
    const devices = Array.from(this.devices.values());
    const deployments = Array.from(this.deployments.values());

    return {
      timestamp: Date.now(),
      totalDevices: devices.length,
      onlineDevices: devices.filter(d => d.status === 'online').length,
      offlineDevices: devices.filter(d => d.status === 'offline').length,
      activeDeployments: deployments.filter(d => d.status === 'running').length,
      totalSensorReadings: Array.from(this.sensorData.values())
        .reduce((sum, arr) => sum + arr.length, 0),
      queuedData: Array.from(this.offlineQueue.values())
        .reduce((sum, arr) => sum + arr.length, 0),
      byType: this.getDeviceCountsByType()
    };
  }

  // Private methods
  private getComputeUnits(type: DeviceType): number {
    const units: Record<DeviceType, number> = {
      raspberry_pi: 30,
      esp32: 10,
      mobile: 50,
      gateway: 70,
      industrial: 100
    };
    return units[type] || 10;
  }

  private getDefaultMemory(type: DeviceType): number {
    const memory: Record<DeviceType, number> = {
      raspberry_pi: 1024,
      esp32: 512,
      mobile: 4096,
      gateway: 8192,
      industrial: 16384
    };
    return memory[type] || 512;
  }

  private getDefaultStorage(type: DeviceType): number {
    const storage: Record<DeviceType, number> = {
      raspberry_pi: 32768,
      esp32: 4096,
      mobile: 65536,
      gateway: 131072,
      industrial: 262144
    };
    return storage[type] || 4096;
  }

  private getDeviceCountsByType(): Record<DeviceType, number> {
    const counts: Partial<Record<DeviceType, number>> = {};
    
    for (const device of this.devices.values()) {
      counts[device.type] = (counts[device.type] || 0) + 1;
    }
    
    return counts as Record<DeviceType, number>;
  }
}

// Singleton
let runtimeInstance: EdgeAgentRuntime | null = null;

export function getEdgeAgentRuntime(config?: Partial<RuntimeConfig>): EdgeAgentRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new EdgeAgentRuntime(config);
  }
  return runtimeInstance;
}
