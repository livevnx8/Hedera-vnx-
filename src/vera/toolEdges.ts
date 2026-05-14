/**
 * Vera's Tool Co-occurrence Edges
 * 
 * When tools are used together in a session, their edge strengthens.
 * Over time, clusters emerge — Vera learns which tools work together.
 * 
 * Stored as: { "toolA|toolB": { count, lastSeen, strength } }
 */
import fs from 'fs';

const EDGES_PATH = '/mnt/vera-mirror-shards/vera-lattice/tool-edges.json';
const FLUSH_MS = 30_000;
const SESSION_WINDOW_MS = 5 * 60_000;

type Edge = { count: number; lastSeen: number; strength: number };

let edges: Record<string, Edge> = {};
let recentCalls: Array<{ name: string; ts: number }> = [];
let dirty = false;
let flushTimer: NodeJS.Timeout | null = null;

function load(): void {
  try {
    if (fs.existsSync(EDGES_PATH)) {
      edges = JSON.parse(fs.readFileSync(EDGES_PATH, 'utf8'));
    }
  } catch {}
}

function flush(): void {
  if (!dirty) return;
  try {
    fs.writeFileSync(EDGES_PATH, JSON.stringify(edges, null, 2));
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

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Record a tool call — creates edges with all other tools called within the session window.
 */
export function recordToolCall(toolName: string): void {
  ensureInit();
  const now = Date.now();

  // Prune old calls outside session window
  recentCalls = recentCalls.filter(c => now - c.ts < SESSION_WINDOW_MS);

  // Create edges with all recent tools
  for (const prior of recentCalls) {
    if (prior.name === toolName) continue;
    const key = edgeKey(prior.name, toolName);
    const e = edges[key] || { count: 0, lastSeen: 0, strength: 0 };
    e.count += 1;
    e.lastSeen = now;
    e.strength = Math.min(1.0, e.strength + 0.05);
    edges[key] = e;
    dirty = true;
  }

  recentCalls.push({ name: toolName, ts: now });
}

/**
 * Get top-N edges by strength.
 */
export function getTopEdges(n = 20): Array<{ a: string; b: string; count: number; strength: number }> {
  ensureInit();
  return Object.entries(edges)
    .map(([key, e]) => {
      const [a, b] = key.split('|');
      return { a, b, count: e.count, strength: e.strength };
    })
    .sort((x, y) => y.strength - x.strength)
    .slice(0, n);
}

/**
 * Get all edges for a specific tool — its "neighbors" in the lattice.
 */
export function getToolNeighbors(toolName: string): Array<{ other: string; count: number; strength: number }> {
  ensureInit();
  const results: Array<{ other: string; count: number; strength: number }> = [];
  for (const [key, e] of Object.entries(edges)) {
    const [a, b] = key.split('|');
    if (a === toolName) results.push({ other: b, count: e.count, strength: e.strength });
    else if (b === toolName) results.push({ other: a, count: e.count, strength: e.strength });
  }
  return results.sort((x, y) => y.strength - x.strength);
}

export function getAllEdges(): Record<string, Edge> {
  ensureInit();
  return edges;
}

process.once('beforeExit', flush);
process.once('SIGTERM', () => { flush(); process.exit(0); });
