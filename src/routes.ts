import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateApiKey, createApiKey, createCustomer } from './auth.js';
import { config } from './config.js';
import { db, getOrCreateBalance, nowIso } from './db.js';
import { placeHold, captureAndRelease, releaseHold } from './ledger.js';
import { canonicalJson, sha256Base64, signDetachedBase64 } from './crypto.js';
import { submitReceiptMessage } from './hedera/hcs.js';
import { createProvider } from './llm/realProvider.js';
import { estimateTokensFromText, type ChatMessage } from './llm/provider.js';
import { runAgentStream, type ChatMessage as AgentChatMessage } from './agent/runner.js';
import { v4 as uuidv4 } from 'uuid';
import { getPendingTx, removePendingTx } from './hedera/txApproval.js';
import {
  transferHbar, sendHcsMessage, createHtsToken, mintHtsToken, burnHtsToken,
  transferHtsToken, associateHtsToken, createHederaAccount,
  createNftCollection, mintNft, transferNft,
} from './hedera/hederaTxTools.js';
import {
  swapHbarForToken, swapTokenForHbar, addLiquidityHbarToken, removeLiquidityHbarToken,
} from './hedera/saucerswap.js';
import { getAccountBalance } from './hedera/mirrorApi.js';
import wallet from './routes/wallet.js';
import { optimizationRoutes } from './routes/optimization.js';
import { registerCompetitiveRoutes } from './routes/competitive.js';
import { registerEnhancedRoutes } from './routes/enhanced.js';
import { registerSuperintelligenceRoutes } from './routes/superintelligence.js';
import { registerQVXIntelligenceRoutes } from './routes/qvx-intelligence.js';
import { registerQuantumDuetRoutes } from './routes/qvx-quantum-duet.js';
import { reasoningRoutes } from './routes/reasoning.js';
import { registerAgentLabRoutes } from './routes/agentLab.js';
import { registerHBARAgentRoutes } from './routes/hbarAgents.js';
import { registerVeraRoutes } from './routes/vera.js';

const provider = createProvider();

function requireAuth(req: FastifyRequest) {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== 'string') return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return authenticateApiKey(m[1].trim());
}

const ChatCompletionsSchema = z.object({
  model: z.string().default('vera-mock'),
  messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.string() })),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional()
});

