import Database from 'better-sqlite3';
import { config } from './config.js';

export type Db = Database.Database;

export const db = new Database(config.DATABASE_PATH);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB cache
db.pragma('temp_store = memory');
db.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT,
  permissions TEXT DEFAULT '[]',
  rate_limit_per_minute INTEGER DEFAULT 100,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  rate_limit_per_day INTEGER DEFAULT 10000,
  usage_quota_daily INTEGER DEFAULT NULL,
  expires_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  mirror_transaction_id TEXT NOT NULL,
  consensus_timestamp TEXT NOT NULL,
  tinybar_amount INTEGER NOT NULL,
  usd_rate REAL NOT NULL,
  usd_credited REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(mirror_transaction_id, consensus_timestamp),
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  prompt_hash TEXT,
  output_hash TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  cost_usd REAL,
  receipt_topic_id TEXT,
  receipt_sequence_number INTEGER,
  receipt_consensus_timestamp TEXT,
  receipt_transaction_id TEXT,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  job_id TEXT,
  deposit_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS balances (
  customer_id TEXT PRIMARY KEY,
  available_usd REAL NOT NULL,
  held_usd REAL NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  api_key_id TEXT,
  event_type TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  context TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(api_key_id) REFERENCES api_keys(id)
);

CREATE TABLE IF NOT EXISTS api_key_usage (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  requests_per_minute INTEGER DEFAULT 0,
  requests_per_hour INTEGER DEFAULT 0,
  requests_per_day INTEGER DEFAULT 0,
  last_minute_reset TEXT NOT NULL,
  last_hour_reset TEXT NOT NULL,
  last_day_reset TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(api_key_id) REFERENCES api_keys(id),
  UNIQUE(api_key_id, usage_date)
);
`);

export function nowIso() {
  return new Date().toISOString();
}

export function getOrCreateBalance(customerId: string) {
  const row = db
    .prepare('SELECT customer_id, available_usd, held_usd, updated_at FROM balances WHERE customer_id = ?')
    .get(customerId) as { customer_id: string; available_usd: number; held_usd: number; updated_at: string } | undefined;

  if (row) return row;

  const ts = nowIso();
  db.prepare('INSERT INTO balances (customer_id, available_usd, held_usd, updated_at) VALUES (?, ?, ?, ?)').run(
    customerId,
    0,
    0,
    ts
  );

  return {
    customer_id: customerId,
    available_usd: 0,
    held_usd: 0,
    updated_at: ts
  };
}

export function updateBalance(customerId: string, availableUsd: number, heldUsd: number) {
  db.prepare('UPDATE balances SET available_usd = ?, held_usd = ?, updated_at = ? WHERE customer_id = ?').run(
    availableUsd,
    heldUsd,
    nowIso(),
    customerId
  );
}
