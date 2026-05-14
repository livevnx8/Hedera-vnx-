/**
 * Vera Response Cache
 * Semantic caching with similarity matching for AI responses
 * Target: 95% cache hit rate for common queries
 */

import { RedisManager } from '../cache/redis.js';
import { logger } from '../monitoring/logger.js';

interface CacheEntry {
  query: string;
  response: any;
  timestamp: number;
  accessCount: number;
  embedding?: number[]; // For semantic similarity
}

interface CacheStats {
  hits: number;
  misses: number;
  semanticHits: number;
  totalRequests: number;
  avgHitTime: number;
  memorySize: number;
}

export class ResponseCache {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private redis: RedisManager;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    semanticHits: 0,
    totalRequests: 0,
    avgHitTime: 0,
    memorySize: 0
  };

  // Configuration
  private readonly MAX_MEMORY_ITEMS = 1000;
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly SIMILARITY_THRESHOLD = 0.85; // 85% similar = cache hit

  constructor() {
    this.redis = RedisManager.getInstance();
  }

  async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Response cache initialized');
    } catch (error) {
      logger.warn('Redis unavailable, using memory cache only');
    }
  }

  /**
   * Generate simple hash for exact match
   */
  private generateKey(query: string): string {
    // Normalize: lowercase, trim whitespace
    const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
    return `cache:${Buffer.from(normalized).toString('base64').substring(0, 32)}`;
  }

  /**
   * Calculate simple similarity between two strings (0-1)
   * Uses Jaccard similarity on word sets
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const normalize = (s: string) => s.toLowerCase().trim().split(/\s+/);
    const set1 = new Set(normalize(str1));
    const set2 = new Set(normalize(str2));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Find semantically similar cached query
   */
  private findSemanticMatch(query: string): CacheEntry | null {
    let bestMatch: CacheEntry | null = null;
    let bestScore = 0;

    for (const entry of this.memoryCache.values()) {
      const similarity = this.calculateSimilarity(query, entry.query);
      if (similarity > bestScore && similarity >= this.SIMILARITY_THRESHOLD) {
        bestScore = similarity;
        bestMatch = entry;
      }
    }

    return bestMatch;
  }

  /**
   * Get cached response (exact or semantic match)
   */
  async get(query: string): Promise<{ response: any; source: 'exact' | 'semantic' | null }> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    const key = this.generateKey(query);

    // Try exact match first
    // 1. Check Redis
    try {
      const redisValue = await this.redis.get(key);
      if (redisValue) {
        const entry: CacheEntry = JSON.parse(redisValue);
        this.stats.hits++;
        this.updateAvgHitTime(Date.now() - startTime);
        return { response: entry.response, source: 'exact' };
      }
    } catch (error) {
      // Redis failed, continue to memory
    }

    // 2. Check memory cache exact match
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry) {
      memoryEntry.accessCount++;
      this.stats.hits++;
      this.updateAvgHitTime(Date.now() - startTime);
      return { response: memoryEntry.response, source: 'exact' };
    }

    // 3. Try semantic match
    const semanticMatch = this.findSemanticMatch(query);
    if (semanticMatch) {
      semanticMatch.accessCount++;
      this.stats.semanticHits++;
      this.updateAvgHitTime(Date.now() - startTime);
      return { response: semanticMatch.response, source: 'semantic' };
    }

    // Cache miss
    this.stats.misses++;
    return { response: null, source: null };
  }

  /**
   * Store response in cache
   */
  async set(query: string, response: any, ttl: number = this.DEFAULT_TTL): Promise<void> {
    const key = this.generateKey(query);
    const entry: CacheEntry = {
      query,
      response,
      timestamp: Date.now(),
      accessCount: 1
    };

    // Store in Redis if available
    try {
      await this.redis.set(key, JSON.stringify(entry), ttl);
    } catch {
      // Redis failed, store in memory only
    }

    // Store in memory cache
    this.memoryCache.set(key, entry);
    this.stats.memorySize = this.memoryCache.size;

    // Cleanup if memory cache is too large
    if (this.memoryCache.size > this.MAX_MEMORY_ITEMS) {
      this.cleanup();
    }
  }

  /**
   * Cleanup least recently used items
   */
  private cleanup(): void {
    // Sort by access count and timestamp (LRU)
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => {
      // Prefer keeping frequently accessed items
      if (a[1].accessCount !== b[1].accessCount) {
        return a[1].accessCount - b[1].accessCount;
      }
      return a[1].timestamp - b[1].timestamp;
    });

    // Remove oldest 20%
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }

    logger.info(`Cache cleanup: removed ${toRemove} items, ${this.memoryCache.size} remaining`);
  }

  /**
   * Update average hit time
   */
  private updateAvgHitTime(hitTime: number): void {
    this.stats.avgHitTime = (this.stats.avgHitTime * 0.9) + (hitTime * 0.1);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: string; semanticRate: string } {
    const total = this.stats.totalRequests;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : '0';
    const semanticRate = total > 0 ? (this.stats.semanticHits / total * 100).toFixed(2) : '0';

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      semanticRate: `${semanticRate}%`
    };
  }

  /**
   * Clear cache
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    // Note: Redis clearing would need specific keys
    logger.info('Response cache cleared');
  }

  /**
   * Preload common queries
   */
  async preload(commonQueries: Array<{ query: string; response: any }>): Promise<void> {
    for (const item of commonQueries) {
      await this.set(item.query, item.response, 3600); // 1 hour TTL for preloaded
    }
    logger.info(`Preloaded ${commonQueries.length} common queries`);
  }
}

// Singleton instance
export const responseCache = new ResponseCache();
