#!/usr/bin/env node
/**
 * Simple Dashboard - Vera Agent Status
 */

const fs = require('fs');

console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  📊 VERA AGENT DASHBOARD                    ' + new Date().toLocaleTimeString() + '          ║');
console.log('║  Phase 4: Live HCS + ML Predictions                                  ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

const agents = [
  { name: '⚡ Energy Auditor', file: 'energy-auditor.log' },
  { name: '📈 DeFi Analyst', file: 'defi-analyst.log' },
  { name: '🔒 Security Guardian', file: 'security-guardian.log' },
  { name: '🌱 Carbon Validator', file: 'carbon-validator.log' }
];

let totalCycles = 0;

agents.forEach(a => {
  try {
    const log = fs.readFileSync('./logs/' + a.file, 'utf8');
    const cycles = (log.match(/CYCLE #/g) || []).length;
    const errors = (log.match(/❌|Error/g) || []).length;
    const ml = (log.match(/ML Forecast/g) || []).length;
    totalCycles += cycles;
    
    console.log(a.name);
    console.log('   🟢 RUNNING | Cycles: ' + cycles + ' | ML Predictions: ' + ml + ' | Errors: ' + errors);
  } catch(e) {
    console.log(a.name);
    console.log('   🔴 STOPPED | No log file');
  }
  console.log();
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📈 Total Cycles: ' + totalCycles + ' | HCS: LIVE | Queue: 500ms');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🔗 HashScan Topics:');
console.log('   ENERGY:  https://hashscan.io/mainnet/topic/0.0.10412579');
console.log('   DEFI:    https://hashscan.io/mainnet/topic/0.0.10412577');
console.log('   CORE:    https://hashscan.io/mainnet/topic/0.0.10409351');
console.log('   BRIDGE:  https://hashscan.io/mainnet/topic/0.0.10412578\n');
