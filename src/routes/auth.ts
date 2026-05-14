/**
 * Authentication and API Key Management Routes for VeraLattice
 * 
 * Provides endpoints for API key management, authentication status,
 * and administrative functions.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { enhancedAuth } from '../auth/enhanced.js';
import { 
  requireAuth, 
  requireAdminAuth, 
  securityHeadersMiddleware,
  requestLoggingMiddleware,
  errorHandlerMiddleware 
} from '../auth/middleware.js';
import { 
  validateApiKeyCreate, 
  validateApiKeyUpdate, 
  validateAuditLogFilters 
} from '../auth/validationMiddleware.js';
import { logger } from '../monitoring/logger.js';
import { AuthenticatedRequest } from '../auth/middleware.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Apply security headers to all auth routes
  fastify.addHook('preHandler', securityHeadersMiddleware);
  fastify.addHook('preHandler', requestLoggingMiddleware);
  fastify.setErrorHandler(errorHandlerMiddleware);

  // Create customer account
  fastify.post('/customers', {
    preHandler: [securityHeadersMiddleware, requestLoggingMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = enhancedAuth.createCustomer();
      
      logger.info('Customer created', { customerId });
      
      reply.code(201).send({
        success: true,
        data: {
          customerId,
          message: 'Customer account created successfully'
        }
      });
    } catch (error) {
      logger.error('Error creating customer', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to create customer account'
      });
    }
  });

  // Create API key
  fastify.post('/api-keys', {
    preHandler: [
      securityHeadersMiddleware,
      requestLoggingMiddleware,
      validateApiKeyCreate,
      requireAuth
    ]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { name, permissions, rateLimitPerMinute, rateLimitPerHour, rateLimitPerDay, usageQuotaDaily, expiresAt } = request.body as any;
      
      const result = enhancedAuth.createApiKey(request.user!.customerId, {
        name,
        permissions,
        rateLimitPerMinute,
        rateLimitPerHour,
        rateLimitPerDay,
        usageQuotaDaily,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined
      });

      logger.info('API key created', { 
        customerId: request.user!.customerId,
        apiKeyId: result.apiKeyId,
        name 
      });

      reply.code(201).send({
        success: true,
        data: {
          apiKeyId: result.apiKeyId,
          apiKey: result.apiKey,
          message: 'API key created successfully'
        }
      });
    } catch (error) {
      logger.error('Error creating API key', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        customerId: request.user?.customerId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to create API key'
      });
    }
  });

  // List API keys for customer
  fastify.get('/api-keys', {
    preHandler: [securityHeadersMiddleware, requestLoggingMiddleware, requireAuth]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const apiKeys = enhancedAuth.getCustomerApiKeys(request.user!.customerId);
      
      // Remove sensitive information from response
      const sanitizedKeys = apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        permissions: key.permissions,
        rateLimitPerMinute: key.rateLimitPerMinute,
        rateLimitPerHour: key.rateLimitPerHour,
        rateLimitPerDay: key.rateLimitPerDay,
        usageQuotaDaily: key.usageQuotaDaily,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
        revokedAt: key.revokedAt
      }));

      reply.send({
        success: true,
        data: {
          apiKeys: sanitizedKeys,
          total: sanitizedKeys.length
        }
      });
    } catch (error) {
      logger.error('Error listing API keys', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        customerId: request.user?.customerId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to list API keys'
      });
    }
  });

  // Get specific API key info
  fastify.get('/api-keys/:apiKeyId', {
    preHandler: [securityHeadersMiddleware, requestLoggingMiddleware, requireAuth]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { apiKeyId } = request.params as { apiKeyId: string };
      const apiKeyInfo = enhancedAuth.getApiKeyInfo(apiKeyId);

      if (!apiKeyInfo) {
        reply.code(404).send({
          success: false,
          error: 'API key not found'
        });
        return;
      }

      // Check if the API key belongs to the authenticated customer
      if (apiKeyInfo.customerId !== request.user!.customerId) {
        reply.code(403).send({
          success: false,
          error: 'Access denied'
        });
        return;
      }

      // Remove sensitive information
      const sanitizedInfo = {
        id: apiKeyInfo.id,
        name: apiKeyInfo.name,
        permissions: apiKeyInfo.permissions,
        rateLimitPerMinute: apiKeyInfo.rateLimitPerMinute,
        rateLimitPerHour: apiKeyInfo.rateLimitPerHour,
        rateLimitPerDay: apiKeyInfo.rateLimitPerDay,
        usageQuotaDaily: apiKeyInfo.usageQuotaDaily,
        expiresAt: apiKeyInfo.expiresAt,
        lastUsedAt: apiKeyInfo.lastUsedAt,
        createdAt: apiKeyInfo.createdAt,
        revokedAt: apiKeyInfo.revokedAt
      };

      reply.send({
        success: true,
        data: sanitizedInfo
      });
    } catch (error) {
      logger.error('Error getting API key info', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        customerId: request.user?.customerId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to get API key info'
      });
    }
  });

  // Rotate API key
  fastify.post('/api-keys/:apiKeyId/rotate', {
    preHandler: [securityHeadersMiddleware, requestLoggingMiddleware, requireAuth]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { apiKeyId } = request.params as { apiKeyId: string };
      
      // Check if the API key belongs to the authenticated customer
      const apiKeyInfo = enhancedAuth.getApiKeyInfo(apiKeyId);
      if (!apiKeyInfo || apiKeyInfo.customerId !== request.user!.customerId) {
        reply.code(404).send({
          success: false,
          error: 'API key not found'
        });
        return;
      }

      const result = enhancedAuth.rotateApiKey(apiKeyId);

      if (!result) {
        reply.code(404).send({
          success: false,
          error: 'API key not found or already revoked'
        });
        return;
      }

      logger.info('API key rotated', { 
        customerId: request.user!.customerId,
        apiKeyId 
      });

      reply.send({
        success: true,
        data: {
          apiKeyId,
          newApiKey: result.newApiKey,
          message: 'API key rotated successfully'
        }
      });
    } catch (error) {
      logger.error('Error rotating API key', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        customerId: request.user?.customerId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to rotate API key'
      });
    }
  });

  // Revoke API key
  fastify.delete('/api-keys/:apiKeyId', {
    preHandler: [securityHeadersMiddleware, requestLoggingMiddleware, requireAuth]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { apiKeyId } = request.params as { apiKeyId: string };
      const { reason } = request.body as { reason?: string };
      
      // Check if the API key belongs to the authenticated customer
      const apiKeyInfo = enhancedAuth.getApiKeyInfo(apiKeyId);
      if (!apiKeyInfo || apiKeyInfo.customerId !== request.user!.customerId) {
        reply.code(404).send({
          success: false,
          error: 'API key not found'
        });
        return;
      }

      const success = enhancedAuth.revokeApiKey(apiKeyId, reason);

      if (!success) {
        reply.code(404).send({
          success: false,
          error: 'API key not found'
        });
        return;
      }

      logger.info('API key revoked', { 
        customerId: request.user!.customerId,
        apiKeyId,
        reason 
      });

      reply.send({
        success: true,
        message: 'API key revoked successfully'
      });
    } catch (error) {
      logger.error('Error revoking API key', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        customerId: request.user?.customerId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to revoke API key'
      });
    }
  });

  // Get audit logs
  fastify.get('/audit-logs', {
    preHandler: [
      securityHeadersMiddleware, 
      requestLoggingMiddleware, 
      validateAuditLogFilters,
      requireAuth
    ]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const filters = request.query as any;
      
      // Users can only see their own audit logs
      const userFilters = {
        ...filters,
        customerId: request.user!.customerId
      };

      const logs = enhancedAuth.getAuditLogs(userFilters);

      reply.send({
        success: true,
        data: {
          logs,
          total: logs.length
        }
      });
    } catch (error) {
      logger.error('Error getting audit logs', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        customerId: request.user?.customerId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to get audit logs'
      });
    }
  });

  // Get authentication status
  fastify.get('/auth/status', {
    preHandler: [securityHeadersMiddleware, requestLoggingMiddleware, requireAuth]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      
      reply.send({
        success: true,
        data: {
          authenticated: true,
          customerId: user.customerId,
          apiKeyId: user.apiKeyId,
          permissions: user.permissions
        }
      });
    } catch (error) {
      logger.error('Error getting auth status', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        customerId: request.user?.customerId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to get authentication status'
      });
    }
  });

  // Admin: Get all audit logs
  fastify.get('/admin/audit-logs', {
    preHandler: [
      securityHeadersMiddleware, 
      requestLoggingMiddleware, 
      validateAuditLogFilters,
      requireAdminAuth
    ]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const filters = request.query as any;
      const logs = enhancedAuth.getAuditLogs(filters);

      reply.send({
        success: true,
        data: {
          logs,
          total: logs.length
        }
      });
    } catch (error) {
      logger.error('Error getting admin audit logs', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        customerId: request.user?.customerId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to get audit logs'
      });
    }
  });

  // Admin: Get customer list
  fastify.get('/admin/customers', {
    preHandler: [securityHeadersMiddleware, requestLoggingMiddleware, requireAdminAuth]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // This would require implementing a customer listing method
      // For now, return a placeholder response
      reply.send({
        success: true,
        data: {
          customers: [],
          total: 0,
          message: 'Customer listing not yet implemented'
        }
      });
    } catch (error) {
      logger.error('Error getting customer list', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        customerId: request.user?.customerId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to get customer list'
      });
    }
  });

  // Admin: Get system statistics
  fastify.get('/admin/stats', {
    preHandler: [securityHeadersMiddleware, requestLoggingMiddleware, requireAdminAuth]
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Get recent audit logs for statistics
      const recentLogs = enhancedAuth.getAuditLogs({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        limit: 1000
      });

      // Calculate statistics
      const stats = {
        totalRequests: recentLogs.filter(log => log.eventType === 'api_call').length,
        authentications: recentLogs.filter(log => log.eventType === 'auth').length,
        securityEvents: recentLogs.filter(log => log.eventType === 'security_event').length,
        adminActions: recentLogs.filter(log => log.eventType === 'admin_action').length,
        successRate: recentLogs.length > 0 ? 
          recentLogs.filter(log => log.success).length / recentLogs.length : 0,
        uniqueCustomers: new Set(recentLogs.map(log => log.customerId).filter(Boolean)).size,
        uniqueApiKeys: new Set(recentLogs.map(log => log.apiKeyId).filter(Boolean)).size
      };

      reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting admin stats', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        customerId: request.user?.customerId
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to get system statistics'
      });
    }
  });

  // Health check endpoint
  fastify.get('/health', {
    preHandler: [securityHeadersMiddleware, requestLoggingMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '0.1.0'
      };

      reply.send(health);
    } catch (error) {
      logger.error('Health check error', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      reply.code(503).send({
        status: 'unhealthy',
        error: 'Service unavailable'
      });
    }
  });
}
