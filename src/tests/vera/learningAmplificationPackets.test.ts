import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LearningAmplificationPacketStore } from '../../vera/workflows/learningAmplificationPackets.js';
import { WorkflowEvidenceLedger } from '../../vera/workflows/workflowEvidenceLedger.js';

describe('LearningAmplificationPacketStore', () => {
  let tempDir: string;
  let ledger: WorkflowEvidenceLedger;
  let packets: LearningAmplificationPacketStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vera-learning-packets-'));
    ledger = new WorkflowEvidenceLedger(path.join(tempDir, 'ledger.json'));
    packets = new LearningAmplificationPacketStore(path.join(tempDir, 'packets.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates compact HCS candidates from receipt-backed approved lessons', async () => {
    const loop = await ledger.openLoop('agent launch proof loop');
    const closed = await ledger.recordEvidence(loop.id, {
      source: 'hip1056_block_stream',
      stage: 'receipt',
      summary: 'Block proof reference attached',
      blockStream: {
        blockNumber: 1056,
        blockProofHash: 'proof-hash',
      },
      metadata: {},
    });

    const packet = await packets.createFromLoop(closed, {
      modelProvider: 'deepseek',
      modelName: 'deepseek-reasoner',
      lesson: 'Repeated proof-backed agent launch steps can be packaged as an onboarding upgrade.',
      qualityScore: 0.95,
      operatorApproved: true,
    });

    expect(packet.hcsCandidate.shouldLog).toBe(true);
    expect(packet.lessonHash).toHaveLength(64);
    expect(packet.blockStreamRefs[0].blockProofHash).toBe('proof-hash');
    expect(packet.hcsCandidate.payload).not.toHaveProperty('lesson');
  });

  it('holds packets that are missing operator approval or receipt proof', async () => {
    const loop = await ledger.openLoop('draft synthesis');
    const packet = await packets.createFromLoop(loop, {
      modelProvider: 'deepseek',
      lesson: 'Draft idea without receipt proof.',
      qualityScore: 0.99,
      operatorApproved: false,
    });

    expect(packet.hcsCandidate.shouldLog).toBe(false);
  });

  it('attaches HCS submission and block-stream closure metadata', async () => {
    const loop = await ledger.openLoop('closed learning packet');
    const closed = await ledger.recordEvidence(loop.id, {
      source: 'hcs',
      stage: 'receipt',
      summary: 'HCS receipt available',
      metadata: {},
    });
    const packet = await packets.createFromLoop(closed, {
      modelProvider: 'deepseek',
      lesson: 'Approved compact lesson.',
      qualityScore: 0.95,
      operatorApproved: true,
    });

    await packets.markHcsSubmitted(packet.id, {
      hash: 'hash',
      topicId: '0.0.123',
      sequenceNumber: 7,
      transactionId: '0.0.456@1.2.3',
      submittedAt: 123,
      verified: false,
    });
    const closedPacket = await packets.attachBlockStreamClosure(packet.id, {
      blockNumber: 1056,
      transactionId: '0.0.456@1.2.3',
      blockProofHash: 'block-proof-hash',
      stateChangeSummary: 'Learning packet message reached consensus.',
    });

    expect(closedPacket.hcsSubmission?.sequenceNumber).toBe(7);
    expect(closedPacket.blockStreamClosure?.blockProofHash).toBe('block-proof-hash');
  });
});
