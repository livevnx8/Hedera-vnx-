/**
 * Vera AI Integration Hub
 * Integrates Smart Router, Response Cache, Tool Optimizer, and Parallel Processor
 * Into Vera's existing agent runner system
 */

import { smartRouter } from './smartRouter.js';
import { responseCache } from './responseCache.js';
import { ToolOptimizer } from './toolOptimizer.js';
import { ParallelProcessor } from './parallelProcessor.js';
import { knowledgeCapture } from '../lattice/knowledgeCapture.js';
import { logger } from '../monitoring/logger.js';
import { performance } from 'perf_hooks';

interface AIRequest {
  query: string;
  context?: {
    userId?: string;
    conversationId?: string;
    preferredProvider?: string;
    requireAccuracy?: boolean;
  };
  tools?: string[];
}

interface AIResponse {
  answer: any;
  metadata: {
    provider: string;
    model: string;
    latency: number;
    cacheHit: boolean;
    toolsUsed: string[];
    confidence: number;
    routingReason: string;
  };
}

export class VeraAIIntegration {
  private toolOptimizer: ToolOptimizer;
  private parallelProcessor: ParallelProcessor;
  private initialized = false;

  // Metrics
  private metrics = {
    totalRequests: 0,
    cacheHits: 0,
    avgLatency: 0,
    toolCalls: 0,
    parallelCalls: 0
  };

  constructor(
    private executeTool: (toolName: string, params: any) => Promise<any>,
    private runModel: (provider: string, query: string, tools?: string[]) => Promise<any>
  ) {
    this.toolOptimizer = new ToolOptimizer(executeTool);
    this.parallelProcessor = new ParallelProcessor(runModel);
  }

  async initialize(): Promise<void> {
    await responseCache.initialize();
    this.initialized = true;
    logger.info('Vera AI Integration initialized');
  }

