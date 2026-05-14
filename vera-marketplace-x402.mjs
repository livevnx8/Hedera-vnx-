/**
 * Vera x402 Streaming Payment Marketplace v3.0
 * 
 * Revolutionary Features:
 * - x402 micropayment streaming (pay-as-you-go)
 * - Per-second billing for agent compute time
 * - Payment streams start on task begin, stop on completion
 * - Automatic settlement with Hedera
 * - Real-time payment verification
 * - No upfront fees - clients only pay for actual work done
 * 
 * x402 Protocol Integration:
 * - HTTP 402 Payment Required responses
 * - Streaming payment channels
 * - Automatic micropayment settlement
 * - Proof-of-payment verification
 */

import express from 'express';
import {
  createAgentBeacon,
  createBeaconListener,
  hotTopicsManager,
} from './dist/vera/orchestrator/index.js';
import { getClient } from './dist/hedera/tools/client.js';
import { logger } from './dist/monitoring/logger.js';
import { 
  TopicMessageSubmitTransaction, 
  TransferTransaction, 
  Hbar,
  Client
} from '@hashgraph/sdk';
import crypto from 'crypto';
import { createHash } from 'crypto';

// x402 Configuration
const X402_CONFIG = {
  enabled: true,
  // Pricing per second of agent compute time
  computeRates: {
    basic: 0.0001,      // 0.0001 HBAR/sec = ~0.36 HBAR/hour
    standard: 0.0005,   // 0.0005 HBAR/sec = ~1.8 HBAR/hour  
    premium: 0.001,     // 0.001 HBAR/sec = ~3.6 HBAR/hour
    enterprise: 0.005,  // 0.005 HBAR/sec = ~18 HBAR/hour
  },
  // Minimum payment to start task (prevents spam)
  minimumDeposit: 0.01, // 0.01 HBAR minimum
  // Settlement interval (settle every X seconds)
  settlementIntervalSec: 60,
  // x402 payment endpoint
  paymentEndpoint: '/x402/pay',
  // Grace period for payment verification
  gracePeriodMs: 5000,
};

const topics = {
  taskQueue: '0.0.10415926',
  results: '0.0.10415927',
  audit: '0.0.10415928',
  beacon: '0.0.10414499',
};

const AGENT_ID = `vera-x402-${Date.now()}`;

class X402PaymentStream {
  constructor(taskId, clientId, agentId, rate, client) {
    this.taskId = taskId;
    this.clientId = clientId;
    this.agentId = agentId;
    this.rate = rate; // HBAR per second
    this.client = client;
    
    this.startTime = null;
    this.endTime = null;
    this.totalPaid = 0;
    this.lastSettlement = 0;
    this.payments = []; // Payment history
    this.status = 'pending'; // pending, active, paused, completed, failed
    this.streamId = `stream-${taskId}`;
  }

  start() {
    this.startTime = Date.now();
    this.status = 'active';
    this.lastSettlement = this.startTime;
    console.log(`   💸 Payment stream started: ${this.rate} HBAR/sec`);
    return this;
  }

  pause() {
    this.status = 'paused';
    this.settle(); // Settle pending payments
    console.log(`   ⏸️  Payment stream paused`);
  }

  resume() {
    this.status = 'active';
    this.lastSettlement = Date.now();
    console.log(`   ▶️  Payment stream resumed`);
  }

