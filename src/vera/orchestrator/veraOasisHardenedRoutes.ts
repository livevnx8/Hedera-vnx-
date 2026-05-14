/**
 * Hardened VeraOasis API Routes
 * 
 * Exposes production-grade endpoints with full security hardening:
 * - Rate limiting
 * - Input validation
 * - Circuit breaker protected
 * - Health monitoring
 * 
 * @module vera/orchestrator/veraOasisHardenedRoutes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { hardenedVeraOasis, HealthStatus } from './veraOasisHardened.js';
import { logger } from '../../monitoring/logger.js';

// ─── Request Schemas ────────────────────────────────────────────────────────

const thinkRequestSchema = {
  type: 'object',
  required: ['message'],
  properties: {
    message: { type: 'string', minLength: 1, maxLength: 10000 },
    sessionId: { type: 'string' },
    userId: { type: 'string' },
    context: { type: 'object' },
  },
};

const healthResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
    timestamp: { type: 'number' },
    checks: {
      type: 'object',
      properties: {
        llm: { type: 'boolean' },
        memory: { type: 'boolean' },
        hcs: { type: 'boolean' },
        rateLimit: { type: 'boolean' },
      },
    },
    metrics: {
      type: 'object',
      properties: {
        requestsPerMinute: { type: 'number' },
        averageLatency: { type: 'number' },
        errorRate: { type: 'number' },
        circuitBreakerState: { type: 'string' },
      },
    },
  },
};

// ─── Route Registration ─────────────────────────────────────────────────────

export async function registerVeraOasisHardenedRoutes(app: FastifyInstance): Promise<void> {
  
  // Health check endpoint
  app.get('/api/vera/oasis/health', {
    schema: {
      response: { 200: healthResponseSchema },
    },
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const health = hardenedVeraOasis.getHealth();
      
      // Return appropriate status code
      const statusCode = health.status === 'healthy' ? 200 : 
                         health.status === 'degraded' ? 200 : 503;
      
      return reply.status(statusCode).send({
        ...health,
        timestamp: Date.now(),
      });
    },
  });

  // Main thinking endpoint with full hardening
  app.post('/api/vera/oasis/think', {
    schema: {
      body: thinkRequestSchema,
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { message, sessionId, userId, context } = request.body as {
        message: string;
        sessionId?: string;
        userId?: string;
        context?: any;
      };

      try {
        // Use hardened thinking engine
        const result = await hardenedVeraOasis.think(
          message,
          context || {},
          userId || 'anonymous'
        );

        return reply.send({
          success: true,
          result,
          security: result.security,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Determine status code based on error type
        let statusCode = 500;
        if (errorMessage.includes('Rate limit')) statusCode = 429;
        if (errorMessage.includes('validation')) statusCode = 400;
        if (errorMessage.includes('Resource quota')) statusCode = 503;

        logger.warn('VeraOasisHardened', {
          message: 'Request failed',
          error: errorMessage,
          userId: userId || 'anonymous',
        });

        return reply.status(statusCode).send({
          success: false,
          error: errorMessage,
          code: statusCode,
        });
      }
    },
  });

  // Get current configuration
  app.get('/api/vera/oasis/config', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      config: hardenedVeraOasis.getConfig(),
      timestamp: Date.now(),
    });
  });

  // Update configuration (admin only - in production, add auth middleware)
  app.post('/api/vera/oasis/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const newConfig = request.body as any;
    
    try {
      hardenedVeraOasis.updateConfig(newConfig);
      return reply.send({
        success: true,
        config: hardenedVeraOasis.getConfig(),
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid configuration',
      });
    }
  });

  // Graceful shutdown endpoint
  app.post('/api/vera/oasis/shutdown', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await hardenedVeraOasis.shutdown();
      return reply.send({
        success: true,
        message: 'VeraOasis shutdown complete',
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Shutdown failed',
      });
    }
  });

  // Metrics endpoint for monitoring
  app.get('/api/vera/oasis/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    const health = hardenedVeraOasis.getHealth();
    
    return reply.send({
      ...health.metrics,
      status: health.status,
      checks: health.checks,
      timestamp: Date.now(),
    });
  });

  logger.info('VeraOasisHardenedRoutes', {
    message: 'Hardened VeraOasis routes registered',
    routes: [
      '/api/vera/oasis/health',
      '/api/vera/oasis/think',
      '/api/vera/oasis/config',
      '/api/vera/oasis/metrics',
      '/api/vera/oasis/shutdown',
    ],
  });
}

export default registerVeraOasisHardenedRoutes;
