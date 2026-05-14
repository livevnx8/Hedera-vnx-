import { config } from '../config.js';
import { qvxClient } from '../qvx/client.js';
import { db } from '../db.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS vnx_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_vnx_signals_type ON vnx_signals(event_type);
`);

export interface VnxSignalPayload {
  [key: string]: unknown;
}

const SCHEMA = {
  'vnx.train.started': ['modelName', 'corpusHash', 'contextSize', 'vertexCount'],
  'vnx.train.progress': ['progress', 'firedVertices', 'trainedTokens'],
  'vnx.train.completed': ['modelHash', 'perplexity', 'packedWeightBytes'],
  'vnx.inference.started': ['modelHash', 'promptHash'],
  'vnx.inference.completed': ['modelHash', 'outputHash', 'traceHash', 'generatedTokens', 'uniqueVertices'],
  'vnx.vertex.fired': ['token', 'vertex', 'probability', 'topCandidates'],
  'vnx.swarm.selected': ['promptHash', 'selected', 'maxSpecialists'],
  'vnx.swarm.context_injected': ['promptHash', 'selected', 'outputCount', 'enabled'],
} as const;

type VnxSignalType = keyof typeof SCHEMA;

function validateSignal(type: string, payload: VnxSignalPayload): string | null {
  const expected = SCHEMA[type as VnxSignalType];
  if (!expected) return `Unknown signal type: ${type}`;
  for (const key of expected) {
    if (!(key in payload)) return `Missing required key '${key}' in signal ${type}`;
  }
  return null;
}

function enrichPayload(payload: VnxSignalPayload): VnxSignalPayload {
  return {
    ...payload,
    _vera: {
      version: '1.0.0',
      schema: 'vnx-signal-1',
      network: config.HEDERA_NETWORK,
      env: process.env.NODE_ENV || 'production',
      timestamp: Date.now(),
    },
  };
}

export async function emitVnxSignal(type: VnxSignalType, payload: VnxSignalPayload): Promise<{ ok: boolean; buffered: boolean; error?: string }> {
  const validationError = validateSignal(type, payload);
  if (validationError) {
    return { ok: false, buffered: false, error: validationError };
  }

  const enriched = enrichPayload(payload);

  try {
    await qvxClient.emitVnxSignal(type, enriched);
    return { ok: true, buffered: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not configured')) {
      return { ok: false, buffered: false, error: message };
    }
    // Buffer to SQLite
    db.prepare('INSERT INTO vnx_signals (event_type, payload) VALUES (?, ?)').run(type, JSON.stringify(enriched));
    return { ok: false, buffered: true, error: message };
  }
}

export function flushBufferedSignals(): { flushed: number; errors: string[] } {
  if (!qvxClient.isConfigured) return { flushed: 0, errors: ['QVX node not configured'] };

  const rows = db.prepare('SELECT id, event_type, payload FROM vnx_signals ORDER BY id ASC').all() as Array<{ id: number; event_type: string; payload: string }>;
  let flushed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as VnxSignalPayload;
      qvxClient.emitVnxSignal(row.event_type, payload);
      db.prepare('DELETE FROM vnx_signals WHERE id = ?').run(row.id);
      flushed++;
    } catch (error) {
      errors.push(String(error instanceof Error ? error.message : error));
    }
  }

  return { flushed, errors };
}
