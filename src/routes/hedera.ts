import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getAccountInfo,
  getAccountBalance,
  getAccountTokens,
  getTransactionById,
  getHcsMessages,
} from '../hedera/mirrorApi.js';
import { transferHbar, sendHcsMessage } from '../hedera/hederaTxTools.js';
import { config } from '../config.js';

const TransferBodySchema = z.object({
  to_account_id: z.string().min(1),
  amount_hbar: z.number().positive(),
  memo: z.string().optional(),
});

const HcsSendBodySchema = z.object({
  topic_id: z.string().optional(),
  message: z.string().min(1),
});

export async function registerHederaRoutes(app: FastifyInstance) {
  app.get('/v1/hedera/account/:accountId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { accountId } = req.params as { accountId: string };
    try {
      const result = await getAccountInfo(accountId);
      return reply.send(result);
    } catch (err) {
      return reply.status(500).send({ error: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  app.get('/v1/hedera/balance/:accountId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { accountId } = req.params as { accountId: string };
    try {
      const result = await getAccountBalance(accountId);
      return reply.send(result);
    } catch (err) {
      return reply.status(500).send({ error: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  app.get('/v1/hedera/tokens/:accountId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { accountId } = req.params as { accountId: string };
    try {
      const result = await getAccountTokens(accountId);
      return reply.send({ tokens: result });
    } catch (err) {
      return reply.status(500).send({ error: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  app.get('/v1/hedera/transaction/:txId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { txId } = req.params as { txId: string };
    try {
      const result = await getTransactionById(txId);
      if (!result) return reply.status(404).send({ error: { message: 'Transaction not found' } });
      return reply.send(result);
    } catch (err) {
      return reply.status(500).send({ error: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  app.get('/v1/hedera/hcs/:topicId/messages', async (req: FastifyRequest, reply: FastifyReply) => {
    const { topicId } = req.params as { topicId: string };
    const query = req.query as { limit?: string };
    const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 25;
    try {
      const result = await getHcsMessages(topicId, limit);
      return reply.send({ topicId, messages: result });
    } catch (err) {
      return reply.status(500).send({ error: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  app.post('/v1/hedera/transfer', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = TransferBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { message: 'Invalid request body', details: parsed.error.flatten() } });
    }
    try {
      const result = await transferHbar({
        toAccountId: parsed.data.to_account_id,
        amountHbar: parsed.data.amount_hbar,
        memo: parsed.data.memo,
      });
      return reply.send(result);
    } catch (err) {
      return reply.status(500).send({ error: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  app.post('/v1/hedera/hcs/message', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = HcsSendBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { message: 'Invalid request body', details: parsed.error.flatten() } });
    }
    const topicId = parsed.data.topic_id ?? config.HCS_TOPIC_ID;
    if (!topicId) {
      return reply.status(400).send({ error: { message: 'topic_id not provided and HCS_TOPIC_ID is not configured.' } });
    }
    try {
      const result = await sendHcsMessage({ topicId, message: parsed.data.message });
      return reply.send(result);
    } catch (err) {
      return reply.status(500).send({ error: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  // ===== NVIDIA ENHANCED HEDERA CAPABILITIES =====

  // Carbon calculation with Nemotron reasoning
  app.post('/api/hedera/nvidia/carbon-calculate', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      transactionType: string;
      details: Record<string, unknown>;
    };
    
    try {
      const { nvidiaHedera } = await import('../hedera/nvidiaHederaIntegration.js');
      const result = await nvidiaHedera.calculateCarbonWithReasoning(
        body.transactionType,
        body.details
      );
      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Multi-step transaction planning with AI-Q
  app.post('/api/hedera/nvidia/plan-transaction', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      goal: string;
      constraints?: Record<string, unknown>;
    };
    
    try {
      const { nvidiaHedera } = await import('../hedera/nvidiaHederaIntegration.js');
      const result = await nvidiaHedera.planMultiStepTransaction(
        body.goal,
        body.constraints || {}
      );
      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Secure tool execution with OpenShell
  app.post('/api/hedera/nvidia/execute-secure', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      toolName: string;
      args: Record<string, unknown>;
      agentType?: string;
    };
    
    try {
      const { nvidiaHedera } = await import('../hedera/nvidiaHederaIntegration.js');
      const result = await nvidiaHedera.executeSecureHederaTool(
        body.toolName,
        body.args,
        body.agentType
      );
      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // Semantic transaction history search
  app.post('/api/hedera/nvidia/query-history', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      query: string;
      limit?: number;
    };
    
    try {
      const { nvidiaHedera } = await import('../hedera/nvidiaHederaIntegration.js');
      const result = await nvidiaHedera.queryTransactionHistory(
        body.query,
        body.limit
      );
      return reply.send({ transactions: result });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });

  // NVIDIA capabilities status
  app.get('/api/hedera/nvidia/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { nvidiaHedera } = await import('../hedera/nvidiaHederaIntegration.js');
      const capabilities = nvidiaHedera.getCapabilities();
      return reply.send({
        active: true,
        capabilities,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return reply.status(500).send({ error: String(error) });
    }
  });
}
