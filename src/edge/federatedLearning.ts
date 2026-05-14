/**
 * Federated Learning (Phase 16)
 * 
 * Train ML models across edge devices without centralizing data.
 * Privacy-preserving collaborative learning with ZK proofs.
 */

import { logger } from '../monitoring/logger.js';
import type { 
  Model, 
  GradientUpdate, 
  AggregatedGradient,
  FLRound 
} from './types.js';

interface FLConfig {
  minDevices: number;
  maxDevices: number;
  rounds: number;
  localEpochs: number;
  learningRate: number;
  aggregationAlgorithm: 'fedavg' | 'fedprox' | 'scaffold';
  zkVerification: boolean;
}

export class FederatedLearning {
  private config: FLConfig;
  private models: Map<string, Model> = new Map();
  private rounds: Map<string, FLRound> = new Map(); // roundId -> round
  private gradients: Map<string, GradientUpdate[]> = new Map(); // roundId -> updates
  private globalModels: Map<string, Float32Array> = new Map(); // modelId -> weights

  constructor(config: Partial<FLConfig> = {}) {
    this.config = {
      minDevices: 5,
      maxDevices: 100,
      rounds: 10,
      localEpochs: 5,
      learningRate: 0.01,
      aggregationAlgorithm: 'fedavg',
      zkVerification: true,
      ...config
    };
  }

  /**
   * Register a global model
   */
  registerModel(model: Model): void {
    this.models.set(model.modelId, model);
    // Initialize random weights (mock)
    this.globalModels.set(model.modelId, new Float32Array(model.parameters));

    logger.info('FederatedLearning', {
      message: 'Model registered',
      modelId: model.modelId,
      name: model.name,
      parameters: model.parameters
    });
  }

