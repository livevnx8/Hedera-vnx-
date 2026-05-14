/**
 * Optimization API Routes
 * 
 * Provides endpoints for QVX node optimization management
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { qvxOptimizer } from '../optimization/qvxOptimizer.js';
import { gpuMemoryManager } from '../optimization/gpuMemoryManager.js';
import { performanceMonitor } from '../optimization/performanceMonitor.js';
import { autoScaler } from '../optimization/autoScaler.js';
import { INTELLIGENT_CACHES } from '../optimization/intelligentCache.js';

export async function optimizationRoutes(fastify: any) {
  
  // Get optimization status
  fastify.get('/api/optimization/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await qvxOptimizer.getStatus();
      return reply.send(status);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to get optimization status' });
    }
  });

  // Trigger manual optimization
  fastify.post('/api/optimization/optimize', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await qvxOptimizer.triggerOptimization();
      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to trigger optimization' });
    }
  });

  // Get performance report
  fastify.get('/api/optimization/performance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const report = qvxOptimizer.getPerformanceReport();
      return reply.send(report);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to get performance report' });
    }
  });

  // Get GPU memory stats
  fastify.get('/api/optimization/gpu', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await gpuMemoryManager.getMemoryStats();
      const recommendations = gpuMemoryManager.getOptimizationRecommendations();
      return reply.send({
        stats,
        recommendations,
        timestamp: new Date()
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to get GPU stats' });
    }
  });

  // Get scaling status
  fastify.get('/api/optimization/scaling', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const currentDecision = autoScaler.getCurrentDecision();
      const history = autoScaler.getScalingHistory();
      const recommendations = autoScaler.getRecommendations();
      return reply.send({
        current: currentDecision,
        history: history.slice(-20), // Last 20 decisions
        recommendations,
        timestamp: new Date()
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to get scaling status' });
    }
  });

  // Get cache statistics
  fastify.get('/api/optimization/cache', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cacheStats = Object.fromEntries(
        Object.entries(INTELLIGENT_CACHES).map(([name, cache]) => [
          name,
          {
            stats: cache.getStats(),
            recommendations: cache.getOptimizationRecommendations()
          }
        ])
      );
      return reply.send({
        caches: cacheStats,
        timestamp: new Date()
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to get cache stats' });
    }
  });

  // Export all metrics
  fastify.get('/api/optimization/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = qvxOptimizer.exportMetrics();
      return reply.send(metrics);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to export metrics' });
    }
  });

  // Get optimization history
  fastify.get('/api/optimization/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { start, end } = request.query as any;
      let timeRange;
      
      if (start && end) {
        timeRange = {
          start: new Date(start),
          end: new Date(end)
        };
      }
      
      const history = qvxOptimizer.getOptimizationHistory(timeRange);
      return reply.send({
        history,
        timestamp: new Date()
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to get optimization history' });
    }
  });

  // Enable aggressive mode
  fastify.post('/api/optimization/aggressive', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      qvxOptimizer.enableAggressiveMode();
      return reply.send({ 
        message: 'Aggressive optimization mode enabled',
        timestamp: new Date()
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to enable aggressive mode' });
    }
  });

  // Disable aggressive mode
  fastify.post('/api/optimization/conservative', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      qvxOptimizer.disableAggressiveMode();
      return reply.send({ 
        message: 'Conservative optimization mode enabled',
        timestamp: new Date()
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to disable aggressive mode' });
    }
  });

  // Clear specific cache
  fastify.delete('/api/optimization/cache/:cacheName', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { cacheName } = request.params as any;
      const cache = INTELLIGENT_CACHES[cacheName as keyof typeof INTELLIGENT_CACHES];
      
      if (!cache) {
        return reply.status(404).send({ error: 'Cache not found' });
      }
      
      cache.clear();
      return reply.send({ 
        message: `Cache ${cacheName} cleared`,
        timestamp: new Date()
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to clear cache' });
    }
  });

  // Optimize specific cache
  fastify.post('/api/optimization/cache/:cacheName/optimize', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { cacheName } = request.params as any;
      const cache = INTELLIGENT_CACHES[cacheName as keyof typeof INTELLIGENT_CACHES];
      
      if (!cache) {
        return reply.status(404).send({ error: 'Cache not found' });
      }
      
      const optimizedConfig = cache.optimizeConfiguration();
      return reply.send({ 
        message: `Cache ${cacheName} optimized`,
        configuration: optimizedConfig,
        timestamp: new Date()
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to optimize cache' });
    }
  });

  // Health check for optimization system
  fastify.get('/api/optimization/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await qvxOptimizer.getStatus();
      return reply.send({
        healthy: status.overallHealth !== 'critical',
        status: status.overallHealth,
        timestamp: new Date()
      });
    } catch (error) {
      return reply.status(500).send({ 
        healthy: false, 
        error: 'Optimization system unhealthy',
        timestamp: new Date()
      });
    }
  });
}
