/**
 * Distributed Rate Limiting Middleware for VeraLattice
 * 
 * Provides Redis-backed rate limiting for production scalability and
 * multi-instance deployments.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { redis } from '../cache/redis.js';
import { logger } from '../monitoring/logger.js';
import { enhancedAuth } from '../auth/enhanced.js';
import { AuthenticatedRequest } from '../auth/middleware.js';

export interface DistributedRateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  distributedKeyPrefix?: string;
}

export interface DistributedRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
  totalRequests: number;
  windowStart: Date;
  windowEnd: Date;
}

export class DistributedRateLimiter {
  private config: DistributedRateLimitConfig;
  private keyPrefix: string;

  constructor(config: DistributedRateLimitConfig) {
    this.config = {
      distributedKeyPrefix: 'rate_limit:',
      ...config
    };
    this.keyPrefix = this.config.distributedKeyPrefix!;
  }

  private generateKey(request: FastifyRequest): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(request);
    }

    // Default key generation based on IP and API key
    const user = (request as AuthenticatedRequest).user;
    const identifier = user ? `api_key:${user.apiKeyId}` : `ip:${request.ip}`;
    const endpoint = `${request.method}:${request.url}`;
    
    return `${this.keyPrefix}${identifier}:${endpoint}`;
  }

  async checkLimit(request: FastifyRequest): Promise<DistributedRateLimitResult> {
    const key = this.generateKey(request);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const windowEnd = now;

    try {
      // Use Redis sorted set for sliding window rate limiting
      const redisKey = key;
      
      // Remove old entries outside the window
      await redis.getClient().zRemRangeByScore(redisKey, 0, windowStart);

      // Count current requests in window
      const currentCount = await redis.getClient().zCard(redisKey);

      // Check if limit exceeded
      const allowed = currentCount < this.config.maxRequests;

      if (allowed) {
        // Add current request to window
        await redis.getClient().zAdd(redisKey, {
          score: now,
          value: `${now}-${Math.random()}` // Unique value for each request
        });

        // Set expiration for the key
        await redis.expire(redisKey, Math.ceil(this.config.windowMs / 1000));
      }

      // Calculate remaining requests
      const remaining = Math.max(0, this.config.maxRequests - (allowed ? currentCount + 1 : currentCount));
      
      // Calculate reset time (when oldest request expires)
      const oldestRequest = await redis.getClient().zRange(redisKey, 0, 0);
      let resetTime = new Date(now + this.config.windowMs);
      
      if (oldestRequest.length > 0) {
        const oldestTimestamp = parseInt(oldestRequest[0].split('-')[0]);
        resetTime = new Date(oldestTimestamp + this.config.windowMs);
      }

      return {
        allowed,
        remaining,
        resetTime,
        totalRequests: currentCount,
        windowStart: new Date(windowStart),
        windowEnd: new Date(windowEnd)
      };

    } catch (error) {
      // If Redis is unavailable, fall back to allowing the request
      logger.error('Distributed rate limiting error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        key,
        request: {
          method: request.method,
          url: request.url,
          ip: request.ip
        }
      });

      // Fail open - allow the request but log the error
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime: new Date(now + this.config.windowMs),
        totalRequests: 0,
        windowStart: new Date(windowStart),
        windowEnd: new Date(windowEnd)
      };
    }
  }

  async reset(identifier: string): Promise<boolean> {
    try {
      const key = `${this.keyPrefix}${identifier}`;
      return await redis.del(key);
    } catch (error) {
      logger.error('Error resetting rate limit', {
        error: error instanceof Error ? error.message : 'Unknown error',
        identifier
      });
      return false;
    }
  }

  async getStatus(identifier: string): Promise<{
    current: number;
    remaining: number;
    resetTime: Date | null;
  } | null> {
    try {
      const key = `${this.keyPrefix}${identifier}`;
      const now = Date.now();
      const windowStart = now - this.config.windowMs;

      // Remove old entries
      await redis.getClient().zRemRangeByScore(key, 0, windowStart);

      // Get current count
      const currentCount = await redis.getClient().zCard(key);
      const remaining = Math.max(0, this.config.maxRequests - currentCount);

      // Get reset time
      const oldestRequest = await redis.getClient().zRange(key, 0, 0);
      let resetTime: Date | null = null;
      
      if (oldestRequest.length > 0) {
        const oldestTimestamp = parseInt(oldestRequest[0].split('-')[0]);
        resetTime = new Date(oldestTimestamp + this.config.windowMs);
      }

      return {
        current: currentCount,
        remaining,
        resetTime
      };
    } catch (error) {
      logger.error('Error getting rate limit status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        identifier
      });
      return null;
    }
  }

  async getGlobalStats(): Promise<{
    totalKeys: number;
    totalRequests: number;
    averageRequestsPerKey: number;
  } | null> {
    try {
      // Get all rate limit keys
      const keys = await redis.getClient().keys(`${this.keyPrefix}*`);
      const totalKeys = keys.length;

      if (totalKeys === 0) {
        return {
          totalKeys: 0,
          totalRequests: 0,
          averageRequestsPerKey: 0
        };
      }

      // Count total requests across all keys
      let totalRequests = 0;
      for (const key of keys) {
        const count = await redis.getClient().zCard(key);
        totalRequests += count;
      }

      return {
        totalKeys,
        totalRequests,
        averageRequestsPerKey: totalRequests / totalKeys
      };
    } catch (error) {
      logger.error('Error getting global rate limit stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }
}

// Rate limiting middleware factory
export function createDistributedRateLimitMiddleware(config: DistributedRateLimitConfig) {
  const limiter = new DistributedRateLimiter(config);

  return async function distributedRateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
    const result = await limiter.checkLimit(request);

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', config.maxRequests);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime.getTime() / 1000));
    reply.header('X-RateLimit-Window', config.windowMs / 1000);

    if (!result.allowed) {
      // Log rate limit exceeded
      logger.warn('Rate limit exceeded', {
        method: request.method,
        url: request.url,
        ip: request.ip,
        customerId: (request as AuthenticatedRequest).user?.customerId,
        apiKeyId: (request as AuthenticatedRequest).user?.apiKeyId,
        totalRequests: result.totalRequests,
        windowStart: result.windowStart,
        windowEnd: result.windowEnd
      });

      // Log security event
      await enhancedAuth.logAudit({
        customerId: (request as AuthenticatedRequest).user?.customerId,
        apiKeyId: (request as AuthenticatedRequest).user?.apiKeyId,
        eventType: 'security_event',
        action: 'rate_limit_exceeded',
        resourceType: 'endpoint',
        resourceId: request.url,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: false,
        errorMessage: 'Rate limit exceeded',
        context: {
          method: request.method,
          url: request.url,
          limit: config.maxRequests,
          windowMs: config.windowMs,
          currentRequests: result.totalRequests,
          resetTime: result.resetTime
        }
      });

      // Send rate limit response
      reply.code(429).send({
        error: 'Rate limit exceeded',
        message: `Too many requests. Try again in ${Math.ceil((result.resetTime.getTime() - Date.now()) / 1000)} seconds.`,
        retryAfter: Math.ceil((result.resetTime.getTime() - Date.now()) / 1000),
        limit: config.maxRequests,
        remaining: result.remaining,
        resetTime: result.resetTime
      });
      return reply.sent;
    }

    // Add rate limit info to request for downstream middleware
    (request as any).rateLimit = {
      remaining: result.remaining,
      resetTime: result.resetTime,
      limit: config.maxRequests,
      totalRequests: result.totalRequests
    };
  };
}

// API key specific rate limiting
export function createApiKeyRateLimitMiddleware() {
  return createDistributedRateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    keyGenerator: (request) => {
      const user = (request as AuthenticatedRequest).user;
      return user ? `api_key:${user.apiKeyId}` : `ip:${request.ip}`;
    }
  });
}

// Endpoint specific rate limiting
export function createEndpointRateLimitMiddleware(endpoint: string, config: Partial<DistributedRateLimitConfig> = {}) {
  return createDistributedRateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyGenerator: (request) => {
      const user = (request as AuthenticatedRequest).user;
      const identifier = user ? `api_key:${user.apiKeyId}` : `ip:${request.ip}`;
      return `${identifier}:endpoint:${endpoint}`;
    },
    ...config
  });
}

// Global rate limiting (per IP)
export function createGlobalRateLimitMiddleware(config: Partial<DistributedRateLimitConfig> = {}) {
  return createDistributedRateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 1000,
    keyGenerator: (request) => `ip:${request.ip}`,
    ...config
  });
}

// Tool execution rate limiting
export function createToolRateLimitMiddleware(toolName: string, config: Partial<DistributedRateLimitConfig> = {}) {
  return createDistributedRateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyGenerator: (request) => {
      const user = (request as AuthenticatedRequest).user;
      const identifier = user ? `api_key:${user.apiKeyId}` : `ip:${request.ip}`;
      return `${identifier}:tool:${toolName}`;
    },
    ...config
  });
}

// Admin endpoint rate limiting (more restrictive)
export function createAdminRateLimitMiddleware(config: Partial<DistributedRateLimitConfig> = {}) {
  return createDistributedRateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyGenerator: (request) => {
      const user = (request as AuthenticatedRequest).user;
      return user ? `admin:${user.apiKeyId}` : `ip:${request.ip}`;
    },
    ...config
  });
}

// Predefined rate limit configurations
export const DISTRIBUTED_RATE_LIMITS = {
  // API endpoints: 100 requests per minute
  API: createDistributedRateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 100
  }),

  // Chat endpoint: 20 requests per minute
  CHAT: createDistributedRateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyGenerator: (request) => {
      const user = (request as AuthenticatedRequest).user;
      const identifier = user ? `api_key:${user.apiKeyId}` : `ip:${request.ip}`;
      return `${identifier}:chat`;
    }
  }),

  // Tool execution: 50 requests per minute
  TOOLS: createDistributedRateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 50,
    keyGenerator: (request) => {
      const user = (request as AuthenticatedRequest).user;
      const identifier = user ? `api_key:${user.apiKeyId}` : `ip:${request.ip}`;
      return `${identifier}:tools`;
    }
  }),

  // Wallet operations: 10 requests per minute
  WALLET: createDistributedRateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyGenerator: (request) => {
      const user = (request as AuthenticatedRequest).user;
      const identifier = user ? `api_key:${user.apiKeyId}` : `ip:${request.ip}`;
      return `${identifier}:wallet`;
    }
  }),

  // Heavy operations: 2 requests per minute
  HEAVY: createDistributedRateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 2,
    keyGenerator: (request) => {
      const user = (request as AuthenticatedRequest).user;
      const identifier = user ? `api_key:${user.apiKeyId}` : `ip:${request.ip}`;
      return `${identifier}:heavy`;
    }
  }),

  // Admin operations: 5 requests per minute
  ADMIN: createAdminRateLimitMiddleware()
};

// Rate limit management utilities
export class RateLimitManager {
  static async resetUserLimits(apiKeyId: string): Promise<boolean> {
    const limiter = new DistributedRateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 100
    });
    return await limiter.reset(`api_key:${apiKeyId}`);
  }

  static async resetIpLimits(ip: string): Promise<boolean> {
    const limiter = new DistributedRateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 100
    });
    return await limiter.reset(`ip:${ip}`);
  }

  static async getUserStatus(apiKeyId: string): Promise<any> {
    const limiter = new DistributedRateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 100
    });
    return await limiter.getStatus(`api_key:${apiKeyId}`);
  }

  static async getGlobalStats(): Promise<any> {
    const limiter = new DistributedRateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 100
    });
    return await limiter.getGlobalStats();
  }
}
