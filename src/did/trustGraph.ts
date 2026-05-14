/**
 * Trust Graph
 * 
 * Manages trust relationships between DIDs using a graph structure.
 * Supports transitive trust, trust scoring, and pathfinding.
 */

import { logger } from '../monitoring/logger.js';
import type { TrustRelationship } from './types.js';

interface TrustGraphConfig {
  maxDepth: number;
  decayFactor: number;
  minConfidenceThreshold: number;
}

interface TrustPath {
  path: string[];
  confidence: number;
  length: number;
}

export class TrustGraph {
  private config: TrustGraphConfig;
  private relationships: Map<string, TrustRelationship> = new Map();
  private adjacencyList: Map<string, Set<string>> = new Map(); // source -> targets

  constructor(config: Partial<TrustGraphConfig> = {}) {
    this.config = {
      maxDepth: 3,
      decayFactor: 0.8,
      minConfidenceThreshold: 0.5,
      ...config
    };
  }

  /**
   * Add a trust relationship
   */
  async addRelationship(relationship: Omit<TrustRelationship, 'timestamp'>): Promise<TrustRelationship> {
    try {
      const fullRelationship: TrustRelationship = {
        ...relationship,
        timestamp: Date.now()
      };

      const key = this.getRelationshipKey(relationship.source, relationship.target);
      this.relationships.set(key, fullRelationship);

      // Update adjacency list
      if (!this.adjacencyList.has(relationship.source)) {
        this.adjacencyList.set(relationship.source, new Set());
      }
      this.adjacencyList.get(relationship.source)!.add(relationship.target);

      logger.info('TrustGraph', {
        message: 'Trust relationship added',
        source: relationship.source,
        target: relationship.target,
        type: relationship.type,
        confidence: relationship.confidence
      });

      return fullRelationship;

    } catch (error) {
      logger.error('TrustGraph', {
        message: 'Failed to add relationship',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Remove a trust relationship
   */
  async removeRelationship(source: string, target: string): Promise<void> {
    const key = this.getRelationshipKey(source, target);
    this.relationships.delete(key);

    // Update adjacency list
    this.adjacencyList.get(source)?.delete(target);

    logger.info('TrustGraph', {
      message: 'Trust relationship removed',
      source,
      target
    });
  }

  /**
   * Get direct trust relationship
   */
  getRelationship(source: string, target: string): TrustRelationship | undefined {
    const key = this.getRelationshipKey(source, target);
    return this.relationships.get(key);
  }

  /**
   * Check if source trusts target (direct or transitive)
   */
  async trusts(source: string, target: string, maxDepth?: number): Promise<{
    trusts: boolean;
    confidence: number;
    path?: TrustPath;
  }> {
    const depth = maxDepth || this.config.maxDepth;

    // Direct trust
    const direct = this.getRelationship(source, target);
    if (direct && direct.confidence >= this.config.minConfidenceThreshold) {
      return {
        trusts: true,
        confidence: direct.confidence,
        path: { path: [source, target], confidence: direct.confidence, length: 1 }
      };
    }

    // Transitive trust (BFS with confidence decay)
    const visited = new Set<string>();
    const queue: Array<{ did: string; path: string[]; confidence: number; depth: number }> = [
      { did: source, path: [source], confidence: 1.0, depth: 0 }
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.did === target) {
        return {
          trusts: true,
          confidence: current.confidence,
          path: { path: current.path, confidence: current.confidence, length: current.path.length - 1 }
        };
      }

      if (current.depth >= depth) continue;
      if (visited.has(current.did)) continue;
      visited.add(current.did);

      // Explore neighbors
      const neighbors = this.adjacencyList.get(current.did) || new Set();
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;

        const rel = this.getRelationship(current.did, neighbor);
        if (!rel) continue;

        const newConfidence = current.confidence * rel.confidence * this.config.decayFactor;
        if (newConfidence >= this.config.minConfidenceThreshold) {
          queue.push({
            did: neighbor,
            path: [...current.path, neighbor],
            confidence: newConfidence,
            depth: current.depth + 1
          });
        }
      }
    }

    return { trusts: false, confidence: 0 };
  }

  /**
   * Calculate trust score for a DID (average incoming trust)
   */
  async calculateTrustScore(did: string): Promise<{
    score: number;
    incomingCount: number;
    outgoingCount: number;
  }> {
    let totalConfidence = 0;
    let incomingCount = 0;

    for (const [key, rel] of this.relationships) {
      if (rel.target === did && rel.confidence >= this.config.minConfidenceThreshold) {
        totalConfidence += rel.confidence;
        incomingCount++;
      }
    }

    const outgoingCount = this.adjacencyList.get(did)?.size || 0;

    const score = incomingCount > 0 ? totalConfidence / incomingCount : 0;

    return {
      score: Math.min(score * 100, 100), // Scale to 0-100
      incomingCount,
      outgoingCount
    };
  }

  /**
   * Find all trusted DIDs (within maxDepth)
   */
  async findTrusted(source: string, minConfidence: number = 0.5): Promise<Array<{
    did: string;
    confidence: number;
    depth: number;
  }>> {
    const trusted: Array<{ did: string; confidence: number; depth: number }> = [];
    const visited = new Map<string, number>(); // did -> max confidence

    const queue: Array<{ did: string; confidence: number; depth: number }> = [
      { did: source, confidence: 1.0, depth: 0 }
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= this.config.maxDepth) continue;

      const neighbors = this.adjacencyList.get(current.did) || new Set();
      for (const neighbor of neighbors) {
        const rel = this.getRelationship(current.did, neighbor);
        if (!rel) continue;

        const newConfidence = current.confidence * rel.confidence * this.config.decayFactor;
        if (newConfidence >= minConfidence) {
          const existingConfidence = visited.get(neighbor) || 0;
          if (newConfidence > existingConfidence) {
            visited.set(neighbor, newConfidence);
            if (neighbor !== source) {
              trusted.push({
                did: neighbor,
                confidence: newConfidence,
                depth: current.depth + 1
              });
            }
            queue.push({ did: neighbor, confidence: newConfidence, depth: current.depth + 1 });
          }
        }
      }
    }

    return trusted.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get all relationships for a DID
   */
  getDIDRelationships(did: string): {
    incoming: TrustRelationship[];
    outgoing: TrustRelationship[];
  } {
    const incoming: TrustRelationship[] = [];
    const outgoing: TrustRelationship[] = [];

    for (const rel of this.relationships.values()) {
      if (rel.target === did) incoming.push(rel);
      if (rel.source === did) outgoing.push(rel);
    }

    return { incoming, outgoing };
  }

  /**
   * Detect trust cycles (circular trust relationships)
   */
  detectCycles(did: string): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (current: string, start: string) => {
      visited.add(current);
      path.push(current);

      const neighbors = this.adjacencyList.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (neighbor === start && path.length > 1) {
          cycles.push([...path]);
        } else if (!visited.has(neighbor) && path.length < 10) {
          dfs(neighbor, start);
        }
      }

      path.pop();
      visited.delete(current);
    };

    dfs(did, did);
    return cycles;
  }

  /**
   * Get trust graph statistics
   */
  getStats() {
    const timestamp = Date.now();
    const types = new Map<string, number>();
    for (const rel of this.relationships.values()) {
      types.set(rel.type, (types.get(rel.type) || 0) + 1);
    }

    return {
      timestamp,
      totalRelationships: this.relationships.size,
      uniqueDIDs: this.adjacencyList.size,
      averageConfidence: Array.from(this.relationships.values())
        .reduce((sum, r) => sum + r.confidence, 0) / this.relationships.size || 0,
      relationshipsByType: Object.fromEntries(types),
      config: this.config
    };
  }

  // Private methods
  private getRelationshipKey(source: string, target: string): string {
    return `${source}→${target}`;
  }
}

// Singleton
let trustGraphInstance: TrustGraph | null = null;

export function getTrustGraph(config?: Partial<TrustGraphConfig>): TrustGraph {
  if (!trustGraphInstance) {
    trustGraphInstance = new TrustGraph(config);
  }
  return trustGraphInstance;
}
