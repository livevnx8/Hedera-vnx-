import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EscrowController } from '../../vera/orchestrator/escrowController.js';

const mockExecute = vi.fn();
const mockGetReceipt = vi.fn();

vi.mock('@hashgraph/sdk', () => ({
  AccountAllowanceApproveTransaction: vi.fn().mockImplementation(() => ({
    approveHbarAllowance: vi.fn().mockReturnThis(),
    execute: mockExecute,
  })),
  Hbar: vi.fn().mockImplementation((v: number) => ({ _amount: v })),
  TopicMessageSubmitTransaction: vi.fn().mockImplementation(() => ({
    setTopicId: vi.fn().mockReturnThis(),
    setMessage: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('../../hedera/tools/client.js', () => ({
  getClient: vi.fn().mockReturnValue({}),
}));

vi.mock('../../config.js', () => ({
  config: {
    HEDERA_OPERATOR_ACCOUNT_ID: '0.0.12345',
    VERA_AUDIT_TOPIC_ID: '0.0.99998',
  },
}));

vi.mock('../../monitoring/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('EscrowController', () => {
  let controller: EscrowController;

  beforeEach(() => {
    controller = new EscrowController();
    mockExecute.mockReset();
    mockGetReceipt.mockReset();

    // Default: successful execution
    mockGetReceipt.mockResolvedValue({});
    mockExecute.mockResolvedValue({
      getReceipt: mockGetReceipt,
      transactionId: { toString: () => '0.0.123@1234567890.000' },
    });
  });

  // ─── lockEscrow ───────────────────────────────────────────────────────────

  describe('lockEscrow', () => {
    it('should create a locked escrow on success', async () => {
      const record = await controller.lockEscrow('task-1', '0.0.99999', 5);

      expect(record.state).toBe('locked');
      expect(record.taskId).toBe('task-1');
      expect(record.recipientAccountId).toBe('0.0.99999');
      expect(record.amountHbar).toBe(5);
      expect(record.txId).toBe('0.0.123@1234567890.000');
      expect(record.escrowId).toMatch(/^esc-task-1-/);
    });

    it('should set state to failed on SDK error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Network timeout'));

      const record = await controller.lockEscrow('task-2', '0.0.99999', 3);

      expect(record.state).toBe('failed');
      expect(record.txId).toBeUndefined();
    });

    it('should store the escrow in the internal map', async () => {
      const record = await controller.lockEscrow('task-3', '0.0.99999', 1);

      const found = controller.getEscrow(record.escrowId);
      expect(found).toBeDefined();
      expect(found!.taskId).toBe('task-3');
    });

    it('should emit escrow_locked event', async () => {
      const handler = vi.fn();
      controller.on('escrow_locked', handler);

      await controller.lockEscrow('task-4', '0.0.99999', 2);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].taskId).toBe('task-4');
    });
  });

  // ─── releaseEscrow ────────────────────────────────────────────────────────

  describe('releaseEscrow', () => {
    it('should release a locked escrow', async () => {
      const record = await controller.lockEscrow('task-5', '0.0.99999', 5);
      const released = await controller.releaseEscrow(record.escrowId);

      expect(released).toBe(true);
      expect(controller.getEscrow(record.escrowId)!.state).toBe('released');
    });

    it('should return false for non-locked escrow', async () => {
      const record = await controller.lockEscrow('task-6', '0.0.99999', 5);
      await controller.releaseEscrow(record.escrowId);

      // Try releasing again (now in released state)
      const result = await controller.releaseEscrow(record.escrowId);
      expect(result).toBe(false);
    });

    it('should return false for unknown escrow', async () => {
      const result = await controller.releaseEscrow('nonexistent');
      expect(result).toBe(false);
    });

    it('should emit escrow_released event', async () => {
      const handler = vi.fn();
      controller.on('escrow_released', handler);

      const record = await controller.lockEscrow('task-7', '0.0.99999', 5);
      await controller.releaseEscrow(record.escrowId);

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // ─── reclaimEscrow ────────────────────────────────────────────────────────

  describe('reclaimEscrow', () => {
    it('should reclaim a locked escrow', async () => {
      const record = await controller.lockEscrow('task-8', '0.0.99999', 5);
      const reclaimed = await controller.reclaimEscrow(record.escrowId);

      expect(reclaimed).toBe(true);
      expect(controller.getEscrow(record.escrowId)!.state).toBe('reclaimed');
      expect(controller.getEscrow(record.escrowId)!.reclaimTxId).toBe('0.0.123@1234567890.000');
    });

    it('should return false for non-locked escrow', async () => {
      const record = await controller.lockEscrow('task-9', '0.0.99999', 5);
      await controller.releaseEscrow(record.escrowId);

      const result = await controller.reclaimEscrow(record.escrowId);
      expect(result).toBe(false);
    });

    it('should return false on SDK error during reclaim', async () => {
      const record = await controller.lockEscrow('task-10', '0.0.99999', 5);

      // Make the second execute call (reclaim) fail
      mockExecute.mockRejectedValueOnce(new Error('Network error'));

      const result = await controller.reclaimEscrow(record.escrowId);
      expect(result).toBe(false);
    });

    it('should emit escrow_reclaimed event', async () => {
      const handler = vi.fn();
      controller.on('escrow_reclaimed', handler);

      const record = await controller.lockEscrow('task-11', '0.0.99999', 5);
      await controller.reclaimEscrow(record.escrowId);

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // ─── Queries ──────────────────────────────────────────────────────────────

  describe('queries', () => {
    it('getEscrowByTask should find by task ID', async () => {
      await controller.lockEscrow('task-q1', '0.0.99999', 5);

      const found = controller.getEscrowByTask('task-q1');
      expect(found).toBeDefined();
      expect(found!.taskId).toBe('task-q1');
    });

    it('getEscrowByTask should return undefined for missing task', () => {
      expect(controller.getEscrowByTask('missing')).toBeUndefined();
    });

    it('getStats should aggregate correctly', async () => {
      const r1 = await controller.lockEscrow('task-s1', '0.0.99999', 5);
      const r2 = await controller.lockEscrow('task-s2', '0.0.99999', 3);
      await controller.releaseEscrow(r1.escrowId);

      const stats = controller.getStats();
      expect(stats.total).toBe(2);
      expect(stats.locked).toBe(1);
      expect(stats.released).toBe(1);
      expect(stats.totalLockedHbar).toBe(3);
    });
  });
});
