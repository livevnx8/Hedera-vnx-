/**
 * Confidential AI Compute
 * 
 * Runs AI/ML inference inside TEE enclaves with encrypted weights
 * and data, providing verifiable privacy-preserving computation.
 */

import { logger } from '../monitoring/logger.js';
import type { ConfidentialTask, ComputationResult, EncryptedInput, MemoryEncryptionKey } from './types.js';

interface AIComputeConfig {
  maxModelSizeMB: number;
  supportedFrameworks: string[];
  encryptionAlgorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';
  keyRotationIntervalHours: number;
}

interface ModelWeights {
  modelId: string;
  encryptedWeights: string;
  hash: string;
  framework: string;
  version: string;
  sizeMB: number;
}

interface InferenceRequest {
  modelId: string;
  input: EncryptedInput;
  parameters?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

export class ConfidentialAI {
  private config: AIComputeConfig;
  private keyStore: Map<string, MemoryEncryptionKey> = new Map();
  private models: Map<string, ModelWeights> = new Map();
  private inferenceHistory: Array<{
    inferenceId: string;
    modelId: string;
    timestamp: number;
    status: 'success' | 'failure';
    latencyMs: number;
  }> = [];

  constructor(config: Partial<AIComputeConfig> = {}) {
    this.config = {
      maxModelSizeMB: 1024,
      supportedFrameworks: ['onnx', 'tensorflow', 'pytorch'],
      encryptionAlgorithm: 'AES-256-GCM',
      keyRotationIntervalHours: 24,
      ...config
    };
  }

