/**
 * ClickHouse Metrics Adapter
 *
 * Complements Prometheus with a time-series columnar store for historical
 * analytics, SQL-based reporting, and long-term retention of lattice metrics.
 *
 * Requires: ClickHouse running at CLICKHOUSE_URL (default http://localhost:8123)
 * Install: docker run -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server
 */

import { logger } from '../monitoring/logger.js';

interface ClickHouseConfig {
  url: string;
  database: string;
  username: string;
  password: string;
}

function getConfig(): ClickHouseConfig {
  return {
    url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DATABASE || 'vera_metrics',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  };
}

async function query(
  sql: string,
  body?: string,
  format: 'JSONEachRow' | 'JSONCompact' = 'JSONEachRow'
): Promise<unknown> {
  const cfg = getConfig();
  const params = new URLSearchParams({
    database: cfg.database,
    query: sql,
    default_format: format,
  });

  const res = await fetch(`${cfg.url}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`,
      'Content-Type': 'application/octet-stream',
    },
    body: body ?? undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ClickHouse ${res.status}: ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

// ─── Schema Bootstrap ───────────────────────────────────────────────────────

export async function ensureSchema(): Promise<void> {
  const cfg = getConfig();
  await query(`CREATE DATABASE IF NOT EXISTS ${cfg.database}`);

  await query(`
    CREATE TABLE IF NOT EXISTS ${cfg.database}.agent_metrics (
      timestamp DateTime64(3),
      agent_id LowCardinality(String),
      event LowCardinality(String),
      latency_ms UInt32,
      success UInt8,
      tokens_used UInt32,
      cost_usd Float64,
      model LowCardinality(String),
      provider LowCardinality(String),
      shard_id String,
      INDEX idx_agent agent_id TYPE bloom_filter GRANULARITY 3,
      INDEX idx_event event TYPE bloom_filter GRANULARITY 3
    ) ENGINE = MergeTree()
    ORDER BY (timestamp, agent_id)
    TTL timestamp + INTERVAL 90 DAY
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ${cfg.database}.lattice_pulses (
      timestamp DateTime64(3),
      pulse_id String,
      type LowCardinality(String),
      layer UInt8,
      energy Float64,
      node_id LowCardinality(String),
      edge_id String,
      message_size UInt32,
      propagation_ms UInt32,
    ) ENGINE = MergeTree()
    ORDER BY (timestamp, type, layer)
    TTL timestamp + INTERVAL 30 DAY
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ${cfg.database}.payments (
      timestamp DateTime64(3),
      tx_id String,
      payer LowCardinality(String),
      payee LowCardinality(String),
      amount_hbar Float64,
      amount_usd Float64,
      service LowCardinality(String),
      status LowCardinality(String),
      topic_id String,
      sequence_number UInt64,
    ) ENGINE = MergeTree()
    ORDER BY (timestamp, payer)
    TTL timestamp + INTERVAL 365 DAY
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ${cfg.database}.carbon_events (
      timestamp DateTime64(3),
      project_id String,
      tonnes Float64,
      verifier LowCardinality(String),
      standard LowCardinality(String),
      status LowCardinality(String),
      hashscan_url String,
    ) ENGINE = MergeTree()
    ORDER BY (timestamp, project_id)
    TTL timestamp + INTERVAL 365 DAY
  `);

  logger.info('ClickHouse', { message: 'Schema ensured', database: cfg.database });
}

// ─── Ingest ──────────────────────────────────────────────────────────────────

export async function ingestAgentMetric(metric: {
  timestamp: Date;
  agent_id: string;
  event: string;
  latency_ms: number;
  success: boolean;
  tokens_used?: number;
  cost_usd?: number;
  model?: string;
  provider?: string;
  shard_id?: string;
}): Promise<void> {
  const cfg = getConfig();
  const ts = metric.timestamp.toISOString().replace('T', ' ').replace('Z', '');
  const row = JSON.stringify({
    timestamp: ts,
    agent_id: metric.agent_id,
    event: metric.event,
    latency_ms: metric.latency_ms,
    success: metric.success ? 1 : 0,
    tokens_used: metric.tokens_used ?? 0,
    cost_usd: metric.cost_usd ?? 0,
    model: metric.model ?? '',
    provider: metric.provider ?? '',
    shard_id: metric.shard_id ?? '',
  });
  await query(
    `INSERT INTO ${cfg.database}.agent_metrics FORMAT JSONEachRow`,
    row + '\n'
  );
}

export async function ingestLatticePulse(pulse: {
  timestamp: Date;
  pulse_id: string;
  type: string;
  layer: number;
  energy: number;
  node_id?: string;
  edge_id?: string;
  message_size?: number;
  propagation_ms?: number;
}): Promise<void> {
  const cfg = getConfig();
  const ts = pulse.timestamp.toISOString().replace('T', ' ').replace('Z', '');
  const row = JSON.stringify({
    timestamp: ts,
    pulse_id: pulse.pulse_id,
    type: pulse.type,
    layer: pulse.layer,
    energy: pulse.energy,
    node_id: pulse.node_id ?? '',
    edge_id: pulse.edge_id ?? '',
    message_size: pulse.message_size ?? 0,
    propagation_ms: pulse.propagation_ms ?? 0,
  });
  await query(
    `INSERT INTO ${cfg.database}.lattice_pulses FORMAT JSONEachRow`,
    row + '\n'
  );
}

export async function ingestPayment(payment: {
  timestamp: Date;
  tx_id: string;
  payer: string;
  payee: string;
  amount_hbar: number;
  amount_usd: number;
  service: string;
  status: string;
  topic_id?: string;
  sequence_number?: number;
}): Promise<void> {
  const cfg = getConfig();
  const ts = payment.timestamp.toISOString().replace('T', ' ').replace('Z', '');
  const row = JSON.stringify({
    timestamp: ts,
    tx_id: payment.tx_id,
    payer: payment.payer,
    payee: payment.payee,
    amount_hbar: payment.amount_hbar,
    amount_usd: payment.amount_usd,
    service: payment.service,
    status: payment.status,
    topic_id: payment.topic_id ?? '',
    sequence_number: payment.sequence_number ?? 0,
  });
  await query(
    `INSERT INTO ${cfg.database}.payments FORMAT JSONEachRow`,
    row + '\n'
  );
}

export async function ingestCarbonEvent(event: {
  timestamp: Date;
  project_id: string;
  tonnes: number;
  verifier: string;
  standard: string;
  status: string;
  hashscan_url?: string;
}): Promise<void> {
  const cfg = getConfig();
  const ts = event.timestamp.toISOString().replace('T', ' ').replace('Z', '');
  const row = JSON.stringify({
    timestamp: ts,
    project_id: event.project_id,
    tonnes: event.tonnes,
    verifier: event.verifier,
    standard: event.standard,
    status: event.status,
    hashscan_url: event.hashscan_url ?? '',
  });
  await query(
    `INSERT INTO ${cfg.database}.carbon_events FORMAT JSONEachRow`,
    row + '\n'
  );
}

// ─── Analytics Queries ───────────────────────────────────────────────────────

export async function getAgentPerformance(
  hours: number = 24
): Promise<Array<Record<string, unknown>>> {
  if (hours < 0 || hours > 8760) throw new Error('hours must be 0–8760');
  const cfg = getConfig();
  const res = (await query(`
    SELECT
      agent_id,
      count() as calls,
      avg(latency_ms) as avg_latency,
      quantile(0.95)(latency_ms) as p95_latency,
      sum(success) / count() as success_rate,
      sum(cost_usd) as total_cost
    FROM ${cfg.database}.agent_metrics
    WHERE timestamp > now() - INTERVAL ${hours} HOUR
    GROUP BY agent_id
    ORDER BY calls DESC
  `)) as Array<Record<string, unknown>>;
  return res;
}

export async function getLatticeEnergyFlow(
  hours: number = 1
): Promise<Array<Record<string, unknown>>> {
  if (hours < 0 || hours > 8760) throw new Error('hours must be 0–8760');
  const cfg = getConfig();
  const res = (await query(`
    SELECT
      type,
      layer,
      count() as pulses,
      avg(energy) as avg_energy,
      max(energy) as peak_energy,
      avg(propagation_ms) as avg_propagation
    FROM ${cfg.database}.lattice_pulses
    WHERE timestamp > now() - INTERVAL ${hours} HOUR
    GROUP BY type, layer
    ORDER BY pulses DESC
  `)) as Array<Record<string, unknown>>;
  return res;
}

export async function getPaymentVolume(
  hours: number = 24
): Promise<Array<Record<string, unknown>>> {
  if (hours < 0 || hours > 8760) throw new Error('hours must be 0–8760');
  const cfg = getConfig();
  const res = (await query(`
    SELECT
      toStartOfHour(timestamp) as hour,
      count() as tx_count,
      sum(amount_hbar) as hbar_volume,
      sum(amount_usd) as usd_volume,
      uniq(payer) as unique_payers
    FROM ${cfg.database}.payments
    WHERE timestamp > now() - INTERVAL ${hours} HOUR
    GROUP BY hour
    ORDER BY hour ASC
  `)) as Array<Record<string, unknown>>;
  return res;
}
