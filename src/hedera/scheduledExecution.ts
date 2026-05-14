/**
 * Scheduled Transaction Executor (HIP-1215)
 *
 * Wraps Hedera's ScheduleCreateTransaction so Vera can propose state-changing
 * operations that require threshold council approval before execution.
 *
 * Flow:
 * 1. Vera detects a condition (e.g. carbon asset threshold on VNX)
 * 2. Creates a ScheduleCreateTransaction with the operation
 * 3. hinTS council members sign the scheduled transaction independently
 * 4. Once threshold signatures are collected, transaction auto-executes on Hedera
 *
 * This ensures that even if one agent is compromised, the sovereignty of the
 * VERA L0 node remains intact.
 */

import {
  Client,
  ScheduleCreateTransaction,
  ScheduleDeleteTransaction,
  ScheduleId,
  ScheduleInfoQuery,
  ScheduleSignTransaction,
  Transaction,
  PrivateKey,
  AccountId,
  Timestamp,
} from '@hashgraph/sdk';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import { hintsCouncil } from '../crypto/hintsShim.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ScheduledOperation {
  id: string;
  type: 'carbon_retirement' | 'token_transfer' | 'topic_message' | 'contract_call' | 'custom';
  description: string;
  transaction?: Transaction; // The inner transaction to schedule; not persisted
  threshold: number; // Number of council signatures required
  proposer: string; // Agent ID who proposed this
  proposedAt: number;
  status: 'pending' | 'signed' | 'executed' | 'cancelled' | 'expired' | 'failed';
  signatures: Array<{ memberId: string; timestamp: number }>;
  scheduleId?: string; // Hedera Schedule ID once created
  expiresAt?: number;
  lastError?: string;
  onChain?: {
    executed?: boolean;
    deleted?: boolean;
    memo?: string;
    payerAccountId?: string;
    creatorAccountId?: string;
    expirationTime?: number;
    waitForExpiry?: boolean;
  };
}

export interface ScheduleConfig {
  payerAccountId: string;
  operatorKey: string;
  network: 'mainnet' | 'testnet';
  storagePath?: string;
  minThreshold?: number;
  maxThreshold?: number;
  defaultExpiryMs?: number;
  dryRun?: boolean;
}

// ─── Scheduled Execution Manager ───────────────────────────────────────────

export class ScheduledExecutionManager {
  private client: Client | null = null;
  private operations = new Map<string, ScheduledOperation>();
  private initialized = false;
  private readonly storagePath: string;
  private readonly minThreshold: number;
  private readonly maxThreshold: number;
  private readonly defaultExpiryMs: number;
  private readonly dryRun: boolean;

  constructor(options: Partial<ScheduleConfig> = {}) {
    this.storagePath = options.storagePath ?? path.join(process.cwd(), 'data', 'scheduled-operations.json');
    this.minThreshold = options.minThreshold ?? 1;
    this.maxThreshold = options.maxThreshold ?? 6;
    this.defaultExpiryMs = options.defaultExpiryMs ?? 24 * 60 * 60 * 1000;
    this.dryRun = options.dryRun ?? false;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadOperations();

    if (this.dryRun) {
      this.initialized = true;
      logger.info('ScheduledExecution', {
        message: 'Schedule manager initialized in dry-run mode',
        persistedOperations: this.operations.size,
      });
      return;
    }

    if (!config.HEDERA_OPERATOR_ACCOUNT_ID || !config.HEDERA_OPERATOR_PRIVATE_KEY) {
      logger.warn('ScheduledExecution', {
        message: 'Hedera operator not configured — scheduled transactions disabled',
      });
      return;
    }

    this.client = config.HEDERA_NETWORK === 'mainnet'
      ? Client.forMainnet()
      : Client.forTestnet();
    this.client.setOperator(
      AccountId.fromString(config.HEDERA_OPERATOR_ACCOUNT_ID),
      PrivateKey.fromString(config.HEDERA_OPERATOR_PRIVATE_KEY)
    );

    this.initialized = true;
    logger.info('ScheduledExecution', {
      message: 'Schedule manager initialized',
      network: config.HEDERA_NETWORK,
      payer: config.HEDERA_OPERATOR_ACCOUNT_ID,
    });
  }

