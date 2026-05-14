/**
 * Sacred Geometry Swarm Navigator
 *
 * Uses Flower of Life intersections and vesica piscis crossing points
 * as navigation nodes for the Vera swarm. Each crossing becomes a
 * coordination hub where agents can rendezvous, exchange state, and
 * navigate between shards.
 *
 * Key concepts:
 * - Each vesica piscis intersection = swarm rendezvous point
 * - Flower of Life nodes = navigation waypoints
 * - Sacred geometry paths = optimal swarm routes
 * - Crossing density = coordination frequency
 */

import { logger } from '../../monitoring/logger.js';
import { flowerOfLifeGenerator, FlowerOfLifeGeometry } from './flowerOfLife.js';

export interface SwarmNode {
  id: string;
  x: number;
  y: number;
  z: number;
  type: 'center' | 'vesica' | 'flower' | 'hub';
  connections: string[];
  capacity: number;
  currentAgents: string[];
  shardAssignment?: number;
}

export interface SwarmRoute {
  nodes: string[];
  distance: number;
  hops: number;
  efficiency: number; // 0-1 based on straightness vs lattice path
  geometry: 'direct' | 'lattice' | 'hybrid';
}

export interface SwarmNavigationConfig {
  petals?: number;
  useVesicaIntersections?: boolean;
  hubCapacity?: number;
  preferLatticePaths?: boolean;
}

export class SacredGeometrySwarmNavigator {
  private nodes: Map<string, SwarmNode> = new Map();
  private geometry: FlowerOfLifeGeometry | null = null;
  private config: SwarmNavigationConfig;

  constructor(config: SwarmNavigationConfig = {}) {
    this.config = {
      petals: 3,
      useVesicaIntersections: true,
      hubCapacity: 10,
      preferLatticePaths: true,
      ...config,
    };
  }

  /**
   * Initialize navigation network from sacred geometry
   */
  initialize(): void {
    this.geometry = flowerOfLifeGenerator.generate({
      petals: this.config.petals,
      includeIntersections: this.config.useVesicaIntersections,
    });

    // Create nodes from circle centers
    for (const circle of this.geometry.circles) {
      const nodeId = `flower-${circle.ring}-${circle.index}`;
      this.nodes.set(nodeId, {
        id: nodeId,
        x: circle.cx,
        y: circle.cy,
        z: 0,
        type: circle.ring === 0 ? 'center' : 'flower',
        connections: [],
        capacity: this.config.hubCapacity!,
        currentAgents: [],
      });
    }

    // Create nodes from vesica piscis intersections (the crossings)
    if (this.config.useVesicaIntersections) {
      for (let i = 0; i < this.geometry.intersections.length; i++) {
        const intersection = this.geometry.intersections[i];
        const nodeId = `vesica-${i}`;
        this.nodes.set(nodeId, {
          id: nodeId,
          x: intersection.x,
          y: intersection.y,
          z: 0,
          type: 'vesica',
          connections: intersection.circles.map((c) => `flower-${c}`),
          capacity: Math.floor(this.config.hubCapacity! * 1.5), // Vesica hubs have more capacity
          currentAgents: [],
        });
      }
    }

    // Build connection graph
    this.buildConnections();

    logger.info('SacredGeometrySwarmNavigator', {
      message: 'Initialized swarm navigation network',
      nodes: this.nodes.size,
      flowerNodes: this.geometry.circles.length,
      vesicaNodes: this.geometry.intersections.length,
    });
  }

