/**
 * Intelligent Tool Router
 * 
 * Provides caching, rate limiting, circuit breakers, and retry logic
 * for all VeraLattice tool executions.
 */

import { logger } from '../../monitoring/logger.js';

export interface ToolContext {
  userId: string;
  sessionId: string;
  timestamp: number;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  fromCache?: boolean;
  source?: string;
  retryAfter?: number;
  useFallback?: boolean;
  maxRetriesExceeded?: boolean;
  executionTime?: number;
  attempted?: string[];
  errors?: string[];
}

export interface RetryOptions {
  maxRetries: number;
  backoff: 'linear' | 'exponential';
  baseDelay: number;
}

export interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per second
}

export interface CircuitBreaker {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  successThreshold: number;
  failureThreshold: number;
  lastFailureTime: number;
  timeout: number;
}

interface CacheEntry {
  data: ToolResult;
  expiresAt: number;
  tool: string;
  hits: number;
}

const DEFAULT_TTL: Record<string, number> = {
  // Static data - long TTL
  'hedera_get_tokens': 5 * 60 * 1000,      // 5 minutes
  'hedera_search_tokens': 10 * 60 * 1000,  // 10 minutes
  'kit_get_token_info': 15 * 60 * 1000,     // 15 minutes
  'kit_get_account': 30 * 1000,            // 30 seconds
  'hcs_get_messages': 10 * 1000,           // 10 seconds
  
  // Real-time - no cache
  'hedera_transfer_hbar': 0,
  'hedera_mint_token': 0,
  'hcs_submit_message': 0,
  'hedera_create_token': 0,
};

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  backoff: 'exponential',
  baseDelay: 1000,
};

export class IntelligentToolRouter {
  private cache = new Map<string, CacheEntry>();
  private rateLimiter = new Map<string, RateLimitBucket>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private toolExecutor: (tool: string, args: any) => Promise<ToolResult>;

  constructor(executor: (tool: string, args: any) => Promise<ToolResult>) {
    this.toolExecutor = executor;
    this.startCleanupInterval();
  }

