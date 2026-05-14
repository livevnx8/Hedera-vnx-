/**
 * Vera Multi-Topic HCS Manager
 * Unified management of all 5 HCS topic "organs"
 * Integrates heartbeat, logging, and health monitoring
 */

const { MultiTopicHCSHeartbeat } = require('./multi-topic-hcs-heartbeat.js');

class VeraMultiTopicManager {
  constructor(config = {}) {
    // Initialize multi-topic heartbeat
    this.heartbeat = new MultiTopicHCSHeartbeat({
      verificationsTopicId: config.verificationsTopicId || process.env.VERA_VERIFICATIONS_TOPIC_ID,
      growthTopicId: config.growthTopicId || process.env.VERA_GROWTH_TOPIC_ID,
      trustTopicId: config.trustTopicId || process.env.VERA_TRUST_TOPIC_ID,
      paymentsTopicId: config.paymentsTopicId || process.env.VERA_PAYMENTS_TOPIC_ID,
      milestonesTopicId: config.milestonesTopicId || process.env.VERA_MILESTONES_TOPIC_ID || '0.0.10409353'
    });

    this.isInitialized = false;
    this.organs = {
      verifications: { name: 'Verifications', status: 'standby', lastActivity: null },
      growth: { name: 'Growth', status: 'standby', lastActivity: null },
      trust: { name: 'Trust', status: 'standby', lastActivity: null },
      payments: { name: 'Payments', status: 'standby', lastActivity: null },
      milestones: { name: 'Milestones', status: 'standby', lastActivity: null }
    };
  }

  /**
   * Initialize all organs (topics)
   */
  async initialize() {
    console.log('🫀 Initializing Vera Multi-Topic Organs\n');
    console.log('=====================================\n');

    // Start heartbeat for all topics
    this.heartbeat.start();

    // Mark all as active
    Object.keys(this.organs).forEach(key => {
      this.organs[key].status = 'active';
      this.organs[key].lastActivity = Date.now();
      console.log(`✅ ${this.organs[key].name}: Active`);
    });

    this.isInitialized = true;

    // Log system start
    await this.heartbeat.logEvent('system_start', {
      initialized: true,
      organs: Object.keys(this.organs),
      timestamp: Date.now()
    });

    console.log('\n=====================================\n');
    console.log('🫀 All organs pumping!\n');

    return this.getOrganStatus();
  }

  /**
   * Log verification to verifications organ
   */
  async logVerification(data) {
    this.organs.verifications.lastActivity = Date.now();
    return await this.heartbeat.logEvent('verification', data);
  }

  /**
   * Log growth milestone to growth organ
   */
  async logGrowth(data) {
    this.organs.growth.lastActivity = Date.now();
    return await this.heartbeat.logEvent('growth', data);
  }

  /**
   * Log trust score to trust organ
   */
  async logTrust(data) {
    this.organs.trust.lastActivity = Date.now();
    return await this.heartbeat.logEvent('trust_score', data);
  }

  /**
   * Log payment to payments organ
   */
  async logPayment(data) {
    this.organs.payments.lastActivity = Date.now();
    return await this.heartbeat.logEvent('payment', data);
  }

  /**
   * Log achievement to milestones organ
   */
  async logAchievement(data) {
    this.organs.milestones.lastActivity = Date.now();
    return await this.heartbeat.logEvent('achievement', data);
  }

  /**
   * Get status of all organs
   */
  getOrganStatus() {
    const hbStatus = this.heartbeat.getStatus();
    
    return {
      system: {
        isInitialized: this.isInitialized,
        uptime: hbStatus.uptime,
        totalBeats: hbStatus.summary.totalBeats,
        successRate: hbStatus.summary.successRate
      },
      organs: Object.keys(this.organs).reduce((acc, key) => {
        const organ = this.organs[key];
        const topicStatus = hbStatus.topics[key];
        
        acc[key] = {
          name: organ.name,
          status: organ.status,
          lastActivity: organ.lastActivity,
          healthy: topicStatus?.healthy || false,
          beats: topicStatus?.beats || 0,
          topicId: topicStatus?.id || null,
          hashscanUrl: topicStatus?.hashscanUrl || null
        };
        return acc;
      }, {})
    };
  }

  /**
   * Print organ status (anatomy report)
   */
  printAnatomy() {
    const status = this.getOrganStatus();
    
    console.log('\n🫀 VERA ANATOMY REPORT');
    console.log('=====================\n');
    console.log(`System: ${status.system.isInitialized ? '✅ Active' : '❌ Inactive'}`);
    console.log(`Uptime: ${Math.floor(status.system.uptime / 1000)}s`);
    console.log(`Total Heartbeats: ${status.system.totalBeats}`);
    console.log(`Success Rate: ${status.system.successRate}\n`);
    
    console.log('Organs:');
    Object.keys(status.organs).forEach(key => {
      const organ = status.organs[key];
      const health = organ.healthy ? '💚' : '💔';
      const activity = organ.lastActivity 
        ? `${Math.floor((Date.now() - organ.lastActivity) / 1000)}s ago` 
        : 'never';
      
      console.log(`  ${health} ${organ.name}`);
      console.log(`     Status: ${organ.status}`);
      console.log(`     Topic: ${organ.topicId || 'Not configured'}`);
      console.log(`     Beats: ${organ.beats}`);
      console.log(`     Last Activity: ${activity}`);
      if (organ.hashscanUrl) {
        console.log(`     HashScan: ${organ.hashscanUrl}`);
      }
      console.log('');
    });
    
    console.log('=====================\n');
  }

  /**
   * Shutdown all organs
   */
  async shutdown() {
    console.log('\n🛑 Shutting down Vera organs...');
    
    // Log shutdown
    await this.heartbeat.logEvent('system_stop', {
      uptime: this.heartbeat.getStatus().uptime
    });
    
    // Stop heartbeat
    this.heartbeat.stop();
    
    // Mark all as stopped
    Object.keys(this.organs).forEach(key => {
      this.organs[key].status = 'stopped';
    });
    
    this.isInitialized = false;
    
    console.log('✅ All organs stopped');
  }
}

// Export singleton
const veraOrganManager = new VeraMultiTopicManager();

module.exports = {
  VeraMultiTopicManager,
  veraOrganManager
};

// Run if executed directly
if (require.main === module) {
  const manager = new VeraMultiTopicManager({
    verificationsTopicId: '0.0.10409351',
    milestonesTopicId: '0.0.10409353'
  });

  // Initialize
  manager.initialize().then(() => {
    manager.printAnatomy();
    
    // Simulate some activity
    setTimeout(async () => {
      await manager.logVerification({ 
        id: 'test-123', 
        verified: true, 
        confidence: 0.95 
      });
      
      await manager.logAchievement({
        milestone: 'System Test',
        value: 100
      });
      
      console.log('\n📊 Activity logged');
      manager.printAnatomy();
    }, 5000);
    
    // Keep running
    setInterval(() => {
      manager.printAnatomy();
    }, 30000);
    
  }).catch(console.error);

  // Handle shutdown
  process.on('SIGINT', async () => {
    await manager.shutdown();
    process.exit(0);
  });
}
