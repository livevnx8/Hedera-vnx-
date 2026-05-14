/**
 * Vera's Tool Health Monitor
 * 
 * Tracks success/failure per tool. Surfaces failing tools for Vera to avoid or debug.
 */
import fs from 'fs';

const HEALTH_PATH = '/mnt/vera-mirror-shards/vera-lattice/tool-health.json';
const FLUSH_MS = 30_000;

type Health = {
  successes: number;
  failures: number;
  lastError?: string;
  lastErrorAt?: number;
  avgDurationMs: number;
  totalDurationMs: number;
  totalCalls: number;
};

let health: Record<string, Health> = {};
let dirty = false;
let flushTimer: NodeJS.Timeout | null = null;

function load(): void {
  try {
    if (fs.existsSync(HEALTH_PATH)) {
      health = JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf8'));
    }
  } catch {}
}

function flush(): void {
  if (!dirty) return;
  try {
    fs.writeFileSync(HEALTH_PATH, JSON.stringify(health, null, 2));
    dirty = false;
  } catch {}
}

function ensureInit(): void {
  if (!flushTimer) {
    load();
    flushTimer = setInterval(flush, FLUSH_MS);
    flushTimer.unref?.();
  }
}

function ensureEntry(name: string): Health {
  if (!health[name]) {
    health[name] = {
      successes: 0,
      failures: 0,
      avgDurationMs: 0,
      totalDurationMs: 0,
      totalCalls: 0,
    };
  }
  return health[name];
}

export function recordHealth(toolName: string, success: boolean, durationMs: number, error?: string): void {
  ensureInit();
  const h = ensureEntry(toolName);
  h.totalCalls += 1;
  h.totalDurationMs += durationMs;
  h.avgDurationMs = h.totalDurationMs / h.totalCalls;
  if (success) {
    h.successes += 1;
  } else {
    h.failures += 1;
    if (error) {
      h.lastError = error.slice(0, 200);
      h.lastErrorAt = Date.now();
    }
  }
  dirty = true;
}

export function getToolHealth(toolName?: string): any {
  ensureInit();
  if (toolName) return health[toolName] || null;
  return health;
}

export function getUnhealthyTools(minCalls = 3): Array<{ name: string; successRate: number; failures: number; lastError?: string }> {
  ensureInit();
  const result: Array<{ name: string; successRate: number; failures: number; lastError?: string }> = [];
  for (const [name, h] of Object.entries(health)) {
    if (h.totalCalls < minCalls) continue;
    const successRate = h.successes / h.totalCalls;
    if (successRate < 0.8) {
      result.push({ name, successRate, failures: h.failures, lastError: h.lastError });
    }
  }
  return result.sort((a, b) => a.successRate - b.successRate);
}

process.once('beforeExit', flush);
process.once('SIGTERM', () => { flush(); process.exit(0); });
