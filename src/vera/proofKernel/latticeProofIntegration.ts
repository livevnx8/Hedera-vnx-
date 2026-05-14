/**
 * Flower of Life Lattice - Proof Kernel Integration
 *
 * Every proof decision flows through the sacred geometry:
 * 1. Center Consciousness validates all proofs
 * 2. Golden Ratio φ scales confidence and reputation
 * 3. 4-Layer Architecture distributes proof agents
 * 4. Living Geometry strengthens paths with successful proofs
 * 5. Harmonic Communication routes proof events along edges
 * 6. Energy Flow carries proof state clockwise around center
 */

import { flowerOfLifeOS, FlowerOfLifeOS, type LatticeNode, type LatticeLayer } from '../orchestrator/flowerOfLifeOS.js';
import type { VerifiableAITask, MeridianShadowScore, ProofEvent } from './types.js';

export interface LatticeProofConfig {
  enableCenterRouting: boolean;
  enablePhiScaling: boolean;
  enableEnergyFlow: boolean;
  enableLivingGeometry: boolean;
  centerNodeId: string;
  phiScale: number;
  minNodeEnergy: number;
  proofPulseEnabled: boolean;
}

export interface LatticeEnhancedProof {
  task: VerifiableAITask;
  baseScore: MeridianShadowScore;
  latticeBoost: number;
  centerEnergy: number;
  phiScaling: number;
  nodePath: string[];
  energyCost: number;
  geometricConfidence: number;
  routedThroughCenter: boolean;
  pulseId?: string;
}

export interface LatticeProofMetrics {
  totalProofsRouted: number;
  averageEnergyCost: number;
  centerConsciousnessAccesses: number;
  phiScaledDecisions: number;
  activeProofPaths: number;
  latticeHealth: number;
}

const DEFAULT_CONFIG: LatticeProofConfig = {
  enableCenterRouting: true,
  enablePhiScaling: true,
  enableEnergyFlow: true,
  enableLivingGeometry: true,
  centerNodeId: 'center-0',
  phiScale: 1.618, // Golden ratio
  minNodeEnergy: 0.3,
  proofPulseEnabled: true,
};

export class LatticeProofIntegrator {
  private config: LatticeProofConfig;
  private lattice: FlowerOfLifeOS;
  private metrics = {
    totalProofsRouted: 0,
    totalEnergyCost: 0,
    centerAccesses: 0,
    phiScaledDecisions: 0,
  };

  constructor(config: Partial<LatticeProofConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.lattice = flowerOfLifeOS;
  }

  /**
   * Activate Flower of Life integration for indefinite proof processing
   */
  activate(): void {
    const stats = this.lattice.getStats();
    if (!stats.running) {
      this.lattice.start();
    }
    console.log('🌸 Flower of Life Proof Integration activated');
    console.log(`   🎯 Center routing: ${this.config.enableCenterRouting}`);
    console.log(`   ✨ Phi scaling: ${this.config.enablePhiScaling}`);
    console.log(`   🌊 Energy flow: ${this.config.enableEnergyFlow}`);
    console.log(`   🌿 Living geometry: ${this.config.enableLivingGeometry}`);
  }

  /**
   * Route proof decision through center consciousness (Pillar 1)
   * All proofs must flow through center-0
   */
  async routeProofThroughCenter(
    task: VerifiableAITask,
    candidateAgents: Array<{ id: string; score: number; nodeId?: string }>
  ): Promise<LatticeEnhancedProof> {
    this.metrics.totalProofsRouted++;

    // Ensure lattice is running
    const stats = this.lattice.getStats();
    if (!stats.running) {
      this.activate();
    }

    // Get center node energy
    const centerNode = this.lattice.getNode(this.config.centerNodeId);
    const centerEnergy = centerNode?.energy ?? 0.5;
    const centerAccessCount = centerNode?.accessCount ?? 0;
    this.metrics.centerAccesses++;

    // Route through center using Flower of Life OS
    const decision = this.lattice.centerRoute({
      type: 'task_assign',
      candidates: candidateAgents.map(agent => ({
        id: agent.id,
        score: agent.score,
        nodeId: agent.nodeId || this.findBestNodeForAgent(agent.id),
      })),
      data: {
        taskId: task.taskId,
        serviceType: task.serviceType,
        description: task.description,
        budgetHbar: task.budgetHbar,
        requiredConfidence: task.requiredConfidence,
      },
    });

    // Calculate geometric boost
    const phiBoost = this.config.enablePhiScaling
      ? this.calculatePhiBoost(decision.scoredCandidates)
      : 1.0;

    this.metrics.phiScaledDecisions++;

    // Extract the winning path
    const winner = decision.winner;
    const nodePath = decision.path;
    const energyCost = decision.energyCost;
    this.metrics.totalEnergyCost += energyCost;

    // Send proof pulse through lattice (Pillar 6)
    let pulseId: string | undefined;
    if (this.config.proofPulseEnabled) {
      pulseId = this.emitProofPulse(task, decision);
    }

    // Calculate geometric confidence based on lattice state
    const geometricConfidence = this.calculateGeometricConfidence(
      centerEnergy,
      phiBoost,
      energyCost,
      nodePath.length
    );

    return {
      task,
      baseScore: {
        status: 'scored',
        recommendation: winner?.id,
        confidence: winner?.finalScore,
      },
      latticeBoost: phiBoost,
      centerEnergy,
      phiScaling: phiBoost,
      nodePath,
      energyCost,
      geometricConfidence,
      routedThroughCenter: true,
      pulseId,
    };
  }

