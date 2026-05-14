import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkflowEvidenceLedger } from '../../vera/workflows/workflowEvidenceLedger.js';

describe('WorkflowEvidenceLedger', () => {
  let tempDir: string;
  let ledger: WorkflowEvidenceLedger;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vera-workflows-'));
    ledger = new WorkflowEvidenceLedger(path.join(tempDir, 'ledger.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('opens loops and moves into proofing when proof evidence arrives', async () => {
    const loop = await ledger.openLoop('carbon audit marketplace task');

    expect(loop.status).toBe('open');

    const proofing = await ledger.recordEvidence(loop.id, {
      source: 'test',
      stage: 'verification',
      summary: 'Verifier accepted result schema and proof hash',
      metadata: {},
    });

    expect(proofing.status).toBe('proofing');
    expect(proofing.currentStage).toBe('verification');
  });

  it('closes loops at receipt and marks promotion readiness after lessons', async () => {
    const loop = await ledger.openLoop('proof-backed agent launch');

    const closed = await ledger.recordEvidence(loop.id, {
      source: 'hip1056_block_stream',
      stage: 'receipt',
      summary: 'Block proof reference attached to the task lifecycle',
      blockStream: {
        blockNumber: 1056,
        blockProofHash: 'abc123',
      },
      metadata: {},
    });

    expect(closed.status).toBe('closed');

    await ledger.recordEvidence(loop.id, {
      source: 'operator_review',
      stage: 'lesson',
      summary: 'Operator approved compact lesson for future agent launches',
      metadata: {},
    });

    const summary = await ledger.getSummary();
    expect(summary.readyForPromotion).toBe(1);
  });
});
