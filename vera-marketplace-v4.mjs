/**
 * Vera Intelligent Marketplace v4.0
 * 
 * Leverages new beacon listener health scoring:
 * - Smart task routing (healthiest agents get priority)
 * - Circuit breaker pattern for failing agents
 * - Batch async settlement support
 * - Predictive agent scaling
 * - Automated failover with health-based routing
 * 
 * Integrates with enhanced AgentHCSBeaconListener:
 * - getAgentHealthScore() - 0-1 health rating
 * - getAgentRecoveryAttempts() - track failures
 * - getSystemHealth() - overall system status
 * - Auto-cleanup of stale agents
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

// Circuit breaker states
const CIRCUIT_STATE = {
  CLOSED: 'closed',     // Normal operation
  OPEN: 'open',         // Failing, no new tasks
  HALF_OPEN: 'half_open' // Testing if recovered
};

const CONFIG = {
  // Health-based routing thresholds
  healthThresholds: {
    excellent: 0.8,  // >0.8 = priority routing
    good: 0.5,       // >0.5 = normal routing
    poor: 0.2,       // <0.2 = circuit breaker
  },
  
  // Circuit breaker settings
  circuitBreaker: {
    failureThreshold: 3,      // Failures before opening
    timeoutMs: 60000,         // Time before half-open
    halfOpenMaxCalls: 2,      // Test calls in half-open
  },
  
  // Batch async settlement
  settlement: {
    mode: 'batch_async',      // 'immediate', 'batch_async', 'x402'
    batchIntervalMs: 30000,   // 30s batching
    maxBatchSize: 50,
    minBatchAmount: 0.001,    // HBAR
  },
  
  // Predictive scaling
  scaling: {
    enabled: true,
    targetUtilization: 0.7,   // 70% healthy agent utilization
    scaleUpThreshold: 0.85,   // Scale up when >85%
    scaleDownThreshold: 0.3, // Scale down when <30%
    minAgents: 2,
    maxAgents: 50,
  },
  
  apiPort: 8083,
};

const topics = {
  taskQueue: '0.0.10415926',
  results: '0.0.10415927',
  audit: '0.0.10415928',
  beacon: '0.0.10414499',
};

const AGENT_ID = `vera-intelligent-${Date.now()}`;

class CircuitBreaker {
  constructor(agentId, config = CONFIG.circuitBreaker) {
    this.agentId = agentId;
    this.state = CIRCUIT_STATE.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.config = config;
    this.halfOpenCalls = 0;
  }

  recordSuccess() {
    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      this.halfOpenCalls++;
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        this.close();
      }
    } else {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.config.failureThreshold) {
      this.open();
    }
  }

  open() {
    if (this.state !== CIRCUIT_STATE.OPEN) {
      this.state = CIRCUIT_STATE.OPEN;
      console.log(`   🔴 Circuit OPEN for ${this.agentId.slice(0, 20)}...`);
      
      // Auto-transition to half-open after timeout
      setTimeout(() => {
        this.halfOpen();
      }, this.config.timeoutMs);
    }
  }

  halfOpen() {
    this.state = CIRCUIT_STATE.HALF_OPEN;
    this.halfOpenCalls = 0;
    console.log(`   🟡 Circuit HALF-OPEN for ${this.agentId.slice(0, 20)}...`);
  }

  close() {
    this.state = CIRCUIT_STATE.CLOSED;
    this.failures = 0;
    this.halfOpenCalls = 0;
    console.log(`   🟢 Circuit CLOSED for ${this.agentId.slice(0, 20)}...`);
  }

  canExecute() {
    if (this.state === CIRCUIT_STATE.CLOSED) return true;
    if (this.state === CIRCUIT_STATE.HALF_OPEN && this.halfOpenCalls < this.config.halfOpenMaxCalls) {
      return true;
    }
    return false;
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      canExecute: this.canExecute(),
    };
  }
}

class BatchAsyncSettlement {
  constructor(client, config = CONFIG.settlement) {
    this.client = client;
    this.config = config;
    this.pendingBatches = [];
    this.processedBatches = [];
    this.batchTimer = null;
    this.metrics = {
      batchesProcessed: 0,
      totalSettled: 0,
      avgBatchSize: 0,
    };
  }

  start() {
    this.batchTimer = setInterval(() => {
      this.processBatch();
    }, this.config.batchIntervalMs);
  }

  stop() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.processBatch(); // Process remaining
    }
  }

  queuePayment(agentId, accountId, amount, taskId, metadata = {}) {
    const batch = {
      agentId,
      accountId,
      amount,
      taskId,
      metadata,
      queuedAt: Date.now(),
    };
    this.pendingBatches.push(batch);
    
    // Trigger immediate processing if batch is large enough
    if (this.pendingBatches.length >= this.config.maxBatchSize) {
      this.processBatch();
    }
    
    return batch;
  }

  async processBatch() {
    if (this.pendingBatches.length === 0) return;
    
    const batch = this.pendingBatches.splice(0, this.config.maxBatchSize);
    const totalAmount = batch.reduce((sum, p) => sum + p.amount, 0);
    
    if (totalAmount < this.config.minBatchAmount) {
      // Too small, put back and wait
      this.pendingBatches.unshift(...batch);
      return;
    }

    try {
      const tx = new TransferTransaction()
        .setTransactionMemo(`Batch | ${batch.length} agents | Async`);

      for (const payment of batch) {
        tx.addHbarTransfer(payment.accountId, Hbar.from(payment.amount));
      }

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (receipt.status.toString() === 'SUCCESS') {
        const processedAt = Date.now();
        const processedBatch = {
          batch,
          txId: response.transactionId?.toString(),
          totalAmount,
          processedAt,
          latency: processedAt - batch[0].queuedAt,
        };
        
        this.processedBatches.push(processedBatch);
        this.metrics.batchesProcessed++;
        this.metrics.totalSettled += totalAmount;
        this.metrics.avgBatchSize = (this.metrics.avgBatchSize * (this.metrics.batchesProcessed - 1) + batch.length) / this.metrics.batchesProcessed;

        console.log(`   ✅ Batch settled: ${batch.length} payments, ${totalAmount.toFixed(6)} HBAR`);
        
        return processedBatch;
      }
    } catch (error) {
      console.log(`   ❌ Batch settlement failed: ${error.message}`);
      // Put back for retry
      this.pendingBatches.unshift(...batch);
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      pendingCount: this.pendingBatches.length,
      pendingAmount: this.pendingBatches.reduce((sum, p) => sum + p.amount, 0),
    };
  }
}

class IntelligentMarketplace {
  constructor() {
    this.client = null;
    this.beacon = null;
    this.listener = null;
    this.app = express();
    
    // Circuit breakers per agent
    this.circuitBreakers = new Map();
    
    // Batch settlement
    this.settlement = null;
    
    // Task management
    this.pendingTasks = new Map();
    this.activeTasks = new Map();
    this.completedTasks = new Map();
    
    // Agent management with health
    this.agentHealth = new Map();
    
    // Predictive scaling
    this.scalingMetrics = {
      targetUtilization: [],
      lastScaleAction: null,
      recommendedAgents: CONFIG.scaling.minAgents,
    };
    
    this.running = false;
    this.metrics = {
      tasksPosted: 0,
      tasksRouted: 0,
      tasksCompleted: 0,
      circuitOpenings: 0,
      circuitClosings: 0,
      healthBasedRouting: 0,
      avgAgentHealth: 0,
      scalingEvents: 0,
      failoverCount: 0,
    };
    this.startTime = Date.now();
  }

  async start() {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  🧠 VERA INTELLIGENT MARKETPLACE v4.0                                  ║');
    console.log(`║  Agent: ${AGENT_ID.slice(0, 40).padEnd(45)}║`);
    console.log('║  Features: Health Routing + Circuit Breaker + Batch Async             ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    this.client = getClient();
    
    // Initialize batch settlement
    this.settlement = new BatchAsyncSettlement(this.client);
    this.settlement.start();

    // Setup API
    this.setupAPI();

    // Start enhanced beacon listener with health scoring
    console.log('📡 Starting intelligent agent discovery...');
    this.listener = createBeaconListener(
      { 
        topicId: topics.beacon,
        enableAutoCleanup: true,
        cleanupIntervalMs: 60000,
        enableRecoveryTracking: true,
        recoveryAttemptsBeforeAlert: 3,
        agentTimeoutMs: 120000,
      },
      {
        onAgentDiscovered: (agent) => this.handleAgentDiscovery(agent),
        onAgentUpdated: (agent) => this.handleAgentUpdate(agent),
        onAgentTimeout: (agent) => this.handleAgentTimeout(agent),
      }
    );
    await this.listener.start();

    // Start beacon
    this.beacon = createAgentBeacon(AGENT_ID, 'intelligent-marketplace', {
      topicId: topics.beacon,
      intervalMs: 30000,
      capabilities: ['intelligent-routing', 'circuit-breaker', 'batch-settlement', 'health-scoring'],
      metadata: {
        apiEndpoint: `http://localhost:${CONFIG.apiPort}`,
        settlementMode: CONFIG.settlement.mode,
        circuitBreaker: true,
        version: '4.0',
      },
    });
    await this.beacon.start();

    this.running = true;
    this.startLoops();

    // Start HTTP API
    this.app.listen(CONFIG.apiPort, () => {
      console.log(`🌐 API: http://localhost:${CONFIG.apiPort}`);
      console.log('   GET  /health - System health with agent scores');
      console.log('   GET  /circuits - Circuit breaker states');
      console.log('   GET  /settlement - Batch settlement metrics');
      console.log('   GET  /scaling - Predictive scaling recommendations\n');
    });

    this.setupConsoleInput();
    console.log('✅ INTELLIGENT MARKETPLACE ACTIVE\n');
  }

  setupAPI() {
    this.app.use(express.json());

    // System health with agent scores
    this.app.get('/health', (req, res) => {
      const systemHealth = this.listener?.getSystemHealth?.() || { totalAgents: 0, healthyAgents: 0 };
      
      const agentDetails = Array.from(this.circuitBreakers.entries()).map(([agentId, cb]) => ({
        agentId: agentId.slice(0, 20),
        circuitState: cb.getState(),
        healthScore: this.listener?.getAgentHealthScore?.(agentId) || 0,
        recoveryAttempts: this.listener?.getAgentRecoveryAttempts?.(agentId) || 0,
      }));

      res.json({
        system: systemHealth,
        agents: agentDetails,
        routingMode: 'health-based',
        circuitBreakersActive: this.circuitBreakers.size,
      });
    });

    // Circuit breaker states
    this.app.get('/circuits', (req, res) => {
      const states = Array.from(this.circuitBreakers.entries()).map(([agentId, cb]) => ({
        agentId: agentId.slice(0, 20),
        ...cb.getState(),
      }));
      
      const summary = {
        closed: states.filter(s => s.state === CIRCUIT_STATE.CLOSED).length,
        open: states.filter(s => s.state === CIRCUIT_STATE.OPEN).length,
        halfOpen: states.filter(s => s.state === CIRCUIT_STATE.HALF_OPEN).length,
      };
      
      res.json({ summary, circuits: states });
    });

    // Batch settlement metrics
    this.app.get('/settlement', (req, res) => {
      res.json({
        mode: CONFIG.settlement.mode,
        ...this.settlement.getMetrics(),
        config: CONFIG.settlement,
      });
    });

    // Predictive scaling
    this.app.get('/scaling', (req, res) => {
      const systemHealth = this.listener?.getSystemHealth?.() || { healthyAgents: 0 };
      const utilization = systemHealth.totalAgents > 0 
        ? systemHealth.healthyAgents / systemHealth.totalAgents 
        : 0;
      
      const recommendation = this.getScalingRecommendation(utilization);
      
      res.json({
        currentUtilization: utilization,
        targetUtilization: CONFIG.scaling.targetUtilization,
        healthyAgents: systemHealth.healthyAgents,
        recommendedAgents: recommendation.target,
        action: recommendation.action,
        reason: recommendation.reason,
        metrics: this.scalingMetrics,
      });
    });

    // Post task with intelligent routing
    this.app.post('/tasks', async (req, res) => {
      const { taskType, priority = 'normal', taskData } = req.body;
      const taskId = `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      
      this.pendingTasks.set(taskId, {
        taskType,
        priority,
        taskData,
        postedAt: Date.now(),
        routingAttempts: 0,
      });
      
      this.metrics.tasksPosted++;
      
      // Attempt intelligent routing
      const routed = await this.routeTaskIntelligently(taskId);
      
      res.json({
        taskId,
        routed,
        routingMethod: routed ? 'health-based' : 'queued',
        message: routed ? 'Task routed to healthy agent' : 'Task queued for next available agent',
      });
    });
  }

  handleAgentDiscovery(agent) {
    console.log(`\n👷 Agent: ${agent.agentId.slice(0, 30)}...`);
    
    // Create circuit breaker for new agent
    if (!this.circuitBreakers.has(agent.agentId)) {
      this.circuitBreakers.set(agent.agentId, new CircuitBreaker(agent.agentId));
    }
    
    // Check for queued tasks to route
    this.routeQueuedTasks();
  }

  handleAgentUpdate(agent) {
    const healthScore = this.listener?.getAgentHealthScore?.(agent.agentId) || 0;
    const cb = this.circuitBreakers.get(agent.agentId);
    
    if (cb && healthScore > CONFIG.healthThresholds.good) {
      // Healthy agent - record success
      cb.recordSuccess();
    }
    
    // Update metrics
    this.updateHealthMetrics();
  }

  handleAgentTimeout(agent) {
    const cb = this.circuitBreakers.get(agent.agentId);
    if (cb) {
      cb.recordFailure();
      this.metrics.circuitOpenings++;
    }
    
    // Check for failover
    const activeTask = this.findTaskByAgent(agent.agentId);
    if (activeTask) {
      this.failoverTask(activeTask);
    }
  }

  findTaskByAgent(agentId) {
    for (const [taskId, task] of this.activeTasks) {
      if (task.assignedTo === agentId) {
        return { taskId, ...task };
      }
    }
    return null;
  }

  failoverTask(taskInfo) {
    console.log(`   🔄 Failing over task ${taskInfo.taskId.slice(0, 20)}...`);
    
    // Remove from active
    this.activeTasks.delete(taskInfo.taskId);
    
    // Put back in pending
    this.pendingTasks.set(taskInfo.taskId, {
      ...taskInfo,
      failedOverFrom: taskInfo.assignedTo,
      failoverCount: (taskInfo.failoverCount || 0) + 1,
      status: 'pending',
    });
    
    this.metrics.failoverCount++;
    
    // Try immediate rerouting
    this.routeTaskIntelligently(taskInfo.taskId);
  }

  async routeTaskIntelligently(taskId) {
    const task = this.pendingTasks.get(taskId);
    if (!task) return false;
    
    // Get all healthy agents with circuit closed
    const candidates = [];
    
    for (const agent of this.listener?.getHealthyAgents() || []) {
      const cb = this.circuitBreakers.get(agent.agentId);
      const healthScore = this.listener?.getAgentHealthScore?.(agent.agentId) || 0;
      
      if (cb?.canExecute() && healthScore > CONFIG.healthThresholds.poor) {
        candidates.push({
          agentId: agent.agentId,
          healthScore,
          capabilities: agent.capabilities || [],
        });
      }
    }
    
    if (candidates.length === 0) return false;
    
    // Sort by health score (highest first)
    candidates.sort((a, b) => b.healthScore - a.healthScore);
    
    // Pick best candidate
    const best = candidates[0];
    
    // Assign task
    task.assignedTo = best.agentId;
    task.routedAt = Date.now();
    task.healthScoreAtRoute = best.healthScore;
    
    this.activeTasks.set(taskId, task);
    this.pendingTasks.delete(taskId);
    
    this.metrics.tasksRouted++;
    this.metrics.healthBasedRouting++;
    
    console.log(`   📋 Task ${taskId.slice(0, 20)} → ${best.agentId.slice(0, 20)}... (health: ${best.healthScore.toFixed(2)})`);
    
    return true;
  }

  routeQueuedTasks() {
    for (const [taskId, task] of this.pendingTasks) {
      this.routeTaskIntelligently(taskId);
    }
  }

  getScalingRecommendation(utilization) {
    const systemHealth = this.listener?.getSystemHealth?.() || { healthyAgents: 0 };
    const currentHealthy = systemHealth.healthyAgents;
    
    if (utilization > CONFIG.scaling.scaleUpThreshold) {
      const target = Math.min(CONFIG.scaling.maxAgents, Math.ceil(currentHealthy * 1.5));
      return {
        action: 'scale_up',
        target,
        reason: `Utilization ${(utilization * 100).toFixed(1)}% > threshold ${(CONFIG.scaling.scaleUpThreshold * 100).toFixed(1)}%`,
      };
    }
    
    if (utilization < CONFIG.scaling.scaleDownThreshold && currentHealthy > CONFIG.scaling.minAgents) {
      const target = Math.max(CONFIG.scaling.minAgents, Math.floor(currentHealthy * 0.8));
      return {
        action: 'scale_down',
        target,
        reason: `Utilization ${(utilization * 100).toFixed(1)}% < threshold ${(CONFIG.scaling.scaleDownThreshold * 100).toFixed(1)}%`,
      };
    }
    
    return {
      action: 'maintain',
      target: currentHealthy,
      reason: `Utilization ${(utilization * 100).toFixed(1)}% within target range`,
    };
  }

  updateHealthMetrics() {
    const systemHealth = this.listener?.getSystemHealth?.() || { avgHealthScore: 0 };
    this.metrics.avgAgentHealth = systemHealth.avgHealthScore;
  }

  startLoops() {
    // Health-based task routing check
    setInterval(() => {
      this.routeQueuedTasks();
    }, 10000);
    
    // Scaling analysis
    setInterval(() => {
      const systemHealth = this.listener?.getSystemHealth?.() || { healthyAgents: 0, totalAgents: 0 };
      const utilization = systemHealth.totalAgents > 0 
        ? systemHealth.healthyAgents / systemHealth.totalAgents 
        : 0;
      
      const rec = this.getScalingRecommendation(utilization);
      if (rec.action !== 'maintain') {
        console.log(`\n📈 Scaling: ${rec.action} → ${rec.target} agents (${rec.reason})`);
        this.metrics.scalingEvents++;
      }
      
      this.scalingMetrics.targetUtilization.push(utilization);
      if (this.scalingMetrics.targetUtilization.length > 60) {
        this.scalingMetrics.targetUtilization.shift();
      }
    }, 60000);
    
    // Metrics display
    setInterval(() => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const cbStates = Array.from(this.circuitBreakers.values());
      const openCircuits = cbStates.filter(cb => cb.state === CIRCUIT_STATE.OPEN).length;
      
      console.log(`\n🧠 [${uptime}s] Tasks: ${this.metrics.tasksPosted}/${this.metrics.tasksRouted}/${this.metrics.tasksCompleted} | Health: ${this.metrics.avgAgentHealth.toFixed(2)} | Circuits: ${openCircuits}/${cbStates.length} open | Failovers: ${this.metrics.failoverCount}`);
    }, 60000);
  }

  setupConsoleInput() {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async (key) => {
      const cmd = key.toString();
      
      if (cmd === 't') {
        const taskId = `task-${Date.now()}`;
        this.pendingTasks.set(taskId, {
          taskType: 'test',
          priority: 'normal',
          postedAt: Date.now(),
          routingAttempts: 0,
        });
        this.metrics.tasksPosted++;
        
        const routed = await this.routeTaskIntelligently(taskId);
        console.log(`\n📋 Task ${taskId.slice(0, 20)}... ${routed ? '✅ routed' : '⏳ queued'}`);
      } else if (cmd === 'h') {
        const health = this.listener?.getSystemHealth?.();
        console.log(`\n🏥 HEALTH:`);
        console.log(`   Agents: ${health?.totalAgents || 0} total, ${health?.healthyAgents || 0} healthy`);
        console.log(`   Avg Score: ${(health?.avgHealthScore || 0).toFixed(3)}`);
        console.log(`   Need Recovery: ${health?.agentsNeedingRecovery || 0}`);
      } else if (cmd === 'c') {
        const states = Array.from(this.circuitBreakers.values());
        const open = states.filter(cb => cb.state === CIRCUIT_STATE.OPEN).length;
        const half = states.filter(cb => cb.state === CIRCUIT_STATE.HALF_OPEN).length;
        console.log(`\n🔴 CIRCUITS: ${open} open, ${half} half-open, ${states.length - open - half} closed`);
      } else if (cmd === 'm') {
        console.log(`\n📊 METRICS:`);
        console.log(`   Tasks: ${this.metrics.tasksPosted} posted, ${this.metrics.tasksRouted} routed, ${this.metrics.tasksCompleted} completed`);
        console.log(`   Health Routing: ${this.metrics.healthBasedRouting} tasks`);
        console.log(`   Circuits: ${this.metrics.circuitOpenings} opened, ${this.metrics.circuitClosings} closed`);
        console.log(`   Failovers: ${this.metrics.failoverCount}`);
        console.log(`   Scaling Events: ${this.metrics.scalingEvents}`);
        console.log(`   Avg Health: ${this.metrics.avgAgentHealth.toFixed(3)}`);
      } else if (cmd === 'q' || key[0] === 3) {
        console.log('\n👋 Stopping intelligent marketplace...');
        this.settlement.stop();
        process.exit(0);
      }
    });

    console.log('Console: t=post task, h=health, c=circuits, m=metrics, q=quit\n');
  }
}

// Start
const marketplace = new IntelligentMarketplace();
marketplace.start().catch(console.error);
export { marketplace, CircuitBreaker, BatchAsyncSettlement };
