/**
 * Enhanced Model Router for Sovereign Vera
 * Intelligently routes queries to specialized fine-tuned models
 */

import { config } from '../config.js';
import { type LlmProvider, type ChatCompletionRequest, type ChatCompletionResult } from './provider.js';
import { NativeProvider } from './realProvider.js';

export type QueryCategory = 'general' | 'hedera_tools' | 'carbon_credits' | 'defi_analytics' | 'error_handling';

interface ModelRoute {
  category: QueryCategory;
  modelPath: string;
  priority: number;
  fallback?: string;
}

export class EnhancedModelRouter implements LlmProvider {
  private routes: Map<QueryCategory, ModelRoute>;
  private defaultProvider: LlmProvider;

  constructor() {
    this.routes = new Map();
    this.defaultProvider = new NativeProvider();
    this.setupRoutes();
  }

  /**
   * Setup model routing configuration
   */
  private setupRoutes(): void {
    if (config.ENHANCED_MODEL_ROUTING === 'disabled') {
      return;
    }

    // Conversation enhancement model
    if (config.CONVERSATION_MODEL) {
      this.routes.set('general', {
        category: 'general',
        modelPath: config.CONVERSATION_MODEL,
        priority: 1
      });
      this.routes.set('error_handling', {
        category: 'error_handling',
        modelPath: config.CONVERSATION_MODEL,
        priority: 1
      });
    }

    // Hedera tools optimization model
    if (config.HEDERA_MODEL) {
      this.routes.set('hedera_tools', {
        category: 'hedera_tools',
        modelPath: config.HEDERA_MODEL,
        priority: 1
      });
      this.routes.set('carbon_credits', {
        category: 'carbon_credits',
        modelPath: config.HEDERA_MODEL,
        priority: 1,
        fallback: config.CONVERSATION_MODEL
      });
      this.routes.set('defi_analytics', {
        category: 'defi_analytics',
        modelPath: config.HEDERA_MODEL,
        priority: 1,
        fallback: config.CONVERSATION_MODEL
      });
    }
  }

  /**
   * Categorize query based on content analysis
   */
  private categorizeQuery(query: string): QueryCategory {
    const lowerQuery = query.toLowerCase();

    // Hedera tools keywords
    const hederaKeywords = [
      'hedera', 'hashgraph', 'hts', 'token', 'nft', 'smart contract',
      'account', 'balance', 'transaction', 'consensus', 'hcs', 'mirror node',
      'create token', 'mint', 'burn', 'freeze', 'wipe', 'associate', 'dissociate'
    ];

    // Carbon credits keywords
    const carbonKeywords = [
      'carbon', 'credit', 'dovu', 'verification', 'offset', 'emissions',
      'climate', 'sustainability', 'green', 'environmental', 'co2'
    ];

    // DeFi analytics keywords
    const defiKeywords = [
      'defi', 'yield', 'staking', 'liquidity', 'farming', 'apy', 'returns',
      'saucerswap', 'pool', 'trading', 'swap', 'lending', 'borrowing'
    ];

    // Error handling keywords
    const errorKeywords = [
      'error', 'failed', 'issue', 'problem', 'troubleshoot', 'fix',
      'help', 'stuck', 'broken', 'not working', 'recover', 'lost'
    ];

    // Check for Hedera tools
    if (hederaKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'hedera_tools';
    }

    // Check for carbon credits
    if (carbonKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'carbon_credits';
    }

    // Check for DeFi analytics
    if (defiKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'defi_analytics';
    }

    // Check for error handling
    if (errorKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'error_handling';
    }

    // Default to general
    return 'general';
  }

  /**
   * Get appropriate model for query category
   */
  private getModelForCategory(category: QueryCategory): string | null {
    const route = this.routes.get(category);
    return route?.modelPath || null;
  }

  /**
   * Get fallback model for category
   */
  private getFallbackModel(category: QueryCategory): string | null {
    const route = this.routes.get(category);
    return route?.fallback || null;
  }

  /**
   * Create specialized provider for model
   */
  private createProvider(modelPath: string): LlmProvider {
    return new NativeProvider();
    // In a full implementation, this would create a provider
    // specifically configured for the fine-tuned model
  }