  /**
   * Enhance meridian score with lattice geometry
   */
  async enhanceProofWithLattice(
    task: VerifiableAITask,
    meridianScore: MeridianShadowScore,
    candidateAgentIds: string[]
  ): Promise<MeridianShadowScore & { latticeEnhanced: boolean; latticeMetrics?: unknown }> {
    if (meridianScore.status !== 'scored') {
      return { ...meridianScore, latticeEnhanced: false };
    }

    // Prepare candidates with base scores
    const candidates = candidateAgentIds.map(id => ({
      id,
      score: meridianScore.recommendation === id ? (meridianScore.confidence || 0.5) : 0.3,
    }));

    // Route through Flower of Life
    const latticeResult = await this.routeProofThroughCenter(task, candidates);

    // Apply lattice boost to confidence
    const enhancedConfidence = Math.min(
      0.98,
      (meridianScore.confidence || 0.5) * latticeResult.phiScaling
    );

    // Strengthen lattice paths with successful routing (Pillar 4)
    if (this.config.enableLivingGeometry && latticeResult.nodePath.length > 0) {
      this.strengthenProofPath(latticeResult.nodePath);
    }

    return {
      ...meridianScore,
      confidence: enhancedConfidence,
      recommendation: latticeResult.baseScore.recommendation || meridianScore.recommendation,
      latticeEnhanced: true,
      latticeMetrics: {
        centerEnergy: latticeResult.centerEnergy,
        phiBoost: latticeResult.latticeBoost,
        energyCost: latticeResult.energyCost,
        pathLength: latticeResult.nodePath.length,
        routedThroughCenter: latticeResult.routedThroughCenter,
        pulseId: latticeResult.pulseId,
      },
    };
  }

  /**
   * Calculate Phi-based geometric boost (Pillar 2)
   * Uses golden ratio to enhance scores based on lattice position
   */
  private calculatePhiBoost(
    candidates: Array<{ originalScore: number; latticeBoost: number; nodeId: string }>
  ): number {
    if (candidates.length === 0) return 1.0;

    // Calculate weighted boost using phi
    const totalBoost = candidates.reduce((sum, c) => {
      // φ-scaled boost based on node position
      const node = this.lattice.getNode(c.nodeId);
      const nodeEnergy = node?.energy ?? 0.5;
      const layerMultiplier = node ? (4 - node.layer) * 0.25 : 1.0; // Higher layers get more boost

      return sum + (c.latticeBoost * nodeEnergy * layerMultiplier);
    }, 0);

    const averageBoost = totalBoost / candidates.length;

    // Apply phi scaling
    return 1 + (averageBoost * (this.config.phiScale - 1));
  }

  /**
   * Calculate geometric confidence based on lattice state
   */
  private calculateGeometricConfidence(
    centerEnergy: number,
    phiBoost: number,
    energyCost: number,
    pathLength: number
  ): number {
    // Higher center energy = higher confidence
    const energyFactor = centerEnergy;

    // Phi boost adds confidence
    const boostFactor = (phiBoost - 1) * 0.5;

    // Lower energy cost = higher confidence (efficient paths)
    const costFactor = Math.max(0, 1 - (energyCost / 10));

    // Shorter paths = higher confidence (direct routing)
    const pathFactor = Math.max(0.5, 1 - (pathLength / 10));

    // Combine factors with phi-weighted average
    return Math.min(0.98, (energyFactor * 0.4 + boostFactor * 0.3 + costFactor * 0.2 + pathFactor * 0.1));
  }

