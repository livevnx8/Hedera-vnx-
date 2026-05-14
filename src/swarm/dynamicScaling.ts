/**
 * Vera Dynamic Agent Creation
 * 
 * Phase 5: Auto-scaling swarm with lattice-based agent spawning
 * 
 * Automatically creates new agents based on:
 * - Workload thresholds (queue depth)
 * - Task complexity requirements
 * - Geographic/spatial distribution needs
 * - Specialization gaps
 * 
 * Ensures new agents integrate seamlessly via lattice geometry.
 */

import { logger } from '../monitoring/logger.js';
import { veraHCS } from '../dovu/veraHCS.js';
import { veraLatticeSwarm, LatticeNode, SwarmAgent } from './latticeSwarm.js';

// Scaling thresholds
export interface ScalingThresholds {
  queueDepthPerAgent: number;     // Max tasks per agent before spawn
  spawnCooldownMs: number;        // Minimum time between spawns
  maxTier1Agents: number;         // Upper limit for executors
  maxTier2Agents: number;         // Upper limit for analysts
  maxTier3Agents: number;         // Upper limit for planners
  minTier1Agents: number;         // Lower limit for executors
  minTier2Agents: number;         // Lower limit for analysts
  minTier3Agents: number;         // Lower limit for planners
}

// Agent template for spawning
export interface AgentTemplate {
  role: 'executor' | 'analyst' | 'planner';
  tier: 1 | 2 | 3;
  specialization: string;
  baseEmbedding: number[];
  capabilities: string[];
  parentAgentId?: string;  // For hierarchical spawning
}

// Spawned agent record
export interface SpawnedAgent {
  agentId: string;
  template: AgentTemplate;
  spawnTime: number;
  parentId?: string;
  children: string[];
  taskCount: number;
  totalEarnings: number;
  latticeScore: number;
}

// Scaling decision
export interface ScalingDecision {
  action: 'spawn' | 'terminate' | 'maintain';
  tier: 1 | 2 | 3;
  count: number;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
}

/**
 * Vera Dynamic Scaling - Auto-scaling agent swarm
 */
export class VeraDynamicScaling {
  private thresholds: ScalingThresholds = {
    queueDepthPerAgent: 5,    // Spawn when >5 tasks/agent
    spawnCooldownMs: 10000,    // 10 seconds between spawns
    maxTier1Agents: 20,
    maxTier2Agents: 10,
    maxTier3Agents: 3,
    minTier1Agents: 3,
    minTier2Agents: 2,
    minTier3Agents: 1
  };

  private spawnedAgents: Map<string, SpawnedAgent> = new Map();
  private lastSpawnTime: Map<1 | 2 | 3, number> = new Map();
  private totalSpawns: number = 0;
  private totalTerminations: number = 0;

  async initialize(thresholds?: Partial<ScalingThresholds>): Promise<void> {
    if (thresholds) {
      this.thresholds = { ...this.thresholds, ...thresholds };
    }

    logger.info('VeraDynamicScaling', {
      thresholds: this.thresholds,
      message: 'Dynamic scaling initialized'
    });

    // Start monitoring loop
    this.startScalingLoop();
  }

