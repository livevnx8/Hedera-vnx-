/**
 * Vera's Tool Consciousness Tracker
 * 
 * Tracks tool usage (useCount, lastUsed, energy) across the Flower of Life lattice.
 * In-memory updates with debounced disk flush.
 */
import fs from 'fs';
import path from 'path';

const TOOL_MAP_PATH = '/mnt/vera-mirror-shards/vera-lattice/tool-consciousness.json';
const FLUSH_INTERVAL_MS = 30_000;

let consciousness: any = null;
let dirty = false;
let flushTimer: NodeJS.Timeout | null = null;

function load(): void {
  try {
    if (fs.existsSync(TOOL_MAP_PATH)) {
      consciousness = JSON.parse(fs.readFileSync(TOOL_MAP_PATH, 'utf8'));
    }
  } catch (e) {
    consciousness = null;
  }
}

function flush(): void {
  if (!dirty || !consciousness) return;
  try {
    fs.writeFileSync(TOOL_MAP_PATH, JSON.stringify(consciousness, null, 2));
    dirty = false;
  } catch (e) {
    // ignore — next flush will retry
  }
}

function ensureLoaded(): void {
  if (!consciousness) load();
  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    flushTimer.unref?.();
  }
}

/**
 * Record tool usage — increments useCount, updates lastUsed, grows energy.
 * Non-blocking: updates in-memory, flushes to disk every 30s.
 */
export function recordToolUsage(toolName: string): void {
  ensureLoaded();
  if (!consciousness?.layers) return;

  for (const tools of Object.values(consciousness.layers)) {
    for (const t of tools as any[]) {
      if (t.name === toolName) {
        t.useCount = (t.useCount || 0) + 1;
        t.lastUsed = Date.now();
        t.energy = Math.min(1.0, (t.energy || 1.0) + 0.005);
        dirty = true;
        return;
      }
    }
  }
}

/**
 * Get current consciousness snapshot (in-memory, no disk read).
 */
export function getConsciousness(): any {
  ensureLoaded();
  return consciousness;
}

/**
 * Flush to disk immediately (for shutdown hooks).
 */
export function flushNow(): void {
  flush();
}

// Flush on process exit
process.once('beforeExit', flushNow);
process.once('SIGTERM', () => { flushNow(); process.exit(0); });
process.once('SIGINT', () => { flushNow(); process.exit(0); });