  /**
   * Main entry point - process AI query with full optimization
   */
  async process(request: AIRequest): Promise<AIResponse> {
    const startTime = performance.now();
    this.metrics.totalRequests++;

    try {
      // 1. Check cache first
      const cached = await responseCache.get(request.query);
      if (cached.response && cached.source) {
        this.metrics.cacheHits++;
        return {
          answer: cached.response,
          metadata: {
            provider: 'cache',
            model: 'cached',
            latency: performance.now() - startTime,
            cacheHit: true,
            toolsUsed: [],
            confidence: 0.95,
            routingReason: `Cache ${cached.source} hit`
          }
        };
      }

      // 2. Route to optimal model
      const routing = smartRouter.route(request.query, {
        preferredProvider: request.context?.preferredProvider
      });

      // 3. Execute with optimization
      let result: any;
      let provider = routing.provider;
      let toolsUsed: string[] = [];

      // High accuracy requirement = parallel execution
      if (request.context?.requireAccuracy && routing.confidence < 0.8) {
        this.metrics.parallelCalls++;
        const parallelResult = await this.parallelProcessor.criticalExecute(request.query);
        result = parallelResult.winner.response;
        provider = parallelResult.winner.provider;
      } else {
        // Single model execution
        result = await this.runModel(provider, request.query, request.tools);
      }

      // 4. Execute tools if needed
      if (request.tools && request.tools.length > 0) {
        const toolResults = await Promise.all(
          request.tools.map(tool => 
            this.toolOptimizer.call(tool, { query: request.query }, 'normal')
          )
        );
        toolsUsed = request.tools;
      }

      const latency = performance.now() - startTime;
      this.updateMetrics(latency);

      // 5. Cache result
      await responseCache.set(request.query, result);

      // 6. Capture knowledge
      knowledgeCapture.capture({
        query: request.query,
        context: {
          provider,
          model: routing.model,
          toolsUsed,
          latency
        },
        response: {
          success: true,
          result,
          confidence: routing.confidence
        },
        outcome: {
          userSatisfaction: 'positive'
        },
        pattern: {
          intent: this.extractIntent(request.query),
          complexity: this.estimateComplexity(request.query),
          domain: this.detectDomain(request.query)
        }
      });

      // 7. Return response
      return {
        answer: result,
        metadata: {
          provider,
          model: routing.model,
          latency,
          cacheHit: false,
          toolsUsed,
          confidence: routing.confidence,
          routingReason: `Routed to ${provider} (confidence: ${(routing.confidence * 100).toFixed(1)}%)`
        }
      };

    } catch (error) {
      logger.error('AI processing failed:', error);

      // Fallback to native
      try {
        const fallback = await this.runModel('native', request.query);
        return {
          answer: fallback,
          metadata: {
            provider: 'native',
            model: 'vera-native',
            latency: performance.now() - startTime,
            cacheHit: false,
            toolsUsed: [],
            confidence: 0.6,
            routingReason: 'Fallback after error'
          }
        };
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
  }

  /**
   * Quick processing for simple queries
   */
  async quickProcess(query: string): Promise<AIResponse> {
    return this.process({
      query,
      context: { requireAccuracy: false }
    });
  }

  /**
   * Batch process multiple queries
   */
  async batchProcess(queries: string[]): Promise<AIResponse[]> {
    return Promise.all(queries.map(q => this.quickProcess(q)));
  }

  /**
   * Extract intent from query
   */
  private extractIntent(query: string): string {
    const intents = [
      { pattern: /create|mint|issue/i, intent: 'create' },
      { pattern: /get|show|display|view/i, intent: 'retrieve' },
      { pattern: /transfer|send|move/i, intent: 'transfer' },
      { pattern: /delete|remove|burn/i, intent: 'delete' },
      { pattern: /update|modify|change/i, intent: 'update' },
      { pattern: /analyze|check|verify/i, intent: 'analyze' }
    ];

    for (const { pattern, intent } of intents) {
      if (pattern.test(query)) return intent;
    }

    return 'general';
  }

  /**
   * Estimate query complexity
   */
  private estimateComplexity(query: string): number {
    let complexity = 5;
    if (query.length > 200) complexity += 2;
    if (query.includes('and') || query.includes(',')) complexity += 1;
    if (/analyze|optimize|debug|complex/i.test(query)) complexity += 2;
    return Math.min(10, complexity);
  }

  /**
   * Detect domain from query
   */
  private detectDomain(query: string): string {
    if (/carbon|co2|emission|offset/i.test(query)) return 'carbon';
    if (/token|hts|hcs|account|transaction/i.test(query)) return 'hedera';
    if (/model|ai|generate|chat/i.test(query)) return 'ai';
    return 'general';
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(latency: number): void {
    this.metrics.avgLatency = this.metrics.avgLatency * 0.9 + latency * 0.1;
  }

  /**
   * Get integration statistics
   */
  getStats() {
    const cacheRate = this.metrics.totalRequests > 0
      ? (this.metrics.cacheHits / this.metrics.totalRequests * 100).toFixed(2)
      : '0';

    return {
      ...this.metrics,
      cacheHitRate: `${cacheRate}%`,
      avgLatency: Math.round(this.metrics.avgLatency),
      routerStats: smartRouter.getStats(),
      cacheStats: responseCache.getStats(),
      toolStats: this.toolOptimizer.getStats(),
      parallelStats: this.parallelProcessor.getStats()
    };
  }

  /**
   * Get optimization recommendations
   */
  getRecommendations(): string[] {
    const recs: string[] = [];
    const stats = this.getStats();

    if (stats.cacheHitRate && parseFloat(stats.cacheHitRate) < 50) {
      recs.push('Cache hit rate low - consider preloading common queries');
    }

    if (stats.avgLatency > 500) {
      recs.push('High latency detected - check model routing');
    }

    if (stats.toolStats.accuracy < 0.95) {
      recs.push('Tool accuracy below target - review tool definitions');
    }

    return recs;
  }
}

// Export singleton factory
export const createVeraAI = (
  executeTool: (toolName: string, params: any) => Promise<any>,
  runModel: (provider: string, query: string, tools?: string[]) => Promise<any>
) => new VeraAIIntegration(executeTool, runModel);
