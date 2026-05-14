import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { getClient } from '../../hedera/tools/client.js';
import { getTokenPrice } from '../../hedera/saucerswap.js';
import { veraOrchestrator } from '../../vera/orchestrator/orchestratorLoop.js';
import { taskPublisher } from '../../vera/orchestrator/taskPublisher.js';
import { escrowController } from '../../vera/orchestrator/escrowController.js';
import { resultVerifier } from '../../vera/orchestrator/resultVerifier.js';
import { enhancedSettlement as x402Settlement } from '../../vera/payments/enhancedX402Settlement.js';
import { getTaskStoreStats, loadAllTasks, loadTask } from '../../vera/orchestrator/taskStore.js';
import { clientPool } from '../../vera/scaling/clientPool.js';
import { rateLimiterRegistry } from '../../vera/scaling/rateLimiter.js';
import { reputationEngine } from '../../vera/marketplace/reputation.js';
import { dynamicPricing } from '../../vera/marketplace/pricing.js';
import { featureFlags } from '../../vera/orchestrator/featureFlags.js';
import { verifiableAIProofKernel } from '../../vera/proofKernel/proofKernel.js';

const SubmitTaskSchema = z.object({
  description: z.string().min(1),
  serviceType: z.string().min(1),
  budget: z.number().positive(),
  requiredConfidence: z.number().min(0).max(1).optional(),
  deadlineMs: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const VerifiableAITaskSchema = z.object({
  description: z.string().min(1),
  serviceType: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
  budgetHbar: z.number().nonnegative().optional(),
  requiredConfidence: z.number().min(0).max(1).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
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
  account_id: z.string().optional(),
  creation_fee: AgentCreationFeeSchema,
  metadata: z.record(z.unknown()).optional(),
});

type AgentCreationFeeQuote = {
  hbar: { amount: number; priceUsd: number; treasuryAccount: string };
  hts: { amount: number; priceUsd: number; tokenId: string; symbol: string; treasuryAccount: string };
  targetUsd: number;
  memoPrefix: string;
  source: string;
  tolerance: number;
  quotedAt: number;
};

type AgentSignatureInput = {
  _sig?: string;
  _ts?: number;
  signature?: string;
  signatureTimestamp?: number;
};

function roundPaymentAmount(value: number): number {
  return Math.max(0.000001, Math.ceil(value * 1_000_000) / 1_000_000);
}

function normalizeMirrorTransactionId(transactionId: string): string {
  const trimmed = transactionId.trim();
  const hashpackStyle = trimmed.match(/^(0\.0\.\d+)@(\d+)\.(\d+)$/);
  if (hashpackStyle) return `${hashpackStyle[1]}-${hashpackStyle[2]}-${hashpackStyle[3]}`;
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
    logger.warn('VeraMarketplaceRoutes', {
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
    logger.warn('VeraMarketplaceRoutes', {
      message: 'Falling back to static HBAR price for agent creation fee',
      error: error instanceof Error ? error.message : String(error),
    });
    return { priceUsd: config.CREDIT_USD_PER_HBAR, source: 'static-hbar-fallback' };
  }
}

async function fetchSaucerSwapTokenUsd(tokenId: string): Promise<{ priceUsd: number; source: string }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  headers['x-api-key'] = config.SAUCERSWAP_API_KEY || '875e1017-87b8-4b12-8301-6aa1f1aa073b';
  const response = await fetch(`https://api.saucerswap.finance/tokens/${encodeURIComponent(tokenId)}`, { headers });
  if (!response.ok) throw new Error(`SaucerSwap HTTP ${response.status}`);
  const payload = await response.json() as { priceUsd?: number; id?: string };
  if (payload.id && payload.id !== tokenId) throw new Error(`SaucerSwap returned ${payload.id}`);
  if (!payload.priceUsd || payload.priceUsd <= 0) throw new Error('SaucerSwap token price missing');
  return { priceUsd: payload.priceUsd, source: 'saucerswap-token' };
}

async function fetchAgentFeeTokenUsd(): Promise<{ priceUsd: number; source: string }> {
  try {
    return await fetchSaucerSwapTokenUsd(config.VERA_AGENT_CREATION_FEE_TOKEN_ID);
  } catch (saucerError) {
    logger.warn('VeraMarketplaceRoutes', {
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
    logger.warn('VeraMarketplaceRoutes', {
      message: 'Falling back to static HTS token price for agent creation fee',
      tokenId: config.VERA_AGENT_CREATION_FEE_TOKEN_ID,
      error: error instanceof Error ? error.message : String(error),
    });
    return { priceUsd: config.VERA_AGENT_CREATION_FEE_TOKEN_USD_FALLBACK, source: 'static-token-fallback' };
  }
}

async function getAgentCreationFeeConfig(): Promise<AgentCreationFeeQuote> {
  const [hbarPrice, tokenPrice] = await Promise.all([fetchHbarUsd(), fetchAgentFeeTokenUsd()]);
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

  if (validation.error) return { verified: false, error: validation.error, transactionId, hashscanUrl };

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
  if (!tx) return { verified: false, error: 'Transaction not found on Mirror Node yet', transactionId, hashscanUrl };
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

function agentSignaturesRequired(): boolean {
  return config.VERA_REQUIRE_AGENT_SIGNATURE === 'true';
}

function getAgentSignatureEnvelope(body: AgentSignatureInput): { _sig?: string; _ts?: number } {
  return {
    _sig: body._sig ?? body.signature,
    _ts: body._ts ?? body.signatureTimestamp,
  };
}

function getMissingSignatureFields(body: AgentSignatureInput): string[] {
  const envelope = getAgentSignatureEnvelope(body);
  const missing: string[] = [];
  if (!envelope._sig) missing.push('_sig');
  if (!envelope._ts) missing.push('_ts');
  return missing;
}

function rejectIfHcsWriteBlocked(reply: FastifyReply): boolean {
  const validation = featureFlags.validateOperation({ type: 'hcs_write' });
  if (!validation.allowed) {
    reply.status(403).send({ error: validation.reason ?? 'HCS write blocked by feature flags' });
    return true;
  }
  return false;
}

export async function registerVeraMarketplaceRoutes(app: FastifyInstance) {
  app.get('/api/vera/verifiable-ai/agents', {
    schema: { tags: ['Marketplace'], summary: 'List first-party Vera agents for verifiable Hedera AI' },
  }, async (_req, reply) => {
    return reply.send({
      category: 'verifiable-hedera-ai',
      coldStartPolicy: 'first_party_agents_before_open_marketplace_supply',
      count: verifiableAIProofKernel.listFirstPartyAgents().length,
      agents: verifiableAIProofKernel.listFirstPartyAgents(),
    });
  });

  app.get('/api/vera/verifiable-ai/runs', {
    schema: { tags: ['Marketplace'], summary: 'List verifiable AI proof runs' },
  }, async (_req, reply) => {
    const runs = verifiableAIProofKernel.listRuns();
    return reply.send({ count: runs.length, runs });
  });

  app.get('/api/vera/verifiable-ai/runs/:runId', {
    schema: { tags: ['Marketplace'], summary: 'Get a verifiable AI proof run' },
  }, async (req: FastifyRequest, reply) => {
    const { runId } = req.params as { runId: string };
    const run = verifiableAIProofKernel.getRun(runId);
    if (!run) return reply.status(404).send({ error: 'Proof run not found' });
    return reply.send(run);
  });

  app.post('/api/vera/verifiable-ai/tasks', {
    schema: { tags: ['Marketplace'], summary: 'Run a first-party verifiable Hedera AI task' },
  }, async (req: FastifyRequest, reply) => {
    const parsed = VerifiableAITaskSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });

    try {
      const run = await verifiableAIProofKernel.runTask({
        description: parsed.data.description,
        serviceType: parsed.data.serviceType,
        payload: parsed.data.payload,
        budgetHbar: parsed.data.budgetHbar,
        requiredConfidence: parsed.data.requiredConfidence,
        priority: parsed.data.priority,
        metadata: parsed.data.metadata,
      });
      return reply.status(201).send(run);
    } catch (error) {
      logger.error('VeraMarketplaceRoutes', {
        message: 'Verifiable AI proof task failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return reply.status(500).send({ error: 'Verifiable AI proof task failed' });
    }
  });

  app.get('/api/vera/stats', { schema: { tags: ['Marketplace'], summary: 'Production marketplace statistics' } }, async (_req, reply) => {
    try {
      return reply.send({
        orchestrator: veraOrchestrator.getStats(),
        persistence: getTaskStoreStats(),
        clientPool: clientPool.getStats(),
        rateLimiters: rateLimiterRegistry.getStats(),
      });
    } catch {
      return reply.status(500).send({ error: 'Failed to retrieve stats' });
    }
  });

  app.get('/api/vera/tasks', { schema: { tags: ['Marketplace'], summary: 'List production marketplace tasks' } }, async (_req, reply) => {
    try {
      const tasks = loadAllTasks();
      return reply.send({ count: tasks.length, tasks });
    } catch {
      return reply.status(500).send({ error: 'Failed to load tasks' });
    }
  });

  app.get('/api/vera/tasks/:taskId', { schema: { tags: ['Marketplace'], summary: 'Get task proof-loop detail' } }, async (req: FastifyRequest, reply) => {
    const { taskId } = req.params as { taskId: string };
    const task = loadTask(taskId) ?? taskPublisher.getTask(taskId);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    return reply.send({
      task,
      escrow: escrowController.getEscrowByTask(taskId),
      settlement: x402Settlement.getSettlementByTask(taskId),
      verification: resultVerifier.getReport(taskId),
    });
  });

  app.post('/api/vera/tasks', { schema: { tags: ['Marketplace'], summary: 'Submit a new production marketplace task' } }, async (req: FastifyRequest, reply) => {
    const parsed = SubmitTaskSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    if (!veraOrchestrator.isRunning()) return reply.status(503).send({ error: 'Orchestrator not running' });
    try {
      const { description, serviceType, budget, requiredConfidence, deadlineMs, metadata } = parsed.data;
      const record = await veraOrchestrator.submitTask(description, serviceType, budget, { requiredConfidence, deadlineMs, metadata });
      logger.info('VeraMarketplaceRoutes', { message: 'Task submitted via API', taskId: record.intent.taskId });
      return reply.status(201).send({ taskId: record.intent.taskId, state: record.state, record });
    } catch (error) {
      logger.error('VeraMarketplaceRoutes', { message: 'Failed to submit task', error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to submit task' });
    }
  });

  app.get('/api/vera/agents', { schema: { tags: ['Marketplace'], summary: 'List registered marketplace agents' } }, async (_req, reply) => {
    const watcher = veraOrchestrator.getRegistryWatcher();
    if (!watcher) return reply.status(503).send({ error: 'Registry watcher not initialized' });
    const agents = watcher.getAgents();
    const stats = watcher.getStats();
    return reply.send({ count: agents.length, activeAgents: stats.activeAgents, staleAgents: stats.staleAgents, agents });
  });

  app.get('/api/vera/escrow', { schema: { tags: ['Marketplace'], summary: 'Escrow statistics' } }, async (_req, reply) => {
    return reply.send(escrowController.getStats());
  });

  app.get('/api/vera/settlements', { schema: { tags: ['Marketplace'], summary: 'Settlement statistics' } }, async (_req, reply) => {
    return reply.send(x402Settlement.getStats());
  });

  app.get('/api/vera/verification', { schema: { tags: ['Marketplace'], summary: 'Result verification statistics' } }, async (_req, reply) => {
    return reply.send(resultVerifier.getStats());
  });

  app.get('/api/vera/agents/creation-fee', { schema: { tags: ['Marketplace'], summary: 'Agent creation fee quote' } }, async (_req, reply) => {
    return reply.send(await getAgentCreationFeeConfig());
  });

  app.post('/api/vera/agents/creation-fee/verify', { schema: { tags: ['Marketplace'], summary: 'Verify an agent creation fee payment' } }, async (req: FastifyRequest, reply) => {
    const parsed = AgentCreationFeeVerifySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    try {
      const result = await verifyAgentCreationFeePayment(parsed.data.creation_fee);
      return reply.status(result.verified ? 200 : 402).send(result);
    } catch (error) {
      logger.error('VeraMarketplaceRoutes', { message: 'Creation fee verification failed', error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Creation fee verification failed' });
    }
  });

  app.post('/api/vera/agents/register', { schema: { tags: ['Marketplace'], summary: 'Register a paid marketplace agent' } }, async (req: FastifyRequest, reply) => {
    const parsed = AgentRegistrationSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    const topicId = config.VERA_REGISTRY_TOPIC_ID;
    if (!topicId) return reply.status(503).send({ error: 'Registry topic not configured' });
    if (rejectIfHcsWriteBlocked(reply)) return;

    try {
      const registration = parsed.data;
      if (registration.account_id && registration.creation_fee.payer_account && registration.account_id !== registration.creation_fee.payer_account) {
        return reply.status(401).send({ error: `Authorized wallet ${registration.creation_fee.payer_account} does not match agent account ${registration.account_id}` });
      }

      const validation = await validateAgentCreationFee(registration.creation_fee);
      if (validation.error) return reply.status(402).send({ error: validation.error, creationFee: validation.fee });
      const paymentVerification = await verifyAgentCreationFeePayment(registration.creation_fee);
      if (!paymentVerification.verified) {
        return reply.status(402).send({
          error: paymentVerification.error || 'Creation fee payment has not been verified',
          paymentVerification,
          creationFee: validation.fee,
        });
      }

      const message = JSON.stringify({
        type: 'agent_register',
        ...registration,
        creation_fee_required: validation.fee,
        creation_fee_verified: paymentVerification,
        updated_at: Date.now(),
      });

      if (!featureFlags.shouldWriteToHCS()) {
        return reply.status(202).send({ success: true, dryRun: true, agentId: registration.agent_id, service: registration.service });
      }

      const client = getClient();
      const resp = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(client);
      const receipt = await resp.getReceipt(client);
      const watcher = veraOrchestrator.getRegistryWatcher();
      const agentsForService = watcher?.findAgentsByService(registration.service, true) ?? [];
      dynamicPricing.updateSupply(registration.service, agentsForService.length + 1);
      return reply.status(201).send({
        success: true,
        agentId: registration.agent_id,
        service: registration.service,
        creationFee: registration.creation_fee,
        signatureRequired: agentSignaturesRequired(),
        sequenceNumber: receipt.topicSequenceNumber?.toString(),
      });
    } catch (error) {
      logger.error('VeraMarketplaceRoutes', { message: 'Failed to register agent', error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to register agent' });
    }
  });

  app.get('/api/vera/reputation', { schema: { tags: ['Marketplace'], summary: 'Marketplace reputation leaderboard' } }, async (_req, reply) => {
    return reply.send({
      stats: reputationEngine.getStats(),
      topAgents: reputationEngine.getTopAgents(10),
      allReputations: reputationEngine.getAllReputations(),
    });
  });

  app.get('/api/vera/reputation/:agentId', { schema: { tags: ['Marketplace'], summary: 'Get agent reputation' } }, async (req: FastifyRequest, reply) => {
    const { agentId } = req.params as { agentId: string };
    return reply.send(reputationEngine.getReputation(agentId));
  });

  app.get('/api/vera/pricing', { schema: { tags: ['Marketplace'], summary: 'Dynamic marketplace pricing' } }, async (_req, reply) => {
    return reply.send({ stats: dynamicPricing.getStats(), services: dynamicPricing.getAllPricing() });
  });

  app.get('/api/vera/pricing/:serviceType', { schema: { tags: ['Marketplace'], summary: 'Dynamic pricing for a service type' } }, async (req: FastifyRequest, reply) => {
    const { serviceType } = req.params as { serviceType: string };
    return reply.send(dynamicPricing.getPricing(serviceType));
  });

  app.post('/api/vera/tasks/:taskId/bid', { schema: { tags: ['Marketplace'], summary: 'Submit a signed agent bid' } }, async (req: FastifyRequest, reply) => {
    const { taskId } = req.params as { taskId: string };
    const body = req.body as { agentId: string; fee: number; confidence: number; estimatedDurationMs?: number; timestamp?: number } & AgentSignatureInput;
    if (!body.agentId || typeof body.fee !== 'number') return reply.status(400).send({ error: 'Missing agentId or fee' });
    const missingSignatureFields = getMissingSignatureFields(body);
    if (agentSignaturesRequired() && missingSignatureFields.length > 0) {
      return reply.status(401).send({ error: 'Signed agent submission required', missing: missingSignatureFields });
    }
    const resultTopicId = config.VERA_RESULT_TOPIC_ID;
    if (!resultTopicId) return reply.status(503).send({ error: 'Result topic not configured' });
    if (rejectIfHcsWriteBlocked(reply)) return;

    const bid = {
      type: 'bid',
      taskId,
      agentId: body.agentId,
      fee: body.fee,
      confidence: body.confidence ?? 0.5,
      estimatedDurationMs: body.estimatedDurationMs ?? 60000,
      timestamp: body.timestamp ?? Date.now(),
      ...getAgentSignatureEnvelope(body),
    };

    if (!featureFlags.shouldWriteToHCS()) return reply.status(202).send({ success: true, dryRun: true, bid });
    try {
      const client = getClient();
      await new TopicMessageSubmitTransaction().setTopicId(resultTopicId).setMessage(JSON.stringify(bid)).execute(client);
      return reply.status(201).send({ success: true, bid });
    } catch (error) {
      logger.error('VeraMarketplaceRoutes', { message: 'Failed to submit bid', taskId, error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to submit bid' });
    }
  });

  app.post('/api/vera/tasks/:taskId/result', { schema: { tags: ['Marketplace'], summary: 'Submit a signed agent result' } }, async (req: FastifyRequest, reply) => {
    const { taskId } = req.params as { taskId: string };
    const body = req.body as { agentId: string; result: unknown; confidence: number; proofHash?: string; durationMs?: number; timestamp?: number } & AgentSignatureInput;
    if (!body.agentId || body.result === undefined) return reply.status(400).send({ error: 'Missing agentId or result' });
    const missingSignatureFields = getMissingSignatureFields(body);
    if (agentSignaturesRequired() && missingSignatureFields.length > 0) {
      return reply.status(401).send({ error: 'Signed agent submission required', missing: missingSignatureFields });
    }
    const task = taskPublisher.getTask(taskId) ?? loadTask(taskId);
    if (task?.winnerId && body.agentId !== task.winnerId) {
      return reply.status(403).send({ error: 'Only the winning agent may submit a result', winnerId: task.winnerId });
    }
    const resultTopicId = config.VERA_RESULT_TOPIC_ID;
    if (!resultTopicId) return reply.status(503).send({ error: 'Result topic not configured' });
    if (rejectIfHcsWriteBlocked(reply)) return;

    const result = {
      type: 'result',
      taskId,
      agentId: body.agentId,
      result: body.result,
      confidence: body.confidence ?? 0.5,
      proofHash: body.proofHash,
      durationMs: body.durationMs,
      timestamp: body.timestamp ?? Date.now(),
      ...getAgentSignatureEnvelope(body),
    };

    if (!featureFlags.shouldWriteToHCS()) return reply.status(202).send({ success: true, dryRun: true, result });
    try {
      const client = getClient();
      await new TopicMessageSubmitTransaction().setTopicId(resultTopicId).setMessage(JSON.stringify(result)).execute(client);
      return reply.status(201).send({ success: true, result });
    } catch (error) {
      logger.error('VeraMarketplaceRoutes', { message: 'Failed to submit result', taskId, error: error instanceof Error ? error.message : String(error) });
      return reply.status(500).send({ error: 'Failed to submit result' });
    }
  });
}
