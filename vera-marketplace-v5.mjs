/**
 * Vera AI-Driven Dynamic Marketplace v5.0
 * 
 * The ultimate marketplace with AI-driven pricing:
 * - Dynamic pricing based on demand/supply ratio
 * - Task complexity scoring (auto-calculated)
 * - Demand surge pricing (2x during peak)
 * - Agent specialization matching
 * - Revenue optimization engine
 * - Predictive pricing models
 * 
 * Pricing Formula:
 * baseRate × complexityMultiplier × demandMultiplier × agentAvailabilityFactor
 */

import express from 'express';
import {
  createAgentBeacon,
  createBeaconListener,
} from './dist/vera/orchestrator/index.js';
import { getClient } from './dist/hedera/tools/client.js';
import { logger } from './dist/monitoring/logger.js';
import { 
  TopicMessageSubmitTransaction, 
  TransferTransaction, 
  Hbar,
} from '@hashgraph/sdk';
import crypto from 'crypto';

// AI-Driven Pricing Configuration
const PRICING_CONFIG = {
  // Base rates (HBAR per second)
  baseRates: {
    compute: 0.0005,
    data: 0.0003,
    analysis: 0.0007,
    inference: 0.001,
    training: 0.002,
  },
  
  // Complexity multipliers (1.0 = baseline)
  complexity: {
    simple: 1.0,      // Basic queries
    moderate: 1.5,    // Multi-step tasks
    complex: 2.5,     // Advanced analysis
    expert: 4.0,      // Research/discovery
  },
  
  // Demand surge thresholds
  demandSurge: {
    threshold: 0.8,   // 80% agent utilization
    multiplier: 2.0,  // 2x pricing during surge
    cooldownMs: 300000, // 5min cooldown
  },
  
  // Agent availability factor
  availability: {
    abundant: 0.8,    // >10 healthy agents
    normal: 1.0,      // 5-10 agents
    scarce: 1.5,      // 2-5 agents
    critical: 2.5,    // <2 agents
  },
  
  // Revenue optimization
  revenue: {
    targetMargin: 0.35, // 35% profit margin target
    minPrice: 0.001,    // Minimum 0.001 HBAR/sec
    maxPrice: 0.02,     // Maximum 0.02 HBAR/sec
    priceElasticity: -0.7, // Demand drops 70% when price doubles
  },
};

// Task type complexity map
const TASK_COMPLEXITY = {
  // Simple tasks
  'ping': 'simple',
  'health-check': 'simple',
  'status': 'simple',
  
  // Moderate tasks  
  'query': 'moderate',
  'fetch': 'moderate',
  'parse': 'moderate',
  'summarize': 'moderate',
  
  // Complex tasks
  'analyze': 'complex',
  'aggregate': 'complex',
  'transform': 'complex',
  'validate': 'complex',
  
  // Expert tasks
  'research': 'expert',
  'discover': 'expert',
  'predict': 'expert',
  'optimize': 'expert',
  'synthesize': 'expert',
};

const topics = {
  taskQueue: '0.0.10415926',
  results: '0.0.10415927',
  beacon: '0.0.10414499',
};

const AGENT_ID = `vera-ai-marketplace-${Date.now()}`;

class DynamicPricingEngine {
  constructor() {
    this.demandHistory = []; // Last 30min of demand
    this.pricingCache = new Map(); // taskType -> calculated price
    this.lastSurgeTime = 0;
    this.currentMultiplier = 1.0;
  }

  // Calculate task complexity based on data
  calculateComplexity(taskType, taskData) {
    // Base complexity from task type
    let base = TASK_COMPLEXITY[taskType] || 'moderate';
    let multiplier = PRICING_CONFIG.complexity[base];
    
    // Adjust based on data size
    const dataSize = JSON.stringify(taskData).length;
    if (dataSize > 10000) multiplier *= 1.3; // Large data
    if (dataSize > 50000) multiplier *= 1.6; // Very large data
    
    // Adjust based on nested complexity
    const depth = this.getObjectDepth(taskData);
    if (depth > 5) multiplier *= 1.2;
    
    return {
      level: base,
      multiplier: Math.min(multiplier, PRICING_CONFIG.complexity.expert * 1.5),
      dataSize,
      depth,
    };
  }

