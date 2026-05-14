/**
 * Vera Task Marketplace
 * 
 * Revenue model: Task Marketplace
 * - Clients pay 0.5 HBAR to post tasks
 * - Agents complete tasks + submit proof-of-work
 * - Vera pays agents 0.01 HBAR for completion
 * - Vera profit: 0.49 HBAR per task (98% margin)
 * 
 * Topics:
 * - Task Queue: 0.0.10415926 (client tasks)
 * - Results: 0.0.10415927 (agent submissions)
 * - Audit: 0.0.10415928 (payment records)
 */

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
  TopicMessageQuery,
  Client
} from '@hashgraph/sdk';
import crypto from 'crypto';

// Configuration
const CONFIG = {
  taskPostFee: 0.5,        // HBAR clients pay to post task
  agentReward: 0.01,       // HBAR paid to agent for completion
  veraProfit: 0.49,        // HBAR profit per task
  batchIntervalMs: 5 * 60 * 1000, // 5 minutes
  maxBatchSize: 20,
  minBalance: 1.0,
};

const topics = {
  taskQueue: '0.0.10415926',    // Clients post tasks here
  results: '0.0.10415927',      // Agents submit results here
  audit: '0.0.10415928',        // Payment records
  beacon: '0.0.10414499',       // Agent discovery
};

const AGENT_ID = `vera-marketplace-${Date.now()}`;

class VeraTaskMarketplace {
  constructor() {
    this.client = null;
    this.beacon = null;
    this.listener = null;
    this.paymentQueue = new Map();
    this.pendingTasks = new Map(); // taskId -> {client, fee, postedAt}
    this.running = false;
    this.metrics = {
      tasksPosted: 0,
      tasksCompleted: 0,
      agentsPaid: 0,
      totalClientRevenue: 0,
      totalAgentCosts: 0,
      veraProfit: 0,
      batches: 0,
    };
    this.startTime = Date.now();
  }

  async start() {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  💼 VERA TASK MARKETPLACE                                            ║');
    console.log(`║  Agent: ${AGENT_ID.slice(0, 40).padEnd(45)}║`);
    console.log(`║  Task Fee: ${CONFIG.taskPostFee.toString().padEnd(44)}║`);
    console.log(`║  Agent Reward: ${CONFIG.agentReward.toString().padEnd(41)}║`);
    console.log(`║  Vera Profit: ${CONFIG.veraProfit.toString().padEnd(42)}║`);
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    this.client = getClient();

    // 1. Listen for client tasks on task queue
    console.log('📥 Listening for client tasks...');
    this.startTaskListener();

    // 2. Listen for agent results
    console.log('📤 Listening for agent results...');
    this.startResultsListener();

    // 3. Agent discovery (for available workforce)
    console.log('🔍 Discovering available agents...');
    this.listener = createBeaconListener(
      { topicId: topics.beacon },
      {
        onAgentDiscovered: (agent) => {
          console.log(`\n👷 Available: ${agent.agentId} (${agent.agentType})`);
          if (agent.capabilities?.length > 0) {
            console.log(`   Skills: ${agent.capabilities.join(', ')}`);
          }
        },
        onAgentUpdated: (a) => {
          if (a.messageCount % 10 === 0) {
            console.log(`🔄 ${a.agentId}: active`);
          }
        },
      }
    );
    await this.listener.start();

    // 4. Our Beacon (advertise marketplace)
    console.log('📢 Advertising marketplace...');
    this.beacon = createAgentBeacon(AGENT_ID, 'task-marketplace', {
      topicId: topics.beacon,
      intervalMs: 30000,
      capabilities: ['task-marketplace', 'task-posting', 'payment-processing'],
      metadata: {
        taskFee: CONFIG.taskPostFee,
        agentReward: CONFIG.agentReward,
        taskTopic: topics.taskQueue,
        resultTopic: topics.results,
      },
    });
    await this.beacon.start();

    this.running = true;
    this.startLoops();

    console.log('\n✅ MARKETPLACE ACTIVE\n');
    console.log('How it works:');
    console.log(`  1. Client pays ${CONFIG.taskPostFee} HBAR to post task`);
    console.log(`  2. Task broadcast to HCS topic ${topics.taskQueue}`);
    console.log(`  3. Agent completes task + submits proof`);
    console.log(`  4. Vera pays agent ${CONFIG.agentReward} HBAR`);
    console.log(`  5. Vera profit: ${CONFIG.veraProfit} HBAR per task\n`);
    console.log('Commands:');
    console.log('  t = simulate client task (for testing)');
    console.log('  p = process payments now');
    console.log('  m = show marketplace metrics');
    console.log('  q = quit\n');

    this.setupInput();
    process.on('SIGINT', () => this.stop());
  }

