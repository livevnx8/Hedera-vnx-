import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildVeraMemoryPacket } from '../../vera/memory/veraMemoryPacket.js';
import { VeraMemoryReplayWorker } from '../../vera/memory/mirrorReplayWorker.js';
import { VeraMemoryReplayStore } from '../../vera/memory/veraMemoryReplayStore.js';

describe('VeraMemoryReplayStore', () => {
  let tempDir: string;
  let storePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vera-memory-store-'));
    storePath = path.join(tempDir, 'store.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('persists replayed memory records by proof hash, task, agent, and event type', async () => {
    const packet = buildVeraMemoryPacket({
      eventType: 'task.proof_complete',
      eventId: 'evt-store-test',
      network: 'testnet',
      source: 'test',
      createdAt: '2026-04-29T00:00:00.000Z',
      taskId: 'task-store-1',
      agentId: 'agent-store-1',
      runId: 'run-store-1',
      proof: {
        payloadHash: 'payload',
        resultHash: 'result',
        settlementHash: 'settlement',
        reputationHash: 'reputation',
        eventChainHash: 'chain',
      },
      summary: {
        status: 'proof_complete',
        confidence: 1,
        shortText: 'Stored proof packet',
      },
      refs: {
        localRecordId: 'run-store-1',
        dashboardPath: '/api/vera/verifiable-ai/runs/run-store-1',
        hcsTopicId: '0.0.123',
        hcsSequence: 42,
        transactionId: '0.0.1001-1-2',
        hashscanUrl: 'https://hashscan.io/testnet/transaction/0.0.1001-1-2',
        blockStreamRef: null,
      },
    });
    const worker = new VeraMemoryReplayWorker();
    const [record] = worker.ingestMirrorMessages([
      {
        sequence_number: 42,
        consensus_timestamp: '123.456',
        transaction_id: '0.0.1001-1-2',
        message: JSON.stringify(packet),
      },
    ]);

    const store = new VeraMemoryReplayStore(storePath);
    await store.ingestRecord(record);

    const reloaded = new VeraMemoryReplayStore(storePath);
    await expect(reloaded.getByPacketHash(packet.proof.packetHash ?? '')).resolves.toMatchObject({
      packetHash: packet.proof.packetHash,
      taskId: 'task-store-1',
      agentId: 'agent-store-1',
      eventType: 'task.proof_complete',
      sequenceNumber: 42,
      transactionId: '0.0.1001-1-2',
    });
    await expect(reloaded.listByTaskId('task-store-1')).resolves.toHaveLength(1);
    await expect(reloaded.listByAgentId('agent-store-1')).resolves.toHaveLength(1);
    await expect(reloaded.listByEventType('task.proof_complete')).resolves.toHaveLength(1);
    await expect(reloaded.getSummary()).resolves.toMatchObject({
      records: 1,
      current: 1,
      superseded: 0,
      taskIds: 1,
      agentIds: 1,
      eventTypes: 1,
    });
  });
});