  /**
   * Propose a state-changing operation that requires council approval.
   * Creates a ScheduleCreateTransaction on Hedera.
   */
  async proposeOperation(
    type: ScheduledOperation['type'],
    description: string,
    innerTransaction: Transaction,
    proposerId: string,
    threshold = 3
  ): Promise<ScheduledOperation> {
    await this.initialize();
    this.validateThreshold(threshold);

    if (!this.client && !this.dryRun) {
      throw new Error('Scheduled execution not initialized — missing Hedera credentials');
    }

    const id = `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const expiresAt = Date.now() + this.defaultExpiryMs;
    let scheduleId: string | undefined;

    if (this.client) {
      // Create the scheduled transaction on Hedera
      const operatorKey = PrivateKey.fromString(config.HEDERA_OPERATOR_PRIVATE_KEY!);
      const scheduleTx = new ScheduleCreateTransaction()
        .setScheduledTransaction(innerTransaction)
        .setAdminKey(operatorKey.publicKey)
        .setPayerAccountId(AccountId.fromString(config.HEDERA_OPERATOR_ACCOUNT_ID!))
        .setExpirationTime(Timestamp.fromDate(new Date(expiresAt)));

      const response = await scheduleTx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      scheduleId = receipt.scheduleId?.toString();
    } else {
      scheduleId = `dry-run-${id}`;
    }

    const operation: ScheduledOperation = {
      id,
      type,
      description,
      transaction: innerTransaction,
      threshold,
      proposer: proposerId,
      proposedAt: Date.now(),
      status: 'pending',
      signatures: [],
      scheduleId,
      expiresAt,
    };

    this.operations.set(id, operation);
    await this.persistOperations();

    logger.info('ScheduledExecution', {
      message: 'Operation proposed and scheduled on Hedera',
      operationId: id,
      scheduleId,
      type,
      proposer: proposerId,
      threshold,
    });

    return operation;
  }

  /**
   * A council member signs the scheduled transaction.
   * In production, this calls ScheduleSignTransaction with the member's key.
   * With the hinTS shim, we collect signatures locally before submitting.
   */
  async signOperation(operationId: string, memberId: string): Promise<boolean> {
    await this.initialize();
    const operation = this.operations.get(operationId);
    if (!operation) {
      logger.warn('ScheduledExecution', { message: 'Operation not found', operationId });
      return false;
    }

    if (operation.status === 'executed' || operation.status === 'cancelled') {
      logger.warn('ScheduledExecution', {
        message: 'Operation already finalized',
        operationId,
        status: operation.status,
      });
      return false;
    }
    if (this.markExpiredIfNeeded(operation)) {
      await this.persistOperations();
      logger.warn('ScheduledExecution', {
        message: 'Operation expired before signature',
        operationId,
        memberId,
      });
      return false;
    }
    if (operation.signatures.some(sig => sig.memberId === memberId)) {
      logger.warn('ScheduledExecution', {
        message: 'Duplicate council signature ignored',
        operationId,
        memberId,
      });
      return false;
    }

    // Record local signature via hinTS council
    const payload = new TextEncoder().encode(operation.id);
    const partial = hintsCouncil.signPartial(memberId, payload);
    if (!partial) {
      logger.error('ScheduledExecution', {
        message: 'Failed to produce partial signature',
        operationId,
        memberId,
      });
      return false;
    }

    operation.signatures.push({ memberId, timestamp: Date.now() });
    operation.status = operation.signatures.length >= operation.threshold ? 'signed' : 'pending';
    await this.persistOperations();

    logger.info('ScheduledExecution', {
      message: 'Council member signed operation',
      operationId,
      memberId,
      signaturesCollected: operation.signatures.length,
      threshold: operation.threshold,
    });

    // If threshold met, submit to Hedera for execution
    if (operation.signatures.length >= operation.threshold) {
      await this.executeOperation(operation);
    }

    return true;
  }

  /**
   * Submit threshold signatures to Hedera to trigger execution.
   */
  private async executeOperation(operation: ScheduledOperation): Promise<void> {
    if (!operation.scheduleId) return;

    try {
      if (this.markExpiredIfNeeded(operation)) {
        await this.persistOperations();
        return;
      }

      // Build aggregated signature from all collected partials
      const payload = new TextEncoder().encode(operation.id);
      const partials = operation.signatures
        .map(s => hintsCouncil.signPartial(s.memberId, payload))
        .filter(Boolean) as NonNullable<ReturnType<typeof hintsCouncil.signPartial>>[];

      const aggregated = hintsCouncil.aggregateSignatures(payload, partials);
      if (!aggregated) {
        logger.error('ScheduledExecution', {
          message: 'Failed to aggregate threshold signatures',
          operationId: operation.id,
        });
        return;
      }

      if (!this.client || this.dryRun) {
        operation.status = 'executed';
        await this.persistOperations();
        this.emit('executed', operation);
        return;
      }

      // Submit ScheduleSignTransaction for each council member
      for (const sig of operation.signatures) {
        const scheduleSign = new ScheduleSignTransaction()
          .setScheduleId(operation.scheduleId!)
          .freezeWith(this.client);

        const keyHex = hintsCouncil.getMemberKeyHex(sig.memberId);
        if (keyHex) {
          const key = PrivateKey.fromStringED25519(keyHex);
          await scheduleSign.sign(key);
        }

        await scheduleSign.execute(this.client);
      }

      operation.status = 'executed';
      await this.refreshScheduleInfo(operation.id);
      await this.persistOperations();
      logger.info('ScheduledExecution', {
        message: 'Scheduled operation executed on Hedera',
        operationId: operation.id,
        scheduleId: operation.scheduleId,
        signers: operation.signatures.map(s => s.memberId),
        algorithm: aggregated.algorithm,
      });

      this.emit('executed', operation);
    } catch (err) {
      operation.status = 'failed';
      operation.lastError = err instanceof Error ? err.message : String(err);
      await this.persistOperations();
      logger.error('ScheduledExecution', {
        message: 'Execution failed',
        operationId: operation.id,
        error: operation.lastError,
      });
    }
  }

  /**
   * Cancel a pending operation (only the admin/payer can do this on-chain).
   */
  async cancelOperation(operationId: string): Promise<boolean> {
    const operation = this.operations.get(operationId);
    if (!operation) return false;
    if (operation.status === 'executed') return false;

    if (this.client && operation.scheduleId && !this.dryRun && !operation.scheduleId.startsWith('dry-run-')) {
      try {
        const response = await new ScheduleDeleteTransaction()
          .setScheduleId(ScheduleId.fromString(operation.scheduleId))
          .freezeWith(this.client)
          .execute(this.client);
        await response.getReceipt(this.client);
      } catch (err) {
        operation.status = 'failed';
        operation.lastError = err instanceof Error ? err.message : String(err);
        await this.persistOperations();
        logger.error('ScheduledExecution', {
          message: 'On-chain cancel failed',
          operationId,
          scheduleId: operation.scheduleId,
          error: operation.lastError,
        });
        return false;
      }
    }

    operation.status = 'cancelled';
    await this.persistOperations();
    logger.info('ScheduledExecution', {
      message: 'Operation cancelled',
      operationId,
      scheduleId: operation.scheduleId,
    });

    return true;
  }

  async refreshScheduleInfo(operationId: string): Promise<ScheduledOperation | undefined> {
    const operation = this.operations.get(operationId);
    if (!operation || !operation.scheduleId || !this.client || operation.scheduleId.startsWith('dry-run-')) {
      return operation;
    }

    try {
      const info = await new ScheduleInfoQuery()
        .setScheduleId(ScheduleId.fromString(operation.scheduleId))
        .execute(this.client);

      operation.onChain = {
        executed: info.executed !== null,
        deleted: info.deleted !== null,
        memo: info.scheduleMemo,
        payerAccountId: info.payerAccountId?.toString(),
        creatorAccountId: info.creatorAccountId?.toString(),
        expirationTime: info.expirationTime?.toDate().getTime(),
        waitForExpiry: info.waitForExpiry,
      };
      if (operation.onChain.executed) operation.status = 'executed';
      if (operation.onChain.deleted) operation.status = 'cancelled';
      await this.persistOperations();
    } catch (err) {
      operation.lastError = err instanceof Error ? err.message : String(err);
      await this.persistOperations();
      logger.warn('ScheduledExecution', {
        message: 'Schedule info refresh failed',
        operationId,
        scheduleId: operation.scheduleId,
        error: operation.lastError,
      });
    }

    return operation;
  }

  getOperation(id: string): ScheduledOperation | undefined {
    return this.operations.get(id);
  }

  getAllOperations(): ScheduledOperation[] {
    return Array.from(this.operations.values());
  }

  getPendingOperations(): ScheduledOperation[] {
    return this.getAllOperations().filter(o => {
      this.markExpiredIfNeeded(o);
      return o.status === 'pending' || o.status === 'signed';
    });
  }

  private validateThreshold(threshold: number): void {
    if (!Number.isInteger(threshold) || threshold < this.minThreshold || threshold > this.maxThreshold) {
      throw new Error(`Invalid schedule threshold: ${threshold}. Expected ${this.minThreshold}-${this.maxThreshold}.`);
    }
  }

  private markExpiredIfNeeded(operation: ScheduledOperation): boolean {
    if (
      operation.expiresAt &&
      Date.now() > operation.expiresAt &&
      operation.status !== 'executed' &&
      operation.status !== 'cancelled'
    ) {
      operation.status = 'expired';
      return true;
    }
    return operation.status === 'expired';
  }

  private async loadOperations(): Promise<void> {
    try {
      const raw = await readFile(this.storagePath, 'utf-8');
      const stored = JSON.parse(raw) as ScheduledOperation[];
      this.operations.clear();
      for (const operation of stored) {
        if (typeof operation?.id === 'string' && typeof operation?.type === 'string') {
          this.operations.set(operation.id, operation);
        }
      }
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code?: string }).code : undefined;
      if (code !== 'ENOENT') {
        logger.warn('ScheduledExecution', {
          message: 'Failed to load scheduled operation store',
          storagePath: this.storagePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async persistOperations(): Promise<void> {
    await mkdir(path.dirname(this.storagePath), { recursive: true });
    const serializable = this.getAllOperations().map(({ transaction, ...operation }) => operation);
    await writeFile(this.storagePath, `${JSON.stringify(serializable, null, 2)}\n`, 'utf-8');
  }

  // Simple event emitter for execution notifications
  private listeners: Array<(op: ScheduledOperation) => void> = [];
  on(event: 'executed', handler: (op: ScheduledOperation) => void): void {
    if (event === 'executed') this.listeners.push(handler);
  }
  off(event: 'executed', handler: (op: ScheduledOperation) => void): void {
    if (event === 'executed') {
      this.listeners = this.listeners.filter(h => h !== handler);
    }
  }
  private emit(event: 'executed', op: ScheduledOperation): void {
    if (event === 'executed') this.listeners.forEach(h => h(op));
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

export const scheduledExecution = new ScheduledExecutionManager();
export default scheduledExecution;
