#!/usr/bin/env node

/**
 * Start Vera Organ Management System
 * Initializes and monitors all 5 HCS topic organs
 */

const { veraOrganManager } = require('./vera-organ-manager.js');

console.log('🫀 VERA ORGAN MANAGEMENT SYSTEM\n');
console.log('==============================\n');

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutdown signal received...');
  await veraOrganManager.shutdown();
  console.log('👋 Goodbye!');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Shutdown signal received...');
  await veraOrganManager.shutdown();
  console.log('👋 Goodbye!');
  process.exit(0);
});

// Start system
async function start() {
  try {
    // Initialize all organs
    await veraOrganManager.initialize();
    
    // Print initial anatomy
    veraOrganManager.printAnatomy();
    
    console.log('📊 Monitoring active - Press Ctrl+C to stop\n');
    
    // Periodic anatomy reports
    setInterval(() => {
      veraOrganManager.printAnatomy();
    }, 60000); // Every minute
    
    // Health check every 30 seconds
    setInterval(() => {
      const status = veraOrganManager.getOrganStatus();
      const unhealthy = Object.values(status.organs).filter(o => !o.healthy);
      
      if (unhealthy.length > 0) {
        console.log('\n⚠️  HEALTH ALERT:');
        unhealthy.forEach(organ => {
          console.log(`   💔 ${organ.name} is unhealthy!`);
        });
        console.log('');
      }
    }, 30000);
    
  } catch (error) {
    console.error('\n❌ Failed to start:', error.message);
    console.log('\nRequired environment variables:');
    console.log('  - HEDERA_OPERATOR_ACCOUNT_ID');
    console.log('  - HEDERA_OPERATOR_PRIVATE_KEY');
    console.log('  - VERA_VERIFICATIONS_TOPIC_ID (optional)');
    console.log('  - VERA_MILESTONES_TOPIC_ID (optional, defaults to 0.0.10409353)');
    console.log('  - VERA_GROWTH_TOPIC_ID (optional)');
    console.log('  - VERA_TRUST_TOPIC_ID (optional)');
    console.log('  - VERA_PAYMENTS_TOPIC_ID (optional)');
    process.exit(1);
  }
}

start();
