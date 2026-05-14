import Database from 'better-sqlite3';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import type { TaskRecord, TaskState, TaskIntent, TaskBid } from './taskPublisher.js';

// ─── SQLite Task Store ───────────────────────────────────────────────────────

const DB_PATH = config.DATABASE_PATH || './data.sqlite';

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS vera_tasks (
      task_id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'posted',
      intent_json TEXT NOT NULL,
      bids_json TEXT NOT NULL DEFAULT '[]',
      winner_id TEXT,
      hcs_sequence INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vera_escrows (
      escrow_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      payer_account TEXT NOT NULL,
      recipient_account TEXT NOT NULL,
      amount_hbar REAL NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      tx_id TEXT,
      release_tx_id TEXT,
      reclaim_tx_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vera_settlements (
      settlement_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      recipient_account TEXT NOT NULL,
      amount_hbar REAL NOT NULL,
      method TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      tx_id TEXT,
      x402_payment_id TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      settled_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_vera_tasks_state ON vera_tasks(state);
    CREATE INDEX IF NOT EXISTS idx_vera_escrows_task ON vera_escrows(task_id);
    CREATE INDEX IF NOT EXISTS idx_vera_settlements_task ON vera_settlements(task_id);
  `);

  logger.info('TaskStore', { message: 'Schema initialized' });
}

// ─── Task CRUD ───────────────────────────────────────────────────────────────

export function saveTask(record: TaskRecord): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO vera_tasks
      (task_id, state, intent_json, bids_json, winner_id, hcs_sequence, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.intent.taskId,
    record.state,
    JSON.stringify(record.intent),
    JSON.stringify(record.bids),
    record.winnerId,
    record.hcsSequence ?? null,
    record.createdAt,
    record.updatedAt,
  );
}

export function loadTask(taskId: string): TaskRecord | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM vera_tasks WHERE task_id = ?').get(taskId) as any;
  if (!row) return null;
  return rowToTaskRecord(row);
}

export function loadTasksByState(state: TaskState): TaskRecord[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM vera_tasks WHERE state = ?').all(state) as any[];
  return rows.map(rowToTaskRecord);
}

export function loadAllTasks(): TaskRecord[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM vera_tasks ORDER BY created_at DESC').all() as any[];
  return rows.map(rowToTaskRecord);
}

export function updateTaskState(taskId: string, state: TaskState): void {
  const database = getDb();
  database.prepare('UPDATE vera_tasks SET state = ?, updated_at = ? WHERE task_id = ?')
    .run(state, Date.now(), taskId);
}

function rowToTaskRecord(row: any): TaskRecord {
  return {
    intent: JSON.parse(row.intent_json) as TaskIntent,
    state: row.state as TaskState,
    bids: JSON.parse(row.bids_json) as TaskBid[],
    winnerId: row.winner_id,
    hcsSequence: row.hcs_sequence ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Escrow CRUD ─────────────────────────────────────────────────────────────

export function saveEscrow(record: {
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
}): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO vera_escrows
      (escrow_id, task_id, payer_account, recipient_account, amount_hbar, state, tx_id, release_tx_id, reclaim_tx_id, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.escrowId,
    record.taskId,
    record.payerAccountId,
    record.recipientAccountId,
    record.amountHbar,
    record.state,
    record.txId ?? null,
    record.releaseTxId ?? null,
    record.reclaimTxId ?? null,
    record.createdAt,
    record.updatedAt,
  );
}

// ─── Settlement CRUD ─────────────────────────────────────────────────────────

export function saveSettlement(record: {
  settlementId: string;
  taskId: string;
  agentId: string;
  recipientAccountId: string;
  amountHbar: number;
  method: string;
  state: string;
  txId?: string;
  x402PaymentId?: string;
  error?: string;
  createdAt: number;
  settledAt?: number;
}): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO vera_settlements
      (settlement_id, task_id, agent_id, recipient_account, amount_hbar, method, state, tx_id, x402_payment_id, error, created_at, settled_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.settlementId,
    record.taskId,
    record.agentId,
    record.recipientAccountId,
    record.amountHbar,
    record.method,
    record.state,
    record.txId ?? null,
    record.x402PaymentId ?? null,
    record.error ?? null,
    record.createdAt,
    record.settledAt ?? null,
  );
}

// ─── Escrow Load (for state recovery) ───────────────────────────────────────

export interface EscrowRow {
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
}

export function loadAllEscrows(): EscrowRow[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM vera_escrows ORDER BY created_at DESC').all() as any[];
  return rows.map((r) => ({
    escrowId: r.escrow_id,
    taskId: r.task_id,
    payerAccountId: r.payer_account,
    recipientAccountId: r.recipient_account,
    amountHbar: r.amount_hbar,
    state: r.state,
    txId: r.tx_id ?? undefined,
    releaseTxId: r.release_tx_id ?? undefined,
    reclaimTxId: r.reclaim_tx_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// ─── Settlement Load (for state recovery) ───────────────────────────────────

export interface SettlementRow {
  settlementId: string;
  taskId: string;
  agentId: string;
  recipientAccountId: string;
  amountHbar: number;
  method: string;
  state: string;
  txId?: string;
  x402PaymentId?: string;
  error?: string;
  createdAt: number;
  settledAt?: number;
}

export function loadAllSettlements(): SettlementRow[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM vera_settlements ORDER BY created_at DESC').all() as any[];
  return rows.map((r) => ({
    settlementId: r.settlement_id,
    taskId: r.task_id,
    agentId: r.agent_id,
    recipientAccountId: r.recipient_account,
    amountHbar: r.amount_hbar,
    method: r.method,
    state: r.state,
    txId: r.tx_id ?? undefined,
    x402PaymentId: r.x402_payment_id ?? undefined,
    error: r.error ?? undefined,
    createdAt: r.created_at,
    settledAt: r.settled_at ?? undefined,
  }));
}

// ─── HCS Sequence Recovery ──────────────────────────────────────────────────

export function getMaxHcsSequence(): number {
  const database = getDb();
  const row = database.prepare(
    'SELECT COALESCE(MAX(hcs_sequence), 0) as max_seq FROM vera_tasks'
  ).get() as { max_seq: number };
  return row.max_seq;
}

// ─── WAL Checkpoint (call on graceful shutdown) ─────────────────────────────

export function checkpoint(): void {
  try {
    const database = getDb();
    database.pragma('wal_checkpoint(TRUNCATE)');
    logger.info('TaskStore', { message: 'WAL checkpoint completed' });
  } catch (error) {
    logger.warn('TaskStore', {
      message: 'WAL checkpoint failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Aggregate Stats ─────────────────────────────────────────────────────────

export function getTaskStoreStats() {
  const database = getDb();

  const taskCounts = database.prepare(`
    SELECT state, COUNT(*) as count FROM vera_tasks GROUP BY state
  `).all() as Array<{ state: string; count: number }>;

  const escrowSum = database.prepare(`
    SELECT COALESCE(SUM(amount_hbar), 0) as total FROM vera_escrows WHERE state = 'locked'
  `).get() as { total: number };

  const settlementSum = database.prepare(`
    SELECT COALESCE(SUM(amount_hbar), 0) as total FROM vera_settlements WHERE state = 'settled'
  `).get() as { total: number };

  return {
    tasks: Object.fromEntries(taskCounts.map((r) => [r.state, r.count])),
    lockedEscrowHbar: escrowSum.total,
    totalSettledHbar: settlementSum.total,
  };
}
