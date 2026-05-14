import { describe, expect, it } from 'vitest';
import { VeraMemoryReplayWorker } from '../../vera/memory/mirrorReplayWorker.js';
import { buildVeraMemoryPacket, type VeraMemoryPacket } from '../../vera/memory/veraMemoryPacket.js';

function buildPacket(overrides: Partial<VeraMemoryPacket['_vera']> = {}): VeraMemoryPacket {
  return buildVeraMemoryPacket({
    eventType: overrides.eventType ?? 'task.proof_complete',
    eventId: overrides.eventId ?? 'evt-test-memory',
    network: overrides.network ?? 'testnet',
    source: 'test',
    createdAt: '2026-04-28T00:00:00.000Z',
    taskId: overrides.taskId ?? 'task-1',
    agentId: overrides.agentId ?? 'agent-1',
    runId: overrides.runId ?? 'run-1',
    correlationId: overrides.correlationId ?? 'run-1',
    proof: {
      payloadHash: 'payload-hash',
      resultHash: 'result-hash',
      settlementHash: 'settlement-hash',
      reputationHash: 'reputation-hash',
      eventChainHash: 'event-chain-hash',
    },
    summary: {
      status: 'proof_complete',
      confidence: 0.91,
      shortText: 'Test memory packet',
    },
    refs: {
      localRecordId: 'run-1',
      dashboardPath: '/api/vera/verifiable-ai/runs/run-1',
      blockStreamRef: null,
    },
  });
}

function wrapHip993(packet: VeraMemoryPacket, messageId = 'msg-1') {
  return JSON.stringify({
    _hip993: {
      chunk: 1,
      total: 1,
      messageId,
      chunked: false,
    },
    data: JSON.stringify(packet),
  });
}

describe('VeraMemoryReplayWorker', () => {
  it('indexes a single HIP-993 wrapped Vera memory packet by task, agent, event, and packet hash', () => {
    const worker = new VeraMemoryReplayWorker();
    const packet = buildPacket();

    const records = worker.ingestMirrorMessages([
      {
        sequence_number: 7,
        consensus_timestamp: '1234567890.000000001',
        transaction_id: '0.0.1001-1-2',
        message: wrapHip993(packet),
      },
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sequenceNumber: 7,
      consensusTimestamp: '1234567890.000000001',
      transactionId: '0.0.1001-1-2',
      packetHash: packet.proof.packetHash,
    });
    expect(worker.getByTaskId('task-1')).toHaveLength(1);
    expect(worker.getByAgentId('agent-1')).toHaveLength(1);
    expect(worker.getByEventType('task.proof_complete')).toHaveLength(1);
    expect(worker.getByPacketHash(packet.proof.packetHash ?? '')?.packet).toEqual(packet);
    expect(worker.getStats()).toMatchObject({
      packets: 1,
      invalidPackets: 0,
      pendingChunkGroups: 0,
    });
  });

  it('reconstructs and indexes a chunked HIP-993 mirror message', () => {
    const worker = new VeraMemoryReplayWorker();
    const packet = buildPacket({ taskId: 'task-chunked', agentId: 'agent-chunked' });
    const serialized = JSON.stringify(packet);
    const first = serialized.slice(0, Math.ceil(serialized.length / 2));
    const second = serialized.slice(Math.ceil(serialized.length / 2));

    const records = worker.ingestMirrorMessages([
      {
        sequence_number: 10,
        consensus_timestamp: '1234567890.000000010',
        message: JSON.stringify({
          _hip993: { chunk: 1, total: 2, messageId: 'chunked-1', chunked: true },
          data: first,
        }),
      },
      {
        sequence_number: 11,
        consensus_timestamp: '1234567890.000000011',
        message: JSON.stringify({
          _hip993: { chunk: 2, total: 2, messageId: 'chunked-1', chunked: true },
          data: second,
        }),
      },
    ]);

    expect(records).toHaveLength(1);
    expect(worker.getByTaskId('task-chunked')).toHaveLength(1);
    expect(worker.getByAgentId('agent-chunked')).toHaveLength(1);
    expect(worker.getByPacketHash(packet.proof.packetHash ?? '')).toBeTruthy();
    expect(worker.getStats().pendingChunkGroups).toBe(0);
  });

  it('rejects packets whose integrity hash no longer matches the payload', () => {
    const worker = new VeraMemoryReplayWorker();
    const packet = buildPacket();
    packet.summary.shortText = 'Tampered after hashing';

    const records = worker.ingestMirrorMessages([
      {
        sequence_number: 12,
        consensus_timestamp: '1234567890.000000012',
        message: wrapHip993(packet),
      },
    ]);

    expect(records).toEqual([]);
    expect(worker.getStats()).toMatchObject({
      packets: 0,
      invalidPackets: 1,
    });
  });
});
