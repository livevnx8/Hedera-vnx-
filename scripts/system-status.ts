#!/usr/bin/env tsx
/**
 * System Status Script
 * Shows current system health and metrics
 */

import { featureFlags } from '../src/vera/orchestrator/featureFlags.js';
import { rigState } from '../src/vera/rig/rigState.js';

async function showStatus() {
  const snapshot = await rigState.sampleNow();

  console.log('📊 VeraLattice System Status\n');
  console.log('=' .repeat(50));
  
  // Feature flags status
  console.log('\n🔧 Feature Flags:');
  const flags = featureFlags.getAll();
  console.log(`   Enable Mainnet: ${flags.enableMainnetOperations ? '✅' : '❌'}`);
  console.log(`   Dry Run Mode: ${flags.dryRunMode ? '✅' : '❌'}`);
  console.log(`   Shadow Mode: ${flags.shadowMode ? '✅' : '❌'}`);
  
  // Safety limits
  console.log('\n🛡️  Safety Limits:');
  console.log(`   Max HBAR/Settlement: ${flags.maxHbarPerSettlement}`);
  console.log(`   Max Settlements/Hour: ${flags.maxSettlementsPerHour}`);
  console.log(`   Require MultiSig: ${flags.requireMultiSigForLargePayments ? '✅' : '❌'}`);
  
  // X402 config
  console.log('\n💰 X402 Payments:');
  console.log(`   Enabled: ${flags.enableX402Settlement ? '✅' : '❌'}`);
  console.log(`   Percentage: ${flags.x402TrafficPercentage}%`);
  
  // Lattice config
  console.log('\n🧠 Lattice Reasoning:');
  console.log(`   Enabled: ${flags.enableLatticeReasoning ? '✅' : '❌'}`);
  
  // Environment
  console.log('\n🌐 Environment:');
  console.log(`   Network: ${process.env.HEDERA_NETWORK || 'not set'}`);
  console.log(`   Operator: ${process.env.HEDERA_OPERATOR_ACCOUNT_ID || 'not set'}`);

  console.log('\n🖥️  Rig State:');
  console.log(`   Host: ${snapshot.hostname}`);
  console.log(`   CPU Load (1m normalized): ${(snapshot.cpu.normalizedLoad1m * 100).toFixed(1)}%`);
  console.log(`   Memory Utilization: ${(snapshot.memory.utilization * 100).toFixed(1)}%`);
  console.log(`   Rig Health: ${snapshot.health}`);
  if (snapshot.disks.length > 0) {
    const primaryDisk = snapshot.disks[0];
    if (primaryDisk.utilization !== null) {
      console.log(`   Primary Disk (${primaryDisk.path}): ${(primaryDisk.utilization * 100).toFixed(1)}% used`);
    }
  }
  console.log(`   GPU Available: ${snapshot.gpu.available ? '✅' : '❌'}`);
  
  console.log('\n' + '='.repeat(50));
}

showStatus();
