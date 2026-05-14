/**
 * Entanglement Graph
 * Tracks correlations and entanglements between lattice nodes
 */

export interface Entanglement {
  nodeA: string;
  nodeB: string;
  correlation: number;  // -1 to 1, negative = destructive, positive = constructive
  strength: number;     // 0 to 1, strength of entanglement
  createdAt: number;
  lastUpdated: number;
}

export class EntanglementGraph {
  private entanglements = new Map<string, Entanglement>();
  private nodeConnections = new Map<string, Set<string>>();

  /**
   * Create an entanglement between two nodes
   */
  addEntanglement(nodeA: string, nodeB: string, correlation: number, strength: number): void {
    const key = this.makeKey(nodeA, nodeB);
    const now = Date.now();
    
    this.entanglements.set(key, {
      nodeA,
      nodeB,
      correlation: Math.max(-1, Math.min(1, correlation)),
      strength: Math.max(0, Math.min(1, strength)),
      createdAt: now,
      lastUpdated: now,
    });

    // Track connections
    if (!this.nodeConnections.has(nodeA)) {
      this.nodeConnections.set(nodeA, new Set());
    }
    if (!this.nodeConnections.has(nodeB)) {
      this.nodeConnections.set(nodeB, new Set());
    }
    this.nodeConnections.get(nodeA)!.add(nodeB);
    this.nodeConnections.get(nodeB)!.add(nodeA);
  }

  /**
   * Remove an entanglement
   */
  removeEntanglement(nodeA: string, nodeB: string): boolean {
    const key = this.makeKey(nodeA, nodeB);
    const removed = this.entanglements.delete(key);
    
    if (removed) {
      this.nodeConnections.get(nodeA)?.delete(nodeB);
      this.nodeConnections.get(nodeB)?.delete(nodeA);
    }
    
    return removed;
  }

  /**
   * Get entanglement between two nodes
   */
  getEntanglement(nodeA: string, nodeB: string): Entanglement | undefined {
    return this.entanglements.get(this.makeKey(nodeA, nodeB));
  }

  /**
   * Get all entanglements for a node
   */
  getNodeEntanglements(nodeId: string): Entanglement[] {
    const connected = this.nodeConnections.get(nodeId);
    if (!connected) return [];
    
    return Array.from(connected).map(otherId => 
      this.getEntanglement(nodeId, otherId)!
    );
  }

  /**
   * Calculate interference between two nodes
   */
  calculateInterference(nodeA: string, nodeB: string): number {
    const entanglement = this.getEntanglement(nodeA, nodeB);
    if (!entanglement) return 0;
    
    // Interference = correlation * strength
    return entanglement.correlation * entanglement.strength;
  }

  /**
   * Find the coherence of a node considering all entanglements
   */
  calculateNodeCoherence(nodeId: string, nodeConfidence: number): number {
    const entanglements = this.getNodeEntanglements(nodeId);
    if (entanglements.length === 0) return nodeConfidence;
    
    // Coherence is affected by both supporting and conflicting entanglements
    let coherenceModifier = 0;
    
    for (const e of entanglements) {
      // Constructive interference increases coherence
      // Destructive interference decreases coherence
      coherenceModifier += e.correlation * e.strength * 0.1;
    }
    
    return Math.max(0, Math.min(1, nodeConfidence + coherenceModifier));
  }

  /**
   * Propagate collapse through entanglements
   * Returns affected nodes that should also collapse
   */
  propagateCollapse(nodeId: string, collapsedValue: boolean, confidence: number): Array<{
    nodeId: string;
    suggestedValue: boolean;
    suggestedConfidence: number;
  }> {
    const entanglements = this.getNodeEntanglements(nodeId);
    const affected: Array<{
      nodeId: string;
      suggestedValue: boolean;
      suggestedConfidence: number;
    }> = [];
    
    for (const e of entanglements) {
      // Strong positive correlation -> same value
      // Strong negative correlation -> opposite value
      const otherId = e.nodeA === nodeId ? e.nodeB : e.nodeA;
      
      if (e.strength > 0.7) {
        const suggestedValue = e.correlation > 0 ? collapsedValue : !collapsedValue;
        const suggestedConfidence = confidence * e.strength * Math.abs(e.correlation);
        
        affected.push({
          nodeId: otherId,
          suggestedValue,
          suggestedConfidence,
        });
      }
    }
    
    return affected;
  }

  /**
   * Find coherent path between two nodes
   */
  findCoherentPath(startId: string, goalId: string): string[] | null {
    if (!this.nodeConnections.has(startId) || !this.nodeConnections.has(goalId)) {
      return null;
    }
    
    // BFS with coherence weighting
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: startId, path: [startId] }];
    
    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;
      
      if (nodeId === goalId) {
        return path;
      }
      
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      
      const neighbors = this.nodeConnections.get(nodeId);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            const entanglement = this.getEntanglement(nodeId, neighbor);
            // Only follow strong positive correlations
            if (entanglement && entanglement.correlation > 0 && entanglement.strength > 0.5) {
              queue.push({ nodeId: neighbor, path: [...path, neighbor] });
            }
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Get all nodes in the graph
   */
  getAllNodes(): string[] {
    return Array.from(this.nodeConnections.keys());
  }

  /**
   * Get graph statistics
   */
  getStats(): object {
    return {
      totalEntanglements: this.entanglements.size,
      totalNodes: this.nodeConnections.size,
      avgConnectionsPerNode: this.nodeConnections.size > 0
        ? this.entanglements.size * 2 / this.nodeConnections.size
        : 0,
      strongEntanglements: Array.from(this.entanglements.values()).filter(
        e => e.strength > 0.8
      ).length,
    };
  }

  /**
   * Clear all entanglements
   */
  clear(): void {
    this.entanglements.clear();
    this.nodeConnections.clear();
  }

  private makeKey(nodeA: string, nodeB: string): string {
    // Ensure consistent ordering
    return nodeA < nodeB ? `${nodeA}:${nodeB}` : `${nodeB}:${nodeA}`;
  }
}

export default EntanglementGraph;