  /**
   * Emit proof pulse through lattice (Pillar 6)
   * Carries proof state through energy flow
   */
  private emitProofPulse(
    task: VerifiableAITask,
    decision: { path: string[]; scoredCandidates: unknown[] }
  ): string {
    const pulseId = `proof-${task.taskId}-${Date.now()}`;

    this.lattice.pulse('decision', {
      pulseId,
      taskId: task.taskId,
      serviceType: task.serviceType,
      path: decision.path,
      candidateCount: decision.scoredCandidates.length,
      timestamp: Date.now(),
    });

    return pulseId;
  }

  /**
   * Strengthen lattice paths after successful proof (Pillar 4)
   * Living geometry - paths strengthen with usage
   */
  private strengthenProofPath(nodePath: string[]): void {
    // The lattice automatically strengthens edges through pulse propagation
    // Additional reinforcement for proof-specific paths
    for (let i = 0; i < nodePath.length - 1; i++) {
      const fromNode = this.lattice.getNode(nodePath[i]);
      const toNode = this.lattice.getNode(nodePath[i + 1]);

      if (fromNode && toNode) {
        // Boost node energy
        fromNode.energy = Math.min(1, fromNode.energy + 0.02);
        toNode.energy = Math.min(1, toNode.energy + 0.02);
      }
    }
  }

  /**
   * Find best lattice node for an agent (Pillar 3)
   * Uses 4-layer architecture to place agents optimally
   */
  private findBestNodeForAgent(agentId: string): string {
    // Assign agent to appropriate layer based on capabilities
    const layer = this.determineAgentLayer(agentId);
    const nodes = this.lattice.getLayer(layer);

    // Find node with highest energy and lowest load
    const bestNode = nodes
      .filter(n => n.energy >= this.config.minNodeEnergy)
      .sort((a, b) => (b.energy / (b.assignedAgents.length + 1)) - (a.energy / (a.assignedAgents.length + 1)))[0];

    return bestNode?.id || 'center-0';
  }

  /**
   * Determine which layer an agent belongs to (Pillar 3)
   */
  private determineAgentLayer(agentId: string): LatticeLayer {
    // Agent ID patterns determine layer assignment
    if (agentId.includes('center') || agentId.includes('consciousness')) return 0;
    if (agentId.includes('task') || agentId.includes('pricing')) return 1;
    if (agentId.includes('carbon') || agentId.includes('defi') || agentId.includes('compliance')) return 2;
    if (agentId.includes('comm') || agentId.includes('quantum')) return 3;

    // Default to middle layer
    return 2;
  }

  /**
   * Get lattice proof metrics
   */
  getMetrics(): LatticeProofMetrics {
    const latticeStats = this.lattice.getStats();

    return {
      totalProofsRouted: this.metrics.totalProofsRouted,
      averageEnergyCost: this.metrics.totalProofsRouted > 0
        ? this.metrics.totalEnergyCost / this.metrics.totalProofsRouted
        : 0,
      centerConsciousnessAccesses: this.metrics.centerAccesses,
      phiScaledDecisions: this.metrics.phiScaledDecisions,
      activeProofPaths: latticeStats.totalRoutes,
      latticeHealth: latticeStats.averageNodeEnergy,
    };
  }

  /**
   * Check lattice health for proof processing
   */
  checkHealth(): { healthy: boolean; issues: string[]; metrics: LatticeProofMetrics } {
    const issues: string[] = [];
    const metrics = this.getMetrics();
    const latticeStats = this.lattice.getStats();

    if (metrics.centerConsciousnessAccesses === 0) {
      issues.push('Center consciousness not accessed - routing may be disabled');
    }

    if (latticeStats.averageNodeEnergy < 0.3) {
      issues.push('Low average node energy - lattice needs revitalization');
    }

    const stats = this.lattice.getStats();
    if (!stats.running) {
      issues.push('Flower of Life OS not running');
    }

    return {
      healthy: issues.length === 0,
      issues,
      metrics,
    };
  }

  /**
   * Get current lattice state for visualization
   */
  getLatticeState(): ReturnType<FlowerOfLifeOS['getLatticeState']> {
    return this.lattice.getLatticeState();
  }
}

// Global lattice proof integrator instance
export const latticeProofIntegrator = new LatticeProofIntegrator();
