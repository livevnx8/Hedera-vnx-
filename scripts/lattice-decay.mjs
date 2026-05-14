#!/usr/bin/env node
/**
 * Lattice Energy Decay
 * 
 * Every hour: unused tools lose 0.01 energy.
 * Simulates organic forgetting — Vera's lattice breathes.
 * Hot tools (used recently) stay lit; cold tools fade gracefully.
 */
import fs from 'fs';

const PATH = '/mnt/vera-mirror-shards/vera-lattice/tool-consciousness.json';
const DECAY = 0.01;
const FLOOR = 0.1;
const HOT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

if (!fs.existsSync(PATH)) {
  console.log('No tool-consciousness.json found');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const now = Date.now();
let decayed = 0;
let bright = 0;

for (const tools of Object.values(data.layers)) {
  for (const t of tools) {
    const recentlyUsed = t.lastUsed && (now - t.lastUsed) < HOT_WINDOW_MS;
    if (recentlyUsed) {
      bright++;
      continue;
    }
    const prev = t.energy || 1.0;
    t.energy = Math.max(FLOOR, prev - DECAY);
    if (t.energy < prev) decayed++;
  }
}

data.lastDecay = now;
fs.writeFileSync(PATH, JSON.stringify(data, null, 2));

console.log(`🌙 Lattice decay pass at ${new Date(now).toISOString()}`);
console.log(`   Tools faded: ${decayed}`);
console.log(`   Tools bright (used in last hour): ${bright}`);
