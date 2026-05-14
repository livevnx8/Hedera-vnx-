/**
 * Multi-Variant Swarm Orchestrator
 * 
 * Manages swarm formation, lifecycle, and cross-swarm coordination
 * for Micro, Normal, and Macro swarm classes
 */

import { EventEmitter } from 'events';
import { BaseSwarmAgent, AgentConfig, AgentTier } from './baseSwarmAgent.js';
import { MicroAgent, StreamEvent } from './microAgent.js';
import { NormalAgent, Workflow } from './normalAgent.js';
import { MacroAgent, BusMessage } from './macroAgent.js';
import { LatticeRelay } from './latticeRelay.js';
import { HCSTopicInfrastructure, DEFAULT_HIERARCHY } from './hcsTopicInfrastructure.js';
import { logger } from '../../monitoring/logger.js';

export type SwarmClass = 'micro' | 'normal' | 'macro';

export interface SwarmConfig {
  class: SwarmClass;
  minAgents: number;
  maxAgents: number;
  targetAgents: number;
  formationThreshold: {
    eventRate?: number; // events/sec for micro
    queueDepth?: number; // for normal
    crossRegionLoad?: number; // for macro
  };
  agentTiers: {
    tier1: number; // percentage
    tier2: number;
    tier3: number;
  };
}

export interface SwarmMetrics {
  id: string;
  class: SwarmClass;
  agentCount: number;
  activeAgents: number;
  idleAgents: number;
  failedAgents: number;
  totalTasksCompleted: number;
  averageLoad: number;
  formationTime: number;
  uptime: number;
}

export class MultiVariantSwarmOrchestrator extends EventEmitter {
  protected agents: Map<string, BaseSwarmAgent> = new Map();
  private swarms: Map<string, SwarmMetrics> = new Map();
  private topicInfrastructure: HCSTopicInfrastructure;
  private latticeRelay: LatticeRelay;
  private isRunning: boolean = false;
  private orchestrationInterval: NodeJS.Timeout | null = null;
  
  // Swarm configurations
  private configs: Record<SwarmClass, SwarmConfig> = {
    micro: {
      class: 'micro',
      minAgents: 10,
      maxAgents: 100,
      targetAgents: 50,
      formationThreshold: { eventRate: 1000 },
      agentTiers: { tier1: 80, tier2: 15, tier3: 5 }
    },
    normal: {
      class: 'normal',
      minAgents: 20,
      maxAgents: 1000,
      targetAgents: 200,
      formationThreshold: { queueDepth: 1000 },
      agentTiers: { tier1: 60, tier2: 30, tier3: 10 }
    },
    macro: {
      class: 'macro',
      minAgents: 5,
      maxAgents: 50,
      targetAgents: 20,
      formationThreshold: { crossRegionLoad: 0.7 },
      agentTiers: { tier1: 40, tier2: 35, tier3: 25 }
    }
  };

  constructor() {
    super();
    this.topicInfrastructure = new HCSTopicInfrastructure(DEFAULT_HIERARCHY);
    this.latticeRelay = new LatticeRelay(this.topicInfrastructure);
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    logger.info('MultiVariantSwarmOrchestrator', { message: 'Initializing...' });

    // Provision HCS topic hierarchy
    await this.topicInfrastructure.provisionHierarchy();

    this.isRunning = true;

    // Start formation monitors
    this.startFormationMonitors();

    // Create minimum swarms for each class
    await this.ensureMinimumSwarms();

    logger.info('MultiVariantSwarmOrchestrator', { 
      microAgents: this.getAgentsByClass('micro').length,
      normalAgents: this.getAgentsByClass('normal').length,
      macroAgents: this.getAgentsByClass('macro').length,
      message: 'Orchestrator initialized' 
    });

    this.emit('initialized');
  }

