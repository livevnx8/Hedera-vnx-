/**
 * Vera HCS Integration
 * Integrates HCS heartbeat and logging with the main application
 */

const { hcsHeartbeat } = require('./hcs-heartbeat.js');
const { veraHCS } = require('./src/dovu/veraHCS.js');

class VeraHCSIntegration {
  constructor() {
    this.heartbeat = hcsHeartbeat;
    this.veraHCS = veraHCS;
    this.isInitialized = false;
  }

  /**
   * Initialize HCS systems
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('[VeraHCS] Already initialized');
      return;
    }

    console.log('[VeraHCS] Initializing...');

    try {
      // Initialize Vera HCS logger
      await this.veraHCS.initialize();
      console.log('[VeraHCS] ✓ VeraHCS logger initialized');

      // Start heartbeat if topic is available
      if (this.heartbeat.topicId) {
        this.heartbeat.start();
        console.log('[VeraHCS] ✓ Heartbeat started');
      } else {
        console.log('[VeraHCS] ⚠ No heartbeat topic configured');
      }

      this.isInitialized = true;
      this.logEvent('SYSTEM_START', { initialized: true });
      
      console.log('[VeraHCS] ✓ Fully initialized');
      
    } catch (error) {
      console.error('[VeraHCS] ✗ Initialization failed:', error.message);
      this.logEvent('SYSTEM_ERROR', { error: error.message });
      throw error;
    }
  }

  /**
   * Log an event to HCS
   */
  async logEvent(type, data) {
    try {
      // Use heartbeat logger for system events
      if (type.startsWith('SYSTEM_')) {
        await this.heartbeat.sendLog(type, data);
      } else {
        // Use Vera HCS logger for business events
        await this.veraHCS.logAchievement(type, data);
      }
    } catch (error) {
      console.error('[VeraHCS] Failed to log event:', error.message);
    }
  }

  /**
   * Log a verification
   */
  async logVerification(data) {
    try {
      await this.veraHCS.logVerification(data);
      console.log('[VeraHCS] ✓ Verification logged');
    } catch (error) {
      console.error('[VeraHCS] ✗ Failed to log verification:', error.message);
    }
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      heartbeat: this.heartbeat.getStatus(),
      topics: this.veraHCS.getTopicIds(),
      hashscanLinks: this.veraHCS.getHashScanLinks()
    };
  }

  /**
   * Shutdown HCS systems
   */
  async shutdown() {
    console.log('[VeraHCS] Shutting down...');
    
    this.heartbeat.stop();
    await this.logEvent('SYSTEM_STOP', { uptime: this.heartbeat.getMetrics().uptime });
    
    console.log('[VeraHCS] ✓ Shutdown complete');
  }
}

// Export singleton
const veraHCSIntegration = new VeraHCSIntegration();

module.exports = {
  VeraHCSIntegration,
  veraHCSIntegration,
  hcsHeartbeat
};
