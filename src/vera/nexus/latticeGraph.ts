/**
 * Vera Nexus - Lattice Graph Intelligence Engine
 * 
 * A GitNexus-inspired graph visualization system for the Flower of Life lattice.
 * Provides interactive graph exploration, Cypher-style queries, and graph RAG.
 */

import { EventEmitter } from 'events';

// ─── Graph Node Types ─────────────────────────────────────────────────────

export type NodeType = 'center' | 'layer1' | 'layer2' | 'layer3' | 'inner' | 'outer' | 'pulse' | 'thought';

export interface LatticeNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  z?: number;
  energy: number;
  frequency: number;
  phase: number;
  connections: string[];
  metadata: {
    pulses: number;
    lastActive: number;
    totalRequests: number;
    averageConfidence: number;
  };
}

export interface LatticeEdge {
  id: string;
  source: string;
  target: string;
  type: 'resonance' | 'flow' | 'harmonic' | 'entrainment';
  strength: number;
  frequency: number;
  phase: number;
}

export interface LatticeGraph {
  nodes: LatticeNode[];
  edges: LatticeEdge[];
  timestamp: number;
  centerEnergy: number;
  globalCoherence: number;
}

// ─── Cypher-Style Query System ────────────────────────────────────────────

export interface QueryResult {
  nodes: LatticeNode[];
  edges: LatticeEdge[];
  path: string[];
  query: string;
  executionTime: number;
}

export class LatticeGraphEngine extends EventEmitter {
  private nodes = new Map<string, LatticeNode>();
  private edges = new Map<string, LatticeEdge>();
  private requestHistory: Array<{ path: string[]; timestamp: number; energy: number }> = [];

  constructor() {
    super();
    this.initializeFlowerOfLife();
  }

