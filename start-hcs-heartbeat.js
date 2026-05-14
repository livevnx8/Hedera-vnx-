#!/usr/bin/env node

/**
 * Start HCS Heartbeat
 * Simple script to start and monitor the HCS heartbeat system
 */

const { veraHCSIntegration } = require('./vera-hcs-integration.js');

console.log('🫀 Starting Vera HCS Heartbeat\n');
console.log('================================\n');

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  await veraHCSIntegration.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Shutting down...');
  await veraHCSIntegration.shutdown();
  process.exit(0);
});

// Initialize and start
async function start() {
  try {
    await veraHCSIntegration.initialize();
    
    const status = veraHCSIntegration.getStatus();
    console.log('\n✅ HCS Heartbeat Active!\n');
    console.log('Status:', JSON.stringify(status, null, 2));
    
    console.log('\n📊 Press Ctrl+C to stop\n');
    
    // Keep alive
    setInterval(() => {
      const hbStatus = veraHCSIntegration.heartbeat.getStatus();
      if (hbStatus.isRunning) {
        console.log(`[${new Date().toISOString()}] 💓 Heartbeat running - ${hbStatus.heartbeats.total} beats, ${hbStatus.heartbeats.successRate} success rate`);
      }
    }, 60000); // Status every minute
    
  } catch (error) {
    console.error('\n❌ Failed to start:', error.message);
    console.log('\nMake sure environment variables are set:');
    console.log('  - HEDERA_OPERATOR_ACCOUNT_ID');
    console.log('  - HEDERA_OPERATOR_PRIVATE_KEY');
    console.log('  - VERA_HEARTBEAT_TOPIC_ID (or VERA_LEARNING_TOPIC_ID)');
    process.exit(1);
  }
}

start();
