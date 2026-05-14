import Fastify from 'fastify';
import { config } from './config.js';
import { initNativeLlm } from './llm/nativeLlm.js';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { fileURLToPath } from 'url';
import path from 'path';
import { registerRoutes } from './routes.js';
import { registerImageRoutes } from './routes/image.js';
import { registerHederaRoutes } from './routes/hedera.js';
import dexRoutes from './routes/dex.js';
import { startTreasuryWatcher } from './hedera/mirrorWatcher.js';
import { qvxOptimizer } from './optimization/qvxOptimizer.js';
import { veraOrchestrator } from './vera/orchestrator/orchestratorLoop.js';
import { gracefulShutdown } from './vera/orchestrator/gracefulShutdown.js';
import { registerRealtimeRoutes, attachWebSocketServer } from './vera/api/realtimeRoutes.js';
import { rigState } from './vera/rig/rigState.js';
import { rigSupervisor } from './vera/rig/rigSupervisor.js';
import { rigAdaptiveScheduler } from './vera/scaling/adaptiveScheduler.js';
import { enterpriseServiceManager } from './vera/enterprise/serviceManager.js';
import { latticeHealthMonitor } from './vera/monitoring/latticeHealthMonitor.js';
import { rigTopology } from './swarm/rigTopology.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: '*' });

  await app.register(staticFiles, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
  });

  // OpenAPI / Swagger documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'VNX API',
        description: 'VNX — sovereign Hedera AI marketplace for orchestration, micropayments, verification, and DeFi intelligence.',
        version: '0.1.0',
        contact: { name: 'VNX', url: 'https://example.com' },
      },
      servers: [{ url: `http://localhost:${config.PORT}`, description: 'Local' }],
      tags: [
        { name: 'Health', description: 'System health and readiness' },
        { name: 'Routing', description: 'Agent routing and service orchestration' },
        { name: 'Agents', description: 'Agent deployment and monitoring' },
        { name: 'Hedera', description: 'HTS, HCS, EVM, and account operations' },
        { name: 'Payments', description: 'Micropayments and settlement' },
        { name: 'DeFi', description: 'DEX swaps, liquidity, and yield' },
        { name: 'Carbon', description: 'Carbon credit validation and retirement' },
        { name: 'Marketplace', description: 'Agent discovery, reputation, and escrow' },
        { name: 'Bridge', description: 'Cross-chain asset transfers' },
        { name: 'AI', description: 'Inference, reasoning, and model management' },
        { name: 'Training', description: 'Model fine-tuning and self-training pipelines' },
      ],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, defaultModelRendering: 'model' },
  });

  if (config.MODEL_PROVIDER === 'native') {
    await initNativeLlm();
  }

  // Initialize optimization system for QVX node (skipped - getting stuck in infinite loop)
  // try {
  //   await qvxOptimizer.initialize();
  //   console.log('🚀 QVX Optimization System initialized');
  // } catch (error) {
  //   console.warn('⚠️ Failed to initialize optimization system:', error);
  // }
  console.log('⚡ QVX Optimizer skipped for startup performance');

  try {
    await rigState.start();
    console.log('🧭 Rig state monitoring online');
  } catch (error) {
    console.warn('⚠️ Rig state monitoring failed to start:', error);
  }

  try {
    rigTopology.initialize();
    const stats = rigTopology.getStats();
    console.log('🖥️  Rig topology initialized', { gpus: stats.gpus.length, avgLoad: stats.averageLoad.toFixed(2) });
  } catch (error) {
    console.warn('⚠️ Rig topology initialization failed:', error);
  }

  rigState.on('snapshot', (snapshot) => {
    const pressure = rigState.getPressureMetrics(snapshot);
    if (pressure) {
      rigAdaptiveScheduler.recordRigPressure(pressure);
    }

    if (veraOrchestrator.isRunning()) {
      const stats = veraOrchestrator.getStats();
      const successRate = typeof stats.settlement?.successRate === 'number'
        ? stats.settlement.successRate
        : 1;

      rigAdaptiveScheduler.recordLoad({
        queueDepth: (stats.tasks.posted ?? 0) + (stats.tasks.bidding ?? 0) + (stats.tasks.in_progress ?? 0),
        anomalyDetected: pressure?.health === 'critical',
        successRate,
      });
    }
  });

  if (config.VERA_SKIP_ORCHESTRATOR_START === 'true') {
    console.log('🧠 VNX orchestrator startup skipped by VERA_SKIP_ORCHESTRATOR_START');
  } else {
    try {
      await veraOrchestrator.start();
      const stats = veraOrchestrator.getStats();
      console.log('🧠 VNX orchestrator running', {
        registry: stats.topics.registryTopicId,
        task: stats.topics.taskTopicId,
        result: stats.topics.resultTopicId,
        audit: stats.topics.auditTopicId,
      });
    } catch (error) {
      console.warn('⚠️ Unable to start VNX orchestrator:', error);
    }
  }

  try {
    await enterpriseServiceManager.initialize();
    console.log('🏢 Enterprise service layer online');
  } catch (error) {
    console.warn('⚠️ Enterprise service layer failed to start:', error);
  }

  try {
    latticeHealthMonitor.start();
    console.log('🩺 Lattice health monitor online');
  } catch (error) {
    console.warn('⚠️ Lattice health monitor failed to start:', error);
  }

  // Start adaptation loops (learn → adapt → grow → verify)
  try {
    const { behaviorAdapter } = await import('./vera/adaptation/behaviorAdapter.js');
    const { latticeGrower } = await import('./vera/adaptation/latticeGrower.js');
    const { selfVerifyTicker } = await import('./vera/adaptation/selfVerifyTicker.js');
    await behaviorAdapter.start();
    await latticeGrower.start();
    await selfVerifyTicker.start();
    console.log('🌱 Adaptation loops online (behavior + lattice + self-verify)');
  } catch (error) {
    console.warn('⚠️ Adaptation loops failed to start:', error);
  }

  // Wire all swarm interactions to HCS (HIP-993 anchored, non-blocking)
  try {
    const { wireSwarmLogging } = await import('./vera/logging/swarmWiring.js');
    await wireSwarmLogging();
    console.log('🕸️  Swarm events wired to HCS (every lattice interaction anchored)');
  } catch (error) {
    console.warn('⚠️ Swarm logging wire-up failed:', error);
  }

  // Wire lattice + marketplace events to webhook engine
  try {
    const { startLatticeEventBridge, startMarketplaceEventBridge } = await import('./integrations/latticeEventBridge.js');
    await startLatticeEventBridge();
    await startMarketplaceEventBridge();
    console.log('🔗 Webhook event bridges online (lattice + marketplace)');
  } catch (error) {
    console.warn('⚠️ Webhook event bridges failed to start:', error);
  }

  await registerRoutes(app);
  await registerImageRoutes(app);
  await registerHederaRoutes(app);
  await app.register(dexRoutes);
  await registerRealtimeRoutes(app);

  startTreasuryWatcher();

  rigSupervisor.registerService({
    name: 'rig-state',
    description: 'Live rig telemetry and pressure model',
    start: () => rigState.start(),
    stop: () => rigState.stop(),
    status: () => rigState.getStats(),
    healthCheck: () => ({
      healthy: (rigState.getSnapshot()?.health ?? 'healthy') !== 'critical',
      issues: rigState.getSnapshot()?.issues ?? [],
    }),
  });
  rigSupervisor.registerService({
    name: 'orchestrator',
    description: 'Vera task orchestration and HCS marketplace loop',
    start: () => veraOrchestrator.start(),
    status: () => ({ running: veraOrchestrator.isRunning(), stats: veraOrchestrator.getStats() }),
    healthCheck: () => ({
      healthy: veraOrchestrator.isRunning(),
      issues: veraOrchestrator.isRunning() ? [] : ['orchestrator not running'],
    }),
  });
  rigSupervisor.registerService({
    name: 'enterprise-service',
    description: 'SLA, queues, and resource-aware enterprise layer',
    start: () => enterpriseServiceManager.initialize(),
    stop: () => enterpriseServiceManager.stop(),
    status: () => ({ running: enterpriseServiceManager.isRunning(), dashboard: enterpriseServiceManager.getDashboard() }),
    healthCheck: () => ({
      healthy: enterpriseServiceManager.isRunning(),
      issues: enterpriseServiceManager.isRunning() ? [] : ['enterprise service manager stopped'],
    }),
  });
  rigSupervisor.registerService({
    name: 'lattice-health-monitor',
    description: 'Rig and lattice health recovery loop',
    start: () => latticeHealthMonitor.start(),
    stop: () => latticeHealthMonitor.stop(),
    status: () => latticeHealthMonitor.getStatus(),
    healthCheck: () => {
      const status = latticeHealthMonitor.getStatus();
      const criticalIssues = status.components
        .filter((component) => component.status === 'critical')
        .map((component) => `${component.component} critical`);
      return {
        healthy: status.running && criticalIssues.length === 0,
        issues: criticalIssues,
      };
    },
  });

  await app.listen({ port: config.PORT, host: '0.0.0.0' });

  // Attach WebSocket server to the underlying HTTP server
  attachWebSocketServer(app.server);

  console.log(`🤖 ${config.AI_NAME} API running on port ${config.PORT} (${config.HEDERA_NETWORK})`);

  // Register graceful shutdown handler
  gracefulShutdown.register();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
