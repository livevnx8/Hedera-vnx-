/**
 * Vera Enhanced Task Marketplace
 * 
 * Features:
 * - HTTP API for external clients (POST /tasks)
 * - Task categories with pricing tiers
 * - Agent reputation scoring
 * - Automatic task assignment
 * - Real-time metrics dashboard
 * - Webhook notifications
 * 
 * Pricing Tiers:
 * - Basic: 0.1 HBAR (simple tasks)
 * - Standard: 0.5 HBAR (normal tasks)
 * - Premium: 1.0 HBAR (complex tasks)
 * - Enterprise: 5.0 HBAR (mission-critical)
 */

import express from 'express';
import {
  createAgentBeacon,
  createBeaconListener,
  createPaymentDistributor,
  hotTopicsManager,
  DEFAULT_HOT_TOPICS_CONFIG,
} from './dist/vera/orchestrator/index.js';
import { getClient } from './dist/hedera/tools/client.js';
import { logger } from './dist/monitoring/logger.js';
import { config } from './dist/config.js';
import { 
  TopicMessageSubmitTransaction, 
  TransferTransaction, 
  Hbar,
  Client
} from '@hashgraph/sdk';
import crypto from 'crypto';

// Enhanced Configuration
const CONFIG = {
  // Pricing tiers
  tiers: {
    basic: { fee: 0.1, agentReward: 0.005, description: 'Simple tasks' },
    standard: { fee: 0.5, agentReward: 0.01, description: 'Normal tasks' },
    premium: { fee: 1.0, agentReward: 0.02, description: 'Complex tasks' },
    enterprise: { fee: 5.0, agentReward: 0.1, description: 'Mission-critical' },
  },
  batchIntervalMs: 5 * 60 * 1000, // 5 minutes
  maxBatchSize: 20,
  taskExpiryMs: 24 * 60 * 60 * 1000, // 24 hours
  apiPort: 8081,
  webhookUrl: process.env.WEBHOOK_URL || null,
};

const topics = {
  taskQueue: '0.0.10415926',
  results: '0.0.10415927',
  audit: '0.0.10415928',
  beacon: '0.0.10414499',
};

const AGENT_ID = `vera-marketplace-v2-${Date.now()}`;

class EnhancedMarketplace {
  constructor() {
    this.client = null;
    this.beacon = null;
    this.listener = null;
    this.app = express();
    this.paymentQueue = new Map();
    this.pendingTasks = new Map();
    this.agentReputation = new Map(); // agentId -> {tasksCompleted, avgResponseTime, rating}
    this.running = false;
    this.metrics = {
      tasksPosted: 0,
      tasksCompleted: 0,
      tasksExpired: 0,
      agentsPaid: 0,
      totalRevenue: 0,
      totalCosts: 0,
      totalProfit: 0,
      apiRequests: 0,
      batches: 0,
    };
    this.startTime = Date.now();
  }

  async start() {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  💼 VERA ENHANCED TASK MARKETPLACE v2.0                              ║');
    console.log(`║  Agent: ${AGENT_ID.slice(0, 40).padEnd(45)}║`);
    console.log(`║  API Port: ${CONFIG.apiPort.toString().padEnd(43)}║`);
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    // Pricing display
    console.log('💰 PRICING TIERS:');
    Object.entries(CONFIG.tiers).forEach(([name, tier]) => {
      const profit = tier.fee - tier.agentReward;
      console.log(`   ${name.toUpperCase().padEnd(10)}: ${tier.fee} HBAR (profit: ${profit.toFixed(3)}) - ${tier.description}`);
    });
    console.log();

    this.client = getClient();

    // Setup API
    this.setupAPI();

    // Start beacon listener
    console.log('📡 Starting agent discovery...');
    this.listener = createBeaconListener(
      { topicId: topics.beacon },
      {
        onAgentDiscovered: (agent) => this.handleAgentDiscovery(agent),
        onAgentUpdated: (agent) => this.handleAgentUpdate(agent),
      }
    );
    await this.listener.start();

    // Start our beacon
    this.beacon = createAgentBeacon(AGENT_ID, 'enhanced-marketplace', {
      topicId: topics.beacon,
      intervalMs: 30000,
      capabilities: ['marketplace', 'api', 'task-dispatch', 'reputation'],
      metadata: {
        apiEndpoint: `http://localhost:${CONFIG.apiPort}`,
        tiers: Object.keys(CONFIG.tiers),
        version: '2.0',
      },
    });
    await this.beacon.start();

    this.running = true;
    this.startLoops();
    this.startTaskCleanup();

    // Start HTTP API
    this.app.listen(CONFIG.apiPort, () => {
      console.log(`🌐 API listening on http://localhost:${CONFIG.apiPort}`);
      console.log('   POST /tasks - Submit new task');
      console.log('   GET  /tasks - List pending tasks');
      console.log('   GET  /metrics - Marketplace metrics');
      console.log('   GET  /agents - List available agents\n');
    });

    this.setupConsoleInput();
  }

