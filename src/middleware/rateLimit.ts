/**
 * Rate Limiting Middleware for VeraLattice
 * 
 * Prevents API abuse and ensures fair usage
 */

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  checkLimit(identifier: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get existing requests for this identifier
    let timestamps = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    timestamps = timestamps.filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    const allowed = timestamps.length < this.config.maxRequests;
    
    if (allowed) {
      // Add current request
      timestamps.push(now);
    }

    // Update stored timestamps
    this.requests.set(identifier, timestamps);

    // Calculate remaining requests and reset time
    const remaining = Math.max(0, this.config.maxRequests - timestamps.length);
    const resetTime = new Date(Math.max(...timestamps, now) + this.config.windowMs);
    const retryAfter = allowed ? undefined : Math.ceil(this.config.windowMs / 1000);

    return {
      allowed,
      remaining,
      resetTime,
      retryAfter
    };
  }

  // Clean up old entries periodically
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [identifier, timestamps] of this.requests) {
      const filtered = timestamps.filter(timestamp => timestamp > windowStart);
      
      if (filtered.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, filtered);
      }
    }
  }

  // Get statistics
  getStats() {
    const totalIdentifiers = this.requests.size;
    let totalRequests = 0;

    for (const timestamps of this.requests.values()) {
      totalRequests += timestamps.length;
    }

    return {
      totalIdentifiers,
      totalRequests,
      averageRequestsPerIdentifier: totalIdentifiers > 0 ? totalRequests / totalIdentifiers : 0
    };
  }

  // Reset rate limit for specific identifier
  reset(identifier: string) {
    this.requests.delete(identifier);
  }

  // Reset all rate limits
  resetAll() {
    this.requests.clear();
  }
}

// Rate limiting middleware factory
export function createRateLimitMiddleware(config: RateLimitConfig) {
  const limiter = new RateLimiter(config);

  // Cleanup every 5 minutes
  setInterval(() => limiter.cleanup(), 5 * 60 * 1000);

  return {
    checkLimit: (identifier: string) => limiter.checkLimit(identifier),
    getStats: () => limiter.getStats(),
    reset: (identifier: string) => limiter.reset(identifier),
    resetAll: () => limiter.resetAll()
  };
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
  // General API: 100 requests per minute
  API: {
    windowMs: 60 * 1000,
    maxRequests: 100
  },

  // Chat endpoint: 20 requests per minute
  CHAT: {
    windowMs: 60 * 1000,
    maxRequests: 20
  },

  // Tool execution: 50 requests per minute
  TOOLS: {
    windowMs: 60 * 1000,
    maxRequests: 50
  },

  // Wallet operations: 10 requests per minute
  WALLET: {
    windowMs: 60 * 1000,
    maxRequests: 10
  },

  // Heavy operations (token creation, etc.): 2 requests per minute
  HEAVY: {
    windowMs: 60 * 1000,
    maxRequests: 2
  }
};