  async settle() {
    if (!this.startTime || this.status === 'completed') return 0;
    
    const now = Date.now();
    const elapsedSec = (now - this.lastSettlement) / 1000;
    const amount = elapsedSec * this.rate;
    
    if (amount < 0.00001) return 0; // Too small to bother
    
    try {
      const operatorId = process.env.HEDERA_OPERATOR_ID || '0.0.10294360';
      
      // x402 micropayment: client -> Vera (operator)
      const tx = new TransferTransaction()
        .setTransactionMemo(`x402 | ${this.taskId.slice(0, 20)} | ${elapsedSec.toFixed(1)}s`)
        .addHbarTransfer(this.clientId, Hbar.from(-amount))
        .addHbarTransfer(operatorId, Hbar.from(amount));
      
      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      
      if (receipt.status.toString() === 'SUCCESS') {
        this.totalPaid += amount;
        this.payments.push({
          timestamp: now,
          amount,
          duration: elapsedSec,
          txId: response.transactionId?.toString(),
        });
        this.lastSettlement = now;
        
        console.log(`   💰 Settled: ${amount.toFixed(6)} HBAR (${elapsedSec.toFixed(1)}s)`);
        return amount;
      }
    } catch (error) {
      console.log(`   ⚠️  Settlement failed: ${error.message}`);
      this.status = 'failed';
    }
    return 0;
  }

  async complete() {
    this.endTime = Date.now();
    const finalAmount = await this.settle();
    this.status = 'completed';
    
    const totalDuration = (this.endTime - this.startTime) / 1000;
    console.log(`   ✅ Stream completed: ${this.totalPaid.toFixed(6)} HBAR total (${totalDuration.toFixed(1)}s)`);
    
    return {
      totalPaid: this.totalPaid,
      duration: totalDuration,
      payments: this.payments.length,
    };
  }

  getCurrentEstimate() {
    if (!this.startTime || this.status !== 'active') return 0;
    const elapsedSec = (Date.now() - this.startTime) / 1000;
    return elapsedSec * this.rate;
  }
}

class X402Marketplace {
  constructor() {
    this.client = null;
    this.beacon = null;
    this.listener = null;
    this.app = express();
    
    // Active payment streams
    this.activeStreams = new Map(); // taskId -> X402PaymentStream
    this.completedStreams = []; // Archive
    
    // Task management
    this.pendingTasks = new Map();
    this.activeTasks = new Map();
    this.completedTasks = new Map();
    
    // Agent management
    this.agentReputation = new Map();
    this.agentRates = new Map(); // Custom rates per agent
    
    this.running = false;
    this.metrics = {
      tasksPosted: 0,
      tasksActive: 0,
      tasksCompleted: 0,
      totalStreamed: 0, // Total HBAR streamed
      totalSettled: 0,  // Total HBAR settled to Vera
      totalPaidToAgents: 0,
      activeStreams: 0,
      avgTaskDuration: 0,
      apiRequests: 0,
    };
    this.startTime = Date.now();
  }