  setupAPI() {
    this.app.use(express.json());

    // POST /tasks - Client submits task
    this.app.post('/tasks', async (req, res) => {
      this.metrics.apiRequests++;
      const { clientId, tier = 'standard', taskType, taskData, priority = 'normal' } = req.body;

      if (!clientId || !taskType) {
        return res.status(400).json({ error: 'Missing clientId or taskType' });
      }

      const tierConfig = CONFIG.tiers[tier];
      if (!tierConfig) {
        return res.status(400).json({ error: 'Invalid tier. Use: basic, standard, premium, enterprise' });
      }

      try {
        const result = await this.postTask(clientId, tier, taskType, taskData, priority);
        if (result.success) {
          res.json({
            success: true,
            taskId: result.taskId,
            txId: result.txId,
            fee: tierConfig.fee,
            estimatedCompletion: '5-10 minutes',
          });
        } else {
          res.status(500).json({ error: result.error });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /tasks - List pending tasks
    this.app.get('/tasks', (req, res) => {
      this.metrics.apiRequests++;
      const tasks = Array.from(this.pendingTasks.entries()).map(([id, task]) => ({
        taskId: id,
        ...task,
        age: Date.now() - task.postedAt,
      }));
      res.json({ tasks, count: tasks.length });
    });

    // GET /metrics - Marketplace metrics
    this.app.get('/metrics', (req, res) => {
      this.metrics.apiRequests++;
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      res.json({
        uptime,
        ...this.metrics,
        profitMargin: this.metrics.totalRevenue > 0 
          ? ((this.metrics.totalProfit / this.metrics.totalRevenue) * 100).toFixed(1) + '%'
          : '0%',
        availableAgents: this.listener?.getHealthyAgents().length || 0,
        pendingPayments: this.paymentQueue.size,
      });
    });

    // GET /agents - List available agents
    this.app.get('/agents', (req, res) => {
      this.metrics.apiRequests++;
      const agents = this.listener?.getHealthyAgents().map(agent => ({
        agentId: agent.agentId,
        agentType: agent.agentType,
        capabilities: agent.capabilities,
        reputation: this.agentReputation.get(agent.agentId) || { rating: 'new' },
        isHealthy: agent.isHealthy,
        lastSeen: agent.lastSeen,
      })) || [];
      res.json({ agents, count: agents.length });
    });

    // GET /agent/:id - Agent details
    this.app.get('/agent/:id', (req, res) => {
      this.metrics.apiRequests++;
      const agent = this.listener?.getDiscoveredAgents().find(a => a.agentId === req.params.id);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      res.json({
        ...agent,
        reputation: this.agentReputation.get(agent.agentId) || { rating: 'new' },
      });
    });
  }

  async postTask(clientId, tier, taskType, taskData, priority) {
    const taskId = `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const tierConfig = CONFIG.tiers[tier];

    try {
      // Collect fee
      const operatorId = process.env.HEDERA_OPERATOR_ID || '0.0.10294360';
      const feeTx = new TransferTransaction()
        .setTransactionMemo(`Task [${tier}] | ${taskId}`)
        .addHbarTransfer(clientId, Hbar.from(-tierConfig.fee))
        .addHbarTransfer(operatorId, Hbar.from(tierConfig.fee));

      const feeResponse = await feeTx.execute(this.client);
      const feeReceipt = await feeResponse.getReceipt(this.client);

      if (feeReceipt.status.toString() !== 'SUCCESS') {
        throw new Error('Fee collection failed');
      }

      // Post to HCS with enhanced metadata
      const taskMessage = JSON.stringify({
        type: 'task-v2',
        taskId,
        tier,
        taskType,
        taskData,
        priority,
        client: clientId,
        reward: tierConfig.agentReward,
        postedAt: Date.now(),
        expiresAt: Date.now() + CONFIG.taskExpiryMs,
        assignedTo: null, // Will be set by auto-assignment
      });

      const taskTx = new TopicMessageSubmitTransaction()
        .setTopicId(topics.taskQueue)
        .setMessage(taskMessage);

      const taskResponse = await taskTx.execute(this.client);

      // Track task
      this.pendingTasks.set(taskId, {
        client: clientId,
        tier,
        fee: tierConfig.fee,
        reward: tierConfig.agentReward,
        postedAt: Date.now(),
        expiresAt: Date.now() + CONFIG.taskExpiryMs,
        taskType,
        priority,
        status: 'posted',
        assignedTo: null,
      });

      this.metrics.tasksPosted++;
      this.metrics.totalRevenue += tierConfig.fee;
      this.metrics.totalProfit += (tierConfig.fee - tierConfig.agentReward);

      // Send webhook notification if configured
      if (CONFIG.webhookUrl) {
        this.sendWebhook('task_posted', { taskId, tier, clientId, fee: tierConfig.fee });
      }

      console.log(`\n💼 TASK [${tier.toUpperCase()}]: ${taskId}`);
      console.log(`   Client: ${clientId} | Fee: ${tierConfig.fee} HBAR`);
      console.log(`   Type: ${taskType} | Priority: ${priority}`);

      return { success: true, taskId, txId: taskResponse.transactionId?.toString() };

    } catch (error) {
      console.log(`   ❌ Task failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  handleAgentDiscovery(agent) {
    console.log(`\n👷 Agent: ${agent.agentId} (${agent.agentType})`);
    
    // Initialize reputation if new
    if (!this.agentReputation.has(agent.agentId)) {
      this.agentReputation.set(agent.agentId, {
        tasksCompleted: 0,
        avgResponseTime: 0,
        rating: 'new',
        joinedAt: Date.now(),
      });
    }

    // Auto-assign pending tasks if agent has matching capabilities
    this.autoAssignTasks(agent);
  }

  handleAgentUpdate(agent) {
    // Update agent activity
    const rep = this.agentReputation.get(agent.agentId);
    if (rep) {
      rep.lastActive = Date.now();
    }
  }

  autoAssignTasks(agent) {
    // Find best matching unassigned task
    for (const [taskId, task] of this.pendingTasks) {
      if (task.status === 'posted' && !task.assignedTo) {
        // Check if agent has matching capabilities
        const agentCaps = agent.capabilities || [];
        if (agentCaps.some(cap => task.taskType.includes(cap) || cap.includes(task.taskType))) {
          task.assignedTo = agent.agentId;
          task.assignedAt = Date.now();
          task.status = 'assigned';
          
          console.log(`   📋 Auto-assigned task ${taskId.slice(0, 16)}...`);
          
          // Notify via webhook
          if (CONFIG.webhookUrl) {
            this.sendWebhook('task_assigned', { taskId, agentId: agent.agentId });
          }
          break; // Assign one task at a time
        }
      }
    }
  }

  startLoops() {
    // Process payments every 5 minutes
    setInterval(() => this.processBatchPayments(), CONFIG.batchIntervalMs);

    // Metrics every 60s
    setInterval(() => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      console.log(`\n📊 [${uptime}s] Tasks: ${this.metrics.tasksPosted}/${this.metrics.tasksCompleted}, Revenue: ${this.metrics.totalRevenue.toFixed(3)}, Profit: ${this.metrics.totalProfit.toFixed(3)}, API: ${this.metrics.apiRequests} req`);
    }, 60000);
  }

  startTaskCleanup() {
    // Clean up expired tasks every 10 minutes
    setInterval(() => {
      const now = Date.now();
      let expired = 0;
      for (const [taskId, task] of this.pendingTasks) {
        if (now > task.expiresAt && task.status !== 'completed') {
          this.pendingTasks.delete(taskId);
          expired++;
          this.metrics.tasksExpired++;
        }
      }
      if (expired > 0) {
        console.log(`\n🧹 Cleaned up ${expired} expired tasks`);
      }
    }, 10 * 60 * 1000);
  }

  async processBatchPayments() {
    if (this.paymentQueue.size === 0) return;

    const batch = [];
    for (const [id, payment] of this.paymentQueue) {
      if (batch.length >= CONFIG.maxBatchSize) break;
      batch.push({ id, ...payment });
    }

    console.log(`\n💸 Paying ${batch.length} agents...`);

    try {
      const tx = new TransferTransaction()
        .setTransactionMemo(`Agent rewards | ${batch.length} payments`);

      let totalPaid = 0;
      for (const payment of batch) {
        tx.addHbarTransfer(payment.accountId, Hbar.from(payment.amount));
        totalPaid += payment.amount;
      }

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status.toString() === 'SUCCESS') {
        batch.forEach(p => {
          this.paymentQueue.delete(p.id);
          this.metrics.agentsPaid++;
          
          // Update agent reputation
          const rep = this.agentReputation.get(p.agentId);
          if (rep) {
            rep.tasksCompleted++;
            rep.rating = rep.tasksCompleted > 10 ? 'expert' : rep.tasksCompleted > 5 ? 'experienced' : 'active';
          }
        });

        this.metrics.totalCosts += totalPaid;
        this.metrics.batches++;

        console.log(`   ✅ Paid ${batch.length} agents! Tx: ${response.transactionId?.toString().slice(0, 25)}...`);
      }
    } catch (error) {
      console.log(`   ❌ Payment failed: ${error.message}`);
    }
  }

  sendWebhook(event, data) {
    if (!CONFIG.webhookUrl) return;
    // Webhook implementation would go here
    // fetch(CONFIG.webhookUrl, { method: 'POST', body: JSON.stringify({ event, data }) });
  }

  setupConsoleInput() {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async (key) => {
      const cmd = key.toString();
      if (cmd === 't') {
        // Quick test task
        await this.postTask('0.0.10294360', 'standard', 'test-task', { test: true }, 'normal');
      } else if (cmd === 'm') {
        console.log(`\n📊 METRICS:`);
        console.log(`   Tasks: ${this.metrics.tasksPosted}/${this.metrics.tasksCompleted}/${this.metrics.tasksExpired}`);
        console.log(`   Revenue: ${this.metrics.totalRevenue.toFixed(3)} HBAR`);
        console.log(`   Profit: ${this.metrics.totalProfit.toFixed(3)} HBAR`);
        console.log(`   API requests: ${this.metrics.apiRequests}`);
        console.log(`   Pending: ${this.pendingTasks.size} tasks, ${this.paymentQueue.size} payments`);
        console.log(`   Agents: ${this.listener?.getHealthyAgents().length || 0} healthy\n`);
      } else if (cmd === 'q' || key[0] === 3) {
        console.log('\n👋 Stopping marketplace...');
        process.exit(0);
      }
    });

    console.log('Console: t=test task, m=metrics, q=quit\n');
  }
}

// Start
const marketplace = new EnhancedMarketplace();
marketplace.start().catch(console.error);
export { marketplace };
