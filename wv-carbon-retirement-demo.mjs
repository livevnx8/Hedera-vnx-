#!/usr/bin/env node
/**
 * WV Power & Carbon Credit Retirement Demo
 * 
 * Demonstrates HIP-993 logging for:
 * - Real-time WV renewable power generation
 * - Automatic carbon credit calculation
 * - Full retirement logging to Hedera
 * 
 * Run: node wv-carbon-retirement-demo.mjs
 */

import { wvCarbonRetirementLogger } from './dist/carbon/wvCarbonRetirementLogger.js';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  ⚡ WV POWER + CARBON RETIREMENT LOGGER                            ║');
console.log('║  HIP-993 Full System Retirement Logging                            ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  wvCarbonRetirementLogger.stop();
  
  const stats = wvCarbonRetirementLogger.getStats();
  console.log('\n📊 FINAL STATISTICS:');
  console.log(`   Total Power Generated: ${stats.totalPowerGeneratedMWh.toFixed(2)} MWh`);
  console.log(`   Total CO2 Retired: ${stats.totalCO2Retired.toFixed(3)} tonnes`);
  console.log(`   Total Retirements: ${stats.totalRetirements}`);
  console.log(`   Batches Submitted: ${stats.batchesSubmitted}`);
  console.log(`   Pending: ${stats.pendingRetirements}`);
  console.log(`\n🔗 HashScan: ${wvCarbonRetirementLogger.getHashScanUrl()}`);
  console.log('\n✅ Logger stopped\n');
  process.exit(0);
});

// Start the logger
console.log('🚀 Starting WV Carbon Retirement Logger...\n');

await wvCarbonRetirementLogger.start();

const stats = wvCarbonRetirementLogger.getStats();

console.log('✅ Logger started successfully!\n');
console.log('📊 Configuration:');
console.log(`   HCS Topic: ${stats.config.hcsTopicId}`);
console.log(`   Monitoring Interval: ${stats.config.monitoringIntervalMs / 1000}s`);
console.log(`   Batch Interval: ${stats.config.batchSubmitIntervalMs / 1000}s`);
console.log(`   CO2 Factor: ${stats.config.co2PerMWh} tonnes/MWh`);

console.log('\n🔄 Running... (Press Ctrl+C to stop)');
console.log('═'.repeat(70));

// Status updates every 10 seconds
setInterval(() => {
  const current = wvCarbonRetirementLogger.getStats();
  console.log(`\n[${new Date().toLocaleTimeString()}] Status Update:`);
  console.log(`   ⚡ Power: ${current.totalPowerGeneratedMWh.toFixed(2)} MWh generated`);
  console.log(`   🌿 Carbon: ${current.totalCO2Retired.toFixed(3)} tonnes CO2 retired`);
  console.log(`   📋 Records: ${current.totalRetirements} retirements (${current.pendingRetirements} pending)`);
  console.log(`   📦 Batches: ${current.batchesSubmitted} submitted to HCS`);
}, 10000);

// Keep running
await new Promise(() => {});
