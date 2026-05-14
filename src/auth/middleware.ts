/**
 * Authentication Middleware for VeraLattice
 * 
 * Provides comprehensive authentication, authorization, and rate limiting
 * for all API endpoints.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { enhancedAuth } from './enhanced.js';
import { logger } from '../monitoring/logger.js';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    customerId: string;
    apiKeyId: string;
    permissions: any;
  };
  rateLimit?: {
    remaining: number;
    resetTime: Date;
    limit: number;
  };
}

export interface AuthMiddlewareOptions {
  required?: boolean;
  permissions?: string[];
  skipRateLimit?: boolean;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  return async function authMiddleware(request: AuthenticatedRequest, reply: FastifyReply) {
    const authHeader = request.headers['authorization'] as string;
    const apiKey = request.headers['x-api-key'] as string;
    
    // Try to extract API key from various sources
    let rawKey: string | undefined;
    
    if (authHeader?.startsWith('Bearer ')) {
      rawKey = authHeader.substring(7);
    } else if (apiKey) {
      rawKey = apiKey;
    } else if (request.body && typeof request.body === 'object' && 'apiKey' in request.body) {
      rawKey = (request.body as any).apiKey;
    }

    // If no key provided and auth is required
    if (!rawKey) {
      if (options.required) {
        reply.code(401).send({
          error: 'Authentication required',
          message: 'API key must be provided via Authorization header, X-API-Key header, or request body'
        });
        return reply.sent;
      }
      return; // Continue without authentication
    }

    // Authenticate the API key
    const authResult = await enhancedAuth.authenticateApiKey(rawKey, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      endpoint: request.url
    });

    if (!authResult.success) {
      // Log failed authentication
      logger.warn('Authentication failed', {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        endpoint: request.url,
        error: authResult.error
      });

      reply.code(401).send({
        error: 'Authentication failed',
        message: authResult.error
      });
      return reply.sent;
    }

    // Get API key info for permissions
    const apiKeyInfo = enhancedAuth.getApiKeyInfo(authResult.apiKeyId!);
    if (!apiKeyInfo) {
      reply.code(401).send({
        error: 'Authentication failed',
        message: 'API key not found'
      });
      return reply.sent;
    }

    // Check if key has expired
    if (apiKeyInfo.expiresAt && new Date(apiKeyInfo.expiresAt) < new Date()) {
      reply.code(401).send({
        error: 'Authentication failed',
        message: 'API key has expired'
      });
      return reply.sent;
    }

    // Check required permissions
    if (options.permissions) {
      const hasPermission = options.permissions.every(permission => {
        switch (permission) {
          case 'read':
            return apiKeyInfo.permissions.read;
          case 'write':
            return apiKeyInfo.permissions.write;
          case 'admin':
            return apiKeyInfo.permissions.admin;
          default:
            return apiKeyInfo.permissions.tools.includes(permission);
        }
      });

      if (!hasPermission) {
        reply.code(403).send({
          error: 'Insufficient permissions',
          message: `This endpoint requires: ${options.permissions.join(', ')}`
        });
        return reply.sent;
      }
    }

    // Set user info on request
    request.user = {
      customerId: authResult.customerId!,
      apiKeyId: authResult.apiKeyId!,
      permissions: apiKeyInfo.permissions
    };

    // Set rate limit info
    if (authResult.rateLimitStatus) {
      request.rateLimit = authResult.rateLimitStatus;
      
      // Add rate limit headers
      reply.header('X-RateLimit-Limit', authResult.rateLimitStatus.limit);
      reply.header('X-RateLimit-Remaining', authResult.rateLimitStatus.remaining);
      reply.header('X-RateLimit-Reset', Math.ceil(authResult.rateLimitStatus.resetTime.getTime() / 1000));
    }

    // Log successful authentication
    logger.info('Request authenticated', {
      customerId: authResult.customerId,
      apiKeyId: authResult.apiKeyId,
      endpoint: request.url,
      method: request.method,
      ip: request.ip
    });

    // Log API call
    await enhancedAuth.logAudit({
      customerId: authResult.customerId!,
      apiKeyId: authResult.apiKeyId!,
      eventType: 'api_call',
      action: `${request.method} ${request.url}`,
      resourceType: 'endpoint',
      resourceId: request.url,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      success: true
    });
  };
}

// Predefined middleware configurations
export const requireAuth = createAuthMiddleware({ required: true });
export const requireWriteAuth = createAuthMiddleware({ required: true, permissions: ['write'] });
export const requireAdminAuth = createAuthMiddleware({ required: true, permissions: ['admin'] });
export const optionalAuth = createAuthMiddleware({ required: false });

// Tool-specific authentication middleware
export function requireToolAuth(toolName: string) {
  return createAuthMiddleware({ 
    required: true, 
    permissions: ['write'],
    // Additional check for specific tool permission can be added here
  });
}

// Rate limiting middleware (backup for endpoints that don't use auth)
export function createRateLimitMiddleware(options: {
  windowMs: number;
  maxRequests: number;
  identifier?: string;
}) {
  const requests = new Map<string, number[]>();
  
  return function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
    const identifier = options.identifier || request.ip;
    const now = Date.now();
    const windowStart = now - options.windowMs;

    // Get existing requests
    let timestamps = requests.get(identifier) || [];
    
    // Remove old requests
    timestamps = timestamps.filter(timestamp => timestamp > windowStart);
    
    // Check limit
    if (timestamps.length >= options.maxRequests) {
      reply.code(429).send({
        error: 'Rate limit exceeded',
        message: `Too many requests. Try again in ${Math.ceil((options.windowMs - (now - timestamps[0])) / 1000)} seconds`
      });
      return reply.sent;
    }

    // Add current request
    timestamps.push(now);
    requests.set(identifier, timestamps);

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', options.maxRequests);
    reply.header('X-RateLimit-Remaining', options.maxRequests - timestamps.length);
    reply.header('X-RateLimit-Reset', Math.ceil((timestamps[0] + options.windowMs) / 1000));
  };
}

// Security headers middleware
export function securityHeadersMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Prevent clickjacking
  reply.header('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  reply.header('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  reply.header('X-XSS-Protection', '1; mode=block');
  
  // Force HTTPS in production
  if (process.env.NODE_ENV === 'production') {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // Content Security Policy
  reply.header('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );
  
  // Referrer policy
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  reply.header('Permissions-Policy', 
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
  );
}

// Request logging middleware
export function requestLoggingMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  const startTime = Date.now();
  
  // Log request
  logger.info('Request started', {
    method: request.method,
    url: request.url,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    customerId: (request as AuthenticatedRequest).user?.customerId
  });

  // Store start time for response logging
  (request as any).startTime = startTime;

  done();
}

// Error handling middleware
export function errorHandlerMiddleware(error: Error, request: FastifyRequest, reply: FastifyReply) {
  // Log error
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    method: request.method,
    url: request.url,
    ip: request.ip,
    customerId: (request as AuthenticatedRequest).user?.customerId
  });

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production') {
    reply.code(500).send({
      error: 'Internal server error',
      message: 'An unexpected error occurred'
    });
  } else {
    reply.code(500).send({
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    });
  }
}