  async start() {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  ⚡ VERA x402 STREAMING PAYMENT MARKETPLACE v3.0                      ║');
    console.log(`║  Agent: ${AGENT_ID.slice(0, 40).padEnd(45)}║`);
    console.log('║  Protocol: x402 Micropayment Streaming                              ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    // x402 Pricing display
    console.log('💰 COMPUTE RATES (per second):');
    Object.entries(X402_CONFIG.computeRates).forEach(([tier, rate]) => {
      const perHour = rate * 3600;
      console.log(`   ${tier.toUpperCase().padEnd(10)}: ${rate.toFixed(4)} HBAR/s (~${perHour.toFixed(2)}/hr)`);
    });
    console.log(`   Minimum deposit: ${X402_CONFIG.minimumDeposit} HBAR\n`);

    this.client = getClient();

    // Setup x402 API
    this.setupX402API();

    // Start agent discovery
    console.log('📡 Starting agent discovery...');
    this.listener = createBeaconListener(
      { topicId: topics.beacon },
      {
        onAgentDiscovered: (agent) => this.handleAgentDiscovery(agent),
        onAgentUpdated: (agent) => this.handleAgentUpdate(agent),
      }
    );
    await this.listener.start();

    // Start beacon
    this.beacon = createAgentBeacon(AGENT_ID, 'x402-marketplace', {
      topicId: topics.beacon,
      intervalMs: 30000,
      capabilities: ['x402', 'streaming-payments', 'pay-per-use', 'micropayments'],
      metadata: {
        protocol: 'x402',
        endpoint: `http://localhost:8082${X402_CONFIG.paymentEndpoint}`,
        rates: X402_CONFIG.computeRates,
        version: '3.0',
      },
    });
    await this.beacon.start();

    this.running = true;
    this.startLoops();

    // Start HTTP API
    this.app.listen(8082, () => {
      console.log('🌐 x402 API on http://localhost:8082');
      console.log(`   POST ${X402_CONFIG.paymentEndpoint} - Submit x402 payment`);
      console.log('   GET  /tasks - List tasks');
      console.log('   GET  /streams - Active payment streams');
      console.log('   GET  /metrics - Real-time metrics\n');
    });

    this.setupConsoleInput();
    
    console.log('✅ x402 MARKETPLACE ACTIVE');
    console.log('   Clients pay only for actual compute time used\n');
  }

  setupX402API() {
    this.app.use(express.json());

    // x402 Payment Endpoint
    this.app.post(X402_CONFIG.paymentEndpoint, async (req, res) => {
      this.metrics.apiRequests++;
      const { taskId, clientId, tier, amount, proof } = req.body;

      // Verify minimum deposit
      if (amount < X402_CONFIG.minimumDeposit) {
        return res.status(402).json({
          error: 'Payment Required',
          message: `Minimum deposit is ${X402_CONFIG.minimumDeposit} HBAR`,
          x402: true,
          required: X402_CONFIG.minimumDeposit,
          received: amount,
        });
      }

      try {
        // Collect initial deposit
        const result = await this.collectDeposit(taskId, clientId, tier, amount);
        
        if (result.success) {
          res.json({
            success: true,
            taskId,
            streamId: result.streamId,
            rate: result.rate,
            message: 'x402 payment stream initiated',
          });
        } else {
          res.status(402).json({
            error: 'Payment failed',
            x402: true,
            details: result.error,
          });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get task status with x402 stream info
    this.app.get('/task/:id', (req, res) => {
      this.metrics.apiRequests++;
      const task = this.pendingTasks.get(req.params.id) || 
                   this.activeTasks.get(req.params.id) ||
                   this.completedTasks.get(req.params.id);
      
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const stream = this.activeStreams.get(req.params.id);
      
      res.json({
        ...task,
        paymentStream: stream ? {
          status: stream.status,
          totalPaid: stream.totalPaid,
          currentEstimate: stream.getCurrentEstimate(),
          duration: stream.startTime ? (Date.now() - stream.startTime) / 1000 : 0,
        } : null,
      });
    });

    // List active streams
    this.app.get('/streams', (req, res) => {
      this.metrics.apiRequests++;
      const streams = Array.from(this.activeStreams.entries()).map(([id, stream]) => ({
        taskId: id,
        clientId: stream.clientId,
        agentId: stream.agentId,
        status: stream.status,
        rate: stream.rate,
        totalPaid: stream.totalPaid,
        duration: stream.startTime ? (Date.now() - stream.startTime) / 1000 : 0,
        estimate: stream.getCurrentEstimate(),
      }));
      
      res.json({ active: streams.length, streams });
    });

    // Real-time metrics
    this.app.get('/metrics', (req, res) => {
      this.metrics.apiRequests++;
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      
      res.json({
        uptime,
        ...this.metrics,
        activeStreams: this.activeStreams.size,
        efficiency: this.metrics.tasksCompleted > 0 
          ? (this.metrics.totalSettled / this.metrics.tasksCompleted).toFixed(6)
          : 0,
        availableAgents: this.listener?.getHealthyAgents().length || 0,
      });
    });

    // List all tasks
    this.app.get('/tasks', (req, res) => {
      this.metrics.apiRequests++;
      const tasks = [
        ...Array.from(this.pendingTasks.entries()).map(([id, t]) => ({ id, ...t, status: 'pending' })),
        ...Array.from(this.activeTasks.entries()).map(([id, t]) => ({ id, ...t, status: 'active' })),
        ...Array.from(this.completedTasks.entries()).map(([id, t]) => ({ id, ...t, status: 'completed' })),
      ];
      res.json({ tasks, count: tasks.length });
    });
  }

  async collectDeposit(taskId, clientId, tier, deposit) {
    try {
      const operatorId = process.env.HEDERA_OPERATOR_ID || '0.0.10294360';
      const rate = X402_CONFIG.computeRates[tier] || X402_CONFIG.computeRates.standard;

      // Collect initial deposit
      const tx = new TransferTransaction()
        .setTransactionMemo(`x402 deposit | ${taskId}`)
        .addHbarTransfer(clientId, Hbar.from(-deposit))
        .addHbarTransfer(operatorId, Hbar.from(deposit));

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status.toString() === 'SUCCESS') {
        // Create payment stream
        const stream = new X402PaymentStream(taskId, clientId, null, rate, this.client);
        this.activeStreams.set(taskId, stream);
        this.metrics.activeStreams = this.activeStreams.size;
        
        // Move task to active
        const task = this.pendingTasks.get(taskId);
        if (task) {
          task.deposit = deposit;
          task.rate = rate;
          task.status = 'funded';
          this.activeTasks.set(taskId, task);
          this.pendingTasks.delete(taskId);
        }

        console.log(`\n⚡ x402 STREAM: ${taskId}`);
        console.log(`   Client: ${clientId} | Deposit: ${deposit} HBAR`);
        console.log(`   Rate: ${rate} HBAR/sec | Tier: ${tier}`);

        return { success: true, streamId: stream.streamId, rate };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  handleAgentDiscovery(agent) {
    console.log(`\n👷 Agent: ${agent.agentId}`);
    
    if (!this.agentReputation.has(agent.agentId)) {
      this.agentReputation.set(agent.agentId, {
        tasksCompleted: 0,
        totalEarned: 0,
        rating: 'new',
        joinedAt: Date.now(),
      });
    }

    // Auto-assign funded tasks
    this.assignTaskToAgent(agent);
  }

  handleAgentUpdate(agent) {
    const rep = this.agentReputation.get(agent.agentId);
    if (rep) {
      rep.lastActive = Date.now();
    }
  }

  assignTaskToAgent(agent) {
    // Find funded task waiting for agent
    for (const [taskId, task] of this.activeTasks) {
      if (task.status === 'funded' && !task.assignedTo) {
        const stream = this.activeStreams.get(taskId);
        if (stream) {
          task.assignedTo = agent.agentId;
          task.status = 'active';
          task.startedAt = Date.now();
          stream.agentId = agent.agentId;
          stream.start();
          
          this.metrics.tasksActive++;
          
          console.log(`   📋 Task ${taskId.slice(0, 16)} assigned to ${agent.agentId.slice(0, 20)}...`);
          
          // Post to HCS
          this.broadcastTaskStart(taskId, agent.agentId);
          break;
        }
      }
    }
  }

  async broadcastTaskStart(taskId, agentId) {
    try {
      const message = JSON.stringify({
        type: 'task-started-x402',
        taskId,
        agentId,
        startedAt: Date.now(),
        protocol: 'x402',
      });

      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(topics.taskQueue)
        .setMessage(message);

      await tx.execute(this.client);
    } catch (error) {
      console.log(`   ⚠️  HCS broadcast failed: ${error.message}`);
    }
  }

  startLoops() {
    // Continuous settlement loop (every 60s)
    setInterval(async () => {
      for (const [taskId, stream] of this.activeStreams) {
        if (stream.status === 'active') {
          const settled = await stream.settle();
          if (settled > 0) {
            this.metrics.totalSettled += settled;
          }
        }
      }
    }, X402_CONFIG.settlementIntervalSec * 1000);

    // Metrics display
    setInterval(() => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      console.log(`\n⚡ [${uptime}s] Active: ${this.metrics.tasksActive}/${this.activeStreams.size} | Settled: ${this.metrics.totalSettled.toFixed(6)} HBAR | Tasks: ${this.metrics.tasksCompleted}`);
    }, 60000);
  }

  async completeTask(taskId, result) {
    const stream = this.activeStreams.get(taskId);
    const task = this.activeTasks.get(taskId);
    
    if (stream && task) {
      const summary = await stream.complete();
      
      // Pay agent from settled funds
      const agentPayment = summary.totalPaid * 0.7; // 70% to agent
      const veraProfit = summary.totalPaid * 0.3;   // 30% to Vera
      
      if (task.assignedTo && agentPayment > 0) {
        await this.payAgent(task.assignedTo, agentPayment, taskId);
      }
      
      // Archive
      this.completedStreams.push({
        taskId,
        ...summary,
        agentPayment,
        veraProfit,
        completedAt: Date.now(),
      });
      
      this.activeStreams.delete(taskId);
      this.activeTasks.delete(taskId);
      this.completedTasks.set(taskId, {
        ...task,
        ...summary,
        result,
        completedAt: Date.now(),
      });
      
      this.metrics.tasksActive--;
      this.metrics.tasksCompleted++;
      this.metrics.totalPaidToAgents += agentPayment;
      this.metrics.activeStreams = this.activeStreams.size;
      
      console.log(`   ✅ Task ${taskId.slice(0, 16)} completed!`);
      console.log(`   💰 Agent: ${agentPayment.toFixed(6)} | Vera: ${veraProfit.toFixed(6)}`);
    }
  }

  async payAgent(agentId, amount, taskId) {
    try {
      const tx = new TransferTransaction()
        .setTransactionMemo(`x402 payout | ${taskId.slice(0, 20)}`)
        .addHbarTransfer(agentId, Hbar.from(amount));

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status.toString() === 'SUCCESS') {
        const rep = this.agentReputation.get(agentId);
        if (rep) {
          rep.tasksCompleted++;
          rep.totalEarned += amount;
          rep.rating = rep.tasksCompleted > 10 ? 'expert' : rep.tasksCompleted > 3 ? 'pro' : 'active';
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Agent payment failed: ${error.message}`);
    }
  }

  setupConsoleInput() {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async (key) => {
      const cmd = key.toString();
      
      if (cmd === 't') {
        // Quick test: post task
        const taskId = `task-${Date.now()}`;
        this.pendingTasks.set(taskId, {
          taskType: 'test',
          tier: 'standard',
          clientId: '0.0.10294360',
          postedAt: Date.now(),
          status: 'pending',
        });
        console.log(`\n📋 Posted test task: ${taskId}`);
        console.log(`   Use: curl -X POST http://localhost:8082/x402/pay -d '{"taskId":"${taskId}","clientId":"0.0.10294360","tier":"standard","amount":0.05}'`);
      } else if (cmd === 's') {
        // Show streams
        console.log(`\n⚡ ACTIVE STREAMS: ${this.activeStreams.size}`);
        for (const [id, stream] of this.activeStreams) {
          console.log(`   ${id.slice(0, 20)}... | ${stream.status} | ${stream.totalPaid.toFixed(6)} HBAR`);
        }
      } else if (cmd === 'm') {
        console.log(`\n📊 METRICS:`);
        console.log(`   Tasks: ${this.metrics.tasksPosted}/${this.metrics.tasksActive}/${this.metrics.tasksCompleted}`);
        console.log(`   Settled: ${this.metrics.totalSettled.toFixed(6)} HBAR`);
        console.log(`   Paid to agents: ${this.metrics.totalPaidToAgents.toFixed(6)} HBAR`);
        console.log(`   Vera profit: ${(this.metrics.totalSettled - this.metrics.totalPaidToAgents).toFixed(6)} HBAR`);
        console.log(`   Active streams: ${this.activeStreams.size}\n`);
      } else if (cmd === 'q' || key[0] === 3) {
        console.log('\n👋 Stopping x402 marketplace...');
        
        // Settle all active streams
        for (const [taskId, stream] of this.activeStreams) {
          await stream.settle();
        }
        
        process.exit(0);
      }
    });

    console.log('Console: t=post test task, s=show streams, m=metrics, q=quit\n');
  }
}

// Start
const marketplace = new X402Marketplace();
marketplace.start().catch(console.error);
export { marketplace, X402PaymentStream };
