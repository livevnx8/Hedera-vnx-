import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MarketplaceWorkflowBridge } from '../../vera/workflows/marketplaceWorkflowBridge.js';
import { WorkflowEvidenceLedger } from '../../vera/workflows/workflowEvidenceLedger.js';

describe('MarketplaceWorkflowBridge', () => {
  let tempDir: string;
  let bridge: MarketplaceWorkflowBridge;
  let ledger: WorkflowEvidenceLedger;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vera-marketplace-workflows-'));
    const ledgerPath = path.join(tempDir, 'ledger.json');
    ledger = new WorkflowEvidenceLedger(ledgerPath);
    bridge = new MarketplaceWorkflowBridge(path.join(tempDir, 'index.json'), ledger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('records marketplace lifecycle evidence on one workflow loop', async () => {
    const record = {
      intent: {
        taskId: 'task-1',
        description: 'Verify a proof-backed agent result',
        serviceType: 'proof-verification',
        budget: 1,
        requiredConfidence: 0.8,
        deadlineMs: Date.now() + 60_000,
      },
      state: 'posted' as const,
      bids: [],
      winnerId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hcsSequence: 42,
    };

    await bridge.recordTaskPosted(record);
    await bridge.recordBid({
      taskId: 'task-1',
      agentId: 'agent-alpha',
      fee: 0.5,
      confidence: 0.91,
      estimatedDurationMs: 1000,
      timestamp: Date.now(),
    });
    await bridge.recordAward('task-1', {
      taskId: 'task-1',
      agentId: 'agent-alpha',
      fee: 0.5,
      confidence: 0.91,
      estimatedDurationMs: 1000,
      timestamp: Date.now(),
    });
    await bridge.recordVerification({
      taskId: 'task-1',
      agentId: 'agent-alpha',
      outcome: 'accepted',
      score: 0.93,
      confidenceCheck: true,
      schemaValid: true,
      proofValid: true,
      details: ['Schema valid', 'Proof hash present and valid'],
      verifiedAt: Date.now(),
    });
    await bridge.recordSettlement({
      settlementId: 'stl-task-1',
      taskId: 'task-1',
      agentId: 'agent-alpha',
      recipientAccountId: '0.0.123',
      amountHbar: 0.5,
      currency: 'HBAR',
      method: 'direct_transfer',
      state: 'settled',
      createdAt: Date.now(),
      retryCount: 0,
      settledAt: Date.now(),
    });
    await bridge.recordReputation({
      agentId: 'agent-alpha',
      totalTasks: 1,
      accepted: 1,
      rejected: 0,
      expired: 0,
      totalHbarEarned: 0.5,
      averageResponseMs: 1000,
      averageConfidence: 0.93,
      successRate: 1,
      reputationScore: 0.95,
      lastUpdated: Date.now(),
    }, 'task-1', 'accepted');

    const loopId = await bridge.getLoopIdForTask('task-1');

    expect(loopId).toBeTruthy();
    expect(await bridge.getLoopIdForTask('missing')).toBeUndefined();

    const loops = await ledger.listLoops();
    expect(loops).toHaveLength(1);
    expect(loops[0].evidence.map((evidence) => evidence.stage)).toEqual([
      'task',
      'bid',
      'award',
      'verification',
      'settlement',
      'reputation',
    ]);
  });
});
