/**
 * Fastify Hooks for VeraLattice
 * 
 * Provides global hooks for request/response logging and other cross-cutting concerns.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../monitoring/logger.js';
import { enhancedAuth } from './enhanced.js';
import { AuthenticatedRequest } from './middleware.js';

// Response logging hook
export async function responseLoggingHook(request: FastifyRequest, reply: FastifyReply) {
  const startTime = (request as any).startTime;
  if (startTime) {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      customerId: (request as AuthenticatedRequest).user?.customerId
    });
  }
}

// Request validation hook
export async function requestValidationHook(request: FastifyRequest, reply: FastifyReply) {
  // Validate request size
  const contentLength = request.headers['content-length'];
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
    reply.code(413).send({
      error: 'Request too large',
      message: 'Request body cannot exceed 10MB'
    });
    return reply.sent;
  }

  // Validate content type for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const contentType = request.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      reply.code(415).send({
        error: 'Unsupported media type',
        message: 'Content-Type must be application/json'
      });
      return reply.sent;
    }
  }
}

// Security monitoring hook
export async function securityMonitoringHook(request: FastifyRequest, reply: FastifyReply) {
  const userAgent = request.headers['user-agent'] || '';
  const ip = request.ip;
  
  // Detect suspicious user agents
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /go-http/i
  ];

  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
  
  if (isSuspicious) {
    await enhancedAuth.logAudit({
      customerId: (request as AuthenticatedRequest).user?.customerId,
      apiKeyId: (request as AuthenticatedRequest).user?.apiKeyId,
      eventType: 'security_event',
      action: 'suspicious_user_agent',
      resourceType: 'endpoint',
      resourceId: request.url,
      ipAddress: ip,
      userAgent,
      success: true,
      context: {
        userAgent,
        detectedPatterns: suspiciousPatterns.filter(pattern => pattern.test(userAgent))
      }
    });
  }

  // Detect potential brute force attacks
  const path = request.url;
  if (path.includes('/auth') || path.includes('/api')) {
    // This would be enhanced with actual rate limiting tracking
    // For now, just log the request for monitoring
    logger.debug('Security-sensitive request', {
      ip,
      userAgent,
      path,
      method: request.method,
      customerId: (request as AuthenticatedRequest).user?.customerId
    });
  }
}

// API key usage tracking hook
export async function apiKeyUsageHook(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as AuthenticatedRequest).user;
  if (user) {
    // Additional usage tracking can be done here
    // This complements the rate limiting in the auth middleware
    
    logger.debug('API key usage', {
      apiKeyId: user.apiKeyId,
      customerId: user.customerId,
      endpoint: request.url,
      method: request.method,
      permissions: user.permissions
    });
  }
}

// Error logging hook
export async function errorLoggingHook(error: Error, request: FastifyRequest, reply: FastifyReply) {
  await enhancedAuth.logAudit({
    customerId: (request as AuthenticatedRequest).user?.customerId,
    apiKeyId: (request as AuthenticatedRequest).user?.apiKeyId,
    eventType: 'security_event',
    action: 'request_error',
    resourceType: 'endpoint',
    resourceId: request.url,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    success: false,
    errorMessage: error.message,
    context: {
      stack: error.stack,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode
    }
  });
}

// Performance monitoring hook
export async function performanceMonitoringHook(request: FastifyRequest, reply: FastifyReply) {
  const startTime = (request as any).startTime || Date.now();
  const duration = Date.now() - startTime;
  
  // Log slow requests
  if (duration > 5000) { // 5 seconds
    logger.warn('Slow request detected', {
      method: request.method,
      url: request.url,
      duration,
      customerId: (request as AuthenticatedRequest).user?.customerId,
      userAgent: request.headers['user-agent']
    });

    await enhancedAuth.logAudit({
      customerId: (request as AuthenticatedRequest).user?.customerId,
      apiKeyId: (request as AuthenticatedRequest).user?.apiKeyId,
      eventType: 'security_event',
      action: 'slow_request',
      resourceType: 'endpoint',
      resourceId: request.url,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      success: true,
      context: {
        duration,
        method: request.method,
        threshold: 5000
      }
    });
  }

  // Track performance metrics
  // This would integrate with a metrics system like Prometheus
  logger.debug('Request performance', {
    method: request.method,
    url: request.url,
    duration,
    statusCode: reply.statusCode
  });
}

// Register all hooks with Fastify instance
export function registerHooks(fastify: any) {
  // Request hooks
  fastify.addHook('onRequest', requestValidationHook);
  fastify.addHook('onRequest', securityMonitoringHook);
  fastify.addHook('onRequest', apiKeyUsageHook);
  
  // Response hooks
  fastify.addHook('onResponse', responseLoggingHook);
  fastify.addHook('onResponse', performanceMonitoringHook);
  
  // Error hooks
  fastify.addHook('onError', errorLoggingHook);
}