  /**
   * Execute a tool with full intelligence layer
   */
  async execute(
    tool: string,
    args: any,
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      // 1. Check cache
      const cacheKey = this.generateCacheKey(tool, args);
      const cached = this.getFromCache(cacheKey, tool);
      if (cached) {
        return {
          ...cached,
          fromCache: true,
          executionTime: Date.now() - startTime,
        };
      }

      // 2. Rate limiting
      if (!this.checkRateLimit(tool, context.userId)) {
        return {
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: 60,
          executionTime: Date.now() - startTime,
        };
      }

      // 3. Circuit breaker
      if (this.isCircuitOpen(tool)) {
        return {
          success: false,
          error: 'Service temporarily unavailable',
          useFallback: true,
          executionTime: Date.now() - startTime,
        };
      }

      // 4. Execute with retry
      const result = await this.executeWithRetry(tool, args, DEFAULT_RETRY_OPTIONS);
      
      // 5. Update circuit breaker
      this.updateCircuitBreaker(tool, result.success);

      // 6. Cache successful results
      if (result.success) {
        this.setCache(tool, cacheKey, result);
      }

      return {
        ...result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('ToolRouter', {
        message: 'Tool execution failed',
        tool,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Generate cache key from tool name and arguments
   */
  private generateCacheKey(tool: string, args: any): string {
    const sortedArgs = Object.keys(args || {})
      .sort()
      .map(k => `${k}=${JSON.stringify(args[k])}`)
      .join('&');
    return `${tool}:${sortedArgs}`;
  }

  /**
   * Get from cache if fresh
   */
  private getFromCache(key: string, tool: string): ToolResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const ttl = DEFAULT_TTL[tool] || 60000;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.data;
  }

  /**
   * Set cache entry with TTL
   */
  private setCache(tool: string, key: string, data: ToolResult): void {
    const ttl = DEFAULT_TTL[tool] || 60000;
    if (ttl === 0) return; // Don't cache

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      tool,
      hits: 0,
    });
  }

  /**
   * Invalidate cache entries matching pattern
   */
  invalidateCache(pattern: string): void {
    for (const [key] of this.cache.entries()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
    
    logger.info('ToolRouter', { message: 'Cache invalidated', pattern });
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('ToolRouter', { message: 'Cache cleared' });
  }

  /**
   * Check rate limit for user/tool combination
   */
  private checkRateLimit(tool: string, userId: string): boolean {
    const key = `${userId}:${tool}`;
    const now = Date.now();
    
    let bucket = this.rateLimiter.get(key);
    if (!bucket) {
      bucket = {
        tokens: 100, // Default burst
        maxTokens: 100,
        refillRate: 10, // 10 per second
        lastRefill: now,
      };
      this.rateLimiter.set(key, bucket);
    }

    // Refill tokens
    const timePassed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      bucket.maxTokens,
      bucket.tokens + timePassed * bucket.refillRate
    );
    bucket.lastRefill = now;

    // Check if we can consume a token
    if (bucket.tokens >= 1) {
      bucket.tokens--;
      return true;
    }

    return false;
  }

  /**
   * Get or create circuit breaker for tool
   */
  private getCircuitBreaker(tool: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(tool);
    if (!cb) {
      cb = {
        state: 'CLOSED',
        failures: 0,
        successThreshold: 3,
        failureThreshold: 5,
        lastFailureTime: 0,
        timeout: 30000, // 30 seconds
      };
      this.circuitBreakers.set(tool, cb);
    }
    return cb;
  }

  /**
   * Check if circuit is open
   */
  private isCircuitOpen(tool: string): boolean {
    const cb = this.getCircuitBreaker(tool);
    
    if (cb.state === 'OPEN') {
      // Check if timeout has passed
      if (Date.now() - cb.lastFailureTime > cb.timeout) {
        cb.state = 'HALF_OPEN';
        cb.failures = 0;
        logger.info('ToolRouter', { message: 'Circuit half-open', tool });
      } else {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Update circuit breaker based on result
   */
  private updateCircuitBreaker(tool: string, success: boolean): void {
    const cb = this.getCircuitBreaker(tool);

    if (success) {
      if (cb.state === 'HALF_OPEN') {
        cb.failures--;
        if (cb.failures <= 0) {
          cb.state = 'CLOSED';
          cb.failures = 0;
          logger.info('ToolRouter', { message: 'Circuit closed', tool });
        }
      }
    } else {
      cb.failures++;
      cb.lastFailureTime = Date.now();
      
      if (cb.state === 'HALF_OPEN' || cb.failures >= cb.failureThreshold) {
        cb.state = 'OPEN';
        logger.warn('ToolRouter', { 
          message: 'Circuit opened', 
          tool, 
          failures: cb.failures 
        });
      }
    }
  }

  /**
   * Execute tool with retry logic
   */
  private async executeWithRetry(
    tool: string,
    args: any,
    options: RetryOptions
  ): Promise<ToolResult> {
    let lastError: Error | null = null;

    for (let i = 0; i < options.maxRetries; i++) {
      try {
        const result = await this.toolExecutor(tool, args);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Calculate backoff delay
        const delay = options.backoff === 'exponential'
          ? Math.pow(2, i) * options.baseDelay
          : (i + 1) * options.baseDelay;

        logger.warn('ToolRouter', {
          message: 'Tool execution failed, retrying',
          tool,
          attempt: i + 1,
          delay,
          error: lastError.message,
        });

        await this.sleep(delay);
      }
    }

    // Open circuit on max retries
    this.updateCircuitBreaker(tool, false);

    return {
      success: false,
      error: lastError?.message || 'Max retries exceeded',
      maxRetriesExceeded: true,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Start cache cleanup interval
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Clean every minute
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    tools: Record<string, { entries: number; hits: number }>;
  } {
    const stats: Record<string, { entries: number; hits: number }> = {};
    let totalHits = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (!stats[entry.tool]) {
        stats[entry.tool] = { entries: 0, hits: 0 };
      }
      stats[entry.tool].entries++;
      stats[entry.tool].hits += entry.hits;
      totalHits += entry.hits;
    }

    return {
      size: this.cache.size,
      hitRate: totalHits / (this.cache.size || 1),
      tools: stats,
    };
  }

  /**
   * Get rate limit statistics
   */
  getRateLimitStats(): {
    totalBuckets: number;
    saturatedBuckets: number;
  } {
    let saturated = 0;
    for (const bucket of this.rateLimiter.values()) {
      if (bucket.tokens < 1) {
        saturated++;
      }
    }

    return {
      totalBuckets: this.rateLimiter.size,
      saturatedBuckets: saturated,
    };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitStatus(): Record<string, {
    state: string;
    failures: number;
  }> {
    const status: Record<string, { state: string; failures: number }> = {};
    
    for (const [tool, cb] of this.circuitBreakers.entries()) {
      status[tool] = {
        state: cb.state,
        failures: cb.failures,
      };
    }

    return status;
  }
}

// Singleton instance
let routerInstance: IntelligentToolRouter | null = null;

export function getIntelligentRouter(
  executor?: (tool: string, args: any) => Promise<ToolResult>
): IntelligentToolRouter {
  if (!routerInstance && executor) {
    routerInstance = new IntelligentToolRouter(executor);
  }
  if (!routerInstance) {
    throw new Error('Router not initialized - provide executor on first call');
  }
  return routerInstance;
}

export function resetRouter(): void {
  routerInstance = null;
}
