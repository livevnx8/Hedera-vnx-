#!/usr/bin/env node
/**
 * VERA LIVE HCS LOGGING ORCHESTRATOR
 * 
 * Runs all Vera systems with live Hedera Consensus Service logging:
 * - Payment orchestration topics (registry, task, result, audit)
 * - Registry watcher with agent cache
 * - Live HCS message streaming
 * - Health monitoring and metrics
 * - HashScan verification links
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { paymentTopicManager } from './src/vera/orchestrator/topicManager.js';
import { PaymentRegistryWatcher } from './src/vera/orchestrator/registryWatcher.js';
import { config } from './src/config.js';
import { logger } from './src/monitoring/logger.js';
import axios from 'axios';

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const OPERATOR_ID = config.HEDERA_OPERATOR_ACCOUNT_ID;
const PRIVATE_KEY_STR = config.HEDERA_OPERATOR_PRIVATE_KEY;
const NETWORK = config.HEDERA_NETWORK || 'mainnet';
const MIRROR_NODE_URL = config.MIRROR_NODE_BASE_URL || 'https://mainnet-public.mirrornode.hedera.com';

// ═══════════════════════════════════════════════════════════════════════════════
// Hedera Client
// ═══════════════════════════════════════════════════════════════════════════════

function getHederaClient() {
  if (!OPERATOR_ID || !PRIVATE_KEY_STR) {
    throw new Error('HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY required');
  }

  let privateKey;
  if (PRIVATE_KEY_STR.length === 64) {
    try {
      privateKey = PrivateKey.fromStringECDSA(PRIVATE_KEY_STR);
    } catch {
      privateKey = PrivateKey.fromStringED25519(PRIVATE_KEY_STR);
    }
  } else {
    privateKey = PrivateKey.fromString(PRIVATE_KEY_STR);
  }

  const client = NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(OPERATOR_ID, privateKey);
  return { client, privateKey, operatorId: OPERATOR_ID };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Live HCS Logger
// ═══════════════════════════════════════════════════════════════════════════════

class LiveHCSLogger {
  constructor(client, topics) {
    this.client = client;
    this.topics = topics;
    this.messageCount = 0;
    this.startTime = Date.now();
  }

  async logToTopic(topicKey, type, payload) {
    const topicId = this.topics[topicKey];
    if (!topicId) {
      logger.warn('LiveHCSLogger', { message: `Topic ${topicKey} not available`, type });
      return null;
    }

    const message = JSON.stringify({
      type,
      timestamp: Date.now(),
      operator: OPERATOR_ID,
      ...payload
    });

    try {
      const response = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(message)
        .execute(this.client);

      const receipt = await response.getReceipt(this.client);
      this.messageCount++;

      const hashscanUrl = `https://hashscan.io/${NETWORK}/topic/${topicId}`;
      logger.info('LiveHCSLogger', {
        message: `HCS log: ${type}`,
        topic: topicKey,
        topicId,
        sequenceNumber: receipt.topicSequenceNumber?.toString(),
        hashscanUrl
      });

      return {
        success: true,
        sequenceNumber: receipt.topicSequenceNumber?.toString(),
        transactionId: response.transactionId.toString(),
        hashscanUrl
      };
    } catch (error) {
      logger.error('LiveHCSLogger', {
        message: `Failed to log to ${topicKey}`,
        type,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  getStats() {
    return {
      messageCount: this.messageCount,
      uptime: Date.now() - this.startTime,
      messagesPerMinute: (this.messageCount / ((Date.now() - this.startTime) / 60000)).toFixed(2)
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Health Monitor
// ═══════════════════════════════════════════════════════════════════════════════

class HealthMonitor {
  constructor(hcsLogger, registryWatcher) {
    this.hcsLogger = hcsLogger;
    this.registryWatcher = registryWatcher;
    this.checks = [];
    this.startTime = Date.now();
  }

  addCheck(name, checkFn) {
    this.checks.push({ name, checkFn });
  }

  async runChecks() {
    const results = [];
    for (const { name, checkFn } of this.checks) {
      try {
        const result = await checkFn();
        results.push({ name, status: result ? 'healthy' : 'unhealthy', timestamp: Date.now() });
      } catch (error) {
        results.push({ name, status: 'error', error: error.message, timestamp: Date.now() });
      }
    }
    return results;
  }

  async broadcastHealth() {
    const checks = await this.runChecks();
    const healthy = checks.filter(c => c.status === 'healthy').length;
    const total = checks.length;

    await this.hcsLogger.logToTopic('auditTopicId', 'health_check', {
      checks,
      summary: { healthy, total, percentage: Math.round((healthy / total) * 100) },
      uptime: Date.now() - this.startTime
    });

    return { healthy, total, checks };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

class VeraLiveOrchestrator {
  constructor() {
    this.topics = null;
    this.hcsLogger = null;
    this.registryWatcher = null;
    this.healthMonitor = null;
    this.running = false;
  }

  async initialize() {
    console.log('\n🔧 Initializing Vera Live HCS Orchestrator...\n');

    // Step 1: Ensure topics exist
    console.log('📡 Step 1: Ensuring HCS topics...');
    this.topics = await paymentTopicManager.ensureTopics();
    console.log('✅ Topics ready:');
    console.log(`   Registry: ${this.topics.registryTopicId || 'NOT CONFIGURED'}`);
    console.log(`   Task:     ${this.topics.taskTopicId || 'NOT CONFIGURED'}`);
    console.log(`   Result:   ${this.topics.resultTopicId || 'NOT CONFIGURED'}`);
    console.log(`   Audit:    ${this.topics.auditTopicId || 'NOT CONFIGURED'}`);

    // Step 2: Initialize Hedera client
    console.log('\n🔑 Step 2: Initializing Hedera client...');
    const { client } = getHederaClient();
    console.log(`✅ Client ready (Operator: ${OPERATOR_ID})`);

    // Step 3: Initialize HCS logger
    console.log('\n📝 Step 3: Initializing HCS logger...');
    this.hcsLogger = new LiveHCSLogger(client, this.topics);
    console.log('✅ HCS logger ready');

    // Step 4: Initialize registry watcher
    console.log('\n👁 Step 4: Initializing registry watcher...');
    this.registryWatcher = new PaymentRegistryWatcher({
      topicId: this.topics.registryTopicId,
      mirrorNodeUrl: MIRROR_NODE_URL,
      pollIntervalMs: 30000
    });
    this.registryWatcher.start();
    console.log('✅ Registry watcher started (30s poll interval)');

    // Step 5: Initialize health monitor
    console.log('\n🏥 Step 5: Initializing health monitor...');
    this.healthMonitor = new HealthMonitor(this.hcsLogger, this.registryWatcher);
    this.setupHealthChecks();
    console.log('✅ Health monitor ready');

    // Log startup to audit topic
    await this.hcsLogger.logToTopic('auditTopicId', 'system_startup', {
      topics: this.topics,
      operator: OPERATOR_ID,
      network: NETWORK,
      version: '1.0.0'
    });

    console.log('\n🚀 Vera Live HCS Orchestrator is RUNNING!\n');
    this.printDashboard();
    this.running = true;
  }

  setupHealthChecks() {
    this.healthMonitor.addCheck('hcs_connection', async () => {
      try {
        const url = `${MIRROR_NODE_URL}/api/v1/network/nodes`;
        await axios.get(url, { timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    });

    this.healthMonitor.addCheck('registry_topic', async () => {
      return !!this.topics.registryTopicId;
    });

    this.healthMonitor.addCheck('task_topic', async () => {
      return !!this.topics.taskTopicId;
    });

    this.healthMonitor.addCheck('result_topic', async () => {
      return !!this.topics.resultTopicId;
    });

    this.healthMonitor.addCheck('audit_topic', async () => {
      return !!this.topics.auditTopicId;
    });

    this.healthMonitor.addCheck('registry_watcher', async () => {
      const stats = this.registryWatcher.getStats();
      return stats.errors < 10;
    });
  }

  printDashboard() {
    console.log('═'.repeat(70));
    console.log('  VERA LIVE HCS DASHBOARD');
    console.log('═'.repeat(70));
    console.log('\n📊 TOPICS:');
    Object.entries(this.topics).forEach(([key, id]) => {
      if (id) {
        console.log(`   ${key}: ${id}`);
        console.log(`   └─ https://hashscan.io/${NETWORK}/topic/${id}`);
      }
    });
    console.log('\n📈 METRICS:');
    console.log(`   Messages logged: ${this.hcsLogger.messageCount}`);
    console.log(`   Registry agents: ${this.registryWatcher.getStats().activeAgents}`);
    console.log(`   System uptime: ${this.formatUptime(Date.now() - this.hcsLogger.startTime)}`);
    console.log('\n🎯 COMMANDS:');
    console.log('   Press Ctrl+C to stop');
    console.log('═'.repeat(70));
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }

  async runHealthBroadcast() {
    while (this.running) {
      await new Promise(resolve => setTimeout(resolve, 60000)); // Every minute
      if (!this.running) break;

      const health = await this.healthMonitor.broadcastHealth();
      logger.info('HealthMonitor', {
        message: 'Health broadcast complete',
        healthy: health.healthy,
        total: health.total
      });
    }
  }

  async simulateActivity() {
    // Simulate some activity to demonstrate the system
    const activities = [
      { type: 'agent_registration', service: 'carbon-validation', fee: 0.0003 },
      { type: 'task_posted', description: 'Audit F1 tire data', budget: 0.001 },
      { type: 'bid_received', agent: 'carbon-auditor-001', amount: 0.0009 },
      { type: 'task_awarded', agent: 'carbon-auditor-001', taskId: 'f1-tire-001' },
      { type: 'result_submitted', taskId: 'f1-tire-001', confidence: 0.94 },
      { type: 'payment_settled', taskId: 'f1-tire-001', amount: 0.0009 }
    ];

    let idx = 0;
    while (this.running) {
      await new Promise(resolve => setTimeout(resolve, 15000)); // Every 15 seconds
      if (!this.running) break;

      const activity = activities[idx % activities.length];
      await this.hcsLogger.logToTopic('auditTopicId', activity.type, activity);
      idx++;

      // Update dashboard periodically
      if (idx % 4 === 0) {
        console.clear();
        this.printDashboard();
      }
    }
  }

  async start() {
    await this.initialize();

    // Start background tasks
    Promise.all([
      this.runHealthBroadcast(),
      this.simulateActivity()
    ]).catch(console.error);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down...');
      this.running = false;
      this.registryWatcher.stop();
      await this.hcsLogger.logToTopic('auditTopicId', 'system_shutdown', {
        reason: 'user_interrupt',
        finalStats: this.hcsLogger.getStats()
      });
      console.log('✅ Shutdown complete');
      process.exit(0);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Start
// ═══════════════════════════════════════════════════════════════════════════════

const orchestrator = new VeraLiveOrchestrator();
orchestrator.start().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
