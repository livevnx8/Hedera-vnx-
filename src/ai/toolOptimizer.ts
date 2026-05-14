/**
 * Vera Tool Calling Optimizer
 * Batches similar tool requests and caches results
 * Target: 99% tool calling accuracy, reduced latency
 */

import { logger } from '../monitoring/logger.js';
import { performance } from 'perf_hooks';

interface ToolRequest {
  toolName: string;
  params: any;
  timestamp: number;
  resolve: (result: any) => void;
  reject: (error: any) => void;
}

interface ToolCacheEntry {
  result: any;
  timestamp: number;
  hitCount: number;
  params: any;
}

interface ToolStats {
  totalCalls: number;
  batchedCalls: number;
  cacheHits: number;
  errors: number;
  avgLatency: number;
  accuracy: number;
}

export class ToolOptimizer {
  private pendingBatches: Map<string, ToolRequest[]> = new Map();
  private cache: Map<string, ToolCacheEntry> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private stats: ToolStats = {
    totalCalls: 0,
    batchedCalls: 0,
    cacheHits: 0,
    errors: 0,
    avgLatency: 0,
    accuracy: 1.0
  };

  // Configuration
  private readonly BATCH_SIZE = 5;
  private readonly BATCH_WAIT_MS = 50;
  private readonly CACHE_TTL_MS = 300000; // 5 minutes
  private readonly SIMILARITY_THRESHOLD = 0.9;

  constructor(private executeTool: (toolName: string, params: any) => Promise<any>) {}

  /**
   * Generate cache key for tool + params
   */
  private generateCacheKey(toolName: string, params: any): string {
    const normalized = JSON.stringify(this.normalizeParams(params));
    return `${toolName}:${Buffer.from(normalized).toString('base64').substring(0, 32)}`;
  }

  /**
   * Normalize params for consistent caching
   */
  private normalizeParams(params: any): any {
    if (typeof params !== 'object' || params === null) {
      return params;
    }

    const sorted: any = {};
    for (const key of Object.keys(params).sort()) {
      sorted[key] = this.normalizeParams(params[key]);
    }
    return sorted;
  }

  /**
   * Check if cached result is still valid
   */
  private isCacheValid(entry: ToolCacheEntry): boolean {
    return Date.now() - entry.timestamp < this.CACHE_TTL_MS;
  }

  /**
   * Find similar cached result
   */
  private findSimilarCache(toolName: string, params: any): ToolCacheEntry | null {
    // Simple exact match for now (can be enhanced with semantic similarity)
    const key = this.generateCacheKey(toolName, params);
    const entry = this.cache.get(key);
    
    if (entry && this.isCacheValid(entry)) {
      return entry;
    }
    return null;
  }

  /**
   * Execute tool with optimization
   */
  async call(toolName: string, params: any, priority: 'high' | 'normal' = 'normal'): Promise<any> {
    const startTime = performance.now();
    this.stats.totalCalls++;

    try {
      // 1. Check cache first
      const cached = this.findSimilarCache(toolName, params);
      if (cached) {
        cached.hitCount++;
        this.stats.cacheHits++;
        this.updateLatency(performance.now() - startTime);
        logger.debug(`Tool cache hit: ${toolName}`);
        return cached.result;
      }

      // 2. High priority = execute immediately
      if (priority === 'high') {
        const result = await this.executeSingle(toolName, params, startTime);
        return result;
      }

      // 3. Normal priority = batch
      return await this.queueForBatch(toolName, params, startTime);

    } catch (error) {
      this.stats.errors++;
      this.updateAccuracy();
      throw error;
    }
  }

  /**
   * Execute single tool call
   */
  private async executeSingle(toolName: string, params: any, startTime: number): Promise<any> {
    const key = this.generateCacheKey(toolName, params);
    
    try {
      const result = await this.executeTool(toolName, params);
      
      // Cache result
      this.cache.set(key, {
        result,
        timestamp: Date.now(),
        hitCount: 1,
        params
      });

      this.updateLatency(performance.now() - startTime);
      this.updateAccuracy(true);
      
      return result;
    } catch (error) {
      this.updateAccuracy(false);
      throw error;
    }
  }