  async startTaskListener() {
    // Poll for new tasks from clients
    // In production, this would subscribe to HCS topic
    // For now, we'll check periodically or wait for manual test
  }

  async startResultsListener() {
    // Listen for agent result submissions
    // Validate proof-of-work and queue payment
  }

  async postTask(clientAccountId, taskType, taskData) {
    const taskId = `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    try {
      // 1. Collect fee from client (goes to operator/Vera's account)
      const operatorId = process.env.HEDERA_OPERATOR_ID || '0.0.10294360';
      const feeTx = new TransferTransaction()
        .setTransactionMemo(`Task fee | ${taskId} | ${taskType}`)
        .addHbarTransfer(clientAccountId, Hbar.from(-CONFIG.taskPostFee))
        .addHbarTransfer(operatorId, Hbar.from(CONFIG.taskPostFee));

      const feeResponse = await feeTx.execute(this.client);
      const feeReceipt = await feeResponse.getReceipt(this.client);

      if (feeReceipt.status.toString() !== 'SUCCESS') {
        throw new Error('Fee collection failed');
      }

      // 2. Post task to HCS
      const taskMessage = JSON.stringify({
        type: 'task',
        taskId,
        taskType,
        taskData,
        client: clientAccountId,
        reward: CONFIG.agentReward,
        postedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hour expiry
      });

      const taskTx = new TopicMessageSubmitTransaction()
        .setTopicId(topics.taskQueue)
        .setMessage(taskMessage);

      const taskResponse = await taskTx.execute(this.client);

      // 3. Track task
      this.pendingTasks.set(taskId, {
        client: clientAccountId,
        fee: CONFIG.taskPostFee,
        postedAt: Date.now(),
        taskType,
        status: 'posted',
      });

      this.metrics.tasksPosted++;
      this.metrics.totalClientRevenue += CONFIG.taskPostFee;

      console.log(`\n💼 TASK POSTED: ${taskId}`);
      console.log(`   Client: ${clientAccountId}`);
      console.log(`   Fee collected: ${CONFIG.taskPostFee} HBAR`);
      console.log(`   Tx: ${taskResponse.transactionId?.toString().slice(0, 30)}...`);

      logger.info('Marketplace', {
        message: 'Task posted',
        taskId,
        client: clientAccountId,
        fee: CONFIG.taskPostFee,
      });

      return { success: true, taskId, txId: taskResponse.transactionId?.toString() };

    } catch (error) {
      console.log(`   ❌ Task posting failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async processAgentResult(agentId, accountId, taskId, resultHash, proofOfWork) {
    // Validate the task exists
    const task = this.pendingTasks.get(taskId);
    if (!task) {
      console.log(`   ⚠️  Unknown task: ${taskId}`);
      return false;
    }

    // Check task not already completed
    if (task.status === 'completed') {
      console.log(`   ⚠️  Task already completed: ${taskId}`);
      return false;
    }

    // Validate proof-of-work
    if (!this.validateProofOfWork(proofOfWork)) {
      console.log(`   ⚠️  Invalid proof-of-work from ${agentId}`);
      return false;
    }

    // Queue payment to agent
    this.queueAgentPayment(agentId, accountId, taskId, resultHash, proofOfWork);

    // Mark task as completed
    task.status = 'completed';
    task.completedAt = Date.now();
    task.completedBy = agentId;
    task.resultHash = resultHash;

    this.metrics.tasksCompleted++;

    console.log(`\n✅ TASK COMPLETED: ${taskId}`);
    console.log(`   Agent: ${agentId}`);
    console.log(`   Result: ${resultHash.slice(0, 16)}...`);
    console.log(`   Payment queued: ${CONFIG.agentReward} HBAR`);

    return true;
  }

  validateProofOfWork(pow) {
    if (!pow || typeof pow !== 'object') return false;
    if (!pow.taskHash || typeof pow.taskHash !== 'string') return false;
    if (pow.taskHash.length < 16) return false;
    if (!pow.timestamp || typeof pow.timestamp !== 'number') return false;
    
    const age = Date.now() - pow.timestamp;
    if (age > 60 * 60 * 1000) return false; // 1 hour max age
    
    return true;
  }

  queueAgentPayment(agentId, accountId, taskId, resultHash, proofOfWork) {
    const paymentId = `${agentId}-${taskId}`;
    
    this.paymentQueue.set(paymentId, {
      agentId,
      accountId,
      taskId,
      amount: CONFIG.agentReward,
      resultHash,
      proofOfWork,
      queuedAt: Date.now(),
    });

    console.log(`   💾 Payment queued (${this.paymentQueue.size} pending)`);
  }

  async processBatchPayments() {
    if (this.paymentQueue.size === 0) {
      console.log('ℹ️  No payments to process');
      return;
    }

    const batch = [];
    for (const [id, payment] of this.paymentQueue) {
      if (batch.length >= CONFIG.maxBatchSize) break;
      batch.push({ id, ...payment });
    }

    console.log(`\n💸 Processing ${batch.length} agent payments...`);

    try {
      const tx = new TransferTransaction()
        .setTransactionMemo(`Agent rewards | ${batch.length} payments`);

      let totalPaid = 0;
      
      for (const payment of batch) {
        const amountTinybars = Math.floor(payment.amount * 100_000_000);
        tx.addHbarTransfer(payment.accountId, Hbar.fromTinybars(amountTinybars));
        totalPaid += payment.amount;
      }

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status.toString() === 'SUCCESS') {
        // Clear paid entries
        batch.forEach(p => {
          this.paymentQueue.delete(p.id);
          this.metrics.agentsPaid++;
        });
        
        this.metrics.totalAgentCosts += totalPaid;
        this.metrics.veraProfit = this.metrics.totalClientRevenue - this.metrics.totalAgentCosts;
        this.metrics.batches++;

        console.log(`   ✅ Paid! Tx: ${response.transactionId?.toString().slice(0, 30)}...`);
        console.log(`   💰 Total: ${totalPaid.toFixed(3)} HBAR to ${batch.length} agents`);
        console.log(`   📈 Vera profit so far: ${this.metrics.veraProfit.toFixed(3)} HBAR`);

        // Record to audit topic
        await this.recordAudit(batch, response.transactionId?.toString());
      }
    } catch (error) {
      console.log(`   ❌ Payment failed: ${error.message}`);
    }
  }

