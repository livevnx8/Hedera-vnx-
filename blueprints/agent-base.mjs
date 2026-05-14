/**
 * Vera Agent Base Class
 * Foundation for all Vera specialized agents
 */

import { Client, PrivateKey } from '@hashgraph/sdk';
import { HCSLogger } from './hcs-logger.mjs';
import { logger } from './logger.mjs';

export class VeraAgent {
  constructor(config) {
    this.id = config.id || `agent-${Date.now()}`;
    this.type = config.type || 'BASE';
    this.version = config.version || '1.0.0';
    
    // Initialize Hedera client
    this.client = this.initializeClient(config.credentials);
    
    // Initialize HCS logger
    this.logger = new HCSLogger(this.client, config.topics);
    
    // Agent state
    this.state = {
      cycles: 0,
      startTime: Date.now(),
      lastActivity: Date.now(),
      status: 'INITIALIZING',
      accuracy: [],
      readings: [],
      errors: []
    };

    // Prometheus metrics
    this.metrics = {
      cyclesTotal: 0,
      errorsTotal: 0,
      hcsMessagesTotal: 0,
      hcsMessagesFailed: 0,
      cycleDurationMs: [],
      lastCycleStart: 0
    };

    // Configuration
    this.config = {
      cycleInterval: config.cycleInterval || 180000, // 3 minutes default
      maxErrors: config.maxErrors || 10,
      ...config
    };

    this.running = false;
    this.timer = null;
  }

  initializeClient(creds) {
    try {
      if (!creds) {
        throw new Error('No credentials provided');
      }
      
      const client = Client.forMainnet();
      const keyStr = creds.key || creds.privateKey;
      
      if (!keyStr) {
        throw new Error('No private key found in credentials');
      }
      
      let privateKey;
      if (keyStr.length === 64) {
        try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
        catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
      } else {
        privateKey = PrivateKey.fromString(keyStr);
      }
      
      client.setOperator(creds.accountId, privateKey);
      return client;
    } catch (error) {
      console.error('❌ Failed to initialize Hedera client:', error.message);
      throw error;
    }
  }

  /**
   * Main cycle - override in subclasses
   */
  async cycle() {
    this.metrics.lastCycleStart = Date.now();
    this.state.cycles++;
    this.metrics.cyclesTotal++;
    this.state.lastActivity = Date.now();
    
    try {
      logger.info('Cycle started', { cycle: this.state.cycles });

      // Override this in subclasses
      await this.performWork();

      // Update status
      this.state.status = 'ACTIVE';
      logger.info('Cycle completed', { cycle: this.state.cycles, duration: Date.now() - this.metrics.lastCycleStart });

    } catch (error) {
      this.metrics.errorsTotal++;
      this.handleError(error);
    } finally {
      // Track cycle duration
      const duration = Date.now() - this.metrics.lastCycleStart;
      this.metrics.cycleDurationMs.push(duration);
      if (this.metrics.cycleDurationMs.length > 100) {
        this.metrics.cycleDurationMs.shift();
      }
    }
  }

  /**
   * Override this method in subclasses
   */
  async performWork() {
    throw new Error('performWork() must be implemented by subclass');
  }

  /**
   * Log to HCS via logger (non-blocking)
   */
  async log(topicKey, type, data, priority = 'normal') {
    const enrichedData = {
      ...data,
      agentId: this.id,
      agentType: this.type,
      cycle: this.state.cycles
    };
    
    // Fire-and-forget HCS logging - don't block cycle on network
    this.metrics.hcsMessagesTotal++;
    this.logger.enqueue(topicKey, type, enrichedData, priority).catch(err => {
      this.metrics.hcsMessagesFailed++;
      console.error(`⚠️ HCS log failed: ${err.message?.substring(0, 50)}`);
    });
    
    return true;
  }

  /**
   * Handle errors with logging
   */
  handleError(error) {
    this.state.errors.push({
      message: error.message,
      timestamp: Date.now(),
      cycle: this.state.cycles
    });

    // Keep only last N errors
    if (this.state.errors.length > this.config.maxErrors) {
      this.state.errors = this.state.errors.slice(-this.config.maxErrors);
    }

    logger.error('Agent error', { error: error.message, cycle: this.state.cycles });

    // Update status if too many errors
    if (this.state.errors.length >= this.config.maxErrors) {
      this.state.status = 'DEGRADED';
    }
  }

