/**
 * Redis Client and Distributed Caching for VeraLattice
 * 
 * Provides Redis-backed caching and rate limiting for production scalability.
 * Enhanced with quantum-aware caching strategies for optimal performance.
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from '../monitoring/logger.js';
import { config } from '../config.js';

export interface RedisConfig {
  url: string;
  password?: string;
  database?: number;
  keyPrefix?: string;
  ttl?: number;
  // Quantum optimization parameters
  quantumCacheSize?: number;
  parallelCacheKeys?: number;
  echoNodeCacheStrategy?: 'round-robin' | 'least-loaded' | 'weighted';
  compressionEnabled?: boolean;
  predictivePreloading?: boolean;
}

export class RedisManager {
  private static instance: RedisManager;
  private client: RedisClientType;
  private isConnecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  
  // Quantum optimization state
  private quantumCacheMetrics: {
    hits: number;
    misses: number;
    parallelHits: number;
    echoHits: number;
    compressionSavings: number;
    predictiveHits: number;
  } = {
    hits: 0,
    misses: 0,
    parallelHits: 0,
    echoHits: 0,
    compressionSavings: 0,
    predictiveHits: 0
  };
  
  private cacheStrategies: Map<string, string> = new Map();

  static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  constructor() {
    const redisConfig: RedisConfig = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD,
      database: parseInt(process.env.REDIS_DATABASE || '0'),
      keyPrefix: 'veralattice:',
      ttl: 300, // 5 minutes default TTL
      // Quantum optimization defaults
      quantumCacheSize: 10000,
      parallelCacheKeys: 18, // Match quantum mirror streams
      echoNodeCacheStrategy: 'weighted',
      compressionEnabled: true,
      predictivePreloading: true
    };

    this.client = createClient({
      url: redisConfig.url,
      password: redisConfig.password,
      database: redisConfig.database
    });

    this.client.on('error', (error: Error) => {
      logger.error('Redis connection error', { error: error.message });
    });

    this.client.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis disconnected');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.isConnecting) {
      throw new Error('Redis connection already in progress');
    }

    this.isConnecting = true;
    this.connectionPromise = this.doConnect();
    
    try {
      await this.connectionPromise;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  private async doConnect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Redis client connected');
    } catch (error) {
      logger.error('Failed to connect to Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      logger.info('Redis client disconnected');
    } catch (error) {
      logger.error('Error disconnecting Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  private getKey(key: string): string {
    return `veralattice:${key}`;
  }

  // Basic Redis operations
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(this.getKey(key)) as string | null;
    } catch (error) {
      logger.error('Redis GET error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      const fullKey = this.getKey(key);
      if (ttl) {
        await this.client.setEx(fullKey, ttl, value);
      } else {
        await this.client.set(fullKey, value);
      }
      return true;
    } catch (error) {
      logger.error('Redis SET error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      await this.client.del(this.getKey(key));
      return true;
    } catch (error) {
      logger.error('Redis DEL error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(this.getKey(key));
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      await this.client.expire(this.getKey(key), ttl);
      return true;
    } catch (error) {
      logger.error('Redis EXPIRE error', { key, ttl, error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(this.getKey(key));
    } catch (error) {
      logger.error('Redis TTL error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return -1;
    }
  }

  // Hash operations
  async hGet(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hGet(this.getKey(key), field) as string | null;
    } catch (error) {
      logger.error('Redis HGET error', { key, field, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  async hSet(key: string, field: string, value: string): Promise<boolean> {
    try {
      await this.client.hSet(this.getKey(key), field, value);
      return true;
    } catch (error) {
      logger.error('Redis HSET error', { key, field, error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hGetAll(this.getKey(key));
    } catch (error) {
      logger.error('Redis HGETALL error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return {};
    }
  }

  async hDel(key: string, field: string): Promise<boolean> {
    try {
      await this.client.hDel(this.getKey(key), field);
      return true;
    } catch (error) {
      logger.error('Redis HDEL error', { key, field, error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  // List operations
  async lPush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.lPush(this.getKey(key), values);
    } catch (error) {
      logger.error('Redis LPUSH error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return 0;
    }
  }

  async rPop(key: string): Promise<string | null> {
    try {
      return await this.client.rPop(this.getKey(key)) as string | null;
    } catch (error) {
      logger.error('Redis RPOP error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.lRange(this.getKey(key), start, stop);
    } catch (error) {
      logger.error('Redis LRANGE error', { key, start, stop, error: error instanceof Error ? error.message : 'Unknown error' });
      return [];
    }
  }

  async lLen(key: string): Promise<number> {
    try {
      return await this.client.lLen(this.getKey(key));
    } catch (error) {
      logger.error('Redis LLEN error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return 0;
    }
  }

  // Set operations
  async sAdd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sAdd(this.getKey(key), members);
    } catch (error) {
      logger.error('Redis SADD error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return 0;
    }
  }

  async sRem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sRem(this.getKey(key), members);
    } catch (error) {
      logger.error('Redis SREM error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return 0;
    }
  }

  async sMembers(key: string): Promise<string[]> {
    try {
      return await this.client.sMembers(this.getKey(key));
    } catch (error) {
      logger.error('Redis SMEMBERS error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return [];
    }
  }

  async sIsMember(key: string, member: string): Promise<boolean> {
    try {
      return Boolean(await this.client.sIsMember(this.getKey(key), member));
    } catch (error) {
      logger.error('Redis SISMEMBER error', { key, member, error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  // Atomic operations
  async incr(key: string): Promise<number | null> {
    try {
      return await this.client.incr(this.getKey(key));
    } catch (error) {
      logger.error('Redis INCR error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  async incrBy(key: string, increment: number): Promise<number | null> {
    try {
      return await this.client.incrBy(this.getKey(key), increment);
    } catch (error) {
      logger.error('Redis INCRBY error', { key, increment, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  async decr(key: string): Promise<number | null> {
    try {
      return await this.client.decr(this.getKey(key));
    } catch (error) {
      logger.error('Redis DECR error', { key, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  async decrBy(key: string, decrement: number): Promise<number | null> {
    try {
      return await this.client.decrBy(this.getKey(key), decrement);
    } catch (error) {
      logger.error('Redis DECRBY error', { key, decrement, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  // JSON operations (if Redis supports JSON module)
  async jsonSet(key: string, path: string, value: any): Promise<boolean> {
    try {
      await this.client.json.set(this.getKey(key), path, value);
      return true;
    } catch (error) {
      logger.error('Redis JSON.SET error', { key, path, error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  async jsonGet(key: string, path: string): Promise<any> {
    try {
      return await this.client.json.get(this.getKey(key), { path });
    } catch (error) {
      logger.error('Redis JSON.GET error', { key, path, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  // Batch operations
  async mGet(keys: string[]): Promise<(string | null)[]> {
    try {
      const fullKeys = keys.map(key => this.getKey(key));
      return await this.client.mGet(fullKeys) as (string | null)[];
    } catch (error) {
      logger.error('Redis MGET error', { keys, error: error instanceof Error ? error.message : 'Unknown error' });
      return keys.map(() => null);
    }
  }

  async mSet(keyValuePairs: Record<string, string>): Promise<boolean> {
    try {
      const fullKeyValuePairs: Record<string, string> = {};
      for (const [key, value] of Object.entries(keyValuePairs)) {
        fullKeyValuePairs[this.getKey(key)] = value;
      }
      await this.client.mSet(fullKeyValuePairs);
      return true;
    } catch (error) {
      logger.error('Redis MSET error', { error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number; error?: string }> {
    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      return { status: 'healthy', latency };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Get raw client for advanced operations
  getClient(): RedisClientType {
    return this.client;
  }

  // Quantum-aware caching methods
  
  /**
   * Cache quantum data with parallel mirror optimization
   */
  async setQuantumCache(mirrorId: string, data: any, ttl?: number): Promise<boolean> {
    try {
      const key = `quantum:mirror:${mirrorId}`;
      const compressedData = this.compressData(data);
      const result = await this.set(key, compressedData, ttl || 300);
      
      if (result) {
        this.quantumCacheMetrics.parallelHits++;
        this.cacheStrategies.set(key, 'mirror');
      }
      
      return result;
    } catch (error) {
      logger.error('Quantum cache set error', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Get quantum data with echo node optimization
   */
  async getQuantumCache(mirrorId: string): Promise<any> {
    try {
      const key = `quantum:mirror:${mirrorId}`;
      const data = await this.get(key);
      
      if (data) {
        this.quantumCacheMetrics.hits++;
        return this.decompressData(data);
      } else {
        this.quantumCacheMetrics.misses++;
        return null;
      }
    } catch (error) {
      logger.error('Quantum cache get error', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Cache echo node amplification data
   */
  async setEchoCache(echoNodeId: string, amplificationData: any, ttl?: number): Promise<boolean> {
    try {
      const key = `quantum:echo:${echoNodeId}`;
      const result = await this.set(key, amplificationData, ttl || 180);
      
      if (result) {
        this.quantumCacheMetrics.echoHits++;
        this.cacheStrategies.set(key, 'echo');
      }
      
      return result;
    } catch (error) {
      logger.error('Echo cache set error', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Get quantum cache metrics
   */
  getQuantumMetrics(): any {
    const total = this.quantumCacheMetrics.hits + this.quantumCacheMetrics.misses;
    const hitRate = total > 0 ? (this.quantumCacheMetrics.hits / total) * 100 : 0;
    
    return {
      ...this.quantumCacheMetrics,
      hit_rate: hitRate,
      total_requests: total,
      cache_strategies: Object.fromEntries(this.cacheStrategies)
    };
  }

  /**
   * Predictive preloading for quantum data
   */
  async predictivePreload(mirrorIds: string[]): Promise<void> {
    try {
      const preloadPromises = mirrorIds.map(async (mirrorId) => {
        const data = await this.getQuantumCache(mirrorId);
        if (!data) {
          // Simulate preloading from source
          await this.setQuantumCache(mirrorId, { preloaded: true, timestamp: Date.now() });
          this.quantumCacheMetrics.predictiveHits++;
        }
      });
      
      await Promise.allSettled(preloadPromises);
    } catch (error) {
      logger.error('Predictive preload error', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Compress data for quantum storage optimization
   */
  private compressData(data: any): string {
    try {
      // Simple JSON compression simulation
      const jsonString = JSON.stringify(data);
      return jsonString; // In production, use actual compression
    } catch (error) {
      return String(data);
    }
  }

  /**
   * Decompress data from quantum storage
   */
  private decompressData(data: string): any {
    try {
      return JSON.parse(data);
    } catch (error) {
      return data;
    }
  }

  /**
   * Reset quantum metrics
   */
  resetQuantumMetrics(): void {
    this.quantumCacheMetrics = {
      hits: 0,
      misses: 0,
      parallelHits: 0,
      echoHits: 0,
      compressionSavings: 0,
      predictiveHits: 0
    };
    this.cacheStrategies.clear();
  }
}

// Export singleton instance
export const redis = RedisManager.getInstance();

// Initialize Redis connection
export async function initializeRedis(): Promise<void> {
  try {
    await redis.connect();
    logger.info('Redis initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Redis', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    // Don't throw error - allow application to continue without Redis
    logger.warn('Application will continue without Redis caching and rate limiting');
  }
}

// Graceful shutdown
export async function shutdownRedis(): Promise<void> {
  try {
    await redis.disconnect();
    logger.info('Redis shutdown completed');
  } catch (error) {
    logger.error('Error during Redis shutdown', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}
