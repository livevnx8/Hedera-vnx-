/**
 * Metatron's Grid Router
 *
 * Implements multi-dimensional routing based on the Metatron's Cube sacred
 * geometry pattern. 13 interconnected circles form a 3D routing structure
 * where each node connects through multiple dimensions (x, y, z) plus
 * energetic pathways (dimensional shortcuts).
 *
 * Key concepts:
 * - 13 nodes: 1 center + 12 perimeter (6 directions + 6 diagonals)
 * - 3D positioning: Each node has (x, y, z) coordinates
 * - Dimensional shortcuts: Energy pathways bypassing normal routing
 * - Platonic solids: Nodes form tetrahedron, cube, octahedron patterns
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface MetatronNode {
  id: string;
  position: { x: number; y: number; z: number };
  dimension: 'physical' | 'astral' | 'mental' | 'causal';
  capacity: number;
  load: number;
  connections: string[]; // Connected node IDs
  platonicForm: 'tetrahedron' | 'cube' | 'octahedron' | 'icosahedron' | 'dodecahedron';
  merkabaActive: boolean; // Counter-rotating energy fields active
}

export interface DimensionalPath {
  source: string;
  target: string;
  dimensions: number[]; // Path through dimensions
  distance: number;
  energeticDistance: number; // Accounting for shortcuts
  merkabaBoost: boolean;
}

export interface MetatronRoute {
  path: string[]; // Node IDs
  dimensionHops: number;
  energeticEfficiency: number; // 0-1
  platonicResonance: string[]; // Which solids the route aligns with
}

export interface MetatronConfig {
  enableDimensionalShortcuts: boolean;
  merkabaRotationSpeed: number; // Hz
  platonicResonanceThreshold: number;
  maxDimensionHops: number;
  energeticBalanceIntervalMs: number;
}

const DEFAULT_CONFIG: MetatronConfig = {
  enableDimensionalShortcuts: true,
  merkabaRotationSpeed: 9.0, // 9Hz base frequency
  platonicResonanceThreshold: 0.7,
  maxDimensionHops: 3,
  energeticBalanceIntervalMs: 30000,
};

// 13 fundamental points in Metatron's Cube
const SACRED_POSITIONS = [
  { x: 0, y: 0, z: 0 }, // Center
  { x: 1, y: 0, z: 0 }, // +X
  { x: -1, y: 0, z: 0 }, // -X
  { x: 0, y: 1, z: 0 }, // +Y
  { x: 0, y: -1, z: 0 }, // -Y
  { x: 0, y: 0, z: 1 }, // +Z
  { x: 0, y: 0, z: -1 }, // -Z
  { x: 0.577, y: 0.577, z: 0.577 }, // +++ Octant (tetrahedral)
  { x: -0.577, y: -0.577, z: 0.577 }, // --+ Octant
  { x: -0.577, y: 0.577, z: -0.577 }, // -+- Octant
  { x: 0.577, y: -0.577, z: -0.577 }, // +-- Octant
  { x: 0.577, y: -0.577, z: 0.577 }, // +-+ Octant
  { x: -0.577, y: 0.577, z: 0.577 }, // -++ Octant
];

export class MetatronGridRouter extends EventEmitter {
  private nodes: Map<string, MetatronNode> = new Map();
  private config: MetatronConfig;
  private isRunning = false;
  private balanceTimer: NodeJS.Timeout | null = null;

  // Stats
  private stats = {
    routesCalculated: 0,
    dimensionalShortcutsUsed: 0,
    merkabaActivations: 0,
    platonicAlignments: 0,
    energeticRebalances: 0,
  };

  constructor(config: Partial<MetatronConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeMetatronGrid();
  }

  /**
   * Initialize the 13-node Metatron's Cube structure
   */
  private initializeMetatronGrid(): void {
    const platonicForms: MetatronNode['platonicForm'][] = [
      'tetrahedron',
      'cube',
      'octahedron',
      'icosahedron',
      'dodecahedron',
    ];

    for (let i = 0; i < 13; i++) {
      const pos = SACRED_POSITIONS[i];
      const node: MetatronNode = {
        id: `metatron-${i}`,
        position: pos,
        dimension: i === 0 ? 'causal' : 'physical',
        capacity: 100,
        load: 0,
        connections: [],
        platonicForm: platonicForms[i % 5],
        merkabaActive: i === 0, // Center has active merkaba
      };

      this.nodes.set(node.id, node);
    }

    // Create connections based on sacred geometry
    this.establishConnections();

    logger.info('MetatronGridRouter', {
      message: "Metatron's Cube initialized",
      nodeCount: this.nodes.size,
      connections: this.countConnections(),
    });
  }

  /**
   * Establish sacred geometry connections
   */
  private establishConnections(): void {
    const nodeList = Array.from(this.nodes.values());

    // Center (0) connects to all perimeter nodes
    const center = nodeList[0];
    for (let i = 1; i < nodeList.length; i++) {
      center.connections.push(nodeList[i].id);
      nodeList[i].connections.push(center.id);
    }

    // Perimeter nodes connect to nearest neighbors
    for (let i = 1; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const dist = this.calculateDistance(nodeList[i], nodeList[j]);
        if (dist < 1.5) {
          // Close nodes connect
          nodeList[i].connections.push(nodeList[j].id);
          nodeList[j].connections.push(nodeList[i].id);
        }
      }
    }

    // Special tetrahedral connections (nodes 7-12 form tetrahedra)
    const tetraNodes = [7, 8, 9, 10, 11, 12];
    for (let i = 0; i < tetraNodes.length; i++) {
      for (let j = i + 1; j < tetraNodes.length; j++) {
        const nodeA = nodeList[tetraNodes[i]];
        const nodeB = nodeList[tetraNodes[j]];
        if (!nodeA.connections.includes(nodeB.id)) {
          nodeA.connections.push(nodeB.id);
          nodeB.connections.push(nodeA.id);
        }
      }
    }
  }

  /**
   * Calculate Euclidean distance between nodes
   */
  private calculateDistance(a: MetatronNode, b: MetatronNode): number {
    return Math.sqrt(
      Math.pow(a.position.x - b.position.x, 2) +
        Math.pow(a.position.y - b.position.y, 2) +
        Math.pow(a.position.z - b.position.z, 2)
    );
  }

  /**
   * Start the Metatron grid router
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Periodic energetic rebalancing
    this.balanceTimer = setInterval(() => {
      this.performEnergeticRebalance();
    }, this.config.energeticBalanceIntervalMs);

    logger.info('MetatronGridRouter', {
      message: "Metatron's Grid router started",
      merkabaFrequency: this.config.merkabaRotationSpeed,
      shortcuts: this.config.enableDimensionalShortcuts,
    });

    this.emit('started');
  }

  /**
   * Stop the Metatron grid router
   */
  stop(): void {
    this.isRunning = false;
    if (this.balanceTimer) {
      clearInterval(this.balanceTimer);
      this.balanceTimer = null;
    }

    logger.info('MetatronGridRouter', {
      message: "Metatron's Grid router stopped",
    });

    this.emit('stopped');
  }

  /**
   * Add agent node to the grid
   */
  addNode(agentId: string, capabilities: string[], position?: { x: number; y: number; z: number }): MetatronNode {
    // Find nearest sacred position
    const sacredPos = position || this.findNearestSacredPosition();

    const node: MetatronNode = {
      id: agentId,
      position: sacredPos,
      dimension: 'physical',
      capacity: 100,
      load: 0,
      connections: [],
      platonicForm: this.determinePlatonicForm(sacredPos),
      merkabaActive: false,
    };

    // Connect to nearest grid nodes
    const nearest = this.findNearestNodes(node, 3);
    for (const n of nearest) {
      node.connections.push(n.id);
      n.connections.push(node.id);
    }

    this.nodes.set(agentId, node);

    logger.debug('MetatronGridRouter', {
      message: 'Agent added to Metatron grid',
      agentId,
      position: sacredPos,
      connections: node.connections.length,
    });

    this.emit('node_added', node);
    return node;
  }

  /**
   * Find nearest sacred geometry position
   */
  private findNearestSacredPosition(): { x: number; y: number; z: number } {
    // Generate position based on flower of life pattern
    const angle = Math.random() * 2 * Math.PI;
    const radius = 100 + Math.random() * 200;
    const z = (Math.random() - 0.5) * 100;

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      z,
    };
  }

  /**
   * Determine which platonic solid a position aligns with
   */
  private determinePlatonicForm(pos: { x: number; y: number; z: number }): MetatronNode['platonicForm'] {
    const forms: MetatronNode['platonicForm'][] = ['tetrahedron', 'cube', 'octahedron', 'icosahedron', 'dodecahedron'];

    // Simple distance-based assignment to nearest sacred form
    const distances = SACRED_POSITIONS.map((sp) =>
      Math.sqrt(Math.pow(pos.x - sp.x * 100, 2) + Math.pow(pos.y - sp.y * 100, 2) + Math.pow(pos.z - sp.z * 100, 2))
    );

    const minIndex = distances.indexOf(Math.min(...distances));
    return forms[minIndex % 5];
  }

  /**
   * Find nearest nodes in the grid
   */
  private findNearestNodes(node: MetatronNode, count: number): MetatronNode[] {
    const allNodes = Array.from(this.nodes.values()).filter((n) => n.id !== node.id);

    allNodes.sort((a, b) => {
      const distA = this.calculateDistance(node, a);
      const distB = this.calculateDistance(node, b);
      return distA - distB;
    });

    return allNodes.slice(0, count);
  }

  /**
   * Calculate route through Metatron's Grid with dimensional awareness
   */
  calculateRoute(sourceId: string, targetId: string): MetatronRoute | null {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);

    if (!source || !target) return null;

    this.stats.routesCalculated++;

    // A* search with dimensional awareness
    const path = this.aStarWithDimensions(source, target);
    if (!path) return null;

    // Calculate energetic efficiency
    const energeticEfficiency = this.calculateEnergeticEfficiency(path);

    // Determine platonic resonance
    const platonicResonance = this.calculatePlatonicResonance(path);

    return {
      path: path.map((n) => n.id),
      dimensionHops: this.countDimensionHops(path),
      energeticEfficiency,
      platonicResonance,
    };
  }

  /**
   * A* pathfinding with dimensional shortcuts
   */
  private aStarWithDimensions(start: MetatronNode, goal: MetatronNode): MetatronNode[] | null {
    const openSet: MetatronNode[] = [start];
    const closedSet = new Set<string>();
    const cameFrom = new Map<string, string>();

    const gScore = new Map<string, number>();
    gScore.set(start.id, 0);

    const fScore = new Map<string, number>();
    fScore.set(start.id, this.calculateEnergeticDistance(start, goal));

    while (openSet.length > 0) {
      // Get node with lowest fScore
      openSet.sort((a, b) => (fScore.get(a.id) || Infinity) - (fScore.get(b.id) || Infinity));
      const current = openSet.shift()!;

      if (current.id === goal.id) {
        // Reconstruct path
        const path: MetatronNode[] = [current];
        let curr = current.id;
        while (cameFrom.has(curr)) {
          curr = cameFrom.get(curr)!;
          path.unshift(this.nodes.get(curr)!);
        }
        return path;
      }

      closedSet.add(current.id);

      for (const neighborId of current.connections) {
        if (closedSet.has(neighborId)) continue;

        const neighbor = this.nodes.get(neighborId);
        if (!neighbor) continue;

        const tentativeGScore = (gScore.get(current.id) || 0) + this.calculateEnergeticDistance(current, neighbor);

        if (!openSet.includes(neighbor)) {
          openSet.push(neighbor);
        } else if (tentativeGScore >= (gScore.get(neighborId) || Infinity)) {
          continue;
        }

        cameFrom.set(neighborId, current.id);
        gScore.set(neighborId, tentativeGScore);
        fScore.set(neighborId, tentativeGScore + this.calculateEnergeticDistance(neighbor, goal));
      }
    }

    return null; // No path found
  }

  /**
   * Calculate energetic distance (accounting for shortcuts)
   */
  private calculateEnergeticDistance(a: MetatronNode, b: MetatronNode): number {
    const physicalDistance = this.calculateDistance(a, b);

    // Check for dimensional shortcut
    if (this.config.enableDimensionalShortcuts && a.dimension === b.dimension && a.dimension !== 'physical') {
      this.stats.dimensionalShortcutsUsed++;
      return physicalDistance * 0.5; // 50% reduction through dimensional shortcut
    }

    // Merkaba boost for active merkaba fields
    if (a.merkabaActive && b.merkabaActive) {
      return physicalDistance * 0.7;
    }

    return physicalDistance;
  }

  /**
   * Calculate energetic efficiency of a path
   */
  private calculateEnergeticEfficiency(path: MetatronNode[]): number {
    if (path.length < 2) return 1;

    const totalDistance = path.reduce((sum, node, i) => {
      if (i === 0) return 0;
      return sum + this.calculateDistance(path[i - 1], node);
    }, 0);

    const energeticDistance = path.reduce((sum, node, i) => {
      if (i === 0) return 0;
      return sum + this.calculateEnergeticDistance(path[i - 1], node);
    }, 0);

    return energeticDistance / totalDistance;
  }

  /**
   * Calculate platonic solids that resonate with this path
   */
  private calculatePlatonicResonance(path: MetatronNode[]): string[] {
    const forms = new Set<string>();

    for (const node of path) {
      forms.add(node.platonicForm);
    }

    const formsList = Array.from(forms);
    if (formsList.length >= 3) {
      this.stats.platonicAlignments++;
    }

    return formsList;
  }

  /**
   * Count dimension hops in path
   */
  private countDimensionHops(path: MetatronNode[]): number {
    if (path.length < 2) return 0;

    let hops = 0;
    for (let i = 1; i < path.length; i++) {
      if (path[i].dimension !== path[i - 1].dimension) {
        hops++;
      }
    }

    return hops;
  }

  /**
   * Activate merkaba field for a node
   */
  activateMerkaba(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    node.merkabaActive = true;
    this.stats.merkabaActivations++;

    this.emit('merkaba_activated', { nodeId });
    return true;
  }

  /**
   * Perform energetic rebalancing across the grid
   */
  private performEnergeticRebalance(): void {
    const nodes = Array.from(this.nodes.values());

    // Find overloaded and underloaded nodes
    const overloaded = nodes.filter((n) => n.load > 0.8);
    const underloaded = nodes.filter((n) => n.load < 0.3);

    if (overloaded.length === 0 || underloaded.length === 0) return;

    // Redistribute load energetically
    for (const high of overloaded) {
      // Find connected underloaded node
      const candidates = high.connections
        .map((id) => this.nodes.get(id))
        .filter((n): n is MetatronNode => !!n && n.load < 0.3);

      if (candidates.length > 0) {
        const transfer = (high.load - 0.5) * 0.3;
        high.load -= transfer;
        candidates[0].load += transfer;

        this.stats.energeticRebalances++;

        logger.debug('MetatronGridRouter', {
          message: 'Energetic rebalance',
          from: high.id,
          to: candidates[0].id,
          transfer,
        });
      }
    }

    this.emit('energetic_rebalance', { overloaded: overloaded.length, underloaded: underloaded.length });
  }

  /**
   * Get Metatron's Cube visualization data
   */
  getMetatronVisualization(): {
    nodes: MetatronNode[];
    connections: Array<{ source: string; target: string }>;
    platonicSolids: Record<string, string[]>;
    stats: typeof this.stats;
  } {
    const connections: Array<{ source: string; target: string }> = [];
    const seen = new Set<string>();

    for (const node of this.nodes.values()) {
      for (const conn of node.connections) {
        const key = [node.id, conn].sort().join('-');
        if (!seen.has(key)) {
          seen.add(key);
          connections.push({ source: node.id, target: conn });
        }
      }
    }

    // Group by platonic form
    const platonicSolids: Record<string, string[]> = {
      tetrahedron: [],
      cube: [],
      octahedron: [],
      icosahedron: [],
      dodecahedron: [],
    };

    for (const node of this.nodes.values()) {
      platonicSolids[node.platonicForm].push(node.id);
    }

    return {
      nodes: Array.from(this.nodes.values()),
      connections,
      platonicSolids,
      stats: this.stats,
    };
  }

  /**
   * Count total connections in grid
   */
  private countConnections(): number {
    let count = 0;
    for (const node of this.nodes.values()) {
      count += node.connections.length;
    }
    return count / 2; // Each connection counted twice
  }

  /**
   * Get router statistics
   */
  getStats() {
    return {
      ...this.stats,
      nodeCount: this.nodes.size,
      connectionCount: this.countConnections(),
      merkabaActiveCount: Array.from(this.nodes.values()).filter((n) => n.merkabaActive).length,
      averageLoad: Array.from(this.nodes.values()).reduce((sum, n) => sum + n.load, 0) / this.nodes.size || 0,
    };
  }

  /**
   * Remove node from grid
   */
  removeNode(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    // Remove connections
    for (const connId of node.connections) {
      const conn = this.nodes.get(connId);
      if (conn) {
        conn.connections = conn.connections.filter((id) => id !== nodeId);
      }
    }

    this.nodes.delete(nodeId);
    this.emit('node_removed', { nodeId });
    return true;
  }
}

export default MetatronGridRouter;
