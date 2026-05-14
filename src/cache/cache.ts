/**
 * Caching System for VeraLattice
 * 
 * Reduces API calls and improves performance
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

export class Cache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private stats = { hits: 0, misses: 0, evictions: 0 };
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private defaultTTL: number = 5 * 60 * 1000, // 5 minutes default
    private maxSize: number = 1000
  ) {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  set(key: string, value: T, ttl?: number): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      hits: 0
    });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    entry.hits++;
    this.stats.hits++;
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  cleanup(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        evicted++;
      }
    }

    this.stats.evictions += evicted;
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictions: this.stats.evictions
    };
  }

  // Get cache entries for debugging
  getEntries(): Array<{ key: string; entry: CacheEntry<T> }> {
    const entries: Array<{ key: string; entry: CacheEntry<T> }> = [];
    
    for (const [key, entry] of this.cache) {
      entries.push({ key, entry });
    }
    
    return entries;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// Specialized caches for different use cases
export class LRUCache<T = any> extends Cache<T> {
  private accessOrder: string[] = [];

  set(key: string, value: T, ttl?: number): void {
    // Move key to most recently used
    this.moveToEnd(key);
    super.set(key, value, ttl);
  }

  get(key: string): T | undefined {
    const value = super.get(key);
    
    if (value !== undefined) {
      // Move to most recently used
      this.moveToEnd(key);
    }
    
    return value;
  }

  private moveToEnd(key: string): void {
    const index = this.accessOrder.indexOf(key);
    
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    
    this.accessOrder.push(key);
  }

  delete(key: string): boolean {
    const index = this.accessOrder.indexOf(key);
    
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    
    return super.delete(key);
  }

  clear(): void {
    super.clear();
    this.accessOrder = [];
  }
}

// Cache factory with predefined configurations
export function createCache<T = any>(type: 'memory' | 'lru' = 'memory', ttl?: number, maxSize?: number): Cache<T> {
  if (type === 'lru') {
    return new LRUCache<T>(ttl, maxSize);
  }
  
  return new Cache<T>(ttl, maxSize);
}

// Global cache instances
export const CACHES = {
  // API responses: 1 minute TTL
  API: createCache('memory', 60 * 1000, 500),
  
  // Account info: 5 minutes TTL
  ACCOUNT: createCache('memory', 5 * 60 * 1000, 100),
  
  // Token prices: 30 seconds TTL
  PRICES: createCache('memory', 30 * 1000, 200),
  
  // Tool results: 2 minutes TTL
  TOOLS: createCache('lru', 2 * 60 * 1000, 300),
  
  // Web search results: 10 minutes TTL
  SEARCH: createCache('memory', 10 * 60 * 1000, 100),
  
  // Wallet data: 1 minute TTL
  WALLET: createCache('memory', 60 * 1000, 50)
};

// Cache decorator for functions
export function cached<T extends (...args: any[]) => Promise<any>>(
  cache: Cache,
  keyGenerator?: (...args: Parameters<T>) => string,
  ttl?: number
) {
  return function (this: any, originalFunction: T, ...args: Parameters<T>): Promise<ReturnType<T>> {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
    
    // Try to get from cache first
    const cached = cache.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    
    // Execute function and cache result
    const result = originalFunction.apply(this, args);
    
    if (result instanceof Promise) {
      return result.then(value => {
        cache.set(key, value, ttl);
        return value;
      });
    }
    
    cache.set(key, result, ttl);
    return result;
  };
}