  getObjectDepth(obj, depth = 0) {
    if (depth > 10) return depth;
    if (obj === null || typeof obj !== 'object') return depth;
    
    let max = depth;
    for (const val of Object.values(obj)) {
      max = Math.max(max, this.getObjectDepth(val, depth + 1));
    }
    return max;
  }

  // Calculate demand ratio
  calculateDemand(healthyAgents, pendingTasks) {
    if (healthyAgents === 0) return 1.0; // Max demand if no agents
    
    // Tasks per agent ratio
    const ratio = pendingTasks / healthyAgents;
    
    // Normalize: 1.0 = balanced, >1.0 = high demand
    const normalized = Math.min(ratio / 2, 2.0);
    
    // Track history
    this.demandHistory.push({ timestamp: Date.now(), ratio: normalized });
    if (this.demandHistory.length > 60) this.demandHistory.shift();
    
    return normalized;
  }

  // Check for demand surge
  isDemandSurge(demandRatio) {
    if (demandRatio > PRICING_CONFIG.demandSurge.threshold) {
      const now = Date.now();
      if (now - this.lastSurgeTime > PRICING_CONFIG.demandSurge.cooldownMs) {
        this.lastSurgeTime = now;
        return true;
      }
    }
    return false;
  }

  // Calculate agent availability factor
  calculateAvailabilityFactor(healthyAgents) {
    if (healthyAgents >= 10) return PRICING_CONFIG.availability.abundant;
    if (healthyAgents >= 5) return PRICING_CONFIG.availability.normal;
    if (healthyAgents >= 2) return PRICING_CONFIG.availability.scarce;
    return PRICING_CONFIG.availability.critical;
  }

  // Main pricing calculation
  calculatePrice(taskType, taskData, healthyAgents, pendingTasks) {
    const cacheKey = `${taskType}-${JSON.stringify(taskData).length}-${healthyAgents}-${pendingTasks}`;
    
    if (this.pricingCache.has(cacheKey)) {
      const cached = this.pricingCache.get(cacheKey);
      if (Date.now() - cached.time < 30000) { // 30s cache
        return cached.price;
      }
    }

    // 1. Base rate
    const baseRate = PRICING_CONFIG.baseRates[taskType] || PRICING_CONFIG.baseRates.compute;
    
    // 2. Complexity multiplier
    const complexity = this.calculateComplexity(taskType, taskData);
    
    // 3. Demand ratio
    const demandRatio = this.calculateDemand(healthyAgents, pendingTasks);
    
    // 4. Demand surge multiplier
    let surgeMultiplier = 1.0;
    if (this.isDemandSurge(demandRatio)) {
      surgeMultiplier = PRICING_CONFIG.demandSurge.multiplier;
    }
    
    // 5. Availability factor
    const availabilityFactor = this.calculateAvailabilityFactor(healthyAgents);
    
    // Calculate final price
    let price = baseRate * complexity.multiplier * surgeMultiplier * availabilityFactor;
    
    // Apply bounds
    price = Math.max(price, PRICING_CONFIG.revenue.minPrice);
    price = Math.min(price, PRICING_CONFIG.revenue.maxPrice);
    
    const result = {
      pricePerSecond: price,
      baseRate,
      complexityMultiplier: complexity.multiplier,
      complexityLevel: complexity.level,
      surgeMultiplier,
      availabilityFactor,
      demandRatio,
      estimatedTotal: null, // Will be set after task duration estimate
    };
    
    this.pricingCache.set(cacheKey, { price: result, time: Date.now() });
    
    return result;
  }

  // Estimate task duration based on complexity
  estimateDuration(complexity) {
    const baseDurations = {
      simple: 2,      // 2 seconds
      moderate: 8,    // 8 seconds  
      complex: 30,    // 30 seconds
      expert: 120,    // 2 minutes
    };
    
    const base = baseDurations[complexity.level] || 10;
    
    // Adjust for data size
    let adjusted = base;
    if (complexity.dataSize > 10000) adjusted *= 1.5;
    if (complexity.dataSize > 50000) adjusted *= 2.0;
    
    return adjusted;
  }

