/**
 * Vera Parallel AI Processor
 * Runs multiple model inferences in parallel for critical queries
 * Selects best response based on confidence and speed
 */

import { logger } from '../monitoring/logger.js';
import { performance } from 'perf_hooks';

interface ParallelRequest {
  query: string;
  providers: string[];
  timeout: number;
  requireConsensus: boolean;
}

interface ModelResponse {
  provider: string;
  response: any;
  latency: number;
  confidence: number;
  success: boolean;
  error?: string;
}

interface ParallelResult {
  winner: ModelResponse;
  allResponses: ModelResponse[];
  consensus: boolean;
  totalTime: number;
}

export class ParallelProcessor {
  private stats = {
    totalParallelCalls: 0,
    consensusReached: 0,
    avgWinnerLatency: 0,
    timeoutCount: 0
  };

  constructor(
    private runModel: (provider: string, query: string) => Promise<any>
  ) {}

  /**
   * Execute parallel inference across multiple models
   */
  async execute(request: ParallelRequest): Promise<ParallelResult> {
    const startTime = performance.now();
    this.stats.totalParallelCalls++;

    logger.info(`Parallel execution: ${request.providers.join(', ')}`, {
      query: request.query.substring(0, 50),
      providers: request.providers.length
    });

    // Race all providers with timeout
    const promises = request.providers.map(provider =>
      this.executeWithTimeout(provider, request.query, request.timeout)
    );

    const results = await Promise.all(promises);
    const successful = results.filter(r => r.success);

    if (successful.length === 0) {
      throw new Error('All parallel models failed');
    }

    // Select winner based on confidence and speed
    const winner = this.selectWinner(successful);

    // Check for consensus if required
    const consensus = request.requireConsensus
      ? this.checkConsensus(successful)
      : true;

    if (consensus) {
      this.stats.consensusReached++;
    }

    const totalTime = performance.now() - startTime;
    this.updateStats(winner, totalTime);

    logger.info(`Parallel result: ${winner.provider} won (${winner.latency}ms)`, {
      totalTime,
      consensus,
      attempts: results.length,
      successful: successful.length
    });

    return {
      winner,
      allResponses: results,
      consensus,
      totalTime
    };
  }

  /**
   * Execute single model with timeout
   */
  private async executeWithTimeout(
    provider: string,
    query: string,
    timeout: number
  ): Promise<ModelResponse> {
    const startTime = performance.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), timeout);
      });

      const response = await Promise.race([
        this.runModel(provider, query),
        timeoutPromise
      ]);

      const latency = performance.now() - startTime;

      // Calculate confidence based on response quality
      const confidence = this.calculateConfidence(response);

      return {
        provider,
        response,
        latency,
        confidence,
        success: true
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMsg.includes('Timeout')) {
        this.stats.timeoutCount++;
      }

      return {
        provider,
        response: null,
        latency: performance.now() - startTime,
        confidence: 0,
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Select best response from successful results
   * Weights: 40% confidence, 30% speed, 30% reliability
   */
  private selectWinner(results: ModelResponse[]): ModelResponse {
    // Score each result
    const scored = results.map(r => {
      const confidenceScore = r.confidence * 0.4;
      const speedScore = (1 / (r.latency / 1000)) * 0.3; // Lower latency = higher score
      const reliabilityScore = (r.success ? 1 : 0) * 0.3;
      
      return {
        ...r,
        totalScore: confidenceScore + speedScore + reliabilityScore
      };
    });

    // Sort by score
    scored.sort((a, b) => b.totalScore - a.totalScore);

    return scored[0];
  }

  /**
   * Calculate response confidence (0-1)
   */
  private calculateConfidence(response: any): number {
    let confidence = 0.5; // base confidence

    // Higher confidence for structured responses
    if (response && typeof response === 'object') {
      confidence += 0.1;

      // Check for error fields
      if (!response.error && !response.errorMessage) {
        confidence += 0.1;
      }

      // Check for completeness
      if (response.result || response.data || response.answer) {
        confidence += 0.1;
      }

      // Check for confidence field from model
      if (typeof response.confidence === 'number') {
        confidence = response.confidence;
      }
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Check if models reached consensus
   */
  private checkConsensus(results: ModelResponse[]): boolean {
    if (results.length < 2) return true;

    // Simple consensus: all responses are similar
    const responses = results.map(r => JSON.stringify(r.response));
    const first = responses[0];
    
    const similarCount = responses.filter(r => r === first).length;
    const consensusRatio = similarCount / responses.length;

    return consensusRatio >= 0.5; // 50% agreement = consensus
  }

  /**
   * Update statistics
   */
  private updateStats(winner: ModelResponse, totalTime: number): void {
    this.stats.avgWinnerLatency = 
      this.stats.avgWinnerLatency * 0.9 + winner.latency * 0.1;
  }

  /**
   * Get parallel processing statistics
   */
  getStats() {
    const total = this.stats.totalParallelCalls;
    const consensusRate = total > 0 
      ? (this.stats.consensusReached / total * 100).toFixed(2)
      : '0';

    return {
      ...this.stats,
      consensusRate: `${consensusRate}%`,
      avgWinnerLatency: Math.round(this.stats.avgWinnerLatency)
    };
  }

  /**
   * Quick parallel execution with default providers
   */
  async quickExecute(query: string): Promise<ParallelResult> {
    return this.execute({
      query,
      providers: ['openai', 'google'], // Fast, reliable models
      timeout: 3000, // 3 second timeout
      requireConsensus: false
    });
  }

  /**
   * Critical parallel execution (slower, more thorough)
   */
  async criticalExecute(query: string): Promise<ParallelResult> {
    return this.execute({
      query,
      providers: ['qvx', 'openai', 'google'], // All capable models
      timeout: 10000, // 10 second timeout
      requireConsensus: true
    });
  }
}
