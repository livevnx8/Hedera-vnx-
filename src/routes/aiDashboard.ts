/**
 * Vera AI Dashboard API Routes
 * REST endpoints for monitoring and metrics
 */

import { Router } from 'express';
import { VeraAIIntegration } from '../ai/veraAIIntegration.js';
import { MonitoringDashboard } from '../ai/monitoringDashboard.js';
import { autoDocumenter } from '../lattice/autoDocumenter.js';
import { knowledgeCapture } from '../lattice/knowledgeCapture.js';
import { smartRouter } from '../ai/smartRouter.js';
import { responseCache } from '../ai/responseCache.js';
import { logger } from '../monitoring/logger.js';

// These will be injected during initialization
let veraAI: VeraAIIntegration | null = null;
let dashboard: MonitoringDashboard | null = null;

export function initializeAIRoutes(
  aiIntegration: VeraAIIntegration,
  monitoringDashboard: MonitoringDashboard
) {
  veraAI = aiIntegration;
  dashboard = monitoringDashboard;
}

const router = Router();

/**
 * GET /api/ai/status
 * Overall AI system status
 */
router.get('/status', (req, res) => {
  if (!veraAI || !dashboard) {
    return res.status(503).json({
      status: 'not_initialized',
      message: 'AI system not ready'
    });
  }

  const metrics = dashboard.getMetrics();
  const integrationStats = veraAI.getStats();

  res.json({
    status: metrics.health.status,
    uptime: process.uptime(),
    metrics: {
      requests: metrics.requests,
      latency: metrics.latency,
      cache: metrics.cache,
      tools: metrics.tools
    },
    health: {
      status: metrics.health.status,
      issues: metrics.health.issues,
      recommendations: metrics.health.recommendations
    },
    integrations: {
      router: integrationStats.routerStats ? 'active' : 'inactive',
      cache: integrationStats.cacheStats ? 'active' : 'inactive',
      tools: integrationStats.toolStats ? 'active' : 'inactive',
      parallel: integrationStats.parallelStats ? 'active' : 'inactive'
    }
  });
});

/**
 * GET /api/ai/metrics
 * Detailed performance metrics
 */
router.get('/metrics', (req, res) => {
  if (!dashboard) {
    return res.status(503).json({ error: 'Dashboard not initialized' });
  }

  const metrics = dashboard.getMetrics();

  res.json({
    timestamp: new Date().toISOString(),
    metrics
  });
});

/**
 * GET /api/ai/metrics/prometheus
 * Prometheus-compatible metrics
 */
router.get('/metrics/prometheus', (req, res) => {
  if (!dashboard) {
    return res.status(503).send('# Dashboard not initialized');
  }

  res.setHeader('Content-Type', 'text/plain');
  res.send(dashboard.getPrometheusMetrics());
});

/**
 * POST /api/ai/process
 * Process a query through the optimized AI system
 */
router.post('/process', async (req, res) => {
  if (!veraAI) {
    return res.status(503).json({ error: 'AI system not initialized' });
  }

  try {
    const { query, context, tools } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query required' });
    }

    const result = await veraAI.process({
      query,
      context,
      tools
    });

    // Record for monitoring
    if (dashboard) {
      dashboard.recordRequest(
        result.metadata.latency,
        result.metadata.cacheHit,
        result.metadata.provider
      );
    }

    res.json(result);
  } catch (error) {
    logger.error('AI process failed:', error);
    
    if (dashboard && req.body?.query) {
      dashboard.recordError('unknown');
    }

    res.status(500).json({
      error: 'Processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ai/router/stats
 * Smart router statistics
 */
router.get('/router/stats', (req, res) => {
  const stats = smartRouter.getStats();
  res.json(stats);
});

/**
 * POST /api/ai/router/test
 * Test routing decision for a query
 */
router.post('/router/test', (req, res) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query required' });
  }

  const decision = smartRouter.route(query);
  res.json(decision);
});

/**
 * GET /api/ai/cache/stats
 * Response cache statistics
 */
router.get('/cache/stats', (req, res) => {
  const stats = responseCache.getStats();
  res.json(stats);
});

/**
 * POST /api/ai/cache/clear
 * Clear response cache
 */
router.post('/cache/clear', async (req, res) => {
  await responseCache.clear();
  res.json({ message: 'Cache cleared' });
});

/**
 * GET /api/ai/knowledge/patterns
 * Captured knowledge patterns
 */
router.get('/knowledge/patterns', (req, res) => {
  const stats = knowledgeCapture.getStats();
  res.json(stats);
});

/**
 * GET /api/ai/knowledge/search
 * Search knowledge base
 */
router.get('/knowledge/search', (req, res) => {
  const { q, domain } = req.query;
  
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Query parameter q required' });
  }

  const results = knowledgeCapture.findSimilar(q, domain as string | undefined);
  res.json({
    query: q,
    domain: domain || 'all',
    results
  });
});

/**
 * GET /api/ai/docs/generate
 * Trigger auto-documentation
 */
router.get('/docs/generate', async (req, res) => {
  try {
    const requestedDir = req.query.dir;
    const sourceDir = typeof requestedDir === 'string'
      ? requestedDir
      : Array.isArray(requestedDir) && typeof requestedDir[0] === 'string'
        ? requestedDir[0]
        : './src';
    const outputDir = '/mnt/vera-mirror-shards/vera-lattice';

    await autoDocumenter.documentTools(sourceDir, outputDir);
    const stats = autoDocumenter.getStats();

    res.json({
      message: 'Documentation generated',
      stats
    });
  } catch (error) {
    logger.error('Auto-documentation failed:', error);
    res.status(500).json({
      error: 'Documentation generation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ai/docs/search
 * Search documented code
 */
router.get('/docs/search', (req, res) => {
  const q = req.query.q;
  
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Query parameter q required' });
  }

  const results = autoDocumenter.findCode(q);
  res.json({
    query: q,
    results
  });
});

/**
 * GET /api/ai/recommendations
 * Get optimization recommendations
 */
router.get('/recommendations', (req, res) => {
  if (!veraAI) {
    return res.status(503).json({ error: 'AI system not initialized' });
  }

  const recommendations = veraAI.getRecommendations();
  res.json({
    recommendations,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/ai/health
 * Simple health check
 */
router.get('/health', (req, res) => {
  const healthy = veraAI !== null && dashboard !== null;
  
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    services: {
      aiIntegration: veraAI ? 'up' : 'down',
      dashboard: dashboard ? 'up' : 'down',
      router: 'up',
      cache: 'up'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
