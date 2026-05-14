/**
 * Tool Fallback System
 * 
 * Provides fallback chains for tools that may have multiple data sources.
 * When primary source fails, automatically tries backup sources.
 */

import { logger } from '../../monitoring/logger.js';
import type { ToolResult } from './router.js';

export interface FallbackStrategy {
  primary: string;
  fallback1?: string;
  fallback2?: string;
  cacheResult: boolean;
  transformResult?: (result: any, source: string) => any;
}

export class ToolFallbacks {
  private fallbacks: Map<string, FallbackStrategy> = new Map();
  private toolExecutor: (tool: string, args: any) => Promise<ToolResult>;
  private resultCache: Map<string, { result: any; timestamp: number }> = new Map();

  constructor(executor: (tool: string, args: any) => Promise<ToolResult>) {
    this.toolExecutor = executor;
    this.registerDefaults();
  }

  /**
   * Register a fallback strategy for a tool
   */
  register(tool: string, strategy: FallbackStrategy): void {
    this.fallbacks.set(tool, strategy);
    logger.info('ToolFallbacks', { 
      message: 'Fallback registered', 
      tool, 
      primary: strategy.primary 
    });
  }

  /**
   * Execute tool with fallback chain
   */
  async executeWithFallback(tool: string, args: any): Promise<ToolResult> {
    const strategy = this.fallbacks.get(tool);
    
    if (!strategy) {
      // No fallback strategy, execute directly
      return await this.toolExecutor(tool, args);
    }

    const attempts = [
      strategy.primary,
      strategy.fallback1,
      strategy.fallback2,
    ].filter(Boolean) as string[];

    const errors: string[] = [];

    for (const attempt of attempts) {
      try {
        const result = await this.toolExecutor(attempt, args);
        
        if (result.success) {
          // Transform result if needed
          const finalResult = strategy.transformResult 
            ? { 
                ...result, 
                data: strategy.transformResult(result.data, attempt),
                source: attempt 
              }
            : { ...result, source: attempt };

          // Cache if configured
          if (strategy.cacheResult) {
            this.cacheResult(tool, args, finalResult);
          }

          logger.info('ToolFallbacks', { 
            message: 'Fallback succeeded', 
            tool, 
            source: attempt,
            attempts: errors.length + 1 
          });

          return finalResult;
        } else {
          errors.push(`${attempt}: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${attempt}: ${errorMsg}`);
        
        logger.warn('ToolFallbacks', { 
          message: 'Fallback attempt failed', 
          tool, 
          attempt,
          error: errorMsg 
        });
      }
    }

    // All fallbacks failed
    return { 
      success: false, 
      error: 'All fallback sources failed',
      attempted: attempts,
      errors,
    };
  }

  /**
   * Register default fallback strategies
   */
  private registerDefaults(): void {
    // Price data fallbacks
    this.register('get_token_price', {
      primary: 'chainlink_get_price',
      fallback1: 'coingecko_get_price',
      fallback2: 'mirror_node_get_price',
      cacheResult: true,
      transformResult: (data, source) => ({
        ...data,
        priceSource: source,
        confidence: this.getPriceConfidence(source),
      }),
    });

    // Balance fallbacks
    this.register('get_balance', {
      primary: 'mirror_node_get_balance',
      fallback1: 'consensus_node_get_balance',
      cacheResult: false, // Balance changes frequently
    });

    // Transaction status fallbacks
    this.register('get_transaction_status', {
      primary: 'mirror_node_get_transaction',
      fallback1: 'consensus_node_get_transaction',
      fallback2: 'hashscan_get_transaction',
      cacheResult: true,
    });

    // Account info fallbacks
    this.register('get_account_info', {
      primary: 'mirror_node_get_account',
      fallback1: 'kit_get_account',
      fallback2: 'consensus_node_get_account',
      cacheResult: true,
    });

    // Token info fallbacks
    this.register('get_token_info', {
      primary: 'kit_get_token_info',
      fallback1: 'mirror_node_get_token',
      cacheResult: true,
    });

    // HCS message fallbacks
    this.register('get_hcs_messages', {
      primary: 'kit_get_hcs_messages',
      fallback1: 'mirror_node_get_topic_messages',
      cacheResult: false,
    });
  }

  /**
   * Get confidence level for price source
   */
  private getPriceConfidence(source: string): number {
    const confidence: Record<string, number> = {
      'chainlink_get_price': 0.95,  // Oracle data is most reliable
      'coingecko_get_price': 0.85,  // Aggregated exchange data
      'mirror_node_get_price': 0.80, // Hedera native
    };
    return confidence[source] || 0.70;
  }

  /**
   * Cache a result
   */
  private cacheResult(tool: string, args: any, result: ToolResult): void {
    const key = this.generateCacheKey(tool, args);
    this.resultCache.set(key, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached result if available
   */
  getCachedResult(tool: string, args: any, maxAge: number = 60000): ToolResult | null {
    const key = this.generateCacheKey(tool, args);
    const cached = this.resultCache.get(key);
    
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > maxAge) {
      this.resultCache.delete(key);
      return null;
    }
    
    return { ...cached.result, fromCache: true };
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(tool: string, args: any): string {
    const sortedArgs = Object.keys(args || {})
      .sort()
      .map(k => `${k}=${JSON.stringify(args[k])}`)
      .join('&');
    return `${tool}:${sortedArgs}`;
  }

  /**
   * Clear all cached results
   */
  clearCache(): void {
    this.resultCache.clear();
    logger.info('ToolFallbacks', { message: 'Cache cleared' });
  }

  /**
   * Get registered fallback strategies
   */
  getRegisteredStrategies(): Array<{ tool: string; strategy: FallbackStrategy }> {
    const strategies: Array<{ tool: string; strategy: FallbackStrategy }> = [];
    for (const [tool, strategy] of this.fallbacks.entries()) {
      strategies.push({ tool, strategy });
    }
    return strategies;
  }

  /**
   * Check if a tool has a fallback strategy
   */
  hasFallback(tool: string): boolean {
    return this.fallbacks.has(tool);
  }

  /**
   * Remove a fallback strategy
   */
  unregister(tool: string): boolean {
    const existed = this.fallbacks.delete(tool);
    if (existed) {
      logger.info('ToolFallbacks', { message: 'Fallback unregistered', tool });
    }
    return existed;
  }

  /**
   * Get fallback statistics
   */
  getStats(): {
    registeredStrategies: number;
    cachedResults: number;
  } {
    return {
      registeredStrategies: this.fallbacks.size,
      cachedResults: this.resultCache.size,
    };
  }
}

// Singleton instance
let fallbacksInstance: ToolFallbacks | null = null;

export function getFallbacks(
  executor?: (tool: string, args: any) => Promise<ToolResult>
): ToolFallbacks {
  if (!fallbacksInstance && executor) {
    fallbacksInstance = new ToolFallbacks(executor);
  }
  if (!fallbacksInstance) {
    throw new Error('Fallbacks not initialized - provide executor on first call');
  }
  return fallbacksInstance;
}

export function resetFallbacks(): void {
  fallbacksInstance = null;
}
