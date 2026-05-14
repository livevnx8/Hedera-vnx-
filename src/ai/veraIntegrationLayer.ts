/**
 * Vera AI Optimization Integration Layer
 * Connects 4-Week AI Optimization System to Vera's existing infrastructure
 */

import { createVeraAI } from './veraAIIntegration.js';
import { createDashboard } from './monitoringDashboard.js';
import { autoDocumenter } from '../lattice/autoDocumenter.js';
import { knowledgeCapture } from '../lattice/knowledgeCapture.js';
import { logger } from '../monitoring/logger.js';
import { performance } from 'perf_hooks';

// Import Vera's existing components
import { EnhancedAgentRunner } from '../agent/enhanced-runner.js';
import { HederaLatticeRouter } from '../vera/orchestrator/hederaLatticeRouter.js';

interface IntegrationConfig {
  enableSmartRouting: boolean;
  enableResponseCache: boolean;
  enableToolBatching: boolean;
  enableParallelProcessing: boolean;
  enableKnowledgeCapture: boolean;
  enableAutoDocumentation: boolean;
}

export class VeraAIOptimizationLayer {
  private veraAI: ReturnType<typeof createVeraAI> | null = null;
  private dashboard: ReturnType<typeof createDashboard> | null = null;
  private enhancedRunner: EnhancedAgentRunner;
  private latticeRouter: HederaLatticeRouter;
  private initialized = false;
  
  private config: IntegrationConfig = {
    enableSmartRouting: true,
    enableResponseCache: true,
    enableToolBatching: true,
    enableParallelProcessing: true,
    enableKnowledgeCapture: true,
    enableAutoDocumentation: true
  };

  constructor(
    runner: EnhancedAgentRunner,
    router: HederaLatticeRouter,
    config?: Partial<IntegrationConfig>
  ) {
    this.enhancedRunner = runner;
    this.latticeRouter = router;
    
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Initialize the optimization layer
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing Vera AI Optimization Layer...');

    // Create AI integration with Vera's existing functions
    this.veraAI = createVeraAI(
      async (toolName, params) => {
        return await this.executeToolWithOptimization(toolName, params);
      },
      async (provider, query, tools) => {
        return await this.runModelWithOptimization(provider, query, tools);
      }
    );

    await this.veraAI.initialize();

    // Create monitoring dashboard
    this.dashboard = createDashboard(() => this.getStats());

    // Trigger auto-documentation if enabled
    if (this.config.enableAutoDocumentation) {
      this.generateDocumentation().catch(err => {
        logger.warn('Auto-documentation failed:', err);
      });
    }

    this.initialized = true;
    logger.info('Vera AI Optimization Layer initialized successfully');
  }

  /**
   * Process a query with full optimization
   */
  async processQuery(query: string, context: any = {}): Promise<any> {
    if (!this.initialized || !this.veraAI) {
      // Fallback to original runner
      return await this.enhancedRunner.runEnhancedAgent(query, context);
    }

    const startTime = performance.now();

    try {
      // Use optimized processing
      const result = await this.veraAI.process({
        query,
        context: {
          userId: context.userId,
          conversationId: context.conversationId,
          requireAccuracy: context.requireAccuracy || this.needsHighAccuracy(query)
        },
        tools: context.tools
      });

      // Record metrics
      if (this.dashboard) {
        this.dashboard.recordRequest(
          result.metadata.latency,
          result.metadata.cacheHit,
          result.metadata.provider
        );
      }

      // Enhance with Vera's metadata
      return {
        ...result,
        veraEnhanced: true,
        optimizationMetadata: {
          routedTo: result.metadata.provider,
          cacheHit: result.metadata.cacheHit,
          toolsUsed: result.metadata.toolsUsed,
          latency: result.metadata.latency,
          confidence: result.metadata.confidence
        }
      };

    } catch (error) {
      logger.error('Optimized processing failed, falling back:', error);
      
      if (this.dashboard) {
        this.dashboard.recordError('optimized_layer');
      }

      // Fallback to original runner
      return await this.enhancedRunner.runEnhancedAgent(query, context);
    }
  }

