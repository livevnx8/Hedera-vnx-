/**
 * Quick HashScan Links Demo
 * Shows live HashScan URLs for Vera HCS topics
 */

console.log('🔗 VERA HASHSCAN LINKS\n');
console.log('======================\n');

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';

// Known topic IDs from the codebase
const topics = {
  verifications: {
    id: '0.0.10409351',
    name: 'Verifications',
    description: 'Carbon credit verification events'
  },
  milestones: {
    id: '0.0.10409353',
    name: 'Milestones',
    description: 'Achievement milestones'
  },
  payments: {
    id: process.env.VERA_PAYMENTS_TOPIC_ID,
    name: 'Payments',
    description: 'Payment receipts'
  },
  growth: {
    id: process.env.VERA_GROWTH_TOPIC_ID,
    name: 'Growth',
    description: 'Growth metrics'
  },
  trust: {
    id: process.env.VERA_TRUST_TOPIC_ID,
    name: 'Trust',
    description: 'Trust scores'
  }
};

console.log(`Operator Account: ${accountId}\n`);
console.log('HCS Topic URLs:\n');

Object.values(topics).forEach(topic => {
  if (topic.id) {
    const hashscanUrl = `https://hashscan.io/mainnet/topic/${topic.id}`;
    console.log(`${topic.name}:`);
    console.log(`  Topic ID: ${topic.id}`);
    console.log(`  HashScan: ${hashscanUrl}`);
    console.log(`  Description: ${topic.description}`);
    console.log('');
  }
});

console.log('======================\n');
console.log('💡 You can click these URLs to see live topic activity');
console.log('📊 Each topic receives heartbeat messages every 1-5 minutes');
console.log('⏱️  Messages are timestamped and immutable on Hedera\n');

// If we have a heartbeat running, show its status
try {
  const { veraOrganManager } = require('./vera-organ-manager.js');
  const status = veraOrganManager.getOrganStatus();
  
  if (status.system.isInitialized) {
    console.log('🫀 Organ Status:');
    console.log(`   Running: ${status.system.isInitialized ? '✅ Yes' : '❌ No'}`);
    console.log(`   Uptime: ${Math.floor(status.system.uptime / 1000)}s`);
    console.log(`   Total Beats: ${status.system.totalBeats}`);
    console.log(`   Success Rate: ${status.system.successRate}\n`);
    
    console.log('Topic Health:');
    Object.values(status.organs).forEach(organ => {
      const emoji = organ.healthy ? '💚' : '💔';
      console.log(`   ${emoji} ${organ.name}: ${organ.beats} beats`);
    });
  }
} catch (e) {
  // Organ manager not running, that's ok
}

console.log('\n✅ Ready for live HashScan verification!');
