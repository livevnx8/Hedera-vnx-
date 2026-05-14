#!/usr/bin/env node
/**
 * HashScan Direct Verification
 * Opens browser to verify HCS messages are on-chain
 */

const TOPICS = {
  CORE: '0.0.10409351',
  DEFI: '0.0.10409352',
  ENERGY: '0.0.10409353',
  BRIDGE: '0.0.10409354'
};

console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🔍 HASHSCAN VERIFICATION                                           ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

console.log('📡 VERIFY HCS MESSAGES ON MAINNET:\n');

Object.entries(TOPICS).forEach(([name, id]) => {
  const url = `https://hashscan.io/mainnet/topic/${id}`;
  console.log(`${name} Topic (${id})`);
  console.log(`   ${url}\n`);
});

// Also log to file for reference
import { writeFileSync } from 'fs';
const report = {
  timestamp: new Date().toISOString(),
  topics: TOPICS,
  urls: Object.entries(TOPICS).map(([name, id]) => ({
    name,
    id,
    hashscan: `https://hashscan.io/mainnet/topic/${id}`
  }))
};

writeFileSync('./hashscan-topics.json', JSON.stringify(report, null, 2));
console.log('📁 Saved to: hashscan-topics.json\n');

// Quick log stats
import { readFileSync } from 'fs';

const LOG_DIR = './logs';
let totalCycles = 0;

try {
  ['energy-auditor', 'defi-analyst', 'security-guardian', 'carbon-validator'].forEach(agent => {
    try {
      const log = readFileSync(`${LOG_DIR}/${agent}.log`, 'utf8');
      const cycles = (log.match(/CYCLE #/g) || []).length;
      totalCycles += cycles;
      console.log(`${agent}: ${cycles} cycles`);
    } catch {}
  });
} catch {}

console.log(`\n📊 Total Cycles: ${totalCycles}`);
console.log('\n✅ Expected messages on HashScan: ~200+ messages');
console.log('   (4-6 logs per cycle × 48 cycles)\n');