  /**
   * Register an encrypted model for confidential inference
   */
  async registerModel(weights: ModelWeights): Promise<void> {
    try {
      if (weights.sizeMB > this.config.maxModelSizeMB) {
        throw new Error(`Model size ${weights.sizeMB}MB exceeds limit ${this.config.maxModelSizeMB}MB`);
      }

      if (!this.config.supportedFrameworks.includes(weights.framework)) {
        throw new Error(`Framework ${weights.framework} not supported`);
      }

      this.models.set(weights.modelId, weights);

      logger.info('ConfidentialAI', {
        message: 'Model registered',
        modelId: weights.modelId,
        framework: weights.framework,
        sizeMB: weights.sizeMB
      });

    } catch (error) {
      logger.error('ConfidentialAI', {
        message: 'Model registration failed',
        modelId: weights.modelId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Generate encryption key for model weights
   */
  async generateEncryptionKey(): Promise<MemoryEncryptionKey> {
    const keyId = `key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    const key: MemoryEncryptionKey = {
      keyId,
      key: this.generateSecureKey(),
      algorithm: this.config.encryptionAlgorithm,
      createdAt: Date.now(),
      expiresAt: Date.now() + (this.config.keyRotationIntervalHours * 60 * 60 * 1000)
    };

    this.keyStore.set(keyId, key);

    logger.debug('ConfidentialAI', {
      message: 'Encryption key generated',
      keyId,
      algorithm: key.algorithm
    });

    return key;
  }

  /**
   * Perform confidential inference
   */
  async inference(request: InferenceRequest): Promise<{
    inferenceId: string;
    result: ComputationResult;
    modelId: string;
  }> {
    const inferenceId = `inf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const startTime = Date.now();

    try {
      // Verify model exists
      const model = this.models.get(request.modelId);
      if (!model) {
        throw new Error(`Model ${request.modelId} not found`);
      }

      // Decrypt input (simulated - would happen inside TEE)
      const decryptedInput = await this.decryptInput(request.input);

      // Run inference (simulated)
      const output = await this.runInference(model, decryptedInput, request.parameters);

      // Encrypt output
      const encryptedOutput = await this.encryptOutput(output);

      // Create computation result
      const result: ComputationResult = {
        taskId: inferenceId,
        output: encryptedOutput,
        outputHash: this.hashOutput(encryptedOutput),
        proof: {
          enclaveId: 'tee-ai-enclave',
          measurement: model.hash,
          log: [`Model ${model.modelId} loaded`, 'Inference completed', 'Output encrypted'],
          signature: this.signResult(inferenceId, encryptedOutput)
        },
        executionTime: (Date.now() - startTime) / 1000,
        memoryUsed: model.sizeMB * 2,
        status: 'success'
      };

      // Record history
      this.inferenceHistory.push({
        inferenceId,
        modelId: request.modelId,
        timestamp: Date.now(),
        status: 'success',
        latencyMs: Date.now() - startTime
      });

      logger.info('ConfidentialAI', {
        message: 'Inference completed',
        inferenceId,
        modelId: request.modelId,
        latencyMs: Date.now() - startTime
      });

      return { inferenceId, result, modelId: request.modelId };

    } catch (error) {
      this.inferenceHistory.push({
        inferenceId,
        modelId: request.modelId,
        timestamp: Date.now(),
        status: 'failure',
        latencyMs: Date.now() - startTime
      });

      logger.error('ConfidentialAI', {
        message: 'Inference failed',
        inferenceId,
        modelId: request.modelId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Batch inference for multiple inputs
   */
  async batchInference(
    modelId: string,
    inputs: EncryptedInput[],
    priority: 'low' | 'normal' | 'high' | 'critical' = 'normal'
  ): Promise<Array<{ inferenceId: string; result: ComputationResult }>> {
    const results: Array<{ inferenceId: string; result: ComputationResult }> = [];

    for (const input of inputs) {
      try {
        const { inferenceId, result } = await this.inference({
          modelId,
          input,
          priority
        });
        results.push({ inferenceId, result });
      } catch (error) {
        logger.error('ConfidentialAI', {
          message: 'Batch inference item failed',
          modelId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  /**
   * Get model information
   */
  getModel(modelId: string): ModelWeights | undefined {
    return this.models.get(modelId);
  }

  /**
   * List all registered models
   */
  listModels(): ModelWeights[] {
    return Array.from(this.models.values());
  }

  /**
   * Get inference history
   */
  getInferenceHistory(modelId?: string, limit: number = 100): typeof this.inferenceHistory {
    let history = this.inferenceHistory;
    if (modelId) {
      history = history.filter(h => h.modelId === modelId);
    }
    return history.slice(-limit);
  }

  /**
   * Rotate encryption keys
   */
  async rotateKeys(): Promise<string[]> {
    const rotated: string[] = [];
    const now = Date.now();

    for (const [keyId, key] of this.keyStore) {
      if (key.expiresAt < now) {
        const newKey = await this.generateEncryptionKey();
        rotated.push(keyId);
        this.keyStore.delete(keyId);
        
        logger.info('ConfidentialAI', {
          message: 'Key rotated',
          oldKeyId: keyId,
          newKeyId: newKey.keyId
        });
      }
    }

    return rotated;
  }

  /**
   * Get AI compute statistics
   */
  getStats() {
    const timestamp = Date.now();
    const history = this.inferenceHistory;
    const successful = history.filter(h => h.status === 'success');
    const failed = history.filter(h => h.status === 'failure');

    return {
      timestamp,
      registeredModels: this.models.size,
      activeKeys: this.keyStore.size,
      totalInferences: history.length,
      successfulInferences: successful.length,
      failedInferences: failed.length,
      averageLatencyMs: successful.length > 0
        ? successful.reduce((sum, h) => sum + h.latencyMs, 0) / successful.length
        : 0,
      config: this.config
    };
  }

  // Private methods
  private async decryptInput(input: EncryptedInput): Promise<string> {
    // Mock decryption - would use actual decryption inside TEE
    return 'decrypted-input-data';
  }

  private async runInference(
    model: ModelWeights,
    input: string,
    parameters?: Record<string, unknown>
  ): Promise<string> {
    // Mock inference - would run actual model inside TEE
    await new Promise(resolve => setTimeout(resolve, 100));
    return `inference-result-${model.modelId}-${Date.now()}`;
  }

  private async encryptOutput(output: string): Promise<string> {
    // Mock encryption - would encrypt with derived key inside TEE
    return Buffer.from(output).toString('base64');
  }

  private hashOutput(output: string): string {
    let hash = 0;
    for (let i = 0; i < output.length; i++) {
      hash = ((hash << 5) - hash) + output.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  private signResult(inferenceId: string, output: string): string {
    return Buffer.from(`${inferenceId}:${output}:${Date.now()}`).toString('base64');
  }

  private generateSecureKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let key = '';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }
}

// Singleton
let confidentialAIInstance: ConfidentialAI | null = null;

export function getConfidentialAI(config?: Partial<AIComputeConfig>): ConfidentialAI {
  if (!confidentialAIInstance) {
    confidentialAIInstance = new ConfidentialAI(config);
  }
  return confidentialAIInstance;
}
