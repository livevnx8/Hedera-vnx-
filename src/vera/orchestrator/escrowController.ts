import {
  AccountAllowanceApproveTransaction,
  Hbar,
} from '@hashgraph/sdk';
import { EventEmitter } from 'events';
import { getClient } from '../../hedera/tools/client.js';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type EscrowState = 'pending' | 'locked' | 'released' | 'reclaimed' | 'failed';

export interface EscrowRecord {
  escrowId: string;
  taskId: string;
  payerAccountId: string;
  recipientAccountId: string;
  amountHbar: number;
  state: EscrowState;
  createdAt: number;
  updatedAt: number;
  txId?: string;
  releaseTxId?: string;
  reclaimTxId?: string;
}

// ─── Controller ──────────────────────────────────────────────────────────────

export class EscrowController extends EventEmitter {
  private escrows = new Map<string, EscrowRecord>();

  /**
   * Create an HBAR allowance from Vera's operator account to the
   * facilitator (or directly to the recipient). This "locks" funds
   * by granting a spend allowance without transferring yet.
   */
  async lockEscrow(
    taskId: string,
    recipientAccountId: string,
    amountHbar: number,
  ): Promise<EscrowRecord> {
    const payerAccountId = config.HEDERA_OPERATOR_ACCOUNT_ID;
    if (!payerAccountId) {
      throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
    }

    const escrowId = `esc-${taskId}-${Date.now()}`;
    const record: EscrowRecord = {
      escrowId,
      taskId,
      payerAccountId,
      recipientAccountId,
      amountHbar,
      state: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      const client = getClient();
      const resp = await new AccountAllowanceApproveTransaction()
        .approveHbarAllowance(
          payerAccountId,
          recipientAccountId,
          new Hbar(amountHbar),
        )
        .execute(client);
      const receipt = await resp.getReceipt(client);

      record.state = 'locked';
      record.txId = resp.transactionId.toString();
      record.updatedAt = Date.now();

      logger.info('EscrowController', {
        message: 'Escrow locked (HBAR allowance approved)',
        escrowId,
        taskId,
        amountHbar,
        recipientAccountId,
        txId: record.txId,
      });

      await this.auditLog('escrow_locked', record);
    } catch (error) {
      record.state = 'failed';
      record.updatedAt = Date.now();
      logger.error('EscrowController', {
        message: 'Failed to lock escrow',
        escrowId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.escrows.set(escrowId, record);
    this.emit('escrow_locked', record);
    return record;
  }

  /**
   * Release escrow — marks the allowance as "released" so the
   * settlement handler can use it. In practice the actual HBAR
   * transfer happens via x402 or a direct TransferTransaction
   * that references the allowance.
   */
  async releaseEscrow(escrowId: string): Promise<boolean> {
    const record = this.escrows.get(escrowId);
    if (!record || record.state !== 'locked') {
      logger.warn('EscrowController', { message: 'Cannot release escrow', escrowId, state: record?.state });
      return false;
    }

    record.state = 'released';
    record.updatedAt = Date.now();

    await this.auditLog('escrow_released', record);
    this.emit('escrow_released', record);

    logger.info('EscrowController', {
      message: 'Escrow released',
      escrowId,
      taskId: record.taskId,
      amountHbar: record.amountHbar,
    });

    return true;
  }

  /**
   * Reclaim escrow — delete the HBAR allowance when work is rejected
   * or a task expires.
   */
  async reclaimEscrow(escrowId: string): Promise<boolean> {
    const record = this.escrows.get(escrowId);
    if (!record || record.state !== 'locked') {
      logger.warn('EscrowController', { message: 'Cannot reclaim escrow', escrowId, state: record?.state });
      return false;
    }

    try {
      const client = getClient();
      // Set allowance to 0 to reclaim — SDK doesn't support deleteAllHbarAllowances
      const resp = await new AccountAllowanceApproveTransaction()
        .approveHbarAllowance(record.payerAccountId, record.recipientAccountId, new Hbar(0))
        .execute(client);
      await resp.getReceipt(client);

      record.state = 'reclaimed';
      record.reclaimTxId = resp.transactionId.toString();
      record.updatedAt = Date.now();

      logger.info('EscrowController', {
        message: 'Escrow reclaimed (allowance deleted)',
        escrowId,
        taskId: record.taskId,
        reclaimTxId: record.reclaimTxId,
      });

      await this.auditLog('escrow_reclaimed', record);
      this.emit('escrow_reclaimed', record);
      return true;
    } catch (error) {
      logger.error('EscrowController', {
        message: 'Failed to reclaim escrow',
        escrowId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // ─── State Recovery ──────────────────────────────────────────────────────

  /**
   * Rehydrate in-memory escrow map from persisted SQLite rows.
   * Call once during orchestrator startup.
   */
  rehydrate(rows: Array<{
    escrowId: string;
    taskId: string;
    payerAccountId: string;
    recipientAccountId: string;
    amountHbar: number;
    state: string;
    txId?: string;
    releaseTxId?: string;
    reclaimTxId?: string;
    createdAt: number;
    updatedAt: number;
  }>): number {
    let count = 0;
    for (const row of rows) {
      const record: EscrowRecord = {
        escrowId: row.escrowId,
        taskId: row.taskId,
        payerAccountId: row.payerAccountId,
        recipientAccountId: row.recipientAccountId,
        amountHbar: row.amountHbar,
        state: row.state as EscrowState,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        txId: row.txId,
        releaseTxId: row.releaseTxId,
        reclaimTxId: row.reclaimTxId,
      };
      this.escrows.set(record.escrowId, record);
      count++;
    }
    logger.info('EscrowController', { message: 'Rehydrated escrows from store', count });
    return count;
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  getEscrow(escrowId: string): EscrowRecord | undefined {
    return this.escrows.get(escrowId);
  }

  getEscrowByTask(taskId: string): EscrowRecord | undefined {
    for (const record of this.escrows.values()) {
      if (record.taskId === taskId) return record;
    }
    return undefined;
  }

  getStats() {
    const all = Array.from(this.escrows.values());
    const locked = all.filter((e) => e.state === 'locked');
    return {
      total: all.length,
      locked: locked.length,
      released: all.filter((e) => e.state === 'released').length,
      reclaimed: all.filter((e) => e.state === 'reclaimed').length,
      failed: all.filter((e) => e.state === 'failed').length,
      totalLockedHbar: locked.reduce((s, e) => s + e.amountHbar, 0),
    };
  }

  // ─── Audit ───────────────────────────────────────────────────────────────

  private async auditLog(type: string, record: EscrowRecord): Promise<void> {
    const auditTopicId = config.VERA_AUDIT_TOPIC_ID;
    if (!auditTopicId) return;

    const msg = JSON.stringify({
      type,
      escrowId: record.escrowId,
      taskId: record.taskId,
      amountHbar: record.amountHbar,
      state: record.state,
      timestamp: Date.now(),
    });

    try {
      // Submit via hederaMaster with HIP-993 wrapper
      await hederaMaster.submitMessage(auditTopicId, JSON.parse(msg), {
        maxChunkSize: 4096
      });
    } catch (error) {
      logger.warn('EscrowController', {
        message: 'Failed to write escrow audit log',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const escrowController = new EscrowController();
