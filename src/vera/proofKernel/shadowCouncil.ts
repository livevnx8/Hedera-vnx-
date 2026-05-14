/**
 * Shadow Council Ensemble
 *
 * Multi-Meridian consensus system for high-confidence scoring.
 * Runs 3-5 Meridian models in parallel with weighted voting and outlier detection.
 */

import { config } from '../../config.js';
import type { VerifiableAITask, MeridianShadowScore } from './types.js';

export interface MeridianInstance {
  id: string;
  url: string;
  tier: 'tiny' | 'medium' | 'compact' | 'plus' | 'external';
  weight: number;
  timeoutMs: number;
  healthy: boolean;
  lastHealthCheck: number;
  avgLatencyMs: number;
  errorRate: number;
}

export interface EnsembleScore {
  recommendation: string;
  confidence: number;
  individualScores: Array<{
    meridianId: string;
    recommendation: string;
    confidence: number;
    weight: number;
    latencyMs: number;
  }>;
  consensus: 'full' | 'partial' | 'none';
  outlierDetected: boolean;
  ensembleLatencyMs: number;
  usedTiers: string[];
  councilMode?: CouncilMode; // Tier: standard, high-stakes, governance, emergency
}

export type CouncilMode = 'standard' | 'high-stakes' | 'governance' | 'emergency';

export interface ConsensusConfig {
  minModels: number;
  maxModels: number;
  outlierThreshold: number; // Standard deviations from mean
  weightsByTier: Record<string, number>;
  timeoutsByTier: Record<string, number>;
  enableDynamicSizing: boolean;
  // Tier-5/7 Governance modes
  governanceMode?: {
    enabled: boolean;
    tier5Threshold: number; // Budget HBAR for 5-Meridian council
    tier7Threshold: number; // Budget HBAR for 7-Meridian council
    hcsAnchorVotes: boolean; // Publish votes to HCS
  };
}

const DEFAULT_CONFIG: ConsensusConfig = {
  minModels: 2,
  maxModels: 3,
  outlierThreshold: 2.0, // 2 standard deviations
  weightsByTier: {
    tiny: 0.1,
    medium: 0.3,
    compact: 0.5, // Primary - your 350M model
    plus: 0.4,
    external: 0.2,
  },
  timeoutsByTier: {
    tiny: 50,
    medium: 100,
    compact: 200,
    plus: 300,
    external: 1000,
  },
  enableDynamicSizing: true,
  governanceMode: {
    enabled: true,
    tier5Threshold: 1000, // 1000 HBAR
    tier7Threshold: 10000, // 10000 HBAR
    hcsAnchorVotes: true,
  },
};

