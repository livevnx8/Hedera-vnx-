/**
 * Living Lattice - Phase 2: Self-Evolving Flower of Life
 * 
 * Dynamic node spawning, self-healing mechanisms, and adaptive routing
 * that learns from usage patterns to optimize the lattice structure.
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface LivingNode {
  id: string;
  layer: number;
  angle: number; // 0-360 degrees
  radius: number; // Distance from center
  energy: number; // 0-1 vitality
  specialization: string[]; // What this node handles
  connections: string[]; // Connected node IDs
  spawnTime: number;
  lastActive: number;
  demandScore: number; // How much this node is used
  efficiencyScore: number; // Success rate
  decayRate: number; // How fast energy decays
}

export interface LivingLatticeState {
  nodes: Map<string, LivingNode>;
  center: LivingNode;
  layers: LivingLayer[];
  totalEnergy: number;
  averageEfficiency: number;
  growthRate: number;
  lastRebalance: number;
  learningStats: LearningStats;
}

export interface LivingLayer {
  level: number;
  nodeCount: number;
  baseRadius: number;
  nodes: string[]; // Node IDs
  specialization: string;
  demandHistory: number[]; // Last 100 requests
}

export interface LearningStats {
  successfulPaths: Map<string, number>;
  nodePreferences: Map<string, number>;
  commonPatterns: Map<string, number>;
  efficiencyTrend: number[]; // Last 1000 runs
  spawnDecisions: SpawnRecord[];
}

export interface SpawnRecord {
  timestamp: number;
  reason: string;
  layer: number;
  angle: number;
  demandTrigger: number;
  specialization: string[];
}

export interface RebalanceAction {
  type: 'spawn' | 'merge' | 'heal' | 'prune';
  nodeId?: string;
  layer?: number;
  angle?: number;
  reason: string;
  expectedImprovement: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PHI = 1.618033988749895; // Golden ratio
const MAX_LAYERS = 7; // Flower of Life expansion limit
const BASE_NODES_PER_LAYER = [1, 6, 12, 18, 24, 30, 36]; // Expanding pattern
const ENERGY_DECAY_RATE = 0.001; // Per minute
const REBALANCE_INTERVAL = 60000; // 1 minute
const SPAWN_THRESHOLD = 0.8; // Demand score threshold
const PRUNE_THRESHOLD = 0.1; // Energy threshold for pruning
const HEAL_THRESHOLD = 0.3; // Energy threshold for healing

// ─── Living Lattice Engine ──────────────────────────────────────────────────

export class LivingLatticeEngine extends EventEmitter {
  private state: LivingLatticeState;
  private rebalanceTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.state = this.initializeState();
  }

  private initializeState(): LivingLatticeState {
    const center: LivingNode = {
      id: 'center-0',
      layer: 0,
      angle: 0,
      radius: 0,
      energy: 1.0,
      specialization: ['consciousness', 'validation', 'routing'],
      connections: [],
      spawnTime: Date.now(),
      lastActive: Date.now(),
      demandScore: 1.0,
      efficiencyScore: 1.0,
      decayRate: 0,
    };

    const nodes = new Map<string, LivingNode>();
    nodes.set('center-0', center);

    // Initialize base Flower of Life layers
    const layers: LivingLayer[] = [];
    for (let layer = 1; layer <= 3; layer++) {
      const layerNodes = this.spawnLayerNodes(layer, BASE_NODES_PER_LAYER[layer]);
      for (const node of layerNodes) {
        nodes.set(node.id, node);
      }
      
      layers.push({
        level: layer,
        nodeCount: layerNodes.length,
        baseRadius: Math.pow(PHI, layer),
        nodes: layerNodes.map(n => n.id),
        specialization: this.getLayerSpecialization(layer),
        demandHistory: [],
      });
    }

    return {
      nodes,
      center,
      layers,
      totalEnergy: this.calculateTotalEnergy(nodes),
      averageEfficiency: 1.0,
      growthRate: 0,
      lastRebalance: Date.now(),
      learningStats: {
        successfulPaths: new Map(),
        nodePreferences: new Map(),
        commonPatterns: new Map(),
        efficiencyTrend: [],
        spawnDecisions: [],
      },
    };
  }

  private spawnLayerNodes(layer: number, count: number): LivingNode[] {
    const nodes: LivingNode[] = [];
    const radius = Math.pow(PHI, layer);
    const angleStep = 360 / count;

    for (let i = 0; i < count; i++) {
      const angle = i * angleStep;
      const node: LivingNode = {
        id: `layer${layer}-${i}`,
        layer,
        angle,
        radius,
        energy: 0.8 + Math.random() * 0.2, // Start with high energy
        specialization: this.getNodeSpecialization(layer, i, count),
        connections: [],
        spawnTime: Date.now(),
        lastActive: Date.now(),
        demandScore: 0.5,
        efficiencyScore: 0.8,
        decayRate: ENERGY_DECAY_RATE * layer, // Outer layers decay faster
      };
      nodes.push(node);
    }

    return nodes;
  }

  private getLayerSpecialization(layer: number): string {
    const specs = ['consciousness', 'understanding', 'planning', 'execution'];
    return specs[layer] || 'general';
  }

  private getNodeSpecialization(layer: number, index: number, total: number): string[] {
    // Each node gets specialized based on its position
    const specs: string[] = [];
    
    switch (layer) {
      case 1: // Understanding layer
        specs.push('intent_classification');
        if (index % 2 === 0) specs.push('pattern_matching');
        if (index % 3 === 0) specs.push('context_analysis');
        break;
      case 2: // Planning layer
        specs.push('strategy_formation');
        if (index % 2 === 0) specs.push('resource_allocation');
        if (index % 4 === 0) specs.push('risk_assessment');
        break;
      case 3: // Execution layer
        specs.push('code_generation');
        if (index % 3 === 0) specs.push('validation');
        if (index % 4 === 0) specs.push('optimization');
        break;
    }
    
    return specs;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Start rebalancing loop
    this.rebalanceTimer = setInterval(() => {
      this.performRebalance();
    }, REBALANCE_INTERVAL);

    logger.info('LivingLattice', {
      message: 'Living Lattice Phase 2 started',
      initialNodes: this.state.nodes.size,
      layers: this.state.layers.length,
    });

    this.emit('started', { nodeCount: this.state.nodes.size });
  }

  stop(): void {
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }
    this.isRunning = false;
    this.emit('stopped');
  }

  getState(): LivingLatticeState {
    return this.state;
  }

  getNode(nodeId: string): LivingNode | undefined {
    return this.state.nodes.get(nodeId);
  }

  // Record node usage for learning
  recordNodeUsage(nodeId: string, success: boolean): void {
    const node = this.state.nodes.get(nodeId);
    if (!node) return;

    node.lastActive = Date.now();
    node.demandScore = Math.min(1, node.demandScore + 0.01);
    
    if (success) {
      node.efficiencyScore = Math.min(1, node.efficiencyScore + 0.02);
    } else {
      node.efficiencyScore = Math.max(0, node.efficiencyScore - 0.05);
    }

    // Update layer demand history
    const layer = this.state.layers.find(l => l.nodes.includes(nodeId));
    if (layer) {
      layer.demandHistory.push(Date.now());
      if (layer.demandHistory.length > 100) {
        layer.demandHistory.shift();
      }
    }
  }

  // ─── Self-Healing & Growth ─────────────────────────────────────────────────

  private performRebalance(): void {
    const actions: RebalanceAction[] = [];
    const now = Date.now();

    // 1. Check for nodes needing healing
    for (const [nodeId, node] of this.state.nodes) {
      if (nodeId === 'center-0') continue; // Center never decays

      // Apply energy decay
      const minutesInactive = (now - node.lastActive) / 60000;
      node.energy = Math.max(0, node.energy - (node.decayRate * minutesInactive));

      // Heal low-energy nodes
      if (node.energy < HEAL_THRESHOLD && node.demandScore > 0.3) {
        actions.push({
          type: 'heal',
          nodeId,
          reason: `Energy ${node.energy.toFixed(2)} below threshold`,
          expectedImprovement: 0.2,
        });
        node.energy = Math.min(1, node.energy + 0.3); // Heal
      }

      // Prune dead nodes
      if (node.energy < PRUNE_THRESHOLD && node.demandScore < 0.2) {
        actions.push({
          type: 'prune',
          nodeId,
          reason: `Energy depleted (${node.energy.toFixed(2)}), low demand`,
          expectedImprovement: 0.1,
        });
      }
    }

    // 2. Check for spawn opportunities
    for (let layer = 1; layer < this.state.layers.length; layer++) {
      const currentLayer = this.state.layers[layer];
      const avgDemand = this.calculateLayerDemand(layer);

      if (avgDemand > SPAWN_THRESHOLD && currentLayer.nodeCount < BASE_NODES_PER_LAYER[layer] * 2) {
        // High demand - spawn new node
        const newAngle = this.findOptimalSpawnAngle(layer);
        actions.push({
          type: 'spawn',
          layer,
          angle: newAngle,
          reason: `High demand (${avgDemand.toFixed(2)}) on layer ${layer}`,
          expectedImprovement: 0.15,
        });
      }
    }

    // 3. Check for merge opportunities
    for (let layer = 1; layer < this.state.layers.length; layer++) {
      const layerNodes = Array.from(this.state.nodes.values())
        .filter(n => n.layer === layer);

      // Find overlapping specializations
      for (let i = 0; i < layerNodes.length; i++) {
        for (let j = i + 1; j < layerNodes.length; j++) {
          const nodeA = layerNodes[i];
          const nodeB = layerNodes[j];
          
          const overlap = this.calculateSpecializationOverlap(nodeA, nodeB);
          const angleDiff = Math.abs(nodeA.angle - nodeB.angle);
          
          // Merge if high overlap and close together
          if (overlap > 0.7 && angleDiff < 15 && nodeA.demandScore < 0.4 && nodeB.demandScore < 0.4) {
            actions.push({
              type: 'merge',
              nodeId: nodeB.id,
              reason: `High overlap (${overlap.toFixed(2)}) with ${nodeA.id}`,
              expectedImprovement: 0.1,
            });
          }
        }
      }
    }

    // Execute actions
    for (const action of actions) {
      this.executeRebalanceAction(action);
    }

    // Update stats
    this.state.totalEnergy = this.calculateTotalEnergy(this.state.nodes);
    this.state.averageEfficiency = this.calculateAverageEfficiency();
    this.state.lastRebalance = now;

    if (actions.length > 0) {
      logger.info('LivingLattice', {
        message: 'Rebalance complete',
        actions: actions.length,
        spawns: actions.filter(a => a.type === 'spawn').length,
        heals: actions.filter(a => a.type === 'heal').length,
        prunes: actions.filter(a => a.type === 'prune').length,
        merges: actions.filter(a => a.type === 'merge').length,
        totalNodes: this.state.nodes.size,
        totalEnergy: this.state.totalEnergy.toFixed(3),
      });

      this.emit('rebalanced', { actions, state: this.getPublicState() });
    }
  }

  private executeRebalanceAction(action: RebalanceAction): void {
    switch (action.type) {
      case 'spawn':
        if (action.layer !== undefined && action.angle !== undefined) {
          this.spawnNode(action.layer, action.angle, action.reason);
        }
        break;
      case 'prune':
        if (action.nodeId) {
          this.pruneNode(action.nodeId);
        }
        break;
      case 'heal':
        // Healing already applied in check
        break;
      case 'merge':
        if (action.nodeId) {
          this.mergeNode(action.nodeId);
        }
        break;
    }
  }

  private spawnNode(layer: number, angle: number, reason: string): LivingNode {
    const radius = Math.pow(PHI, layer);
    const existingCount = Array.from(this.state.nodes.values())
      .filter(n => n.layer === layer).length;
    
    const node: LivingNode = {
      id: `layer${layer}-${existingCount}`,
      layer,
      angle,
      radius,
      energy: 0.9,
      specialization: this.getNodeSpecialization(layer, existingCount, existingCount + 1),
      connections: [],
      spawnTime: Date.now(),
      lastActive: Date.now(),
      demandScore: 0.5,
      efficiencyScore: 0.8,
      decayRate: ENERGY_DECAY_RATE * layer,
    };

    this.state.nodes.set(node.id, node);
    
    // Update layer
    const layerObj = this.state.layers.find(l => l.level === layer);
    if (layerObj) {
      layerObj.nodes.push(node.id);
      layerObj.nodeCount++;
    }

    // Record spawn decision
    this.state.learningStats.spawnDecisions.push({
      timestamp: Date.now(),
      reason,
      layer,
      angle,
      demandTrigger: this.calculateLayerDemand(layer),
      specialization: node.specialization,
    });

    this.emit('nodeSpawned', node);
    return node;
  }

  private pruneNode(nodeId: string): void {
    const node = this.state.nodes.get(nodeId);
    if (!node) return;

    // Remove from layer
    const layer = this.state.layers.find(l => l.level === node.layer);
    if (layer) {
      layer.nodes = layer.nodes.filter(id => id !== nodeId);
      layer.nodeCount--;
    }

    this.state.nodes.delete(nodeId);
    this.emit('nodePruned', { nodeId, reason: 'Energy depleted' });
  }

  private mergeNode(nodeId: string): void {
    // Transfer energy/demand to nearby nodes, then prune
    const node = this.state.nodes.get(nodeId);
    if (!node) return;

    // Find nearest neighbor
    const neighbors = Array.from(this.state.nodes.values())
      .filter(n => n.layer === node.layer && n.id !== nodeId)
      .sort((a, b) => Math.abs(a.angle - node.angle) - Math.abs(b.angle - node.angle));

    if (neighbors.length > 0) {
      const nearest = neighbors[0];
      nearest.energy = Math.min(1, nearest.energy + node.energy * 0.5);
      nearest.demandScore = Math.min(1, nearest.demandScore + node.demandScore * 0.3);
    }

    this.pruneNode(nodeId);
    this.emit('nodesMerged', { merged: nodeId, into: neighbors[0]?.id });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private calculateLayerDemand(layer: number): number {
    const layerObj = this.state.layers.find(l => l.level === layer);
    if (!layerObj) return 0;

    const nodes = layerObj.nodes
      .map(id => this.state.nodes.get(id))
      .filter(Boolean) as LivingNode[];

    if (nodes.length === 0) return 0;

    const avgDemand = nodes.reduce((sum, n) => sum + n.demandScore, 0) / nodes.length;
    return avgDemand;
  }

  private findOptimalSpawnAngle(layer: number): number {
    const layerNodes = Array.from(this.state.nodes.values())
      .filter(n => n.layer === layer)
      .sort((a, b) => a.angle - b.angle);

    if (layerNodes.length === 0) return 0;

    // Find largest gap
    let maxGap = 0;
    let optimalAngle = 0;

    for (let i = 0; i < layerNodes.length; i++) {
      const current = layerNodes[i];
      const next = layerNodes[(i + 1) % layerNodes.length];
      let gap = next.angle - current.angle;
      if (gap < 0) gap += 360;

      if (gap > maxGap) {
        maxGap = gap;
        optimalAngle = (current.angle + gap / 2) % 360;
      }
    }

    return optimalAngle;
  }

  private calculateSpecializationOverlap(nodeA: LivingNode, nodeB: LivingNode): number {
    const setA = new Set(nodeA.specialization);
    const setB = new Set(nodeB.specialization);
    
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    
    return intersection.size / union.size;
  }

  private calculateTotalEnergy(nodes: Map<string, LivingNode>): number {
    let total = 0;
    for (const node of nodes.values()) {
      total += node.energy;
    }
    return total;
  }

  private calculateAverageEfficiency(): number {
    let total = 0;
    let count = 0;
    for (const node of this.state.nodes.values()) {
      total += node.efficiencyScore;
      count++;
    }
    return count > 0 ? total / count : 0;
  }

  private getPublicState() {
    return {
      nodeCount: this.state.nodes.size,
      totalEnergy: this.state.totalEnergy,
      averageEfficiency: this.state.averageEfficiency,
      layers: this.state.layers.map(l => ({
        level: l.level,
        nodeCount: l.nodeCount,
        specialization: l.specialization,
        avgDemand: this.calculateLayerDemand(l.level),
      })),
    };
  }

  // ─── Advanced Routing ──────────────────────────────────────────────────────

  findOptimalPath(from: string, to: string): string[] {
    // A* pathfinding through living lattice
    const start = this.state.nodes.get(from);
    const goal = this.state.nodes.get(to);
    
    if (!start || !goal) return [];

    const openSet = new Set([from]);
    const closedSet = new Set<string>();
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[from, 0]]);
    const fScore = new Map<string, number>([[from, this.heuristic(from, to)]]);

    while (openSet.size > 0) {
      // Get node with lowest fScore
      let current = Array.from(openSet).reduce((best, nodeId) => {
        return (fScore.get(nodeId) || Infinity) < (fScore.get(best) || Infinity) ? nodeId : best;
      });

      if (current === to) {
        return this.reconstructPath(cameFrom, current);
      }

      openSet.delete(current);
      closedSet.add(current);

      // Get neighbors
      const currentNode = this.state.nodes.get(current);
      if (!currentNode) continue;

      const neighbors = this.getNeighbors(currentNode);

      for (const neighbor of neighbors) {
        if (closedSet.has(neighbor.id)) continue;

        const tentativeGScore = (gScore.get(current) || 0) + this.distance(currentNode, neighbor);

        if (!openSet.has(neighbor.id)) {
          openSet.add(neighbor.id);
        } else if (tentativeGScore >= (gScore.get(neighbor.id) || Infinity)) {
          continue;
        }

        cameFrom.set(neighbor.id, current);
        gScore.set(neighbor.id, tentativeGScore);
        fScore.set(neighbor.id, tentativeGScore + this.heuristic(neighbor.id, to));
      }
    }

    return []; // No path found
  }

  private heuristic(nodeId: string, goalId: string): number {
    const node = this.state.nodes.get(nodeId);
    const goal = this.state.nodes.get(goalId);
    if (!node || !goal) return Infinity;

    // Consider energy and efficiency
    const energyFactor = 1 - node.energy;
    const efficiencyFactor = 1 - node.efficiencyScore;
    const distance = this.distance(node, goal);

    return distance * (1 + energyFactor * 0.5 + efficiencyFactor * 0.3);
  }

  private distance(a: LivingNode, b: LivingNode): number {
    // Euclidean distance in polar coordinates
    const angleDiff = Math.abs(a.angle - b.angle) * Math.PI / 180;
    const r1 = a.radius;
    const r2 = b.radius;
    return Math.sqrt(r1 * r1 + r2 * r2 - 2 * r1 * r2 * Math.cos(angleDiff));
  }

  private getNeighbors(node: LivingNode): LivingNode[] {
    // Get nodes in same layer and adjacent layers
    const neighbors: LivingNode[] = [];
    
    // Same layer neighbors (within 60 degrees)
    for (const [id, other] of this.state.nodes) {
      if (id === node.id) continue;
      
      if (other.layer === node.layer) {
        const angleDiff = Math.abs(node.angle - other.angle);
        if (angleDiff <= 60 || angleDiff >= 300) {
          neighbors.push(other);
        }
      } else if (Math.abs(other.layer - node.layer) === 1) {
        // Adjacent layer connection
        const angleDiff = Math.abs(node.angle - other.angle);
        if (angleDiff <= 30 || angleDiff >= 330) {
          neighbors.push(other);
        }
      }
    }

    // Always connect to center from layer 1
    if (node.layer === 1) {
      neighbors.push(this.state.center);
    }

    return neighbors;
  }

  private reconstructPath(cameFrom: Map<string, string>, current: string): string[] {
    const path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      path.unshift(current);
    }
    return path;
  }
}

// Singleton export
export const livingLattice = new LivingLatticeEngine();