  /**
   * Queue request for batching
   */
  private queueForBatch(toolName: string, params: any, startTime: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const request: ToolRequest = {
        toolName,
        params,
        timestamp: startTime,
        resolve,
        reject
      };

      // Add to pending batch
      if (!this.pendingBatches.has(toolName)) {
        this.pendingBatches.set(toolName, []);
      }
      this.pendingBatches.get(toolName)!.push(request);

      // Schedule batch execution
      this.scheduleBatch(toolName);
    });
  }

  /**
   * Schedule batch execution
   */
  private scheduleBatch(toolName: string): void {
    // Clear existing timer
    if (this.batchTimers.has(toolName)) {
      clearTimeout(this.batchTimers.get(toolName)!);
    }

    const batch = this.pendingBatches.get(toolName)!;

    // Execute immediately if batch is full
    if (batch.length >= this.BATCH_SIZE) {
      this.executeBatch(toolName);
      return;
    }

    // Schedule delayed execution
    const timer = setTimeout(() => {
      this.executeBatch(toolName);
    }, this.BATCH_WAIT_MS);

    this.batchTimers.set(toolName, timer);
  }

  /**
   * Execute batched requests
   */
  private async executeBatch(toolName: string): Promise<void> {
    const batch = this.pendingBatches.get(toolName);
    if (!batch || batch.length === 0) return;

    // Clear pending and timer
    this.pendingBatches.set(toolName, []);
    this.batchTimers.delete(toolName);

    const batchSize = batch.length;
    this.stats.batchedCalls += batchSize;

    logger.info(`Executing batch: ${toolName} (${batchSize} requests)`);

    try {
      // For similar params, execute once and share result
      const grouped = this.groupSimilarRequests(batch);
      
      for (const group of grouped) {
        const startTime = performance.now();
        
        try {
          // Execute once for the group
          const result = await this.executeTool(toolName, group[0].params);
          
          // Cache result
          const key = this.generateCacheKey(toolName, group[0].params);
          this.cache.set(key, {
            result,
            timestamp: Date.now(),
            hitCount: group.length,
            params: group[0].params
          });

          // Resolve all requests in group
          for (const request of group) {
            request.resolve(result);
            this.updateLatency(performance.now() - request.timestamp);
          }

          this.updateAccuracy(true);
        } catch (error) {
          // Reject all in group
          for (const request of group) {
            request.reject(error);
          }
          this.updateAccuracy(false);
        }
      }
    } catch (error) {
      // Reject all on catastrophic failure
      for (const request of batch) {
        request.reject(error);
      }
    }
  }

  /**
   * Group similar requests for batch optimization
   */
  private groupSimilarRequests(requests: ToolRequest[]): ToolRequest[][] {
    const groups: ToolRequest[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < requests.length; i++) {
      if (used.has(i)) continue;

      const group = [requests[i]];
      used.add(i);

      // Find similar requests
      for (let j = i + 1; j < requests.length; j++) {
        if (used.has(j)) continue;

        const similarity = this.calculateSimilarity(
          requests[i].params,
          requests[j].params
        );

        if (similarity >= this.SIMILARITY_THRESHOLD) {
          group.push(requests[j]);
          used.add(j);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Calculate param similarity (0-1)
   */
  private calculateSimilarity(params1: any, params2: any): number {
    const str1 = JSON.stringify(this.normalizeParams(params1));
    const str2 = JSON.stringify(this.normalizeParams(params2));
    return str1 === str2 ? 1.0 : 0.0; // Binary for now
  }

  /**
   * Update average latency
   */
  private updateLatency(latency: number): void {
    this.stats.avgLatency = this.stats.avgLatency * 0.9 + latency * 0.1;
  }

  /**
   * Update accuracy metric
   */
  private updateAccuracy(success: boolean = true): void {
    const successValue = success ? 1 : 0;
    this.stats.accuracy = this.stats.accuracy * 0.95 + successValue * 0.05;
  }

  /**
   * Get tool statistics
   */
  getStats(): ToolStats & { cacheHitRate: string; batchRate: string } {
    const cacheHitRate = this.stats.totalCalls > 0 
      ? (this.stats.cacheHits / this.stats.totalCalls * 100).toFixed(2)
      : '0';
    
    const batchRate = this.stats.totalCalls > 0
      ? (this.stats.batchedCalls / this.stats.totalCalls * 100).toFixed(2)
      : '0';

    return {
      ...this.stats,
      cacheHitRate: `${cacheHitRate}%`,
      batchRate: `${batchRate}%`,
      avgLatency: Math.round(this.stats.avgLatency)
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Tool cache cleared');
  }

  /**
   * Flush pending batches
   */
  async flush(): Promise<void> {
    for (const [toolName] of this.pendingBatches) {
      await this.executeBatch(toolName);
    }
  }
}
