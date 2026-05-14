/**
 * Competitive Intelligence API Routes
 * 
 * Provides endpoints for competitive analysis and market positioning
 */

import { FastifyInstance } from 'fastify';
import { competitiveDashboard } from '../monitoring/competitive-dashboard.js';

export function registerCompetitiveRoutes(fastify: FastifyInstance): void {
  // Get current competitive comparison
  fastify.get('/api/competitive/comparison', async (request, reply) => {
    try {
      const comparison = competitiveDashboard.getCurrentComparison();
      
      return reply.send({
        success: true,
        data: comparison,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error({ error: 'Error getting competitive comparison', message: error instanceof Error ? error.message : 'Unknown error' });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get competitive comparison'
      });
    }
  });

  // Get market position analysis
  fastify.get('/api/competitive/market-position', async (request, reply) => {
    try {
      const position = competitiveDashboard.getMarketPosition();
      
      return reply.send({
        success: true,
        data: position,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error({ error: 'Error getting market position', message: error instanceof Error ? error.message : 'Unknown error' });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get market position'
      });
    }
  });

  // Get competitive report
  fastify.get('/api/competitive/report', async (request, reply) => {
    try {
      const report = competitiveDashboard.generateCompetitiveReport();
      
      reply.type('text/plain');
      return reply.send(report);
    } catch (error) {
      fastify.log.error({ error: 'Error generating competitive report', message: error instanceof Error ? error.message : 'Unknown error' });
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate competitive report'
      });
    }
  });

  // Get competitive alerts
  fastify.get('/api/competitive/alerts', async (request, reply) => {
    try {
      const alerts = competitiveDashboard.checkAlerts();
      
      return reply.send({
        success: true,
        data: alerts,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error({ error: 'Error getting competitive alerts', message: error instanceof Error ? error.message : 'Unknown error' });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get competitive alerts'
      });
    }
  });

  // Export all metrics
  fastify.get('/api/competitive/export', async (request, reply) => {
    try {
      const metrics = competitiveDashboard.exportMetrics();
      
      reply.type('application/json');
      return reply.send(metrics);
    } catch (error) {
      fastify.log.error({ error: 'Error exporting competitive metrics', message: error instanceof Error ? error.message : 'Unknown error' });
      return reply.status(500).send({
        success: false,
        error: 'Failed to export competitive metrics'
      });
    }
  });

  // Update metrics (for testing or manual updates)
  fastify.post('/api/competitive/metrics/:aiName', async (request, reply) => {
    try {
      const { aiName } = request.params as { aiName: string };
      const metrics = request.body as any;
      
      competitiveDashboard.updateMetrics(aiName, metrics);
      
      return reply.send({
        success: true,
        message: `Metrics updated for ${aiName}`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error({ error: 'Error updating competitive metrics', message: error instanceof Error ? error.message : 'Unknown error' });
      return reply.status(500).send({
        success: false,
        error: 'Failed to update competitive metrics'
      });
    }
  });

  // Get competitive dashboard data
  fastify.get('/api/competitive/dashboard', async (request, reply) => {
    try {
      const comparison = competitiveDashboard.getCurrentComparison();
      const position = competitiveDashboard.getMarketPosition();
      const alerts = competitiveDashboard.checkAlerts();
      
      return reply.send({
        success: true,
        data: {
          comparison,
          marketPosition: position,
          alerts,
          summary: {
            veraRanking: position.overallRanking,
            marketShare: position.marketShare,
            growthRate: position.growthRate,
            totalAlerts: alerts.length,
            competitiveAdvantage: position.strengths.length,
            lastUpdated: new Date().toISOString()
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error({ error: 'Error getting competitive dashboard', message: error instanceof Error ? error.message : 'Unknown error' });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get competitive dashboard'
      });
    }
  });
}
