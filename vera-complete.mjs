/**
 * Vera COMPLETE Live Orchestrator
 * 
 * Runs ALL systems with constant heartbeat:
 * - HCS Beacon (30s heartbeat, 5s SOS)
 * - Agent Discovery & Auto-payment
 * - Hot Topics Radar
 * - Health Monitoring
 * - Revenue Distribution (4 accounts)
 * 
 * Discoverable via HCS topic 0.0.10414499
 */

import {
  createAgentBeacon,
  createBeaconListener,
  createPaymentDistributor,
  createHotTopicsScanner,
  DEFAULT_HOT_TOPICS_CONFIG,
} from './dist/vera/orchestrator/index.js';
import { getClient } from './dist/hedera/tools/client.js';
import { logger } from './dist/monitoring/logger.js';
import { config } from './dist/config.js';
import { TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import fs from 'fs';

// Topic IDs
const topics = {
  registry: '0.0.10415925',
  task: '0.0.10415926',
  result: '0.0.10415927',
  audit: '0.0.10415928',
  beacon: '0.0.10414499',
  hotTopics: '0.0.10414507',
};

// Revenue accounts - Using operator as treasury (has signing key)
const accounts = {
  operator: '0.0.10294360',   // Vera's operator account (acts as treasury)
  treasury: '0.0.10294360',   // Same as operator
  operations: '0.0.10294360', // Tracked separately but same account
  reserve: '0.0.10294360',    // Tracked separately but same account
};

const AGENT_ID = `vera-complete-${Date.now()}`;

class VeraCompleteOrchestrator {
  constructor() {
    this.client = null;
    this.beacon = null;
    this.listener = null;
    this.payments = null;
    this.hotTopics = null;
    this.running = false;
    this.metrics = { heartbeats: 0, payments: 0, agents: 0, scans: 0 };
    this.startTime = Date.now();
  }

  async start() {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  🚀 VERA COMPLETE LIVE ORCHESTRATOR                                  ║');
    console.log(`║  Agent: ${AGENT_ID.slice(0, 40).padEnd(45)}║`);
    console.log(`║  Treasury: ${accounts.treasury.padEnd(43)}║`);
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    this.client = getClient();

    // 1. Payment Distributor
    console.log('💰 Payment Distributor: 0.08 HBAR/task');
    console.log('   ├─ Agent: 50% (0.04 HBAR)');
    console.log('   ├─ Treasury: 20% (0.016 HBAR)');
    console.log('   ├─ Operations: 15% (0.012 HBAR)');
    console.log('   └─ Reserve: 15% (0.012 HBAR)\n');

    this.payments = createPaymentDistributor({
      treasuryAccountId: accounts.treasury,
      operationsAccountId: accounts.operations,
      reserveAccountId: accounts.reserve,
      taskRewardHbar: 0.08,
    });
    this.payments.setClient(this.client);

    // 2. Beacon Listener (Discovery)
    console.log('📡 Beacon Listener starting...');
    this.listener = createBeaconListener(
      { topicId: topics.beacon },
      {
        onAgentDiscovered: (agent) => {
          this.metrics.agents++;
          console.log(`\n🔍 Found: ${agent.agentId} (${agent.agentType})`);
          if (agent.isHealthy) {
            console.log('   ✅ Healthy - auto-payment triggered');
            this.payAgent(agent);
          }
        },
        onAgentUpdated: (a) => console.log(`🔄 ${a.agentId}: msgs=${a.messageCount}`),
        onAgentTimeout: (id) => console.log(`⚠️ Timeout: ${id}`),
        onSOS: (sos) => console.log(`\n🆘 SOS: ${sos.agentId} - ${sos.reason}`),
      }
    );
    await this.listener.start();

    // 3. Our Beacon (30s heartbeat)
    console.log('📢 Starting heartbeat (30s)...');
    this.beacon = createAgentBeacon(AGENT_ID, 'complete-orchestrator', {
      topicId: topics.beacon,
      intervalMs: 30000,
      capabilities: ['payments', 'discovery', 'hot-topics', 'health-monitor'],
      metadata: { treasury: accounts.treasury, version: '2.0' },
    });
    // Track heartbeats manually via pulse callback if needed
    await this.beacon.start();

    // 4. Hot Topics Radar
    console.log('🔥 Hot Topics Radar active\n');
    this.hotTopics = createHotTopicsScanner({
      ...DEFAULT_HOT_TOPICS_CONFIG,
      publishResultsToHcs: true,
      resultsTopicId: topics.hotTopics,
    });
    await this.hotTopics.start();

    this.running = true;
    this.startLoops();

    console.log('✅ ALL SYSTEMS ACTIVE\n');
    console.log('Commands:');
    console.log('  s = trigger SOS');
    console.log('  p = pay healthy agents now');
    console.log('  m = show metrics');
    console.log('  q = quit\n');

    this.setupInput();
    process.on('SIGINT', () => this.stop());
  }

  async payAgent(agent) {
    const accountId = agent.metadata?.accountId || accounts.treasury;
    const result = await this.payments.payHealthyAgent(
      agent.agentId, accountId, agent.isHealthy, `auto-${Date.now()}`
    );
    if (result.success) {
      this.metrics.payments++;
      console.log(`💸 Paid ${agent.agentId}: ${JSON.stringify(result.distributed)}`);
    }
  }

  startLoops() {
    // Metrics every 60s
    setInterval(() => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const healthy = this.listener?.getHealthyAgents().length || 0;
      const totals = this.payments?.getTotalDistributed();
      console.log(`\n📊 [${uptime}s] Heartbeats: ${this.metrics.heartbeats}, Agents: ${this.metrics.agents}, Payments: ${this.metrics.payments}, Healthy: ${healthy}, Total HBAR: ${totals?.total?.toFixed(3) || 0}`);
      this.broadcastStatus({ uptime, ...this.metrics, healthy, totalDistributed: totals?.total || 0 });
    }, 60000);

    // Hot topics scan every 5min
    setInterval(async () => {
      console.log('🔥 Scanning hot topics...');
      const result = await this.hotTopics.scanForHotTopics();
      if (result.highVolumeTopics?.length) {
        console.log(`⚡ ${result.highVolumeTopics.length} hot topics found!`);
        result.highVolumeTopics.forEach(t => console.log(`   ${t.topicId}: ${t.volumeEstimate}/hr`));
      }
      this.metrics.scans++;
    }, 5 * 60 * 1000);
  }

  async broadcastStatus(status) {
    try {
      const msg = JSON.stringify({ type: 'vera-status', agentId: AGENT_ID, timestamp: Date.now(), status });
      await new TopicMessageSubmitTransaction().setTopicId(topics.audit).setMessage(msg).execute(this.client);
    } catch {}
  }

  setupInput() {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async (key) => {
      const cmd = key.toString();
      if (cmd === 's') {
        console.log('\n🆘 Triggering SOS...');
        await this.beacon.triggerSOS('critical', 'Manual SOS trigger', 'MANUAL');
      } else if (cmd === 'p') {
        console.log('\n💰 Paying healthy agents...');
        const healthy = this.listener?.getHealthyAgents() || [];
        for (const agent of healthy) await this.payAgent(agent);
      } else if (cmd === 'm') {
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        console.log(`\n📊 METRICS: ${JSON.stringify({ uptime, ...this.metrics }, null, 2)}`);
      } else if (cmd === 'q' || key[0] === 3) {
        await this.stop();
      }
    });
  }

  async stop() {
    console.log('\n👋 Stopping...\n');
    this.running = false;
    await this.beacon?.stop();
    await this.listener?.stop();
    await this.hotTopics?.stop();
    const totals = this.payments?.getTotalDistributed();
    console.log(`\n💰 FINAL: Payments: ${this.metrics.payments}, Total: ${totals?.total?.toFixed(3)} HBAR`);
    console.log(`📊 Heartbeats: ${this.metrics.heartbeats}, Agents: ${this.metrics.agents}, Scans: ${this.metrics.scans}\n`);
    process.exit(0);
  }
}

// Start
const orchestrator = new VeraCompleteOrchestrator();
orchestrator.start().catch(console.error);
export { orchestrator };