  async recordAudit(batch, txId) {
    try {
      const auditMsg = JSON.stringify({
        type: 'payment-batch',
        timestamp: Date.now(),
        txId,
        count: batch.length,
        totalPaid: batch.reduce((sum, p) => sum + p.amount, 0),
        payments: batch.map(p => ({
          agentId: p.agentId,
          taskId: p.taskId,
          amount: p.amount,
        })),
      });

      await new TopicMessageSubmitTransaction()
        .setTopicId(topics.audit)
        .setMessage(auditMsg)
        .execute(this.client);
    } catch {}
  }

  startLoops() {
    // Process payments every 5 minutes
    setInterval(() => {
      console.log('\n⏰ Scheduled payment processing...');
      this.processBatchPayments();
    }, CONFIG.batchIntervalMs);

    // Metrics every 60s
    setInterval(() => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      console.log(`\n📊 [${uptime}s] Tasks: ${this.metrics.tasksPosted}/${this.metrics.tasksCompleted}, Revenue: ${this.metrics.totalClientRevenue.toFixed(3)}, Costs: ${this.metrics.totalAgentCosts.toFixed(3)}, Profit: ${this.metrics.veraProfit.toFixed(3)} HBAR`);
    }, 60000);
  }

  setupInput() {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async (key) => {
      const cmd = key.toString();
      if (cmd === 't') {
        console.log('\n🧪 Simulating client task...');
        // Use operator as test client
        await this.postTask('0.0.10294360', 'test-task', { data: 'test payload' });
      } else if (cmd === 'p') {
        await this.processBatchPayments();
      } else if (cmd === 'm') {
        console.log(`\n📊 MARKETPLACE METRICS:`);
        console.log(`   Tasks posted: ${this.metrics.tasksPosted}`);
        console.log(`   Tasks completed: ${this.metrics.tasksCompleted}`);
        console.log(`   Agents paid: ${this.metrics.agentsPaid}`);
        console.log(`   Client revenue: ${this.metrics.totalClientRevenue.toFixed(3)} HBAR`);
        console.log(`   Agent costs: ${this.metrics.totalAgentCosts.toFixed(3)} HBAR`);
        console.log(`   VERA PROFIT: ${this.metrics.veraProfit.toFixed(3)} HBAR`);
        console.log(`   Pending payments: ${this.paymentQueue.size}`);
        console.log(`   Pending tasks: ${this.pendingTasks.size}\n`);
      } else if (cmd === 'q' || key[0] === 3) {
        await this.stop();
      }
    });
  }

  async stop() {
    console.log('\n👋 Closing marketplace...\n');
    await this.processBatchPayments();
    await this.beacon?.stop();
    await this.listener?.stop();
    
    console.log(`\n💰 FINAL PROFIT: ${this.metrics.veraProfit.toFixed(3)} HBAR`);
    console.log(`   Revenue: ${this.metrics.totalClientRevenue.toFixed(3)}`);
    console.log(`   Costs: ${this.metrics.totalAgentCosts.toFixed(3)}\n`);
    
    process.exit(0);
  }
}

// Start
const marketplace = new VeraTaskMarketplace();
marketplace.start().catch(console.error);
export { marketplace };