export async function registerRoutes(app: FastifyInstance) {
  // Register optimization routes
  await optimizationRoutes(app);
  
  // Register competitive intelligence routes
  registerCompetitiveRoutes(app);
  
  // Register enhanced capabilities routes
  registerEnhancedRoutes(app);
  
  // Register superintelligence routes
  registerSuperintelligenceRoutes(app);
  
  // Register QVX intelligence routes
  registerQVXIntelligenceRoutes(app);
  
  // Register QVX Quantum Duet routes
  registerQuantumDuetRoutes(app);

  // Register Reasoning routes
  await reasoningRoutes(app);

  // Register Agent Lab routes (HCS-10, sub-agents, tools)
  await registerAgentLabRoutes(app);

  // Register HBAR Agent System routes (22 tools, 6 agents, 3 workflows)
  await registerHBARAgentRoutes(app);

  // Register Vera orchestrator routes (tasks, agents, escrow, settlements)
  // Core VNX product surface: the flagship marketplace/orchestrator loop.
  // Keep this route group stable and focused on production-grade task, bid,
  // verification, settlement, reputation, and proof engine behavior.
  await registerVeraRoutes(app);

  // ── VNX Route Aliases ─────────────────────────────────────────────────────
  // Public-facing VNX API surface aliases for core marketplace/orchestrator routes.
  // These mirror the /api/vera/* endpoints but use /api/vnx/* for public branding.
  // Legacy /api/vera/* routes remain available for backward compatibility.

  // Health and system state aliases
  app.get('/api/vnx/health', { schema: { tags: ['Health'], summary: 'VNX orchestrator health' } }, async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/health');
    const data = await response.json();
    return reply.send(data);
  });

  app.get('/api/vnx/rig/state', async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/rig/state');
    const data = await response.json();
    return reply.send(data);
  });

  app.get('/api/vnx/harmony', { schema: { tags: ['Health'], summary: 'Unified rig, lattice, enterprise, and orchestrator state' } }, async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/harmony');
    const data = await response.json();
    return reply.send(data);
  });

  // Marketplace core aliases
  app.get('/api/vnx/tasks', async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/tasks');
    const data = await response.json();
    return reply.send(data);
  });

  app.get('/api/vnx/stats', async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/stats');
    const data = await response.json();
    return reply.send(data);
  });

  app.get('/api/vnx/reputation', async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/reputation');
    const data = await response.json();
    return reply.send(data);
  });

  app.get('/api/vnx/workflows/evidence', async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/workflows/evidence');
    const data = await response.json();
    return reply.send(data);
  });

  // Lattice and visualization aliases
  app.get('/api/vnx/lattice/stats', async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/lattice/stats');
    const data = await response.json();
    return reply.send(data);
  });

  app.get('/api/vnx/lattice/state', async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/lattice/state');
    const data = await response.json();
    return reply.send(data);
  });

  // HCS and brain aliases
  app.get('/api/vnx/hcs/batching-stats', async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/hcs/batching-stats');
    const data = await response.json();
    return reply.send(data);
  });

  app.get('/api/vnx/brain/stats', async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/brain/stats');
    const data = await response.json();
    return reply.send(data);
  });

  app.post('/api/vnx/brain/query', async (req, reply) => {
    const response = await fetch('http://localhost:8080/api/vera/brain/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    return reply.send(data);
  });

  // Register Jade routes (Starlit-Jade consolidation)
  const { registerJadeRoutes } = await import('./jade/orchestrator.js');
  await registerJadeRoutes(app);
  const { registerMessagingRoutes } = await import('./jade/messaging.js');
  await registerMessagingRoutes(app);
  const { registerToolDelegationRoutes } = await import('./jade/toolDelegator.js');
  await registerToolDelegationRoutes(app);
  
  // Serve wallet dashboard
  app.get('/public/wallet.html', async (req, reply) => {
    const fs = await import('fs/promises');
    const path = '/home/vera-live-0-1/hedera-llm-api/public/wallet.html';
    try {
      const content = await fs.readFile(path, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('Wallet dashboard not found');
    }
  });

  // Serve competitive intelligence dashboard
  app.get('/public/competitive-dashboard.html', async (req, reply) => {
    const fs = await import('fs/promises');
    const path = '/home/vera-live-0-1/hedera-llm-api/public/competitive-dashboard.html';
    try {
      const content = await fs.readFile(path, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('Competitive dashboard not found');
    }
  });

  // Serve superintelligence dashboard
  app.get('/public/superintelligence-dashboard.html', async (req, reply) => {
    const fs = await import('fs/promises');
    const path = '/home/vera-live-0-1/hedera-llm-api/public/superintelligence-dashboard.html';
    try {
      const content = await fs.readFile(path, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('Superintelligence dashboard not found');
    }
  });

  // Serve QVX intelligence dashboard
  app.get('/public/qvx-intelligence-dashboard.html', async (req, reply) => {
    const fs = await import('fs/promises');
    const path = '/home/vera-live-0-1/hedera-llm-api/public/qvx-intelligence-dashboard.html';
    try {
      const content = await fs.readFile(path, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('QVX intelligence dashboard not found');
    }
  });

  // Serve QVX Quantum Duet dashboard
  app.get('/public/qvx-quantum-duet-dashboard.html', async (req, reply) => {
    const fs = await import('fs/promises');
    const path = '/home/vera-live-0-1/hedera-llm-api/public/qvx-quantum-duet-dashboard.html';
    try {
      const content = await fs.readFile(path, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('QVX Quantum Duet dashboard not found');
    }
  });

  // Serve Vera competitive dashboard
  app.get('/public/vera-competitive-dashboard.html', async (req, reply) => {
    const fs = await import('fs/promises');
    const path = '/home/vera-live-0-1/hedera-llm-api/public/vera-competitive-dashboard.html';
    try {
      const content = await fs.readFile(path, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('Vera competitive dashboard not found');
    }
  });

  // Serve Vera IQ dashboard
  app.get('/public/vera-iq-dashboard.html', async (req, reply) => {
    const fs = await import('fs/promises');
    const path = '/home/vera-live-0-1/hedera-llm-api/public/vera-iq-dashboard.html';
    try {
      const content = await fs.readFile(path, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('Vera IQ dashboard not found');
    }
  });

  // Serve Vera Headquarters app
  app.get('/hq', async (_req, reply) => {
    const fs = await import('fs/promises');
    const { join } = await import('path');
    const filePath = join(process.cwd(), 'public', 'vera-hq.html');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('Vera headquarters not found');
    }
  });

  app.get('/headquarters', async (_req, reply) => {
    const fs = await import('fs/promises');
    const { join } = await import('path');
    const filePath = join(process.cwd(), 'public', 'vera-hq.html');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('Vera headquarters not found');
    }
  });

  app.get('/vera/proof', async (_req, reply) => {
    const fs = await import('fs/promises');
    const { join } = await import('path');
    const filePath = join(process.cwd(), 'public', 'vera-proof.html');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('Vera proof dashboard not found');
    }
  });

  app.get('/forge', async (_req, reply) => {
    const fs = await import('fs/promises');
    const { join } = await import('path');
    const filePath = join(process.cwd(), 'public', 'vnx-lm.html');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('VNX-LM forge not found');
    }
  });

  app.get('/vnx-lm', async (_req, reply) => {
    const fs = await import('fs/promises');
    const { join } = await import('path');
    const filePath = join(process.cwd(), 'public', 'vnx-lm.html');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      reply.type('text/html').send(content);
    } catch {
      reply.code(404).send('VNX-LM forge not found');
    }
  });

  app.get('/api/vnx/swarm/models', async (_req, reply) => {
    try {
      const { listVnxSwarmModels } = await import('./vnx/swarmPromptContext.js');
      const models = await listVnxSwarmModels();
      return reply.send({ ok: true, models });
    } catch (error) {
      const { VNX_SWARM_MODELS } = await import('./vnx/swarmPromptContext.js');
      return reply.send({
        ok: false,
        models: VNX_SWARM_MODELS.map((model) => ({ ...model, available: false, size: null })),
        error: error instanceof Error ? error.message : 'Swarm directory not found',
      });
    }
  });

  app.post('/api/vnx/publish-proof', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { hcsReadySummary?: object; modelName?: string };
    if (!body.hcsReadySummary || typeof body.hcsReadySummary !== 'object') {
      return reply.status(400).send({ ok: false, error: 'hcsReadySummary object is required' });
    }

    try {
      const { publishVnxProof } = await import('./vnx/proofPublisher.js');
      const result = await publishVnxProof(body.hcsReadySummary);
      return reply.send({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not configured')) {
        return reply.status(503).send({ ok: false, error: message });
      }
      return reply.status(500).send({ ok: false, error: message });
    }
  });

  app.post('/api/vnx/emit', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { eventType?: string; payload?: Record<string, unknown> };
    if (!body.eventType || typeof body.eventType !== 'string') {
      return reply.status(400).send({ ok: false, error: 'eventType string is required' });
    }
    if (!body.payload || typeof body.payload !== 'object') {
      return reply.status(400).send({ ok: false, error: 'payload object is required' });
    }

    try {
      const { emitVnxSignal } = await import('./vnx/qvxBridge.js');
      const result = await emitVnxSignal(body.eventType as any, body.payload);
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ ok: false, error: message });
    }
  });

  app.get('/health', { schema: { tags: ['Health'] } }, async () => ({
    ok: true,
    name: config.AI_NAME,
    network: config.HEDERA_NETWORK,
    modelProvider: config.MODEL_PROVIDER,
    defaultModel: config.MODEL_PROVIDER === 'qvx-direct' ? `qvx-direct@${config.QVX_INFER_URL}` : config.DEFAULT_CHAT_MODEL,
    imageProvider: config.IMAGE_PROVIDER,
    videoProvider: config.VIDEO_PROVIDER,
    qvxConfigured: !!config.QVX_NODE_URL,
    ts: new Date().toISOString(),
  }));

  app.post('/v1/chat/agent', { schema: { tags: ['AI'], summary: 'Sovereign chat via Vera Oasis' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      messages?: AgentChatMessage[];
      model?: string;
      enable_tools?: boolean;
      stream?: boolean;
      planner_mode?: boolean;
    };

    if (!body.messages || !Array.isArray(body.messages)) {
      return reply.status(400).send({ error: { message: '"messages" array is required' } });
    }

    // Get the last user message for Vera Oasis
    const lastUserMessage = body.messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
      return reply.status(400).send({ error: { message: 'No user message found' } });
    }

    try {
      // Use Vera Oasis for sovereign chat
      const { oasisChat } = await import('./vera/chat/veraOasisChatIntegration.js');
      const result = await oasisChat.processMessage(
        'default-session',
        'anonymous',
        lastUserMessage.content as string
      );

      const doStream = body.stream !== false;
      const veraContent = result.message?.content || 'I processed your request.';

      if (doStream) {
        reply.hijack();
        const raw = reply.raw;
        raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        // Stream the response as a single text event
        raw.write(`data: ${JSON.stringify({ type: 'text', content: veraContent })}\n\n`);
        raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        raw.end();
      } else {
        return reply.send({
          response: veraContent,
          events: [{ type: 'text', content: veraContent }],
          sovereign: result.sovereign,
          provider: result.provider,
          model: result.model,
        });
      }
    } catch (err) {
      return reply.status(500).send({
        error: { message: err instanceof Error ? err.message : String(err) }
      });
    }
  });

  // ── Transaction approval ────────────────────────────────────────────────
  app.post('/v1/tx/approve/:txId', { schema: { tags: ['Hedera'], summary: 'Approve a pending Hedera transaction' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { txId } = req.params as { txId: string };
    const pending = getPendingTx(txId);
    if (!pending) return reply.status(404).send({ error: { message: 'Transaction not found or expired (5 min TTL)' } });

    removePendingTx(txId);
    try {
      let result: unknown;
      const { tool, args } = pending;

      if (tool === 'hedera_transfer_hbar') {
        result = await transferHbar({ toAccountId: args['to_account_id'] as string, amountHbar: args['amount_hbar'] as number, memo: args['memo'] as string | undefined });
      } else if (tool === 'hedera_mint_token') {
        result = await mintHtsToken({ tokenId: args['token_id'] as string, amount: args['amount'] as number });
      } else if (tool === 'hedera_burn_token') {
        result = await burnHtsToken({ tokenId: args['token_id'] as string, amount: args['amount'] as number });
      } else if (tool === 'hedera_transfer_token') {
        result = await transferHtsToken({ tokenId: args['token_id'] as string, toAccountId: args['to_account_id'] as string, amount: args['amount'] as number, memo: args['memo'] as string | undefined });
      } else if (tool === 'hedera_associate_token') {
        result = await associateHtsToken({ tokenId: args['token_id'] as string, accountId: args['account_id'] as string | undefined });
      } else if (tool === 'hedera_create_token') {
        result = await createHtsToken({ name: args['name'] as string, symbol: args['symbol'] as string, decimals: args['decimals'] as number | undefined, initialSupply: args['initial_supply'] as number | undefined, maxSupply: args['max_supply'] as number | undefined, memo: args['memo'] as string | undefined });
      } else if (tool === 'hedera_create_nft_collection') {
        result = await createNftCollection({ name: args['name'] as string, symbol: args['symbol'] as string, maxSupply: args['max_supply'] as number | undefined, memo: args['memo'] as string | undefined });
      } else if (tool === 'hedera_mint_nft') {
        result = await mintNft({ tokenId: args['token_id'] as string, metadata: args['metadata'] as string });
      } else if (tool === 'hedera_transfer_nft') {
        result = await transferNft({ tokenId: args['token_id'] as string, serialNumber: args['serial_number'] as number, toAccountId: args['to_account_id'] as string });
      } else if (tool === 'hedera_create_account') {
        result = await createHederaAccount({ initialHbar: args['initial_hbar'] as number | undefined, memo: args['memo'] as string | undefined });
      } else if (tool === 'hedera_hcs_send_message') {
        result = await sendHcsMessage({ topicId: args['topic_id'] as string, message: args['message'] as string });
      } else if (tool === 'saucerswap_swap_hbar_for_token') {
        result = await swapHbarForToken({ tokenId: args['token_id'] as string, hbarAmount: args['hbar_amount'] as number, minTokenOut: args['min_token_out'] as number, slippage: args['slippage'] as number | undefined });
      } else if (tool === 'saucerswap_swap_token_for_hbar') {
        result = await swapTokenForHbar({ tokenId: args['token_id'] as string, tokenAmount: args['token_amount'] as number, minHbarOut: args['min_hbar_out'] as number, slippage: args['slippage'] as number | undefined });
      } else if (tool === 'saucerswap_add_liquidity') {
        result = await addLiquidityHbarToken({ tokenId: args['token_id'] as string, tokenAmount: args['token_amount'] as number, hbarAmount: args['hbar_amount'] as number, slippage: args['slippage'] as number | undefined });
      } else if (tool === 'saucerswap_remove_liquidity') {
        result = await removeLiquidityHbarToken({ tokenId: args['token_id'] as string, lpAmount: args['lp_amount'] as number, minToken: args['min_token'] as number, minHbar: args['min_hbar'] as number, slippage: args['slippage'] as number | undefined });
      } else {
        return reply.status(400).send({ error: { message: `Unsupported tool for approval: ${tool}` } });
      }

      return reply.send({ ok: true, txId, tool, result });
    } catch (err) {
      return reply.status(500).send({ error: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  app.delete('/v1/tx/reject/:txId', { schema: { tags: ['Hedera'], summary: 'Reject a pending Hedera transaction' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { txId } = req.params as { txId: string };
    const removed = removePendingTx(txId);
    return reply.send({ ok: removed, txId });
  });

  // ── Vera wallet ──────────────────────────────────────────────────────────
  app.get('/v1/vera/info', { schema: { tags: ['Payments'], summary: 'Get Vera wallet info' } }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const accountId = config.VERA_WALLET_ACCOUNT_ID;
    if (!accountId) return reply.send({ configured: false });
    try {
      const bal = await getAccountBalance(accountId);
      return reply.send({ configured: true, accountId, balance: bal });
    } catch {
      return reply.send({ configured: true, accountId, balance: null });
    }
  });

  app.post('/v1/vera/fund', { schema: { tags: ['Payments'], summary: 'Fund Vera wallet with HBAR' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { amount_hbar?: number };
    const amount = typeof body?.amount_hbar === 'number' ? body.amount_hbar : 5;
    if (amount <= 0 || amount > 1000) return reply.status(400).send({ error: { message: 'amount_hbar must be 1–1000' } });

    if (!config.VERA_WALLET_ACCOUNT_ID) {
      return reply.status(400).send({ error: { message: 'VERA_WALLET_ACCOUNT_ID not set. Run npm run create:vera-wallet first.' } });
    }
    if (!config.HEDERA_OPERATOR_ACCOUNT_ID) {
      return reply.status(400).send({ error: { message: 'HEDERA_OPERATOR_ACCOUNT_ID not configured.' } });
    }

    try {
      const result = await transferHbar({ toAccountId: config.VERA_WALLET_ACCOUNT_ID, amountHbar: amount, memo: 'Fund Vera wallet' });
      return reply.send({ ok: true, amount_hbar: amount, ...result });
    } catch (err) {
      return reply.status(500).send({ error: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  app.post('/v1/admin/bootstrap', { schema: { tags: ['Health'], summary: 'Bootstrap a new customer and API key' } }, async () => {
    const customerId = createCustomer();
    const { apiKey } = createApiKey(customerId);
    return { customerId, apiKey, treasuryAccountId: config.TREASURY_ACCOUNT_ID ?? null, memo: `vera:${customerId}` };
  });

  app.get('/v1/balance', { schema: { tags: ['Payments'], summary: 'Get customer balance' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = requireAuth(req);
    if (!auth) return reply.status(401).send({ error: { message: 'Unauthorized' } });

    const bal = getOrCreateBalance(auth.customerId);
    return {
      customerId: auth.customerId,
      availableUsd: bal.available_usd,
      heldUsd: bal.held_usd
    };
  });

  app.post('/v1/topup/address', { schema: { tags: ['Payments'], summary: 'Get treasury top-up address' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = requireAuth(req);
    if (!auth) return reply.status(401).send({ error: { message: 'Unauthorized' } });

    if (!config.TREASURY_ACCOUNT_ID) {
      return reply.status(500).send({ error: { message: 'TREASURY_ACCOUNT_ID not configured' } });
    }

    return {
      treasuryAccountId: config.TREASURY_ACCOUNT_ID,
      memo: `vera:${auth.customerId}`
    };
  });

  app.get('/v1/receipts/:jobId', { schema: { tags: ['Payments'], summary: 'Get HCS receipt for a job' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = requireAuth(req);
    if (!auth) return reply.status(401).send({ error: { message: 'Unauthorized' } });

    const jobId = (req.params as { jobId: string }).jobId;
    const row = db
      .prepare(
        'SELECT id, customer_id, receipt_topic_id, receipt_sequence_number, receipt_consensus_timestamp, receipt_transaction_id FROM jobs WHERE id = ?'
      )
      .get(jobId) as
      | {
          id: string;
          customer_id: string;
          receipt_topic_id: string | null;
          receipt_sequence_number: number | null;
          receipt_consensus_timestamp: string | null;
          receipt_transaction_id: string | null;
        }
      | undefined;

    if (!row || row.customer_id !== auth.customerId) return reply.status(404).send({ error: { message: 'Not found' } });

    return {
      jobId: row.id,
      topicId: row.receipt_topic_id,
      sequenceNumber: row.receipt_sequence_number,
      consensusTimestamp: row.receipt_consensus_timestamp,
      transactionId: row.receipt_transaction_id
    };
  });

  app.post('/v1/chat/completions', { schema: { tags: ['AI'], summary: 'OpenAI-compatible chat completions' } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = requireAuth(req);
    if (!auth) return reply.status(401).send({ error: { message: 'Unauthorized' } });

    const parsed = ChatCompletionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { message: 'Invalid request' } });
    }

    const jobId = uuidv4();
    const modelId = parsed.data.model;
    db.prepare('INSERT INTO jobs (id, customer_id, model_id, created_at) VALUES (?, ?, ?, ?)').run(
      jobId,
      auth.customerId,
      modelId,
      nowIso()
    );

    const messages: ChatMessage[] = parsed.data.messages.map(m => ({
      role: m.role,
      content: m.content
    }));
    const maxTokens = parsed.data.max_tokens ?? 256;

    const promptText = canonicalJson({ model: modelId, messages, max_tokens: maxTokens, temperature: parsed.data.temperature ?? null });
    const promptHash = sha256Base64(promptText);

    const promptTokens = estimateTokensFromText(messages.map((m) => m.content).join('\n'));

    const unitPriceUsdPerToken = 0.000002;
    const holdAmountUsd = (promptTokens + maxTokens) * unitPriceUsdPerToken;

    const hold = placeHold(auth.customerId, jobId, holdAmountUsd);
    if (!hold.ok) {
      return reply.status(402).send({
        error: { message: 'Insufficient balance' },
        availableUsd: hold.availableUsd,
        heldUsd: hold.heldUsd,
        requiredHoldUsd: holdAmountUsd
      });
    }

    if (parsed.data.stream) {
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const sseChunk = (delta: unknown) =>
        raw.write(`data: ${JSON.stringify({ id: jobId, object: 'chat.completion.chunk', choices: [{ delta, finish_reason: null }] })}\n\n`);

      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;

      try {
        for await (const event of runAgentStream({ messages, model: modelId })) {
          if (event.type === 'text') {
            fullContent += event.content;
            sseChunk({ role: 'assistant', content: event.content });
          } else if (event.type === 'usage') {
            promptTokens = event.promptTokens;
            completionTokens = event.completionTokens;
          } else if (event.type === 'inference_tier') {
            sseChunk({
              role: 'assistant',
              content: '',
              annotations: [{ type: 'inference_tier', tier: event.tier, gpuId: event.gpuId, gpuModel: event.gpuModel }],
            });
          }
        }
      } catch (err) {
        raw.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`);
        releaseHold(auth.customerId, jobId, holdAmountUsd);
        raw.write('data: [DONE]\n\n');
        raw.end();
        return;
      }

      const totalTokens = (promptTokens || estimateTokensFromText(messages.map((m) => m.content).join('\n'))) +
        (completionTokens || estimateTokensFromText(fullContent));
      const actualCostUsd = totalTokens * unitPriceUsdPerToken;

      const outputHash = sha256Base64(canonicalJson({ content: fullContent }));
      captureAndRelease(auth.customerId, jobId, holdAmountUsd, actualCostUsd);
      db.prepare('UPDATE jobs SET prompt_hash = ?, output_hash = ?, prompt_tokens = ?, completion_tokens = ?, total_tokens = ?, cost_usd = ? WHERE id = ?')
        .run(promptHash, outputHash, promptTokens, completionTokens, totalTokens, actualCostUsd, jobId);

      raw.write(`data: ${JSON.stringify({ id: jobId, object: 'chat.completion.chunk', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens } })}\n\n`);
      raw.write('data: [DONE]\n\n');

      setImmediate(() => {
        publishReceipt({ jobId, customerId: auth.customerId, modelId, promptHash, outputHash,
          usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
          costUsd: actualCostUsd }).catch(error => {
          console.error('Failed to publish receipt:', error);
          // Consider implementing retry logic or dead letter queue
        });
      });

      raw.end();
    } else {
      try {
        const llmRes = await provider.chat({ model: modelId, messages, max_tokens: maxTokens, temperature: parsed.data.temperature });

        const completionTokens = llmRes.completionTokens;
        const totalTokens = llmRes.promptTokens + completionTokens;
        const actualCostUsd = totalTokens * unitPriceUsdPerToken;

        const outputHash = sha256Base64(canonicalJson({ content: llmRes.content }));
        captureAndRelease(auth.customerId, jobId, holdAmountUsd, actualCostUsd);
        db.prepare('UPDATE jobs SET prompt_hash = ?, output_hash = ?, prompt_tokens = ?, completion_tokens = ?, total_tokens = ?, cost_usd = ? WHERE id = ?')
          .run(promptHash, outputHash, llmRes.promptTokens, completionTokens, totalTokens, actualCostUsd, jobId);

        const response = {
          id: jobId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: modelId,
          choices: [{ index: 0, message: { role: 'assistant', content: llmRes.content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: llmRes.promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
        };

        setImmediate(() => {
          publishReceipt({ jobId, customerId: auth.customerId, modelId, promptHash, outputHash,
            usage: response.usage, costUsd: actualCostUsd }).catch(error => {
            console.error('Failed to publish receipt:', error);
            // Consider implementing retry logic or dead letter queue
          });
        });

        return response;
      } catch {
        releaseHold(auth.customerId, jobId, holdAmountUsd);
        return reply.status(500).send({ error: { message: 'Inference failed' } });
      }
    }
  });

  // Register wallet routes
  app.register(wallet);
  
  // === VERA PRESETS API ===
  const { ALL_PRESETS, getPresetsByCategory, getPresetById, preparePreset } = await import('./agent/presets.js');
  
  // Get all presets
  app.get('/vera/presets', async (req, reply) => {
    return reply.send({ 
      presets: ALL_PRESETS,
      categories: ['token', 'nft', 'defi', 'account', 'hcs', 'data']
    });
  });
  
  // Get presets by category
  app.get('/vera/presets/:category', async (req, reply) => {
    const { category } = req.params as { category: string };
    const presets = getPresetsByCategory(category as any);
    return reply.send({ category, presets });
  });
  
  // Get single preset
  app.get('/vera/preset/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const preset = getPresetById(id);
    if (!preset) {
      return reply.status(404).send({ error: 'Preset not found' });
    }
    return reply.send({ preset });
  });
  
  // Execute preset (prepares params for chat)
  app.post('/vera/preset/:id/execute', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { params } = req.body as { params: Record<string, unknown> };
    
    const result = preparePreset(id, params || {});
    
    if (!result.success) {
      return reply.status(400).send({ 
        error: result.error,
        preset: getPresetById(id)
      });
    }
    
    return reply.send({
      success: true,
      toolName: result.toolName,
      prompt: result.prompt,
      params: result.params,
      confirmations: result.confirmations
    });
  });
  
  // Wallet dashboard redirect
  app.get('/wallet', (req, reply) => {
    reply.redirect('/public/wallet.html');
  });

  // === ABFT CONSENSUS API ===
  const { veraLatticeSwarm } = await import('./swarm/latticeSwarm.js');
  const { abftConsensus } = await import('./swarm/abftConsensus.js');
  const { hcsGossip } = await import('./swarm/hcsGossip.js');

  // Initialize swarm on first request
  let swarmInitialized = false;
  async function ensureSwarm() {
    if (!swarmInitialized) {
      await veraLatticeSwarm.initialize();
      swarmInitialized = true;
    }
  }

  // Create consensus proposal
  app.post('/api/swarm/proposal', async (req, reply) => {
    await ensureSwarm();
    const { type, payload, proposerId } = req.body as { type: 'PAYMENT_BATCH' | 'TASK_ASSIGN' | 'CONFIG_CHANGE', payload: any, proposerId?: string };
    const proposalId = await veraLatticeSwarm.createConsensusProposal(type, payload, proposerId);
    return reply.send({ proposalId, status: proposalId ? 'created' : 'failed' });
  });

  // Cast vote on proposal
  app.post('/api/swarm/vote', async (req, reply) => {
    await ensureSwarm();
    const { proposalId, agentId, vote } = req.body as { proposalId: string, agentId: string, vote: 'YES' | 'NO' | 'ABSTAIN' };
    const success = await veraLatticeSwarm.castConsensusVote(proposalId, agentId, vote);
    return reply.send({ success, proposalId, agentId, vote });
  });

  // Get ABFT statistics
  app.get('/api/swarm/abft-stats', async (req, reply) => {
    const stats = abftConsensus.getStats();
    return reply.send(stats);
  });

  // Get rogue agents
  app.get('/api/swarm/rogue-agents', async (req, reply) => {
    await ensureSwarm();
    const rogues = await veraLatticeSwarm.getRogueAgents();
    return reply.send({ rogues, count: rogues.length });
  });

  // Get gossip stats
  app.get('/api/swarm/gossip-stats', async (req, reply) => {
    const stats = hcsGossip.getStats();
    return reply.send(stats);
  });

  // Get active proposals
  app.get('/api/swarm/proposals', async (req, reply) => {
    const proposals = abftConsensus.getActiveProposals();
    return reply.send({ proposals, count: proposals.length });
  });
}

async function publishReceipt(input: {
  jobId: string;
  customerId: string;
  modelId: string;
  promptHash: string;
  outputHash: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  costUsd: number;
}) {
  if (!config.RECEIPT_SIGNING_SECRET_KEY_BASE64) return;

  const payload = {
    receiptVersion: 1,
    jobId: input.jobId,
    customerId: input.customerId,
    modelId: input.modelId,
    promptHash: input.promptHash,
    outputHash: input.outputHash,
    usage: input.usage,
    costUsd: input.costUsd,
    issuedAt: nowIso()
  };

  const canonical = canonicalJson(payload);
  const sig = signDetachedBase64(canonical, config.RECEIPT_SIGNING_SECRET_KEY_BASE64);

  const receipt = {
    ...payload,
    signature: sig
  };

  const submitRes = await submitReceiptMessage(canonicalJson(receipt));
  if (!submitRes) return;

  db.prepare(
    'UPDATE jobs SET receipt_topic_id = ?, receipt_sequence_number = ?, receipt_transaction_id = ? WHERE id = ?'
  ).run(submitRes.topicId, submitRes.sequenceNumber, submitRes.transactionId, input.jobId);
}
