/**
 * Vera Lattice Metrics API
 * 
 * Real-time metrics endpoint for monitoring the lattice system health,
 * agent performance, consensus status, and payment flows.
 * 
 * Endpoints:
 * - GET /metrics/lattice - Full lattice system health
 * - GET /metrics/agents - Agent discovery and health
 * - GET /metrics/consensus - Consensus engine stats
 * - GET /metrics/payments - Payment settlement metrics
 * - GET /metrics/websocket - WebSocket transport stats
 * - GET /metrics/live - SSE stream for live updates
 */

import { Router } from 'express';
import { latticeManager } from '../vera/lattice/core/LatticeManager.js';
import { economicField } from '../vera/lattice/fields/EconomicField.js';
import { securityField } from '../vera/lattice/fields/SecurityField.js';
import { performanceField } from '../vera/lattice/fields/PerformanceField.js';
import { enhancedSettlement } from '../vera/payments/enhancedX402Settlement.js';
import { logger } from '../monitoring/logger.js';

const router = Router();

// In-memory metrics store for quick access
const metricsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5000; // 5 second cache

/**
 * Get cached metrics or compute fresh
 */
function getCachedOrCompute(key: string, compute: () => any): any {
  const cached = metricsCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  const data = compute();
  metricsCache.set(key, { data, timestamp: Date.now() });
  return data;
}

/**
 * GET /metrics/lattice - Full lattice system health
 */
router.get('/lattice', (req, res) => {
  try {
    const stats = getCachedOrCompute('lattice', () => {
      const latticeStats = latticeManager.getLatticeStats();
      const economic = economicField.getEconomicStats();
      const security = securityField.getSecurityStats();
      const performance = performanceField.getPerformanceStats();

      return {
        timestamp: Date.now(),
        coherence: latticeStats.coherence,
        entanglements: latticeStats.entanglements,
        fields: latticeStats.fields,
        routingDecisions: latticeStats.routingDecisions,
        economic: {
          totalAgentsTracked: economic.totalAgentsTracked,
          totalMarketRates: economic.totalMarketRates,
          averageReliability: economic.averageReliability,
          totalVolumeHbar: economic.totalVolumeHbar
        },
        security: {
          totalProfiles: security.totalProfiles,
          averageComplianceScore: security.averageComplianceScore,
          averageRiskLevel: security.averageRiskLevel,
          totalIncidents: security.totalIncidents,
          unresolvedIncidents: security.unresolvedIncidents,
          criticalIncidents: security.criticalIncidents
        },
        performance: {
          totalAgents: performance.totalAgents,
          averageLatencyMs: performance.averageLatencyMs,
          averageThroughput: performance.averageThroughput,
          averageErrorRate: performance.averageErrorRate,
          agentsWithBottlenecks: performance.agentsWithBottlenecks,
          criticalBottlenecks: performance.criticalBottlenecks
        }
      };
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('LatticeMetricsAPI', {
      message: 'Failed to get lattice metrics',
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ success: false, error: 'Failed to get lattice metrics' });
  }
});

/**
 * GET /metrics/agents - Agent discovery and health
 */
router.get('/agents', (req, res) => {
  try {
    // This would integrate with the beacon listener
    // For now, return placeholder structure
    res.json({
      success: true,
      data: {
        timestamp: Date.now(),
        totalAgents: 0,
        healthyAgents: 0,
        avgHealthScore: 0,
        agentsNeedingRecovery: 0,
        agentsByType: {},
        agentsByCapability: {}
      }
    });
  } catch (error) {
    logger.error('LatticeMetricsAPI', {
      message: 'Failed to get agent metrics',
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ success: false, error: 'Failed to get agent metrics' });
  }
});

/**
 * GET /metrics/consensus - Consensus engine stats
 */
router.get('/consensus', (req, res) => {
  try {
    // Would integrate with byzantineConsensus
    res.json({
      success: true,
      data: {
        timestamp: Date.now(),
        view: 0,
        sequence: 0,
        isPrimary: false,
        primary: null,
        nodeCount: 0,
        quorum: 0,
        lastCheckpoint: 0,
        preparedCount: 0,
        committedCount: 0,
        config: {
          enableBatching: true,
          batchSize: 100,
          enableHotStuff: true,
          optimisticResponsiveness: true
        }
      }
    });
  } catch (error) {
    logger.error('LatticeMetricsAPI', {
      message: 'Failed to get consensus metrics',
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ success: false, error: 'Failed to get consensus metrics' });
  }
});

/**
 * GET /metrics/payments - Payment settlement metrics
 */
router.get('/payments', (req, res) => {
  try {
    const stats = getCachedOrCompute('payments', () => enhancedSettlement.getStats());
    const circuitStats = enhancedSettlement.getCircuitBreakerStats();

    res.json({
      success: true,
      data: {
        timestamp: Date.now(),
        settlements: stats,
        circuitBreaker: circuitStats,
        economicField: {
          totalAgentsTracked: economicField.getEconomicStats().totalAgentsTracked,
          totalVolumeHbar: economicField.getEconomicStats().totalVolumeHbar
        }
      }
    });
  } catch (error) {
    logger.error('LatticeMetricsAPI', {
      message: 'Failed to get payment metrics',
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ success: false, error: 'Failed to get payment metrics' });
  }
});

/**
 * GET /metrics/websocket - WebSocket transport stats
 */
router.get('/websocket', (req, res) => {
  try {
    // Would integrate with WebSocketTransport
    res.json({
      success: true,
      data: {
        timestamp: Date.now(),
        connections: 0,
        messagesSent: 0,
        messagesReceived: 0,
        bytesTransferred: 0,
        reconnections: 0,
        avgLatency: 0
      }
    });
  } catch (error) {
    logger.error('LatticeMetricsAPI', {
      message: 'Failed to get WebSocket metrics',
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ success: false, error: 'Failed to get WebSocket metrics' });
  }
});

/**
 * GET /metrics/all - All metrics combined
 */
router.get('/all', async (req, res) => {
  try {
    const [lattice, agents, consensus, payments, websocket] = await Promise.all([
      getCachedOrCompute('lattice', () => latticeManager.getLatticeStats()),
      { totalAgents: 0, healthyAgents: 0 }, // Placeholder
      { view: 0, sequence: 0 }, // Placeholder
      getCachedOrCompute('payments', () => enhancedSettlement.getStats()),
      { connections: 0 } // Placeholder
    ]);

    res.json({
      success: true,
      timestamp: Date.now(),
      data: {
        lattice,
        agents,
        consensus,
        payments,
        websocket
      }
    });
  } catch (error) {
    logger.error('LatticeMetricsAPI', {
      message: 'Failed to get all metrics',
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ success: false, error: 'Failed to get metrics' });
  }
});

/**
 * GET /metrics/live - Server-Sent Events for live metrics
 */
router.get('/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial data
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

  // Set up interval to send updates
  const interval = setInterval(() => {
    try {
      const data = {
        type: 'update',
        timestamp: Date.now(),
        lattice: latticeManager.getLatticeStats(),
        payments: enhancedSettlement.getStats()
      };
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to get metrics' })}\n\n`);
    }
  }, 5000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
  });
});

export default router;
export { router as latticeMetricsRouter };
