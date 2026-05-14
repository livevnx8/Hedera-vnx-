/**
 * Lattice Mapper & Swarm Visualizer
 * 
 * Maps the Flower of Life lattice structure and tracks swarm usage patterns.
 * Provides visualization data for Vera's living geometry.
 */

import { logger } from '../../monitoring/logger.js';
import type { 
  FlowerOfLifeOS, 
  LatticeNode, 
  LatticeEdge, 
  LatticeLayer,
  LatticeRoute 
} from '../orchestrator/flowerOfLifeOS.js';

interface SwarmUsageMetrics {
  nodeId: string;
  agentCount: number;
  agentIds: string[];
  totalAccesses: number;
  energyLevel: number;
  lastActivity: number;
  inboundTraffic: number;
  outboundTraffic: number;
}

interface EdgeTrafficMetrics {
  edgeId: string;
  from: string;
  to: string;
  strength: number;
  totalMessages: number;
  avgLatency: number;
  usageIntensity: 'high' | 'medium' | 'low' | 'dormant';
  flowDirection: string;
}

interface EnergyFlowSnapshot {
  timestamp: number;
  totalEnergy: number;
  centerEnergy: number;
  layerDistribution: Record<LatticeLayer, number>;
  hotspots: string[];
  coldspots: string[];
  flowImbalance: number; // Positive = clockwise dominant
}

interface LatticeHeatmap {
  timestamp: number;
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    intensity: number; // 0-1 heat value
    layer: LatticeLayer;
    role: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    intensity: number;
    traffic: number;
  }>;
  maxIntensity: number;
  minIntensity: number;
}

interface SwarmDistribution {
  timestamp: number;
  totalAgents: number;
  byLayer: Record<LatticeLayer, {
    count: number;
    agents: string[];
    avgEnergy: number;
  }>;
  byRole: Record<string, string[]>;
  unassigned: string[];
  densityMap: Map<string, number>; // nodeId -> agent count
}

interface PathAnalysis {
  mostUsedRoutes: Array<{
    from: string;
    to: string;
    count: number;
    avgHops: number;
    avgEnergyCost: number;
  }>;
  criticalPaths: string[]; // Edge IDs that would disconnect lattice if removed
  redundantPaths: string[]; // Edges with alternate routes available
  congestionPoints: string[]; // Nodes with high traffic relative to capacity
}

export class LatticeMapper {
  private lattice: FlowerOfLifeOS;
  private routeHistory: LatticeRoute[] = [];
  private agentPaths: Map<string, string[]> = new Map(); // agentId -> node path history
  private swarmSnapshots: SwarmDistribution[] = [];
  private maxHistorySize = 1000;

  constructor(lattice: FlowerOfLifeOS) {
    this.lattice = lattice;
  }

  /**
   * Get comprehensive lattice map with all nodes and edges
   */
  getFullLatticeMap(): {
    nodes: LatticeNode[];
    edges: LatticeEdge[];
    geometry: {
      bounds: { minX: number; maxX: number; minY: number; maxY: number };
      center: { x: number; y: number };
      radius: number;
    };
    stats: {
      totalNodes: number;
      totalEdges: number;
      byLayer: Record<LatticeLayer, number>;
      avgEnergy: number;
      activeAgents: number;
    };
  } {
    const nodes = Array.from(this.getNodes().values());
    const edges = Array.from(this.getEdges().values());

    // Calculate bounds
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const bounds = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    };

    // Count by layer
    const byLayer: Record<LatticeLayer, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    nodes.forEach(n => byLayer[n.layer]++);

    // Calculate average energy
    const avgEnergy = nodes.reduce((sum, n) => sum + n.energy, 0) / nodes.length || 0;

    // Count active agents
    const activeAgents = nodes.reduce((sum, n) => sum + n.assignedAgents.length, 0);

