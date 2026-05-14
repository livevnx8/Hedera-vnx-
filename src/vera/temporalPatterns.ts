/**
 * Vera's Temporal Pattern Learning
 * 
 * Learns WHEN tools are used (hour-of-day, day-of-week, seasonal)
 * for predictive warming and optimization.
 */
import fs from 'fs';
import path from 'path';

const PATTERNS_PATH = '/mnt/vera-mirror-shards/vera-lattice/temporal-patterns.json';

interface HourlyPattern { hour: number; count: number; avgDuration: number; }
interface DailyPattern { day: number; count: number; tools: string[]; }

interface ToolTemporal {
  tool: string;
  hourly: HourlyPattern[];
  daily: DailyPattern[];
  lastUsed: number;
  useCount: number;
  hotHours: number[];
  hotDays: number[];
}

interface TemporalStore {
  tools: Record<string, ToolTemporal>;
  globalHotHours: number[];
  globalHotDays: number[];
  lastUpdated: number;
}

let store: TemporalStore = {
  tools: {},
  globalHotHours: [],
  globalHotDays: [],
  lastUpdated: 0,
};

let flushTimeout: NodeJS.Timeout | null = null;

function load(): void {
  try {
    if (fs.existsSync(PATTERNS_PATH)) {
      store = JSON.parse(fs.readFileSync(PATTERNS_PATH, 'utf8'));
    }
  } catch { /* silent */ }
}

function save(): void {
  try {
    const dir = path.dirname(PATTERNS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PATTERNS_PATH, JSON.stringify(store, null, 2));
  } catch { /* silent */ }
}

function debouncedSave(): void {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(save, 5000);
}

function updateHotWindows(pattern: ToolTemporal): void {
  // Hot = above average usage
  const avgHourly = pattern.hourly.reduce((s, h) => s + h.count, 0) / 24;
  pattern.hotHours = pattern.hourly
    .filter(h => h.count > avgHourly * 1.5)
    .map(h => h.hour)
    .slice(0, 6);

  const avgDaily = pattern.daily.reduce((s, d) => s + d.count, 0) / 7;
  pattern.hotDays = pattern.daily
    .filter(d => d.count > avgDaily * 1.5)
    .map(d => d.day);
}

export function recordTemporalUsage(tool: string, durationMs: number): void {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  if (!store.tools[tool]) {
    store.tools[tool] = {
      tool,
      hourly: Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, avgDuration: 0 })),
      daily: Array.from({ length: 7 }, (_, i) => ({ day: i, count: 0, tools: [] })),
      lastUsed: 0,
      useCount: 0,
      hotHours: [],
      hotDays: [],
    };
  }

  const p = store.tools[tool];
  p.lastUsed = Date.now();
  p.useCount++;

  // Update hourly
  const h = p.hourly[hour];
  h.count++;
  h.avgDuration = (h.avgDuration * (h.count - 1) + durationMs) / h.count;

  // Update daily
  const d = p.daily[day];
  d.count++;
  if (!d.tools.includes(tool)) d.tools.push(tool);

  updateHotWindows(p);
  updateGlobalPatterns();
  debouncedSave();
}

function updateGlobalPatterns(): void {
  // Aggregate across all tools
  const hourTotals = Array(24).fill(0);
  const dayTotals = Array(7).fill(0);

  for (const p of Object.values(store.tools)) {
    p.hourly.forEach((h, i) => hourTotals[i] += h.count);
    p.daily.forEach((d, i) => dayTotals[i] += d.count);
  }

  const avgHour = hourTotals.reduce((a, b) => a + b, 0) / 24;
  store.globalHotHours = hourTotals
    .map((c, i) => ({ i, c }))
    .filter(({ c }) => c > avgHour * 1.3)
    .map(({ i }) => i);

  const avgDay = dayTotals.reduce((a, b) => a + b, 0) / 7;
  store.globalHotDays = dayTotals
    .map((c, i) => ({ i, c }))
    .filter(({ c }) => c > avgDay * 1.3)
    .map(({ i }) => i);
}

export function predictHotTools(nextMinutes = 15): string[] {
  const now = new Date();
  const hour = now.getHours();
  const nextHour = (hour + Math.floor(nextMinutes / 60)) % 24;

  return Object.values(store.tools)
    .filter(p => p.hotHours.includes(nextHour) || p.hotHours.includes(hour))
    .sort((a, b) => b.useCount - a.useCount)
    .slice(0, 10)
    .map(p => p.tool);
}

export function getTemporalStats(): TemporalStore {
  load();
  return store;
}

export function getToolTemporal(tool: string): ToolTemporal | null {
  load();
  return store.tools[tool] || null;
}

export function isHotHour(hour?: number): boolean {
  load();
  const h = hour ?? new Date().getHours();
  return store.globalHotHours.includes(h);
}

// Initialize
load();