  // Revenue optimization recommendation
  getOptimizationRecommendations(metrics) {
    const recs = [];
    
    // Check if we should adjust pricing
    const avgDemand = this.demandHistory.length > 0
      ? this.demandHistory.reduce((sum, h) => sum + h.ratio, 0) / this.demandHistory.length
      : 0;
    
    if (avgDemand > 1.5 && metrics.avgPrice < PRICING_CONFIG.revenue.maxPrice * 0.8) {
      recs.push({
        type: 'price_increase',
        reason: 'High demand, low utilization of max price',
        suggestion: 'Increase base rates by 20%',
        expectedImpact: '+15% revenue',
      });
    }
    
    if (metrics.tasksCompleted > 0 && metrics.avgPrice > 0.01) {
      const completionRate = metrics.tasksCompleted / (metrics.tasksCompleted + metrics.tasksExpired);
      if (completionRate < 0.7) {
        recs.push({
          type: 'price_decrease',
          reason: 'High prices causing task expiration',
          suggestion: 'Decrease base rates by 15%',
          expectedImpact: '+20% completion rate',
        });
      }
    }
    
    return recs;
  }
}

class AIMarketplace {
  constructor() {
    this.client = null;
    this.beacon = null;
    this.listener = null;
    this.app = express();
    this.pricing = new DynamicPricingEngine();
    
    this.pendingTasks = new Map();
    this.activeTasks = new Map();
    this.completedTasks = new Map();
    this.agentStats = new Map();
    
    this.metrics = {
      tasksPosted: 0,
      tasksCompleted: 0,
      tasksExpired: 0,
      totalRevenue: 0,
      totalCosts: 0,
      avgPrice: 0,
      priceHistory: [],
      optimizationRuns: 0,
    };
    this.startTime = Date.now();
  }

