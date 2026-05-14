/**
 * Multi-Topic HCS Heartbeat System
 * Manages all 5 Vera HCS topics (organs):
 * - verifications: Verification events
 * - growth: Growth milestones
 * - trust: Trust scores
 * - payments: Payment receipts
 * - milestones: Achievement tracking
 * 
 * Each topic gets its own heartbeat for health monitoring
 */

const { Client, TopicMessageSubmitTransaction, PrivateKey } = require('@hashgraph/sdk');
const EventEmitter = require('events');

class MultiTopicHCSHeartbeat extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Initialize client
    this.client = this.initializeClient(config);
    
    // Define the 5 topic "organs"
    this.topics = {
      verifications: {
        id: config.verificationsTopicId || process.env.VERA_VERIFICATIONS_TOPIC_ID,
        name: 'Verifications',
        description: 'Carbon credit verification events',
        intervalMs: 60000, // 1 minute
        lastBeat: null,
        beats: 0,
        errors: 0,
        healthy: true
      },
      growth: {
        id: config.growthTopicId || process.env.VERA_GROWTH_TOPIC_ID,
        name: 'Growth',
        description: 'Growth milestones and metrics',
        intervalMs: 120000, // 2 minutes
        lastBeat: null,
        beats: 0,
        errors: 0,
        healthy: true
      },
      trust: {
        id: config.trustTopicId || process.env.VERA_TRUST_TOPIC_ID,
        name: 'Trust',
        description: 'Trust scores and factors',
        intervalMs: 180000, // 3 minutes
        lastBeat: null,
        beats: 0,
        errors: 0,
        healthy: true
      },
      payments: {
        id: config.paymentsTopicId || process.env.VERA_PAYMENTS_TOPIC_ID,
        name: 'Payments',
        description: 'Payment receipts and transactions',
        intervalMs: 60000, // 1 minute
        lastBeat: null,
        beats: 0,
        errors: 0,
        healthy: true
      },
      milestones: {
        id: config.milestonesTopicId || process.env.VERA_MILESTONES_TOPIC_ID || '0.0.10409353',
        name: 'Milestones',
        description: 'Achievement milestones',
        intervalMs: 300000, // 5 minutes
        lastBeat: null,
        beats: 0,
        errors: 0,
        healthy: true
      }
    };
    
    // Default topic (fallback)
    this.defaultTopic = config.defaultTopicId || process.env.VERA_LEARNING_TOPIC_ID;
    
    // Intervals storage
    this.intervals = {};
    this.isRunning = false;
    this.startTime = Date.now();
  }

  initializeClient(config) {
    const network = config.network || process.env.HEDERA_NETWORK || 'mainnet';
    const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    const accountId = config.accountId || process.env.HEDERA_OPERATOR_ACCOUNT_ID;
    const privateKeyStr = config.privateKey || process.env.HEDERA_OPERATOR_PRIVATE_KEY;
    
    if (accountId && privateKeyStr) {
      let privateKey;
      try {
        if (privateKeyStr.length === 64) {
          try { privateKey = PrivateKey.fromStringECDSA(privateKeyStr); }
          catch { privateKey = PrivateKey.fromStringED25519(privateKeyStr); }
        } else {
          privateKey = PrivateKey.fromString(privateKeyStr);
        }
        client.setOperator(accountId, privateKey);
      } catch (error) {
        console.error('[MultiTopicHCS] Failed to init client:', error.message);
        throw error;
      }
    }
    
    return client;
  }

  /**
   * Start all topic heartbeats
   */
  start() {
    if (this.isRunning) {
      console.log('[MultiTopicHCS] Already running');
      return;
    }

    console.log('🫀 Starting Multi-Topic HCS Heartbeat\n');
    console.log('=====================================\n');

    this.isRunning = true;
    
    // Start heartbeat for each configured topic
    Object.keys(this.topics).forEach(topicKey => {
      const topic = this.topics[topicKey];
      
      if (!topic.id) {
        console.log(`⚠️  ${topic.name}: No topic ID configured, skipping`);
        topic.healthy = false;
        return;
      }
      
      console.log(`✅ ${topic.name}: Starting heartbeat (interval: ${topic.intervalMs}ms, topic: ${topic.id})`);
      
      // Send initial beat immediately
      this.sendHeartbeat(topicKey);
      
      // Schedule recurring beats
      this.intervals[topicKey] = setInterval(() => {
        this.sendHeartbeat(topicKey);
      }, topic.intervalMs);
    });

    console.log('\n=====================================\n');
    this.emit('started', { topics: this.getActiveTopics() });
  }

  /**
   * Stop all heartbeats
   */
  stop() {
    if (!this.isRunning) return;
    
    console.log('\n🛑 Stopping Multi-Topic HCS Heartbeat...');
    
    this.isRunning = false;
    
    Object.keys(this.intervals).forEach(key => {
      clearInterval(this.intervals[key]);
      delete this.intervals[key];
    });
    
    console.log('✅ All heartbeats stopped');
    this.emit('stopped');
  }

  /**
   * Send heartbeat to specific topic
   */
  async sendHeartbeat(topicKey) {
    const topic = this.topics[topicKey];
    
    if (!topic.id || !this.isRunning) return;

    try {
      const heartbeatData = {
        type: `HEARTBEAT_${topic.name.toUpperCase()}`,
        timestamp: Date.now(),
        timestampISO: new Date().toISOString(),
        topic: topic.name,
        topicId: topic.id,
        sequence: topic.beats + 1,
        system: {
          uptime: Date.now() - this.startTime,
          version: '2.0.0',
          node: process.env.NODE_ENV || 'production'
        },
        health: {
          status: 'healthy',
          lastBeat: topic.lastBeat,
          totalBeats: topic.beats
        }
      };

      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(topic.id)
        .setMessage(JSON.stringify(heartbeatData));

      const txResponse = await transaction.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);

      topic.beats++;
      topic.lastBeat = Date.now();
      topic.healthy = true;

      console.log(`💓 ${topic.name}: Beat #${topic.beats} → ${topic.id} (Tx: ${txResponse.transactionId.toString().slice(0, 20)}...)`);
      
      this.emit('heartbeat', {
        topic: topicKey,
        topicName: topic.name,
        topicId: topic.id,
        sequence: topic.beats,
        transactionId: txResponse.transactionId.toString()
      });

    } catch (error) {
      topic.errors++;
      topic.healthy = false;
      
      console.error(`❌ ${topic.name}: Beat failed - ${error.message}`);
      
      this.emit('error', {
        topic: topicKey,
        topicName: topic.name,
        error: error.message,
        totalErrors: topic.errors
      });
    }
  }

  /**
   * Log event to appropriate topic
   */
  async logEvent(eventType, data) {
    // Map event types to topics
    const topicMapping = {
      'verification': 'verifications',
      'verification_complete': 'verifications',
      'growth': 'growth',
      'milestone': 'growth',
      'trust': 'trust',
      'trust_score': 'trust',
      'payment': 'payments',
      'payment_received': 'payments',
      'achievement': 'milestones',
      'milestone_reached': 'milestones'
    };

    const topicKey = topicMapping[eventType.toLowerCase()] || 'milestones';
    const topic = this.topics[topicKey];

    if (!topic || !topic.id) {
      console.error(`[MultiTopicHCS] No topic configured for ${eventType}`);
      return { error: 'No topic configured' };
    }

    try {
      const logData = {
        type: eventType.toUpperCase(),
        timestamp: Date.now(),
        timestampISO: new Date().toISOString(),
        topic: topic.name,
        data
      };

      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(topic.id)
        .setMessage(JSON.stringify(logData));

      const txResponse = await transaction.execute(this.client);

      console.log(`📝 ${topic.name}: Logged [${eventType}] → ${topic.id}`);
      
      return {
        success: true,
        topic: topicKey,
        topicId: topic.id,
        transactionId: txResponse.transactionId.toString()
      };

    } catch (error) {
      console.error(`❌ ${topic.name}: Failed to log [${eventType}] - ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get active topics
   */
  getActiveTopics() {
    return Object.keys(this.topics)
      .filter(key => this.topics[key].id)
      .map(key => ({
        key,
        name: this.topics[key].name,
        id: this.topics[key].id,
        healthy: this.topics[key].healthy,
        beats: this.topics[key].beats
      }));
  }

  /**
   * Get comprehensive status
   */
  getStatus() {
    const totalBeats = Object.values(this.topics).reduce((sum, t) => sum + t.beats, 0);
    const totalErrors = Object.values(this.topics).reduce((sum, t) => sum + t.errors, 0);
    
    return {
      isRunning: this.isRunning,
      uptime: Date.now() - this.startTime,
      summary: {
        totalBeats,
        totalErrors,
        successRate: totalBeats > 0 ? ((totalBeats - totalErrors) / totalBeats * 100).toFixed(2) + '%' : 'N/A'
      },
      topics: Object.keys(this.topics).reduce((acc, key) => {
        const topic = this.topics[key];
        acc[key] = {
          name: topic.name,
          id: topic.id,
          healthy: topic.healthy,
          beats: topic.beats,
          errors: topic.errors,
          lastBeat: topic.lastBeat ? new Date(topic.lastBeat).toISOString() : null,
          hashscanUrl: topic.id ? `https://hashscan.io/mainnet/topic/${topic.id}` : null
        };
        return acc;
      }, {})
    };
  }

  /**
   * Print status to console
   */
  printStatus() {
    const status = this.getStatus();
    
    console.log('\n📊 Multi-Topic HCS Status');
    console.log('========================\n');
    console.log(`Running: ${status.isRunning ? '✅ Yes' : '❌ No'}`);
    console.log(`Uptime: ${Math.floor(status.uptime / 1000)}s`);
    console.log(`Total Beats: ${status.summary.totalBeats}`);
    console.log(`Success Rate: ${status.summary.successRate}\n`);
    
    console.log('Topics:');
    Object.keys(status.topics).forEach(key => {
      const t = status.topics[key];
      const health = t.healthy ? '✅' : '❌';
      const id = t.id || 'Not configured';
      console.log(`  ${health} ${t.name}: ${id} (${t.beats} beats, ${t.errors} errors)`);
    });
    
    console.log('');
  }
}

// Export
module.exports = { MultiTopicHCSHeartbeat };

// Run if executed directly
if (require.main === module) {
  console.log('🚀 Multi-Topic HCS Heartbeat Demo\n');
  
  const heartbeat = new MultiTopicHCSHeartbeat({
    milestonesTopicId: '0.0.10409353', // Use existing milestone topic
    verificationsTopicId: '0.0.10409351' // Use existing verification topic
  });

  heartbeat.on('started', () => {
    console.log('✅ Heartbeat started\n');
    heartbeat.printStatus();
  });

  heartbeat.on('heartbeat', (data) => {
    // console.log(`💓 Beat on ${data.topicName}`);
  });

  heartbeat.on('error', (err) => {
    console.error(`❌ Error on ${err.topicName}: ${err.error}`);
  });

  // Start
  heartbeat.start();

  // Status every 30 seconds
  setInterval(() => {
    heartbeat.printStatus();
  }, 30000);

  // Stop after 2 minutes
  setTimeout(() => {
    heartbeat.stop();
    console.log('\n📈 Final Status:');
    heartbeat.printStatus();
    process.exit(0);
  }, 120000);
}
