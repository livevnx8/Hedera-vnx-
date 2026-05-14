/**
 * Triangular Routing Mesh
 *
 * Implements a sacred geometry-inspired routing topology where agents
 * are arranged in a triangular lattice. Each task gets 3 candidate
 * agents (triangle vertices) with automatic failover along mesh edges.
 *
 * The triangular topology provides:
 * - Natural 3-way redundancy (triangle vertices)
 * - Short average path length
 * - Automatic load distribution through geometric proximity
 * - Graceful degradation when nodes fail
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../../monitoring/logger.js';

export interface MeshNode {
  id: string;
  x: number;
  y: number;
  shardId: number;
  capabilities: string[];
  load: number;
  status: 'active' | 'busy' | 'offline';
  lastHeartbeat: number;
  neighbors: string[]; // Adjacent node IDs in mesh
}

export interface MeshRoute {
  path: string[]; // Node IDs from source to destination
  hops: number;
  estimatedLatency: number;
  alternativePaths: string[][]; // Backup routes
  viaIntersection: boolean; // Route goes through vesica piscis zone
}

export interface TriangularMeshConfig {
  maxNodes: number;
  triangleSize: number; // Distance between connected nodes
  enableRedundancy: boolean;
  failoverStrategy: 'edge' | 'centroid' | 'neighbor';
  rebalanceIntervalMs: number;
}

const DEFAULT_CONFIG: TriangularMeshConfig = {
  maxNodes: 5000,
  triangleSize: 100,
  enableRedundancy: true,
  failoverStrategy: 'edge',
  rebalanceIntervalMs: 30000,
};

export class TriangularRouter extends EventEmitter {
  private nodes: Map<string, MeshNode> = new Map();
  private config: TriangularMeshConfig;
  private rebalanceTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Metrics
  private stats = {
    routesCalculated: 0,
    avgHops: 0,
    failoverEvents: 0,
    intersectionRoutes: 0,
  };

  constructor(config: Partial<TriangularMeshConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the triangular router
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Periodic mesh rebalancing
    this.rebalanceTimer = setInterval(() => {
      this.rebalanceMesh();
    }, this.config.rebalanceIntervalMs);

    logger.info('TriangularRouter', {
      message: 'Triangular mesh router started',
      maxNodes: this.config.maxNodes,
      triangleSize: this.config.triangleSize,
    });

    this.emit('started');
  }

  /**
   * Stop the router
   */
  stop(): void {
    this.isRunning = false;
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }

    logger.info('TriangularRouter', { message: 'Triangular mesh router stopped' });
    this.emit('stopped');
  }

  /**
   * Add a node to the triangular mesh
   */
  addNode(
    nodeId: string,
    shardId: number,
    capabilities: string[],
    position?: { x: number; y: number }
  ): MeshNode {
    // Calculate geometric position if not provided
    const pos = position || this.calculateOptimalPosition(nodeId, shardId);

    const node: MeshNode = {
      id: nodeId,
      x: pos.x,
      y: pos.y,
      shardId,
      capabilities,
      load: 0,
      status: 'active',
      lastHeartbeat: Date.now(),
      neighbors: [],
    };

    this.nodes.set(nodeId, node);

    // Connect to nearest neighbors forming triangles
    this.connectToNeighbors(node);

    logger.debug('TriangularRouter', {
      message: 'Node added to mesh',
      nodeId,
      shardId,
      x: pos.x,
      y: pos.y,
      neighbors: node.neighbors.length,
    });

    this.emit('node_added', { nodeId, shardId, position: pos });
    return node;
  }

  /**
   * Remove a node from the mesh
   */
  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Remove from neighbors' neighbor lists
    for (const neighborId of node.neighbors) {
      const neighbor = this.nodes.get(neighborId);
      if (neighbor) {
        neighbor.neighbors = neighbor.neighbors.filter((id) => id !== nodeId);
      }
    }

    this.nodes.delete(nodeId);

    logger.debug('TriangularRouter', { message: 'Node removed from mesh', nodeId });
    this.emit('node_removed', { nodeId });

    // Reconnect orphaned neighbors if needed
    this.repairMesh();
  }

  /**
   * Update node state (load, status, heartbeat)
   */
  updateNode(
    nodeId: string,
    updates: Partial<Pick<MeshNode, 'load' | 'status' | 'lastHeartbeat'>>
  ): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    Object.assign(node, updates);

    if (updates.status === 'offline') {
      this.emit('node_offline', { nodeId });
    }
  }

  /**
   * Get 3 candidate agents for a task (triangle vertices)
   */
  getCandidates(
    taskId: string,
    serviceType: string,
    count: number = 3
  ): Array<{ nodeId: string; score: number; distance: number }> {
    // Hash task ID to a point in the mesh space
    const taskPoint = this.hashToPoint(taskId);

    // Find all capable nodes
    const capableNodes = Array.from(this.nodes.values()).filter(
      (n) => n.status === 'active' && n.capabilities.includes(serviceType)
    );

    if (capableNodes.length === 0) {
      return [];
    }

    // Calculate scores based on geometric distance and load
    const scored = capableNodes.map((node) => {
      const distance = Math.sqrt(
        Math.pow(node.x - taskPoint.x, 2) + Math.pow(node.y - taskPoint.y, 2)
      );

      // Score: closer is better, lower load is better
      const loadFactor = 1 - node.load; // 0-1, higher is better
      const distanceFactor = 1 / (1 + distance / 1000); // Normalize distance

      const score = loadFactor * 0.6 + distanceFactor * 0.4;

      return { nodeId: node.id, score, distance };
    });

    // Sort by score descending and return top N
    return scored.sort((a, b) => b.score - a.score).slice(0, count);
  }

  /**
   * Calculate route between two nodes using triangular mesh
   */
  calculateRoute(sourceId: string, targetId: string): MeshRoute | null {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);

    if (!source || !target) {
      return null;
    }

    // Check if source and target are in different shards (vesica piscis route)
    const viaIntersection = source.shardId !== target.shardId;

    // Use A* pathfinding through the mesh
    const path = this.findPath(sourceId, targetId);

    if (!path) {
      return null;
    }

    // Calculate alternative paths for redundancy
    const alternativePaths = this.config.enableRedundancy
      ? this.findAlternativePaths(sourceId, targetId, path)
      : [];

    const hops = path.length - 1;
    const estimatedLatency = hops * 20; // ~20ms per hop

    this.stats.routesCalculated++;
    this.stats.avgHops = (this.stats.avgHops * (this.stats.routesCalculated - 1) + hops) / this.stats.routesCalculated;

    if (viaIntersection) {
      this.stats.intersectionRoutes++;
    }

    return {
      path,
      hops,
      estimatedLatency,
      alternativePaths,
      viaIntersection,
    };
  }

  /**
   * Find best route with automatic failover
   */
  routeWithFailover(
    sourceId: string,
    targetId: string,
    preferred: string
  ): MeshRoute | null {
    // Try direct route first
    const directRoute = this.calculateRoute(sourceId, targetId);

    if (directRoute && directRoute.path.includes(preferred)) {
      return directRoute;
    }

    // Failover: try routing through preferred node's neighbors
    const preferredNode = this.nodes.get(preferred);
    if (preferredNode && preferredNode.status === 'active') {
      for (const neighborId of preferredNode.neighbors) {
        const neighborRoute = this.calculateRoute(sourceId, neighborId);
        if (neighborRoute) {
          this.stats.failoverEvents++;
          logger.info('TriangularRouter', {
            message: 'Failover to neighbor',
            sourceId,
            preferred,
            failoverTo: neighborId,
          });
          return neighborRoute;
        }
      }
    }

    // Final failover: use edge strategy
    switch (this.config.failoverStrategy) {
      case 'edge':
        return this.routeViaEdge(sourceId, targetId);
      case 'centroid':
        return this.routeViaCentroid(sourceId, targetId);
      default:
        return directRoute;
    }
  }

  /**
   * Get mesh statistics
   */
  getStats() {
    const allNodes = Array.from(this.nodes.values());
    const activeNodes = allNodes.filter((n) => n.status === 'active').length;
    const busyNodes = allNodes.filter((n) => n.status === 'busy').length;
    const offlineNodes = allNodes.filter((n) => n.status === 'offline').length;

    // Calculate average neighbors per node
    const avgNeighbors =
      allNodes.reduce((sum, n) => sum + n.neighbors.length, 0) / (allNodes.length || 1);

    return {
      ...this.stats,
      totalNodes: allNodes.length,
      activeNodes,
      busyNodes,
      offlineNodes,
      avgNeighbors,
      meshDensity: allNodes.length / this.config.maxNodes,
    };
  }

  /**
   * Get mesh visualization data
   */
  getMeshVisualization() {
    return {
      nodes: Array.from(this.nodes.values()).map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        shardId: n.shardId,
        status: n.status,
        load: n.load,
        neighbors: n.neighbors,
      })),
      edges: this.getMeshEdges(),
    };
  }

  /**
   * Calculate optimal geometric position for a new node
   */
  private calculateOptimalPosition(
    nodeId: string,
    shardId: number
  ): { x: number; y: number } {
    // Use shard to determine angular sector
    const angle = (shardId / 50) * 2 * Math.PI;

    // Use hash to determine radius within sector
    const hash = this.hashString(nodeId);
    const radius = 200 + (hash % 800); // 200-1000 range

    // Convert polar to cartesian
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  }

  /**
   * Connect a node to its nearest neighbors forming triangles
   */
  private connectToNeighbors(node: MeshNode): void {
    const allNodes = Array.from(this.nodes.values()).filter((n) => n.id !== node.id);

    // Find nodes within triangle distance
    const nearby = allNodes
      .map((n) => ({
        node: n,
        distance: Math.sqrt(Math.pow(n.x - node.x, 2) + Math.pow(n.y - node.y, 2)),
      }))
      .filter((n) => n.distance <= this.config.triangleSize * 2)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3); // Max 3 neighbors for triangular mesh

    for (const { node: neighbor } of nearby) {
      // Bidirectional connection
      if (!node.neighbors.includes(neighbor.id)) {
        node.neighbors.push(neighbor.id);
      }
      if (!neighbor.neighbors.includes(node.id)) {
        neighbor.neighbors.push(node.id);
      }
    }
  }

  /**
   * Hash a string to a 2D point in mesh space
   */
  private hashToPoint(input: string): { x: number; y: number } {
    const hash = this.hashString(input);

    // Map hash to circular area
    const angle = (hash % 360) * (Math.PI / 180);
    const radius = (hash >> 8) % 1000;

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  }

  /**
   * Simple hash function for strings
   */
  private hashString(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Find shortest path using A* algorithm
   */
  private findPath(startId: string, targetId: string): string[] | null {
    if (startId === targetId) return [startId];

    const openSet = new Set<string>([startId]);
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    gScore.set(startId, 0);
    fScore.set(startId, this.heuristic(startId, targetId));

    while (openSet.size > 0) {
      // Get node with lowest fScore
      let current: string | null = null;
      let lowestF = Infinity;

      for (const nodeId of openSet) {
        const f = fScore.get(nodeId) || Infinity;
        if (f < lowestF) {
          lowestF = f;
          current = nodeId;
        }
      }

      if (current === null) break;

      if (current === targetId) {
        // Reconstruct path
        const path: string[] = [targetId];
        let prev = cameFrom.get(targetId);
        while (prev) {
          path.unshift(prev);
          prev = cameFrom.get(prev);
        }
        return path;
      }

      openSet.delete(current);

      const currentNode = this.nodes.get(current);
      if (!currentNode) continue;

      for (const neighborId of currentNode.neighbors) {
        const neighbor = this.nodes.get(neighborId);
        if (!neighbor || neighbor.status === 'offline') continue;

        const tentativeG = (gScore.get(current) || 0) + 1;

        if (tentativeG < (gScore.get(neighborId) || Infinity)) {
          cameFrom.set(neighborId, current);
          gScore.set(neighborId, tentativeG);
          fScore.set(neighborId, tentativeG + this.heuristic(neighborId, targetId));
          openSet.add(neighborId);
        }
      }
    }

    return null; // No path found
  }

  /**
   * Heuristic for A* (geometric distance)
   */
  private heuristic(nodeId: string, targetId: string): number {
    const node = this.nodes.get(nodeId);
    const target = this.nodes.get(targetId);

    if (!node || !target) return Infinity;

    return Math.sqrt(Math.pow(node.x - target.x, 2) + Math.pow(node.y - target.y, 2));
  }

  /**
   * Find alternative paths for redundancy
   */
  private findAlternativePaths(
    sourceId: string,
    targetId: string,
    excludePath: string[]
  ): string[][] {
    const alternatives: string[][] = [];

    // Try removing each edge from the primary path and finding new routes
    for (let i = 0; i < excludePath.length - 1 && alternatives.length < 2; i++) {
      const blockedNode = excludePath[i];
      const tempNode = this.nodes.get(blockedNode);

      if (tempNode) {
        // Temporarily mark as offline
        const originalStatus = tempNode.status;
        tempNode.status = 'offline';

        // Find alternative path
        const altPath = this.findPath(sourceId, targetId);
        if (altPath) {
          alternatives.push(altPath);
        }

        // Restore status
        tempNode.status = originalStatus;
      }
    }

    return alternatives;
  }

  /**
   * Route via edge of triangle when direct path fails
   */
  private routeViaEdge(sourceId: string, targetId: string): MeshRoute | null {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);

    if (!source || !target) return null;

    // Find intermediate node that connects to both
    for (const neighborId of source.neighbors) {
      const neighbor = this.nodes.get(neighborId);
      if (neighbor && neighbor.neighbors.includes(targetId)) {
        return {
          path: [sourceId, neighborId, targetId],
          hops: 2,
          estimatedLatency: 40,
          alternativePaths: [],
          viaIntersection: source.shardId !== target.shardId,
        };
      }
    }

    return null;
  }

  /**
   * Route via centroid (center point) of triangle
   */
  private routeViaCentroid(sourceId: string, targetId: string): MeshRoute | null {
    // Simplified: find a well-connected node near the geometric center
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);

    if (!source || !target) return null;

    const centerX = (source.x + target.x) / 2;
    const centerY = (source.y + target.y) / 2;

    // Find node closest to center
    let bestNode: MeshNode | null = null;
    let bestDist = Infinity;

    for (const node of this.nodes.values()) {
      if (node.status !== 'active') continue;

      const dist = Math.sqrt(Math.pow(node.x - centerX, 2) + Math.pow(node.y - centerY, 2));
      if (dist < bestDist) {
        bestDist = dist;
        bestNode = node;
      }
    }

    if (!bestNode) return null;

    // Route through centroid node
    const path1 = this.findPath(sourceId, bestNode.id);
    const path2 = this.findPath(bestNode.id, targetId);

    if (path1 && path2) {
      return {
        path: [...path1, ...path2.slice(1)], // Avoid duplicating centroid node
        hops: path1.length + path2.length - 2,
        estimatedLatency: (path1.length + path2.length - 2) * 20,
        alternativePaths: [],
        viaIntersection: source.shardId !== target.shardId,
      };
    }

    return null;
  }

  /**
   * Get mesh edges for visualization
   */
  private getMeshEdges(): Array<{ source: string; target: string }> {
    const edges: Array<{ source: string; target: string }> = [];
    const seen = new Set<string>();

    for (const node of this.nodes.values()) {
      for (const neighborId of node.neighbors) {
        // Create canonical edge ID to avoid duplicates
        const edgeId = [node.id, neighborId].sort().join('-');
        if (!seen.has(edgeId)) {
          seen.add(edgeId);
          edges.push({ source: node.id, target: neighborId });
        }
      }
    }

    return edges;
  }

  /**
   * Rebalance mesh connections
   */
  private rebalanceMesh(): void {
    // Check for nodes with too many or too few connections
    for (const node of this.nodes.values()) {
      if (node.neighbors.length < 2 && node.status === 'active') {
        // Add more connections
        this.connectToNeighbors(node);
      }
    }

    this.emit('mesh_rebalanced', { nodeCount: this.nodes.size });
  }

  /**
   * Repair mesh after node removal
   */
  private repairMesh(): void {
    // Find orphaned nodes and reconnect them
    for (const node of this.nodes.values()) {
      if (node.neighbors.length === 0 && node.status === 'active') {
        this.connectToNeighbors(node);
      }
    }
  }
}

export default TriangularRouter;