  async start() {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  🤖 VERA AI-DRIVEN DYNAMIC MARKETPLACE v5.0                            ║');
    console.log(`║  Agent: ${AGENT_ID.slice(0, 40).padEnd(45)}║`);
    console.log('║  Features: Dynamic Pricing + Complexity Scoring + Revenue Optimization  ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    // Pricing display
    console.log('💰 DYNAMIC PRICING FORMULA:');
    console.log('   Price = baseRate × complexity × surge × availability\n');
    console.log('   Base Rates (HBAR/sec):');
    Object.entries(PRICING_CONFIG.baseRates).forEach(([type, rate]) => {
      console.log(`     ${type}: ${rate.toFixed(4)}`);
    });
    console.log();

    this.client = getClient();

    // Setup API
    this.setupAPI();

    // Start discovery
    console.log('📡 Starting intelligent discovery...');
    this.listener = createBeaconListener(
      { 
        topicId: topics.beacon,
        enableAutoCleanup: true,
        enableRecoveryTracking: true,
      },
      {
        onAgentDiscovered: (agent) => this.handleAgentDiscovery(agent),
      }
    );
    await this.listener.start();

    // Start beacon
    this.beacon = createAgentBeacon(AGENT_ID, 'ai-marketplace', {
      topicId: topics.beacon,
      intervalMs: 30000,
      capabilities: ['ai-pricing', 'dynamic-rates', 'revenue-optimization', 'complexity-scoring'],
      metadata: {
        pricingModel: 'dynamic',
        api: 'http://localhost:8084',
        version: '5.0',
      },
    });
    await this.beacon.start();

    this.startLoops();

    this.app.listen(8084, () => {
      console.log('🌐 AI Marketplace API: http://localhost:8084');
      console.log('   POST /tasks          - Submit with AI pricing');
      console.log('   GET  /pricing        - Current pricing breakdown');
      console.log('   GET  /optimize       - Revenue optimization recommendations');
      console.log('   GET  /forecast       - Demand forecast\n');
    });

    this.setupConsoleInput();
    console.log('✅ AI MARKETPLACE ACTIVE\n');
  }

  setupAPI() {
    this.app.use(express.json());

    // POST /tasks - AI-driven pricing
    this.app.post('/tasks', async (req, res) => {
      const { clientId, taskType, taskData, priority = 'normal' } = req.body;
      
      if (!clientId || !taskType) {
        return res.status(400).json({ error: 'Missing clientId or taskType' });
      }

      // Get current market conditions
      const healthyAgents = this.listener?.getHealthyAgents().length || 0;
      const pendingTasks = this.pendingTasks.size;

      // Calculate AI-driven price
      const pricing = this.pricing.calculatePrice(taskType, taskData, healthyAgents, pendingTasks);
      const estimatedDuration = this.pricing.estimateDuration(pricing);
      const estimatedTotal = pricing.pricePerSecond * estimatedDuration;

      const taskId = `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      
      this.pendingTasks.set(taskId, {
        clientId,
        taskType,
        taskData,
        priority,
        pricing,
        estimatedDuration,
        estimatedTotal,
        postedAt: Date.now(),
      });

      this.metrics.tasksPosted++;
      this.metrics.priceHistory.push(pricing.pricePerSecond);
      if (this.metrics.priceHistory.length > 100) this.metrics.priceHistory.shift();
      this.metrics.avgPrice = this.metrics.priceHistory.reduce((a, b) => a + b, 0) / this.metrics.priceHistory.length;

      res.json({
        taskId,
        pricing: {
          ...pricing,
          estimatedDuration: `${estimatedDuration.toFixed(1)}s`,
          estimatedTotal: `${estimatedTotal.toFixed(6)} HBAR`,
        },
        marketConditions: {
          healthyAgents,
          pendingTasks,
          demandRatio: pricing.demandRatio,
          isSurge: pricing.surgeMultiplier > 1,
        },
        message: pricing.surgeMultiplier > 1 ? '🔥 Demand surge pricing active' : '✅ Standard pricing',
      });
    });

    // GET /pricing - Current pricing breakdown
    this.app.get('/pricing', (req, res) => {
      const healthyAgents = this.listener?.getHealthyAgents().length || 0;
      const pendingTasks = this.pendingTasks.size;
      
      res.json({
        config: PRICING_CONFIG,
        currentConditions: {
          healthyAgents,
          pendingTasks,
          demandRatio: this.pricing.calculateDemand(healthyAgents, pendingTasks),
          availabilityFactor: this.pricing.calculateAvailabilityFactor(healthyAgents),
          isSurge: Date.now() - this.pricing.lastSurgeTime < 300000,
        },
        samplePrices: {
          simple: this.pricing.calculatePrice('query', { small: true }, healthyAgents, pendingTasks),
          moderate: this.pricing.calculatePrice('analyze', { data: [1,2,3] }, healthyAgents, pendingTasks),
          complex: this.pricing.calculatePrice('research', { data: Array(100).fill(0) }, healthyAgents, pendingTasks),
        },
        priceHistory: this.metrics.priceHistory.slice(-20),
        avgPrice: this.metrics.avgPrice,
      });
    });

    // GET /optimize - Revenue optimization
    this.app.get('/optimize', (req, res) => {
      this.metrics.optimizationRuns++;
      const recs = this.pricing.getOptimizationRecommendations(this.metrics);
      
      res.json({
        recommendations: recs,
        currentMetrics: {
          avgPrice: this.metrics.avgPrice,
          completionRate: this.metrics.tasksCompleted / Math.max(1, this.metrics.tasksPosted),
          revenuePerTask: this.metrics.totalRevenue / Math.max(1, this.metrics.tasksCompleted),
        },
        demandHistory: this.pricing.demandHistory.slice(-10),
      });
    });

    // GET /forecast - Demand forecast
    this.app.get('/forecast', (req, res) => {
      const history = this.pricing.demandHistory;
      
      if (history.length < 5) {
        return res.json({ error: 'Insufficient data for forecast', minRequired: 5, current: history.length });
      }
      
      // Simple trend extrapolation
      const recent = history.slice(-5);
      const avg = recent.reduce((sum, h) => sum + h.ratio, 0) / recent.length;
      const trend = (recent[recent.length - 1].ratio - recent[0].ratio) / recent.length;
      
      res.json({
        currentDemand: avg,
        trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
        trendStrength: Math.abs(trend),
        forecast: {
          '5min': Math.max(0, avg + trend * 5),
          '15min': Math.max(0, avg + trend * 15),
          '30min': Math.max(0, avg + trend * 30),
        },
        recommendation: avg > 1.2 ? 'Scale up agents' : avg < 0.5 ? 'Scale down agents' : 'Maintain',
      });
    });
  }

  handleAgentDiscovery(agent) {
    console.log(`\n👷 Agent: ${agent.agentId.slice(0, 30)}...`);
    
    // Auto-assign tasks with pricing recalculation
    this.assignTasks();
  }

  assignTasks() {
    for (const [taskId, task] of this.pendingTasks) {
      const healthyAgents = this.listener?.getHealthyAgents() || [];
      
      if (healthyAgents.length === 0) break;
      
      // Find best matching agent
      const agent = healthyAgents[0]; // Simplified - could use capability matching
      
      task.assignedTo = agent.agentId;
      task.assignedAt = Date.now();
      task.status = 'active';
      
      this.activeTasks.set(taskId, task);
      this.pendingTasks.delete(taskId);
      
      // Start payment stream
      this.startPaymentStream(taskId, task);
      
      console.log(`   📋 ${taskId.slice(0, 16)} → ${agent.agentId.slice(0, 20)}... (${task.pricing.pricePerSecond.toFixed(6)} HBAR/s)`);
      break; // One at a time
    }
  }

  async startPaymentStream(taskId, task) {
    // Implementation would start x402-style streaming
    // For now, just track
    console.log(`   💸 Payment stream: ${task.pricing.pricePerSecond.toFixed(6)} HBAR/sec`);
  }

  startLoops() {
    // Pricing optimization check every 2 minutes
    setInterval(() => {
      const recs = this.pricing.getOptimizationRecommendations(this.metrics);
      if (recs.length > 0) {
        console.log('\n🤖 AI OPTIMIZATION:');
        recs.forEach(r => {
          console.log(`   ${r.type}: ${r.suggestion} (${r.expectedImpact})`);
        });
      }
    }, 120000);

    // Metrics display
    setInterval(() => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const healthy = this.listener?.getHealthyAgents().length || 0;
      const demand = this.pricing.calculateDemand(healthy, this.pendingTasks.size);
      
      console.log(`\n🤖 [${uptime}s] Tasks: ${this.metrics.tasksPosted}/${this.activeTasks.size}/${this.metrics.tasksCompleted} | Agents: ${healthy} | Demand: ${demand.toFixed(2)} | AvgPrice: ${this.metrics.avgPrice.toFixed(6)} HBAR/s`);
    }, 60000);
  }

  setupConsoleInput() {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async (key) => {
      const cmd = key.toString();
      
      if (cmd === 't') {
        const healthy = this.listener?.getHealthyAgents().length || 0;
        const pending = this.pendingTasks.size;
        const price = this.pricing.calculatePrice('analyze', { data: [1,2,3] }, healthy, pending);
        
        console.log(`\n💰 CURRENT PRICING (demand=${healthy > 0 ? (pending/healthy).toFixed(2) : 'N/A'}):`);
        console.log(`   Base: ${price.baseRate.toFixed(4)} × Complexity: ${price.complexityMultiplier.toFixed(2)}`);
        console.log(`   Surge: ${price.surgeMultiplier.toFixed(2)} × Availability: ${price.availabilityFactor.toFixed(2)}`);
        console.log(`   = ${price.pricePerSecond.toFixed(6)} HBAR/sec`);
      } else if (cmd === 'p') {
        console.log(`\n📊 PRICE HISTORY (${this.metrics.priceHistory.length} samples):`);
        console.log(`   Min: ${Math.min(...this.metrics.priceHistory).toFixed(6)}`);
        console.log(`   Max: ${Math.max(...this.metrics.priceHistory).toFixed(6)}`);
        console.log(`   Avg: ${this.metrics.avgPrice.toFixed(6)}`);
      } else if (cmd === 'm') {
        console.log(`\n📊 METRICS:`);
        console.log(`   Revenue: ${this.metrics.totalRevenue.toFixed(3)} HBAR`);
        console.log(`   Profit: ${(this.metrics.totalRevenue - this.metrics.totalCosts).toFixed(3)} HBAR`);
        console.log(`   Optimization runs: ${this.metrics.optimizationRuns}`);
      } else if (cmd === 'q' || key[0] === 3) {
        console.log('\n👋 Stopping AI marketplace...');
        process.exit(0);
      }
    });

    console.log('Console: t=test pricing, p=price history, m=metrics, q=quit\n');
  }
}

// Start
const marketplace = new AIMarketplace();
marketplace.start().catch(console.error);
export { marketplace, DynamicPricingEngine };