  /**
   * Build connection graph between nodes based on geometric proximity
   */
  private buildConnections(): void {
    const nodesArray = Array.from(this.nodes.values());

    for (const node of nodesArray) {
      // Find nearest neighbors within 2x radius
      const neighbors = nodesArray
        .filter((n) => n.id !== node.id)
        .map((n) => ({
          id: n.id,
          distance: Math.sqrt(
            Math.pow(n.x - node.x, 2) + Math.pow(n.y - node.y, 2)
          ),
        }))
        .filter((n) => n.distance < 150) // Within connection range
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 6); // Max 6 connections (hexagonal)

      node.connections = neighbors.map((n) => n.id);
    }
  }

  /**
   * Find optimal route between two points using sacred geometry lattice
   */
  findRoute(source: { x: number; y: number }, target: { x: number; y: number }): SwarmRoute {
    // Find nearest nodes to source and target
    const sourceNode = this.findNearestNode(source.x, source.y);
    const targetNode = this.findNearestNode(target.x, target.y);

    if (!sourceNode || !targetNode) {
      return {
        nodes: [],
        distance: Infinity,
        hops: 0,
        efficiency: 0,
        geometry: 'direct',
      };
    }

    // A* pathfinding through the lattice
    const path = this.aStarPathfinding(sourceNode.id, targetNode.id);

    if (path.length === 0) {
      // Fallback to direct route
      const directDistance = Math.sqrt(
        Math.pow(target.x - source.x, 2) + Math.pow(target.y - source.y, 2)
      );
      return {
        nodes: [sourceNode.id, targetNode.id],
        distance: directDistance,
        hops: 1,
        efficiency: 1,
        geometry: 'direct',
      };
    }

    // Calculate actual path distance
    let totalDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const node1 = this.nodes.get(path[i])!;
      const node2 = this.nodes.get(path[i + 1])!;
      totalDistance += Math.sqrt(
        Math.pow(node2.x - node1.x, 2) + Math.pow(node2.y - node1.y, 2)
      );
    }

    const directDistance = Math.sqrt(
      Math.pow(target.x - source.x, 2) + Math.pow(target.y - source.y, 2)
    );

    return {
      nodes: path,
      distance: totalDistance,
      hops: path.length - 1,
      efficiency: directDistance / totalDistance,
      geometry: this.config.preferLatticePaths ? 'lattice' : 'hybrid',
    };
  }

  /**
   * A* pathfinding through sacred geometry network
   */
  private aStarPathfinding(startId: string, goalId: string): string[] {
    const openSet = new Set<string>([startId]);
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    gScore.set(startId, 0);
    fScore.set(startId, this.heuristic(startId, goalId));

    while (openSet.size > 0) {
      // Find node with lowest fScore
      let current: string | null = null;
      let lowestF = Infinity;
      for (const nodeId of openSet) {
        const f = fScore.get(nodeId) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          current = nodeId;
        }
      }

      if (current === null) break;

      if (current === goalId) {
        return this.reconstructPath(cameFrom, current);
      }

      openSet.delete(current);

      const currentNode = this.nodes.get(current)!;
      for (const neighborId of currentNode.connections) {
        const neighbor = this.nodes.get(neighborId);
        if (!neighbor) continue;

        const tentativeG =
          (gScore.get(current) ?? Infinity) +
          Math.sqrt(
            Math.pow(neighbor.x - currentNode.x, 2) +
            Math.pow(neighbor.y - currentNode.y, 2)
          );

        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, current);
          gScore.set(neighborId, tentativeG);
          fScore.set(neighborId, tentativeG + this.heuristic(neighborId, goalId));
          openSet.add(neighborId);
        }
      }
    }

    return []; // No path found
  }

  /**
   * Heuristic for A* (straight-line distance)
   */
  private heuristic(nodeId: string, goalId: string): number {
    const node = this.nodes.get(nodeId);
    const goal = this.nodes.get(goalId);
    if (!node || !goal) return Infinity;

    return Math.sqrt(
      Math.pow(goal.x - node.x, 2) + Math.pow(goal.y - node.y, 2)
    );
  }

  /**
   * Reconstruct path from A* cameFrom map
   */
  private reconstructPath(cameFrom: Map<string, string>, current: string): string[] {
    const path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      path.unshift(current);
    }
    return path;
  }

  /**
   * Find nearest navigation node to a position
   */
  private findNearestNode(x: number, y: number): SwarmNode | null {
    let nearest: SwarmNode | null = null;
    let minDistance = Infinity;

    for (const node of this.nodes.values()) {
      const distance = Math.sqrt(
        Math.pow(node.x - x, 2) + Math.pow(node.y - y, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearest = node;
      }
    }

    return nearest;
  }

  /**
   * Assign agent to a crossing hub for coordination
   */
  assignAgentToHub(agentId: string, hubId: string): boolean {
    const hub = this.nodes.get(hubId);
    if (!hub) return false;

    if (hub.currentAgents.length >= hub.capacity) {
      logger.warn('SacredGeometrySwarmNavigator', {
        message: 'Hub at capacity',
        hubId,
        agentId,
        capacity: hub.capacity,
      });
      return false;
    }

    hub.currentAgents.push(agentId);
    return true;
  }

  /**
   * Release agent from hub
   */
  releaseAgentFromHub(agentId: string, hubId: string): void {
    const hub = this.nodes.get(hubId);
    if (!hub) return;

    hub.currentAgents = hub.currentAgents.filter((id) => id !== agentId);
  }

  /**
   * Get optimal rendezvous point for multiple agents
   */
  findRendezvousPoint(agentPositions: Array<{ x: number; y: number }>): SwarmNode | null {
    if (agentPositions.length === 0) return null;

    // Calculate centroid
    const centroidX =
      agentPositions.reduce((sum, p) => sum + p.x, 0) / agentPositions.length;
    const centroidY =
      agentPositions.reduce((sum, p) => sum + p.y, 0) / agentPositions.length;

    // Find nearest vesica intersection (natural crossing point)
    let bestHub: SwarmNode | null = null;
    let minScore = Infinity;

    for (const node of this.nodes.values()) {
      if (node.type !== 'vesica') continue;

      const distanceToCentroid = Math.sqrt(
        Math.pow(node.x - centroidX, 2) + Math.pow(node.y - centroidY, 2)
      );

      // Score: distance to centroid + remaining capacity
      const score =
        distanceToCentroid + (1 - node.currentAgents.length / node.capacity) * 100;

      if (score < minScore) {
        minScore = score;
        bestHub = node;
      }
    }

    return bestHub;
  }

  /**
   * Get swarm network statistics
   */
  getStats(): {
    totalNodes: number;
    vesicaHubs: number;
    flowerNodes: number;
    totalConnections: number;
    averageConnections: number;
    hubUtilization: number;
  } {
    const nodes = Array.from(this.nodes.values());
    const totalConnections = nodes.reduce((sum, n) => sum + n.connections.length, 0);
    const totalAgents = nodes.reduce((sum, n) => sum + n.currentAgents.length, 0);
    const totalCapacity = nodes.reduce((sum, n) => sum + n.capacity, 0);

    return {
      totalNodes: nodes.length,
      vesicaHubs: nodes.filter((n) => n.type === 'vesica').length,
      flowerNodes: nodes.filter((n) => n.type === 'flower').length,
      totalConnections,
      averageConnections: totalConnections / nodes.length || 0,
      hubUtilization: totalAgents / totalCapacity,
    };
  }

  /**
   * Get all navigation nodes for visualization
   */
  getNavigationNetwork(): {
    nodes: SwarmNode[];
    edges: Array<{ from: string; to: string }>;
  } {
    const nodes = Array.from(this.nodes.values());
    const edges: Array<{ from: string; to: string }> = [];
    const seen = new Set<string>();

    for (const node of nodes) {
      for (const conn of node.connections) {
        const edgeKey = [node.id, conn].sort().join('-');
        if (!seen.has(edgeKey)) {
          seen.add(edgeKey);
          edges.push({ from: node.id, to: conn });
        }
      }
    }

    return { nodes, edges };
  }
}

export const swarmNavigator = new SacredGeometrySwarmNavigator();
export default swarmNavigator;
