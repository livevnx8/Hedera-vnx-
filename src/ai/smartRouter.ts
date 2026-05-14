/**
 * Vera Smart Model Router
 * Intelligent routing between QVX, OpenAI, Google, and Native AI runners
 * Routes based on query complexity, latency, and availability
 */

import { logger } from '../monitoring/logger.js';
import { performance } from 'perf_hooks';

interface ModelConfig {
  name: string;
  provider: 'qvx' | 'openai' | 'google' | 'native';
  latencyMs: number;
  capability: number; // 1-10 scale
  cost: number; // relative cost
  available: boolean;
  lastUsed: number;
  errorRate: number;
}

interface RoutingDecision {
  provider: string;
  model: string;
  confidence: number;
  estimatedLatency: number;
  fallbackChain: string[];
}

export class SmartModelRouter {
  private models: Map<string, ModelConfig> = new Map();
  private stats = {
    totalRequests: 0,
    cacheHits: 0,
    avgLatency: 0,
    routingAccuracy: 0
  };

  constructor() {
    this.initializeModels();
  }

  private initializeModels(): void {
    // QVX - High capability, higher latency
    this.models.set('qvx', {
      name: 'QVX Quantum',
      provider: 'qvx',
      latencyMs: 500,
      capability: 10,
      cost: 3,
      available: true,
      lastUsed: 0,
      errorRate: 0.02
    });

    // OpenAI - Balanced
    this.models.set('openai', {
      name: 'OpenAI GPT',
      provider: 'openai',
      latencyMs: 200,
      capability: 8,
      cost: 2,
      available: true,
      lastUsed: 0,
      errorRate: 0.01
    });

    // Google - Fast, good for simple queries
    this.models.set('google', {
      name: 'Google Gemini',
      provider: 'google',
      latencyMs: 150,
      capability: 7,
      cost: 1,
      available: true,
      lastUsed: 0,
      errorRate: 0.015
    });

    // Native - Fastest, for simple queries
    this.models.set('native', {
      name: 'Native Vera',
      provider: 'native',
      latencyMs: 50,
      capability: 5,
      cost: 0.5,
      available: true,
      lastUsed: 0,
      errorRate: 0.05
    });
  }

  /**
   * Analyze query complexity (1-10 scale)
   */
  private analyzeComplexity(query: string): number {
    let complexity = 5; // default medium

    // Simple queries (low complexity)
    const simplePatterns = [
      /^(what|how|where|when|who|is|are|can|do)/i,
      /^(show|list|get|find)/i,
      /^status/i,
      /^help/i
    ];

    for (const pattern of simplePatterns) {
      if (pattern.test(query)) {
        complexity = 3;
        break;
      }
    }

    // Complex queries (high complexity)
    const complexPatterns = [
      /analyze|evaluate|compare|synthesize/i,
      /multiple|batch|bulk|all/i,
      /optimize|improve|enhance/i,
      /debug|troubleshoot|investigate/i,
      /create|build|develop|implement/i
    ];

    for (const pattern of complexPatterns) {
      if (pattern.test(query)) {
        complexity = 8;
        break;
      }
    }

    // Query length factor
    if (query.length > 200) complexity += 1;
    if (query.length > 500) complexity += 2;

    // Hedera-specific complexity
    if (query.includes('transaction') || query.includes('contract')) {
      complexity += 1;
    }

    return Math.min(10, Math.max(1, complexity));
  }

  /**
   * Calculate routing score for each model
   */
  private calculateScores(complexity: number): Array<{ provider: string; score: number; config: ModelConfig }> {
    const scores: Array<{ provider: string; score: number; config: ModelConfig }> = [];

    for (const [provider, config] of this.models) {
      if (!config.available) continue;

      // Capability match (higher is better for complex queries)
      const capabilityScore = config.capability >= complexity ? 10 : (config.capability / complexity) * 10;

      // Latency score (lower latency = higher score)
      const latencyScore = Math.max(0, 10 - (config.latencyMs / 100));

      // Reliability score
      const reliabilityScore = (1 - config.errorRate) * 10;

      // Cost score (lower cost = higher score for simple queries)
      const costScore = complexity > 7 ? (10 - config.cost) : (10 - config.cost * 2);

      // Recency penalty (avoid using same model repeatedly if alternatives exist)
      const recencyPenalty = (Date.now() - config.lastUsed) < 5000 ? 2 : 0;

      // Weighted total
      const score = (
        capabilityScore * 0.3 +
        latencyScore * 0.3 +
        reliabilityScore * 0.2 +
        costScore * 0.1
      ) - recencyPenalty;

      scores.push({ provider, score, config });
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Route query to optimal model
   */
  route(query: string, options?: { preferredProvider?: string; timeout?: number }): RoutingDecision {
    const startTime = performance.now();
    this.stats.totalRequests++;

    const complexity = this.analyzeComplexity(query);
    const scores = this.calculateScores(complexity);

    if (scores.length === 0) {
      throw new Error('No AI models available');
    }

    // Primary selection
    const primary = scores[0];
    const fallbacks = scores.slice(1).map(s => s.provider);

    // Update last used
    primary.config.lastUsed = Date.now();

    const decision: RoutingDecision = {
      provider: primary.provider,
      model: primary.config.name,
      confidence: primary.score / 10,
      estimatedLatency: primary.config.latencyMs,
      fallbackChain: fallbacks
    };

    // Log routing decision
    logger.info('Smart routing decision', {
      query: query.substring(0, 50),
      complexity,
      provider: decision.provider,
      confidence: decision.confidence.toFixed(2),
      estimatedLatency: decision.estimatedLatency,
      routingTime: (performance.now() - startTime).toFixed(2) + 'ms'
    });

    return decision;
  }

  /**
   * Get routing statistics
   */
  getStats() {
    return {
      ...this.stats,
      modelAvailability: Object.fromEntries(
        Array.from(this.models).map(([k, v]) => [k, v.available])
      )
    };
  }

  /**
   * Mark model as unavailable (for error handling)
   */
  markUnavailable(provider: string): void {
    const model = this.models.get(provider);
    if (model) {
      model.available = false;
      model.errorRate = Math.min(1, model.errorRate + 0.1);
      logger.warn(`Model ${provider} marked unavailable`);

      // Auto-recover after 60 seconds
      setTimeout(() => {
        model.available = true;
        logger.info(`Model ${provider} auto-recovered`);
      }, 60000);
    }
  }

  /**
   * Update model performance metrics
   */
  updateMetrics(provider: string, actualLatency: number, success: boolean): void {
    const model = this.models.get(provider);
    if (model) {
      // Update latency with exponential moving average
      model.latencyMs = model.latencyMs * 0.8 + actualLatency * 0.2;

      // Update error rate
      if (!success) {
        model.errorRate = model.errorRate * 0.9 + 0.1;
      } else {
        model.errorRate = model.errorRate * 0.95;
      }
    }
  }
}

// Singleton instance
export const smartRouter = new SmartModelRouter();