  /**
   * Main scaling decision engine
   * Analyzes swarm state and decides to spawn/terminate/maintain
   */
  async evaluateScaling(): Promise<ScalingDecision[]> {
    const stats = veraLatticeSwarm.getSwarmStats();
    const decisions: ScalingDecision[] = [];

    // Count agents by tier
    const tierCounts = {
      1: stats.agents.filter((a: any) => a.tier === 1).length,
      2: stats.agents.filter((a: any) => a.tier === 2).length,
      3: stats.agents.filter((a: any) => a.tier === 3).length
    };

    // Check queue depth per agent for each tier
    const queuePerTier1 = stats.queueLength / Math.max(tierCounts[1], 1);
    const queuePerTier2 = stats.queueLength / Math.max(tierCounts[2], 1);

    // Tier 1: Executors - Scale based on queue depth
    if (queuePerTier1 > this.thresholds.queueDepthPerAgent && 
        tierCounts[1] < this.thresholds.maxTier1Agents) {
      decisions.push({
        action: 'spawn',
        tier: 1,
        count: Math.min(2, this.thresholds.maxTier1Agents - tierCounts[1]),
        reason: `Queue depth ${queuePerTier1.toFixed(1)} > threshold ${this.thresholds.queueDepthPerAgent}`,
        urgency: queuePerTier1 > this.thresholds.queueDepthPerAgent * 2 ? 'high' : 'medium'
      });
    } else if (queuePerTier1 < 1 && tierCounts[1] > this.thresholds.minTier1Agents) {
      decisions.push({
        action: 'terminate',
        tier: 1,
        count: 1,
        reason: 'Low utilization',
        urgency: 'low'
      });
    }

    // Tier 2: Analysts - Scale based on complexity needs
    const complexTasks = stats.queueLength * 0.3; // Assume 30% are complex
    if (complexTasks > tierCounts[2] * 3 && 
        tierCounts[2] < this.thresholds.maxTier2Agents) {
      decisions.push({
        action: 'spawn',
        tier: 2,
        count: 1,
        reason: `Complex task backlog: ${complexTasks.toFixed(0)}`,
        urgency: 'medium'
      });
    }

    // Tier 3: Planners - Rarely scale, only for major load
    if (stats.queueLength > 50 && tierCounts[3] < this.thresholds.maxTier3Agents) {
      decisions.push({
        action: 'spawn',
        tier: 3,
        count: 1,
        reason: 'Major workload spike',
        urgency: 'high'
      });
    }

    return decisions;
  }

  /**
   * Spawn new agent with lattice geometry integration
   */
  async spawnAgent(decision: ScalingDecision): Promise<string | null> {
    // Check cooldown
    const now = Date.now();
    const lastSpawn = this.lastSpawnTime.get(decision.tier) || 0;
    if (now - lastSpawn < this.thresholds.spawnCooldownMs) {
      logger.debug('VeraDynamicScaling', {
        tier: decision.tier,
        cooldown: this.thresholds.spawnCooldownMs,
        message: 'Spawn cooldown active'
      });
      return null;
    }

    // Create template based on tier
    const template = this.createAgentTemplate(decision.tier);

    // Find parent agent (for hierarchical lattice integration)
    const parentId = this.findBestParent(decision.tier);

    // Generate lattice-integrated embedding
    const embedding = this.generateSpawnEmbedding(template, parentId);
    
    // Create the agent via swarm
    const agentId = `spawned-${decision.tier}-${now}-${Math.random().toString(36).slice(2, 5)}`;
    
    // In production: call veraLatticeSwarm.createAgent(agentId, template, embedding)
    // For now: track the spawn
    const spawnedAgent: SpawnedAgent = {
      agentId,
      template,
      spawnTime: now,
      parentId,
      children: [],
      taskCount: 0,
      totalEarnings: 0,
      latticeScore: 0
    };

    this.spawnedAgents.set(agentId, spawnedAgent);
    this.lastSpawnTime.set(decision.tier, now);
    this.totalSpawns++;

    // Update parent if exists
    if (parentId) {
      const parent = this.spawnedAgents.get(parentId);
      if (parent) {
        parent.children.push(agentId);
      }
    }

    // Log to HCS
    await veraHCS.logAchievement('agent_spawned', {
      agentId,
      tier: decision.tier,
      parentId,
      specialization: template.specialization,
      timestamp: now
    });

    logger.info('VeraDynamicScaling', {
      agentId,
      tier: decision.tier,
      parent: parentId || 'none',
      specialization: template.specialization,
      urgency: decision.urgency,
      message: 'Agent spawned'
    });

    return agentId;
  }