  /**
   * Start monitoring for swarm formation triggers
   */
  private startFormationMonitors(): void {
    this.orchestrationInterval = setInterval(() => {
      this.evaluateSwarmFormation();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Evaluate if new swarms need to be formed
   */
  private async evaluateSwarmFormation(): Promise<void> {
    // Check micro swarm formation (high event rate)
    const microLoad = this.calculateClassLoad('micro');
    if (microLoad > 0.8) {
      await this.spawnMicroSwarm(10);
    }

    // Check normal swarm formation (queue depth)
    const normalLoad = this.calculateClassLoad('normal');
    if (normalLoad > 0.8) {
      await this.spawnNormalSwarm(20);
    }

    // Check macro swarm formation (cross-region load)
    const macroLoad = this.calculateClassLoad('macro');
    if (macroLoad > 0.8) {
      await this.spawnMacroSwarm(5);
    }

    // Cleanup failed agents
    this.cleanupFailedAgents();
  }

  /**
   * Calculate load for a swarm class
   */
  private calculateClassLoad(swarmClass: SwarmClass): number {
    const agents = this.getAgentsByClass(swarmClass);
    if (agents.length === 0) return 0;

    const totalLoad = agents.reduce((sum, agent) => sum + agent.getCurrentLoad(), 0);
    return totalLoad / agents.length;
  }

  /**
   * Ensure minimum swarm sizes
   */
  private async ensureMinimumSwarms(): Promise<void> {
    for (const [swarmClass, config] of Object.entries(this.configs)) {
      const currentCount = this.getAgentsByClass(swarmClass as SwarmClass).length;
      
      if (currentCount < config.minAgents) {
        const needed = config.minAgents - currentCount;
        
        switch (swarmClass) {
          case 'micro':
            await this.spawnMicroSwarm(needed);
            break;
          case 'normal':
            await this.spawnNormalSwarm(needed);
            break;
          case 'macro':
            await this.spawnMacroSwarm(needed);
            break;
        }
      }
    }
  }

  /**
   * Spawn micro swarm agents
   */
  async spawnMicroSwarm(count: number): Promise<MicroAgent[]> {
    const config = this.configs.micro;
    const spawned: MicroAgent[] = [];

    for (let i = 0; i < count; i++) {
      const tier = this.determineTier(config.agentTiers);
      const agent = new MicroAgent({
        id: `micro-${Date.now()}-${i}`,
        tier,
        role: tier === 1 ? 'executor' : tier === 2 ? 'analyst' : 'planner',
        swarmClass: 'micro',
        capabilities: ['streaming', 'fast-processing'],
        maxConcurrentTasks: tier === 1 ? 15 : tier === 2 ? 8 : 5,
        timeoutMs: 100
      });

      this.agents.set(agent.getId(), agent);
      spawned.push(agent);
    }

    logger.info('MultiVariantSwarmOrchestrator', {
      count: spawned.length,
      message: 'Micro swarm spawned'
    });

    this.emit('swarmSpawned', { class: 'micro', count: spawned.length });
    return spawned;
  }

  /**
   * Spawn normal swarm agents
   */
  async spawnNormalSwarm(count: number): Promise<NormalAgent[]> {
    const config = this.configs.normal;
    const spawned: NormalAgent[] = [];

    for (let i = 0; i < count; i++) {
      const tier = this.determineTier(config.agentTiers);
      const agent = new NormalAgent({
        id: `normal-${Date.now()}-${i}`,
        tier,
        role: tier === 1 ? 'executor' : tier === 2 ? 'analyst' : 'planner',
        swarmClass: 'normal',
        capabilities: ['workflow', 'aggregation'],
        maxConcurrentTasks: tier === 1 ? 7 : tier === 2 ? 4 : 3,
        timeoutMs: 1000
      });

      this.agents.set(agent.getId(), agent);
      spawned.push(agent);
    }

    logger.info('MultiVariantSwarmOrchestrator', {
      count: spawned.length,
      message: 'Normal swarm spawned'
    });

    this.emit('swarmSpawned', { class: 'normal', count: spawned.length });
    return spawned;
  }

  /**
   * Spawn macro swarm agents
   */
  async spawnMacroSwarm(count: number): Promise<MacroAgent[]> {
    const config = this.configs.macro;
    const spawned: MacroAgent[] = [];

    for (let i = 0; i < count; i++) {
      const tier = this.determineTier(config.agentTiers);
      const agent = new MacroAgent({
        id: `macro-${Date.now()}-${i}`,
        tier,
        role: tier === 1 ? 'executor' : tier === 2 ? 'analyst' : 'planner',
        swarmClass: 'macro',
        capabilities: ['bus', 'federation', 'coordination'],
        maxConcurrentTasks: tier === 1 ? 5 : tier === 2 ? 4 : 3,
        timeoutMs: 5000
      });

      this.agents.set(agent.getId(), agent);
      spawned.push(agent);
    }

    logger.info('MultiVariantSwarmOrchestrator', {
      count: spawned.length,
      message: 'Macro swarm spawned'
    });

    this.emit('swarmSpawned', { class: 'macro', count: spawned.length });
    return spawned;
  }

  /**
   * Determine agent tier based on distribution percentages
   */
  private determineTier(tiers: { tier1: number; tier2: number; tier3: number }): AgentTier {
    const roll = Math.random() * 100;
    if (roll < tiers.tier1) return 1;
    if (roll < tiers.tier1 + tiers.tier2) return 2;
    return 3;
  }

  /**
   * Get agents by swarm class
   */
  getAgentsByClass(swarmClass: SwarmClass): BaseSwarmAgent[] {
    return Array.from(this.agents.values()).filter(a => a.getSwarmClass() === swarmClass);
  }

  /**
   * Route event through lattice relay
   */
  async routeEvent(
    sourceAgent: BaseSwarmAgent,
    payload: any,
    functionType: string
  ): Promise<void> {
    const swarmClass = sourceAgent.getSwarmClass();

    switch (swarmClass) {
      case 'micro':
        if (sourceAgent instanceof MicroAgent) {
          await this.latticeRelay.routeMicroToNormal(
            sourceAgent, 
            payload as StreamEvent[], 
            functionType
          );
        }
        break;
      case 'normal':
        if (sourceAgent instanceof NormalAgent) {
          await this.latticeRelay.routeNormalToMacro(
            sourceAgent,
            payload as Workflow,
            functionType
          );
        }
        break;
      case 'macro':
        if (sourceAgent instanceof MacroAgent) {
          await this.latticeRelay.routeMacroToNormal(
            sourceAgent,
            payload as BusMessage,
            functionType
          );
        }
        break;
    }
  }

  /**
   * Execute meet operation
   */
  async executeMeet(agentIds: string[]): Promise<any> {
    const agents = agentIds.map(id => this.agents.get(id)).filter(Boolean) as BaseSwarmAgent[];
    return await this.latticeRelay.executeMeet(agents);
  }

  /**
   * Execute join operation
   */
  async executeJoin(agentIds: string[]): Promise<any> {
    const agents = agentIds.map(id => this.agents.get(id)).filter(Boolean) as BaseSwarmAgent[];
    return await this.latticeRelay.executeJoin(agents);
  }

  /**
   * Cleanup failed agents
   */
  private cleanupFailedAgents(): void {
    for (const [id, agent] of this.agents.entries()) {
      if (agent.getStatus() === 'failed') {
        agent.shutdown();
        this.agents.delete(id);
      }
    }
  }

  /**
   * Get orchestrator statistics
   */
  getStats() {
    const micro = this.getAgentsByClass('micro');
    const normal = this.getAgentsByClass('normal');
    const macro = this.getAgentsByClass('macro');

    return {
      totalAgents: this.agents.size,
      byClass: {
        micro: {
          count: micro.length,
          healthy: micro.filter(a => a.isHealthy()).length,
          averageLoad: micro.reduce((sum, a) => sum + a.getCurrentLoad(), 0) / micro.length || 0
        },
        normal: {
          count: normal.length,
          healthy: normal.filter(a => a.isHealthy()).length,
          averageLoad: normal.reduce((sum, a) => sum + a.getCurrentLoad(), 0) / normal.length || 0
        },
        macro: {
          count: macro.length,
          healthy: macro.filter(a => a.isHealthy()).length,
          averageLoad: macro.reduce((sum, a) => sum + a.getCurrentLoad(), 0) / macro.length || 0
        }
      },
      relayStats: this.latticeRelay.getStats(),
      topicStats: this.topicInfrastructure.getStatistics()
    };
  }

  /**
   * Print orchestrator status
   */
  printStatus(): void {
    const stats = this.getStats();

    console.log('\n🐝 Multi-Variant Swarm Status');
    console.log('==============================\n');
    console.log(`Total Agents: ${stats.totalAgents}`);
    console.log(`\nBy Class:`);
    console.log(`  Micro:  ${stats.byClass.micro.count} agents (${stats.byClass.micro.healthy} healthy, load: ${(stats.byClass.micro.averageLoad * 100).toFixed(1)}%)`);
    console.log(`  Normal: ${stats.byClass.normal.count} agents (${stats.byClass.normal.healthy} healthy, load: ${(stats.byClass.normal.averageLoad * 100).toFixed(1)}%)`);
    console.log(`  Macro:  ${stats.byClass.macro.count} agents (${stats.byClass.macro.healthy} healthy, load: ${(stats.byClass.macro.averageLoad * 100).toFixed(1)}%)`);
    console.log(`\nRelay: ${stats.relayStats.messagesUp}↑ ${stats.relayStats.messagesDown}↓ messages, ${stats.relayStats.meetOperations} meets, ${stats.relayStats.joinOperations} joins`);
    console.log(`Topics: ${stats.topicStats.totalTopics} configured`);
    console.log('\n==============================\n');
  }

  /**
   * Shutdown orchestrator
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;

    if (this.orchestrationInterval) {
      clearInterval(this.orchestrationInterval);
      this.orchestrationInterval = null;
    }

    // Shutdown all agents
    for (const agent of this.agents.values()) {
      agent.shutdown();
    }
    this.agents.clear();

    // Shutdown relay
    this.latticeRelay.shutdown();

    logger.info('MultiVariantSwarmOrchestrator', { message: 'Orchestrator shutdown' });
    this.emit('shutdown');
  }
}