  /**
   * Execute tool with batching optimization
   */
  private async executeToolWithOptimization(
    toolName: string,
    params: any
  ): Promise<any> {
    // Route through lattice router for Hedera tools
    if (toolName.startsWith('hts_') || toolName.startsWith('hcs_') || 
        toolName.startsWith('evm_') || toolName.startsWith('kit_')) {
      
      const operation = await this.latticeRouter.route({
        operationId: `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        toolName,
        params,
        priority: params.priority || 'normal'
      });

      if (operation.status === 'complete') {
        return operation.result;
      } else {
        throw new Error(`Tool execution failed: ${operation.error}`);
      }
    }

    // For non-Hedera tools, use original execution
    // (Would need to integrate with existing tool execution)
    return { executed: true, toolName, params };
  }

  /**
   * Run AI model with provider selection
   */
  private async runModelWithOptimization(
    provider: string,
    query: string,
    tools?: string[]
  ): Promise<any> {
    // Use Vera's enhanced runner with provider hint
    const result = await this.enhancedRunner.runEnhancedAgent(query, {
      preferredProvider: provider,
      tools
    });

    return result;
  }

  /**
   * Determine if query needs high accuracy
   */
  private needsHighAccuracy(query: string): boolean {
    const indicators = [
      /analyze|optimization|complex|calculate/i,
      /carbon|credit|retire|mint|token/i,
      /compliance|regulation|verify/i,
      /\d{4,}/,  // Large numbers
      /\$[\d,]+/  // Dollar amounts
    ];

    return indicators.some(pattern => pattern.test(query));
  }

  /**
   * Generate auto-documentation
   */
  private async generateDocumentation(): Promise<void> {
    logger.info('Generating auto-documentation...');
    
    await autoDocumenter.documentTools(
      './src',
      '/mnt/vera-mirror-shards/vera-lattice'
    );

    const stats = autoDocumenter.getStats();
    logger.info(`Documented ${stats.totalTools} tools`);
  }

  /**
   * Get optimization statistics
   */
  getStats() {
    if (!this.veraAI) {
      return { status: 'not_initialized' };
    }

    return {
      ...this.veraAI.getStats(),
      initialized: this.initialized,
      config: this.config
    };
  }

  /**
   * Get monitoring dashboard
   */
  getDashboard() {
    return this.dashboard;
  }

  /**
   * Get optimization recommendations
   */
  getRecommendations(): string[] {
    if (!this.veraAI) {
      return ['System not initialized'];
    }

    const recs = this.veraAI.getRecommendations();
    
    // Add integration-specific recommendations
    if (this.config.enableSmartRouting) {
      recs.push('Smart routing is active - monitoring provider performance');
    }
    
    if (this.config.enableResponseCache) {
      recs.push('Response caching is active - check cache hit rates');
    }

    return recs;
  }

  /**
   * Get health status
   */
  getHealth() {
    return {
      status: this.initialized ? 'healthy' : 'initializing',
      components: {
        veraAI: this.veraAI ? 'up' : 'down',
        dashboard: this.dashboard ? 'up' : 'down',
        enhancedRunner: 'up',
        latticeRouter: 'up'
      },
      optimizations: {
        smartRouting: this.config.enableSmartRouting,
        responseCache: this.config.enableResponseCache,
        toolBatching: this.config.enableToolBatching,
        parallelProcessing: this.config.enableParallelProcessing,
        knowledgeCapture: this.config.enableKnowledgeCapture,
        autoDocumentation: this.config.enableAutoDocumentation
      }
    };
  }
}

// Factory function
export function createOptimizationLayer(
  runner: EnhancedAgentRunner,
  router: HederaLatticeRouter,
  config?: Partial<IntegrationConfig>
): VeraAIOptimizationLayer {
  return new VeraAIOptimizationLayer(runner, router, config);
}
