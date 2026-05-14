/**
 * Vera Response Cache Implementation
 * Adds measurable caching to API responses
 */

import { createClient } from 'redis';
import { performance } from 'perf_hooks';

class VeraResponseCache {
  constructor() {
    this.client = null;
    this.memoryCache = new Map();
    this.enabled = false;
    this.stats = { hits: 0, misses: 0 };
  }

  async connect() {
    try {
      this.client = createClient({
        socket: { host: 'localhost', port: 6379 },
        retryStrategy: () => false // Don't retry, use memory fallback
      });
      
      this.client.on('error', () => { this.enabled = false; });
      await this.client.connect();
      this.enabled = true;
      console.log('✅ Redis cache connected');
    } catch {
      console.log('⚠️  Using memory cache (Redis unavailable)');
      this.enabled = false;
    }
  }

  async get(key) {
    if (this.enabled) {
      try {
        const val = await this.client.get(key);
        if (val) {
          this.stats.hits++;
          return JSON.parse(val);
        }
      } catch {}
    }
    
    // Memory fallback
    const entry = this.memoryCache.get(key);
    if (entry && Date.now() < entry.expiry) {
      this.stats.hits++;
      return entry.value;
    }
    
    this.stats.misses++;
    return null;
  }

  async set(key, value, ttl = 60) {
    if (this.enabled) {
      try {
        await this.client.setEx(key, ttl, JSON.stringify(value));
        return;
      } catch {}
    }
    
    // Memory fallback
    this.memoryCache.set(key, {
      value,
      expiry: Date.now() + (ttl * 1000)
    });
    
    // Clean old entries every 100 sets
    if (this.memoryCache.size > 1000) {
      const now = Date.now();
      for (const [k, v] of this.memoryCache) {
        if (v.expiry < now) this.memoryCache.delete(k);
      }
    }
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0,
      backend: this.enabled ? 'redis' : 'memory',
      memorySize: this.memoryCache.size
    };
  }
}

// Export for use in Vera
export { VeraResponseCache };

// Test if it works
async function testCache() {
  console.log('Testing Response Cache...\n');
  const cache = new VeraResponseCache();
  await cache.connect();
  
  // Test set/get
  await cache.set('test:key', { data: 'value', ts: Date.now() }, 5);
  const val = await cache.get('test:key');
  
  if (val) {
    console.log('✅ Cache working:', val.data);
  } else {
    console.log('❌ Cache test failed');
  }
  
  console.log('\n📊 Cache Stats:', cache.getStats());
}

testCache();
