import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkflowEvidenceLedger } from '../../vera/workflows/workflowEvidenceLedger.js';

describe('DeepSeek learning ellipse', () => {
  let tempDir: string;
  let ledger: WorkflowEvidenceLedger;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vera-deepseek-ellipse-'));
    ledger = new WorkflowEvidenceLedger(path.join(tempDir, 'ledger.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('builds sanitized prompts from evidence digests', async () => {
    const { buildDeepSeekLearningPrompt } = await import('../../vera/workflows/deepseekLearningEllipse.js');
    const loop = await ledger.openLoop('agent quality lesson');
    const closed = await ledger.recordEvidence(loop.id, {
      source: 'hip1056_block_stream',
      stage: 'receipt',
      summary: 'Receipt closed with block proof reference',
      hash: 'receipt-hash',
      transactionId: '0.0.123@1.2.3',
      blockStream: {
        blockNumber: 1056,
        blockProofHash: 'block-proof-hash',
      },
      metadata: {
        privatePrompt: 'should not be included by prompt builder',
      },
    });

    const prompt = buildDeepSeekLearningPrompt(closed);

    expect(prompt.workflowLoopId).toBe(loop.id);
    expect(prompt.evidenceDigest).toHaveLength(1);
    expect(prompt.evidenceDigest[0]).toMatchObject({
      stage: 'receipt',
      source: 'hip1056_block_stream',
      hash: 'receipt-hash',
      blockNumber: 1056,
      blockProofHash: 'block-proof-hash',
    });
    expect(JSON.stringify(prompt)).not.toContain('should not be included');
    expect(prompt.outputContract.mustAvoid).toContain('raw private prompts');
  });
});