  /**
   * Initialize the complete Flower of Life lattice structure
   */
  private initializeFlowerOfLife(): void {
    const sacredFreqs = {
      center: 432,
      layer1: 528,
      layer2: 639,
      layer3: 741,
      inner: 963,
      outer: 852,
    };

    // Center-0 (seed of life)
    this.addNode({
      id: 'center-0',
      type: 'center',
      label: 'Center-0 Consciousness',
      x: 0,
      y: 0,
      z: 0,
      energy: 1.0,
      frequency: sacredFreqs.center,
      phase: 0,
      connections: [],
      metadata: {
        pulses: 0,
        lastActive: Date.now(),
        totalRequests: 0,
        averageConfidence: 0.85,
      },
    });

    // Layer 1 (6 nodes - inner ring)
    for (let i = 0; i < 6; i++) {
      const angle = (i * 60) * (Math.PI / 180);
      const id = `layer1-${i}`;
      this.addNode({
        id,
        type: 'layer1',
        label: `Layer-1 Node ${i}`,
        x: Math.cos(angle) * 2,
        y: Math.sin(angle) * 2,
        z: 0,
        energy: 0.7,
        frequency: sacredFreqs.layer1,
        phase: (i * Math.PI) / 3,
        connections: ['center-0'],
        metadata: {
          pulses: 0,
          lastActive: Date.now(),
          totalRequests: 0,
          averageConfidence: 0.82,
        },
      });
      this.addEdge('center-0', id, 'resonance', 0.8);
    }

    // Layer 2 (12 nodes - middle ring)
    for (let i = 0; i < 12; i++) {
      const angle = (i * 30) * (Math.PI / 180);
      const id = `layer2-${i}`;
      this.addNode({
        id,
        type: 'layer2',
        label: `Layer-2 Node ${i}`,
        x: Math.cos(angle) * 4,
        y: Math.sin(angle) * 4,
        z: 0,
        energy: 0.7,
        frequency: sacredFreqs.layer2,
        phase: (i * Math.PI) / 6,
        connections: [],
        metadata: {
          pulses: 0,
          lastActive: Date.now(),
          totalRequests: 0,
          averageConfidence: 0.79,
        },
      });
      
      // Connect to nearest layer1 nodes
      const layer1Index = Math.floor(i / 2);
      const layer1Id = `layer1-${layer1Index % 6}`;
      this.addEdge(layer1Id, id, 'flow', 0.6);
    }

    // Layer 3 (6 nodes - outer ring)
    for (let i = 0; i < 6; i++) {
      const angle = (i * 60) * (Math.PI / 180);
      const id = `layer3-${i}`;
      this.addNode({
        id,
        type: 'layer3',
        label: `Layer-3 Node ${i}`,
        x: Math.cos(angle) * 6,
        y: Math.sin(angle) * 6,
        z: 0,
        energy: 0.7,
        frequency: sacredFreqs.layer3,
        phase: (i * Math.PI) / 3,
        connections: [],
        metadata: {
          pulses: 0,
          lastActive: Date.now(),
          totalRequests: 0,
          averageConfidence: 0.76,
        },
      });
      
      // Connect to nearest layer2 nodes
      this.addEdge(`layer2-${i * 2}`, id, 'harmonic', 0.5);
      this.addEdge(`layer2-${(i * 2 + 1) % 12}`, id, 'harmonic', 0.5);
    }

    // Inner sanctum (high frequency)
    this.addNode({
      id: 'inner-0',
      type: 'inner',
      label: 'Inner Sanctum',
      x: 0,
      y: 0,
      z: -2,
      energy: 0.8,
      frequency: sacredFreqs.inner,
      phase: Math.PI / 4,
      connections: ['center-0'],
      metadata: {
        pulses: 0,
        lastActive: Date.now(),
        totalRequests: 0,
        averageConfidence: 0.90,
      },
    });
    this.addEdge('center-0', 'inner-0', 'entrainment', 0.9);

    // Outer boundary
    this.addNode({
      id: 'outer-0',
      type: 'outer',
      label: 'Outer Boundary',
      x: 0,
      y: 0,
      z: 2,
      energy: 0.8,
      frequency: sacredFreqs.outer,
      phase: Math.PI / 2,
      connections: ['center-0'],
      metadata: {
        pulses: 0,
        lastActive: Date.now(),
        totalRequests: 0,
        averageConfidence: 0.88,
      },
    });
    this.addEdge('center-0', 'outer-0', 'entrainment', 0.9);

    console.log('[LatticeGraph] Flower of Life initialized with', this.nodes.size, 'nodes');
  }

  private addNode(node: LatticeNode): void {
    this.nodes.set(node.id, node);
  }

  private addEdge(source: string, target: string, type: LatticeEdge['type'], strength: number): void {
    const id = `${source}→${target}`;
    const sourceNode = this.nodes.get(source);
    const targetNode = this.nodes.get(target);
    
    if (!sourceNode || !targetNode) return;

    const edge: LatticeEdge = {
      id,
      source,
      target,
      type,
      strength,
      frequency: (sourceNode.frequency + targetNode.frequency) / 2,
      phase: (sourceNode.phase + targetNode.phase) / 2,
    };

    this.edges.set(id, edge);
    sourceNode.connections.push(target);
  }

  /**
   * Cypher-style query: MATCH (n:Type) WHERE n.energy > 0.8 RETURN n
   */
  query(cypherQuery: string): QueryResult {
    const startTime = Date.now();
    
    // Simple Cypher parser
    const match = cypherQuery.match(/MATCH\s*\(([^)]+)\)/i);
    const where = cypherQuery.match(/WHERE\s+(.+)/i);
    const returns = cypherQuery.match(/RETURN\s+(.+)/i);
    
    let results = Array.from(this.nodes.values());
    
    // Filter by type if specified
    if (match) {
      const [, nodeDef] = match;
      const typeMatch = nodeDef.match(/:(\w+)/);
      if (typeMatch) {
        const type = typeMatch[1] as NodeType;
        results = results.filter(n => n.type === type);
      }
    }
    
