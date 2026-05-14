/**
 * Intelligent Caching System for QVX Node
 * 
 * Optimizes cache performance for Vera AI Assistant
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
  priority: 'high' | 'medium' | 'low';
  ttl: number;
  metadata?: Record<string, any>;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictions: number;
  averageAccessTime: number;
  memoryUtilization: number;
}

export interface CacheStrategy {
  maxSize: number;
  evictionPolicy: 'lru' | 'lfu' | 'priority' | 'adaptive';
  compressionEnabled: boolean;
  tieredCache: boolean;
  prefetchEnabled: boolean;
  adaptiveTTL: boolean;
}

export class IntelligentCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: string[] = [];
  private accessFrequency: Map<string, number> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalAccessTime: 0
  };
  
  private strategy: CacheStrategy;
  private compressionWorker: Worker | null = null;
  private prefetchQueue: string[] = [];
  private tier1Cache: Map<string, CacheEntry<T>> = new Map(); // Hot cache
  private tier2Cache: Map<string, CacheEntry<T>> = new Map(); // Warm cache
  
  constructor(strategy: Partial<CacheStrategy> = {}) {
    this.strategy = {
      maxSize: 1000,
      evictionPolicy: 'adaptive',
      compressionEnabled: true,
      tieredCache: true,
      prefetchEnabled: true,
      adaptiveTTL: true,
      ...strategy
    };
    
    this.initializeCompression();
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<T | undefined> {
    const startTime = Date.now();
    
    // Check tier 1 (hot) cache first
    let entry = this.tier1Cache.get(key);
    if (entry) {
      this.updateAccess(key, entry);
      this.stats.hits++;
      this.stats.totalAccessTime += Date.now() - startTime;
      return entry.value;
    }
    
    // Check tier 2 (warm) cache
    entry = this.tier2Cache.get(key);
    if (entry) {
      this.updateAccess(key, entry);
      this.promoteToTier1(key, entry);
      this.stats.hits++;
      this.stats.totalAccessTime += Date.now() - startTime;
      return entry.value;
    }
    
    // Check main cache
    entry = this.cache.get(key);
    if (entry && !this.isExpired(entry)) {
      this.updateAccess(key, entry);
      this.stats.hits++;
      this.stats.totalAccessTime += Date.now() - startTime;
      
      // Promote to tier 1 if frequently accessed
      if (entry.accessCount > 5) {
        this.promoteToTier1(key, entry);
      }
      
      return entry.value;
    }
    
    this.stats.misses++;
    this.stats.totalAccessTime += Date.now() - startTime;
    
    // Trigger prefetch if enabled
    if (this.strategy.prefetchEnabled) {
      this.triggerPrefetch(key);
    }
    
    return undefined;
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: T, options: {
    ttl?: number;
    priority?: 'high' | 'medium' | 'low';
    compress?: boolean;
    metadata?: Record<string, any>;
  } = {}): Promise<void> {
    const ttl = options.ttl || this.calculateAdaptiveTTL(key, value);
    const priority = options.priority || this.calculatePriority(key, value);
    const compress = options.compress !== false && this.strategy.compressionEnabled;
    
    let processedValue = value;
    let size = this.calculateSize(value);
    
    // Compress if enabled
    if (compress && size > 1024) {
      processedValue = await this.compress(value);
      size = this.calculateSize(processedValue);
    }
    
    const entry: CacheEntry<T> = {
      value: processedValue,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
      size,
      priority,
      ttl,
      metadata: options.metadata
    };
    
    // Check if we need to evict
    if (this.shouldEvict(size)) {
      await this.evictEntries(size);
    }
    
    // Store in appropriate tier
    if (priority === 'high' || this.tier1Cache.size < 100) {
      this.tier1Cache.set(key, entry);
    } else if (priority === 'medium' || this.tier2Cache.size < 300) {
      this.tier2Cache.set(key, entry);
    } else {
      this.cache.set(key, entry);
    }
    
    // Update access tracking
    this.accessOrder.push(key);
    this.accessFrequency.set(key, 1);
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key) || 
                   this.tier1Cache.delete(key) || 
                   this.tier2Cache.delete(key);
    
    if (deleted) {
      this.removeFromTracking(key);
    }
    
    return deleted;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.tier1Cache.clear();
    this.tier2Cache.clear();
    this.accessOrder = [];
    this.accessFrequency.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0, totalAccessTime: 0 };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalEntries = this.cache.size + this.tier1Cache.size + this.tier2Cache.size;
    const totalSize = this.calculateTotalSize();
    const totalRequests = this.stats.hits + this.stats.misses;
    
    return {
      totalEntries,
      totalSize,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.stats.misses / totalRequests : 0,
      evictions: this.stats.evictions,
      averageAccessTime: totalRequests > 0 ? this.stats.totalAccessTime / totalRequests : 0,
      memoryUtilization: this.strategy.maxSize > 0 ? totalEntries / this.strategy.maxSize : 0
    };
  }

  /**
   * Get cache optimization recommendations
   */
  getOptimizationRecommendations(): string[] {
    const stats = this.getStats();
    const recommendations: string[] = [];
    
    if (stats.hitRate < 0.7) {
      recommendations.push('💾 Low hit rate - consider increasing cache size');
      recommendations.push('🔍 Review TTL settings for better caching');
    }
    
    if (stats.memoryUtilization > 0.9) {
      recommendations.push('🧠 High memory utilization - enable compression');
      recommendations.push('🗑️ Consider more aggressive eviction policy');
    }
    
    if (stats.averageAccessTime > 10) {
      recommendations.push('⚡ Slow access time - optimize data structure');
      recommendations.push('🔄 Consider tiered cache reorganization');
    }
    
    if (stats.evictions > stats.totalEntries * 0.1) {
      recommendations.push('📈 High eviction rate - increase cache size');
      recommendations.push('🎯 Review cache key patterns');
    }
    
    return recommendations;
  }

  /**
   * Prefetch related entries
   */
  async prefetchRelated(key: string): Promise<void> {
    if (!this.strategy.prefetchEnabled) return;
    
    // This would implement intelligent prefetching based on access patterns
    // For now, simulate with related keys
    const relatedKeys = this.getRelatedKeys(key);
    
    for (const relatedKey of relatedKeys.slice(0, 3)) {
      if (!this.cache.has(relatedKey) && 
          !this.tier1Cache.has(relatedKey) && 
          !this.tier2Cache.has(relatedKey)) {
        // Trigger prefetch
        this.triggerPrefetch(relatedKey);
      }
    }
  }

  /**
   * Optimize cache configuration
   */
  optimizeConfiguration(): CacheStrategy {
    const stats = this.getStats();
    const recommendations = this.getOptimizationRecommendations();
    
    const optimized: CacheStrategy = { ...this.strategy };
    
    // Adjust based on hit rate
    if (stats.hitRate < 0.7) {
      optimized.maxSize = Math.min(2000, optimized.maxSize * 1.5);
    } else if (stats.hitRate > 0.9) {
      optimized.maxSize = Math.max(500, optimized.maxSize * 0.8);
    }
    
    // Adjust eviction policy based on patterns
    if (stats.evictions > stats.totalEntries * 0.2) {
      optimized.evictionPolicy = 'priority';
    } else if (stats.averageAccessTime > 20) {
      optimized.evictionPolicy = 'lfu';
    }
    
    // Enable compression if memory utilization is high
    if (stats.memoryUtilization > 0.8) {
      optimized.compressionEnabled = true;
    }
    
    return optimized;
  }

  private async initializeCompression(): Promise<void> {
    // Initialize compression worker if needed
    if (this.strategy.compressionEnabled) {
      // In production, this would initialize a Web Worker for compression
      console.log('🗜️ Compression enabled for cache');
    }
  }

  private async compress(data: any): Promise<any> {
    // Simulate compression - in production, use actual compression
    return JSON.stringify(data);
  }

  private async decompress(data: any): Promise<any> {
    // Simulate decompression - in production, use actual decompression
    return JSON.parse(data);
  }

  private calculateSize(value: any): number {
    // Calculate approximate size in bytes
    return JSON.stringify(value).length * 2; // Rough estimate
  }

  private calculateAdaptiveTTL(key: string, value: any): number {
    if (!this.strategy.adaptiveTTL) {
      return 5 * 60 * 1000; // 5 minutes default
    }
    
    // Adaptive TTL based on access patterns
    const accessCount = this.accessFrequency.get(key) || 0;
    const size = this.calculateSize(value);
    
    // Frequently accessed items get longer TTL
    const baseTTL = 5 * 60 * 1000; // 5 minutes
    const multiplier = Math.min(4, 1 + accessCount / 10);
    
    // Larger items get shorter TTL
    const sizeFactor = size > 10000 ? 0.5 : size > 5000 ? 0.75 : 1;
    
    return baseTTL * multiplier * sizeFactor;
  }

  private calculatePriority(key: string, value: any): 'high' | 'medium' | 'low' {
    // Calculate priority based on key patterns and value characteristics
    const size = this.calculateSize(value);
    const accessCount = this.accessFrequency.get(key) || 0;
    
    if (accessCount > 10 || size < 1000) {
      return 'high';
    } else if (accessCount > 3 || size < 5000) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private updateAccess(key: string, entry: CacheEntry<T>): void {
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.accessFrequency.set(key, (this.accessFrequency.get(key) || 0) + 1);
    
    // Update access order for LRU
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  private promoteToTier1(key: string, entry: CacheEntry<T>): void {
    // Remove from current location
    this.cache.delete(key);
    this.tier2Cache.delete(key);
    
    // Add to tier 1
    this.tier1Cache.set(key, entry);
    
    // Evict from tier 1 if needed
    if (this.tier1Cache.size > 100) {
      const oldestKey = this.tier1Cache.keys().next().value;
      if (oldestKey) {
        const oldestEntry = this.tier1Cache.get(oldestKey)!;
        this.tier1Cache.delete(oldestKey);
        
        // Move to tier 2
        this.tier2Cache.set(oldestKey, oldestEntry);
      }
    }
  }

  private shouldEvict(newEntrySize: number): boolean {
    const totalSize = this.calculateTotalSize();
    const maxSizeBytes = this.strategy.maxSize * 1024; // Convert to bytes
    
    return totalSize + newEntrySize > maxSizeBytes;
  }

  private async evictEntries(requiredSize: number): Promise<void> {
    const evicted = 0;
    
    while (this.shouldEvict(0) && evicted < requiredSize) {
      const keyToEvict = this.selectEvictionCandidate();
      if (keyToEvict) {
        const entry = this.cache.get(keyToEvict) || 
                       this.tier1Cache.get(keyToEvict) || 
                       this.tier2Cache.get(keyToEvict);
        
        if (entry) {
          this.delete(keyToEvict);
          this.stats.evictions++;
        }
      } else {
        break;
      }
    }
  }

  private selectEvictionCandidate(): string | null {
    switch (this.strategy.evictionPolicy) {
      case 'lru':
        return this.accessOrder[0];
      
      case 'lfu':
        let leastFrequentKey: string | null = null;
        let minFrequency = Infinity;
        
        for (const [key, frequency] of this.accessFrequency) {
          if (frequency < minFrequency) {
            minFrequency = frequency;
            leastFrequentKey = key;
          }
        }
        
        return leastFrequentKey;
      
      case 'priority':
        let lowPriorityKey: string | null = null;
        let lowestPriority = 'high';
        
        for (const [key, entry] of this.cache) {
          if (entry.priority === 'low') {
            return key;
          } else if (entry.priority === 'medium' && lowestPriority !== 'low') {
            lowPriorityKey = key;
            lowestPriority = 'medium';
          }
        }
        
        return lowPriorityKey;
      
      case 'adaptive':
        // Combine multiple factors for adaptive eviction
        let bestKey: string | null = null;
        let bestScore = Infinity;
        
        for (const key of this.accessOrder) {
          const entry = this.cache.get(key) || 
                       this.tier1Cache.get(key) || 
                       this.tier2Cache.get(key);
          
          if (entry) {
            const score = this.calculateEvictionScore(entry);
            if (score < bestScore) {
              bestScore = score;
              bestKey = key;
            }
          }
        }
        
        return bestKey;
      
      default:
        return this.accessOrder[0];
    }
  }

  private calculateEvictionScore(entry: CacheEntry<T>): number {
    const age = Date.now() - entry.timestamp;
    const accessRecency = Date.now() - entry.lastAccessed;
    const frequency = entry.accessCount;
    const size = entry.size;
    
    // Lower score = better candidate for eviction
    return (age * 0.3 + accessRecency * 0.4 - frequency * 100 + size * 0.001);
  }

  private calculateTotalSize(): number {
    let total = 0;
    
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    
    for (const entry of this.tier1Cache.values()) {
      total += entry.size;
    }
    
    for (const entry of this.tier2Cache.values()) {
      total += entry.size;
    }
    
    return total;
  }

  private removeFromTracking(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    
    this.accessFrequency.delete(key);
  }

  private getRelatedKeys(key: string): string[] {
    // This would implement intelligent key relationship detection
    // For now, return some simulated related keys
    const parts = key.split(':');
    const relatedKeys: string[] = [];
    
    if (parts.length > 1) {
      relatedKeys.push(parts[0] + ':*');
    }
    
    return relatedKeys;
  }

  private triggerPrefetch(key: string): void {
    if (!this.prefetchQueue.includes(key)) {
      this.prefetchQueue.push(key);
    }
  }
}

// Global cache instances for different use cases
export const INTELLIGENT_CACHES = {
  conversation: new IntelligentCache({ maxSize: 500, evictionPolicy: 'adaptive' }),
  awareness: new IntelligentCache({ maxSize: 200, evictionPolicy: 'lfu' }),
  tools: new IntelligentCache({ maxSize: 300, evictionPolicy: 'priority' }),
  responses: new IntelligentCache({ maxSize: 1000, evictionPolicy: 'lru' })
};
