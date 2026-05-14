/**
 * Cost-Optimized Payment System
 * 
 * Batches agent payments to minimize transaction fees:
 * - Payment amount: 0.01 HBAR per agent (down from 0.08)
 * - Batching: Pays multiple agents in 1 transaction
 * - Frequency: Processes queue every 5 minutes
 * - Only pays if balance > threshold
 * 
 * Cost savings: ~95% vs individual payments
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
import { TopicMessageSubmitTransaction, TransferTransaction, Hbar } from '@hashgraph/sdk';

// Configuration
const CONFIG = {
  paymentAmount: 0.01,      // HBAR per agent (was 0.08)
  batchIntervalMs: 5 * 60 * 1000, // 5 minutes
  minBalance: 1.0,          // Minimum operator balance to pay
  maxBatchSize: 20,         // Max agents per batch
};

const topics = {
  registry: '0.0.10415925',
  task: '0.0.10415926',
  result: '0.0.10415927',
  audit: '0.0.10415928',
  beacon: '0.0.10414499',
  hotTopics: '0.0.10414507',
};

const AGENT_ID = `vera-cost-optimized-${Date.now()}`;

class CostOptimizedOrchestrator {
  constructor() {
    this.client = null;
    this.beacon = null;
    this.listener = null;
    this.hotTopics = null;
    this.paymentQueue = new Map(); // agentId -> {accountId, amount, discoveredAt}
    this.running = false;
    this.metrics = { 
      heartbeats: 0, 
      agentsDiscovered: 0, 
      agentsPaid: 0, 
      totalPaid: 0,
      batches: 0,
      saved: 0 // estimated savings
    };
    this.startTime = Date.now();
  }

  async start() {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  🚀 VERA COST-OPTIMIZED ORCHESTRATOR                                 ║');
    console.log(`║  Agent: ${AGENT_ID.slice(0, 40).padEnd(45)}║`);
    console.log(`║  Payment: ${CONFIG.paymentAmount.toString().padEnd(46)}║`);
    console.log(`║  Batch Interval: ${(CONFIG.batchIntervalMs/60000).toString()} min${''.padEnd(35)}║`);
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    this.client = getClient();

    // 1. Beacon Listener (Discovery)
    console.log('📡 Beacon Listener starting...');
    this.listener = createBeaconListener(
      { topicId: topics.beacon },
      {
        onAgentDiscovered: (agent) => {
          this.metrics.agentsDiscovered++;
          console.log(`\n🔍 Found: ${agent.agentId} (${agent.agentType})`);
          
          // Check for proof-of-work requirement
          const pow = agent.metadata?.proofOfWork;
          const accountId = agent.metadata?.accountId;
          
          if (!pow) {
            console.log(`   ⚠️  No proof-of-work, skipping payment`);
            logger.info('CostOptimized', {
              message: 'Agent skipped - no proof-of-work',
              agentId: agent.agentId,
            });
            return;
          }
          
          if (!accountId) {
            console.log(`   ⚠️  No accountId, skipping payment`);
            return;
          }
          
          // Validate proof-of-work structure
          if (!this.validateProofOfWork(pow)) {
            console.log(`   ⚠️  Invalid proof-of-work format`);
            return;
          }
          
          // Queue agent for batch payment
          if (agent.isHealthy) {
            this.queuePayment(agent.agentId, accountId, pow);
            console.log(`   ✅ Queued with proof-of-work: ${pow.taskHash?.slice(0, 16)}...`);
          }
        },
        onAgentUpdated: (a) => {
          // Only log significant updates
          if (a.messageCount % 10 === 0) {
            console.log(`🔄 ${a.agentId}: msgs=${a.messageCount}`);
          }
        },
        onAgentTimeout: (id) => console.log(`⚠️ Timeout: ${id}`),
      }
    );
    await this.listener.start();

    // 2. Our Beacon (30s heartbeat)
    console.log('📢 Starting heartbeat (30s)...');
    this.beacon = createAgentBeacon(AGENT_ID, 'cost-optimized-orchestrator', {
      topicId: topics.beacon,
      intervalMs: 30000,
      capabilities: ['batched-payments', 'discovery', 'hot-topics'],
      metadata: { 
        paymentAmount: CONFIG.paymentAmount,
        batchInterval: `${CONFIG.batchIntervalMs/60000}min`,
        version: '3.0-cost-optimized'
      },
    });
    await this.beacon.start();

    // 3. Hot Topics Radar (if available)
    console.log('🔥 Hot Topics Radar configured\n');
    // Note: hotTopicsManager is a singleton, no start() needed

    this.running = true;
    this.startLoops();

    console.log('✅ COST-OPTIMIZED SYSTEM ACTIVE\n');
    console.log('Features:');
    console.log(`  💰 Payments: ${CONFIG.paymentAmount} HBAR/agent (batched)`);
    console.log(`  ⏱️  Batch interval: ${CONFIG.batchIntervalMs/60000} minutes`);
    console.log(`  📊 Max batch size: ${CONFIG.maxBatchSize} agents/tx`);
    console.log(`  💡 Est. savings: ~95% vs individual payments\n`);
    console.log('Commands: b=batch now, p=pay queue, m=metrics, q=quit\n');

    this.setupInput();
    process.on('SIGINT', () => this.stop());
  }

  validateProofOfWork(pow) {
    // Basic validation - PoW should have taskHash and timestamp
    if (!pow || typeof pow !== 'object') return false;
    if (!pow.taskHash || typeof pow.taskHash !== 'string') return false;
    if (pow.taskHash.length < 16) return false; // Minimum hash length
    if (!pow.timestamp || typeof pow.timestamp !== 'number') return false;
    
    // Check if proof is recent (within last hour)
    const age = Date.now() - pow.timestamp;
    if (age > 60 * 60 * 1000) return false; // Older than 1 hour
    
    return true;
  }

  queuePayment(agentId, accountId, proofOfWork) {
    if (this.paymentQueue.has(agentId)) {
      // Already queued, update with latest proof
      const existing = this.paymentQueue.get(agentId);
      existing.lastSeen = Date.now();
      existing.proofOfWork = proofOfWork;
      return;
    }

    this.paymentQueue.set(agentId, {
      accountId,
      amount: CONFIG.paymentAmount,
      discoveredAt: Date.now(),
      lastSeen: Date.now(),
      proofOfWork,
    });

    console.log(`   💾 Queued for batch (${this.paymentQueue.size} total)`);
  }

  async processBatchPayments() {
    if (this.paymentQueue.size === 0) {
      console.log('ℹ️  No agents in queue to pay');
      return;
    }

    // Get batch of agents to pay
    const batch = [];
    const toRemove = [];
    
    for (const [agentId, data] of this.paymentQueue) {
      if (batch.length >= CONFIG.maxBatchSize) break;
      
      // Only pay agents seen recently (within last 10 min)
      const age = Date.now() - data.lastSeen;
      if (age < 10 * 60 * 1000) {
        batch.push({ agentId, ...data });
      } else {
        toRemove.push(agentId); // Remove stale agents
      }
    }

    // Remove stale entries
    toRemove.forEach(id => this.paymentQueue.delete(id));

    if (batch.length === 0) {
      console.log('ℹ️  No active agents to pay (queue cleared)');
      return;
    }

    console.log(`\n💸 Processing batch payment for ${batch.length} agents...`);

    try {
      // Build batched transaction with proof-of-work hashes
      const powHashes = batch.map(a => a.proofOfWork?.taskHash?.slice(0, 8)).join(',');
      const tx = new TransferTransaction()
        .setTransactionMemo(`Batch | ${batch.length} agents | PoW: ${powHashes}`);

      let totalAmount = 0;
      
      for (const agent of batch) {
        const amountTinybars = Math.floor(agent.amount * 100_000_000);
        tx.addHbarTransfer(agent.accountId, Hbar.fromTinybars(amountTinybars));
        totalAmount += agent.amount;
      }

      // Execute batch payment
      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status.toString() === 'SUCCESS') {
        // Clear paid agents from queue
        batch.forEach(agent => {
          this.paymentQueue.delete(agent.agentId);
          this.metrics.agentsPaid++;
        });
        
        this.metrics.totalPaid += totalAmount;
        this.metrics.batches++;
        
        // Calculate savings: individual tx would cost ~0.0001 HBAR each
        const estimatedSavings = batch.length * 0.0001;
        this.metrics.saved += estimatedSavings;

        console.log(`   ✅ Batch paid! Tx: ${response.transactionId?.toString().slice(0, 30)}...`);
        console.log(`   💰 Total: ${totalAmount.toFixed(3)} HBAR to ${batch.length} agents`);
        console.log(`   🔐 Proof hashes: ${powHashes}`);
        console.log(`   💡 Saved ~${estimatedSavings.toFixed(4)} HBAR in fees`);
        
        logger.info('CostOptimized', {
          message: 'Batch payment successful',
          txId: response.transactionId?.toString(),
          agentsPaid: batch.length,
          totalAmount,
          proofHashes: batch.map(a => a.proofOfWork?.taskHash),
          queueSize: this.paymentQueue.size,
        });
      }
    } catch (error) {
      console.log(`   ❌ Batch failed: ${error.message}`);
      logger.error('CostOptimized', { message: 'Batch payment failed', error: error.message });
    }
  }

  startLoops() {
    // Process batch payments every 5 minutes
    setInterval(() => {
      console.log('\n⏰ Scheduled batch processing...');
      this.processBatchPayments();
    }, CONFIG.batchIntervalMs);

    // Log metrics every 60s
    setInterval(() => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const healthy = this.listener?.getHealthyAgents().length || 0;
      
      console.log(`\n📊 [${uptime}s] Agents discovered: ${this.metrics.agentsDiscovered}, Paid: ${this.metrics.agentsPaid}, Queue: ${this.paymentQueue.size}, Batches: ${this.metrics.batches}, Saved: ${this.metrics.saved.toFixed(4)} HBAR`);
    }, 60000);
  }

  setupInput() {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async (key) => {
      const cmd = key.toString();
      if (cmd === 'b' || cmd === 'p') {
        console.log('\n⚡ Manual batch processing...');
        await this.processBatchPayments();
      } else if (cmd === 'm') {
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        console.log(`\n📊 METRICS:`);
        console.log(`   Uptime: ${uptime}s`);
        console.log(`   Agents discovered: ${this.metrics.agentsDiscovered}`);
        console.log(`   Agents paid: ${this.metrics.agentsPaid}`);
        console.log(`   Queue size: ${this.paymentQueue.size}`);
        console.log(`   Total paid: ${this.metrics.totalPaid.toFixed(3)} HBAR`);
        console.log(`   Batches: ${this.metrics.batches}`);
        console.log(`   Est. savings: ${this.metrics.saved.toFixed(4)} HBAR`);
        console.log(`   Healthy agents: ${this.listener?.getHealthyAgents().length || 0}\n`);
      } else if (cmd === 'q' || key[0] === 3) {
        await this.stop();
      }
    });
  }

  async stop() {
    console.log('\n👋 Stopping...\n');
    this.running = false;
    
    // Pay remaining queue before shutdown
    if (this.paymentQueue.size > 0) {
      console.log(`Paying ${this.paymentQueue.size} remaining agents...`);
      await this.processBatchPayments();
    }
    
    await this.beacon?.stop();
    await this.listener?.stop();
    await this.hotTopics?.stop();
    
    console.log(`\n💰 FINAL:`);
    console.log(`   Agents paid: ${this.metrics.agentsPaid}`);
    console.log(`   Total distributed: ${this.metrics.totalPaid.toFixed(3)} HBAR`);
    console.log(`   Batches processed: ${this.metrics.batches}`);
    console.log(`   Est. fees saved: ${this.metrics.saved.toFixed(4)} HBAR\n`);
    
    process.exit(0);
  }
}

// Start
const orchestrator = new CostOptimizedOrchestrator();
orchestrator.start().catch(console.error);
export { orchestrator };
