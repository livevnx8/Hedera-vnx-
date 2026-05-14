import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { veraMemoryReplayStore, type VeraMemoryReplayStore } from '../../vera/memory/veraMemoryReplayStore.js';

export async function registerVeraMemoryRoutes(
  app: FastifyInstance,
  store: VeraMemoryReplayStore = veraMemoryReplayStore,
) {
  app.get('/api/vera/memory/summary', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await store.getSummary());
  });

  app.get('/api/vera/memory/proof/:hash', async (req: FastifyRequest, reply: FastifyReply) => {
    const { hash } = req.params as { hash: string };
    const record = await store.getByPacketHash(hash);
    if (!record) return reply.status(404).send({ error: `Vera memory proof not found: ${hash}` });
    return reply.send({
      ...record,
      proof: {
        packetHash: record.packetHash,
        topicId: record.topicId,
        sequenceNumber: record.sequenceNumber,
        transactionId: record.transactionId,
        consensusTimestamp: record.consensusTimestamp,
        hashscanUrl: record.hashscanUrl,
      },
      links: {
        hashscan: record.hashscanUrl,
        dashboard: record.packet.refs.dashboardPath,
      },
    });
  });

  app.get('/api/vera/memory/events', async (req: FastifyRequest, reply: FastifyReply) => {
    const { taskId, agentId, eventType, limit } = req.query as {
      taskId?: string;
      agentId?: string;
      eventType?: string;
      limit?: string;
    };
    const max = Math.max(1, Math.min(500, Number.parseInt(limit ?? '100', 10) || 100));
    let records;
    if (taskId) records = await store.listByTaskId(taskId);
    else if (agentId) records = await store.listByAgentId(agentId);
    else if (eventType) records = await store.listByEventType(eventType);
    else records = await store.listRecent(max);

    return reply.send({
      records: records.slice(0, max),
      count: records.length,
      truncated: records.length > max,
      filters: { taskId, agentId, eventType },
    });
  });
}
