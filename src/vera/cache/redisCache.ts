/**
 * Vera Redis Cache Layer
 * Distributed caching for agent state, falcon keys, and HCS messages
 */

import { logger } from '../../monitoring/logger.js';

// Redis loaded dynamically
let Redis: any;
async function loadRedis(): Promise<any> {
  if (!Redis) {
    try {
      // @ts-ignore - ioredis is optional dependency
      const redisModule = await import('ioredis');
      Redis = redisModule.default;
    } catch {
      logger.warn('VeraCache', { message: 'ioredis not installed, Redis features disabled' });
      return null;
    }
  }
  return Redis;
}

export class VeraCache {
  private redis: any = null;
  private isConnected: boolean = false;
  private defaultTTL: number = 300; // 5 minutes

  constructor(redisUrl?: string) {
    this.initialize(redisUrl);
  }

  private async initialize(redisUrl?: string): Promise<void> {
    const RedisClass = await loadRedis();
    if (!RedisClass) return;
    
    this.redis = new RedisClass(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    
    this.redis.on('connect', () => {
      this.isConnected = true;
      logger.info('VeraCache', { message: 'Redis connected' });
    });

    this.redis.on('error', (err) => {
      logger.error('VeraCache', { message: 'Redis error', error: err.message });
    });
  }

  /**
   * Cache agent state with TTL
   */
  async setAgentState(agentId: string, state: any, ttlSeconds?: number): Promise<void> {
    const key = `agent:state:${agentId}`;
    const ttl = ttlSeconds || this.defaultTTL;
    
    await this.redis.setex(key, ttl, JSON.stringify(state));
    logger.debug('VeraCache', { message: 'Agent state cached', agentId, ttl });
  }

  /**
   * Get cached agent state
   */
  async getAgentState(agentId: string): Promise<any | null> {
    const key = `agent:state:${agentId}`;
    const data = await this.redis.get(key);
    
    if (!data) return null;
    
    logger.debug('VeraCache', { message: 'Agent state cache hit', agentId });
    return JSON.parse(data);
  }

  /**
   * Cache Falcon-512 keypair (expensive to generate)
   */
  async setFalconKeypair(agentId: string, keypair: { publicKey: string; privateKey: string }): Promise<void> {
    const key = `falcon:keypair:${agentId}`;
    const ttl = 86400; // 24 hours
    
    await this.redis.setex(key, ttl, JSON.stringify(keypair));
    logger.debug('VeraCache', { message: 'Falcon keypair cached', agentId });
  }

  /**
   * Get cached Falcon keypair
   */
  async getFalconKeypair(agentId: string): Promise<{ publicKey: string; privateKey: string } | null> {
    const key = `falcon:keypair:${agentId}`;
    const data = await this.redis.get(key);
    
    if (!data) return null;
    
    logger.debug('VeraCache', { message: 'Falcon keypair cache hit', agentId });
    return JSON.parse(data);
  }

  /**
   * Cache mirror node query results
   */
  async setMirrorCache(queryKey: string, data: any, ttlSeconds: number = 30): Promise<void> {
    const key = `mirror:${queryKey}`;
    await this.redis.setex(key, ttlSeconds, JSON.stringify(data));
  }

  /**
   * Get cached mirror node data
   */
  async getMirrorCache(queryKey: string): Promise<any | null> {
    const key = `mirror:${queryKey}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Cache HCS message sequence numbers for deduplication
   */
  async trackHcsMessage(topicId: string, sequenceNumber: string, ttlMinutes: number = 10): Promise<void> {
    const key = `hcs:processed:${topicId}`;
    const score = Date.now();
    
    // Add to sorted set with timestamp score
    await this.redis.zadd(key, score, sequenceNumber);
    
    // Remove old entries (older than TTL)
    const cutoff = Date.now() - (ttlMinutes * 60 * 1000);
    await this.redis.zremrangebyscore(key, 0, cutoff);
    
    // Set expiry on the set itself
    await this.redis.expire(key, ttlMinutes * 60);
  }

  /**
   * Check if HCS message was already processed
   */
  async isHcsMessageProcessed(topicId: string, sequenceNumber: string): Promise<boolean> {
    const key = `hcs:processed:${topicId}`;
    const rank = await this.redis.zrank(key, sequenceNumber);
    return rank !== null;
  }

  /**
   * Distributed lock for coordinator operations
   */
  async acquireLock(lockKey: string, ttlSeconds: number = 30): Promise<string | null> {
    const key = `lock:${lockKey}`;
    const token = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await this.redis.set(key, token, 'EX', ttlSeconds, 'NX');
    
    if (result === 'OK') {
      return token;
    }
    return null;
  }

  /**
   * Release distributed lock
   */
  async releaseLock(lockKey: string, token: string): Promise<void> {
    const key = `lock:${lockKey}`;
    const current = await this.redis.get(key);
    
    if (current === token) {
      await this.redis.del(key);
    }
  }

  /**
   * Rate limiting check
   */
  async checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<boolean> {
    const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const current = await this.redis.incr(windowKey);
    
    if (current === 1) {
      // Set expiry on first request
      await this.redis.expire(windowKey, windowSeconds);
    }
    
    return current <= maxRequests;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    keys: number;
    memory: string;
    hitRate?: number;
  }> {
    if (!this.isConnected) {
      return { connected: false, keys: 0, memory: '0' };
    }

    const info = await this.redis.info('memory');
    const dbsize = await this.redis.dbsize();
    
    const usedMemory = info.match(/used_memory:(\d+)/)?.[1] || '0';
    
    return {
      connected: true,
      keys: dbsize,
      memory: `${Math.round(parseInt(usedMemory) / 1024 / 1024)}MB`,
    };
  }

  /**
   * Clear cache by pattern
   */
  async clearPattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      logger.info('VeraCache', { message: 'Cache cleared', pattern, count: keys.length });
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    await this.redis.quit();
    this.isConnected = false;
    logger.info('VeraCache', { message: 'Redis connection closed' });
  }
}

// Export singleton instance
export const veraCache = new VeraCache();

// Factory function for testing
export function createVeraCache(redisUrl?: string): VeraCache {
  return new VeraCache(redisUrl);
}