export class ShadowCouncil {
  private instances: MeridianInstance[] = [];
  private config: ConsensusConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<ConsensusConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeInstances();
    this.startHealthChecks();
  }

  /**
   * Initialize Meridian instances from configuration
   */
  private initializeInstances(): void {
    // Primary: 350M model (training in progress)
    this.instances.push({
      id: 'meridian-compact-primary',
      url: config.MERIDIAN_TIER_COMPACT_URL || 'http://localhost:8123',
      tier: 'compact',
      weight: this.config.weightsByTier.compact,
      timeoutMs: this.config.timeoutsByTier.compact,
      healthy: true,
      lastHealthCheck: Date.now(),
      avgLatencyMs: 0,
      errorRate: 0,
    });

    // Optional: Medium tier (260M) - CPU optimized
    if (config.MERIDIAN_TIER_MEDIUM_URL) {
      this.instances.push({
        id: 'meridian-medium-secondary',
        url: config.MERIDIAN_TIER_MEDIUM_URL,
        tier: 'medium',
        weight: this.config.weightsByTier.medium,
        timeoutMs: this.config.timeoutsByTier.medium,
        healthy: true,
        lastHealthCheck: Date.now(),
        avgLatencyMs: 0,
        errorRate: 0,
      });
    }

    // Optional: External API (GPT-4/Claude) for edge cases
    if (config.MERIDIAN_TIER_EXTERNAL_API_KEY) {
      this.instances.push({
        id: 'meridian-external-fallback',
        url: 'https://api.openai.com/v1',
        tier: 'external',
        weight: this.config.weightsByTier.external,
        timeoutMs: this.config.timeoutsByTier.external,
        healthy: true,
        lastHealthCheck: Date.now(),
        avgLatencyMs: 0,
        errorRate: 0,
      });
    }

    // Parse additional URLs from MERIDIAN_URLS
    if (config.MERIDIAN_URLS) {
      const urls = config.MERIDIAN_URLS.split(',').filter(u => u.trim());
      urls.forEach((url, idx) => {
        if (!this.instances.find(i => i.url === url.trim())) {
          this.instances.push({
            id: `meridian-ensemble-${idx}`,
            url: url.trim(),
            tier: 'medium',
            weight: 0.3,
            timeoutMs: 300,
            healthy: true,
            lastHealthCheck: Date.now(),
            avgLatencyMs: 0,
            errorRate: 0,
          });
        }
      });
    }

    console.log(`🎭 Shadow Council initialized with ${this.instances.length} Meridian instances`);
    this.instances.forEach(m => console.log(`   - ${m.id} (${m.tier}): ${m.url}`));
  }

  /**
   * Score task using multi-Meridian ensemble
   * Supports Tier-5 (5 Meridians) and Tier-7 (7 Meridians) for governance
   */
  async scoreTask(
    task: VerifiableAITask,
    candidateAgentIds: string[],
    options: {
      minConsensus?: number;
      maxLatencyMs?: number;
      requireHighStakes?: boolean;
      councilMode?: CouncilMode;
    } = {}
  ): Promise<EnsembleScore> {
    const startTime = Date.now();
    const minConsensus = options.minConsensus || this.config.minModels;
    const maxLatency = options.maxLatencyMs || 500;

    // Determine council size based on stakes and governance mode
    const stakes = task.budgetHbar || 0;
    const governanceMode = this.config.governanceMode;
    
    let requiredModels: number;
    let councilMode = options.councilMode || 'standard';
    
    if (governanceMode?.enabled) {
      if (stakes >= governanceMode.tier7Threshold || options.councilMode === 'emergency') {
        requiredModels = 7; // Tier-7: Emergency/governance decisions
        councilMode = 'emergency';
      } else if (stakes >= governanceMode.tier5Threshold || options.councilMode === 'governance') {
        requiredModels = 5; // Tier-5: High-stakes governance
        councilMode = 'governance';
      } else if (stakes > 1000 || options.requireHighStakes) {
        requiredModels = this.config.maxModels; // Tier-3: Standard high-stakes
        councilMode = 'high-stakes';
      } else {
        requiredModels = this.config.minModels; // Tier-1/2: Standard
        councilMode = 'standard';
      }
    } else {
      const isHighStakes = stakes > 1000 || options.requireHighStakes;
      requiredModels = isHighStakes ? this.config.maxModels : this.config.minModels;
    }

    // Get healthy instances
    const healthyInstances = this.instances.filter(i => i.healthy);
    if (healthyInstances.length < minConsensus) {
      throw new Error(`Only ${healthyInstances.length} healthy Meridians available (need ${minConsensus})`);
    }

    // Select optimal instances
    const selectedInstances = healthyInstances
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.min(requiredModels, healthyInstances.length));

    console.log(`🎭 Shadow Council [${councilMode}] scoring with ${selectedInstances.length} Meridians for task ${task.taskId}`);

    // Parallel scoring with individual timeouts
    const scorePromises = selectedInstances.map(async (instance) => {
      const instanceStart = Date.now();
      try {
        const score = await this.scoreWithInstance(task, candidateAgentIds, instance);
        const latencyMs = Date.now() - instanceStart;
        this.updateInstanceMetrics(instance, latencyMs, true);
        return { instance, score, latencyMs, success: true };
      } catch (error) {
        const latencyMs = Date.now() - instanceStart;
        this.updateInstanceMetrics(instance, latencyMs, false);
        console.error(`[ShadowCouncil] ${instance.id} failed:`, error);
        return { instance, score: null, latencyMs, success: false };
      }
    });

    // Wait for all with global timeout
    const results = await Promise.all(scorePromises);
    const successfulResults = results.filter(r => r.success && r.score !== null);

    if (successfulResults.length < minConsensus) {
      throw new Error(`Only ${successfulResults.length} Meridians succeeded (need ${minConsensus})`);
    }

    // Calculate consensus
    const ensembleLatencyMs = Date.now() - startTime;
    const consensusResult = this.calculateConsensus(successfulResults);

    return {
      recommendation: consensusResult.recommendation,
      confidence: consensusResult.confidence,
      individualScores: successfulResults.map(r => ({
        meridianId: r.instance.id,
        recommendation: r.score?.recommendation || 'none',
        confidence: r.score?.confidence || 0,
        weight: r.instance.weight,
        latencyMs: r.latencyMs,
      })),
      consensus: consensusResult.consensusLevel,
      outlierDetected: consensusResult.outlierDetected,
      ensembleLatencyMs,
      usedTiers: [...new Set(successfulResults.map(r => r.instance.tier))],
      councilMode,
    };
  }

  /**
   * Score with single Meridian instance
   */
  private async scoreWithInstance(
    task: VerifiableAITask,
    candidateAgentIds: string[],
    instance: MeridianInstance
  ): Promise<MeridianShadowScore> {
    // This would call the actual Meridian HTTP endpoint
    // For now, return a mock response
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), instance.timeoutMs);

    try {
      const response = await fetch(`${instance.url}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, candidateAgentIds }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json() as MeridianShadowScore;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Calculate weighted consensus from multiple scores
   */
  private calculateConsensus(
    results: Array<{ instance: MeridianInstance; score: MeridianShadowScore | null; latencyMs: number; success: boolean }>
  ): {
    recommendation: string;
    confidence: number;
    consensusLevel: 'full' | 'partial' | 'none';
    outlierDetected: boolean;
  } {
    const validResults = results.filter(r => r.success && r.score !== null);
    if (validResults.length === 0) {
      return { recommendation: 'none', confidence: 0, consensusLevel: 'none', outlierDetected: false };
    }

    // Group by recommendation
    const recommendationGroups = new Map<string, Array<{ weight: number; confidence: number }>>();
    validResults.forEach(r => {
      const rec = r.score!.recommendation || 'none';
      if (!recommendationGroups.has(rec)) {
        recommendationGroups.set(rec, []);
      }
      recommendationGroups.get(rec)!.push({
        weight: r.instance.weight,
        confidence: r.score!.confidence || 0,
      });
    });

    // Calculate weighted scores for each recommendation
    let bestRecommendation = 'none';
    let bestWeightedScore = 0;

    recommendationGroups.forEach((scores, rec) => {
      const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
      const weightedConfidence = scores.reduce((sum, s) => sum + s.confidence * s.weight, 0) / totalWeight;

      if (weightedConfidence > bestWeightedScore) {
        bestRecommendation = rec;
        bestWeightedScore = weightedConfidence;
      }
    });

    // Detect outliers using standard deviation
    const confidences = validResults.map(r => r.score!.confidence || 0);
    const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
    const stdDev = Math.sqrt(variance);
    const outlierDetected = confidences.some(c => Math.abs(c - mean) > this.config.outlierThreshold * stdDev);

    // Determine consensus level
    const consensusRatio = (recommendationGroups.get(bestRecommendation)?.length || 0) / validResults.length;
    const consensusLevel = consensusRatio >= 0.8 ? 'full' : consensusRatio >= 0.5 ? 'partial' : 'none';

    return {
      recommendation: bestRecommendation,
      confidence: bestWeightedScore,
      consensusLevel,
      outlierDetected,
    };
  }

  /**
   * Update instance performance metrics
   */
  private updateInstanceMetrics(instance: MeridianInstance, latencyMs: number, success: boolean): void {
    // Exponential moving average for latency
    const alpha = 0.3;
    instance.avgLatencyMs = instance.avgLatencyMs === 0
      ? latencyMs
      : alpha * latencyMs + (1 - alpha) * instance.avgLatencyMs;

    // Error rate (exponential moving average)
    instance.errorRate = alpha * (success ? 0 : 1) + (1 - alpha) * instance.errorRate;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.instances.forEach(async (instance) => {
        try {
          // Simple health check
          const response = await fetch(`${instance.url}/health`, {
            method: 'GET',
            timeout: 5000,
          } as RequestInit);
          instance.healthy = response.ok;
          instance.lastHealthCheck = Date.now();
        } catch {
          instance.healthy = false;
        }
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Get council statistics
   */
  getStats(): {
    totalInstances: number;
    healthyInstances: number;
    averageLatencyMs: number;
    totalWeight: number;
    instances: MeridianInstance[];
  } {
    const healthy = this.instances.filter(i => i.healthy);
    const totalLatency = healthy.reduce((sum, i) => sum + i.avgLatencyMs, 0);

    return {
      totalInstances: this.instances.length,
      healthyInstances: healthy.length,
      averageLatencyMs: healthy.length > 0 ? totalLatency / healthy.length : 0,
      totalWeight: healthy.reduce((sum, i) => sum + i.weight, 0),
      instances: [...this.instances],
    };
  }

  /**
   * Stop health checks
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

// Global shadow council instance
export const shadowCouncil = new ShadowCouncil();
