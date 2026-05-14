#!/usr/bin/env node
/**
 * Vera Bridge Monitor - Real-time bridge analytics and alerting
 */

import { EventEmitter } from 'events';
import { Client, TopicMessageQuery } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

class BridgeMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    this.validatorTopic = config.validatorTopic || '0.0.10417507';
    this.client = null;
    this.metrics = {
      transfers: {
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0
      },
      volume: {
        hourly: new Map(),
        daily: new Map(),
        total: 0
      },
      latency: {
        avg: 0,
        min: Infinity,
        max: 0,
        samples: []
      },
      validators: {
        online: new Set(),
        attestations: new Map()
      }
    };
    this.alerts = [];
    this.alertThresholds = {
      failedTransferRate: 0.05, // 5%
      maxLatency: 300000, // 5 minutes
      minValidators: 2
    };
  }

  async initialize() {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error('Missing Hedera credentials');
    }

    const { Client, PrivateKey } = await import('@hashgraph/sdk');
    
    this.client = Client.forMainnet();
    let privateKey;
    if (operatorKey.length === 64) {
      try {
        privateKey = PrivateKey.fromStringECDSA(operatorKey);
      } catch {
        privateKey = PrivateKey.fromStringED25519(operatorKey);
      }
    } else {
      privateKey = PrivateKey.fromString(operatorKey);
    }
    this.client.setOperator(operatorId, privateKey);

    console.log('🔍 Bridge Monitor initialized');
  }

  async startMonitoring() {
    console.log('👀 Starting bridge monitoring...');

    // Subscribe to bridge events
    await this.subscribeToBridgeEvents();
    
    // Start alert checking
    this.startAlertLoop();
    
    // Start metrics reporting
    this.startMetricsReporting();
  }

  async subscribeToBridgeEvents() {
    const { TopicMessageQuery } = await import('@hashgraph/sdk');
    
    new TopicMessageQuery()
      .setTopicId(this.validatorTopic)
      .setStartTime(0)
      .subscribe(
        this.client,
        (message) => this.processBridgeEvent(message),
        (error) => console.error('Subscription error:', error)
      );

    console.log(`📡 Subscribed to bridge events on topic ${this.validatorTopic}`);
  }

  processBridgeEvent(message) {
    try {
      const content = JSON.parse(message.contents.toString());
      
      switch (content.type) {
        case 'BRIDGE_VALIDATION':
          this.recordValidation(content);
          break;
        case 'HTLC_CREATED':
          this.recordTransferStart(content);
          break;
        case 'HTLC_RELEASED':
          this.recordTransferComplete(content);
          break;
        case 'HTLC_REFUNDED':
          this.recordTransferFailed(content);
          break;
        case 'BATCH_RELAYED':
          this.recordRelay(content);
          break;
      }
    } catch (error) {
      // Ignore parse errors
    }
  }

  recordValidation(content) {
    const { validator, transferId, valid } = content;
    
    if (valid) {
      this.metrics.validators.online.add(validator);
      
      const attestations = this.metrics.validators.attestations.get(transferId) || 0;
      this.metrics.validators.attestations.set(transferId, attestations + 1);
    }
  }

  recordTransferStart(content) {
    this.metrics.transfers.total++;
    this.metrics.transfers.pending++;
    
    const hour = new Date().toISOString().slice(0, 13);
    const current = this.metrics.volume.hourly.get(hour) || 0;
    this.metrics.volume.hourly.set(hour, current + 1);
  }

  recordTransferComplete(content) {
    this.metrics.transfers.completed++;
    this.metrics.transfers.pending--;
    
    const duration = Date.now() - content.timestamp;
    this.updateLatencyMetrics(duration);
  }

  recordTransferFailed(content) {
    this.metrics.transfers.failed++;
    this.metrics.transfers.pending--;
  }

  recordRelay(content) {
    this.emit('relay', content);
  }

  updateLatencyMetrics(duration) {
    const { latency } = this.metrics;
    
    latency.samples.push(duration);
    if (latency.samples.length > 100) {
      latency.samples.shift();
    }
    
    latency.avg = latency.samples.reduce((a, b) => a + b, 0) / latency.samples.length;
    latency.min = Math.min(latency.min, duration);
    latency.max = Math.max(latency.max, duration);
  }

  startAlertLoop() {
    setInterval(() => this.checkAlerts(), 60000); // Check every minute
  }

  checkAlerts() {
    const { transfers, latency, validators } = this.metrics;
    
    // Check failure rate
    const failureRate = transfers.total > 0 ? transfers.failed / transfers.total : 0;
    if (failureRate > this.alertThresholds.failedTransferRate) {
      this.triggerAlert('HIGH_FAILURE_RATE', `Failure rate: ${(failureRate * 100).toFixed(1)}%`);
    }
    
    // Check latency
    if (latency.avg > this.alertThresholds.maxLatency) {
      this.triggerAlert('HIGH_LATENCY', `Average latency: ${(latency.avg / 1000).toFixed(1)}s`);
    }
    
    // Check validator count
    if (validators.online.size < this.alertThresholds.minValidators) {
      this.triggerAlert('LOW_VALIDATORS', `Only ${validators.online.size} validators online`);
    }
  }

  triggerAlert(type, message) {
    const alert = {
      type,
      message,
      timestamp: Date.now(),
      severity: 'warning'
    };
    
    this.alerts.push(alert);
    this.emit('alert', alert);
    
    console.log(`⚠️ ALERT [${type}]: ${message}`);
  }

  startMetricsReporting() {
    setInterval(() => this.printMetrics(), 300000); // Every 5 minutes
  }

  printMetrics() {
    const { transfers, latency, validators } = this.metrics;
    
    console.log(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🌉 BRIDGE METRICS (${new Date().toISOString().slice(11, 19)})                    ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Transfers:                                                   ┃
┃    Total: ${transfers.total.toString().padEnd(48)} ┃
┃    Completed: ${transfers.completed.toString().padEnd(44)} ┃
┃    Failed: ${transfers.failed.toString().padEnd(46)} ┃
┃    Pending: ${transfers.pending.toString().padEnd(45)} ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Performance:                                                 ┃
┃    Avg Latency: ${(latency.avg / 1000).toFixed(1)}s${''.padEnd(40)} ┃
┃    Min Latency: ${(latency.min / 1000).toFixed(1)}s${''.padEnd(40)} ┃
┃    Max Latency: ${(latency.max / 1000).toFixed(1)}s${''.padEnd(40)} ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Validators: ${validators.online.size.toString().padEnd(45)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    `);
  }

  getDashboardData() {
    return {
      metrics: this.metrics,
      alerts: this.alerts.slice(-10), // Last 10 alerts
      status: 'healthy'
    };
  }
}

// Run monitor
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new BridgeMonitor();
  
  monitor.initialize().then(() => {
    monitor.startMonitoring();
    console.log('\n🔍 Bridge Monitor running. Press Ctrl+C to stop.\n');
  }).catch(console.error);
}

export { BridgeMonitor };