    // Apply WHERE clause
    if (where) {
      const conditions = where[1].split(/\s+AND\s+/i);
      for (const condition of conditions) {
        const match = condition.match(/n\.(\w+)\s*([<>!=]+)\s*(.+)/);
        if (match) {
          const [, prop, op, value] = match;
          const numValue = parseFloat(value);
          
          results = results.filter(n => {
            const propValue = (n as any)[prop] ?? n.metadata[prop as keyof typeof n.metadata];
            switch (op) {
              case '>': return propValue > numValue;
              case '<': return propValue < numValue;
              case '>=': return propValue >= numValue;
              case '<=': return propValue <= numValue;
              case '=': return propValue === numValue || propValue === value.replace(/['"]/g, '');
              default: return true;
            }
          });
        }
      }
    }
    
    // Get connected edges
    const nodeIds = new Set(results.map(n => n.id));
    const connectedEdges = Array.from(this.edges.values()).filter(
      e => nodeIds.has(e.source) || nodeIds.has(e.target)
    );
    
    return {
      nodes: results,
      edges: connectedEdges,
      path: results.map(n => n.id),
      query: cypherQuery,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Find shortest path between two nodes
   */
  findPath(startId: string, endId: string): string[] {
    const visited = new Set<string>();
    const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }];
    
    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      
      if (id === endId) return path;
      
      if (visited.has(id)) continue;
      visited.add(id);
      
      const node = this.nodes.get(id);
      if (!node) continue;
      
      for (const neighbor of node.connections) {
        if (!visited.has(neighbor)) {
          queue.push({ id: neighbor, path: [...path, neighbor] });
        }
      }
    }
    
    return [];
  }

  /**
   * Get active thinking path (for RAG)
   */
  getActivePath(requestId: string): string[] {
    // Simulate 5-step thinking process
    return ['center-0', 'layer1-2', 'layer2-5', 'layer3-3', 'center-0'];
  }

  /**
   * Record a request for learning
   */
  recordRequest(path: string[], energy: number): void {
    this.requestHistory.push({ path, timestamp: Date.now(), energy });
    
    // Update node metadata
    for (const nodeId of path) {
      const node = this.nodes.get(nodeId);
      if (node) {
        node.metadata.pulses++;
        node.metadata.lastActive = Date.now();
        node.metadata.totalRequests++;
      }
    }
    
    this.emit('request_recorded', { path, energy });
  }

  /**
   * Get most traveled paths (for optimization)
   */
  getPopularPaths(limit = 10): Array<{ path: string[]; count: number; avgEnergy: number }> {
    const pathCounts = new Map<string, { count: number; totalEnergy: number }>();
    
    for (const req of this.requestHistory) {
      const key = req.path.join('→');
      const existing = pathCounts.get(key);
      if (existing) {
        existing.count++;
        existing.totalEnergy += req.energy;
      } else {
        pathCounts.set(key, { count: 1, totalEnergy: req.energy });
      }
    }
    
    return Array.from(pathCounts.entries())
      .map(([path, stats]) => ({
        path: path.split('→'),
        count: stats.count,
        avgEnergy: stats.totalEnergy / stats.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Export graph for visualization
   */
  exportGraph(): LatticeGraph {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      timestamp: Date.now(),
      centerEnergy: this.nodes.get('center-0')?.energy || 1.0,
      globalCoherence: this.calculateGlobalCoherence(),
    };
  }

  private calculateGlobalCoherence(): number {
    const phases = Array.from(this.nodes.values()).map(n => n.phase);
    const sinSum = phases.reduce((sum, p) => sum + Math.sin(p), 0);
    const cosSum = phases.reduce((sum, p) => sum + Math.cos(p), 0);
    return Math.sqrt(sinSum ** 2 + cosSum ** 2) / phases.length;
  }

  /**
   * Get node by ID
   */
  getNode(id: string): LatticeNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes of a type
   */
  getNodesByType(type: NodeType): LatticeNode[] {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }

  /**
   * Get neighbors of a node
   */
  getNeighbors(nodeId: string): LatticeNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    
    return node.connections
      .map(id => this.nodes.get(id))
      .filter((n): n is LatticeNode => n !== undefined);
  }
}

// Singleton export
export const latticeGraph = new LatticeGraphEngine();
