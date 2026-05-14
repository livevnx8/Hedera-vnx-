import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { veraOrchestrator } from '../vera/orchestrator/orchestratorLoop.js';
import { taskPublisher } from '../vera/orchestrator/taskPublisher.js';
import { escrowController } from '../vera/orchestrator/escrowController.js';
import { resultVerifier } from '../vera/orchestrator/resultVerifier.js';
import { enhancedSettlement as x402Settlement } from '../vera/payments/enhancedX402Settlement.js';
import { getTaskStoreStats, loadAllTasks, loadTask } from '../vera/orchestrator/taskStore.js';
import { clientPool } from '../vera/scaling/clientPool.js';
import { rateLimiterRegistry } from '../vera/scaling/rateLimiter.js';
import { reputationEngine } from '../vera/marketplace/reputation.js';
import { dynamicPricing } from '../vera/marketplace/pricing.js';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import { featureFlags } from '../vera/orchestrator/featureFlags.js';
import { streamManager } from '../vera/payments/streaming.js';
import { batchSettlementEngine } from '../vera/payments/asyncBatchSettlement.js';
import { disasterRecovery } from '../vera/disaster-recovery/index.js';
import { taskChainEngine } from '../vera/orchestrator/taskChainEngine.js';
import { negotiationProtocol } from '../vera/orchestrator/negotiationProtocol.js';
import { fiatOnramp } from '../vera/payments/fiatOnramp.js';
import { hmacVerifier } from '../vera/security/hmacVerifier.js';
import { sybilProtection } from '../vera/security/sybilProtection.js';
import { securityManager } from '../vera/security/compliance.js';
import { hierarchicalCoordinator } from '../vera/orchestrator/hierarchicalCoordinator.js';
import { livingLattice } from '../vera/orchestrator/livingLattice.js';
import { rigState } from '../vera/rig/rigState.js';
import { rigSupervisor } from '../vera/rig/rigSupervisor.js';
import { rigAdaptiveScheduler } from '../vera/scaling/adaptiveScheduler.js';
import { enterpriseServiceManager } from '../vera/enterprise/serviceManager.js';
import { latticeHealthMonitor } from '../vera/monitoring/latticeHealthMonitor.js';
import { getHarmonicState } from '../vera/harmony/harmonicState.js';
import { getTokenPrice } from '../hedera/saucerswap.js';
import {
  registerSubscription,
  unregisterSubscription,
  getSubscription,
  listSubscriptions,
  getWebhookStats,
  getDeliveryQueue,
  getDeadLetterQueue,
  replayDeadLetter,
  dispatchEvent,
} from '../integrations/webhookEngine.js';
import { fetchChainlinkPrice, fetchPythPrice, getConsensusPrice, publishAttestation } from '../integrations/oracleAdapters.js';
import { veraLatticeSwarm } from '../swarm/latticeSwarm.js';
import { rigTopology } from '../swarm/rigTopology.js';
import { registerVeraMarketplaceRoutes } from './vera/marketplace.js';
import { registerVeraMemoryRoutes } from './vera/memory.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const LatticePulseSchema = z.object({
  type: z.enum(['heartbeat', 'audit', 'decision', 'alert']).default('heartbeat'),
  data: z.record(z.unknown()).optional(),
});

const LatticePathSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const LatticeRouteMessageSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  message: z.record(z.unknown()),
});

const LatticeDecisionSchema = z.object({
  type: z.string().min(1),
  data: z.record(z.unknown()),
  sourceLayer: z.number().min(0).max(3).optional().default(3),
});

const LatticeSpawnSchema = z.object({
  role: z.string().min(1),
  layer: z.number().int().min(0).max(3),
});

const WorkflowStageSchema = z.enum([
  'brief',
  'task',
  'bid',
  'award',
  'execution',
  'verification',
  'settlement',
  'reputation',
  'receipt',
  'lesson',
  'upgrade_package',
]);

const WorkflowEvidenceSourceSchema = z.enum([
  'hcs',
  'hip1056_block_stream',
  'model_synthesis',
  'test',
  'settlement',
  'reputation',
  'operator_review',
  'dashboard_metric',
]);

const WorkflowOpenLoopSchema = z.object({
  subject: z.string().min(1),
  stage: WorkflowStageSchema.optional(),
  notes: z.array(z.string()).optional(),
});