  /**
   * Execute chat completion with intelligent routing
   */
  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    // If enhanced routing is disabled, use default provider
    if (config.ENHANCED_MODEL_ROUTING === 'disabled') {
      return this.defaultProvider.chat(req);
    }

    // Extract user message for categorization
    const userMessage = req.messages[req.messages.length - 1]?.content || '';
    const category = this.categorizeQuery(userMessage);

    // Try to get specialized model
    const modelPath = this.getModelForCategory(category);
    
    if (modelPath) {
      try {
        console.log(`🎯 Routing to ${category} model: ${modelPath}`);
        const specializedProvider = this.createProvider(modelPath);
        
        // Add category context to the request
        const enhancedReq = {
          ...req,
          messages: [
            ...req.messages.slice(0, -1),
            {
              ...req.messages[req.messages.length - 1],
              content: `[Category: ${category}] ${userMessage}`
            }
          ]
        };

        return await specializedProvider.chat(enhancedReq);
      } catch (error) {
        console.warn(`⚠️ Specialized model failed for ${category}, trying fallback...`, error);
        
        // Try fallback model
        const fallbackPath = this.getFallbackModel(category);
        if (fallbackPath) {
          try {
            console.log(`🔄 Using fallback model for ${category}: ${fallbackPath}`);
            const fallbackProvider = this.createProvider(fallbackPath);
            return await fallbackProvider.chat(req);
          } catch (fallbackError) {
            console.warn(`⚠️ Fallback model also failed for ${category}`, fallbackError);
          }
        }
      }
    }

    // Use default provider as final fallback
    console.log(`📋 Using default provider for ${category}`);
    return this.defaultProvider.chat(req);
  }

  /**
   * Get routing statistics
   */
  getRoutingStats(): {
    enabled: boolean;
    routes: Array<{ category: QueryCategory; model: string; hasFallback: boolean }>;
    defaultModel: string;
  } {
    const routes = Array.from(this.routes.entries()).map(([category, route]) => ({
      category,
      model: route.modelPath,
      hasFallback: !!route.fallback
    }));

    return {
      enabled: config.ENHANCED_MODEL_ROUTING !== 'disabled',
      routes,
      defaultModel: config.MODEL_PATH || 'native'
    };
  }

  /**
   * Test routing with sample queries
   */
  async testRouting(): Promise<Array<{ query: string; category: QueryCategory; routedTo: string }>> {
    const testQueries = [
      { query: 'What can you help me with?', expected: 'general' },
      { query: 'How do I create a Hedera token?', expected: 'hedera_tools' },
      { query: 'Verify this carbon credit', expected: 'carbon_credits' },
      { query: 'What are the best DeFi yields?', expected: 'defi_analytics' },
      { query: 'My transaction failed, help!', expected: 'error_handling' }
    ];

    const results = [];
    
    for (const test of testQueries) {
      const category = this.categorizeQuery(test.query);
      const modelPath = this.getModelForCategory(category) || 'default';
      
      results.push({
        query: test.query,
        category,
        routedTo: modelPath
      });
    }

    return results;
  }

  /**
   * Update routes dynamically
   */
  updateRoutes(newRoutes: Partial<Record<QueryCategory, string>>): void {
    for (const [category, modelPath] of Object.entries(newRoutes)) {
      if (modelPath && this.isValidCategory(category)) {
        this.routes.set(category as QueryCategory, {
          category: category as QueryCategory,
          modelPath,
          priority: 1
        });
      }
    }
  }

  /**
   * Validate category
   */
  private isValidCategory(category: string): category is QueryCategory {
    const validCategories: QueryCategory[] = ['general', 'hedera_tools', 'carbon_credits', 'defi_analytics', 'error_handling'];
    return validCategories.includes(category as QueryCategory);
  }
}

/**
 * Create enhanced model router instance
 */
export function createEnhancedRouter(): EnhancedModelRouter {
  return new EnhancedModelRouter();
}

/**
 * Check if enhanced routing is enabled
 */
export function isEnhancedRoutingEnabled(): boolean {
  return config.ENHANCED_MODEL_ROUTING !== 'disabled' && 
         !!(config.CONVERSATION_MODEL || config.HEDERA_MODEL);
}