    return {
      nodes,
      edges,
      geometry: {
        bounds,
        center: { x: 0, y: 0 }, // Center-0 is always at origin
        radius: Math.max(
          Math.abs(bounds.maxX - bounds.minX),
          Math.abs(bounds.maxY - bounds.minY)
        ) / 2
      },
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        byLayer,
        avgEnergy,
        activeAgents
      }
    };
  }

  /**
   * Get swarm usage metrics for all nodes
   */
  getSwarmUsage(): SwarmUsageMetrics[] {
    const nodes = this.getNodes();
    const edges = this.getEdges();

    return Array.from(nodes.values()).map(node => {
      // Calculate traffic through this node
      const connectedEdges = Array.from(edges.values()).filter(
        e => e.from === node.id || e.to === node.id
      );

      const inboundTraffic = connectedEdges
        .filter(e => e.to === node.id)
        .reduce((sum, e) => sum + e.traffic, 0);

      const outboundTraffic = connectedEdges
        .filter(e => e.from === node.id)
        .reduce((sum, e) => sum + e.traffic, 0);

      return {
        nodeId: node.id,
        agentCount: node.assignedAgents.length,
        agentIds: node.assignedAgents,
        totalAccesses: node.accessCount,
        energyLevel: node.energy,
        lastActivity: node.lastAccessed,
        inboundTraffic,
        outboundTraffic
      };
    });
  }

  /**
   * Get edge traffic analysis
   */
  getEdgeTraffic(): EdgeTrafficMetrics[] {
    const edges = this.getEdges();

    // Find max traffic for normalization
    const maxTraffic = Math.max(...Array.from(edges.values()).map(e => e.traffic), 1);

    return Array.from(edges.values()).map(edge => {
      const usageRatio = edge.traffic / maxTraffic;
      let usageIntensity: 'high' | 'medium' | 'low' | 'dormant';

      if (usageRatio > 0.7) usageIntensity = 'high';
      else if (usageRatio > 0.3) usageIntensity = 'medium';
      else if (usageRatio > 0.05) usageIntensity = 'low';
      else usageIntensity = 'dormant';

      return {
        edgeId: edge.id,
        from: edge.from,
        to: edge.to,
        strength: edge.strength,
        totalMessages: edge.traffic,
        avgLatency: this.calculateEdgeLatency(edge.id),
        usageIntensity,
        flowDirection: edge.flowDirection
      };
    });
  }

  /**
   * Get energy flow snapshot showing distribution and movement
   */
  getEnergyFlow(): EnergyFlowSnapshot {
    const nodes = Array.from(this.getNodes().values());
    const edges = Array.from(this.getEdges().values());

    const totalEnergy = nodes.reduce((sum, n) => sum + n.energy, 0);
    const centerNode = nodes.find(n => n.layer === 0);
    const centerEnergy = centerNode?.energy || 0;

    // Energy by layer
    const layerDistribution: Record<LatticeLayer, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    nodes.forEach(n => layerDistribution[n.layer] += n.energy);

    // Identify hotspots (high energy, high traffic) and coldspots
    const avgNodeEnergy = totalEnergy / nodes.length;
    const hotspots = nodes
      .filter(n => n.energy > avgNodeEnergy * 1.5 && n.accessCount > 10)
      .map(n => n.id);
    const coldspots = nodes
      .filter(n => n.energy < avgNodeEnergy * 0.3)
      .map(n => n.id);

    // Calculate flow imbalance (clockwise vs counter-clockwise traffic)
    const clockwiseTraffic = edges
      .filter(e => e.flowDirection === 'clockwise')
      .reduce((sum, e) => sum + e.traffic, 0);
    const counterTraffic = edges
      .filter(e => e.flowDirection === 'counterclockwise')
      .reduce((sum, e) => sum + e.traffic, 0);
    const flowImbalance = clockwiseTraffic - counterTraffic;

    return {
      timestamp: Date.now(),
      totalEnergy,
      centerEnergy,
      layerDistribution,
      hotspots,
      coldspots,
      flowImbalance
    };
  }

  /**
   * Generate heatmap of lattice activity
   */
  generateHeatmap(): LatticeHeatmap {
    const nodes = Array.from(this.getNodes().values());
    const edges = Array.from(this.getEdges().values());

    // Calculate intensity based on energy and traffic
    const nodeIntensities = nodes.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      intensity: this.calculateNodeIntensity(n),
      layer: n.layer,
      role: n.role || 'unknown'
    }));

    const edgeIntensities = edges.map(e => ({
      from: e.from,
      to: e.to,
      intensity: e.strength * Math.min(e.traffic / 100, 1), // Normalize
      traffic: e.traffic
    }));

    const intensities = nodeIntensities.map(n => n.intensity);

    return {
      timestamp: Date.now(),
      nodes: nodeIntensities,
      edges: edgeIntensities,
      maxIntensity: Math.max(...intensities, 0.01),
      minIntensity: Math.min(...intensities, 0)
    };
  }

  /**
   * Analyze path usage patterns
   */
  analyzePaths(): PathAnalysis {
    const edges = this.getEdges();
    const nodes = this.getNodes();

    // Find most used routes
    const routeCounts = new Map<string, number>();
    this.routeHistory.forEach(route => {
      const key = `${route.path[0]}→${route.path[route.path.length - 1]}`;
      routeCounts.set(key, (routeCounts.get(key) || 0) + 1);
    });

    const mostUsedRoutes = Array.from(routeCounts.entries())
      .map(([key, count]) => {
        const [from, to] = key.split('→');
        const routes = this.routeHistory.filter(
          r => r.path[0] === from && r.path[r.path.length - 1] === to
        );
        return {
          from,
          to,
          count,
          avgHops: routes.reduce((sum, r) => sum + r.hops, 0) / routes.length || 0,
          avgEnergyCost: routes.reduce((sum, r) => sum + r.energyCost, 0) / routes.length || 0
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Find critical paths (bridges in graph)
    const criticalPaths = this.findCriticalPaths();

    // Find redundant paths (edges with high betweenness alternatives)
    const redundantPaths = this.findRedundantPaths();

    // Find congestion points
    const congestionPoints = Array.from(nodes.values())
      .filter(n => {
        const connectedEdges = Array.from(edges.values()).filter(
          e => e.from === n.id || e.to === n.id
        );
        const totalTraffic = connectedEdges.reduce((sum, e) => sum + e.traffic, 0);
        return totalTraffic > 100 && n.energy < 0.5; // High traffic, low energy = congestion
      })
      .map(n => n.id);

    return {
      mostUsedRoutes,
      criticalPaths,
      redundantPaths,
      congestionPoints
    };
  }

  /**
   * Get current swarm distribution across lattice
   */
  getSwarmDistribution(): SwarmDistribution {
    const nodes = Array.from(this.getNodes().values());
    const timestamp = Date.now();

    // Collect all agents
    const allAgents = new Set<string>();
    const byLayer: Record<LatticeLayer, { count: number; agents: string[]; avgEnergy: number }> = {
      0: { count: 0, agents: [], avgEnergy: 0 },
      1: { count: 0, agents: [], avgEnergy: 0 },
      2: { count: 0, agents: [], avgEnergy: 0 },
      3: { count: 0, agents: [], avgEnergy: 0 }
    };
    const byRole: Record<string, string[]> = {};
    const densityMap = new Map<string, number>();

    nodes.forEach(node => {
      node.assignedAgents.forEach(agentId => {
        allAgents.add(agentId);
        byLayer[node.layer].agents.push(agentId);
        byLayer[node.layer].count++;
        byLayer[node.layer].avgEnergy += node.energy;
        
        if (node.role) {
          if (!byRole[node.role]) byRole[node.role] = [];
          byRole[node.role].push(agentId);
        }
      });
      densityMap.set(node.id, node.assignedAgents.length);
    });

    // Calculate average energies
    (Object.keys(byLayer) as unknown as LatticeLayer[]).forEach(layer => {
      if (byLayer[layer].count > 0) {
        byLayer[layer].avgEnergy /= byLayer[layer].count;
      }
    });

    // Find unassigned agents (tracked in paths but not at nodes)
    const assignedSet = new Set(allAgents);
    const unassigned = Array.from(this.agentPaths.keys()).filter(
      id => !assignedSet.has(id)
    );

    const distribution: SwarmDistribution = {
      timestamp,
      totalAgents: allAgents.size,
      byLayer,
      byRole,
      unassigned,
      densityMap
    };

    // Store snapshot
    this.swarmSnapshots.push(distribution);
    if (this.swarmSnapshots.length > this.maxHistorySize) {
      this.swarmSnapshots.shift();
    }

    return distribution;
  }

  /**
   * Track an agent's movement through the lattice
   */
  trackAgentPath(agentId: string, nodeId: string): void {
    const path = this.agentPaths.get(agentId) || [];
    path.push(nodeId);
    
    // Keep last 100 positions
    if (path.length > 100) path.shift();
    
    this.agentPaths.set(agentId, path);
  }

  /**
   * Record a route for path analysis
   */
  recordRoute(route: LatticeRoute): void {
    this.routeHistory.push(route);
    if (this.routeHistory.length > this.maxHistorySize) {
      this.routeHistory.shift();
    }
  }

  /**
   * Get agent path history
   */
  getAgentPath(agentId: string): string[] | undefined {
    return this.agentPaths.get(agentId);
  }

  /**
   * Get swarm evolution over time
   */
  getSwarmHistory(timeWindowMs: number = 3600000): SwarmDistribution[] {
    const cutoff = Date.now() - timeWindowMs;
    return this.swarmSnapshots.filter(s => s.timestamp >= cutoff);
  }

  /**
   * Export lattice state for external visualization
   */
  exportForVisualization(): {
    nodes: Array<{
      id: string;
      x: number;
      y: number;
      layer: number;
      energy: number;
      role: string;
      agents: number;
      radius: number;
    }>;
    edges: Array<{
      from: string;
      to: string;
      strength: number;
      traffic: number;
      width: number;
    }>;
    agents: Array<{
      id: string;
      currentNode: string;
      path: string[];
    }>;
  } {
    const nodes = Array.from(this.getNodes().values()).map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      layer: n.layer,
      energy: n.energy,
      role: n.role || 'unknown',
      agents: n.assignedAgents.length,
      radius: 5 + n.energy * 10 + n.assignedAgents.length * 2
    }));

    const edges = Array.from(this.getEdges().values()).map(e => ({
      from: e.from,
      to: e.to,
      strength: e.strength,
      traffic: e.traffic,
      width: 1 + e.strength * 3 + Math.min(e.traffic / 50, 3)
    }));

    const agents = Array.from(this.agentPaths.entries()).map(([id, path]) => ({
      id,
      currentNode: path[path.length - 1] || 'unknown',
      path
    }));

    return { nodes, edges, agents };
  }

  // Private helper methods
  private getNodes(): Map<string, LatticeNode> {
    // Access private nodes through reflection or getter
    return (this.lattice as any).nodes || new Map();
  }

  private getEdges(): Map<string, LatticeEdge> {
    return (this.lattice as any).edges || new Map();
  }

  private calculateNodeIntensity(node: LatticeNode): number {
    const energyWeight = node.energy * 0.4;
    const trafficWeight = Math.min(node.accessCount / 100, 1) * 0.4;
    const agentWeight = Math.min(node.assignedAgents.length / 5, 1) * 0.2;
    return energyWeight + trafficWeight + agentWeight;
  }

  private calculateEdgeLatency(edgeId: string): number {
    // Mock latency calculation based on strength and traffic
    const edge = this.getEdges().get(edgeId);
    if (!edge) return 0;
    return (1 - edge.strength) * 50 + edge.traffic * 0.1;
  }

  private findCriticalPaths(): string[] {
    // Simple bridge detection - edges that would disconnect graph if removed
    const edges = Array.from(this.getEdges().values());
    const critical: string[] = [];

    edges.forEach(edge => {
      // Check if this edge is the only connection between its components
      const alternativePaths = this.countAlternativePaths(edge.from, edge.to, edge.id);
      if (alternativePaths === 0) {
        critical.push(edge.id);
      }
    });

    return critical;
  }

  private findRedundantPaths(): string[] {
    const edges = Array.from(this.getEdges().values());
    return edges
      .filter(edge => this.countAlternativePaths(edge.from, edge.to, edge.id) > 2)
      .map(e => e.id);
  }

  private countAlternativePaths(from: string, to: string, excludeEdge: string): number {
    // Simple BFS to count paths excluding the given edge
    const edges = Array.from(this.getEdges().values()).filter(e => e.id !== excludeEdge);
    const adjacency = new Map<string, string[]>();
    
    edges.forEach(e => {
      if (!adjacency.has(e.from)) adjacency.set(e.from, []);
      if (!adjacency.has(e.to)) adjacency.set(e.to, []);
      adjacency.get(e.from)!.push(e.to);
      adjacency.get(e.to)!.push(e.from);
    });

    // BFS
    const visited = new Set<string>();
    const queue: Array<{ node: string; depth: number }> = [{ node: from, depth: 0 }];
    let paths = 0;

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      if (depth > 5) continue; // Limit search depth

      if (node === to) {
        paths++;
        continue;
      }

      visited.add(node);
      const neighbors = adjacency.get(node) || [];
      neighbors.forEach(n => {
        if (!visited.has(n)) {
          queue.push({ node: n, depth: depth + 1 });
        }
      });
    }

    return paths;
  }
}

// Singleton instance
let mapperInstance: LatticeMapper | null = null;

export function getLatticeMapper(lattice: FlowerOfLifeOS): LatticeMapper {
  if (!mapperInstance || (mapperInstance as any).lattice !== lattice) {
    mapperInstance = new LatticeMapper(lattice);
  }
  return mapperInstance;
}
