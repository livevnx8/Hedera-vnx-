import { Router } from 'express';
import { config } from '../../config.js';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  components: {
    meridian: {
      status: 'up' | 'down';
      endpoints: Array<{
        url: string;
        healthy: boolean;
        latencyMs: number;
        lastChecked: string;
      }>;
    };
    proofKernel: {
      status: 'up' | 'down';
      activeRuns: number;
      queueDepth: number;
    };
    hcs: {
      status: 'up' | 'down';
      topicId?: string;
      lastSequence?: number;
    };
  };
  metrics: {
    avgDecisionLatencyMs: number;
    successRate24h: number;
    escalationRate24h: number;
  };
}

// In-memory health state (would use Redis in production)
const healthState: HealthStatus = {
  status: 'healthy',
  timestamp: new Date().toISOString(),
  version: process.env.npm_package_version || '1.0.0',
  components: {
    meridian: {
      status: 'up',
      endpoints: [],
    },
    proofKernel: {
      status: 'up',
      activeRuns: 0,
      queueDepth: 0,
    },
    hcs: {
      status: 'up',
      topicId: config.VERA_AUDIT_TOPIC_ID,
    },
  },
  metrics: {
    avgDecisionLatencyMs: 0,
    successRate24h: 1.0,
    escalationRate24h: 0,
  },
};

async function checkMeridianEndpoints(): Promise<HealthStatus['components']['meridian']> {
  const urls = config.MERIDIAN_URLS
    ? config.MERIDIAN_URLS.split(',').map(u => u.trim()).filter(Boolean)
    : [config.MERIDIAN_URL];

  const endpoints = await Promise.all(
    urls.map(async (url) => {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${url}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        return {
          url,
          healthy: response.ok,
          latencyMs: Date.now() - start,
          lastChecked: new Date().toISOString(),
        };
      } catch {
        return {
          url,
          healthy: false,
          latencyMs: Date.now() - start,
          lastChecked: new Date().toISOString(),
        };
      }
    })
  );

  const healthyCount = endpoints.filter(e => e.healthy).length;
  
  return {
    status: healthyCount === 0 ? 'down' : healthyCount < endpoints.length ? 'up' : 'up',
    endpoints,
  };
}

// Main health check endpoint
router.get('/', async (req, res) => {
  const meridianHealth = await checkMeridianEndpoints();
  
  healthState.timestamp = new Date().toISOString();
  healthState.components.meridian = meridianHealth;
  
  // Determine overall status
  const allUp = Object.values(healthState.components).every(c => c.status === 'up');
  const anyDown = Object.values(healthState.components).some(c => c.status === 'down');
  
  healthState.status = allUp ? 'healthy' : anyDown ? 'unhealthy' : 'degraded';
  
  const statusCode = healthState.status === 'healthy' ? 200 : healthState.status === 'degraded' ? 200 : 503;
  
  res.status(statusCode).json(healthState);
});

// Liveness probe (lightweight)
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Readiness probe (checks dependencies)
router.get('/ready', async (req, res) => {
  const meridianHealth = await checkMeridianEndpoints();
  const ready = meridianHealth.status === 'up';
  
  res.status(ready ? 200 : 503).json({
    ready,
    meridian: meridianHealth.status,
    timestamp: new Date().toISOString(),
  });
});

export default router;
