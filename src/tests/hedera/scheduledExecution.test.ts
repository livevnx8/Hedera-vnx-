import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { TransferTransaction } from '@hashgraph/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScheduledExecutionManager } from '../../hedera/scheduledExecution.js';
import { hintsCouncil } from '../../crypto/hintsShim.js';

describe('ScheduledExecutionManager governance hardening', () => {
  let tempDir: string;
  let storagePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vera-schedules-'));
    storagePath = path.join(tempDir, 'scheduled-operations.json');
    hintsCouncil.generateCouncil();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function createManager(options: {
    defaultExpiryMs?: number;
    minThreshold?: number;
    maxThreshold?: number;
  } = {}) {
    return new ScheduledExecutionManager({
      storagePath,
      dryRun: true,
      defaultExpiryMs: options.defaultExpiryMs ?? 60_000,
      minThreshold: options.minThreshold ?? 1,
      maxThreshold: options.maxThreshold ?? 6,
    });
  }

  function createInnerTransaction() {
    return new TransferTransaction();
  }

  it('persists governance metadata across manager restarts', async () => {
    const manager = createManager();
    const operation = await manager.proposeOperation(
      'custom',
      'Persisted governance proposal',
      createInnerTransaction(),
      'agent-alpha',
      3
    );

    expect(operation.scheduleId).toMatch(/^dry-run-schedule-/);

    const reloaded = createManager();
    await reloaded.initialize();

    const stored = reloaded.getOperation(operation.id);
    expect(stored?.id).toBe(operation.id);
    expect(stored?.description).toBe('Persisted governance proposal');
    expect(stored?.transaction).toBeUndefined();
    expect(stored?.threshold).toBe(3);
  });

  it('rejects duplicate council signatures', async () => {
    const manager = createManager();
    const operation = await manager.proposeOperation(
      'custom',
      'Duplicate signer test',
      createInnerTransaction(),
      'agent-alpha',
      3
    );

    expect(await manager.signOperation(operation.id, 'vera')).toBe(true);
    expect(await manager.signOperation(operation.id, 'vera')).toBe(false);

    const stored = manager.getOperation(operation.id);
    expect(stored?.signatures).toHaveLength(1);
    expect(stored?.status).toBe('pending');
  });

  it('executes once threshold signatures are collected', async () => {
    const manager = createManager();
    const operation = await manager.proposeOperation(
      'custom',
      'Threshold execution test',
      createInnerTransaction(),
      'agent-alpha',
      3
    );

    expect(await manager.signOperation(operation.id, 'vera')).toBe(true);
    expect(manager.getOperation(operation.id)?.status).toBe('pending');

    expect(await manager.signOperation(operation.id, 'vnx')).toBe(true);
    expect(manager.getOperation(operation.id)?.status).toBe('pending');

    expect(await manager.signOperation(operation.id, 'veda')).toBe(true);
    expect(manager.getOperation(operation.id)?.status).toBe('executed');
  });

  it('rejects thresholds outside governance bounds', async () => {
    const manager = createManager({ minThreshold: 2, maxThreshold: 3 });

    await expect(
      manager.proposeOperation('custom', 'Bad threshold', createInnerTransaction(), 'agent-alpha', 1)
    ).rejects.toThrow('Invalid schedule threshold');

    await expect(
      manager.proposeOperation('custom', 'Bad threshold', createInnerTransaction(), 'agent-alpha', 4)
    ).rejects.toThrow('Invalid schedule threshold');
  });

  it('marks expired proposals and blocks late signatures', async () => {
    const manager = createManager({ defaultExpiryMs: -1 });
    const operation = await manager.proposeOperation(
      'custom',
      'Expired proposal',
      createInnerTransaction(),
      'agent-alpha',
      3
    );

    expect(await manager.signOperation(operation.id, 'vera')).toBe(false);
    expect(manager.getOperation(operation.id)?.status).toBe('expired');
    expect(manager.getPendingOperations()).toHaveLength(0);
  });

  it('cancels non-executed proposals', async () => {
    const manager = createManager();
    const operation = await manager.proposeOperation(
      'custom',
      'Cancel proposal',
      createInnerTransaction(),
      'agent-alpha',
      3
    );

    expect(await manager.cancelOperation(operation.id)).toBe(true);
    expect(manager.getOperation(operation.id)?.status).toBe('cancelled');
    expect(await manager.signOperation(operation.id, 'vera')).toBe(false);
  });
});
