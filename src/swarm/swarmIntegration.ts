/**
 * Vera Swarm Integration Module
 *
 * Orchestrates all swarm optimization components:
 * - Intelligent Task Router
 * - Adaptive Load Balancer
 * - Workload-Adaptive Variant Controller
 * - Predictive Scaler
 * - Task Deduplicator
 * - Enhanced Agent Lifecycle Manager
 *
 * Integrates with Flower of Life OS for sacred geometry-aware operations.
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import type { FlowerOfLifeOS } from '../vera/orchestrator/flowerOfLifeOS.js';

import {
  IntelligentTaskRouter,
  getIntelligentTaskRouter,
  AdaptiveLoadBalancer,
  getAdaptiveLoadBalancer,
  VariantController,
  getVariantController,
  PredictiveScaler,
  getPredictiveScaler,
  TaskDeduplicator,
  getTaskDeduplicator,
  AgentLifecycleManager,
  getAgentLifecycleManager,
} from './index.js';

import type { TaskRequest, RoutingScore } from './intelligentTaskRouter.js';
import type { AgentVariant } from './variantController.js';

interface SwarmConfig {
  enableTaskRouter: boolean;
  enableLoadBalancer: boolean;
  enableVariantController: boolean;
  enablePredictiveScaler: boolean;
  enableTaskDeduplicator: boolean;
  enableLifecycleManager: boolean;
  healthCheckIntervalMs: number;
  metricsReportingIntervalMs: number;
}

const DEFAULT_CONFIG: SwarmConfig = {
  enableTaskRouter: true,
  enableLoadBalancer: true,
  enableVariantController: true,
  enablePredictiveScaler: true,
  enableTaskDeduplicator: true,
  enableLifecycleManager: true,
  healthCheckIntervalMs: 30000,
  metricsReportingIntervalMs: 60000,
};

interface SwarmMetrics {
  timestamp: number;
  routerStats: {
    totalAgents: number;
    averageSuccessRate: number;
    totalTasksRouted: number;
  };
  loadBalancerStats: {
    rebalancesTriggered: number;
    workSteals: number;
    proactiveScales: number;
    averageVariance: number;
  };
  variantStats: {
    switchesMicroToNormal: number;
    switchesNormalToMacro: number;
    hybridTransitions: number;
    totalAgents: number;
    variantDistribution: Record<AgentVariant, number>;
  };
  scalerStats: {
    scaleUpEvents: number;
    scaleDownEvents: number;
    prewarmEvents: number;
    predictionsMade: number;
    activeAgents: number;
    warmAgents: number;
  };
  deduplicatorStats: {
    duplicatesDetected: number;
    duplicatesEliminated: number;
    tasksCoalesced: number;
    batchesCreated: number;
    cacheHits: number;
    cacheMisses: number;
    cacheEvictions: number;
    computationSaved: number;
    currentFingerprints: number;
    currentBatches: number;
    currentCacheEntries: number;
  };
  lifecycleStats: {
    agentsSpawned: number;
    agentsActivated: number;
    agentsDegraded: number;
    agentsRecovered: number;
    agentsRemoved: number;
    overallHealthLevel: string;
  };
}

export class SwarmIntegration extends EventEmitter {
  private lattice: FlowerOfLifeOS;
  private config: SwarmConfig;
  private isRunning = false;
  
  // Component instances
  private taskRouter?: IntelligentTaskRouter;
  private loadBalancer?: AdaptiveLoadBalancer;
  private variantController?: VariantController;
  private predictiveScaler?: PredictiveScaler;
  private taskDeduplicator?: TaskDeduplicator;
  private lifecycleManager?: AgentLifecycleManager;
  
  private healthCheckTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;

  constructor(lattice: FlowerOfLifeOS, config: Partial<SwarmConfig> = {}) {
    super();
    this.lattice = lattice;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize and start all swarm optimization components
   */
  async initialize(): Promise<void> {
    logger.info('SwarmIntegration', {
      message: 'Initializing Vera Swarm Optimization',
      components: Object.entries(this.config)
        .filter(([k, v]) => k.startsWith('enable') && v)
        .map(([k]) => k.replace('enable', '').replace(/([A-Z])/g, ' $1').trim()),
    });

    // Initialize Task Router
    if (this.config.enableTaskRouter) {
      this.taskRouter = getIntelligentTaskRouter(this.lattice);
    }

    // Initialize Load Balancer
    if (this.config.enableLoadBalancer) {
      this.loadBalancer = getAdaptiveLoadBalancer(this.lattice);
    }

    // Initialize Variant Controller
    if (this.config.enableVariantController) {
      this.variantController = getVariantController();
    }

    // Initialize Predictive Scaler
    if (this.config.enablePredictiveScaler) {
      this.predictiveScaler = getPredictiveScaler(this.lattice);
    }

    // Initialize Task Deduplicator
    if (this.config.enableTaskDeduplicator) {
      this.taskDeduplicator = getTaskDeduplicator();
    }

    // Initialize Lifecycle Manager
    if (this.config.enableLifecycleManager) {
      this.lifecycleManager = getAgentLifecycleManager(this.lattice);
    }

    this.setupEventListeners();
    
    logger.info('SwarmIntegration', { message: 'Swarm optimization initialized' });
    this.emit('initialized');
  }

  /**
   * Start all components
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.taskRouter?.start?.();
    this.loadBalancer?.start();
    this.variantController?.start();
    this.predictiveScaler?.start();
    this.taskDeduplicator?.start();
    this.lifecycleManager?.start();

    // Start health checks
    this.healthCheckTimer = setInterval(() => {
      this.runHealthCheck();
    }, this.config.healthCheckIntervalMs);

    // Start metrics reporting
    this.metricsTimer = setInterval(() => {
      this.reportMetrics();
    }, this.config.metricsReportingIntervalMs);

    logger.info('SwarmIntegration', {
      message: 'All swarm components started',
      healthCheckInterval: this.config.healthCheckIntervalMs,
      metricsInterval: this.config.metricsReportingIntervalMs,
    });

    this.emit('started');
  }

  /**
   * Stop all components
   */
  stop(): void {
    this.isRunning = false;

    this.taskRouter?.stop?.();
    this.loadBalancer?.stop();
    this.variantController?.stop();
    this.predictiveScaler?.stop();
    this.taskDeduplicator?.stop();
    this.lifecycleManager?.stop();

    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);

    logger.info('SwarmIntegration', { message: 'All swarm components stopped' });
    this.emit('stopped');
  }

  /**
   * Route a task through the optimized swarm
   */
  routeTask(task: TaskRequest): {
    primary: RoutingScore | null;
    fallbacks: RoutingScore[];
    deduplicated: boolean;
    cachedResult?: unknown;
  } {
    // Check for deduplication first
    if (this.taskDeduplicator) {
      const dedupResult = this.taskDeduplicator.submitTask(
        task.taskId,
        task.taskType,
        task,
        'router',
        { idempotent: true, cacheable: true }
      );

      if (dedupResult.action === 'cached') {
        return {
          primary: null,
          fallbacks: [],
          deduplicated: true,
          cachedResult: dedupResult.cachedResult,
        };
      }

      if (dedupResult.action === 'wait') {
        return {
          primary: null,
          fallbacks: [],
          deduplicated: true,
        };
      }
    }

    // Route through intelligent router
    const routing = this.taskRouter?.routeTask(task) || {
      primary: null,
      fallbacks: [],
      path: null,
      confidence: 0,
    };

    return {
      primary: routing.primary,
      fallbacks: routing.fallbacks,
      deduplicated: false,
    };
  }

  /**
   * Record task completion for learning
   */
  recordTaskCompletion(
    agentId: string,
    task: TaskRequest,
    result: { success: boolean; latency: number; error?: string }
  ): void {
    // Update task router
    this.taskRouter?.recordTaskCompletion(agentId, task, result);

    // Update lifecycle manager
    this.lifecycleManager?.recordTaskCompletion(agentId, result);

    // Complete in deduplicator
    this.taskDeduplicator?.completeTask(task.taskId, result, {
      cacheable: result.success,
    });
  }

  /**
   * Register a new agent with all components
   */
  registerAgent(
    agentId: string,
    nodeId: string,
    layer: number,
    variant: AgentVariant,
    capabilities: string[]
  ): void {
    // Register with lifecycle manager
    this.lifecycleManager?.spawnAgent(agentId, nodeId, layer as 0 | 1 | 2 | 3, variant, capabilities);

    // Register with variant controller
    this.variantController?.registerAgent(agentId, variant);

    // Register with load balancer
    this.loadBalancer?.registerAgent(nodeId, agentId);

    // Register with predictive scaler
    this.predictiveScaler?.registerActiveAgent(agentId);
  }

  /**
   * Unregister an agent from all components
   */
  unregisterAgent(agentId: string, nodeId?: string): void {
    this.lifecycleManager?.unregisterAgent(agentId);
    this.variantController?.unregisterAgent(agentId);
    this.predictiveScaler?.unregisterAgent(agentId);
    
    if (nodeId) {
      this.loadBalancer?.unregisterAgent(nodeId, agentId);
    }
  }

  /**
   * Update agent metrics across all components
   */
  updateAgentMetrics(
    agentId: string,
    nodeId: string,
    metrics: {
      queueDepth?: number;
      taskRate?: number;
      latency?: number;
      cpuUsage?: number;
      memoryUsage?: number;
    }
  ): void {
    this.variantController?.updateMetrics(agentId, {
      queueDepth: metrics.queueDepth,
      taskRate: metrics.taskRate,
      latency: metrics.latency,
    });

    this.lifecycleManager?.updateMetrics(agentId, {
      queueDepth: metrics.queueDepth,
      latency: metrics.latency,
      cpuUsage: metrics.cpuUsage,
      memoryUsage: metrics.memoryUsage,
    });

    this.loadBalancer?.updateNodeMetrics(nodeId, {
      queueDepth: metrics.queueDepth,
      taskRate: metrics.taskRate,
      latency: metrics.latency,
    });
  }

  /**
   * Run health check on all components
   */
  private runHealthCheck(): void {
    const swarmHealth = this.lifecycleManager?.getSwarmHealth();
    
    if (swarmHealth?.overallHealthLevel === 'critical') {
      logger.error('SwarmIntegration', {
        message: 'Critical swarm health detected',
        health: swarmHealth,
      });
      
      this.emit('critical_health', swarmHealth);
    }

    // Check for degraded agents
    const degraded = this.lifecycleManager?.getDegradedAgents();
    if (degraded && degraded.length > 0) {
      this.emit('degraded_agents', degraded);
    }
  }

  /**
   * Report metrics from all components
   */
  private reportMetrics(): void {
    const metrics: SwarmMetrics = {
      timestamp: Date.now(),
      routerStats: this.taskRouter?.getStats() || {
        totalAgents: 0,
        averageSuccessRate: 0,
        totalTasksRouted: 0,
      },
      loadBalancerStats: this.loadBalancer?.getStats() || {
        rebalancesTriggered: 0,
        workSteals: 0,
        proactiveScales: 0,
        averageVariance: 0,
      },
      variantStats: this.variantController?.getStats() || {
        switchesMicroToNormal: 0,
        switchesNormalToMacro: 0,
        hybridTransitions: 0,
        totalAgents: 0,
        variantDistribution: { micro: 0, normal: 0, macro: 0 },
      },
      scalerStats: this.predictiveScaler?.getStats() || {
        scaleUpEvents: 0,
        scaleDownEvents: 0,
        prewarmEvents: 0,
        predictionsMade: 0,
        activeAgents: 0,
        warmAgents: 0,
      },
      deduplicatorStats: this.taskDeduplicator?.getStats() || {
        duplicatesDetected: 0,
        duplicatesEliminated: 0,
        tasksCoalesced: 0,
        batchesCreated: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheEvictions: 0,
        computationSaved: 0,
        currentFingerprints: 0,
        currentBatches: 0,
        currentCacheEntries: 0,
      },
      lifecycleStats: {
        ...this.lifecycleManager?.getStats() || {
          agentsSpawned: 0,
          agentsActivated: 0,
          agentsDegraded: 0,
          agentsRecovered: 0,
          agentsRemoved: 0,
        },
        overallHealthLevel: this.lifecycleManager?.getSwarmHealth()?.overallHealthLevel || 'unknown',
      },
    };

    logger.info('SwarmIntegration', {
      message: 'Swarm metrics report',
      metrics,
    });

    this.emit('metrics', metrics);
  }

  /**
   * Setup event listeners between components
   */
  private setupEventListeners(): void {
    // Task Router events
    this.taskRouter?.on('task_routed', (data) => {
      this.emit('task_routed', data);
    });

    // Load Balancer events
    this.loadBalancer?.on('rebalance_triggered', (data) => {
      this.emit('load_rebalanced', data);
    });

    this.loadBalancer?.on('work_stolen', (data) => {
      // Update lifecycle manager with new assignments
      this.emit('work_stolen', data);
    });

    // Variant Controller events
    this.variantController?.on('variant_switched', (data) => {
      this.emit('variant_switched', data);
    });

    // Predictive Scaler events
    this.predictiveScaler?.on('agent_spawned', (data) => {
      this.emit('agent_spawned', data);
    });

    this.predictiveScaler?.on('agent_activated', (data) => {
      this.emit('agent_activated', data);
    });

    // Lifecycle Manager events
    this.lifecycleManager?.on('agent_degraded', (data) => {
      this.emit('agent_degraded', data);
    });

    this.lifecycleManager?.on('agent_recovered', (data) => {
      this.emit('agent_recovered', data);
    });

    this.lifecycleManager?.on('agent_removing', (data) => {
      this.emit('agent_removing', data);
    });
  }

  /**
   * Get comprehensive swarm status
   */
  getStatus(): {
    isRunning: boolean;
    components: Record<string, boolean>;
    swarmHealth: ReturnType<AgentLifecycleManager['getSwarmHealth']> | null;
    loadDistribution: ReturnType<AdaptiveLoadBalancer['getLoadDistribution']> | null;
    topPerformers: ReturnType<AgentLifecycleManager['getTopPerformers']> | null;
  } {
    return {
      isRunning: this.isRunning,
      components: {
        taskRouter: !!this.taskRouter,
        loadBalancer: !!this.loadBalancer,
        variantController: !!this.variantController,
        predictiveScaler: !!this.predictiveScaler,
        taskDeduplicator: !!this.taskDeduplicator,
        lifecycleManager: !!this.lifecycleManager,
      },
      swarmHealth: this.lifecycleManager?.getSwarmHealth() || null,
      loadDistribution: this.loadBalancer?.getLoadDistribution() || null,
      topPerformers: this.lifecycleManager?.getTopPerformers(10) || null,
    };
  }

  /**
   * Force emergency scaling
   */
  forceScale(targetCount: number, reason: string): void {
    this.predictiveScaler?.forceScale(targetCount, reason);
    logger.warn('SwarmIntegration', {
      message: 'Emergency scaling triggered',
      targetCount,
      reason,
    });
  }

  /**
   * Get component instances for direct access
   */
  getComponents(): {
    taskRouter?: IntelligentTaskRouter;
    loadBalancer?: AdaptiveLoadBalancer;
    variantController?: VariantController;
    predictiveScaler?: PredictiveScaler;
    taskDeduplicator?: TaskDeduplicator;
    lifecycleManager?: AgentLifecycleManager;
  } {
    return {
      taskRouter: this.taskRouter,
      loadBalancer: this.loadBalancer,
      variantController: this.variantController,
      predictiveScaler: this.predictiveScaler,
      taskDeduplicator: this.taskDeduplicator,
      lifecycleManager: this.lifecycleManager,
    };
  }
}

// Singleton instance
let integrationInstance: SwarmIntegration | null = null;

export function getSwarmIntegration(
  lattice: FlowerOfLifeOS,
  config?: Partial<SwarmConfig>
): SwarmIntegration {
  if (!integrationInstance) {
    integrationInstance = new SwarmIntegration(lattice, config);
  }
  return integrationInstance;
}

export function resetSwarmIntegration(): void {
  integrationInstance = null;
}

export type { SwarmConfig, SwarmMetrics };
