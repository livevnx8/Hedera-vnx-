/**
 * Enhanced Swarm Navigator
 * Advanced lattice navigation and agent coordination for Vera
 * 
 * Improvements:
 * - Multi-criteria pathfinding (energy, load, latency)
 * - Predictive agent selection
 * - Dynamic load balancing
 * - Smart task batching
 * - Route pre-computation and caching
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { flowerOfLifeOS, LatticeNode, LatticeEdge } from './flowerOfLifeOS.js';
import { hierarchicalCoordinator } from './hierarchicalCoordinator.js';

export interface PathCriteria {
  minimizeEnergy?: boolean;      // Prefer high-energy paths
  minimizeHops?: boolean;        // Fewest jumps
  minimizeLoad?: boolean;        // Avoid congested nodes
  maximizeSpeed?: boolean;       // Fastest execution
}

export interface AgentScore {
  agentId: string;
  nodeId: string;
  layer: number;
  energy: number;
  currentLoad: number;
  historicalSuccess: number;
  latency: number;
  compositeScore: number;
}

export interface RouteCache {
  from: string;
  to: string;
  criteria: string;
  path: string[];
  edges: string[];
  energyCost: number;
  timestamp: number;
  hitCount: number;
}

export interface TaskBatch {
  tasks: string[];
  optimalAgent: string;
  estimatedCompletion: number;
  energyEfficiency: number;
}

export class SwarmNavigator extends EventEmitter {
  private routeCache = new Map<string, RouteCache>();
  private cacheMaxSize = 100;
  private cacheTTL = 30000; // 30 seconds
  private agentPerformance = new Map<string, {
    tasksCompleted: number;
    tasksFailed: number;
    avgLatency: number;
    lastTask: number;
  }>();
  
  // Load tracking for predictive balancing
  private loadHistory = new Map<string, number[]>();
  private predictionWindow = 10;

  constructor() {
    super();
  }

  /**
   * Find optimal path with multi-criteria optimization
   */
  findOptimalPath(
    sourceId: string,
    targetId: string,
    criteria: PathCriteria = {}
  ): { path: string[]; edges: string[]; score: number } {
    const cacheKey = `${sourceId}:${targetId}:${JSON.stringify(criteria)}`;
    const cached = this.getCachedRoute(cacheKey);
    if (cached) {
      return { path: cached.path, edges: cached.edges, score: 1 / cached.energyCost };
    }

    const source = flowerOfLifeOS.getNode(sourceId);
    const target = flowerOfLifeOS.getNode(targetId);
    if (!source || !target) {
      return { path: [], edges: [], score: 0 };
    }

    // Multi-objective A*
    const openSet = new Set<string>([sourceId]);
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();
    const pathScores = new Map<string, {
      energy: number;
      load: number;
      speed: number;
      hops: number;
    }>();

    gScore.set(sourceId, 0);
    fScore.set(sourceId, this.advancedHeuristic(sourceId, targetId, criteria));
    pathScores.set(sourceId, { energy: 0, load: 0, speed: 0, hops: 0 });

    while (openSet.size > 0) {
      // Get node with best composite score
      let current: string | null = null;
      let bestF = Infinity;
      for (const nodeId of openSet) {
        const f = fScore.get(nodeId) ?? Infinity;
        if (f < bestF) { bestF = f; current = nodeId; }
      }

      if (current === null) break;
      if (current === targetId) {
        const path = this.reconstructPath(cameFrom, current);
        const edges = this.pathToEdges(path);
        const score = this.computePathScore(path, criteria);
        
        this.cacheRoute(cacheKey, path, edges, 1 / score);
        return { path, edges, score };
      }

      openSet.delete(current);
      const currentNode = flowerOfLifeOS.getNode(current)!;
      const currentScores = pathScores.get(current)!;

      for (const neighborId of currentNode.connections) {
        const edge = this.getEdge(current, neighborId);
        if (!edge) continue;

        const neighborNode = flowerOfLifeOS.getNode(neighborId)!;
        
        // Multi-criteria edge cost
        const edgeCost = this.computeEdgeCost(
          edge,
          neighborNode,
          criteria,
          currentScores
        );

        const tentativeG = (gScore.get(current) ?? Infinity) + edgeCost;

        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, current);
          gScore.set(neighborId, tentativeG);
          fScore.set(neighborId, tentativeG + this.advancedHeuristic(neighborId, targetId, criteria));
          
          // Track path characteristics
          pathScores.set(neighborId, {
            energy: currentScores.energy + (1 - neighborNode.energy),
            load: currentScores.load + this.predictLoad(neighborId),
            speed: currentScores.speed + (1 / (edge.strength + 0.1)),
            hops: currentScores.hops + 1,
          });
          
          openSet.add(neighborId);
        }
      }
    }

    return { path: [], edges: [], score: 0 };
  }

  /**
   * Score and rank agents for a task with predictive load balancing
   */
  scoreAgentsForTask(
    taskType: string,
    taskComplexity: number,
    requiredSkills: string[] = []
  ): AgentScore[] {
    const scores: AgentScore[] = [];
    const allNodes = flowerOfLifeOS.getLatticeState().nodes;

    for (const node of allNodes) {
      for (const agentId of node.assignedAgents) {
        const perf = this.agentPerformance.get(agentId) || {
          tasksCompleted: 0,
          tasksFailed: 0,
          avgLatency: 100,
          lastTask: 0,
        };

        // Predict future load
        const predictedLoad = this.predictLoad(node.id);
        
        // Calculate composite score (higher is better)
        const successRate = perf.tasksCompleted / 
          (perf.tasksCompleted + perf.tasksFailed + 1);
        
        const recencyBonus = Math.max(0, 1 - (Date.now() - perf.lastTask) / 60000);
        
        const layerBonus = this.getLayerBonus(taskType, node.layer);
        
        const compositeScore = (
          node.energy * 0.25 +
          (1 - predictedLoad) * 0.25 +
          successRate * 0.20 +
          (1 / (1 + perf.avgLatency / 1000)) * 0.15 +
          recencyBonus * 0.10 +
          layerBonus * 0.05
        );

        scores.push({
          agentId,
          nodeId: node.id,
          layer: node.layer,
          energy: node.energy,
          currentLoad: predictedLoad,
          historicalSuccess: successRate,
          latency: perf.avgLatency,
          compositeScore,
        });
      }
    }

    return scores.sort((a, b) => b.compositeScore - a.compositeScore);
  }

  /**
   * Select best agent with optional fallback chain
   */
  selectOptimalAgent(
    taskType: string,
    taskComplexity: number,
    excludeAgents: string[] = [],
    fallbackCount = 2
  ): { primary: AgentScore | null; fallbacks: AgentScore[] } {
    const scores = this.scoreAgentsForTask(taskType, taskComplexity);
    
    const available = scores.filter(s => !excludeAgents.includes(s.agentId));
    
    return {
      primary: available[0] || null,
      fallbacks: available.slice(1, 1 + fallbackCount),
    };
  }

  /**
   * Batch tasks for efficient routing
   */
  batchTasks(tasks: Array<{ id: string; type: string; complexity: number }>): TaskBatch[] {
    const batches: TaskBatch[] = [];
    const unassigned = [...tasks];

    while (unassigned.length > 0) {
      // Group by type and complexity
      const task = unassigned[0];
      const similar = unassigned.filter(t => 
        t.type === task.type && 
        Math.abs(t.complexity - task.complexity) < 0.3
      );

      if (similar.length >= 3) {
        // Find optimal agent for batch
        const selection = this.selectOptimalAgent(task.type, task.complexity);
        if (selection.primary) {
          batches.push({
            tasks: similar.map(t => t.id),
            optimalAgent: selection.primary.agentId,
            estimatedCompletion: this.estimateBatchCompletion(similar, selection.primary),
            energyEfficiency: this.calculateBatchEfficiency(similar, selection.primary),
          });
          
          // Remove batched tasks
          for (const t of similar) {
            const idx = unassigned.indexOf(t);
            if (idx > -1) unassigned.splice(idx, 1);
          }
        } else {
          unassigned.shift();
        }
      } else {
        unassigned.shift();
      }
    }

    return batches;
  }

  /**
   * Navigate swarm to handle workload spike
   */
  async navigateWorkloadSpike(
    targetLayer: number,
    taskCount: number
  ): Promise<{ reassignments: Array<{ from: string; to: string }>; newRoutes: string[] }> {
    const reassignments: Array<{ from: string; to: string }> = [];
    const newRoutes: string[] = [];

    // Get underutilized agents from other layers
    const sourceLayer = targetLayer === 1 ? 2 : targetLayer === 2 ? 3 : 1;
    const sourceNodes = flowerOfLifeOS.getLayer(sourceLayer as 0 | 1 | 2 | 3)
      .filter(n => n.assignedAgents.length > 0)
      .sort((a, b) => b.energy - a.energy);

    const targetNodes = flowerOfLifeOS.getLayer(targetLayer as 0 | 1 | 2 | 3)
      .filter(n => n.assignedAgents.length < 3)
      .sort((a, b) => a.assignedAgents.length - b.assignedAgents.length);

    let tasksToRedirect = Math.min(taskCount, sourceNodes.length * 2);

    for (const sourceNode of sourceNodes) {
      if (tasksToRedirect <= 0) break;
      
      for (const agentId of [...sourceNode.assignedAgents]) {
        if (tasksToRedirect <= 0) break;

        const targetNode = targetNodes.find(n => n.assignedAgents.length < 3);
        if (!targetNode) break;

        // Find optimal path for reassignment
        const route = this.findOptimalPath(
          sourceNode.id,
          targetNode.id,
          { minimizeEnergy: true, minimizeHops: true }
        );

        if (route.path.length > 0) {
          reassignments.push({ from: sourceNode.id, to: targetNode.id });
          newRoutes.push(...route.path);
          
          // Update assignments
          sourceNode.assignedAgents = sourceNode.assignedAgents.filter(id => id !== agentId);
          targetNode.assignedAgents.push(agentId);
          
          // Reinforce the new path
          flowerOfLifeOS.reinforcePath(route.path);
          
          tasksToRedirect--;
        }
      }
    }

    this.emit('workload_navigated', {
      targetLayer,
      reassignments: reassignments.length,
      routes: newRoutes.length,
    });

    return { reassignments, newRoutes };
  }

  /**
   * Pre-compute common routes for faster routing
   */
  precomputeRoutes(): void {
    const nodes = flowerOfLifeOS.getLatticeState().nodes;
    const centerId = 'center-0';

    // Pre-compute paths from center to all nodes
    for (const node of nodes) {
      if (node.id === centerId) continue;
      
      const route = this.findOptimalPath(centerId, node.id, { minimizeHops: true });
      if (route.path.length > 0) {
        this.cacheRoute(`center:${node.id}:hop`, route.path, route.edges, 1 / route.score);
      }

      const energyRoute = this.findOptimalPath(centerId, node.id, { minimizeEnergy: true });
      if (energyRoute.path.length > 0) {
        this.cacheRoute(`center:${node.id}:energy`, energyRoute.path, energyRoute.edges, 1 / energyRoute.score);
      }
    }

    logger.info('SwarmNavigator', {
      message: 'Pre-computed routes',
      cacheSize: this.routeCache.size,
    });
  }

  /**
   * Update agent performance metrics
   */
  recordTaskCompletion(
    agentId: string,
    success: boolean,
    latencyMs: number
  ): void {
    const perf = this.agentPerformance.get(agentId) || {
      tasksCompleted: 0,
      tasksFailed: 0,
      avgLatency: 100,
      lastTask: 0,
    };

    if (success) {
      perf.tasksCompleted++;
    } else {
      perf.tasksFailed++;
    }

    // Exponential moving average for latency
    perf.avgLatency = perf.avgLatency * 0.7 + latencyMs * 0.3;
    perf.lastTask = Date.now();

    this.agentPerformance.set(agentId, perf);
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private computeEdgeCost(
    edge: LatticeEdge,
    neighborNode: LatticeNode,
    criteria: PathCriteria,
    currentScores: { energy: number; load: number; speed: number; hops: number }
  ): number {
    let cost = 1;

    if (criteria.minimizeEnergy) {
      cost += (1 - neighborNode.energy) * 2;
    }
    if (criteria.minimizeLoad) {
      cost += this.predictLoad(neighborNode.id) * 1.5;
    }
    if (criteria.maximizeSpeed) {
      cost += (1 / (edge.strength + 0.1)) * 0.5;
    }
    if (criteria.minimizeHops) {
      cost += 0.1; // Small bias toward fewer hops
    }

    return cost;
  }

  private advancedHeuristic(nodeId: string, goalId: string, criteria: PathCriteria): number {
    const node = flowerOfLifeOS.getNode(nodeId);
    const goal = flowerOfLifeOS.getNode(goalId);
    if (!node || !goal) return Infinity;

    // Lattice distance
    const layerDist = Math.abs(node.layer - goal.layer);
    
    // Angular distance (normalized to 60° segments)
    let angleDist = Math.abs(node.angle - goal.angle);
    angleDist = Math.min(angleDist, 2 * Math.PI - angleDist);
    const normalizedAngle = angleDist / (Math.PI / 3);

    let heuristic = layerDist + normalizedAngle;

    // Adjust for criteria
    if (criteria.minimizeEnergy) {
      heuristic += (1 - node.energy) * 0.5;
    }
    if (criteria.minimizeLoad) {
      heuristic += this.predictLoad(nodeId) * 0.3;
    }

    return heuristic;
  }

  private predictLoad(nodeId: string): number {
    const history = this.loadHistory.get(nodeId);
    if (!history || history.length < 3) return 0.5;

    // Simple moving average prediction
    const recent = history.slice(-this.predictionWindow);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const trend = recent[recent.length - 1] - recent[0];
    
    return Math.min(1, Math.max(0, avg + trend * 0.3));
  }

  private getLayerBonus(taskType: string, layer: number): number {
    const mapping: Record<string, number> = {
      'orchestration': 0,
      'admin': 0,
      'task': 1,
      'scheduling': 1,
      'pricing': 1,
      'carbon': 2,
      'defi': 2,
      'compliance': 2,
      'validation': 2,
      'communication': 3,
      'gossip': 3,
      'beacon': 3,
    };

    const preferred = mapping[taskType.toLowerCase()] ?? 3;
    return 1 - Math.abs(layer - preferred) * 0.2;
  }

  private getCachedRoute(key: string): RouteCache | null {
    const cached = this.routeCache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.routeCache.delete(key);
      return null;
    }

    cached.hitCount++;
    return cached;
  }

  private cacheRoute(
    key: string,
    path: string[],
    edges: string[],
    energyCost: number
  ): void {
    if (this.routeCache.size >= this.cacheMaxSize) {
      // Evict least used
      let minHits = Infinity;
      let evictKey = '';
      for (const [k, v] of this.routeCache) {
        if (v.hitCount < minHits) {
          minHits = v.hitCount;
          evictKey = k;
        }
      }
      if (evictKey) this.routeCache.delete(evictKey);
    }

    this.routeCache.set(key, {
      from: path[0],
      to: path[path.length - 1],
      criteria: key,
      path,
      edges,
      energyCost,
      timestamp: Date.now(),
      hitCount: 1,
    });
  }

  private reconstructPath(cameFrom: Map<string, string>, current: string): string[] {
    const path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      path.unshift(current);
    }
    return path;
  }

  private pathToEdges(path: string[]): string[] {
    const edges: string[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const edgeId = `${path[i]}:${path[i + 1]}`;
      edges.push(edgeId);
    }
    return edges;
  }

  private computePathScore(path: string[], criteria: PathCriteria): number {
    let score = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const node = flowerOfLifeOS.getNode(path[i + 1]);
      const edge = this.getEdge(path[i], path[i + 1]);
      if (!node || !edge) continue;

      if (criteria.minimizeEnergy) score += node.energy;
      if (criteria.maximizeSpeed) score += edge.strength;
      if (criteria.minimizeHops) score += 1 / path.length;
    }
    return score;
  }

  private getEdge(from: string, to: string): LatticeEdge | undefined {
    const edgeId = `${from}:${to}`;
    return flowerOfLifeOS.getEdge(edgeId);
  }

  private estimateBatchCompletion(tasks: Array<{ complexity: number }>, agent: AgentScore): number {
    const totalComplexity = tasks.reduce((s, t) => s + t.complexity, 0);
    const efficiency = agent.energy * (1 - agent.currentLoad);
    return (totalComplexity * 1000) / (efficiency + 0.1);
  }

  private calculateBatchEfficiency(tasks: Array<{ complexity: number }>, agent: AgentScore): number {
    const totalComplexity = tasks.reduce((s, t) => s + t.complexity, 0);
    const energyCost = tasks.length * (1 - agent.energy) * 0.1;
    return (1 - energyCost) * (1 - agent.currentLoad);
  }

  /**
   * Record load for prediction
   */
  recordLoad(nodeId: string, load: number): void {
    const history = this.loadHistory.get(nodeId) || [];
    history.push(load);
    if (history.length > this.predictionWindow * 2) {
      history.shift();
    }
    this.loadHistory.set(nodeId, history);
  }

  /**
   * Get navigator stats
   */
  getStats(): {
    cacheSize: number;
    cacheHitRate: number;
    agentCount: number;
    avgPathScore: number;
  } {
    const cacheEntries = Array.from(this.routeCache.values());
    const totalHits = cacheEntries.reduce((s, e) => s + e.hitCount, 0);
    
    return {
      cacheSize: this.routeCache.size,
      cacheHitRate: totalHits > 0 ? totalHits / (totalHits + this.routeCache.size) : 0,
      agentCount: this.agentPerformance.size,
      avgPathScore: 0.85, // Placeholder
    };
  }
}

// Singleton
export const swarmNavigator = new SwarmNavigator();
export default swarmNavigator;
