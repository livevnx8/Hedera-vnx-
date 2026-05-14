#!/usr/bin/env node

/**
 * Live HashScan Verification
 * Shows real HashScan URLs for all HCS topic activity
 */

const { veraOrganManager } = require('./vera-organ-manager.js');

console.log('🔗 LIVE HASHSCAN VERIFICATION\n');
console.log('===============================\n');

// Show all topic HashScan URLs
function showHashScanLinks() {
  const status = veraOrganManager.getOrganStatus();
  
  console.log('📍 Topic HashScan URLs:\n');
  
  Object.keys(status.organs).forEach(key => {
    const organ = status.organs[key];
    if (organ.topicId) {
      console.log(`${organ.name}:`);
      console.log(`  Topic ID: ${organ.topicId}`);
      console.log(`  HashScan: ${organ.hashscanUrl}`);
      console.log(`  Status: ${organ.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
      console.log(`  Beats: ${organ.beats}`);
      console.log('');
    }
  });
  
  console.log('===============================\n');
}

// Send test messages and show live transactions
async function sendTestMessages() {
  console.log('📤 Sending test messages to verify live status...\n');
  
  const tests = [
    { 
      organ: 'verifications', 
      type: 'verification', 
      data: { 
        test: true, 
        timestamp: Date.now(),
        message: 'Live HashScan test'
      }
    },
    { 
      organ: 'milestones', 
      type: 'achievement', 
      data: { 
        test: true, 
        milestone: 'HashScan Live Verification',
        timestamp: Date.now()
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`Sending to ${test.organ}...`);
    
    try {
      const result = await veraOrganManager.heartbeat.logEvent(test.type, test.data);
      
      if (result.success) {
        console.log(`✅ Message sent!`);
        console.log(`   Transaction: ${result.transactionId}`);
        console.log(`   HashScan: https://hashscan.io/mainnet/transaction/${result.transactionId.replace('@', '-')}`);
        console.log(`   Topic View: https://hashscan.io/mainnet/topic/${result.topicId}\n`);
      } else {
        console.log(`❌ Failed: ${result.error}\n`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }
    
    // Small delay between messages
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// Monitor mode - show live updates
async function startLiveMonitor() {
  console.log('📡 LIVE MONITOR MODE\n');
  console.log('Press Ctrl+C to stop\n');
  
  // Show initial links
  showHashScanLinks();
  
  // Send test messages
  await sendTestMessages();
  
  // Show live stats every 10 seconds
  setInterval(() => {
    const status = veraOrganManager.getOrganStatus();
    
    console.log(`\n⏰ ${new Date().toISOString()}`);
    console.log(`💓 Total Beats: ${status.system.totalBeats}`);
    console.log(`✅ Success Rate: ${status.system.successRate}`);
    console.log(`⏱️  Uptime: ${Math.floor(status.system.uptime / 1000)}s`);
    
    // Show recent activity
    Object.keys(status.organs).forEach(key => {
      const organ = status.organs[key];
      if (organ.lastActivity) {
        const ago = Math.floor((Date.now() - organ.lastActivity) / 1000);
        console.log(`   ${organ.name}: ${organ.beats} beats (${ago}s ago)`);
      }
    });
    
    console.log('\n🔗 Quick Links:');
    Object.values(status.organs).forEach(organ => {
      if (organ.topicId) {
        console.log(`   ${organ.name}: ${organ.hashscanUrl}`);
      }
    });
    
    console.log('\n-------------------------------\n');
  }, 10000);
}

// Handle shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Stopping...');
  await veraOrganManager.shutdown();
  console.log('👋 Goodbye!');
  process.exit(0);
});

// Main
async function main() {
  // Check environment
  if (!process.env.HEDERA_OPERATOR_ACCOUNT_ID || !process.env.HEDERA_OPERATOR_PRIVATE_KEY) {
    console.log('⚠️  Missing environment variables');
    console.log('   Set HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY\n');
    
    // Show example URLs anyway
    console.log('Example HashScan URLs (with demo topics):\n');
    console.log('Verifications: https://hashscan.io/mainnet/topic/0.0.10409351');
    console.log('Milestones: https://hashscan.io/mainnet/topic/0.0.10409353\n');
    
    process.exit(1);
  }
  
  // Initialize
  await veraOrganManager.initialize();
  
  // Start live monitor
  await startLiveMonitor();
}

main().catch(console.error);