  /**
   * Initialize a new FL training round
   */
  async initializeRound(modelId: string): Promise<FLRound> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error('Model not found');
    }

    const roundId = `fl-${modelId}-${Date.now()}`;
    const round: FLRound = {
      roundId,
      modelId,
      round: 1,
      status: 'collecting',
      participatingDevices: [],
      updatesReceived: 0,
      startedAt: Date.now()
    };

    this.rounds.set(roundId, round);
    this.gradients.set(roundId, []);

    logger.info('FederatedLearning', {
      message: 'FL round initialized',
      roundId,
      modelId
    });

    return round;
  }

  /**
   * Collect gradient update from device
   */
  async collectGradients(update: GradientUpdate): Promise<void> {
    const round = this.rounds.get(`fl-${update.modelId}-${Math.floor(update.timestamp / 1000)}`);
    if (!round) {
      throw new Error('No active round for this model');
    }

    if (round.status !== 'collecting') {
      throw new Error('Round not accepting updates');
    }

    // Verify ZK proof if enabled
    if (this.config.zkVerification) {
      const valid = await this.verifyGradientProof(update);
      if (!valid) {
        throw new Error('Invalid gradient proof');
      }
    }

    const updates = this.gradients.get(round.roundId) || [];
    updates.push(update);
    this.gradients.set(round.roundId, updates);

    round.updatesReceived = updates.length;
    round.participatingDevices.push(update.deviceId);
    this.rounds.set(round.roundId, round);

    logger.info('FederatedLearning', {
      message: 'Gradient update collected',
      roundId: round.roundId,
      deviceId: update.deviceId,
      updatesCount: updates.length
    });

    // Auto-aggregate if we have enough updates
    if (updates.length >= this.config.minDevices) {
      await this.aggregateRound(round.roundId);
    }
  }

  /**
   * Aggregate gradients and update global model
   */
  async aggregateGradients(roundId: string): Promise<AggregatedGradient> {
    return this.aggregateRound(roundId);
  }

  /**
   * Update global model with aggregated gradients
   */
  async updateGlobalModel(gradient: AggregatedGradient): Promise<Model> {
    const model = this.models.get(gradient.modelId);
    if (!model) {
      throw new Error('Model not found');
    }

    const currentWeights = this.globalModels.get(gradient.modelId);
    if (!currentWeights) {
      throw new Error('Global model weights not found');
    }

    // Apply gradients to weights (FedAvg)
    const newWeights = new Float32Array(currentWeights.length);
    for (let i = 0; i < currentWeights.length; i++) {
      newWeights[i] = currentWeights[i] - this.config.learningRate * gradient.aggregatedGradients[i];
    }

    this.globalModels.set(gradient.modelId, newWeights);

    logger.info('FederatedLearning', {
      message: 'Global model updated',
      modelId: gradient.modelId,
      round: gradient.round,
      deviceCount: gradient.deviceCount
    });

    return model;
  }

  /**
   * Get global model weights
   */
  getGlobalModel(modelId: string): Float32Array | undefined {
    return this.globalModels.get(modelId);
  }

  /**
   * Get round by ID
   */
  getRound(roundId: string): FLRound | undefined {
    return this.rounds.get(roundId);
  }

  /**
   * Get active rounds
   */
  getActiveRounds(): FLRound[] {
    return Array.from(this.rounds.values())
      .filter(r => r.status === 'collecting' || r.status === 'aggregating');
  }

  /**
   * Get round statistics
   */
  getRoundStats(roundId: string): {
    updates: number;
    avgLoss: number;
    avgAccuracy: number;
    devices: string[];
  } | null {
    const updates = this.gradients.get(roundId);
    if (!updates || updates.length === 0) return null;

    const avgLoss = updates.reduce((sum, u) => sum + u.loss, 0) / updates.length;
    const avgAccuracy = updates.reduce((sum, u) => sum + u.accuracy, 0) / updates.length;

    return {
      updates: updates.length,
      avgLoss,
      avgAccuracy,
      devices: [...new Set(updates.map(u => u.deviceId))]
    };
  }

  /**
   * Get FL statistics
   */
  getStats() {
    const rounds = Array.from(this.rounds.values());
    const models = Array.from(this.models.values());

    return {
      timestamp: Date.now(),
      registeredModels: models.length,
      totalRounds: rounds.length,
      activeRounds: rounds.filter(r => r.status === 'collecting').length,
      completedRounds: rounds.filter(r => r.status === 'completed').length,
      totalUpdates: Array.from(this.gradients.values())
        .reduce((sum, arr) => sum + arr.length, 0),
      avgDevicesPerRound: rounds.length > 0
        ? rounds.reduce((sum, r) => sum + r.participatingDevices.length, 0) / rounds.length
        : 0,
      config: this.config
    };
  }

  // Private methods
  private async aggregateRound(roundId: string): Promise<AggregatedGradient> {
    const round = this.rounds.get(roundId);
    if (!round) {
      throw new Error('Round not found');
    }

    round.status = 'aggregating';
    this.rounds.set(roundId, round);

    const updates = this.gradients.get(roundId) || [];
    if (updates.length === 0) {
      throw new Error('No gradients to aggregate');
    }

    // FedAvg aggregation
    const sampleCounts = updates.reduce((sum, u) => sum + u.sampleCount, 0);
    const aggregated = new Float32Array(updates[0].gradients.length);

    for (const update of updates) {
      const weight = update.sampleCount / sampleCounts;
      for (let i = 0; i < aggregated.length; i++) {
        aggregated[i] += update.gradients[i] * weight;
      }
    }

    const avgLoss = updates.reduce((sum, u) => sum + u.loss, 0) / updates.length;
    const avgAccuracy = updates.reduce((sum, u) => sum + u.accuracy, 0) / updates.length;

    const result: AggregatedGradient = {
      modelId: round.modelId,
      round: round.round,
      aggregatedGradients: aggregated,
      deviceCount: updates.length,
      avgLoss,
      avgAccuracy,
      timestamp: Date.now()
    };

    round.status = 'completed';
    round.completedAt = Date.now();
    this.rounds.set(roundId, round);

    // Update global model
    await this.updateGlobalModel(result);

    logger.info('FederatedLearning', {
      message: 'Round aggregated',
      roundId,
      deviceCount: result.deviceCount,
      avgLoss: avgLoss.toFixed(4),
      avgAccuracy: avgAccuracy.toFixed(4)
    });

    return result;
  }

  private async verifyGradientProof(update: GradientUpdate): Promise<boolean> {
    // Mock ZK proof verification - would verify actual proof in production
    return update.proof.length > 10 && update.proof.startsWith('zk-');
  }
}

// Singleton
let flInstance: FederatedLearning | null = null;

export function getFederatedLearning(config?: Partial<FLConfig>): FederatedLearning {
  if (!flInstance) {
    flInstance = new FederatedLearning(config);
  }
  return flInstance;
}