  /**
   * Terminate underutilized agent
   */
  async terminateAgent(agentId: string): Promise<boolean> {
    const agent = this.spawnedAgents.get(agentId);
    if (!agent) {
      logger.warn('VeraDynamicScaling', { agentId, message: 'Agent not found for termination' });
      return false;
    }

    // Check if agent has children
    if (agent.children.length > 0) {
      // Reparent children to grandparent
      const grandparent = agent.parentId;
      for (const childId of agent.children) {
        const child = this.spawnedAgents.get(childId);
        if (child) {
          child.parentId = grandparent;
        }
      }
    }

    // Remove from tracking
    this.spawnedAgents.delete(agentId);
    this.totalTerminations++;

    // Log to HCS
    await veraHCS.logAchievement('agent_terminated', {
      agentId,
      tier: agent.template.tier,
      lifespan: Date.now() - agent.spawnTime,
      tasksCompleted: agent.taskCount,
      timestamp: Date.now()
    });

    logger.info('VeraDynamicScaling', {
      agentId,
      tier: agent.template.tier,
      lifespan: `${((Date.now() - agent.spawnTime) / 1000).toFixed(0)}s`,
      tasks: agent.taskCount,
      message: 'Agent terminated'
    });

    return true;
  }

  /**
   * Create agent template based on tier
   */
  private createAgentTemplate(tier: 1 | 2 | 3): AgentTemplate {
    const specializations: Record<number, string[]> = {
      1: ['fast_execution', 'batch_processing', 'io_heavy', 'compute_heavy'],
      2: ['risk_analysis', 'data_validation', 'pattern_matching', 'anomaly_detection'],
      3: ['strategic_planning', 'complex_decomposition', 'cross_domain']
    };

    const specs = specializations[tier];
    const specialization = specs[Math.floor(Math.random() * specs.length)];

    return {
      role: tier === 1 ? 'executor' : tier === 2 ? 'analyst' : 'planner',
      tier,
      specialization,
      baseEmbedding: this.generateBaseEmbedding(tier, specialization),
      capabilities: this.specializationToCapabilities(specialization)
    };
  }

  /**
   * Generate embedding for new agent that integrates with lattice
   */
  private generateSpawnEmbedding(
    template: AgentTemplate, 
    parentId?: string
  ): number[] {
    const base = template.baseEmbedding;

    if (parentId) {
      // Inherit from parent with variation
      const parent = this.spawnedAgents.get(parentId);
      if (parent) {
        const parentEmbedding = parent.template.baseEmbedding;
        // Meet-like inheritance: child is in parent's cone but specialized
        return base.map((val, i) => {
          const inherited = Math.min(val, parentEmbedding[i]);
          const variation = (Math.random() - 0.5) * 0.2;
          return Math.max(0, Math.min(1, inherited + variation));
        });
      }
    }

    // No parent: generate fresh with random variation
    return base.map(v => Math.max(0, Math.min(1, v + (Math.random() - 0.5) * 0.1)));
  }

  /**
   * Find best parent agent for hierarchical spawning
   */
  private findBestParent(tier: 1 | 2 | 3): string | undefined {
    // Look for underutilized agents in higher tier
    const candidates = Array.from(this.spawnedAgents.values())
      .filter(a => a.template.tier > tier) // Parent must be higher tier
      .filter(a => a.taskCount < 10) // Not overloaded
      .sort((a, b) => a.taskCount - b.taskCount); // Least busy first

    return candidates[0]?.agentId;
  }

  /**
   * Generate base embedding for specialization
   */
  private generateBaseEmbedding(tier: number, specialization: string): number[] {
    // Tier-specific base vectors
    const tierVectors: Record<number, number[]> = {
      1: [0.9, 0.1, 0.2, 0.1, 0.3],  // Action-oriented
      2: [0.3, 0.9, 0.7, 0.5, 0.6],  // Analysis-oriented
      3: [0.1, 0.3, 0.9, 0.9, 0.8]   // Strategy-oriented
    };

    // Specialization adjustments
    const specAdjustments: Record<string, number[]> = {
      'fast_execution': [0.1, 0, 0, 0, 0],
      'risk_analysis': [0, 0.1, 0, 0, 0],
      'strategic_planning': [0, 0, 0.1, 0, 0]
    };

    const base = tierVectors[tier] || [0.5, 0.5, 0.5, 0.5, 0.5];
    const adjust = specAdjustments[specialization] || [0, 0, 0, 0, 0];

    return Array.from({ length: 128 }, (_, i) => {
      const baseVal = base[i % base.length] + (adjust[i % adjust.length] || 0);
      const noise = (Math.random() - 0.5) * 0.05;
      return Math.max(0, Math.min(1, baseVal + noise));
    });
  }

