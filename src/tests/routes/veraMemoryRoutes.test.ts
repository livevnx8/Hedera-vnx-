import Fastify from 'fastify';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerVeraMemoryRoutes } from '../../routes/vera/memory.js';
import { VeraMemoryReplayWorker } from '../../vera/memory/mirrorReplayWorker.js';
import { VeraMemoryReplayStore } from '../../vera/memory/veraMemoryReplayStore.js';
import { buildVeraMemoryPacket } from '../../vera/memory/veraMemoryPacket.js';

describe('Vera memory proof routes', () => {
  let tempDir: string;
  let store: VeraMemoryReplayStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vera-memory-routes-'));
    store = new VeraMemoryReplayStore(path.join(tempDir, 'store.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns durable proof records by hash and query filters', async () => {
    const packet = buildVeraMemoryPacket({
      eventType: 'task.proof_complete',
      eventId: 'evt-route-test',
      network: 'testnet',
      source: 'route-test',
      createdAt: '2026-04-29T00:00:00.000Z',
      taskId: 'task-route-1',
      agentId: 'agent-route-1',
      runId: 'run-route-1',
      proof: {
        payloadHash: 'payload',
        resultHash: 'result',
        settlementHash: 'settlement',
        reputationHash: 'reputation',
        eventChainHash: 'chain',
      },
      summary: {
        status: 'proof_complete',
        confidence: 0.99,
        shortText: 'Route proof packet',
      },
      refs: {
        localRecordId: 'run-route-1',
        dashboardPath: '/api/vera/verifiable-ai/runs/run-route-1',
        hcsTopicId: '0.0.456',
        hcsSequence: 99,
        transactionId: '0.0.1001-3-4',
        hashscanUrl: 'https://hashscan.io/testnet/transaction/0.0.1001-3-4',
        blockStreamRef: null,
      },
    });
    const [record] = new VeraMemoryReplayWorker().ingestMirrorMessages([
      {
        sequence_number: 99,
        consensus_timestamp: '456.789',
        transaction_id: '0.0.1001-3-4',
        message: JSON.stringify(packet),
      },
    ]);
    await store.ingestRecord(record);

    const app = Fastify();
    await registerVeraMemoryRoutes(app, store);

    const proof = await app.inject(`/api/vera/memory/proof/${encodeURIComponent(packet.proof.packetHash ?? '')}`);
    expect(proof.statusCode).toBe(200);
    expect(proof.json()).toMatchObject({
      packetHash: packet.proof.packetHash,
      eventType: 'task.proof_complete',
      taskId: 'task-route-1',
      proof: {
        topicId: '0.0.456',
        sequenceNumber: 99,
        transactionId: '0.0.1001-3-4',
      },
      links: {
        hashscan: 'https://hashscan.io/testnet/transaction/0.0.1001-3-4',
      },
    });

    const events = await app.inject('/api/vera/memory/events?taskId=task-route-1');
    expect(events.statusCode).toBe(200);
    expect(events.json()).toMatchObject({
      count: 1,
      records: [{ packetHash: packet.proof.packetHash }],
    });

    const summary = await app.inject('/api/vera/memory/summary');
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({ records: 1, current: 1 });

    await app.close();
  });
});