const WorkflowEvidenceSchema = z.object({
  source: WorkflowEvidenceSourceSchema,
  stage: WorkflowStageSchema,
  summary: z.string().min(1),
  hash: z.string().optional(),
  hcsTopicId: z.string().optional(),
  hcsSequence: z.number().int().nonnegative().optional(),
  transactionId: z.string().optional(),
  scheduleId: z.string().optional(),
  blockStream: z.object({
    blockNumber: z.number().int().nonnegative().optional(),
    consensusTimestamp: z.string().optional(),
    blockProofHash: z.string().optional(),
    stateChangeSummary: z.string().optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const LearningPacketSchema = z.object({
  modelProvider: z.string().min(1),
  modelName: z.string().optional(),
  lesson: z.string().min(1),
  qualityScore: z.number().min(0).max(1),
  operatorApproved: z.boolean().optional(),
  synthesisHash: z.string().optional(),
});

const DeepSeekLearningEllipseSchema = z.object({
  loopId: z.string().optional(),
  subject: z.string().optional(),
  lesson: z.string().optional(),
  qualityScore: z.number().min(0).max(1).optional(),
  operatorApproved: z.boolean().optional(),
  modelProvider: z.string().optional(),
  modelName: z.string().optional(),
  publishToHcs: z.boolean().optional(),
});

const VnxLatticeWorkflowPlanSchema = z.object({
  intent: z.string().min(1),
  mode: z.enum(['assistive', 'parallel', 'proofed', 'learning']).optional(),
  maxSpecialists: z.number().int().min(1).max(8).optional(),
  routeWeights: z.record(z.number()).optional(),
});

const LearningPacketBlockStreamClosureSchema = z.object({
  blockNumber: z.number().int().nonnegative(),
  consensusTimestamp: z.string().optional(),
  transactionId: z.string().optional(),
  blockProofHash: z.string().min(1),
  stateChangeSummary: z.string().optional(),
});

const LatticePromoteSchema = z.object({
  agentId: z.string().min(1),
  targetLayer: z.number().int().min(0).max(3),
});

const LatticeDemoteSchema = z.object({
  agentId: z.string().min(1),
});

const LatticeHybridRouteSchema = z.object({
  agentId: z.string().min(1),
  domainA: z.string().min(1),
  domainB: z.string().min(1),
});

const SubmitTaskSchema = z.object({
  description: z.string().min(1),
  serviceType: z.string().min(1),
  budget: z.number().positive(),
  requiredConfidence: z.number().min(0).max(1).optional(),
  deadlineMs: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const AgentCreationFeeSchema = z.object({
  method: z.enum(['hbar', 'hts']),
  amount: z.number().positive(),
  token_id: z.string().optional(),
  treasury_account: z.string().min(1),
  transaction_id: z.string().min(1),
  payer_account: z.string().optional(),
  memo: z.string().optional(),
});

const AgentCreationFeeVerifySchema = z.object({
  creation_fee: AgentCreationFeeSchema,
});

const AgentRegistrationSchema = z.object({
  agent_id: z.string().min(1),
  service: z.string().min(1),
  fee_per_task: z.number().nonnegative().optional(),
  payment_method: z.string().optional(),
  availability: z.boolean().optional().default(true),
  proof_hash: z.string().optional(),
  account_id: z.string().optional(), // Hedera account for payments
  creation_fee: AgentCreationFeeSchema,
  metadata: z.record(z.unknown()).optional(),
});

type AgentCreationFeeQuote = {
  hbar: {
    amount: number;
    priceUsd: number;
    treasuryAccount: string;
  };
  hts: {
    amount: number;
    priceUsd: number;
    tokenId: string;
    symbol: string;
    treasuryAccount: string;
  };
  targetUsd: number;
  memoPrefix: string;
  source: string;
  tolerance: number;
  quotedAt: number;
};

function roundPaymentAmount(value: number): number {
  return Math.max(0.000001, Math.ceil(value * 1_000_000) / 1_000_000);
}

function normalizeMirrorTransactionId(transactionId: string): string {
  const trimmed = transactionId.trim();
  const hashpackStyle = trimmed.match(/^(0\.0\.\d+)@(\d+)\.(\d+)$/);
  if (hashpackStyle) {
    return `${hashpackStyle[1]}-${hashpackStyle[2]}-${hashpackStyle[3]}`;
  }
  return trimmed;
}

function extractTransactionPayer(transactionId: string): string | null {
  const trimmed = transactionId.trim();
  const match = trimmed.match(/^(0\.0\.\d+)(?:@|-)/);
  return match?.[1] ?? null;
}

function hashscanTransactionUrl(transactionId: string): string {
  return `https://hashscan.io/${config.HEDERA_NETWORK || 'mainnet'}/transaction/${transactionId.trim()}`;
}

async function fetchTokenDecimals(tokenId: string): Promise<number> {
  try {
    const response = await fetch(`${config.MIRROR_NODE_BASE_URL}/api/v1/tokens/${encodeURIComponent(tokenId)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Mirror Node token HTTP ${response.status}`);
    const payload = await response.json() as { decimals?: string | number };
    const decimals = Number(payload.decimals);
    return Number.isFinite(decimals) && decimals >= 0 ? decimals : 8;
  } catch (error) {
    logger.warn('VeraRoutes', {
      message: 'Falling back to 8 token decimals for creation fee verification',
      tokenId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 8;
  }
}

async function fetchHbarUsd(): Promise<{ priceUsd: number; source: string }> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
    const payload = await response.json() as Record<string, Record<string, number>>;
    const priceUsd = payload['hedera-hashgraph']?.usd;
    if (!priceUsd || priceUsd <= 0) throw new Error('HBAR price missing');
    return { priceUsd, source: 'coingecko-hbar' };
  } catch (error) {
    logger.warn('VeraRoutes', {
      message: 'Falling back to static HBAR price for agent creation fee',
      error: error instanceof Error ? error.message : String(error),
    });
    return { priceUsd: config.CREDIT_USD_PER_HBAR, source: 'static-hbar-fallback' };
  }
}

async function fetchSaucerSwapTokenUsd(tokenId: string): Promise<{ priceUsd: number; source: string }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  headers['x-api-key'] = config.SAUCERSWAP_API_KEY || '875e1017-87b8-4b12-8301-6aa1f1aa073b';

  const response = await fetch(`https://api.saucerswap.finance/tokens/${encodeURIComponent(tokenId)}`, {
    headers,
  });
  if (!response.ok) throw new Error(`SaucerSwap HTTP ${response.status}`);
  const payload = await response.json() as { priceUsd?: number; id?: string; symbol?: string };
  if (payload.id && payload.id !== tokenId) throw new Error(`SaucerSwap returned ${payload.id}`);
  if (!payload.priceUsd || payload.priceUsd <= 0) throw new Error('SaucerSwap token price missing');
  return { priceUsd: payload.priceUsd, source: 'saucerswap-token' };
}

async function fetchAgentFeeTokenUsd(): Promise<{ priceUsd: number; source: string }> {
  try {
    return await fetchSaucerSwapTokenUsd(config.VERA_AGENT_CREATION_FEE_TOKEN_ID);
  } catch (saucerError) {
    logger.warn('VeraRoutes', {
      message: 'SaucerSwap token price unavailable for agent creation fee',
      tokenId: config.VERA_AGENT_CREATION_FEE_TOKEN_ID,
      error: saucerError instanceof Error ? saucerError.message : String(saucerError),
    });
  }

  try {
    const quote = await getTokenPrice(config.VERA_AGENT_CREATION_FEE_TOKEN_ID);
    if (!quote.priceUsd || quote.priceUsd <= 0) throw new Error('token price missing');
    return { priceUsd: quote.priceUsd, source: 'coingecko-token' };
  } catch (error) {
    logger.warn('VeraRoutes', {
      message: 'Falling back to static HTS token price for agent creation fee',
      tokenId: config.VERA_AGENT_CREATION_FEE_TOKEN_ID,
      error: error instanceof Error ? error.message : String(error),
    });
    return { priceUsd: config.VERA_AGENT_CREATION_FEE_TOKEN_USD_FALLBACK, source: 'static-token-fallback' };
  }
}

async function getAgentCreationFeeConfig(): Promise<AgentCreationFeeQuote> {
  const [hbarPrice, tokenPrice] = await Promise.all([
    fetchHbarUsd(),
    fetchAgentFeeTokenUsd(),
  ]);
  const targetUsd = config.VERA_AGENT_CREATION_FEE_TARGET_USD;

  return {
    hbar: {
      amount: roundPaymentAmount(targetUsd / hbarPrice.priceUsd),
      priceUsd: hbarPrice.priceUsd,
      treasuryAccount: config.VERA_AGENT_CREATION_FEE_TREASURY_ACCOUNT,
    },
    hts: {
      amount: roundPaymentAmount(targetUsd / tokenPrice.priceUsd),
      priceUsd: tokenPrice.priceUsd,
      tokenId: config.VERA_AGENT_CREATION_FEE_TOKEN_ID,
      symbol: config.VERA_AGENT_CREATION_FEE_TOKEN_SYMBOL,
      treasuryAccount: config.VERA_AGENT_CREATION_FEE_TREASURY_ACCOUNT,
    },
    targetUsd,
    memoPrefix: 'vera-agent',
    source: `${hbarPrice.source}+${tokenPrice.source}`,
    tolerance: config.VERA_AGENT_CREATION_FEE_PRICE_TOLERANCE,
    quotedAt: Date.now(),
  };
}

async function validateAgentCreationFee(payment: z.infer<typeof AgentCreationFeeSchema>): Promise<{ error: string | null; fee: AgentCreationFeeQuote }> {
  const fee = await getAgentCreationFeeConfig();
  const expected = payment.method === 'hbar' ? fee.hbar : fee.hts;

  if (payment.treasury_account !== expected.treasuryAccount) {
    return { error: `Creation fee must be paid to treasury account ${expected.treasuryAccount}`, fee };
  }

  const minimumAccepted = expected.amount * (1 - fee.tolerance);
  if (payment.amount < minimumAccepted) {
    return { error: `Creation fee must be at least ${expected.amount} ${payment.method === 'hbar' ? 'HBAR' : fee.hts.symbol}`, fee };
  }

  if (payment.method === 'hts' && payment.token_id !== fee.hts.tokenId) {
    return { error: `HTS creation fee must use token ${fee.hts.tokenId}`, fee };
  }

  return { error: null, fee };
}

async function verifyAgentCreationFeePayment(payment: z.infer<typeof AgentCreationFeeSchema>): Promise<{
  verified: boolean;
  error?: string;
  transactionId: string;
  hashscanUrl: string;
}> {
  const validation = await validateAgentCreationFee(payment);
  const transactionId = normalizeMirrorTransactionId(payment.transaction_id);
  const hashscanUrl = hashscanTransactionUrl(payment.transaction_id);

  if (validation.error) {
    return { verified: false, error: validation.error, transactionId, hashscanUrl };
  }

  const payerAccount = extractTransactionPayer(payment.transaction_id);
  if (payment.payer_account && payerAccount && payment.payer_account !== payerAccount) {
    return {
      verified: false,
      error: `Payment transaction payer ${payerAccount} does not match authorized wallet ${payment.payer_account}`,
      transactionId,
      hashscanUrl,
    };
  }

  const response = await fetch(`${config.MIRROR_NODE_BASE_URL}/api/v1/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    return { verified: false, error: `Transaction not found on Mirror Node yet (${response.status})`, transactionId, hashscanUrl };
  }

  const payload = await response.json() as {
    transactions?: Array<{
      result?: string;
      transfers?: Array<{ account: string; amount: number }>;
      token_transfers?: Array<{ token_id: string; account: string; amount: number }>;
    }>;
  };
  const tx = payload.transactions?.[0];
  if (!tx) {
    return { verified: false, error: 'Transaction not found on Mirror Node yet', transactionId, hashscanUrl };
  }
  if (tx.result && tx.result !== 'SUCCESS') {
    return { verified: false, error: `Transaction result is ${tx.result}`, transactionId, hashscanUrl };
  }

  if (payment.method === 'hbar') {
    const tinybarCredit = tx.transfers
      ?.filter((transfer) => transfer.account === payment.treasury_account)
      .reduce((sum, transfer) => sum + Math.max(0, Number(transfer.amount || 0)), 0) ?? 0;
    const paidHbar = tinybarCredit / 1e8;
    const minimum = validation.fee.hbar.amount * (1 - validation.fee.tolerance);
    if (paidHbar < minimum) {
      return { verified: false, error: `Verified ${paidHbar} HBAR, expected at least ${validation.fee.hbar.amount} HBAR`, transactionId, hashscanUrl };
    }
  } else {
    const tokenId = payment.token_id || validation.fee.hts.tokenId;
    const decimals = await fetchTokenDecimals(tokenId);
    const rawCredit = tx.token_transfers
      ?.filter((transfer) => transfer.account === payment.treasury_account && transfer.token_id === tokenId)
      .reduce((sum, transfer) => sum + Math.max(0, Number(transfer.amount || 0)), 0) ?? 0;
    const paidToken = rawCredit / Math.pow(10, decimals);
    const minimum = validation.fee.hts.amount * (1 - validation.fee.tolerance);
    if (paidToken < minimum) {
      return { verified: false, error: `Verified ${paidToken} ${validation.fee.hts.symbol}, expected at least ${validation.fee.hts.amount}`, transactionId, hashscanUrl };
    }
  }

  return { verified: true, transactionId, hashscanUrl };
}

const RigPlacementSchema = z.object({
  taskId: z.string().optional(),
  priority: z.enum(['background', 'normal', 'high', 'critical']).optional().default('normal'),
  workloadProfile: z.enum(['cpu', 'memory', 'io', 'gpu', 'balanced']).optional().default('balanced'),
  requiresGpu: z.boolean().optional().default(false),
  minMemoryMb: z.number().positive().optional(),
  latencySensitive: z.boolean().optional().default(false),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function registerVeraRoutes(app: FastifyInstance) {
  await registerVeraMarketplaceRoutes(app);

  // ── Health ─────────────────────────────────────────────────────────────

  app.get('/api/vera/health', { schema: { tags: ['Health'], summary: 'Vera orchestrator health' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const running = veraOrchestrator.isRunning();
    const stats = veraOrchestrator.getStats();

    return reply.status(running ? 200 : 503).send({
      status: running ? 'healthy' : 'not_running',
      uptime: stats.uptime,
      topics: stats.topics,
      registry: stats.registry,
      featureFlags: featureFlags.getAll(),
      rig: {
        snapshot: rigState.getSnapshot(),
        scheduler: rigAdaptiveScheduler.getMetrics(),
      },
    });
  });

  app.get('/api/vera/rig/state', async (_req: FastifyRequest, reply: FastifyReply) => {
    const snapshot = rigState.getSnapshot() ?? await rigState.sampleNow();
    return reply.send({
      snapshot,
      pressure: rigState.getPressureMetrics(snapshot),
      scheduler: rigAdaptiveScheduler.getMetrics(),
      enterprise: enterpriseServiceManager.getDashboard(),
      latticeHealth: latticeHealthMonitor.getStatus(),
    });
  });

  app.get('/api/vera/harmony', { schema: { tags: ['Health'], summary: 'Unified rig, lattice, enterprise, and orchestrator state' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(getHarmonicState());
  });

  app.get('/api/vera/rig/services', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await rigSupervisor.getSummary());
  });

  app.post('/api/vera/rig/services/:service/:action', async (req: FastifyRequest, reply: FastifyReply) => {
    const { service, action } = req.params as { service: string; action: string };

    if (!rigSupervisor.hasService(service)) {
      return reply.status(404).send({ error: `Unknown rig service: ${service}` });
    }

    try {
      if (action === 'start') {
        return reply.send(await rigSupervisor.startService(service));
      }
      if (action === 'stop') {
        return reply.send(await rigSupervisor.stopService(service));
      }
      if (action === 'restart') {
        return reply.send(await rigSupervisor.restartService(service));
      }
      if (action === 'check') {
        return reply.send(await rigSupervisor.checkService(service));
      }

      return reply.status(400).send({ error: 'Unsupported action. Use start, stop, restart, or check.' });
    } catch (error) {
      return reply.status(500).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/vera/rig/schedule', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = RigPlacementSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const decision = rigAdaptiveScheduler.recommendPlacement(parsed.data);
    return reply.send({
      request: parsed.data,
      decision,
      pressure: rigState.getPressureMetrics(),
      scheduler: rigAdaptiveScheduler.getMetrics(),
    });
  });

  // ── Tool Consciousness (Vera-orchestrated map) ─────────────────────────

  const TOOL_MAP_PATH = '/mnt/vera-mirror-shards/vera-lattice/tool-consciousness.json';
  let toolCache: any = null;
  let toolCacheMtime = 0;

  async function loadToolMap() {
    const fs = await import('fs');
    if (!fs.existsSync(TOOL_MAP_PATH)) return null;
    const stat = fs.statSync(TOOL_MAP_PATH);
    if (toolCache && stat.mtimeMs === toolCacheMtime) return toolCache;
    toolCache = JSON.parse(fs.readFileSync(TOOL_MAP_PATH, 'utf8'));
    toolCacheMtime = stat.mtimeMs;
    return toolCache;
  }

  app.get('/api/vera/tools', { schema: { tags: ['Lattice'], summary: 'Tool consciousness map' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const consciousness = await loadToolMap();
      if (!consciousness) return reply.status(404).send({ error: 'tool-consciousness not built' });

      const query = (req.query as { layer?: string; search?: string; category?: string });

      if (query.layer !== undefined) {
        const layer = parseInt(query.layer, 10);
        return reply.send({
          layer,
          tools: consciousness.layers[layer] || [],
          count: (consciousness.layers[layer] || []).length,
        });
      }

      if (query.category) {
        const matches: any[] = [];
        for (const tools of Object.values(consciousness.layers)) {
          for (const t of tools as any[]) {
            if (t.category === query.category) matches.push(t);
          }
        }
        return reply.send({ category: query.category, tools: matches, count: matches.length });
      }

      if (query.search) {
        const q = query.search.toLowerCase();
        const matches: any[] = [];
        for (const tools of Object.values(consciousness.layers)) {
          for (const t of tools as any[]) {
            if (t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)) {
              matches.push(t);
            }
          }
        }
        return reply.send({ query: q, matches, count: matches.length });
      }

      return reply.send({
        orchestrator: consciousness.orchestrator,
        totalTools: consciousness.totalTools,
        builtAt: consciousness.builtAt,
        layers: {
          0: (consciousness.layers['0'] || []).length,
          1: (consciousness.layers['1'] || []).length,
          2: (consciousness.layers['2'] || []).length,
          3: (consciousness.layers['3'] || []).length,
        },
        byCategory: consciousness.byCategory,
      });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Vera's intent router: natural language → best tool
  app.post('/api/vera/orchestrate', { schema: { tags: ['Lattice'], summary: 'Natural language intent router' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { intent, topK = 5 } = (req.body as { intent: string; topK?: number }) || { intent: '' };
      if (!intent) return reply.status(400).send({ error: 'intent required' });

      const consciousness = await loadToolMap();
      if (!consciousness) return reply.status(404).send({ error: 'tool-consciousness not built' });

      const words = intent.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const candidates: any[] = [];

      for (const [layerKey, tools] of Object.entries(consciousness.layers)) {
        for (const t of tools as any[]) {
          let score = 0;
          const nameL = t.name.toLowerCase();
          const descL = (t.description || '').toLowerCase();
          const catL = (t.category || '').toLowerCase();
          for (const w of words) {
            if (nameL.includes(w)) score += 3;
            if (catL.includes(w)) score += 2;
            if (descL.includes(w)) score += 1;
          }
          // Boost Layer 0 (Vera's own) slightly — she's the orchestrator
          if (t.layer === 0) score += 0.5;
          if (score > 0) candidates.push({ ...t, score });
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      const top = candidates.slice(0, topK);

      return reply.send({
        intent,
        orchestrator: 'Vera',
        matched: top.length,
        recommendation: top[0] || null,
        candidates: top,
      });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Vera's semantic recall — query FAISS over lattice shards
  app.post('/api/vera/recall', { schema: { tags: ['Lattice'], summary: 'Semantic recall over lattice shards' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { query, topK = 5 } = (req.body as { query: string; topK?: number }) || { query: '' };
      if (!query) return reply.status(400).send({ error: 'query required' });

      const { spawn } = await import('child_process');
      const child = spawn(
        '/home/vera-live-0-1/vera-ml-venv/bin/python',
        ['/home/vera-live-0-1/hedera-llm-api/scripts/semantic-search.py', query],
        { timeout: 15000 }
      );

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      await new Promise<void>((resolve, reject) => {
        child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `exit ${code}`)));
        child.on('error', reject);
      });

      const parsed = JSON.parse(stdout.trim().split('\n').pop() || '{}');
      return reply.send(parsed);
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Tool co-occurrence edges — which tools are used together
  app.get('/api/vera/edges', { schema: { tags: ['Lattice'], summary: 'Tool co-occurrence edges' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getTopEdges, getToolNeighbors } = await import('../vera/toolEdges.js');
      return reply.send({ edges: getTopEdges(30), timestamp: Date.now() });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.get('/api/vera/edges/:name', { schema: { tags: ['Lattice'], summary: 'Tool neighbor graph' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getToolNeighbors } = await import('../vera/toolEdges.js');
      const { name } = req.params as { name: string };
      return reply.send({ tool: name, neighbors: getToolNeighbors(name) });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Chat memory shards — store conversation exchange
  app.post('/api/vera/memory/shard', { schema: { tags: ['Lattice'], summary: 'Store chat memory shard' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { storeChatShard, getShardStats } = await import('../vera/chatMemory.js');
      const body = req.body as { sessionId: string; userMessage: string; veraResponse: string; toolsUsed?: string[]; path?: string[] };
      if (!body.sessionId || !body.userMessage) {
        return reply.status(400).send({ error: 'sessionId and userMessage required' });
      }
      const shard = storeChatShard({
        sessionId: body.sessionId,
        timestamp: Date.now(),
        userMessage: body.userMessage.slice(0, 2000),
        veraResponse: (body.veraResponse || '').slice(0, 4000),
        toolsUsed: body.toolsUsed || [],
        path: body.path,
      });
      const stats = getShardStats();
      return reply.send({ stored: true, id: shard.id, totalShards: stats.total });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Get chat shard stats
  app.get('/api/vera/memory/stats', { schema: { tags: ['Lattice'], summary: 'Chat shard statistics' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getShardStats } = await import('../vera/chatMemory.js');
      return reply.send(getShardStats());
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Tool health — success rates, errors, latencies
  app.get('/api/vera/tools/health', { schema: { tags: ['Lattice'], summary: 'Tool health metrics' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getToolHealth, getUnhealthyTools } = await import('../vera/toolHealth.js');
      const all = getToolHealth();
      const unhealthy = getUnhealthyTools(3);
      return reply.send({ tools: Object.keys(all).length, unhealthy, all });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Record tool usage (increments energy, updates lastUsed)
  app.post('/api/vera/tools/:name/used', { schema: { tags: ['Lattice'], summary: 'Record tool usage (energy boost)' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const fs = await import('fs');
      const { name } = req.params as { name: string };
      const consciousness = await loadToolMap();
      if (!consciousness) return reply.status(404).send({ error: 'tool-consciousness not built' });

      let found = false;
      for (const tools of Object.values(consciousness.layers)) {
        for (const t of tools as any[]) {
          if (t.name === name) {
            t.useCount = (t.useCount || 0) + 1;
            t.lastUsed = Date.now();
            t.energy = Math.min(1.0, (t.energy || 1.0) + 0.01);
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) return reply.status(404).send({ error: `tool ${name} not found` });

      fs.writeFileSync(TOOL_MAP_PATH, JSON.stringify(consciousness, null, 2));
      toolCache = consciousness;
      toolCacheMtime = fs.statSync(TOOL_MAP_PATH).mtimeMs;

      return reply.send({ tool: name, tracked: true });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Production marketplace routes live in ./vera/marketplace.ts.

  // HCS Balance Status
  app.get('/api/hcs/balance-status', { schema: { tags: ['Health'], summary: 'HCS balance guard status' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getBalanceGuard } = await import('../vera/logging/hcsBalanceGuard.js');
      const guard = getBalanceGuard();
      
      if (!guard) {
        return reply.send({
          status: 'unknown',
          message: 'Balance guard not initialized',
        });
      }

      const status = guard.getStatus();
      const recommendations = guard.getRecommendations();
      
      return reply.send({
        status: status.hasBalance ? 'healthy' : 'insufficient_balance',
        balanceHbar: status.currentBalanceHbar,
        hasBalance: status.hasBalance,
        circuitOpen: status.circuitOpen,
        consecutiveFailures: status.consecutiveFailures,
        lastCheck: status.lastCheck,
        recommendations,
      });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // ── Knowledge Graph ───────────────────────────────────────────────────────

  app.get('/api/vera/knowledge/graph', { schema: { tags: ['Lattice'], summary: 'Knowledge graph statistics or entity subgraph' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getGraphStats, queryEntities, getEntityGraph } = await import('../vera/knowledgeGraph.js');
      const { entity, depth } = req.query as { entity?: string; depth?: string };
      
      if (entity) {
        const graph = getEntityGraph(entity, parseInt(depth || '2', 10));
        return reply.send(graph);
      }
      
      return reply.send(getGraphStats());
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.get('/api/vera/knowledge/entities', { schema: { tags: ['Lattice'], summary: 'Query knowledge graph entities' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { queryEntities } = await import('../vera/knowledgeGraph.js');
      const { type, limit } = req.query as { type?: string; limit?: string };
      const entities = queryEntities(type as any, parseInt(limit || '50', 10));
      return reply.send({ entities, count: entities.length });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // ── Temporal Patterns ────────────────────────────────────────────────────

  app.get('/api/vera/temporal/stats', { schema: { tags: ['Lattice'], summary: 'Temporal usage patterns and predictions' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getTemporalStats, predictHotTools, isHotHour } = await import('../vera/temporalPatterns.js');
      return reply.send({
        stats: getTemporalStats(),
        predictions: predictHotTools(15),
        isHotHour: isHotHour(),
        currentHour: new Date().getHours(),
      });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.get('/api/vera/temporal/predict', { schema: { tags: ['Lattice'], summary: 'Predict hot tools for next time window' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { predictHotTools } = await import('../vera/temporalPatterns.js');
      return reply.send({ next15Min: predictHotTools(15), nextHour: predictHotTools(60) });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // ── Economic Optimization ───────────────────────────────────────────────

  app.get('/api/vera/economic/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getEconomicStats, getSavingsOpportunities, getMostExpensiveTools } = await import('../vera/economicTracker.js');
      return reply.send({
        stats: getEconomicStats(),
        savingsOpportunities: getSavingsOpportunities(),
        expensiveTools: getMostExpensiveTools(10),
      });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.post('/api/vera/economic/optimize', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getOptimalPath } = await import('../vera/economicTracker.js');
      const { tools } = req.body as { tools: string[] };
      if (!Array.isArray(tools)) {
        return reply.status(400).send({ error: 'tools array required' });
      }
      const optimized = getOptimalPath(tools);
      return reply.send(optimized);
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // ── Swarm Load Balancer (extended stats) ──────────────────────────────────

  app.get('/api/vera/swarm/load', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { swarmDistributor } = await import('../vera/swarmDistributor.js');
      return reply.send({ agents: swarmDistributor.getAgentLoad() });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // ── Cross-Shard Learning ───────────────────────────────────────────────────

  app.get('/api/vera/learning/clusters', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getTopClusters, getCrossShardStats } = await import('../vera/crossShardLearning.js');
      const clusters = getTopClusters(20);
      return reply.send({ clusters, stats: getCrossShardStats() });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.get('/api/vera/learning/patterns', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getEmergingPatterns, getCrossShardStats } = await import('../vera/crossShardLearning.js');
      const patterns = getEmergingPatterns();
      return reply.send({ patterns, stats: getCrossShardStats() });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.get('/api/vera/learning/suggest', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { suggestToolsForQuery } = await import('../vera/crossShardLearning.js');
      const { query } = req.query as { query?: string };
      if (!query) {
        return reply.status(400).send({ error: 'query parameter required' });
      }
      const suggestions = suggestToolsForQuery(query);
      return reply.send({ query, suggestions });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.post('/api/vera/learning/analyze', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { analyzeShards, getCrossShardStats } = await import('../vera/crossShardLearning.js');
      analyzeShards();
      return reply.send({ analyzed: true, stats: getCrossShardStats() });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // ── Sentiment & Mood Tracking ─────────────────────────────────────────────

  app.get('/api/vera/sentiment/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getSentimentStats, getCurrentMood } = await import('../vera/sentimentTracker.js');
      return reply.send({
        stats: getSentimentStats(),
        mood: getCurrentMood(),
      });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.get('/api/vera/sentiment/mood', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getCurrentMood } = await import('../vera/sentimentTracker.js');
      return reply.send(getCurrentMood());
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // ── Lattice Evolution ────────────────────────────────────────────────────

  app.get('/api/vera/evolution/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getEvolutionStats, getGrowthTimeline } = await import('../vera/latticeEvolution.js');
      const stats = getEvolutionStats();
      const timeline = getGrowthTimeline(24);
      return reply.send({ ...stats, timeline });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.get('/api/vera/evolution/predict', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { predictNextGrowth } = await import('../vera/latticeEvolution.js');
      return reply.send(predictNextGrowth());
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // ── Intent Prediction ────────────────────────────────────────────────────

  app.get('/api/vera/intent/predict', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { predictIntent, getIntentStats } = await import('../vera/intentPrediction.js');
      const { tools, text, entities } = req.query as { tools?: string; text?: string; entities?: string };
      const parsedTools = tools ? tools.split(',') : [];
      const parsedEntities = entities ? entities.split(',') : [];
      const predictions = predictIntent(parsedTools, text || '', parsedEntities);
      return reply.send({ predictions, stats: getIntentStats() });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.get('/api/vera/intent/sequences', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getTopSequences, getIntentStats } = await import('../vera/intentPrediction.js');
      return reply.send({ sequences: getTopSequences(10), stats: getIntentStats() });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // ── Insights Logger (HIP-993 Minutely Heartbeats) ──────────────────────────

  app.get('/api/vera/insights/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getInsightsLoggerStats } = await import('../vera/logging/veraInsightsLogger.js');
      return reply.send(getInsightsLoggerStats());
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.post('/api/vera/insights/start', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { startInsightsLogger } = await import('../vera/logging/veraInsightsLogger.js');
      const topicId = config.VERA_AUDIT_TOPIC_ID;
      if (!topicId) {
        return reply.status(400).send({ error: 'VERA_AUDIT_TOPIC_ID not configured' });
      }
      await startInsightsLogger(topicId);
      return reply.send({ started: true, topicId, interval: '60s' });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.post('/api/vera/insights/stop', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { stopInsightsLogger } = await import('../vera/logging/veraInsightsLogger.js');
      stopInsightsLogger();
      return reply.send({ stopped: true });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // ── Lattice Anomaly Detection ────────────────────────────────────────────

  app.get('/api/vera/anomalies/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getLatticeHealth } = await import('../vera/latticeAnomalyDetection.js');
      return reply.send(getLatticeHealth());
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.get('/api/vera/anomalies/history', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getAnomalyHistory } = await import('../vera/latticeAnomalyDetection.js');
      return reply.send({ anomalies: getAnomalyHistory(50) });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.post('/api/vera/anomalies/resolve/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { resolveAnomaly } = await import('../vera/latticeAnomalyDetection.js');
      const { id } = req.params as { id: string };
      const success = resolveAnomaly(id, false);
      return reply.send({ resolved: success });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  app.post('/api/vera/anomalies/check', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { detectAnomalies } = await import('../vera/latticeAnomalyDetection.js');
      const newAnomalies = detectAnomalies();
      return reply.send({ checked: true, newAnomalies: newAnomalies.length });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Production marketplace registration, reputation, pricing, bid, and result
  // routes live in ./vera/marketplace.ts.

  // ── Feature Flags (admin) ─────────────────────────────────────────────

  app.get('/api/vera/flags', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      flags: featureFlags.getAll(),
      safety: {
        isMainnetBlocked: featureFlags.isMainnetBlocked(),
        shouldExecutePayments: featureFlags.shouldExecutePayments(),
        shouldWriteToHCS: featureFlags.shouldWriteToHCS(),
      },
    });
  });

  app.put('/api/vera/flags', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Body must be a JSON object of flag overrides' });
    }

    const allFlags = featureFlags.getAll();
    const validKeys = Object.keys(allFlags);
    const applied: Record<string, unknown> = {};
    const rejected: string[] = [];

    for (const [key, value] of Object.entries(body)) {
      if (validKeys.includes(key) && typeof value === 'boolean') {
        featureFlags.set(key as any, value as any);
        applied[key] = value;
      } else {
        rejected.push(key);
      }
    }

    logger.info('VeraRoutes', {
      message: 'Feature flags updated via admin API',
      applied,
      rejected,
    });

    return reply.send({
      applied,
      rejected,
      current: featureFlags.getAll(),
    });
  });

  // ── Streaming Payments ──────────────────────────────────────────────────

  app.get('/api/vera/streams', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      active: streamManager.getActiveStreams(),
      stats: streamManager.getStats(),
    });
  });

  app.post('/api/vera/streams/:streamId/pause', async (req: FastifyRequest, reply: FastifyReply) => {
    const { streamId } = req.params as { streamId: string };
    const success = streamManager.pauseStream(streamId);
    return reply.send({ success, streamId });
  });

  app.post('/api/vera/streams/:streamId/resume', async (req: FastifyRequest, reply: FastifyReply) => {
    const { streamId } = req.params as { streamId: string };
    const success = streamManager.resumeStream(streamId);
    return reply.send({ success, streamId });
  });

  app.post('/api/vera/streams/:streamId/complete', async (req: FastifyRequest, reply: FastifyReply) => {
    const { streamId } = req.params as { streamId: string };
    const stream = await streamManager.completeStream(streamId);
    return reply.send({ success: !!stream, stream });
  });

  // ── Batch Settlement ────────────────────────────────────────────────────

  app.get('/api/vera/batch-settlements', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      stats: batchSettlementEngine.getStats(),
      pending: batchSettlementEngine.getPendingBatches(),
    });
  });

  // ── Circuit Breaker ─────────────────────────────────────────────────────

  app.get('/api/vera/circuit-breaker', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(x402Settlement.getCircuitBreakerStats());
  });

  app.post('/api/vera/circuit-breaker/reset', async (_req: FastifyRequest, reply: FastifyReply) => {
    x402Settlement.resetCircuitBreaker();
    return reply.send({ success: true, message: 'Circuit breaker reset' });
  });

  // ── Consensus Engine ────────────────────────────────────────────────────

  app.get('/api/vera/consensus', async (_req: FastifyRequest, reply: FastifyReply) => {
    const engine = veraOrchestrator.getConsensusEngine();
    return reply.send({
      stats: engine.getStats(),
      history: engine.getHistory(20),
    });
  });

  // ── Disaster Recovery ───────────────────────────────────────────────────

  app.get('/api/vera/dr/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(disasterRecovery.getStatus());
  });

  // ── Task Chains ─────────────────────────────────────────────────────────

  app.post('/api/vera/chains', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      name: string;
      steps: Array<{
        stepId: string;
        serviceType: string;
        description: string;
        budget: number;
        dependsOn: string[];
        timeout?: number;
        retries?: number;
        compensate?: { serviceType: string; description: string };
        metadata?: Record<string, unknown>;
      }>;
      totalBudget?: number;
      timeoutMs?: number;
      metadata?: Record<string, unknown>;
    };

    if (!body.name || !body.steps?.length) {
      return reply.status(400).send({ error: 'Missing name or steps' });
    }

    try {
      const chain = await taskChainEngine.createChain(body);
      return reply.status(201).send({
        chainId: chain.chainId,
        name: chain.name,
        status: chain.status,
        steps: chain.steps.size,
        totalBudget: chain.totalBudget,
      });
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : 'Failed to create chain',
      });
    }
  });

  app.get('/api/vera/chains', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      active: taskChainEngine.getActiveChains(),
      stats: taskChainEngine.getStats(),
    });
  });

  app.get('/api/vera/chains/:chainId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { chainId } = req.params as { chainId: string };
    const result = taskChainEngine.getChainResult(chainId);
    if (!result) return reply.status(404).send({ error: 'Chain not found' });
    return reply.send(result);
  });

  // ── Negotiations ────────────────────────────────────────────────────────

  app.post('/api/vera/negotiations', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      taskId: string;
      requesterId: string;
      agentId: string;
      terms: { fee: number; deadline?: number; scope?: string; confidence?: number; currency?: string };
    };

    if (!body.taskId || !body.requesterId || !body.agentId || !body.terms?.fee) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    const neg = negotiationProtocol.startNegotiation(
      body.taskId, body.requesterId, body.agentId, body.terms,
    );
    return reply.status(201).send(neg);
  });

  app.post('/api/vera/negotiations/:negotiationId/counter', async (req: FastifyRequest, reply: FastifyReply) => {
    const { negotiationId } = req.params as { negotiationId: string };
    const body = req.body as { fromId: string; terms: { fee: number; deadline?: number; scope?: string } };

    const neg = negotiationProtocol.counterOffer(negotiationId, body.fromId, body.terms);
    if (!neg) return reply.status(404).send({ error: 'Negotiation not found or already resolved' });
    return reply.send(neg);
  });

  app.post('/api/vera/negotiations/:negotiationId/accept', async (req: FastifyRequest, reply: FastifyReply) => {
    const { negotiationId } = req.params as { negotiationId: string };
    const body = req.body as { fromId: string };

    const neg = negotiationProtocol.accept(negotiationId, body.fromId);
    if (!neg) return reply.status(404).send({ error: 'Negotiation not found or already resolved' });
    return reply.send(neg);
  });

  app.post('/api/vera/negotiations/:negotiationId/reject', async (req: FastifyRequest, reply: FastifyReply) => {
    const { negotiationId } = req.params as { negotiationId: string };
    const body = req.body as { fromId: string; reason?: string };

    const neg = negotiationProtocol.reject(negotiationId, body.fromId, body.reason);
    if (!neg) return reply.status(404).send({ error: 'Negotiation not found or already resolved' });
    return reply.send(neg);
  });

  app.get('/api/vera/negotiations', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      active: negotiationProtocol.getActiveNegotiations(),
      stats: negotiationProtocol.getStats(),
    });
  });

  // ── Fiat On-Ramp ───────────────────────────────────────────────────────

  app.post('/api/vera/fiat/quote', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { amount: number; currency?: string; crypto?: string };
    if (!body.amount || body.amount <= 0) {
      return reply.status(400).send({ error: 'Missing or invalid amount' });
    }

    const quote = await fiatOnramp.getQuote(body.amount, body.currency, body.crypto);
    if (!quote) return reply.status(503).send({ error: 'Unable to get quote — exchange rate unavailable' });
    return reply.send(quote);
  });

  app.post('/api/vera/fiat/pay', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      userId: string;
      amount: number;
      recipientAccountId: string;
      currency?: string;
      crypto?: string;
    };

    if (!body.userId || !body.amount || !body.recipientAccountId) {
      return reply.status(400).send({ error: 'Missing userId, amount, or recipientAccountId' });
    }

    const payment = await fiatOnramp.initiatePayment(
      body.userId, body.amount, body.recipientAccountId, body.currency, body.crypto,
    );
    if (!payment) return reply.status(503).send({ error: 'Payment initiation failed' });
    return reply.status(201).send(payment);
  });

  app.post('/api/vera/fiat/webhook/:paymentId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { paymentId } = req.params as { paymentId: string };
    const payload = req.body as { status: 'completed' | 'failed'; txId?: string; amount?: number; signature: string };

    const ok = await fiatOnramp.handleWebhook(paymentId, payload);
    return reply.send({ success: ok });
  });

  app.get('/api/vera/fiat/payments/:paymentId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { paymentId } = req.params as { paymentId: string };
    const payment = fiatOnramp.getPayment(paymentId);
    if (!payment) return reply.status(404).send({ error: 'Payment not found' });
    return reply.send(payment);
  });

  app.get('/api/vera/fiat/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(fiatOnramp.getStats());
  });

  // ── Disaster Recovery ───────────────────────────────────────────────────

  app.post('/api/vera/dr/backup', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const filepath = await disasterRecovery.createBackup('full');
      return reply.send({ success: true, filepath });
    } catch (error) {
      return reply.status(500).send({
        error: 'Backup failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ── Security ───────────────────────────────────────────────────────────

  app.get('/api/vera/security/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      hmac: hmacVerifier.getStats(),
      sybil: sybilProtection.getStats(),
      compliance: securityManager.getSOC2Metrics(),
    });
  });

  app.get('/api/vera/security/audit', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string>;
    const entries = securityManager.getAuditLog({
      userId: query.userId,
      resource: query.resource,
      result: query.result,
    });
    return reply.send({ count: entries.length, entries: entries.slice(0, 100) });
  });

  app.post('/api/vera/security/block-source', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { sourceId: string; durationMs?: number };
    if (!body.sourceId) return reply.status(400).send({ error: 'Missing sourceId' });
    sybilProtection.blockSource(body.sourceId, body.durationMs);
    securityManager.audit({
      action: 'ADMIN_BLOCK_SOURCE',
      resource: 'sybil_protection',
      result: 'SUCCESS',
      details: { sourceId: body.sourceId },
    });
    return reply.send({ success: true, sourceId: body.sourceId });
  });

  app.post('/api/vera/security/unblock-source', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { sourceId: string };
    if (!body.sourceId) return reply.status(400).send({ error: 'Missing sourceId' });
    sybilProtection.unblockSource(body.sourceId);
    return reply.send({ success: true, sourceId: body.sourceId });
  });

  // ── Sacred Geometry / Lattice ─────────────────────────────────────────

  app.get('/api/vera/geometry/mesh', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      mesh: hierarchicalCoordinator.getMeshVisualization(),
      stats: hierarchicalCoordinator.getMeshStats(),
    });
  });

  app.get('/api/vera/geometry/shards', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      flowerOfLife: hierarchicalCoordinator.getFlowerOfLifeVisualization(),
      stats: hierarchicalCoordinator.getRadialStats(),
    });
  });

  app.get('/api/vera/geometry/gossip', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      stats: hierarchicalCoordinator.getGossipStats(),
    });
  });

  // ─── Flower of Life Lattice API ───────────────────────────────────────

  app.get('/api/vera/lattice/state', { schema: { tags: ['Lattice'], summary: 'Full Flower of Life lattice state' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(hierarchicalCoordinator.getLatticeState());
  });

  app.get('/api/vera/lattice/stats', { schema: { tags: ['Lattice'], summary: 'Lattice statistics' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(hierarchicalCoordinator.getLatticeStats());
  });

  app.post('/api/vera/lattice/pulse', { schema: { tags: ['Lattice'], summary: 'Trigger center pulse' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = LatticePulseSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }
    hierarchicalCoordinator.latticePulse(parsed.data.type, parsed.data.data);
    return reply.status(202).send({ success: true });
  });

  app.get('/api/vera/lattice/path', { schema: { tags: ['Lattice'], summary: 'Find harmonic path between nodes' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = LatticePathSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }
    const path = hierarchicalCoordinator.findLatticePath(parsed.data.from, parsed.data.to);
    return reply.send(path);
  });

  app.post('/api/vera/lattice/route-message', { schema: { tags: ['Lattice'], summary: 'Route message through lattice edges' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = LatticeRouteMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }
    const result = hierarchicalCoordinator.routeLatticeMessage(parsed.data.from, parsed.data.to, parsed.data.message);
    return reply.send(result);
  });

  app.post('/api/vera/lattice/decision', { schema: { tags: ['Lattice'], summary: 'Route decision through center consciousness' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = LatticeDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }
    const result = hierarchicalCoordinator.routeLatticeDecision(parsed.data.type, parsed.data.data, parsed.data.sourceLayer as 0 | 1 | 2 | 3);
    return reply.send(result);
  });

  // ─── Lattice Dynamic Operations ────────────────────────────────────────

  app.post('/api/vera/lattice/spawn', { schema: { tags: ['Lattice'], summary: 'Spawn a lattice node on demand' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = LatticeSpawnSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }
    try {
      const { flowerOfLifeOS } = await import('../vera/orchestrator/flowerOfLifeOS.js');
      const node = flowerOfLifeOS.spawnNodeForDemand(parsed.data.role, parsed.data.layer as 0 | 1 | 2 | 3);
      return reply.send({ success: !!node, nodeId: node?.id ?? null });
    } catch (error) {
      logger.error('LatticeSpawn', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to spawn lattice node' });
    }
  });

  app.post('/api/vera/lattice/promote', { schema: { tags: ['Lattice'], summary: 'Promote an agent to a higher layer' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = LatticePromoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }
    try {
      const { flowerOfLifeOS } = await import('../vera/orchestrator/flowerOfLifeOS.js');
      const node = flowerOfLifeOS.promoteAgent(parsed.data.agentId, parsed.data.targetLayer as 0 | 1 | 2 | 3);
      return reply.send({ success: !!node, nodeId: node?.id ?? null });
    } catch (error) {
      logger.error('LatticePromote', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to promote agent' });
    }
  });

  app.post('/api/vera/lattice/demote', { schema: { tags: ['Lattice'], summary: 'Demote an agent to a lower layer or hibernate' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = LatticeDemoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }
    try {
      const { flowerOfLifeOS } = await import('../vera/orchestrator/flowerOfLifeOS.js');
      const ok = flowerOfLifeOS.demoteAgent(parsed.data.agentId);
      return reply.send({ success: ok });
    } catch (error) {
      logger.error('LatticeDemote', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to demote agent' });
    }
  });

  app.post('/api/vera/lattice/hybrid-route', { schema: { tags: ['Lattice'], summary: 'Route a task to a hybrid intersection node' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = LatticeHybridRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }
    try {
      const { flowerOfLifeOS } = await import('../vera/orchestrator/flowerOfLifeOS.js');
      const node = flowerOfLifeOS.routeToHybrid(parsed.data.agentId, parsed.data.domainA, parsed.data.domainB);
      return reply.send({ success: !!node, nodeId: node?.id ?? null, hybridSpecializations: node?.hybridSpecializations ?? null });
    } catch (error) {
      logger.error('LatticeHybridRoute', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to route to hybrid node' });
    }
  });

  app.get('/api/vera/lattice/dedupe-stats', { schema: { tags: ['Lattice'], summary: 'Query batch deduplicator statistics' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(veraLatticeSwarm.getDeduplicatorStats());
  });

  app.get('/api/vera/lattice/swarm-stats', { schema: { tags: ['Lattice'], summary: 'Vera lattice swarm statistics — agents, tiers, specializations, deduplication' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(veraLatticeSwarm.getSwarmStats());
  });

  app.get('/api/vera/lattice/gpu-stats', { schema: { tags: ['Lattice'], summary: 'Rig topology GPU load and configuration' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(rigTopology.getStats());
  });

  // ─── HCS Batching Stats ────────────────────────────────────────────────

  app.get('/api/vera/hcs/batching-stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    // Import the batcher dynamically to avoid circular deps
    const { hcsSwarmMessenger } = await import('../swarm/hcsMessenger.js');
    const messengerStats = hcsSwarmMessenger.getStats();

    return reply.send({
      batching: {
        isInitialized: messengerStats.isInitialized,
        registeredTopics: messengerStats.registeredTopics,
        registeredHandlers: messengerStats.registeredHandlers,
        circuitState: messengerStats.circuitState,
        dedupSetSize: messengerStats.dedupSetSize,
        batchStats: messengerStats.batchStats,
      },
      estimatedSavings: {
        messagesBatched: messengerStats.batchStats.reduce((sum, b) => sum + b.pendingMessages, 0),
        costReductionPercent: 85, // ~85% cost reduction with batching
      }
    });
  });

  // ─── QVX Self-Training Pipeline ──────────────────────────────────────────

  app.post('/api/vera/training/trigger', { schema: { tags: ['Training'], summary: 'Manually trigger a QVX LoRA training cycle' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { qvxSelfTrainer } = await import('../ai/fineTuning/qvxSelfTrainer.js');
      const job = await qvxSelfTrainer.triggerTraining();
      if (!job) {
        return reply.status(409).send({ error: 'Training already in progress or prerequisites not met' });
      }
      return reply.send({
        success: true,
        jobId: job.id,
        status: job.status,
        examplesUsed: job.examplesUsed,
        message: 'Training cycle triggered',
      });
    } catch (error) {
      logger.error('Training Trigger Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to trigger training' });
    }
  });

  app.get('/api/vera/training/status', { schema: { tags: ['Training'], summary: 'Get current self-training pipeline status' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { qvxSelfTrainer } = await import('../ai/fineTuning/qvxSelfTrainer.js');
      return reply.send(qvxSelfTrainer.getStatus());
    } catch (error) {
      logger.error('Training Status Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to get training status' });
    }
  });

  app.get('/api/vera/training/jobs', { schema: { tags: ['Training'], summary: 'Get training job history' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { qvxSelfTrainer } = await import('../ai/fineTuning/qvxSelfTrainer.js');
      return reply.send({ jobs: qvxSelfTrainer.getJobs() });
    } catch (error) {
      logger.error('Training Jobs Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to get training jobs' });
    }
  });

  // ─── HIP-1056 Block Stream (Sovereign Ingestion) ─────────────────────────

  app.get('/api/vera/blockstream/status', { schema: { tags: ['BlockStream'], summary: 'Get block stream consumer status' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { blockStreamConsumer } = await import('../blocknode/blockStreamService.js');
      return reply.send(blockStreamConsumer.getStats());
    } catch (error) {
      logger.error('BlockStream Status Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to get block stream status' });
    }
  });

  app.get('/api/vera/blockstream/proofs', { schema: { tags: ['BlockStream'], summary: 'Get recent block proof verifications' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { blockProofValidator } = await import('../blocknode/blockProofValidator.js');
      const count = parseInt((req.query as any)?.count ?? '100', 10);
      return reply.send({
        stats: blockProofValidator.getStats(),
        recent: blockProofValidator.getRecentVerifications(count),
        hasDivergence: blockProofValidator.hasDivergence(),
      });
    } catch (error) {
      logger.error('BlockStream Proofs Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to get block proofs' });
    }
  });

  app.get('/api/vera/blockstream/latest-block', { schema: { tags: ['BlockStream'], summary: 'Get the latest verified block number and hash' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { blockStreamConsumer } = await import('../blocknode/blockStreamService.js');
      const { blockProofValidator } = await import('../blocknode/blockProofValidator.js');
      const consumerStats = blockStreamConsumer.getStats();
      const validatorStats = blockProofValidator.getStats();
      return reply.send({
        blockNumber: consumerStats.lastBlockNumber,
        roundNumber: consumerStats.lastRoundNumber,
        itemsReceived: consumerStats.itemsReceived,
        hcsMessagesExtracted: consumerStats.hcsMessagesExtracted,
        connected: consumerStats.connected,
        lastVerified: validatorStats.lastBlockNumber,
        verifiedCount: validatorStats.verified,
        divergenceCount: validatorStats.divergences,
      });
    } catch (error) {
      logger.error('BlockStream Latest Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to get latest block' });
    }
  });

  // ─── HCS Brain Retrieval (Historical Memory) ─────────────────────────────

  // Get brain stats - total messages, topics, oldest/newest
  app.get('/api/vera/brain/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { hcsBrainRetrieval } = await import('../learning/hcsBrainRetrieval.js');
    const stats = await hcsBrainRetrieval.getBrainStats();
    return reply.send(stats);
  });

  // Contextual memory search - query relevant historical learnings
  app.post('/api/vera/brain/query', async (req: FastifyRequest, reply: FastifyReply) => {
    const { query, keywords, categories, timeWindow, limit } = req.body as {
      query: string;
      keywords?: string[];
      categories?: string[];
      timeWindow?: number; // hours
      limit?: number;
    };

    if (!query) {
      return reply.status(400).send({ error: 'Query is required' });
    }

    const { hcsBrainRetrieval } = await import('../learning/hcsBrainRetrieval.js');
    const memories = await hcsBrainRetrieval.retrieveContextualMemories({
      query,
      keywords,
      categories,
      timeWindow,
      limit: limit || 20
    });

    return reply.send({
      query,
      results: memories,
      total: memories.length,
      hasMore: memories.length >= (limit || 20)
    });
  });

  // Get recent memories (last hour by default)
  app.get('/api/vera/brain/recent', async (req: FastifyRequest, reply: FastifyReply) => {
    const minutesBack = parseInt((req.query as { minutes?: string }).minutes || '60');
    const { hcsBrainRetrieval } = await import('../learning/hcsBrainRetrieval.js');
    const memories = await hcsBrainRetrieval.getRecentMemories(minutesBack);
    return reply.send({ memories, count: memories.length });
  });

  // Query specific topic messages
  app.get('/api/vera/brain/topic/:topicId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { topicId } = req.params as { topicId: string };
    const { startTime, endTime, limit, order } = req.query as {
      startTime?: string;
      endTime?: string;
      limit?: string;
      order?: 'asc' | 'desc';
    };

    const { hcsBrainRetrieval } = await import('../learning/hcsBrainRetrieval.js');
    const messages = await hcsBrainRetrieval.queryTopicMessages(topicId, {
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      limit: limit ? parseInt(limit) : 100,
      order: order || 'desc'
    });

    return reply.send({
      topicId,
      messages,
      count: messages.length
    });
  });

  app.get('/api/vera/sacred/flower-of-life', async (req: FastifyRequest, reply: FastifyReply) => {
    const { 
      petals = 3, 
      format = 'json',
      width = 400,
      height = 400
    } = req.query as { 
      petals?: number; 
      format?: 'json' | 'svg';
      width?: number;
      height?: number;
    };
      
    const { flowerOfLifeGenerator } = await import('../vera/visualization/flowerOfLife.js');
    const { sacredGeometryRenderer } = await import('../vera/visualization/sacredGeometryRenderer.js');
      
    const geometry = flowerOfLifeGenerator.generate({ petals: Math.min(Math.max(petals, 1), 7) });
      
    if (format === 'svg') {
      const svg = sacredGeometryRenderer.renderFlowerOfLife(geometry, { width, height });
      reply.header('Content-Type', 'image/svg+xml');
      return svg;
    }
      
    return reply.send({ 
      geometry,
      links: {
        svg: `/api/vera/sacred/flower-of-life?petals=${petals}&format=svg`,
      }
    });
  });

  // Vesica Piscis Sacred Geometry Visualization (matching the drawing)
  app.get('/api/vera/geometry/vesica-piscis', async (req: FastifyRequest, reply: FastifyReply) => {
    const { format = 'json' } = req.query as { format?: 'json' | 'svg' | '3d' };
    const { vesicaPiscisVisualizer } = await import('../vera/visualization/vesicaPiscisVisualizer.js');
    
    if (format === 'svg') {
      reply.header('Content-Type', 'image/svg+xml');
      return vesicaPiscisVisualizer.generateSVG();
    }
    
    if (format === '3d') {
      return reply.send({ geometry: vesicaPiscisVisualizer.generate3DData() });
    }
    
    return reply.send({ geometry: vesicaPiscisVisualizer.generateGeometry() });
  });

  // Metatron's Cube
  app.get('/api/vera/sacred/metatron-cube', async (req: FastifyRequest, reply: FastifyReply) => {
    const { 
      format = 'json',
      solids = '',
      width = 400,
      height = 400
    } = req.query as { 
      format?: 'json' | 'svg';
      solids?: string;
      width?: number;
      height?: number;
    };
    
    const { metatronCubeGenerator } = await import('../vera/visualization/metatronCube.js');
    const { sacredGeometryRenderer } = await import('../vera/visualization/sacredGeometryRenderer.js');
    
    const highlightSolids = solids.split(',').filter(Boolean);
    const geometry = metatronCubeGenerator.generate({ highlightSolids });
    
    if (format === 'svg') {
      const svg = sacredGeometryRenderer.renderMetatronCube(geometry, { width, height });
      reply.header('Content-Type', 'image/svg+xml');
      return svg;
    }
    
    return reply.send({ 
      geometry,
      platonicSolids: geometry.platonicSolids.map(s => s.name),
      links: {
        svg: `/api/vera/sacred/metatron-cube?format=svg${solids ? `&solids=${solids}` : ''}`,
      }
    });
  });

  // Complete Sacred Geometry Suite
  app.get('/api/vera/sacred/suite', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { flowerOfLifeGenerator } = await import('../vera/visualization/flowerOfLife.js');
    const { metatronCubeGenerator } = await import('../vera/visualization/metatronCube.js');
    const { vesicaPiscisVisualizer } = await import('../vera/visualization/vesicaPiscisVisualizer.js');
    
    return reply.send({
      patterns: {
        vesicaPiscis: {
          description: 'Two overlapping circles - the foundation of sacred geometry',
          geometry: vesicaPiscisVisualizer.generateGeometry(),
          endpoints: {
            json: '/api/vera/geometry/vesica-piscis',
            svg: '/api/vera/geometry/vesica-piscis?format=svg',
          }
        },
        seedOfLife: {
          description: '7 circles - the creation pattern',
          geometry: flowerOfLifeGenerator.generate({ petals: 1 }),
          endpoints: {
            json: '/api/vera/sacred/flower-of-life?petals=1',
            svg: '/api/vera/sacred/flower-of-life?petals=1&format=svg',
          }
        },
        flowerOfLife: {
          description: '19+ circles - the perfected lattice',
          geometry: flowerOfLifeGenerator.generate({ petals: 3 }),
          endpoints: {
            json: '/api/vera/sacred/flower-of-life?petals=3',
            svg: '/api/vera/sacred/flower-of-life?petals=3&format=svg',
          }
        },
        metatronsCube: {
          description: '13 circles with 78 lines - the cosmic blueprint',
          geometry: metatronCubeGenerator.generate(),
          platonicSolids: ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron'],
          endpoints: {
            json: '/api/vera/sacred/metatron-cube',
            svg: '/api/vera/sacred/metatron-cube?format=svg',
          }
        }
      }
    });
  });

  // Sacred Geometry with live shard overlay
  app.get('/api/vera/sacred/shards', async (req: FastifyRequest, reply: FastifyReply) => {
    const { petals = 3 } = req.query as { petals?: number };
    return reply.send(hierarchicalCoordinator.getSacredGeometryWithShards(petals));
  });

  // Gossip flow visualization along vesica intersections
  app.get('/api/vera/sacred/gossip-flows', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(hierarchicalCoordinator.getGossipFlowVisualization());
  });

  // ── Swarm Navigation via Sacred Geometry ─────────────────────────────────

  // Initialize swarm navigator with sacred geometry network
  app.post('/api/vera/swarm/initialize', async (req: FastifyRequest, reply: FastifyReply) => {
    const { petals = 3 } = req.body as { petals?: number };
    const { SacredGeometrySwarmNavigator } = await import('../vera/visualization/swarmNavigator.js');
    const navigator = new SacredGeometrySwarmNavigator({ petals });
    navigator.initialize();
    
    return reply.send({
      message: 'Swarm navigator initialized',
      network: navigator.getNavigationNetwork(),
      stats: navigator.getStats(),
    });
  });

  // Find optimal route through sacred geometry lattice
  app.post('/api/vera/swarm/route', async (req: FastifyRequest, reply: FastifyReply) => {
    const { source, target, preferLattice = true } = req.body as {
      source: { x: number; y: number };
      target: { x: number; y: number };
      preferLattice?: boolean;
    };
    
    const { swarmNavigator } = await import('../vera/visualization/swarmNavigator.js');
    
    // Ensure initialized
    if (swarmNavigator.getStats().totalNodes === 0) {
      swarmNavigator.initialize();
    }
    
    const route = swarmNavigator.findRoute(source, target);
    
    return reply.send({
      route,
      navigationNodes: route.nodes.map(id => {
        const network = swarmNavigator.getNavigationNetwork();
        return network.nodes.find(n => n.id === id);
      }),
    });
  });

  // Find optimal rendezvous point for agents
  app.post('/api/vera/swarm/rendezvous', async (req: FastifyRequest, reply: FastifyReply) => {
    const { agentPositions } = req.body as {
      agentPositions: Array<{ x: number; y: number }>;
    };
    
    const { swarmNavigator } = await import('../vera/visualization/swarmNavigator.js');
    
    if (swarmNavigator.getStats().totalNodes === 0) {
      swarmNavigator.initialize();
    }
    
    const rendezvous = swarmNavigator.findRendezvousPoint(agentPositions);
    
    return reply.send({
      rendezvous,
      message: rendezvous 
        ? `Optimal meeting point at ${rendezvous.type} hub (${rendezvous.x.toFixed(1)}, ${rendezvous.y.toFixed(1)})`
        : 'No suitable rendezvous point found',
    });
  });

  // Get swarm navigation network status
  app.get('/api/vera/swarm/network', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { swarmNavigator } = await import('../vera/visualization/swarmNavigator.js');
    
    return reply.send({
      network: swarmNavigator.getNavigationNetwork(),
      stats: swarmNavigator.getStats(),
    });
  });

  // ─── Dynamic Lattice Scaling API ───────────────────────────────────────

  // Get current scaling stats
  app.get('/api/vera/scaling/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { veraDynamicScaling } = await import('../swarm/dynamicScaling.js');
    const { flowerOfLifeOS } = await import('../vera/orchestrator/flowerOfLifeOS.js');
    
    return reply.send({
      dynamicScaling: veraDynamicScaling.getScalingStats(),
      latticeResources: flowerOfLifeOS.getResourceStats(),
    });
  });

  // Manually trigger layer expansion
  app.post('/api/vera/scaling/expand', async (req: FastifyRequest, reply: FastifyReply) => {
    const { layer } = req.body as { layer: number };
    const { flowerOfLifeOS } = await import('../vera/orchestrator/flowerOfLifeOS.js');
    
    const spawned = flowerOfLifeOS.expandLayer(layer as 0 | 1 | 2 | 3);
    
    return reply.send({
      success: true,
      layer,
      nodesSpawned: spawned,
      resources: flowerOfLifeOS.getResourceStats(),
    });
  });

  // Update scaling thresholds
  app.post('/api/vera/scaling/config', async (req: FastifyRequest, reply: FastifyReply) => {
    const config = req.body as {
      queueDepthPerAgent?: number;
      maxTier1Agents?: number;
      maxTier2Agents?: number;
      maxTier3Agents?: number;
    };
    
    const { veraDynamicScaling } = await import('../swarm/dynamicScaling.js');
    await veraDynamicScaling.initialize(config);
    
    return reply.send({
      success: true,
      config,
      message: 'Scaling configuration updated',
    });
  });

  // ─── Vector Database Sync API ─────────────────────────────────────────

  // Get vector DB stats
  app.get('/api/vera/vector/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { hcsVectorSync } = await import('../learning/hcsVectorSync.js');
    const stats = await hcsVectorSync.getVectorStats();
    return reply.send(stats);
  });

  // Sync HCS to vector database
  app.post('/api/vera/vector/sync', async (req: FastifyRequest, reply: FastifyReply) => {
    const { topicId } = req.body as { topicId: string };
    const { hcsVectorSync } = await import('../learning/hcsVectorSync.js');
    
    // Start sync in background
    const progress = await hcsVectorSync.syncHistoricalMessages(topicId);
    
    return reply.send({
      success: true,
      topicId,
      progress,
      message: `Sync completed: ${progress.processed} messages processed`
    });
  });

  // Semantic search
  app.post('/api/vera/vector/search', async (req: FastifyRequest, reply: FastifyReply) => {
    const { query, topK, filter } = req.body as {
      query: string;
      topK?: number;
      filter?: { topicId?: string; category?: string };
    };

    if (!query) {
      return reply.status(400).send({ error: 'Query is required' });
    }

    const { hcsVectorSync } = await import('../learning/hcsVectorSync.js');
    const results = await hcsVectorSync.semanticSearch(query, topK || 10, filter);

    return reply.send({
      query,
      results,
      count: results.length
    });
  });

  // Hybrid search (keyword + semantic)
  app.post('/api/vera/vector/hybrid', async (req: FastifyRequest, reply: FastifyReply) => {
    const { query, topK, keywordWeight, semanticWeight } = req.body as {
      query: string;
      topK?: number;
      keywordWeight?: number;
      semanticWeight?: number;
    };

    if (!query) {
      return reply.status(400).send({ error: 'Query is required' });
    }

    const { hcsVectorSync } = await import('../learning/hcsVectorSync.js');
    const results = await hcsVectorSync.hybridSearch(query, {
      topK: topK || 10,
      keywordWeight,
      semanticWeight
    });

    return reply.send({
      query,
      results,
      count: results.length
    });
  });

  // ─── Predictive Memory API ────────────────────────────────────────────

  // Analyze conversation and pre-fetch memories
  app.post('/api/vera/memory/prefetch', async (req: FastifyRequest, reply: FastifyReply) => {
    const { sessionId, message } = req.body as { sessionId: string; message: string };

    if (!sessionId || !message) {
      return reply.status(400).send({ error: 'sessionId and message are required' });
    }

    const { predictiveMemory } = await import('../learning/predictiveMemory.js');
    const result = await predictiveMemory.analyzeAndPrefetch(sessionId, message);

    return reply.send({
      sessionId,
      predictedIntent: result.predictedIntent,
      prefetchedCount: result.prefetchedCount,
      relevantMemories: result.relevantMemories
    });
  });

  // Get predictive memory stats
  app.get('/api/vera/memory/predictive-stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { predictiveMemory } = await import('../learning/predictiveMemory.js');
    const stats = predictiveMemory.getStats();
    return reply.send(stats);
  });

  // ─── Implementation Patterns API ───────────────────────────────────────

  // Log a new pattern
  app.post('/api/vera/patterns', async (req: FastifyRequest, reply: FastifyReply) => {
    const { implementationPatterns } = await import('../learning/implementationPatterns.js');
    const pattern = await implementationPatterns.logPattern(req.body as any);
    return reply.send({ success: true, pattern });
  });

  // Quick log a pattern
  app.post('/api/vera/patterns/quick', async (req: FastifyRequest, reply: FastifyReply) => {
    const { title, category, description, components, options } = req.body as {
      title: string;
      category: any;
      description: string;
      components: string[];
      options?: any;
    };

    const { implementationPatterns } = await import('../learning/implementationPatterns.js');
    const pattern = await implementationPatterns.quickLog(
      title, category, description, components, options
    );

    return reply.send({ success: true, pattern });
  });

  // Search patterns
  app.get('/api/vera/patterns', async (req: FastifyRequest, reply: FastifyReply) => {
    const { category, components, tags, complexity, verifiedOnly, q, limit } = req.query as {
      category?: any;
      components?: string;
      tags?: string;
      complexity?: 'simple' | 'moderate' | 'complex';
      verifiedOnly?: string;
      q?: string;
      limit?: string;
    };

    const { implementationPatterns } = await import('../learning/implementationPatterns.js');
    const patterns = await implementationPatterns.findPatterns({
      category,
      components: components?.split(','),
      tags: tags?.split(','),
      complexity,
      verifiedOnly: verifiedOnly === 'true',
      searchQuery: q,
      limit: limit ? parseInt(limit) : 10
    });

    return reply.send({ patterns, count: patterns.length });
  });

  // Get pattern by ID
  app.get('/api/vera/patterns/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { implementationPatterns } = await import('../learning/implementationPatterns.js');
    const pattern = await implementationPatterns.getPattern(id);

    if (!pattern) {
      return reply.status(404).send({ error: 'Pattern not found' });
    }

    return reply.send(pattern);
  });

  // Get related patterns
  app.get('/api/vera/patterns/:id/related', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { implementationPatterns } = await import('../learning/implementationPatterns.js');
    const related = await implementationPatterns.getRelatedPatterns(id);
    return reply.send(related);
  });

  // Record pattern usage
  app.post('/api/vera/patterns/:id/usage', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { sessionId, context, success, notes } = req.body as {
      sessionId: string;
      context: string;
      success: boolean;
      notes?: string;
    };

    const { implementationPatterns } = await import('../learning/implementationPatterns.js');
    await implementationPatterns.recordUsage(id, sessionId, context, success, notes);

    return reply.send({ success: true });
  });

  // Get pattern stats
  app.get('/api/vera/patterns/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { implementationPatterns } = await import('../learning/implementationPatterns.js');
    const stats = implementationPatterns.getStats();
    return reply.send(stats);
  });

  // Get most used patterns
  app.get('/api/vera/patterns/most-used', async (req: FastifyRequest, reply: FastifyReply) => {
    const limit = parseInt((req.query as { limit?: string }).limit || '10');
    const { implementationPatterns } = await import('../learning/implementationPatterns.js');
    const patterns = implementationPatterns.getMostUsed(limit);
    return reply.send({ patterns, count: patterns.length });
  });

  // ─── Knowledge Graph API ───────────────────────────────────────────────

  // Get graph statistics
  app.get('/api/vera/graph/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { knowledgeGraph } = await import('../learning/knowledgeGraph.js');
    const stats = knowledgeGraph.getStats();
    return reply.send(stats);
  });

  // Get graph clusters
  app.get('/api/vera/graph/clusters', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { knowledgeGraph } = await import('../learning/knowledgeGraph.js');
    const clusters = knowledgeGraph.clusterKnowledge();
    return reply.send({ clusters, count: clusters.length });
  });

  // Find paths between nodes
  app.get('/api/vera/graph/paths', async (req: FastifyRequest, reply: FastifyReply) => {
    const { from, to, maxLength } = req.query as { from: string; to: string; maxLength?: string };
    
    if (!from || !to) {
      return reply.status(400).send({ error: 'from and to parameters required' });
    }

    const { knowledgeGraph } = await import('../learning/knowledgeGraph.js');
    const paths = knowledgeGraph.findPaths(from, to, maxLength ? parseInt(maxLength) : 3);
    return reply.send({ paths, count: paths.length });
  });

  // Prune graph
  app.post('/api/vera/graph/prune', async (req: FastifyRequest, reply: FastifyReply) => {
    const { ageThreshold, minWeight } = req.body as { ageThreshold?: number; minWeight?: number };
    const { knowledgeGraph } = await import('../learning/knowledgeGraph.js');
    const removed = knowledgeGraph.pruneKnowledge(ageThreshold || 180, minWeight || 0.1);
    return reply.send({ removed, message: `Pruned ${removed} knowledge nodes` });
  });

  // ─── Private Git Lattice Tree API ─────────────────────────────────────

  app.get('/api/vera/git-lattice/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { gitLatticeTree } = await import('../learning/gitLatticeTree.js');
    return reply.send(gitLatticeTree.getStatus());
  });

  app.post('/api/vera/git-lattice/scan', async (_req: FastifyRequest, reply: FastifyReply) => {
    if (config.VERA_GIT_LATTICE_ENABLED !== 'true') {
      return reply.status(403).send({
        error: 'Private git lattice is disabled',
        enableWith: 'VERA_GIT_LATTICE_ENABLED=true',
      });
    }

    const { gitLatticeTree } = await import('../learning/gitLatticeTree.js');
    const scan = await gitLatticeTree.scan();
    return reply.send({
      ...scan,
      nodes: scan.nodes.slice(0, 500),
      edges: scan.edges.slice(0, 500),
      truncated: scan.nodes.length > 500 || scan.edges.length > 500,
    });
  });

  app.get('/api/vera/workflows/elliptical-proof', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { getEllipticalProofWorkflowModel } = await import('../vera/workflows/ellipticalProofWorkflows.js');
    return reply.send(getEllipticalProofWorkflowModel());
  });

  app.post('/api/vera/workflows/vnx-lattice-plan', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = VnxLatticeWorkflowPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { planVnxLatticeWorkflow } = await import('../vnx/latticeWorkflowPlanner.js');
    return reply.send(planVnxLatticeWorkflow(parsed.data.intent, {
      mode: parsed.data.mode ?? 'parallel',
      maxSpecialists: parsed.data.maxSpecialists ?? 4,
      routeWeights: parsed.data.routeWeights ?? {},
    }));
  });

  await registerVeraMemoryRoutes(app);

  app.get('/api/vera/workflows/evidence', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { workflowEvidenceLedger, getWorkflowEvidencePosture } = await import('../vera/workflows/workflowEvidenceLedger.js');
    const [loops, summary] = await Promise.all([
      workflowEvidenceLedger.listLoops(),
      workflowEvidenceLedger.getSummary(),
    ]);
    return reply.send({
      posture: getWorkflowEvidencePosture(),
      summary,
      loops: loops.slice(0, 100),
      truncated: loops.length > 100,
    });
  });

  app.post('/api/vera/workflows/evidence/loops', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = WorkflowOpenLoopSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { workflowEvidenceLedger } = await import('../vera/workflows/workflowEvidenceLedger.js');
    const loop = await workflowEvidenceLedger.openLoop(
      parsed.data.subject,
      parsed.data.stage ?? 'brief',
      parsed.data.notes ?? [],
    );
    return reply.status(201).send(loop);
  });

  app.get('/api/vera/workflows/evidence/loops/:loopId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { loopId } = req.params as { loopId: string };
    const { workflowEvidenceLedger } = await import('../vera/workflows/workflowEvidenceLedger.js');
    const loop = await workflowEvidenceLedger.getLoop(loopId);
    if (!loop) return reply.status(404).send({ error: `Workflow loop not found: ${loopId}` });
    return reply.send(loop);
  });

  app.post('/api/vera/workflows/evidence/loops/:loopId/evidence', async (req: FastifyRequest, reply: FastifyReply) => {
    const { loopId } = req.params as { loopId: string };
    const parsed = WorkflowEvidenceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { workflowEvidenceLedger } = await import('../vera/workflows/workflowEvidenceLedger.js');
    try {
      const evidence = parsed.data;
      return reply.send(await workflowEvidenceLedger.recordEvidence(loopId, {
        source: evidence.source,
        stage: evidence.stage,
        summary: evidence.summary,
        hash: evidence.hash,
        hcsTopicId: evidence.hcsTopicId,
        hcsSequence: evidence.hcsSequence,
        transactionId: evidence.transactionId,
        scheduleId: evidence.scheduleId,
        blockStream: evidence.blockStream,
        metadata: evidence.metadata ?? {},
      }));
    } catch (error) {
      return reply.status(404).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/vera/workflows/evidence/loops/:loopId/block', async (req: FastifyRequest, reply: FastifyReply) => {
    const { loopId } = req.params as { loopId: string };
    const parsed = z.object({ note: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { workflowEvidenceLedger } = await import('../vera/workflows/workflowEvidenceLedger.js');
    try {
      return reply.send(await workflowEvidenceLedger.markBlocked(loopId, parsed.data.note));
    } catch (error) {
      return reply.status(404).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/vera/workflows/learning-packets', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { learningAmplificationPackets } = await import('../vera/workflows/learningAmplificationPackets.js');
    const packets = await learningAmplificationPackets.listPackets();
    return reply.send({
      packets: packets.slice(0, 100),
      truncated: packets.length > 100,
      count: packets.length,
    });
  });

  app.get('/api/vera/workflows/learning-packets/:packetId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { packetId } = req.params as { packetId: string };
    const { learningAmplificationPackets } = await import('../vera/workflows/learningAmplificationPackets.js');
    const packet = await learningAmplificationPackets.getPacket(packetId);
    if (!packet) return reply.status(404).send({ error: `Learning packet not found: ${packetId}` });
    return reply.send(packet);
  });

  app.post('/api/vera/workflows/learning-packets/:packetId/block-stream-closure', async (req: FastifyRequest, reply: FastifyReply) => {
    const { packetId } = req.params as { packetId: string };
    const parsed = LearningPacketBlockStreamClosureSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const [
      { learningAmplificationPackets },
      { workflowEvidenceLedger },
    ] = await Promise.all([
      import('../vera/workflows/learningAmplificationPackets.js'),
      import('../vera/workflows/workflowEvidenceLedger.js'),
    ]);

    try {
      const closure = parsed.data;
      const packet = await learningAmplificationPackets.attachBlockStreamClosure(packetId, {
        blockNumber: closure.blockNumber,
        consensusTimestamp: closure.consensusTimestamp,
        transactionId: closure.transactionId,
        blockProofHash: closure.blockProofHash,
        stateChangeSummary: closure.stateChangeSummary,
      });
      await workflowEvidenceLedger.recordEvidence(packet.workflowLoopId, {
        source: 'hip1056_block_stream',
        stage: 'receipt',
        summary: `HIP-1056 block-stream closure attached for learning packet ${packet.id}`,
        transactionId: closure.transactionId,
        blockStream: {
          blockNumber: closure.blockNumber,
          consensusTimestamp: closure.consensusTimestamp,
          blockProofHash: closure.blockProofHash,
          stateChangeSummary: closure.stateChangeSummary,
        },
        metadata: {
          packetId: packet.id,
          lessonHash: packet.lessonHash,
        },
      });
      return reply.send(packet);
    } catch (error) {
      return reply.status(404).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/vera/workflows/evidence/loops/:loopId/learning-packet', async (req: FastifyRequest, reply: FastifyReply) => {
    const { loopId } = req.params as { loopId: string };
    const parsed = LearningPacketSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const [
      { workflowEvidenceLedger },
      { learningAmplificationPackets },
    ] = await Promise.all([
      import('../vera/workflows/workflowEvidenceLedger.js'),
      import('../vera/workflows/learningAmplificationPackets.js'),
    ]);
    const loop = await workflowEvidenceLedger.getLoop(loopId);
    if (!loop) return reply.status(404).send({ error: `Workflow loop not found: ${loopId}` });

    const packetInput = parsed.data;
    const packet = await learningAmplificationPackets.createFromLoop(loop, {
      modelProvider: packetInput.modelProvider,
      modelName: packetInput.modelName,
      lesson: packetInput.lesson,
      qualityScore: packetInput.qualityScore,
      operatorApproved: packetInput.operatorApproved,
      synthesisHash: packetInput.synthesisHash,
    });
    if (packetInput.operatorApproved) {
      await workflowEvidenceLedger.recordEvidence(loop.id, {
        source: 'model_synthesis',
        stage: 'lesson',
        summary: `Learning packet ${packet.id} synthesized by ${packet.modelProvider}${packet.modelName ? `/${packet.modelName}` : ''}`,
        hash: packet.lessonHash,
        metadata: {
          packetId: packet.id,
          qualityScore: packet.qualityScore,
          hcsCandidate: packet.hcsCandidate.shouldLog,
        },
      });
    }
    return reply.status(201).send(packet);
  });

  app.post('/api/vera/workflows/deepseek-learning-ellipse', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = DeepSeekLearningEllipseSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    if (!parsed.data.loopId && !parsed.data.subject) {
      return reply.status(400).send({ error: 'Provide loopId to use an existing loop or subject to open a new learning loop.' });
    }

    const { runDeepSeekLearningEllipse } = await import('../vera/workflows/deepseekLearningEllipse.js');
    try {
      const result = await runDeepSeekLearningEllipse({
        loopId: parsed.data.loopId,
        subject: parsed.data.subject,
        lesson: parsed.data.lesson,
        qualityScore: parsed.data.qualityScore,
        operatorApproved: parsed.data.operatorApproved,
        modelProvider: parsed.data.modelProvider,
        modelName: parsed.data.modelName,
        publishToHcs: parsed.data.publishToHcs,
      });
      return reply.send(result);
    } catch (error) {
      return reply.status(404).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/vera/learning/posture', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { gitLatticeTree } = await import('../learning/gitLatticeTree.js');
    const { workflowEvidenceLedger } = await import('../vera/workflows/workflowEvidenceLedger.js');
    const gitLattice = gitLatticeTree.getStatus();
    const workflowSummary = await workflowEvidenceLedger.getSummary();
    const deepseekConfigured = Boolean(
      config.VERA_LEARNING_PROVIDER === 'deepseek' ||
      config.VERA_LEARNING_MODEL?.startsWith('deepseek') ||
      config.VERA_LEARNING_BASE_URL?.includes('deepseek')
    );

    return reply.send({
      posture: 'sovereignty-by-orchestration',
      operatorView: 'private lattice, model routing, tests, receipts, upgrade packages, infrastructure health',
      consumerView: 'wallet, one-time fee, agent brief, launch readiness, proof-backed marketplace registration',
      routing: [
        {
          lane: 'nvidia-nim',
          role: 'Local sovereign acceleration for sensitive reasoning and structured agent workflows',
          enabled: config.USE_NIM === 'true',
          model: config.NIM_MODEL,
          endpoint: config.NIM_URL,
          priority: 1,
        },
        {
          lane: 'nvidia-nemotron',
          role: 'Structured reasoning for Hedera planning, AI-Q flows, and agent package review',
          enabled: config.NEMOTRON_PROVIDER !== 'ollama' || config.USE_NIM === 'true',
          model: config.NEMOTRON_MODEL,
          endpoint: config.NEMOTRON_URL,
          priority: 2,
        },
        {
          lane: 'vllm',
          role: 'Fast local OpenAI-compatible inference fallback',
          enabled: config.USE_VLLM === 'true',
          model: config.VLLM_MODEL,
          endpoint: config.VLLM_URL,
          priority: 3,
        },
        {
          lane: 'local-qvx',
          role: 'Private everyday Vera operation and future fine-tuned models',
          enabled: ['ollama', 'native', 'qvx-direct', 'custom'].includes(config.MODEL_PROVIDER),
          model: config.MODEL_PROVIDER === 'qvx-direct' ? config.DEFAULT_CHAT_MODEL : config.SOVEREIGN_LOCAL_MODEL || config.DEFAULT_CHAT_MODEL,
          endpoint: config.MODEL_PROVIDER === 'qvx-direct' ? config.QVX_INFER_URL : config.OLLAMA_URL,
          priority: 4,
        },
        {
          lane: 'deepseek',
          role: 'Optional external high-context synthesis for upgrade package design and codebase learning',
          enabled: config.VERA_LEARNING_ENABLED === 'true' && deepseekConfigured,
          model: config.VERA_LEARNING_MODEL || 'deepseek-v4-pro',
          endpoint: config.VERA_LEARNING_BASE_URL || 'https://api.deepseek.com',
          priority: 5,
        },
      ],
      controls: {
        learningEnabled: config.VERA_LEARNING_ENABLED === 'true',
        learningProvider: config.VERA_LEARNING_PROVIDER,
        receiptsRequired: config.VERA_LEARNING_RECEIPTS_REQUIRED === 'true',
        blockStreamAllowed: config.VERA_LEARNING_ALLOW_BLOCK_STREAM === 'true',
        minQualityScore: config.VERA_LEARNING_MIN_QUALITY_SCORE,
        privateGitLattice: gitLattice,
        ellipticalWorkflows: workflowSummary,
      },
      guidance: [
        'Keep NVIDIA/Nemotron/NIM as the sovereign operating core.',
        'Use elliptical workflows to keep marketplace work tied to proof closure before Vera learns from it.',
        'Use DeepSeek only with sanitized lattice summaries and operator-approved learning packets.',
        'Promote lessons only when tests, HCS receipts, settlement records, or dashboard metrics back them.',
      ],
    });
  });

  // ─── Knowledge Health API ──────────────────────────────────────────────

  // Get health report
  app.get('/api/vera/health/knowledge', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { knowledgeHealth } = await import('../learning/knowledgeHealth.js');
    const report = await knowledgeHealth.runHealthCheck();
    return reply.send(report);
  });

  // Auto-remediate issues
  app.post('/api/vera/health/remediate', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { knowledgeHealth } = await import('../learning/knowledgeHealth.js');
    const result = await knowledgeHealth.autoRemediate();
    return reply.send(result);
  });

  // Get health history
  app.get('/api/vera/health/history', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { knowledgeHealth } = await import('../learning/knowledgeHealth.js');
    const history = knowledgeHealth.getHealthHistory();
    return reply.send({ history, count: history.length });
  });

  // ─── NVIDIA Knowledge Acceleration API ───────────────────────────────────

  // Get GPU configuration
  app.get('/api/vera/nvidia/config', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { gpuConfigurator } = await import('../learning/gpuConfig.js');
    const config = await gpuConfigurator.autoConfigure();
    const tips = gpuConfigurator.getOptimizationTips();
    const vram = await gpuConfigurator.getCurrentVRAMUsage();
    
    return reply.send({
      gpu: gpuConfigurator.getDetectedGPU(),
      config,
      tips,
      vram,
      isGPU: gpuConfigurator.isGPU()
    });
  });

  // Get GPU stats
  app.get('/api/vera/nvidia/gpu-stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { nvidiaKnowledgeAcceleration } = await import('../learning/nvidiaKnowledgeAcceleration.js');
    const stats = await nvidiaKnowledgeAcceleration.getGPUStats();
    return reply.send(stats);
  });

  // Run GPU-accelerated graph analysis
  app.post('/api/vera/nvidia/graph-analyze', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { nvidiaKnowledgeAcceleration } = await import('../learning/nvidiaKnowledgeAcceleration.js');
    const result = await nvidiaKnowledgeAcceleration.analyzeGraph();
    return reply.send(result);
  });

  // NeMo Retriever RAG
  app.post('/api/vera/nvidia/rag', async (req: FastifyRequest, reply: FastifyReply) => {
    const { query, topK, rerank } = req.body as {
      query: string;
      topK?: number;
      rerank?: boolean;
    };

    if (!query) {
      return reply.status(400).send({ error: 'Query is required' });
    }

    const { nvidiaKnowledgeAcceleration } = await import('../learning/nvidiaKnowledgeAcceleration.js');
    const result = await nvidiaKnowledgeAcceleration.retrieveAndGenerate(query, {
      topK: topK || 5,
      rerank: rerank ?? true
    });

    return reply.send(result);
  });

  // Get visualization data (GPU-optimized)
  app.get('/api/vera/nvidia/visualization', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { nvidiaKnowledgeAcceleration } = await import('../learning/nvidiaKnowledgeAcceleration.js');
    const data = await nvidiaKnowledgeAcceleration.getVisualizationData();
    return reply.send(data);
  });

  // Benchmark GPU performance
  app.get('/api/vera/nvidia/benchmark', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { nvidiaKnowledgeAcceleration } = await import('../learning/nvidiaKnowledgeAcceleration.js');
    const results = await nvidiaKnowledgeAcceleration.benchmark();
    return reply.send(results);
  });

  // ─── NVIDIA FLARE API ───────────────────────────────────────────────────

  // Register FLARE client
  app.post('/api/vera/flare/register', async (req: FastifyRequest, reply: FastifyReply) => {
    const { siteName, publicKey } = req.body as { siteName: string; publicKey: string };
    
    if (!siteName || !publicKey) {
      return reply.status(400).send({ error: 'siteName and publicKey required' });
    }

    const { nvidiaFlare } = await import('../learning/nvidiaFlareIntegration.js');
    const client = await nvidiaFlare.registerClient(siteName, publicKey);
    return reply.send({ success: true, client });
  });

  // Start federated round
  app.post('/api/vera/flare/start-round', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { nvidiaFlare } = await import('../learning/nvidiaFlareIntegration.js');
    const round = await nvidiaFlare.startRound();
    return reply.send({ success: true, round });
  });

  // Submit local update
  app.post('/api/vera/flare/submit-update', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, patterns } = req.body as { clientId: string; patterns: any[] };
    
    if (!clientId) {
      return reply.status(400).send({ error: 'clientId required' });
    }

    const { nvidiaFlare } = await import('../learning/nvidiaFlareIntegration.js');
    const update = await nvidiaFlare.submitLocalUpdate(clientId, patterns || []);
    return reply.send({ success: true, update });
  });

  // Aggregate updates
  app.post('/api/vera/flare/aggregate', async (req: FastifyRequest, reply: FastifyReply) => {
    const { roundId } = req.body as { roundId: number };
    
    if (!roundId) {
      return reply.status(400).send({ error: 'roundId required' });
    }

    const { nvidiaFlare } = await import('../learning/nvidiaFlareIntegration.js');
    const result = await nvidiaFlare.aggregateUpdates(roundId);
    return reply.send({ success: true, result });
  });

  // Get FLARE stats
  app.get('/api/vera/flare/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { nvidiaFlare } = await import('../learning/nvidiaFlareIntegration.js');
    const stats = nvidiaFlare.getStats();
    const privacyConfig = nvidiaFlare.getPrivacyConfig();
    return reply.send({ stats, privacyConfig });
  });

  // Update privacy config
  app.post('/api/vera/flare/privacy', async (req: FastifyRequest, reply: FastifyReply) => {
    const { epsilon, differentialPrivacy } = req.body as {
      epsilon?: number;
      differentialPrivacy?: boolean;
    };

    const { nvidiaFlare } = await import('../learning/nvidiaFlareIntegration.js');
    nvidiaFlare.setPrivacyConfig({ epsilon, differentialPrivacy });
    
    return reply.send({
      success: true,
      config: nvidiaFlare.getPrivacyConfig()
    });
  });

  // ─── VERA HEDERA ASSISTANT API ───────────────────────────────────────────

  // Developer guide generation
  app.post('/api/vera/hedera/guide', async (req: FastifyRequest, reply: FastifyReply) => {
    const { topic, skillLevel = 'intermediate' } = req.body as {
      topic: string;
      skillLevel?: 'beginner' | 'intermediate' | 'advanced';
    };

    if (!topic) {
      return reply.status(400).send({ error: 'topic is required' });
    }

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const guide = await veraHederaAssistant.generateDeveloperGuide(topic, skillLevel);
    return reply.send({ success: true, guide });
  });

  // Code generation
  app.post('/api/vera/hedera/code', async (req: FastifyRequest, reply: FastifyReply) => {
    const { description, language = 'typescript' } = req.body as {
      description: string;
      language?: 'typescript' | 'javascript' | 'solidity';
    };

    if (!description) {
      return reply.status(400).send({ error: 'description is required' });
    }

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const code = await veraHederaAssistant.generateCode(description, language);
    return reply.send({ success: true, code, language });
  });

  // Error explanation
  app.post('/api/vera/hedera/explain-error', async (req: FastifyRequest, reply: FastifyReply) => {
    const { errorCode, context } = req.body as { errorCode: string; context?: string };

    if (!errorCode) {
      return reply.status(400).send({ error: 'errorCode is required' });
    }

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const explanation = await veraHederaAssistant.explainError(errorCode, context);
    return reply.send({ success: true, explanation });
  });

  // Token lifecycle planning
  app.post('/api/vera/hedera/token-plan', async (req: FastifyRequest, reply: FastifyReply) => {
    const { tokenName, tokenType, requirements } = req.body as {
      tokenName: string;
      tokenType: 'ft' | 'nft' | 'fractional';
      requirements: {
        totalSupply: number;
        decimals: number;
        mintable: boolean;
        burnable: boolean;
        freezeable: boolean;
        kycRequired: boolean;
      };
    };

    if (!tokenName || !tokenType || !requirements) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const plan = await veraHederaAssistant.planTokenLifecycle(tokenName, tokenType, requirements);
    return reply.send({ success: true, plan });
  });

  // Token analysis
  app.get('/api/vera/hedera/token/:tokenId/analyze', async (req: FastifyRequest, reply: FastifyReply) => {
    const { tokenId } = req.params as { tokenId: string };

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const analysis = await veraHederaAssistant.analyzeToken(tokenId);
    return reply.send({ success: true, analysis });
  });

  // DeFi strategy generation
  app.post('/api/vera/hedera/defi-strategy', async (req: FastifyRequest, reply: FastifyReply) => {
    const { holdings, riskTolerance = 'moderate' } = req.body as {
      holdings: Array<{ token: string; amount: number }>;
      riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
    };

    if (!holdings || !Array.isArray(holdings)) {
      return reply.status(400).send({ error: 'holdings array is required' });
    }

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const strategies = await veraHederaAssistant.generateDeFiStrategy(holdings, riskTolerance);
    return reply.send({ success: true, strategies, count: strategies.length });
  });

  // Monitor positions
  app.post('/api/vera/hedera/defi-monitor', async (req: FastifyRequest, reply: FastifyReply) => {
    const { positions } = req.body as {
      positions: Array<{
        protocol: string;
        positionId: string;
        currentValue: number;
        entryValue: number;
      }>;
    };

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const monitoring = await veraHederaAssistant.monitorPositions(positions || []);
    return reply.send({ success: true, monitoring });
  });

  // Carbon footprint calculation
  app.get('/api/vera/hedera/carbon/:entityId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { entityId } = req.params as { entityId: string };
    const { entityType = 'account' } = req.query as { entityType?: 'account' | 'token' | 'topic' | 'contract' };

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const audit = await veraHederaAssistant.calculateCarbonFootprint(entityId, entityType);
    return reply.send({ success: true, audit });
  });

  // Carbon offset recommendation
  app.post('/api/vera/hedera/carbon-offset', async (req: FastifyRequest, reply: FastifyReply) => {
    const { carbonKg, budgetUsd } = req.body as { carbonKg: number; budgetUsd: number };

    if (typeof carbonKg !== 'number' || typeof budgetUsd !== 'number') {
      return reply.status(400).send({ error: 'carbonKg and budgetUsd are required' });
    }

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const recommendation = await veraHederaAssistant.recommendOffsetStrategy(carbonKg, budgetUsd);
    return reply.send({ success: true, recommendation });
  });

  // Smart contract generation
  app.post('/api/vera/hedera/contract', async (req: FastifyRequest, reply: FastifyReply) => {
    const { name, purpose, features } = req.body as {
      name: string;
      purpose: string;
      features: string[];
    };

    if (!name || !purpose) {
      return reply.status(400).send({ error: 'name and purpose are required' });
    }

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const contract = await veraHederaAssistant.generateSmartContract({ name, purpose, features: features || [] });
    return reply.send({ success: true, contract });
  });

  // Transaction optimization
  app.post('/api/vera/hedera/optimize-tx', async (req: FastifyRequest, reply: FastifyReply) => {
    const { operations } = req.body as {
      operations: Array<{ type: string; description: string }>;
    };

    if (!operations || !Array.isArray(operations)) {
      return reply.status(400).send({ error: 'operations array is required' });
    }

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const optimization = await veraHederaAssistant.optimizeTransactions(operations);
    return reply.send({ success: true, optimization });
  });

  // Network insights
  app.get('/api/vera/hedera/network-insights', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const insights = await veraHederaAssistant.getNetworkInsights();
    return reply.send({ success: true, insights, count: insights.length });
  });

  // Compliance report
  app.get('/api/vera/hedera/compliance/:entityId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { entityId } = req.params as { entityId: string };
    const { entityType = 'account' } = req.query as { entityType?: string };

    const { veraHederaAssistant } = await import('../hedera/veraHederaAssistant.js');
    const report = await veraHederaAssistant.generateComplianceReport(entityId, entityType);
    return reply.send({ success: true, report });
  });

  // ─── AI INTELLIGENCE ROUTES ───────────────────────────────────────────────

  // Chain-of-thought reasoning
  app.post('/api/vera/ai/reason', async (req: FastifyRequest, reply: FastifyReply) => {
    const { problem, context } = req.body as { problem: string; context?: any };

    if (!problem || problem.trim().length === 0) {
      return reply.status(400).send({ error: 'problem is required' });
    }

    try {
      const { chainOfThought } = await import('../ai/reasoning/chainOfThought.js');
      const result = await chainOfThought.solve(problem, context);
      
      return reply.send({
        success: true,
        answer: result.finalAnswer,
        confidence: result.confidence,
        steps: result.steps.length,
        duration: result.totalDuration,
        reasoningPath: result.reasoningPath,
      });
    } catch (error) {
      logger.error('AI Reasoning Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Reasoning engine failed',
      });
    }
  });

  // Self-consistency reasoning (multiple samples)
  app.post('/api/vera/ai/reason/consistency', async (req: FastifyRequest, reply: FastifyReply) => {
    const { problem, samples = 5, context } = req.body as {
      problem: string;
      samples?: number;
      context?: any;
    };

    if (!problem || problem.trim().length === 0) {
      return reply.status(400).send({ error: 'problem is required' });
    }

    try {
      const { selfConsistency } = await import('../ai/reasoning/chainOfThought.js');
      const result = await selfConsistency.solveWithConsistency(problem, context);
      
      return reply.send({
        success: true,
        answer: result.answer,
        confidence: result.confidence,
        votes: result.votes,
        totalSamples: result.totalSamples,
      });
    } catch (error) {
      logger.error('AI Consistency Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Self-consistency reasoning failed',
      });
    }
  });

  // Get training dataset
  app.get('/api/vera/ai/dataset', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { datasetCurator } = await import('../ai/fineTuning/unslothTrainer.js');
      
      // Add default examples
      datasetCurator.addTokenExamples();
      datasetCurator.addDeFiExamples();
      
      const dataset = datasetCurator.buildDataset();
      
      return reply.send({
        success: true,
        count: dataset.instructions.length,
        categories: ['token', 'defi', 'general'],
        preview: dataset.instructions.slice(0, 3),
      });
    } catch (error) {
      logger.error('AI Dataset Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to load dataset',
      });
    }
  });

  // ─── REVENUE ROUTES ───────────────────────────────────────────────────────

  // x402 payment stream status
  app.get('/api/vera/payments/streams', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { x402Payments } = await import('../revenue/payments/x402Integration.js');
      const streams = x402Payments.getActiveStreams();
      const stats = x402Payments.getRevenueStats();
      
      return reply.send({
        success: true,
        activeStreams: streams.length,
        stats,
        streams: streams.map(s => ({
          id: s.streamId,
          client: s.clientAddress,
          resource: s.resource,
          rate: s.ratePerSecond,
          status: s.status,
          totalPaid: s.totalPaid,
        })),
      });
    } catch (error) {
      logger.error('Payments Streams Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get payment streams',
      });
    }
  });

  // Create payment stream
  app.post('/api/vera/payments/streams', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientAddress, resource, ratePerSecond, maxDurationSeconds, currency = 'USD' } = req.body as {
      clientAddress: string;
      resource: string;
      ratePerSecond: number;
      maxDurationSeconds: number;
      currency?: 'USD' | 'HBAR';
    };

    if (!clientAddress || !resource || !ratePerSecond || !maxDurationSeconds) {
      return reply.status(400).send({
        error: 'clientAddress, resource, ratePerSecond, and maxDurationSeconds are required',
      });
    }

    try {
      const { x402Payments } = await import('../revenue/payments/x402Integration.js');
      const stream = await x402Payments.openPaymentStream({
        clientAddress,
        resource,
        ratePerSecond,
        maxDurationSeconds,
        currency,
      });
      
      return reply.send({
        success: true,
        streamId: stream.streamId,
        status: stream.status,
        startTime: stream.startTime,
      });
    } catch (error) {
      logger.error('Create Payment Stream Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to create payment stream',
      });
    }
  });

  // Get user usage
  app.get('/api/vera/payments/usage/:userId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { userId } = req.params as { userId: string };
    const { apiKey } = req.query as { apiKey?: string };

    if (!apiKey) {
      return reply.status(400).send({ error: 'apiKey query parameter is required' });
    }

    try {
      const { usageTracker } = await import('../revenue/payments/x402Integration.js');
      const usage = usageTracker.getUsage(userId, apiKey);
      
      if (!usage) {
        return reply.status(404).send({ error: 'Usage record not found' });
      }
      
      return reply.send({
        success: true,
        userId,
        tier: usage.tier,
        callsToday: usage.callsToday,
        callsThisMonth: usage.callsThisMonth,
        totalSpend: usage.totalSpend,
        lastCall: usage.lastCall,
      });
    } catch (error) {
      logger.error('Usage Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get usage',
      });
    }
  });

  // Revenue stats
  app.get('/api/vera/payments/revenue', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { x402Payments, usageTracker } = await import('../revenue/payments/x402Integration.js');
      const streamStats = x402Payments.getRevenueStats();
      
      return reply.send({
        success: true,
        x402Revenue: streamStats,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Revenue Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get revenue stats',
      });
    }
  });

  // x402 micropayment settlement
  app.post('/api/vera/payments/settle', async (req: FastifyRequest, reply: FastifyReply) => {
    const { taskId, agentId, recipientAccountId, amount, currency = 'HBAR', idempotencyKey } = req.body as {
      taskId: string;
      agentId: string;
      recipientAccountId: string;
      amount: number;
      currency?: 'HBAR' | 'USDC' | 'DOVU' | 'XSGD';
      idempotencyKey?: string;
    };

    if (!taskId || !agentId || !recipientAccountId || !amount) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: taskId, agentId, recipientAccountId, amount',
      });
    }

    try {
      const { enhancedSettlement } = await import('../vera/payments/enhancedX402Settlement.js');
      const settlement = await enhancedSettlement.settle(taskId, agentId, recipientAccountId, amount, currency, idempotencyKey);
      
      return reply.status(201).send({
        success: true,
        settlementId: settlement.settlementId,
        state: settlement.state,
        amount: settlement.amountHbar,
        currency: settlement.currency,
        createdAt: settlement.createdAt,
      });
    } catch (error) {
      logger.error('Settlement Route', { error: error instanceof Error ? error.message : String(error), taskId, agentId });
      return reply.status(500).send({
        success: false,
        error: 'Settlement failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // x402 settlement status
  app.get('/api/vera/payments/settle/:settlementId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { settlementId } = req.params as { settlementId: string };

    try {
      const { enhancedSettlement } = await import('../vera/payments/enhancedX402Settlement.js');
      const settlement = enhancedSettlement.getSettlement(settlementId);
      
      if (!settlement) {
        return reply.status(404).send({
          success: false,
          error: 'Settlement not found',
        });
      }

      return reply.send({
        success: true,
        settlement: {
          settlementId: settlement.settlementId,
          taskId: settlement.taskId,
          agentId: settlement.agentId,
          state: settlement.state,
          amount: settlement.amountHbar,
          currency: settlement.currency,
          createdAt: settlement.createdAt,
          settledAt: settlement.settledAt,
          txId: settlement.txId,
          error: settlement.error,
          retryCount: settlement.retryCount,
        },
      });
    } catch (error) {
      logger.error('Settlement Status Route', { error: error instanceof Error ? error.message : String(error), settlementId });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get settlement status',
      });
    }
  });

  // x402 settlement statistics
  app.get('/api/vera/payments/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { enhancedSettlement } = await import('../vera/payments/enhancedX402Settlement.js');
      const stats = enhancedSettlement.getStats();
      
      return reply.send({
        success: true,
        stats: {
          total: stats.total,
          settled: stats.settled,
          failed: stats.failed,
          pending: stats.pending,
          totalHbarPaid: stats.totalHbarPaid,
          averageSettlementMs: stats.averageSettlementMs,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Settlement Stats Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get settlement stats',
      });
    }
  });

  // ─── SECURITY ROUTES ──────────────────────────────────────────────────────

  // TEE status
  app.get('/api/vera/security/tee', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { teeManager } = await import('../security/tee/enclaveManager.js');
      const status = teeManager.getStatus();
      
      return reply.send({
        success: true,
        initialized: !!status,
        ...(status && {
          id: status.id,
          teeType: status.teeType,
          status: status.status,
          operationsCount: status.operationsCount,
          memoryUsed: status.memoryUsed,
          uptime: status.startTime ? Date.now() - status.startTime : 0,
        }),
      });
    } catch (error) {
      logger.error('TEE Status Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get TEE status',
      });
    }
  });

  // Initialize TEE
  app.post('/api/vera/security/tee/init', async (req: FastifyRequest, reply: FastifyReply) => {
    const { teeType } = req.body as { teeType?: 'intel_sgx' | 'aws_nitro' | 'simulation' };

    try {
      const { teeManager } = await import('../security/tee/enclaveManager.js');
      
      let result;
      if (teeType) {
        result = await teeManager.initialize(teeType);
      } else {
        result = await teeManager.autoInitialize();
      }
      
      return reply.send({
        success: result.success,
        teeType: result.teeType,
        message: result.message,
      });
    } catch (error) {
      logger.error('TEE Init Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to initialize TEE',
      });
    }
  });

  // Get attestation
  app.get('/api/vera/security/tee/attestation', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { teeManager } = await import('../security/tee/enclaveManager.js');
      const attestation = await teeManager.getAttestation();
      
      if (!attestation) {
        return reply.status(400).send({
          success: false,
          error: 'TEE not initialized',
        });
      }
      
      return reply.send({
        success: true,
        attestation: {
          teeType: attestation.teeType,
          measurement: attestation.measurement,
          timestamp: attestation.timestamp,
          isValid: attestation.isValid,
          quote: attestation.quote.substring(0, 100) + '...',
        },
      });
    } catch (error) {
      logger.error('TEE Attestation Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get attestation',
      });
    }
  });

  // Execute in TEE
  app.post('/api/vera/security/tee/execute', async (req: FastifyRequest, reply: FastifyReply) => {
    const { operation, input } = req.body as { operation: string; input: any };

    if (!operation) {
      return reply.status(400).send({ error: 'operation is required' });
    }

    try {
      const { teeManager } = await import('../security/tee/enclaveManager.js');
      const result = await teeManager.executeSecure(operation, input);
      
      return reply.send({
        success: true,
        operation,
        result,
      });
    } catch (error) {
      logger.error('TEE Execute Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'TEE execution failed',
      });
    }
  });

  // ─── PHASE 2: PREDICTIVE ANALYTICS ROUTES ─────────────────────────────────

  // Forecast HBAR price
  app.get('/api/vera/predict/hbar', async (req: FastifyRequest, reply: FastifyReply) => {
    const { hours = 24 } = req.query as { hours?: number };

    try {
      const { hbarForecaster } = await import('../ai/predictive/timeSeriesForecaster.js');
      
      // Add some mock historical data if needed
      if (!hbarForecaster.getStatistics('hbar_price')) {
        // Seed with mock data
        const now = Date.now();
        for (let i = 50; i >= 0; i--) {
          hbarForecaster.addPrice(
            now - i * 3600000,
            0.05 + Math.sin(i * 0.1) * 0.01 + Math.random() * 0.005,
            1000000 + Math.random() * 500000
          );
        }
      }

      const forecast = await hbarForecaster.predictPrice(parseInt(hours as unknown as string));
      
      return reply.send({
        success: true,
        symbol: 'HBAR/USD',
        horizon: `${hours}h`,
        predictions: forecast.predictions.slice(0, 5), // First 5 points
        confidence: forecast.confidence,
        metrics: forecast.metrics,
      });
    } catch (error) {
      logger.error('HBAR Forecast Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Forecast failed',
      });
    }
  });

  // Detect price anomalies
  app.get('/api/vera/predict/hbar/anomalies', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { hbarForecaster } = await import('../ai/predictive/timeSeriesForecaster.js');
      
      // Ensure we have data
      if (!hbarForecaster.getStatistics('hbar_price')) {
        return reply.status(400).send({
          success: false,
          error: 'No price data available',
        });
      }

      const anomalies = await hbarForecaster.detectPriceSpikes();
      const found = anomalies.filter(a => a.isAnomaly);
      
      return reply.send({
        success: true,
        totalAnalyzed: anomalies.length,
        anomaliesFound: found.length,
        anomalies: found.slice(0, 5),
      });
    } catch (error) {
      logger.error('Anomaly Detection Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Anomaly detection failed',
      });
    }
  });

  // Analyze DeFi yields
  app.post('/api/vera/predict/yield', async (req: FastifyRequest, reply: FastifyReply) => {
    const { poolIds, days = 7 } = req.body as { poolIds: string[]; days?: number };

    if (!poolIds || !Array.isArray(poolIds) || poolIds.length === 0) {
      return reply.status(400).send({ error: 'poolIds array is required' });
    }

    try {
      const { defiForecaster } = await import('../ai/predictive/timeSeriesForecaster.js');
      
      // Seed mock yield data
      const now = Date.now();
      poolIds.forEach((poolId, idx) => {
        for (let i = 30; i >= 0; i--) {
          defiForecaster.addYield(
            poolId,
            now - i * 86400000,
            15 + Math.sin(i * 0.2 + idx) * 10 + Math.random() * 5,
            5000000 + Math.random() * 5000000
          );
        }
      });

      // Get opportunities
      const opportunities = defiForecaster.findBestOpportunities(poolIds);
      
      // Forecast for each
      const forecasts = await Promise.all(
        poolIds.slice(0, 3).map(async (poolId) => {
          try {
            const forecast = await defiForecaster.predictYield(poolId, days);
            return {
              poolId,
              forecast: {
                confidence: forecast.confidence,
                predictions: forecast.predictions.slice(0, 3),
              },
            };
          } catch {
            return { poolId, error: 'Insufficient data' };
          }
        })
      );

      return reply.send({
        success: true,
        opportunities,
        forecasts,
      });
    } catch (error) {
      logger.error('Yield Prediction Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Yield prediction failed',
      });
    }
  });

  // ─── PHASE 2: VISION / MULTI-MODAL ROUTES ─────────────────────────────────

  // Analyze image
  app.post('/api/vera/vision/analyze', async (req: FastifyRequest, reply: FastifyReply) => {
    const { imageUrl, base64Data, mimeType = 'image/jpeg' } = req.body as {
      imageUrl?: string;
      base64Data?: string;
      mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
    };

    if (!imageUrl && !base64Data) {
      return reply.status(400).send({ error: 'imageUrl or base64Data is required' });
    }

    try {
      const { visionEngine } = await import('../ai/multimodal/visionEngine.js');
      await visionEngine.initialize();
      
      const result = await visionEngine.analyzeImage({
        imageUrl,
        base64Data,
        mimeType,
      });

      return reply.send({
        success: true,
        description: result.description,
        objects: result.objects,
        text: result.text,
        isHederaRelated: result.isHederaRelated,
        confidence: result.confidence,
      });
    } catch (error) {
      logger.error('Vision Analyze Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Image analysis failed',
      });
    }
  });

  // Analyze trading chart
  app.post('/api/vera/vision/chart', async (req: FastifyRequest, reply: FastifyReply) => {
    const { imageUrl } = req.body as { imageUrl: string };

    if (!imageUrl) {
      return reply.status(400).send({ error: 'imageUrl is required' });
    }

    try {
      const { visionEngine } = await import('../ai/multimodal/visionEngine.js');
      await visionEngine.initialize();
      
      const result = await visionEngine.analyzeChart({
        imageUrl,
        mimeType: 'image/png',
      });

      return reply.send({
        success: true,
        symbol: result.symbol,
        timeframe: result.timeframe,
        trend: result.trend,
        supportLevels: result.supportLevels,
        resistanceLevels: result.resistanceLevels,
        volatility: result.volatility,
        recommendation: result.recommendation,
      });
    } catch (error) {
      logger.error('Vision Chart Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Chart analysis failed',
      });
    }
  });

  // Scan contract document
  app.post('/api/vera/vision/contract', async (req: FastifyRequest, reply: FastifyReply) => {
    const { imageUrl } = req.body as { imageUrl: string };

    if (!imageUrl) {
      return reply.status(400).send({ error: 'imageUrl is required' });
    }

    try {
      const { visionEngine } = await import('../ai/multimodal/visionEngine.js');
      await visionEngine.initialize();
      
      const result = await visionEngine.scanContract({
        imageUrl,
        mimeType: 'image/png',
      });

      return reply.send({
        success: true,
        contractType: result.contractType,
        functions: result.functions,
        risks: result.risks,
        recommendations: result.recommendations,
      });
    } catch (error) {
      logger.error('Vision Contract Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Contract scan failed',
      });
    }
  });

  // ─── PHASE 3: PARTNER MARKETPLACE ROUTES ─────────────────────────────────

  // Register new partner
  app.post('/api/vera/partners', async (req: FastifyRequest, reply: FastifyReply) => {
    const { name, type, email, integration, capabilities, revenueShare } = req.body as {
      name: string;
      type: string;
      email: string;
      integration: string;
      capabilities: string[];
      revenueShare?: number;
    };

    if (!name || !type || !email || !integration) {
      return reply.status(400).send({ error: 'name, type, email, and integration are required' });
    }

    try {
      const { partnerManager } = await import('../revenue/marketplace/partnerManager.js');
      
      const partner = await partnerManager.registerPartner(
        name,
        type as any,
        email,
        integration,
        capabilities || [],
        revenueShare || 30
      );

      return reply.send({
        success: true,
        partner: {
          id: partner.id,
          name: partner.name,
          type: partner.type,
          status: partner.status,
          apiKey: partner.contact.apiKey,
        },
        message: 'Partner registered. Awaiting activation with payout address.',
      });
    } catch (error) {
      logger.error('Partner Registration Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Partner registration failed',
      });
    }
  });

  // Activate partner
  app.post('/api/vera/partners/:id/activate', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { payoutAddress } = req.body as { payoutAddress: string };

    if (!payoutAddress) {
      return reply.status(400).send({ error: 'payoutAddress is required' });
    }

    try {
      const { partnerManager } = await import('../revenue/marketplace/partnerManager.js');
      const partner = await partnerManager.activatePartner(id, payoutAddress);

      return reply.send({
        success: true,
        partner: {
          id: partner.id,
          name: partner.name,
          status: partner.status,
          payoutAddress: partner.revenue.payoutAddress,
        },
        message: 'Partner activated successfully',
      });
    } catch (error) {
      logger.error('Partner Activation Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Partner activation failed',
      });
    }
  });

  // List partners
  app.get('/api/vera/partners', async (req: FastifyRequest, reply: FastifyReply) => {
    const { status } = req.query as { status?: string };

    try {
      const { partnerManager } = await import('../revenue/marketplace/partnerManager.js');
      const partners = partnerManager.listPartners(status as any);

      return reply.send({
        success: true,
        count: partners.length,
        partners: partners.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          status: p.status,
          revenue: {
            share: p.revenue.share,
            totalEarned: p.revenue.totalEarned,
            pendingPayout: p.revenue.pendingPayout,
          },
        })),
      });
    } catch (error) {
      logger.error('Partners List Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to list partners',
      });
    }
  });

  // Get partner details
  app.get('/api/vera/partners/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    try {
      const { partnerManager } = await import('../revenue/marketplace/partnerManager.js');
      const partner = partnerManager.getPartner(id);

      if (!partner) {
        return reply.status(404).send({
          success: false,
          error: 'Partner not found',
        });
      }

      return reply.send({
        success: true,
        partner: {
          id: partner.id,
          name: partner.name,
          type: partner.type,
          status: partner.status,
          createdAt: partner.createdAt,
          integration: partner.integration,
          metrics: partner.metrics,
          revenue: partner.revenue,
        },
      });
    } catch (error) {
      logger.error('Partner Detail Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get partner details',
      });
    }
  });

  // Record revenue for partner
  app.post('/api/vera/partners/:id/revenue', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { amount } = req.body as { amount: number };

    if (!amount || amount <= 0) {
      return reply.status(400).send({ error: 'amount must be greater than 0' });
    }

    try {
      const { partnerManager } = await import('../revenue/marketplace/partnerManager.js');
      await partnerManager.recordRevenue(id, amount);

      return reply.send({
        success: true,
        message: `Revenue of $${amount} recorded for partner ${id}`,
      });
    } catch (error) {
      logger.error('Partner Revenue Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to record revenue',
      });
    }
  });

  // Process payout
  app.post('/api/vera/partners/:id/payout', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { force } = req.body as { force?: boolean };

    try {
      const { partnerManager } = await import('../revenue/marketplace/partnerManager.js');
      const payout = await partnerManager.processPayout(id, force);

      if (!payout) {
        return reply.send({
          success: true,
          message: 'Payout threshold not met. Set force=true to override.',
        });
      }

      return reply.send({
        success: true,
        payout: {
          id: payout.id,
          amount: payout.amount,
          status: payout.status,
          timestamp: payout.timestamp,
        },
        message: 'Payout initiated',
      });
    } catch (error) {
      logger.error('Partner Payout Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Payout failed',
      });
    }
  });

  // Get partner dashboard
  app.get('/api/vera/partners/:id/dashboard', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    try {
      const { partnerDashboard } = await import('../revenue/marketplace/partnerManager.js');
      const dashboard = partnerDashboard.getPartnerDashboard(id);

      if (!dashboard) {
        return reply.status(404).send({
          success: false,
          error: 'Partner not found',
        });
      }

      return reply.send({
        success: true,
        dashboard: {
          partner: {
            id: dashboard.partner.id,
            name: dashboard.partner.name,
            status: dashboard.partner.status,
            totalEarned: dashboard.partner.revenue.totalEarned,
            pendingPayout: dashboard.partner.revenue.pendingPayout,
          },
          metrics: dashboard.partner.metrics,
          health: dashboard.healthStatus,
          recentPayouts: dashboard.recentPayouts,
          revenueTrend: dashboard.revenueTrend,
          apiUsage: dashboard.apiUsage,
        },
      });
    } catch (error) {
      logger.error('Partner Dashboard Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get partner dashboard',
      });
    }
  });

  // Admin marketplace analytics
  app.get('/api/vera/marketplace/analytics', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { partnerManager, partnerDashboard } = await import('../revenue/marketplace/partnerManager.js');
      const analytics = partnerManager.getAnalytics();
      const adminDashboard = partnerDashboard.getAdminDashboard();

      return reply.send({
        success: true,
        analytics: {
          overview: analytics,
          healthAlerts: adminDashboard.healthAlerts,
          pendingApprovals: adminDashboard.pendingApprovals.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            revenueShare: p.revenue.share,
          })),
          recentPayouts: adminDashboard.recentPayouts.slice(0, 5),
        },
      });
    } catch (error) {
      logger.error('Marketplace Analytics Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get marketplace analytics',
      });
    }
  });

  // ─── HEDERA MASTER CLASS ROUTES ─────────────────────────────────────────

  // Get token info and analysis
  app.get('/api/vera/hedera/token/:tokenId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { tokenId } = req.params as { tokenId: string };

    try {
      const { hederaMaster } = await import('../hedera/hederaMasterClass.js');
      const analysis = await hederaMaster.analyzeToken(tokenId);

      return reply.send({
        success: true,
        token: analysis.info,
        risk: analysis.riskAssessment,
        opportunities: analysis.opportunities,
        warnings: analysis.warnings,
        recommendation: analysis.recommendation,
        explorerUrl: hederaMaster.getExplorerUrl('token', tokenId),
      });
    } catch (error) {
      logger.error('Token Analysis Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Token analysis failed',
      });
    }
  });

  // Get account balances
  app.get('/api/vera/hedera/account/:accountId/balances', async (req: FastifyRequest, reply: FastifyReply) => {
    const { accountId } = req.params as { accountId: string };

    try {
      const { hederaMaster } = await import('../hedera/hederaMasterClass.js');
      const balances = await hederaMaster.getTokenBalances(accountId);

      return reply.send({
        success: true,
        accountId,
        balances,
        count: balances.length,
        explorerUrl: hederaMaster.getExplorerUrl('account', accountId),
      });
    } catch (error) {
      logger.error('Account Balances Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch balances',
      });
    }
  });

  // Get network stats
  app.get('/api/vera/hedera/network/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { hederaMaster } = await import('../hedera/hederaMasterClass.js');
      const stats = await hederaMaster.getNetworkStats();

      return reply.send({
        success: true,
        stats,
      });
    } catch (error) {
      logger.error('Network Stats Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get network stats',
      });
    }
  });

  // Get estimated transaction costs
  app.get('/api/vera/hedera/costs/:operation', async (req: FastifyRequest, reply: FastifyReply) => {
    const { operation } = req.params as { operation: string };

    try {
      const { hederaMaster } = await import('../hedera/hederaMasterClass.js');
      const cost = hederaMaster.getEstimatedCost(operation);

      return reply.send({
        success: true,
        operation,
        cost,
      });
    } catch (error) {
      logger.error('Cost Estimate Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get cost estimate',
      });
    }
  });

  // Validate Hedera ID
  app.get('/api/vera/hedera/validate/:type/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { type, id } = req.params as { type: string; id: string };

    try {
      const { hederaMaster } = await import('../hedera/hederaMasterClass.js');
      const isValid = hederaMaster.validateId(
        id,
        type as 'account' | 'token' | 'topic' | 'contract' | 'file'
      );

      return reply.send({
        success: true,
        type,
        id,
        isValid,
        explorerUrl: isValid ? hederaMaster.getExplorerUrl(type as any, id) : null,
      });
    } catch (error) {
      logger.error('ID Validation Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Validation failed',
      });
    }
  });

  // ─── HCS ENHANCED LOGGER ROUTES ──────────────────────────────────────────

  // Get HCS metrics
  app.get('/api/vera/hcs/metrics', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { hcsEnhancedLogger } = await import('../hedera/hcsEnhancedLogger.js');
      const metrics = hcsEnhancedLogger.getMetrics();

      return reply.send({
        success: true,
        metrics,
      });
    } catch (error) {
      logger.error('HCS Metrics Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get HCS metrics',
      });
    }
  });

  // Submit log to HCS
  app.post('/api/vera/hcs/log', async (req: FastifyRequest, reply: FastifyReply) => {
    const { level, service, operation, message, metadata, traceId } = req.body as {
      level: 'debug' | 'info' | 'warn' | 'error' | 'critical';
      service: string;
      operation: string;
      message: string;
      metadata?: Record<string, any>;
      traceId?: string;
    };

    if (!level || !service || !operation || !message) {
      return reply.status(400).send({ error: 'level, service, operation, and message are required' });
    }

    try {
      const { hcsEnhancedLogger } = await import('../hedera/hcsEnhancedLogger.js');
      const success = await hcsEnhancedLogger.log({
        level,
        service,
        operation,
        message,
        metadata,
        traceId,
      });

      return reply.send({
        success,
        message: success ? 'Log submitted to HCS' : 'Failed to submit log',
      });
    } catch (error) {
      logger.error('HCS Log Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to submit log',
      });
    }
  });

  // Register HCS topic
  app.post('/api/vera/hcs/topics', async (req: FastifyRequest, reply: FastifyReply) => {
    const { topicId, priority, compressionEnabled, encryptionEnabled, retentionDays } = req.body as {
      topicId: string;
      priority?: number;
      compressionEnabled?: boolean;
      encryptionEnabled?: boolean;
      retentionDays?: number;
    };

    if (!topicId) {
      return reply.status(400).send({ error: 'topicId is required' });
    }

    try {
      const { hcsEnhancedLogger } = await import('../hedera/hcsEnhancedLogger.js');
      hcsEnhancedLogger.registerTopic({
        topicId,
        shard: 0,
        priority: priority || 50,
        messageSizeLimit: 1024,
        compressionEnabled: compressionEnabled ?? true,
        encryptionEnabled: encryptionEnabled ?? false,
        retentionDays: retentionDays || 90,
      });

      return reply.send({
        success: true,
        topicId,
        message: 'Topic registered for HCS logging',
      });
    } catch (error) {
      logger.error('HCS Topic Registration Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to register topic',
      });
    }
  });

  // Flush all pending HCS batches
  app.post('/api/vera/hcs/flush', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { hcsEnhancedLogger } = await import('../hedera/hcsEnhancedLogger.js');
      await hcsEnhancedLogger.flushAll();

      return reply.send({
        success: true,
        message: 'All HCS batches flushed',
      });
    } catch (error) {
      logger.error('HCS Flush Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to flush batches',
      });
    }
  });

  // Submit HCS message (HIP-993 large message support)
  app.post('/api/vera/hedera/hcs/message', async (req: FastifyRequest, reply: FastifyReply) => {
    const { topicId, message, maxChunkSize, compression } = req.body as {
      topicId: string;
      message: string | object;
      maxChunkSize?: number; // HIP-993: up to 4096 bytes
      compression?: boolean;
    };

    if (!topicId || !message) {
      return reply.status(400).send({ error: 'topicId and message are required' });
    }

    try {
      const { hederaMaster } = await import('../hedera/hederaMasterClass.js');
      
      const result = await hederaMaster.submitMessage(topicId, message, {
        maxChunkSize: maxChunkSize || 4096, // Default to HIP-993 max
        compression,
      });

      return reply.send({
        success: true,
        topicId,
        sequenceNumber: result.sequenceNumber,
        transactionId: result.transactionId,
        chunks: result.chunks,
        chunkSequenceNumbers: result.chunkSequenceNumbers,
        totalBytes: result.totalBytes,
        hip993: {
          maxChunkSize: maxChunkSize || 1024,
          supported: true,
          features: ['chunking', 'sequence_tracking', 'large_messages'],
        },
        message: result.chunks > 1 
          ? `HIP-993: Message submitted in ${result.chunks} chunks (${result.totalBytes} bytes total)` 
          : `Message submitted successfully (${result.totalBytes} bytes)`,
        hashscanUrl: `https://hashscan.io/${config.HEDERA_NETWORK || 'mainnet'}/topic/${topicId}`,
      });
    } catch (error) {
      logger.error('HCS Message Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit HCS message',
      });
    }
  });

  // Vera Quantum Upgrade Proposal via HIP-993
  app.post('/api/vera/quantum/propose-upgrade', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { topicId } = req.body as { topicId?: string };
      
      // Import the proposal generator
      const { generateQuantumUpgradeProposal } = await import('../vera/quantum/quantumUpgradeProposal.js');
      const proposal = generateQuantumUpgradeProposal();
      
      // Import hedera master for HIP-993 submission
      const { hederaMaster } = await import('../hedera/hederaMasterClass.js');
      
      const targetTopic = topicId || process.env.VERA_QUANTUM_TOPIC_ID || '0.0.10414499';
      
      // Submit via HIP-993 with large message support
      const result = await hederaMaster.submitMessage(targetTopic, proposal, {
        maxChunkSize: 4096, // HIP-993 max
        compression: true,
      });
      
      return reply.send({
        success: true,
        proposal: {
          id: proposal.proposal.id,
          title: proposal.proposal.title,
          version: proposal.proposal.version,
          priority: proposal.proposal.priority,
        },
        hip993: {
          submitted: true,
          topicId: targetTopic,
          chunks: result.chunks,
          totalBytes: result.totalBytes,
          chunkSequenceNumbers: result.chunkSequenceNumbers,
          maxChunkSize: 4096,
          compression: true,
        },
        techStack: {
          quantumLayer: 'QVX-2026',
          hcsLogger: 'PremiumHIP993',
          batching: '30s-adaptive',
          costOptimization: '90-percent-reduction',
        },
        hashscanUrl: `https://hashscan.io/${config.HEDERA_NETWORK || 'mainnet'}/topic/${targetTopic}`,
        message: `Vera Quantum Upgrade proposed via HIP-993: ${result.chunks} chunk(s), ${result.totalBytes} bytes`,
      });
    } catch (error) {
      logger.error('Quantum Proposal Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit quantum proposal',
      });
    }
  });

  // Vera Quantum Handshake - Verifiable via HCS
  app.post('/api/vera/quantum/handshake', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { initiatorId, responderId, purpose, securityLevel, dimensions, topicId } = req.body as {
        initiatorId: string;
        responderId: string;
        purpose?: string;
        securityLevel?: 'STANDARD' | 'HIGH' | 'QUANTUM';
        dimensions?: number;
        topicId?: string;
      };
      
      // Import quantum handshake engine
      const { quantumHandshakeEngine } = await import('../vera/quantum/quantumHandshake.js');
      
      // Execute quantum handshake
      const handshakeResult = await quantumHandshakeEngine.executeHandshake({
        initiatorId,
        responderId,
        purpose: purpose || 'quantum-secure-communication',
        quantumSecurityLevel: securityLevel || 'QUANTUM',
        dimensions: dimensions || 11 // 11 dimensions for full quantum simulation
      });
      
      // Prepare for HCS submission (HIP-993)
      const hcsPayload = quantumHandshakeEngine.getHandshakeForHCSSubmission(handshakeResult.handshakeId);
      
      let hcsResult = null;
      let hcsTransactionId = null;
      
      // Submit to HCS if topic provided
      if (topicId) {
        try {
          const { hederaMaster } = await import('../hedera/hederaMasterClass.js');
          
          hcsResult = await hederaMaster.submitMessage(topicId, hcsPayload, {
            maxChunkSize: 4096, // HIP-993 max
            compression: true
          });
          hcsTransactionId = hcsResult.transactionId;
        } catch (hcsError) {
          const errorMsg = hcsError instanceof Error ? hcsError.message : String(hcsError);
          logger.warn('QuantumHandshake', {
            message: 'HCS submission failed',
            error: errorMsg
          });
          // Return error info in response for debugging
          hcsResult = { 
            submitted: false, 
            error: errorMsg,
            note: 'Check HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY in .env'
          } as any;
        }
      }
      
      // Get verification result
      const verification = quantumHandshakeEngine.verifyHandshake(handshakeResult.handshakeId);
      
      return reply.send({
        success: true,
        handshake: {
          id: handshakeResult.handshakeId,
          initiator: handshakeResult.initiatorId,
          responder: handshakeResult.responderId,
          timestamp: handshakeResult.timestamp,
          securityLevel: handshakeResult.securityLevel,
          dimensions: handshakeResult.quantumStates.length / 2,
          entanglementPairs: handshakeResult.entanglementPairs.length,
          verificationHash: handshakeResult.verificationHash,
        },
        quantumState: {
          entanglementCorrelations: handshakeResult.entanglementPairs.map(p => ({
            pairId: p.id,
            correlation: parseFloat(p.correlation.toFixed(4)),
            status: p.correlation > 0.95 ? 'STRONG' : p.correlation > 0.8 ? 'MODERATE' : 'WEAK'
          })),
          averageCorrelation: (handshakeResult.entanglementPairs.reduce((sum, p) => sum + p.correlation, 0) / handshakeResult.entanglementPairs.length).toFixed(4)
        },
        verification: {
          valid: verification.valid,
          entanglementValid: verification.details.entanglementValid,
          hashValid: verification.details.hashValid,
          proofs: handshakeResult.verificationProof
        },
        hcs: hcsResult ? {
          submitted: true,
          topicId,
          transactionId: hcsTransactionId,
          chunks: hcsResult.chunks,
          totalBytes: hcsResult.totalBytes,
          hip993: {
            maxChunkSize: 4096,
            compression: true,
            features: ['quantum_handshake', 'entanglement_log', 'verification_proof']
          },
          hashscanUrl: `https://hashscan.io/${config.HEDERA_NETWORK || 'mainnet'}/topic/${topicId}/messages/${hcsResult.sequenceNumber}`
        } : {
          submitted: false,
          note: 'Provide topicId for HCS verification'
        },
        techStack: {
          quantumEngine: 'Vera-QVX-2026',
          entanglementSimulation: '11-Dimensional',
          verification: 'Zero-Knowledge-Proof',
          hcsIntegration: 'HIP-993-Large-Messages',
          costOptimization: '90-percent-reduction'
        },
        message: `Quantum handshake completed with ${handshakeResult.entanglementPairs.length} entanglement pairs. Verifiable via HCS with ${verification.valid ? 'VALID' : 'INVALID'} integrity.`
      });
    } catch (error) {
      logger.error('Quantum Handshake Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute quantum handshake'
      });
    }
  });

  // Verify quantum handshake
  app.get('/api/vera/quantum/handshake/:id/verify', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string };
      const { quantumHandshakeEngine } = await import('../vera/quantum/quantumHandshake.js');
      
      const verification = quantumHandshakeEngine.verifyHandshake(id);
      const stats = quantumHandshakeEngine.getStats();
      
      return reply.send({
        success: true,
        handshakeId: id,
        verification,
        engineStats: stats,
        message: verification.valid 
          ? '✅ Quantum handshake integrity verified. Entanglement consistency and hash validation passed.'
          : '❌ Verification failed. Handshake may have been tampered with or expired.'
      });
    } catch (error) {
      logger.error('Quantum Verify Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify handshake'
      });
    }
  });

  // ─── HashScan Integration - Pull HCS Topic Data ─────────────────────────────

  // Fetch topic messages from HashScan with HIP-993 reconstruction
  app.get('/api/vera/hashscan/topic/:topicId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { topicId } = req.params as { topicId: string };
      const { limit, reconstruct } = req.query as { limit?: string; reconstruct?: string };
      
      const { hashScanClient } = await import('../vera/quantum/hashscanIntegration.js');
      
      const analysis = await hashScanClient.analyzeTopic(
        topicId,
        parseInt(limit || '100')
      );

      return reply.send({
        success: true,
        topic: {
          id: topicId,
          hashscanUrl: analysis.hashscanUrl,
          network: config.HEDERA_NETWORK || 'mainnet'
        },
        summary: {
          totalMessages: analysis.totalMessages,
          hip993Messages: analysis.hip993Messages,
          chunkedMessages: analysis.chunkedMessages,
          reconstructedMessages: analysis.reconstructedMessages,
          avgMessageSize: Math.round(analysis.stats.avgMessageSize),
          totalBytes: analysis.stats.totalBytes
        },
        recentMessages: analysis.recentMessages.map(m => ({
          sequenceNumber: m.sequenceNumber,
          timestamp: m.timestamp,
          isChunked: m.isChunked,
          hip993: m.hip993,
          preview: typeof m.decodedMessage === 'string' 
            ? m.decodedMessage.substring(0, 100) + '...'
            : JSON.stringify(m.decodedMessage).substring(0, 100) + '...'
        })),
        reconstructed: reconstruct === 'true' ? analysis.reconstructed.map(r => ({
          messageId: r.messageId,
          chunks: r.totalChunks,
          firstTimestamp: r.firstTimestamp,
          lastTimestamp: r.lastTimestamp,
          data: typeof r.reconstructedData === 'string'
            ? r.reconstructedData.substring(0, 200) + '...'
            : r.reconstructedData
        })) : undefined,
        hip993: {
          supported: true,
          features: ['chunking', 'reconstruction', 'large_messages'],
          maxChunkSize: 4096
        }
      });
    } catch (error) {
      logger.error('HashScan Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch HashScan data'
      });
    }
  });

  // Get specific message by sequence number
  app.get('/api/vera/hashscan/topic/:topicId/message/:sequenceNumber', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { topicId, sequenceNumber } = req.params as { topicId: string; sequenceNumber: string };
      const { hashScanClient } = await import('../vera/quantum/hashscanIntegration.js');
      
      const response = await hashScanClient.fetchTopicMessages(topicId, {
        sequenceNumber: parseInt(sequenceNumber),
        limit: 1
      });

      if (!response.messages || response.messages.length === 0) {
        return reply.status(404).send({
          success: false,
          error: `Message ${sequenceNumber} not found in topic ${topicId}`
        });
      }

      const parsed = hashScanClient.parseMessages(response.messages);
      const message = parsed[0];

      return reply.send({
        success: true,
        message: {
          sequenceNumber: message.sequenceNumber,
          timestamp: message.timestamp,
          topicId: message.topicId,
          decodedMessage: message.decodedMessage,
          isChunked: message.isChunked,
          hip993: message.hip993,
          size: message.rawSize,
          hashscanUrl: `https://hashscan.io/${config.HEDERA_NETWORK || 'mainnet'}/topic/${topicId}/messages/${sequenceNumber}`
        }
      });
    } catch (error) {
      logger.error('HashScan Message Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch message'
      });
    }
  });

  // Quick HashScan URL generator
  app.get('/api/vera/hashscan/url/:type/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type, id } = req.params as { type: string; id: string };
      const network = config.HEDERA_NETWORK || 'mainnet';
      
      let url: string;
      switch (type) {
        case 'topic':
          url = `https://hashscan.io/${network}/topic/${id}`;
          break;
        case 'account':
          url = `https://hashscan.io/${network}/account/${id}`;
          break;
        case 'transaction':
          url = `https://hashscan.io/${network}/transaction/${id}`;
          break;
        case 'token':
          url = `https://hashscan.io/${network}/token/${id}`;
          break;
        default:
          return reply.status(400).send({
            error: 'Invalid type',
            message: 'type must be one of: topic, account, transaction, token',
          });
      }
      return reply.send({ url, type, id, network });
    } catch (error) {
      return reply.status(500).send({
        error: 'Hashscan URL generation failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ─── HashScan - Show All Vera Topics ────────────────────────────────────────

  app.get('/api/vera/hashscan/topics', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const network = config.HEDERA_NETWORK || 'mainnet';
      const operatorId = config.HEDERA_OPERATOR_ACCOUNT_ID;

      // All Vera topic IDs from config
      const topics = [
        { id: config.VERA_REGISTRY_TOPIC_ID, name: 'Registry', domain: 'foundation', layer: 1 },
        { id: config.VERA_TASK_TOPIC_ID, name: 'Task', domain: 'foundation', layer: 1 },
        { id: config.VERA_RESULT_TOPIC_ID, name: 'Result', domain: 'foundation', layer: 1 },
        { id: config.VERA_AUDIT_TOPIC_ID, name: 'Audit', domain: 'foundation', layer: 1 },
        { id: config.VERA_BEACON_TOPIC_ID, name: 'Beacon', domain: 'foundation', layer: 1 },
        { id: config.VERA_HOT_TOPICS_TOPIC_ID, name: 'Hot Topics', domain: 'foundation', layer: 1 },
        { id: config.VERA_SWARM_STATE_TOPIC_ID, name: 'Swarm State', domain: 'swarm', layer: 2 },
        { id: config.VERA_SWARM_CONSENSUS_TOPIC_ID, name: 'Swarm Consensus', domain: 'swarm', layer: 2 },
        { id: config.VERA_SWARM_MEET_TOPIC_ID, name: 'Swarm Meet', domain: 'swarm', layer: 2 },
        { id: config.VERA_SWARM_JOIN_TOPIC_ID, name: 'Swarm Join', domain: 'swarm', layer: 2 },
        { id: config.VERA_SWARM_ROUTING_TOPIC_ID, name: 'Swarm Routing', domain: 'swarm', layer: 2 },
        { id: config.VERA_FEDERATION_HANDSHAKE_TOPIC_ID, name: 'Federation Handshake', domain: 'federation', layer: 2 },
        { id: config.VERA_FEDERATION_CONSENSUS_TOPIC_ID, name: 'Federation Consensus', domain: 'federation', layer: 2 },
        { id: config.VERA_FEDERATION_TASK_TOPIC_ID, name: 'Federation Task', domain: 'federation', layer: 2 },
        { id: config.VERA_FEDERATION_HEARTBEAT_TOPIC_ID, name: 'Federation Heartbeat', domain: 'federation', layer: 2 },
        { id: config.VERA_DEFI_INTELLIGENCE_TOPIC_ID, name: 'DeFi Intelligence', domain: 'domain', layer: 3 },
        { id: config.VERA_CARBON_VERIFICATION_TOPIC_ID, name: 'Carbon Verification', domain: 'domain', layer: 3 },
        { id: config.VERA_COMPLIANCE_AUDIT_TOPIC_ID, name: 'Compliance Audit', domain: 'domain', layer: 3 },
        { id: config.VERA_AGENT_LEARNING_TOPIC_ID, name: 'Agent Learning', domain: 'domain', layer: 3 },
        { id: config.VERA_PAYMENT_STREAM_TOPIC_ID, name: 'Payment Stream', domain: 'domain', layer: 3 },
      ].filter(t => t.id) // Only include configured topics
       .map(t => ({
         ...t,
         hashscanUrl: `https://hashscan.io/${network}/topic/${t.id}`,
       }));

      // Group by layer
      const byLayer = {
        foundation: topics.filter(t => t.layer === 1),
        swarm: topics.filter(t => t.layer === 2),
        federation: topics.filter(t => t.domain === 'federation'),
        domain: topics.filter(t => t.domain === 'domain' && t.layer === 3),
      };

      return reply.send({
        success: true,
        network,
        operatorId,
        summary: {
          total: topics.length,
          configured: topics.length,
          byLayer: {
            foundation: byLayer.foundation.length,
            swarm: byLayer.swarm.length,
            federation: byLayer.federation.length,
            domain: byLayer.domain.length,
          }
        },
        topics: byLayer,
      });
    } catch (error) {
      logger.error('HashScan Topics Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch topics',
      });
    }
  });

  // ─── EMERGENCY STOP ALL HCS LOGGING ────────────────────────────────────────

  app.post('/api/vera/hcs/stop-all', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const reason = (req.body as { reason?: string })?.reason || 'user-requested';
      
      logger.warn('HCS Emergency Stop', { reason, timestamp: Date.now() });
      
      // Stop all HCS-related components
      const stopped = [];
      
      // 1. Stop Premium HCS Logger
      try {
        const { premiumHCSLogger } = await import('../vera/logging/premiumHCSLogger.js');
        premiumHCSLogger.stop();
        stopped.push('premiumHCSLogger');
      } catch (e) { /* ignore */ }
      
      // 2. Stop HCS Domain Logger
      try {
        const { hcsDomainLogger } = await import('../vera/logging/hcsDomainLogger.js');
        hcsDomainLogger.stop();
        stopped.push('hcsDomainLogger');
      } catch (e) { /* ignore */ }
      
      // 3. Stop HCS Swarm Messenger
      try {
        const { hcsSwarmMessenger } = await import('../swarm/hcsMessenger.js');
        hcsSwarmMessenger.stop();
        stopped.push('hcsSwarmMessenger');
      } catch (e) { /* ignore */ }
      
      // 4. Stop Lattice Swarm HCS Batch Timer
      try {
        const { VeraLatticeSwarm } = await import('../swarm/latticeSwarm.js');
        // Stop static instance if exists
        stopped.push('latticeSwarm');
      } catch (e) { /* ignore */ }
      
      // 5. Stop VeraHCS Logger
      try {
        const { veraHCS } = await import('../dovu/veraHCS.js');
        veraHCS.stop();
        stopped.push('veraHCS');
      } catch (e) { /* ignore */ }
      
      return reply.send({
        success: true,
        stopped,
        reason,
        message: `🛑 All HCS logging stopped. ${stopped.length} components shut down.`,
        note: 'To resume, restart the server or call individual component start methods'
      });
    } catch (error) {
      logger.error('HCS Stop All Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop HCS logging'
      });
    }
  });

  // ─── Verification / HIP-991 / Capabilities ─────────────────────────────────

  // Verify any arbitrary action (generic escape hatch)
  app.post('/api/vera/verify', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { domain, type, actor, payload, result, topicId } = req.body as {
        domain: string;
        type: string;
        actor: string;
        payload: Record<string, unknown>;
        result?: unknown;
        topicId?: string;
      };
      if (!domain || !type || !actor || !payload) {
        return reply.status(400).send({ error: 'Missing required fields: domain, type, actor, payload' });
      }
      const { actionVerifier } = await import('../vera/verification/actionVerifier.js');
      const proof = await actionVerifier.verifyAction({ domain, type, actor, payload, result, topicId });
      return reply.send(proof);
    } catch (error) {
      return reply.status(500).send({
        error: 'Verification failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Look up a verification proof by hash (from in-memory cache)
  app.get('/api/vera/verify/:hash', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { hash } = req.params as { hash: string };
      const { actionVerifier } = await import('../vera/verification/actionVerifier.js');
      const proof = actionVerifier.getProof(hash);
      if (!proof) return reply.status(404).send({ error: 'Proof not found', hash });
      return reply.send(proof);
    } catch (error) {
      return reply.status(500).send({
        error: 'Lookup failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Verifier stats
  app.get('/api/vera/verify/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { actionVerifier } = await import('../vera/verification/actionVerifier.js');
    return reply.send(actionVerifier.getStats());
  });

  // Operator public key — external verifiers need this to validate signatures
  app.get('/api/vera/verify/pubkey', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { actionVerifier } = await import('../vera/verification/actionVerifier.js');
    const pk = actionVerifier.getPublicKey();
    if (!pk) return reply.status(503).send({ error: 'Operator key not loaded' });
    return reply.send(pk);
  });

  // List recently cached proofs
  app.get('/api/vera/verify/list', async (req: FastifyRequest, reply: FastifyReply) => {
    const { actionVerifier } = await import('../vera/verification/actionVerifier.js');
    const limit = Number((req.query as { limit?: string })?.limit ?? 50);
    return reply.send({ proofs: actionVerifier.listProofs(limit) });
  });

  /**
   * Full end-to-end verification of a single action hash.
   * Returns { localProof, onChain, verified, consensusTime }.
   * Anyone can hit this to prove a Vera action is truly anchored on Hedera.
   */
  app.get('/api/vera/verify/action/:hash', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { hash } = req.params as { hash: string };
      if (!/^[a-f0-9]{64}$/i.test(hash)) {
        return reply.status(400).send({ error: 'Invalid hash — expected 64 hex chars' });
      }

      const [
        { actionVerifier },
        { hederaMaster },
        { config: cfg },
      ] = await Promise.all([
        import('../vera/verification/actionVerifier.js'),
        import('../hedera/hederaMasterClass.js'),
        import('../config.js'),
      ]);
      const network = cfg.HEDERA_NETWORK || 'mainnet';

      const localProof = actionVerifier.getProof(hash);
      if (!localProof) {
        return reply.status(404).send({
          error: 'Hash not found in local proof cache',
          hash,
          hint: 'Only actions performed by this Vera instance are cached; for older actions query HCS directly.',
        });
      }

      // Attempt fresh mirror-node round-trip (bypass cache flag)
      const result: Record<string, unknown> = {
        hash,
        localProof,
        onChain: false,
        verified: false,
      };

      if (!localProof.sequenceNumber || !localProof.topicId) {
        result.note = 'Proof was generated locally but never successfully submitted to HCS';
        return reply.send(result);
      }

      try {
        const mirror = await hederaMaster.queryMirrorNode(
          `/api/v1/topics/${localProof.topicId}/messages/${localProof.sequenceNumber}`,
        );
        if (mirror?.message) {
          // Reassemble chunked messages (Hedera splits submissions > ~1KB)
          const totalChunks = mirror.chunk_info?.total ?? 1;
          const chunks: Buffer[] = [Buffer.from(mirror.message, 'base64')];
          for (let offset = 1; offset < totalChunks; offset++) {
            const next = await hederaMaster.queryMirrorNode(
              `/api/v1/topics/${localProof.topicId}/messages/${Number(localProof.sequenceNumber) + offset}`,
            );
            if (next?.message) chunks.push(Buffer.from(next.message, 'base64'));
          }
          const decoded = Buffer.concat(chunks).toString('utf8');
          const outer = JSON.parse(decoded);
          // hederaMaster double-wraps: outer.data is stringified inner payload
          const inner = typeof outer?.data === 'string' ? JSON.parse(outer.data) : outer;
          const mirrorHash = inner?.data?.hash ?? inner?.hash;
          const mirrorSig = inner?.data?.signature ?? inner?.signature;

          result.onChain = true;
          result.consensusTimestamp = mirror.consensus_timestamp;
          result.mirrorHash = mirrorHash;
          result.mirrorSignature = mirrorSig;
          result.payload = inner?.data?.payload ?? inner?.payload;
          result.resultData = inner?.data?.result ?? inner?.result;
          result.domain = inner?.data?.domain;
          result.type = inner?.data?.type;
          result.actor = inner?.data?.actor;
          result.verified =
            mirrorHash === localProof.hash && mirrorSig === localProof.signature;
          result.hashscanUrl = `https://hashscan.io/${network}/transaction/${localProof.transactionId}`;
          result.topicUrl = `https://hashscan.io/${network}/topic/${localProof.topicId}`;
        } else {
          result.note = 'Mirror node has not indexed this message yet (propagation ~2-10s)';
        }
      } catch (e) {
        result.mirrorError = e instanceof Error ? e.message : String(e);
      }

      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({
        error: 'Verification failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Create a new HIP-991 structured topic (empty fees, fee-ready)
  app.post('/api/vera/hip991/topic', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { memo } = req.body as { memo: string };
      if (!memo) return reply.status(400).send({ error: 'memo is required' });
      const { hip991TopicManager } = await import('../vera/verification/hip991TopicManager.js');
      const result = await hip991TopicManager.createHIP991Topic({ memo });
      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({
        error: 'Topic creation failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Inspect HIP-991 config of an existing topic
  app.get('/api/vera/hip991/topic/:topicId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { topicId } = req.params as { topicId: string };
      const { hip991TopicManager } = await import('../vera/verification/hip991TopicManager.js');
      const info = await hip991TopicManager.getTopicInfo(topicId);
      return reply.send(info);
    } catch (error) {
      return reply.status(500).send({
        error: 'Topic info query failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Full capability manifest + HCS proof
  app.get('/api/vera/capabilities/proof', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { capabilityRegistry } = await import('../vera/verification/capabilityRegistry.js');
      const manifest = capabilityRegistry.getManifest() ?? capabilityRegistry.buildManifest();
      const existingProof = capabilityRegistry.getProof();
      const proof = existingProof ?? (await capabilityRegistry.publish());
      return reply.send({ manifest, proof });
    } catch (error) {
      return reply.status(500).send({
        error: 'Capabilities fetch failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Force-republish capability manifest
  app.post('/api/vera/capabilities/publish', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { capabilityRegistry } = await import('../vera/verification/capabilityRegistry.js');
      capabilityRegistry.buildManifest();
      const proof = await capabilityRegistry.publish();
      return reply.send({ published: true, proof });
    } catch (error) {
      return reply.status(500).send({
        error: 'Publish failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ─── Learning System Routes ────────────────────────────────────────────────

  // Overall learning status (all agents)
  app.get('/api/vera/learning/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { agentLearningSystem } = await import('../agent/learningSystem.js');
      const metrics = agentLearningSystem.getAllAgentMetrics();
      return reply.send({
        active: true,
        agentCount: metrics.length,
        totals: {
          totalCalls: metrics.reduce((s, m) => s + m.totalCalls, 0),
          avgSuccessRate:
            metrics.length > 0
              ? metrics.reduce((s, m) => s + m.successRate, 0) / metrics.length
              : 0,
        },
        agents: metrics,
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Learning status failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Per-agent analytics (last N days)
  app.get('/api/vera/learning/stats/:agentId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { agentId } = req.params as { agentId: string };
      const days = parseInt((req.query as { days?: string }).days ?? '7', 10);
      const { agentLearningSystem } = await import('../agent/learningSystem.js');
      const analytics = agentLearningSystem.getToolAnalytics(agentId, days);
      const recommendations = agentLearningSystem.getRecommendations(agentId);
      const skillGraph = agentLearningSystem.buildSkillGraph(agentId);
      return reply.send({ agentId, days, analytics, recommendations, skillGraph });
    } catch (error) {
      return reply.status(500).send({
        error: 'Learning stats failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Human-readable learning report
  app.get('/api/vera/learning/report', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { agentId } = req.query as { agentId?: string };
      const { agentLearningSystem } = await import('../agent/learningSystem.js');
      const report = agentLearningSystem.generateReport(agentId);
      reply.type('text/markdown').send(report);
    } catch (error) {
      return reply.status(500).send({
        error: 'Report failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Manually flush in-memory learning cache to disk
  app.post('/api/vera/learning/flush', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { agentLearningSystem } = await import('../agent/learningSystem.js');
      // @ts-expect-error flushCache is private but we need to force-flush for tests
      agentLearningSystem.flushCache?.();
      return reply.send({ flushed: true });
    } catch (error) {
      return reply.status(500).send({
        error: 'Flush failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ─── Adaptation Loops ──────────────────────────────────────────────────────

  app.get('/api/vera/adaptation/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { behaviorAdapter } = await import('../vera/adaptation/behaviorAdapter.js');
    const { latticeGrower } = await import('../vera/adaptation/latticeGrower.js');
    const { selfVerifyTicker } = await import('../vera/adaptation/selfVerifyTicker.js');
    return reply.send({
      behavior: behaviorAdapter.getStats(),
      lattice: latticeGrower.getSnapshot(),
      selfVerify: selfVerifyTicker.getStats(),
    });
  });

  app.get('/api/vera/adaptation/weights', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { behaviorAdapter } = await import('../vera/adaptation/behaviorAdapter.js');
    return reply.send({ weights: behaviorAdapter.getAllWeights() });
  });

  app.get('/api/vera/adaptation/lattice', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { latticeGrower } = await import('../vera/adaptation/latticeGrower.js');
    return reply.send(latticeGrower.getSnapshot());
  });

  app.post('/api/vera/adaptation/tick', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { behaviorAdapter } = await import('../vera/adaptation/behaviorAdapter.js');
    const { latticeGrower } = await import('../vera/adaptation/latticeGrower.js');
    const { selfVerifyTicker } = await import('../vera/adaptation/selfVerifyTicker.js');
    await Promise.all([behaviorAdapter.tick(), latticeGrower.tick()]);
    const verifyResult = await selfVerifyTicker.tick();
    return reply.send({
      ticked: true,
      behavior: behaviorAdapter.getStats(),
      lattice: latticeGrower.getSnapshot(),
      selfVerify: verifyResult,
    });
  });

  // Ask Vera to pick her best tool from a set of candidates (uses learned weights)
  app.post('/api/vera/adaptation/pick', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { candidates } = req.body as { candidates: string[] };
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return reply.status(400).send({ error: 'candidates must be a non-empty string array' });
      }
      const { behaviorAdapter } = await import('../vera/adaptation/behaviorAdapter.js');
      const pick = behaviorAdapter.pickBestTool(candidates);
      const explanation = pick ? behaviorAdapter.explain(pick) : null;
      return reply.send({
        candidates,
        pick,
        weight: pick ? behaviorAdapter.getToolWeight(pick) : null,
        explanation,
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Pick failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Convenience redirects to the HTML dashboards
  app.get('/vera', (_req, reply) => reply.redirect('/vera-self.html'));
  app.get('/vera/self', (_req, reply) => reply.redirect('/vera-self.html'));
  app.get('/swarm', (_req, reply) => reply.redirect('/vera-swarm.html'));
  app.get('/vera/swarm', (_req, reply) => reply.redirect('/vera-swarm.html'));

  // ─── Swarm live event feed ────────────────────────────────────────────────
  // Every inter-agent / inter-node interaction flows through swarmEventLogger
  // and is HIP-993 anchored via actionVerifier.

  app.get('/api/vera/swarm/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { swarmEventLogger } = await import('../vera/logging/swarmEventLogger.js');
    return reply.send(swarmEventLogger.getStats());
  });

  app.get('/api/vera/swarm/events', async (req: FastifyRequest, reply: FastifyReply) => {
    const { swarmEventLogger } = await import('../vera/logging/swarmEventLogger.js');
    const { limit, kind } = req.query as { limit?: string; kind?: string };
    const events = swarmEventLogger.recent(
      limit ? Math.min(500, Number(limit)) : 50,
      kind as never,
    );
    return reply.send({ events, stats: swarmEventLogger.getStats() });
  });

  /**
   * SSE live stream — pushes swarm events as they happen.
   * Dashboard consumers: `new EventSource('/api/vera/swarm/stream')`.
   */
  app.get('/api/vera/swarm/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    const { swarmEventLogger } = await import('../vera/logging/swarmEventLogger.js');

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });

    // Send snapshot of recent events + stats so UI has immediate context
    const snapshot = {
      type: 'snapshot',
      events: swarmEventLogger.recent(30),
      stats: swarmEventLogger.getStats(),
    };
    reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`);

    const onEvent = (event: unknown) => {
      reply.raw.write(`event: swarm\ndata: ${JSON.stringify({ type: 'event', event })}\n\n`);
    };
    const onAnchored = (event: unknown) => {
      reply.raw.write(`event: anchored\ndata: ${JSON.stringify({ type: 'anchored', event })}\n\n`);
    };

    swarmEventLogger.on('event', onEvent);
    swarmEventLogger.on('anchored', onAnchored);

    // Heartbeat every 15s so intermediaries don't close the connection
    const ping = setInterval(() => {
      try { reply.raw.write(': ping\n\n'); } catch { /* noop */ }
    }, 15000);

    req.raw.on('close', () => {
      clearInterval(ping);
      swarmEventLogger.off('event', onEvent);
      swarmEventLogger.off('anchored', onAnchored);
    });
  });

  /**
   * Manual emit — lets dashboards / demo scripts inject events. Fire-and-forget.
   */
  app.post('/api/vera/swarm/emit', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { kind?: string; from?: string; to?: string; data?: Record<string, unknown> };
    if (!body?.kind || !body?.from) {
      return reply.status(400).send({ error: 'kind and from are required' });
    }
    const { swarmEventLogger } = await import('../vera/logging/swarmEventLogger.js');
    const event = swarmEventLogger.log(body.kind as never, {
      from: body.from,
      to: body.to,
      data: body.data,
    });
    return reply.send(event);
  });

  // ─── Prometheus metrics ────────────────────────────────────────────────────
  // Surfaces Vera's live state as scrape-friendly gauges.
  app.get('/metrics', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const [
        { behaviorAdapter },
        { latticeGrower },
        { selfVerifyTicker },
        { actionVerifier },
        { agentLearningSystem },
        { capabilityRegistry },
      ] = await Promise.all([
        import('../vera/adaptation/behaviorAdapter.js'),
        import('../vera/adaptation/latticeGrower.js'),
        import('../vera/adaptation/selfVerifyTicker.js'),
        import('../vera/verification/actionVerifier.js'),
        import('../agent/learningSystem.js'),
        import('../vera/verification/capabilityRegistry.js'),
      ]);

      const manifest = capabilityRegistry.getManifest() ?? capabilityRegistry.buildManifest();
      const weights = behaviorAdapter.getAllWeights();
      const lattice = latticeGrower.getSnapshot();
      const verify = selfVerifyTicker.getStats();
      const verifier = actionVerifier.getStats();
      const agents = agentLearningSystem.getAllAgentMetrics();

      const lines: string[] = [];
      const declared = new Set<string>();
      const escapeLabel = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const push = (
        name: string,
        help: string,
        value: number,
        labels?: Record<string, string>,
        type: 'gauge' | 'counter' = 'gauge',
      ) => {
        if (!declared.has(name)) {
          lines.push(`# HELP ${name} ${help}`);
          lines.push(`# TYPE ${name} ${type}`);
          declared.add(name);
        }
        const labelStr = labels
          ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',') + '}'
          : '';
        // Prometheus requires finite numbers; coerce NaN/Infinity to 0.
        const safe = Number.isFinite(value) ? value : 0;
        lines.push(`${name}${labelStr} ${safe}`);
      };

      // Identity / capabilities
      push('vera_capabilities_registered', 'Number of registered tools', manifest.toolCount);

      // Learning
      push('vera_learning_agents', 'Distinct agents tracked by learning system', agents.length);
      push('vera_learning_calls_total', 'Total tool calls recorded',
        agents.reduce((s, a) => s + a.totalCalls, 0), undefined, 'counter');
      for (const a of agents) {
        push('vera_agent_success_rate', 'Per-agent success rate 0..1',
          a.successRate, { agent_id: a.agentId });
        push('vera_agent_avg_latency_seconds', 'Per-agent average latency in seconds',
          (a.avgLatency ?? 0) / 1000, { agent_id: a.agentId });
        push('vera_agent_calls_total', 'Per-agent total calls',
          a.totalCalls, { agent_id: a.agentId }, 'counter');
      }

      // Adaptation
      push('vera_adaptation_tools_tracked', 'Tools currently weighted by adapter', weights.length);
      push('vera_adaptation_tools_healthy', 'Tools with weight >= 1',
        weights.filter((w) => w.weight >= 1).length);
      push('vera_adaptation_tools_penalized', 'Tools with weight < 1',
        weights.filter((w) => w.weight < 1).length);
      for (const w of weights) {
        push('vera_tool_weight', 'Per-tool adapter weight', w.weight, { tool: w.tool });
      }

      // Lattice
      push('vera_lattice_skill_nodes', 'Skill nodes in overlay lattice', lattice.nodeCount);
      push('vera_lattice_skill_edges', 'Skill edges in overlay lattice', lattice.edgeCount);

      // Verification
      push('vera_verify_proofs_generated_total', 'Local action proofs generated',
        verifier.verified ?? 0, undefined, 'counter');
      push('vera_verify_proofs_submitted_total', 'Proofs submitted to HCS',
        verifier.submitted ?? 0, undefined, 'counter');
      push('vera_verify_proofs_failed_total', 'Proof submissions that failed',
        verifier.failed ?? 0, undefined, 'counter');
      push('vera_verify_proofs_cached', 'Proofs currently cached in memory',
        verifier.cached ?? 0);
      push('vera_self_verify_ticks_total', 'Self-verification loop ticks',
        verify.ticks ?? 0, undefined, 'counter');
      push('vera_self_verify_publishes_total', 'Self-verification publishes',
        verify.publishes ?? 0, undefined, 'counter');

      // Swarm event logger — every lattice + agent interaction anchored to HCS
      try {
        const { swarmEventLogger } = await import('../vera/logging/swarmEventLogger.js');
        const sw = swarmEventLogger.getStats();
        push('vera_swarm_events_total', 'Total swarm events observed',
          sw.totalEvents, undefined, 'counter');
        push('vera_swarm_events_onchain_total', 'Swarm events anchored on HCS',
          sw.onChainEvents, undefined, 'counter');
        push('vera_swarm_events_pending', 'Swarm events awaiting on-chain anchor',
          sw.pendingEvents);
        push('vera_swarm_events_failed_total', 'Swarm events whose anchoring failed',
          sw.failedEvents, undefined, 'counter');
        for (const [kind, count] of Object.entries(sw.eventsByKind)) {
          push('vera_swarm_events_by_kind_total', 'Swarm events per kind',
            count as number, { kind }, 'counter');
        }
        // Anchor latency (ms -> seconds for Prometheus convention)
        push('vera_swarm_anchor_latency_avg_seconds',
          'Average time from emit to HCS anchor', (sw.latency.avgMs ?? 0) / 1000);
        push('vera_swarm_anchor_latency_p50_seconds',
          'p50 time from emit to HCS anchor', (sw.latency.p50Ms ?? 0) / 1000);
        push('vera_swarm_anchor_latency_p95_seconds',
          'p95 time from emit to HCS anchor', (sw.latency.p95Ms ?? 0) / 1000);
        push('vera_swarm_anchor_latency_max_seconds',
          'Worst observed time from emit to HCS anchor', (sw.latency.maxMs ?? 0) / 1000);
        push('vera_swarm_anchor_latency_samples',
          'Latency samples in rolling window', sw.latency.count);
      } catch { /* swarm logger optional */ }

      return reply
        .code(200)
        .type('text/plain; version=0.0.4')
        .send(lines.join('\n') + '\n');
    } catch (error) {
      return reply.status(500).send({
        error: 'Metrics failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ─── Vera Oasis Chat (the main chat UI at /index.html calls this) ──────────
  // Routes through smartChat orchestrator: intent classification → fast path,
  // tool calling, or full cascade. Records to learning + HCS audit.
  app.post('/api/vera/oasis/chat/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      message?: string;
      sessionId?: string;
      userId?: string;
      showTrace?: boolean;
      stream?: boolean;
    };

    if (!body?.message || typeof body.message !== 'string') {
      return reply.status(400).send({ error: 'message field required' });
    }

    const doStream = body.stream !== false;

    try {
      const { smartChat } = await import('../vera/chat/smartChatOrchestrator.js');
      const result = await smartChat.handle({
        sessionId: body.sessionId || 'default-session',
        userId: body.userId || 'anonymous',
        message: body.message,
        showTrace: body.showTrace,
      });

      const finalPayload = {
        done: true,
        response: result.response,
        intent: result.intent,
        toolsCalled: result.toolsCalled,
        durationMs: result.durationMs,
        thinkingTrace: result.thinkingTrace,
        confidence: result.confidence,
        metadata: result.metadata,
        sovereign: result.sovereign,
        provider: result.provider,
        model: result.model,
      };

      if (doStream) {
        reply.hijack();
        const raw = reply.raw;
        raw.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        // Stream the response word-by-word for UI feedback
        const words = result.response.split(' ');
        const chunkSize = Math.max(1, Math.ceil(words.length / 20));
        for (let i = 0; i < words.length; i += chunkSize) {
          const piece = words.slice(i, i + chunkSize).join(' ') + (i + chunkSize < words.length ? ' ' : '');
          raw.write(JSON.stringify({ chunk: piece }) + '\n');
          await new Promise((r) => setTimeout(r, 20));
        }
        raw.write(JSON.stringify(finalPayload) + '\n');
        raw.end();
      } else {
        return reply.send(finalPayload);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('VeraOasisChat', { message: 'Chat failed', error: message });
      if (reply.sent) return;
      return reply.status(500).send({ error: 'Chat failed', message });
    }
  });

  // Non-streaming variant
  app.post('/api/vera/oasis/chat', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { message?: string; sessionId?: string; userId?: string };
    if (!body?.message) return reply.status(400).send({ error: 'message field required' });
    try {
      const { smartChat } = await import('../vera/chat/smartChatOrchestrator.js');
      const result = await smartChat.handle({
        sessionId: body.sessionId || 'default-session',
        userId: body.userId || 'anonymous',
        message: body.message,
      });
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ error: 'Chat failed', message });
    }
  });

  // ─── Unified Self-Portrait ─────────────────────────────────────────────────
  // "Who are you right now?" — answered in one call.
  app.get('/api/vera/self', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const [
        { capabilityRegistry },
        { behaviorAdapter },
        { latticeGrower },
        { selfVerifyTicker },
        { actionVerifier },
        { agentLearningSystem },
      ] = await Promise.all([
        import('../vera/verification/capabilityRegistry.js'),
        import('../vera/adaptation/behaviorAdapter.js'),
        import('../vera/adaptation/latticeGrower.js'),
        import('../vera/adaptation/selfVerifyTicker.js'),
        import('../vera/verification/actionVerifier.js'),
        import('../agent/learningSystem.js'),
      ]);

      const manifest = capabilityRegistry.getManifest() ?? capabilityRegistry.buildManifest();
      const weights = behaviorAdapter.getAllWeights();
      const lattice = latticeGrower.getSnapshot();
      const verifyStats = selfVerifyTicker.getStats();
      const verifierStats = actionVerifier.getStats();
      const agents = agentLearningSystem.getAllAgentMetrics();

      const penalized = weights.filter((w) => w.weight < 1);
      const healthy = weights.filter((w) => w.weight >= 1);

      // Operator balance (non-blocking — mirror node, free)
      let balance: { tinybars: number; hbar: number; fundingOk: boolean; warning?: string } | null = null;
      try {
        const { hederaMaster } = await import('../hedera/hederaMasterClass.js');
        const acct = await hederaMaster.queryMirrorNode(
          `/api/v1/accounts/${config.HEDERA_OPERATOR_ACCOUNT_ID}`
        );
        const tinybars = Number(acct?.balance?.balance) || 0;
        const hbar = tinybars / 1e8;
        balance = {
          tinybars,
          hbar,
          fundingOk: hbar >= 1,
          warning: hbar < 1 ? `Low balance (${hbar.toFixed(4)} HBAR) — HCS writes will fail` : undefined,
        };
      } catch {
        // Non-fatal
      }

      return reply.send({
        identity: {
          name: 'Vera',
          network: config.HEDERA_NETWORK || 'mainnet',
          operator: config.HEDERA_OPERATOR_ACCOUNT_ID,
          manifestHash: manifest.hash,
          capabilityCount: manifest.toolCount,
          balance,
        },
        learning: {
          agentCount: agents.length,
          totalCalls: agents.reduce((s, a) => s + a.totalCalls, 0),
          agents,
        },
        adaptation: {
          toolsTracked: weights.length,
          healthy: healthy.length,
          penalized: penalized.length,
          topHealthy: healthy.slice(0, 5).map((w) => ({ tool: w.tool, calls: w.calls })),
          problemTools: penalized.map((w) => ({
            tool: w.tool,
            weight: w.weight,
            reason: w.reason,
          })),
        },
        lattice: {
          skillNodes: lattice.nodeCount,
          skillEdges: lattice.edgeCount,
          clusters: Array.from(
            lattice.nodes.reduce((m, n) => {
              m.set(n.parentCluster, (m.get(n.parentCluster) ?? 0) + 1);
              return m;
            }, new Map<string, number>())
          ).map(([cluster, count]) => ({ cluster, count })),
        },
        verification: {
          proofsGenerated: verifierStats.verified,
          proofsOnLedger: verifierStats.submitted ?? 0,
          lastSelfVerifyHash: verifyStats.lastHash,
          selfVerifyPublishes: verifyStats.publishes,
          selfVerifyTicks: verifyStats.ticks,
          auditTopic: config.VERA_COMPLIANCE_AUDIT_TOPIC_ID,
        },
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Self-portrait failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ─── EVM BRIDGE ROUTES ─────────────────────────────────────────────────────

  // Bridge Falcon handshake to EVM chain
  app.post('/api/vera/bridge/evm', async (req: FastifyRequest, reply: FastifyReply) => {
    const { chain, handshake } = req.body as {
      chain: 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base';
      handshake: {
        initiatorAgent: string;
        responderAgent: string;
        falconPublicKey: string;
        falconSignature: string;
      };
    };

    if (!chain || !handshake) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: chain, handshake',
      });
    }

    try {
      const { createEVMBridge } = await import('../bridges/evmBridge.js');
      const { Client } = await import('@hashgraph/sdk');
      
      const hederaClient = Client.forMainnet();
      const bridge = createEVMBridge(chain, hederaClient);
      
      const result = await bridge.bridgeToEVM(handshake as any);
      
      if (!result) {
        return reply.status(500).send({
          success: false,
          error: 'Bridge attestation failed',
        });
      }

      // Log to swarm event logger
      const { swarmEventLogger } = await import('../vera/logging/swarmEventLogger.js');
      swarmEventLogger.log('swarm.bridge', {
        from: handshake.initiatorAgent,
        to: chain,
        data: {
          chain,
          hederaTxHash: result.hederaTxHash,
          evmTxHash: result.evmTxHash,
          fee: result.fee,
          latencyMs: result.latencyMs,
        },
      });

      return reply.status(201).send({
        success: true,
        attestation: result,
      });
    } catch (error) {
      logger.error('EVM Bridge Route', { error: error instanceof Error ? error.message : String(error), chain });
      return reply.status(500).send({
        success: false,
        error: 'Bridge failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get bridge status
  app.get('/api/vera/bridge/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({
        success: true,
        supportedChains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'],
        fees: {
          ethereum: '0.1%',
          polygon: '0.05%',
          arbitrum: '0.05%',
          optimism: '0.05%',
          base: '0.05%',
        },
        status: 'operational',
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Bridge Status Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get bridge status',
      });
    }
  });

  // ─── SUB-AGENT API ─────────────────────────────────────────────────────────

  // Spawn a new sub-agent
  app.post('/api/vera/sub-agents/spawn', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, parentId, role, domain, interval, params } = req.body as {
      id: string;
      parentId: string;
      role: string;
      domain: 'energy' | 'security' | 'defi' | 'carbon';
      interval?: number;
      params?: Record<string, unknown>;
    };

    if (!id || !parentId || !role || !domain) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: id, parentId, role, domain',
      });
    }

    try {
      const { subAgentCoordinator } = await import('../vera/orchestrator/subAgentCoordinator.js');
      const status = await subAgentCoordinator.spawn({
        id,
        parentId,
        role: role as any,
        domain,
        interval,
        params
      });

      return reply.status(201).send({
        success: true,
        subAgent: status,
      });
    } catch (error) {
      logger.error('SubAgent Spawn Route', { error: error instanceof Error ? error.message : String(error), id });
      return reply.status(500).send({
        success: false,
        error: 'Failed to spawn sub-agent',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Kill a sub-agent
  app.delete('/api/vera/sub-agents/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    try {
      const { subAgentCoordinator } = await import('../vera/orchestrator/subAgentCoordinator.js');
      const success = await subAgentCoordinator.kill(id);

      if (!success) {
        return reply.status(404).send({
          success: false,
          error: 'Sub-agent not found',
        });
      }

      return reply.send({
        success: true,
        message: `Sub-agent ${id} terminated`,
      });
    } catch (error) {
      logger.error('SubAgent Kill Route', { error: error instanceof Error ? error.message : String(error), id });
      return reply.status(500).send({
        success: false,
        error: 'Failed to kill sub-agent',
      });
    }
  });

  // Get all sub-agents
  app.get('/api/vera/sub-agents', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { subAgentCoordinator } = await import('../vera/orchestrator/subAgentCoordinator.js');
      const subAgents = subAgentCoordinator.getAllSubAgents();

      return reply.send({
        success: true,
        subAgents,
        count: subAgents.length,
      });
    } catch (error) {
      logger.error('SubAgent List Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to list sub-agents',
      });
    }
  });

  // Get sub-agents by domain
  app.get('/api/vera/sub-agents/domain/:domain', async (req: FastifyRequest, reply: FastifyReply) => {
    const { domain } = req.params as { domain: string };

    try {
      const { subAgentCoordinator } = await import('../vera/orchestrator/subAgentCoordinator.js');
      const subAgents = subAgentCoordinator.getByDomain(domain);

      return reply.send({
        success: true,
        domain,
        subAgents,
        count: subAgents.length,
      });
    } catch (error) {
      logger.error('SubAgent Domain Route', { error: error instanceof Error ? error.message : String(error), domain });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get sub-agents by domain',
      });
    }
  });

  // Get sub-agent health
  app.get('/api/vera/sub-agents/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { subAgentCoordinator } = await import('../vera/orchestrator/subAgentCoordinator.js');
      const health = subAgentCoordinator.getHealth();

      return reply.send({
        success: true,
        health,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('SubAgent Health Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get sub-agent health',
      });
    }
  });

  // ─── HASHSCAN API ───────────────────────────────────────────────────────────

  // Get HashScan status and links
  app.get('/api/vera/hashscan/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getVeraSwarmTopicLink } = await import('../vera/tools/hashscanDeepLink.js');
      const topicLink = getVeraSwarmTopicLink();

      return reply.send({
        success: true,
        network: 'mainnet',
        veraTopicId: topicLink.id,
        topicUrl: topicLink.url,
        hashscanBaseUrl: 'https://hashscan.io/mainnet',
        features: [
          'transaction_lookup',
          'topic_message_history',
          'account_verification',
          'token_details',
          'nft_tracking'
        ],
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('HashScan Status Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get HashScan status',
      });
    }
  });

  // Generate HashScan link for any entity
  app.post('/api/vera/hashscan/link', async (req: FastifyRequest, reply: FastifyReply) => {
    const { entity, id, network, sequenceNumber } = req.body as {
      entity: 'transaction' | 'topic' | 'account' | 'token' | 'nft' | 'contract';
      id: string;
      network?: 'mainnet' | 'testnet';
      sequenceNumber?: number;
    };

    if (!entity || !id) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: entity, id',
      });
    }

    try {
      const { generateHashScanLink } = await import('../vera/tools/hashscanDeepLink.js');
      const link = generateHashScanLink(entity, id, { network, sequenceNumber });

      return reply.send({
        success: true,
        url: link.url,
        entity: link.entity,
        id: link.id,
        network: link.network,
        markdown: `[View on HashScan](${link.url})`,
      });
    } catch (error) {
      logger.error('HashScan Link Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate HashScan link',
      });
    }
  });

  // Get Vera's swarm topic link
  app.get('/api/vera/hashscan/topic', async (req: FastifyRequest, reply: FastifyReply) => {
    const { sequence } = req.query as { sequence?: string };

    try {
      const { getVeraSwarmTopicLink } = await import('../vera/tools/hashscanDeepLink.js');
      const link = getVeraSwarmTopicLink(sequence ? parseInt(sequence, 10) : undefined);

      return reply.send({
        success: true,
        topicId: link.id,
        url: link.url,
        entity: link.entity,
        network: link.network,
        sequenceNumber: sequence ? parseInt(sequence, 10) : undefined,
      });
    } catch (error) {
      logger.error('HashScan Topic Route', { error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({
        success: false,
        error: 'Failed to get topic link',
      });
    }
  });

  // Vera self-lookup for events
  app.get('/api/vera/hashscan/lookup/:eventType', async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventType } = req.params as { eventType: string };
    const { agentId, timestamp } = req.query as { agentId?: string; timestamp?: string };

    if (!['handshake', 'payment', 'bridge', 'consensus'].includes(eventType)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid eventType. Must be: handshake, payment, bridge, or consensus',
      });
    }

    try {
      const { veraSelfLookup } = await import('../vera/tools/hashscanDeepLink.js');
      const result = await veraSelfLookup(
        eventType as 'handshake' | 'payment' | 'bridge' | 'consensus',
        { agentId, timestamp: timestamp ? parseInt(timestamp, 10) : undefined }
      );

      return reply.send({
        success: true,
        eventType,
        topicLink: result.topicLink.url,
        query: result.query,
        veraSays: result.veraSays,
      });
    } catch (error) {
      logger.error('HashScan Lookup Route', { error: error instanceof Error ? error.message : String(error), eventType });
      return reply.status(500).send({
        success: false,
        error: 'Failed to lookup events',
      });
    }
  });

  // ─── Webhooks ───────────────────────────────────────────────────────────

  app.post('/api/webhooks', { schema: { tags: ['Integrations'], summary: 'Register a webhook subscription' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      url: string;
      events: string[];
      secret?: string;
      maxRetries?: number;
    };
    if (!body.url || !body.events || !Array.isArray(body.events)) {
      return reply.status(400).send({ error: 'url and events[] required' });
    }
    const secret = body.secret || crypto.randomUUID();
    const sub = registerSubscription({
      id: crypto.randomUUID(),
      url: body.url,
      events: body.events,
      secret,
      active: true,
      maxRetries: body.maxRetries ?? 5,
    });
    return reply.status(201).send({ id: sub.id, url: sub.url, events: sub.events, secret });
  });

  app.get('/api/webhooks', { schema: { tags: ['Integrations'], summary: 'List webhook subscriptions' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const event = (req.query as { event?: string }).event;
    return reply.send({ subscriptions: listSubscriptions(event) });
  });

  app.get('/api/webhooks/:id', { schema: { tags: ['Integrations'], summary: 'Get webhook subscription' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const sub = getSubscription(id);
    if (!sub) return reply.status(404).send({ error: 'Not found' });
    return reply.send(sub);
  });

  app.delete('/api/webhooks/:id', { schema: { tags: ['Integrations'], summary: 'Delete webhook subscription' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const ok = unregisterSubscription(id);
    return reply.send({ deleted: ok });
  });

  app.get('/api/webhooks/stats', { schema: { tags: ['Integrations'], summary: 'Webhook delivery statistics' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(getWebhookStats());
  });

  app.get('/api/webhooks/deliveries', { schema: { tags: ['Integrations'], summary: 'Pending delivery queue' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ deliveries: getDeliveryQueue() });
  });

  app.get('/api/webhooks/dlq', { schema: { tags: ['Integrations'], summary: 'Dead letter queue' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ dlq: getDeadLetterQueue() });
  });

  app.post('/api/webhooks/dlq/:deliveryId/replay', { schema: { tags: ['Integrations'], summary: 'Replay a dead-letter delivery' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { deliveryId } = req.params as { deliveryId: string };
    const ok = replayDeadLetter(deliveryId);
    return reply.send({ replayed: ok });
  });

  app.post('/api/webhooks/dispatch', { schema: { tags: ['Integrations'], summary: 'Manually dispatch an event' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { event, payload } = req.body as { event: string; payload: Record<string, unknown> };
    if (!event) return reply.status(400).send({ error: 'event required' });
    dispatchEvent(event, payload ?? {});
    return reply.send({ dispatched: true, event, targets: listSubscriptions(event).length });
  });

  // ─── Oracle / Price Feeds ─────────────────────────────────────────────

  app.get('/api/oracle/price/:pair', { schema: { tags: ['Bridge'], summary: 'Get consensus price from Chainlink + Pyth' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { pair } = req.params as { pair: string };
    const { source, pythId } = req.query as { source?: string; pythId?: string };
    try {
      if (source === 'chainlink') {
        const result = await fetchChainlinkPrice(pair);
        return reply.send({ pair, source: 'chainlink', ...result });
      }
      if (source === 'pyth') {
        if (!pythId) return reply.status(400).send({ error: 'pythId required for Pyth source' });
        const result = await fetchPythPrice(pythId);
        return reply.send({ pair, source: 'pyth', ...result });
      }
      if (!pythId) return reply.status(400).send({ error: 'pythId required for consensus' });
      const result = await getConsensusPrice(pair, pythId);
      return reply.send({ pair, source: 'consensus', ...result });
    } catch (error) {
      return reply.status(500).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/oracle/attestation', { schema: { tags: ['Bridge'], summary: 'Publish a Vera attestation to HCS' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      type: 'carbon_score' | 'reputation' | 'compliance' | 'price';
      subject: string;
      value: number;
      confidence?: number;
      metadata?: Record<string, unknown>;
    };
    try {
      const result = await publishAttestation({
        type: body.type,
        subject: body.subject,
        value: body.value,
        confidence: body.confidence ?? 0.9,
        expiresAt: Date.now() + 86400000 * 30,
        metadata: body.metadata,
      });
      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

}