  /**
   * Start the agent loop
   */
  start() {
    if (this.running) return;
    
    this.running = true;
    this.state.status = 'RUNNING';
    
    // Initial cycle
    this.cycle();
    
    // Schedule cycles
    this.timer = setInterval(() => this.cycle(), this.config.cycleInterval);
    
    logger.info('Agent started', { id: this.id, interval: this.config.cycleInterval });
  }

  /**
   * Stop the agent
   */
  async stop() {
    this.running = false;
    
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.state.status = 'STOPPED';
    
    // Log shutdown
    await this.log('CORE', 'AGENT_SHUTDOWN', {
      totalCycles: this.state.cycles,
      uptime: Date.now() - this.state.startTime,
      finalAccuracy: this.getAverageAccuracy()
    });

    // Close client
    this.client.close();
    
    logger.info('Agent stopped', { id: this.id, cycles: this.state.cycles });
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      id: this.id,
      type: this.type,
      status: this.state.status,
      cycles: this.state.cycles,
      uptime: Date.now() - this.state.startTime,
      accuracy: this.getAverageAccuracy(),
      errorCount: this.state.errors.length,
      hcsStats: this.logger.getStats()
    };
  }

  getAverageAccuracy() {
    if (this.state.accuracy.length === 0) return 0;
    return this.state.accuracy.reduce((a, b) => a + b, 0) / this.state.accuracy.length;
  }

  /**
   * Get Prometheus-formatted metrics for monitoring
   */
  getPrometheusMetrics() {
    const avgCycleDuration = this.metrics.cycleDurationMs.length > 0
      ? this.metrics.cycleDurationMs.reduce((a, b) => a + b, 0) / this.metrics.cycleDurationMs.length
      : 0;

    return `
# HELP vera_agent_cycles_total Total number of cycles executed
# TYPE vera_agent_cycles_total counter
vera_agent_cycles_total{agent_id="${this.id}",agent_type="${this.type}"} ${this.metrics.cyclesTotal}

# HELP vera_agent_errors_total Total number of errors encountered
# TYPE vera_agent_errors_total counter
vera_agent_errors_total{agent_id="${this.id}",agent_type="${this.type}"} ${this.metrics.errorsTotal}

# HELP vera_agent_hcs_messages_total Total HCS messages sent
# TYPE vera_agent_hcs_messages_total counter
vera_agent_hcs_messages_total{agent_id="${this.id}",agent_type="${this.type}"} ${this.metrics.hcsMessagesTotal}

# HELP vera_agent_hcs_messages_failed Total failed HCS messages
# TYPE vera_agent_hcs_messages_failed counter
vera_agent_hcs_messages_failed{agent_id="${this.id}",agent_type="${this.type}"} ${this.metrics.hcsMessagesFailed}

# HELP vera_agent_cycle_duration_ms Average cycle duration in milliseconds
# TYPE vera_agent_cycle_duration_ms gauge
vera_agent_cycle_duration_ms{agent_id="${this.id}",agent_type="${this.type}"} ${avgCycleDuration.toFixed(2)}

# HELP vera_agent_status Current agent status (1=ACTIVE, 0.5=DEGRADED, 0=STOPPED)
# TYPE vera_agent_status gauge
vera_agent_status{agent_id="${this.id}",agent_type="${this.type}",status="${this.state.status}"} ${this.state.status === 'ACTIVE' ? 1 : this.state.status === 'DEGRADED' ? 0.5 : 0}

# HELP vera_agent_accuracy Average accuracy score
# TYPE vera_agent_accuracy gauge
vera_agent_accuracy{agent_id="${this.id}",agent_type="${this.type}"} ${this.getAverageAccuracy().toFixed(4)}
`.trim();
  }

  /**
   * Graceful shutdown handler
   */
  setupGracefulShutdown() {
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Received SIGINT, shutting down gracefully...');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n\n🛑 Received SIGTERM, shutting down gracefully...');
      await this.stop();
      process.exit(0);
    });
  }
}

export default VeraAgent;
