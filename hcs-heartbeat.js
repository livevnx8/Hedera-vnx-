/**
 * HCS Heartbeat System
 * Maintains active logging to Hedera Consensus Service
 * Sends periodic heartbeat messages to verify system health
 */

const { Client, TopicMessageSubmitTransaction, PrivateKey } = require('@hashgraph/sdk');
const EventEmitter = require('events');

class HCSHeartbeat extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.topicId = config.topicId || process.env.VERA_HEARTBEAT_TOPIC_ID || process.env.VERA_LEARNING_TOPIC_ID;
    this.client = this.initializeClient(config);
    
    // Heartbeat settings
    this.intervalMs = config.intervalMs || 30000; // 30 seconds default
    this.heartbeatInterval = null;
    this.isRunning = false;
    
    // Metrics
    this.metrics = {
      totalBeats: 0,
      successfulBeats: 0,
      failedBeats: 0,
      lastBeatTime: null,
      lastBeatHash: null,
      startTime: Date.now()
    };
    
    // System status
    this.status = 'initialized';
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
        console.error('[HCSHeartbeat] Failed to initialize client:', error.message);
        throw error;
      }
    }
    
    return client;
  }

  /**
   * Start the heartbeat
   */
  start() {
    if (this.isRunning) {
      console.log('[HCSHeartbeat] Already running');
      return;
    }
    
    if (!this.topicId) {
      console.error('[HCSHeartbeat] No topic ID configured');
      this.emit('error', new Error('No topic ID configured'));
      return;
    }
    
    if (!this.client.operatorAccountId) {
      console.error('[HCSHeartbeat] No operator configured');
      this.emit('error', new Error('No operator configured'));
      return;
    }
    
    this.isRunning = true;
    this.status = 'running';
    this.metrics.startTime = Date.now();
    
    console.log(`[HCSHeartbeat] Started - Topic: ${this.topicId} - Interval: ${this.intervalMs}ms`);
    this.emit('started', { topicId: this.topicId, interval: this.intervalMs });
    
    // Send initial heartbeat
    this.sendHeartbeat();
    
    // Set up interval
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.intervalMs);
  }

  /**
   * Stop the heartbeat
   */
  stop() {
    if (!this.isRunning) {
      console.log('[HCSHeartbeat] Not running');
      return;
    }
    
    this.isRunning = false;
    this.status = 'stopped';
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    console.log('[HCSHeartbeat] Stopped');
    this.emit('stopped', { totalBeats: this.metrics.totalBeats });
  }

  /**
   * Send a single heartbeat
   */
  async sendHeartbeat() {
    if (!this.isRunning) return;
    
    this.metrics.totalBeats++;
    const beatNumber = this.metrics.totalBeats;
    
    try {
      const heartbeatData = {
        type: 'VERA_HEARTBEAT',
        sequence: beatNumber,
        timestamp: Date.now(),
        timestampISO: new Date().toISOString(),
        status: 'active',
        uptime: Date.now() - this.metrics.startTime,
        version: '1.0.0',
        node: process.env.NODE_ENV || 'production',
        operator: this.client.operatorAccountId?.toString()
      };
      
      const message = JSON.stringify(heartbeatData);
      
      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(this.topicId)
        .setMessage(message);
      
      const txResponse = await transaction.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);
      
      this.metrics.successfulBeats++;
      this.metrics.lastBeatTime = Date.now();
      
      const result = {
        sequence: beatNumber,
        transactionId: txResponse.transactionId.toString(),
        timestamp: heartbeatData.timestampISO,
        hashscanUrl: `https://hashscan.io/mainnet/topic/${this.topicId}`
      };
      
      console.log(`[HCSHeartbeat] ✓ Beat #${beatNumber} sent - Tx: ${result.transactionId}`);
      this.emit('heartbeat', result);
      
      return result;
      
    } catch (error) {
      this.metrics.failedBeats++;
      console.error(`[HCSHeartbeat] ✗ Beat #${beatNumber} failed:`, error.message);
      this.emit('error', { error: error.message, sequence: beatNumber });
      
      // Don't stop on error - keep trying
      return { error: error.message, sequence: beatNumber };
    }
  }

  /**
   * Send a custom log message
   */
  async sendLog(type, data) {
    if (!this.topicId) {
      console.error('[HCSHeartbeat] No topic ID configured');
      return { error: 'No topic ID configured' };
    }
    
    try {
      const logData = {
        type: `VERA_${type.toUpperCase()}`,
        timestamp: Date.now(),
        timestampISO: new Date().toISOString(),
        data,
        operator: this.client.operatorAccountId?.toString()
      };
      
      const message = JSON.stringify(logData);
      
      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(this.topicId)
        .setMessage(message);
      
      const txResponse = await transaction.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);
      
      console.log(`[HCSHeartbeat] ✓ Log [${type}] sent - Tx: ${txResponse.transactionId.toString()}`);
      
      return {
        success: true,
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/topic/${this.topicId}`
      };
      
    } catch (error) {
      console.error(`[HCSHeartbeat] ✗ Log [${type}] failed:`, error.message);
      return { error: error.message };
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const uptime = Date.now() - this.metrics.startTime;
    const lastBeatAgo = this.metrics.lastBeatTime ? Date.now() - this.metrics.lastBeatTime : null;
    
    return {
      ...this.metrics,
      uptime,
      uptimeFormatted: this.formatDuration(uptime),
      lastBeatAgo,
      lastBeatAgoFormatted: lastBeatAgo ? this.formatDuration(lastBeatAgo) : null,
      isRunning: this.isRunning,
      status: this.status,
      topicId: this.topicId,
      intervalMs: this.intervalMs,
      successRate: this.metrics.totalBeats > 0 
        ? ((this.metrics.successfulBeats / this.metrics.totalBeats) * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }

  /**
   * Format duration in human readable form
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Get status summary
   */
  getStatus() {
    const metrics = this.getMetrics();
    
    return {
      status: this.status,
      isRunning: this.isRunning,
      topicId: this.topicId,
      uptime: metrics.uptimeFormatted,
      heartbeats: {
        total: metrics.totalBeats,
        successful: metrics.successfulBeats,
        failed: metrics.failedBeats,
        successRate: metrics.successRate,
        lastBeat: metrics.lastBeatAgoFormatted ? `${metrics.lastBeatAgoFormatted} ago` : 'Never'
      }
    };
  }
}

// Export singleton instance
const hcsHeartbeat = new HCSHeartbeat();

module.exports = {
  HCSHeartbeat,
  hcsHeartbeat
};

// Run if executed directly
if (require.main === module) {
  console.log('🫀 HCS Heartbeat System Demo\n');
  console.log('=============================\n');
  
  // Check environment
  if (!process.env.VERA_HEARTBEAT_TOPIC_ID && !process.env.VERA_LEARNING_TOPIC_ID) {
    console.log('⚠️  No heartbeat topic configured');
    console.log('   Set VERA_HEARTBEAT_TOPIC_ID or VERA_LEARNING_TOPIC_ID\n');
    process.exit(1);
  }
  
  if (!process.env.HEDERA_OPERATOR_ACCOUNT_ID || !process.env.HEDERA_OPERATOR_PRIVATE_KEY) {
    console.log('⚠️  No operator configured');
    console.log('   Set HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY\n');
    process.exit(1);
  }
  
  // Start heartbeat
  const heartbeat = new HCSHeartbeat({
    intervalMs: 10000 // 10 seconds for demo
  });
  
  heartbeat.on('started', (info) => {
    console.log(`✅ Heartbeat started on topic ${info.topicId}`);
    console.log(`⏱️  Interval: ${info.interval}ms\n`);
  });
  
  heartbeat.on('heartbeat', (data) => {
    console.log(`💓 Beat #${data.sequence} - ${data.timestamp}`);
    console.log(`   Transaction: ${data.transactionId}`);
    console.log(`   HashScan: ${data.hashscanUrl}\n`);
  });
  
  heartbeat.on('error', (err) => {
    console.error(`❌ Error: ${err.error || err.message}\n`);
  });
  
  heartbeat.start();
  
  // Show status every 30 seconds
  setInterval(() => {
    const status = heartbeat.getStatus();
    console.log('\n📊 Heartbeat Status:');
    console.log(`   Total: ${status.heartbeats.total}`);
    console.log(`   Success: ${status.heartbeats.successful}`);
    console.log(`   Failed: ${status.heartbeats.failed}`);
    console.log(`   Success Rate: ${status.heartbeats.successRate}`);
    console.log(`   Last Beat: ${status.heartbeats.lastBeat}\n`);
  }, 30000);
  
  // Stop after 2 minutes (demo)
  setTimeout(() => {
    console.log('\n⏹️  Stopping heartbeat...');
    heartbeat.stop();
    
    const finalStatus = heartbeat.getStatus();
    console.log('\n📈 Final Status:');
    console.log(JSON.stringify(finalStatus, null, 2));
    
    process.exit(0);
  }, 120000);
}