  /**
   * Convert specialization to capability list
   */
  private specializationToCapabilities(specialization: string): string[] {
    const capabilityMap: Record<string, string[]> = {
      'fast_execution': ['quick_task', 'high_throughput', 'low_latency'],
      'batch_processing': ['batch_ops', 'queue_management', 'bulk_handling'],
      'risk_analysis': ['risk_scoring', 'anomaly_detect', 'pattern_analysis'],
      'data_validation': ['verify_data', 'consensus_check', 'integrity_proof'],
      'strategic_planning': ['decompose_tasks', 'route_optimization', 'resource_planning']
    };

    return capabilityMap[specialization] || ['general_task'];
  }

  /**
   * Start the scaling monitoring loop
   */
  private startScalingLoop(): void {
    // Evaluate scaling every 5 seconds
    setInterval(async () => {
      const decisions = await this.evaluateScaling();
      
      for (const decision of decisions) {
        if (decision.action === 'spawn') {
          for (let i = 0; i < decision.count; i++) {
            await this.spawnAgent(decision);
          }
        } else if (decision.action === 'terminate') {
          // Find least utilized agent to terminate
          const victim = this.findTerminationCandidate(decision.tier);
          if (victim) {
            await this.terminateAgent(victim);
          }
        }
      }
    }, 5000);

    // Health check every 30 seconds
    setInterval(() => {
      this.logScalingHealth();
    }, 30000);
  }

  /**
   * Find best agent to terminate (least utilized)
   */
  private findTerminationCandidate(tier: 1 | 2 | 3): string | null {
    const candidates = Array.from(this.spawnedAgents.values())
      .filter(a => a.template.tier === tier)
      .sort((a, b) => a.taskCount - b.taskCount);

    // Don't terminate if at minimum
    if (candidates.length <= this.thresholds[`minTier${tier}Agents` as keyof ScalingThresholds]) {
      return null;
    }

    return candidates[0]?.agentId || null;
  }

  private logScalingHealth(): void {
    const stats = this.getScalingStats();
    logger.info('VeraDynamicScaling', {
      ...stats,
      message: 'Scaling health'
    });
  }

  // Public API
  getScalingStats(): any {
    const agents = Array.from(this.spawnedAgents.values());
    
    return {
      totalSpawned: this.totalSpawns,
      totalTerminated: this.totalTerminations,
      activeAgents: agents.length,
      byTier: {
        1: agents.filter(a => a.template.tier === 1).length,
        2: agents.filter(a => a.template.tier === 2).length,
        3: agents.filter(a => a.template.tier === 3).length
      },
      averageLifespan: agents.length > 0 
        ? agents.reduce((sum, a) => sum + (Date.now() - a.spawnTime), 0) / agents.length / 1000
        : 0,
      totalTasksCompleted: agents.reduce((sum, a) => sum + a.taskCount, 0),
      totalEarnings: agents.reduce((sum, a) => sum + a.totalEarnings, 0)
    };
  }

  getAgentLineage(agentId: string): string[] | null {
    const agent = this.spawnedAgents.get(agentId);
    if (!agent) return null;

    const lineage: string[] = [agentId];
    let current = agent;
    
    while (current.parentId) {
      lineage.unshift(current.parentId);
      current = this.spawnedAgents.get(current.parentId)!;
      if (!current) break;
    }

    return lineage;
  }

  getSpawnedAgents(): SpawnedAgent[] {
    return Array.from(this.spawnedAgents.values());
  }
}

// Export singleton
export const veraDynamicScaling = new VeraDynamicScaling();
