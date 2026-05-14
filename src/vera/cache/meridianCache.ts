/**
 * Meridian Model Result Caching Layer
 * 
 * Caches identical Meridian predictions to reduce inference costs
 * and improve response times for repeated tasks.
 */

import { createHash } from 'crypto';
import type { MeridianShadowScore, VerifiableAITask } from '../proofKernel/types.js';

export interface CacheEntry {
  key: string;
  score: MeridianShadowScore;
  timestamp: number;
  ttl: number;
  hitCount: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
  avgLatencyMs: number;
}

export class MeridianCache {
  private cache = new Map<string, CacheEntry>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalLatency: 0,
    latencySamples: 0,
  };
  
  constructor(
    private readonly defaultTtlMs: number = 60000, // 60 seconds
    private readonly maxSize: number = 1000,
  ) {}

  /**
   * Generate cache key from task and candidate agents
   */
  generateKey(task: VerifiableAITask, candidateAgentIds: string[]): string {
    const normalized = {
      serviceType: task.serviceType.toLowerCase(),
      description: task.description.toLowerCase().trim(),
      payloadKeys: Object.keys(task.payload).sort(),
      candidates: candidateAgentIds.slice().sort(),
    };
    
    const keyData = JSON.stringify(normalized);
    return createHash('sha256').update(keyData).digest('hex').slice(0, 32);
  }

  /**
   * Get cached score if available and not expired
   */
  get(task: VerifiableAITask, candidateAgentIds: string[]): MeridianShadowScore | undefined {
    const key = this.generateKey(task, candidateAgentIds);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return undefined;
    }

    // Cache hit
    entry.hitCount++;
    this.stats.hits++;
    
    // Update score metadata
    return {
      ...entry.score,
      cached: true,
      cacheHitCount: entry.hitCount,
    } as MeridianShadowScore;
  }

  /**
   * Store score in cache
   */
  set(
    task: VerifiableAITask,
    candidateAgentIds: string[],
    score: MeridianShadowScore,
    ttlMs?: number
  ): void {
    // Don't cache errors or disabled status
    if (score.status === 'unavailable' || score.status === 'disabled') {
      return;
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const key = this.generateKey(task, candidateAgentIds);
    const entry: CacheEntry = {
      key,
      score,
      timestamp: Date.now(),
      ttl: ttlMs ?? this.defaultTtlMs,
      hitCount: 0,
    };

    this.cache.set(key, entry);
  }

  /**
   * Get or compute score with caching
   */
  async getOrCompute(
    task: VerifiableAITask,
    candidateAgentIds: string[],
    compute: () => Promise<MeridianShadowScore>,
    ttlMs?: number
  ): Promise<{ score: MeridianShadowScore; fromCache: boolean; latencyMs: number }> {
    const start = Date.now();
    
    // Try cache first
    const cached = this.get(task, candidateAgentIds);
    if (cached) {
      const latency = Date.now() - start;
      this.stats.totalLatency += latency;
      this.stats.latencySamples++;
      
      return {
        score: cached,
        fromCache: true,
        latencyMs: latency,
      };
    }

    // Compute fresh
    const score = await compute();
    const latency = Date.now() - start;
    
    // Store in cache
    this.set(task, candidateAgentIds, score, ttlMs);
    
    this.stats.totalLatency += latency;
    this.stats.latencySamples++;
    
    return {
      score,
      fromCache: false,
      latencyMs: latency,
    };
  }

  /**
   * Get current cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;
    const avgLatency = this.stats.latencySamples > 0 
      ? this.stats.totalLatency / this.stats.latencySamples 
      : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      size: this.cache.size,
      hitRate,
      avgLatencyMs: avgLatency,
    };
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.totalLatency = 0;
    this.stats.latencySamples = 0;
  }

  /**
   * Evict least recently used entries
   */
  private evictLRU(): void {
    let oldest: CacheEntry | undefined;
    let oldestKey: string | undefined;

    for (const [key, entry] of this.cache) {
      if (!oldest || entry.timestamp < oldest.timestamp) {
        oldest = entry;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Pre-warm cache with common tasks
   */
  async prewarm(
    commonTasks: Array<{ task: VerifiableAITask; candidates: string[] }>,
    compute: (task: VerifiableAITask, candidates: string[]) => Promise<MeridianShadowScore>
  ): Promise<number> {
    let warmed = 0;
    
    for (const { task, candidates } of commonTasks) {
      try {
        const score = await compute(task, candidates);
        this.set(task, candidates, score, this.defaultTtlMs * 2); // Longer TTL for pre-warmed
        warmed++;
      } catch (error) {
        console.error(`[MeridianCache] Pre-warm failed for task:`, error);
      }
    }

    return warmed;
  }
}

// Global cache instance
export const globalMeridianCache = new MeridianCache();
