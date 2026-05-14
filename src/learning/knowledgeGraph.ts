/**
 * Vera Knowledge Graph System
 * 
 * Connects memories, patterns, and concepts in a graph structure for:
 * - Relationship discovery ("what relates to HTS tokens?")
 * - Multi-hop reasoning ("HTS → DeFi → Carbon credits")
 * - Knowledge clustering (groups of related concepts)
 * - Anomaly detection (orphaned knowledge, contradictions)
 * 
 * Stored in HCS for verifiable, immutable knowledge topology.
 */

import { hcsBrainRetrieval, RetrievedMemory } from './hcsBrainRetrieval.js';
import { implementationPatterns, ImplementationPattern } from './implementationPatterns.js';
import { logger } from '../monitoring/logger.js';

export interface KnowledgeNode {
  id: string;
  type: 'memory' | 'pattern' | 'concept' | 'tool' | 'entity';
  label: string;
  content: any;
  timestamp: number;
  weight: number; // 0-1 importance
  embedding?: number[]; // For semantic similarity
  metadata: {
    category?: string;
    confidence?: number;
    verified?: boolean;
    usageCount?: number;
  };
}

export interface KnowledgeEdge {
  id: string;
  source: string; // Node ID
  target: string; // Node ID
  type: 'relates_to' | 'depends_on' | 'uses' | 'contradicts' | 'improves' | 'implements' | 'similar_to';
  weight: number; // 0-1 relationship strength
  evidence: string[]; // Memory/pattern IDs supporting this edge
  timestamp: number;
  bidirectional: boolean;
}

interface KnowledgePath {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  totalWeight: number;
  length: number;
  relevance: number;
}

interface ConceptCluster {
  id: string;
  label: string;
  nodes: KnowledgeNode[];
  centroid: number[]; // Average embedding
  density: number; // Internal connectivity
  connections: number; // External connections
}

interface KnowledgeContradiction {
  id: string;
  nodeA: string;
  nodeB: string;
  contradiction: string;
  evidence: RetrievedMemory[];
  resolution?: string;
  confidence: number;
  detectedAt: number;
}

interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  nodeTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
  averageDegree: number;
  clusteringCoefficient: number;
  largestCluster: number;
  orphanedNodes: number;
  contradictions: number;
}

export class KnowledgeGraph {
  private nodes: Map<string, KnowledgeNode> = new Map();
  private edges: Map<string, KnowledgeEdge> = new Map();
  private adjacencyList: Map<string, Set<string>> = new Map(); // node -> neighbors
  private contradictions: Map<string, KnowledgeContradiction> = new Map();
  private clusters: Map<string, ConceptCluster> = new Map();
  private readonly MAX_GRAPH_SIZE = 10000; // Memory limit

  /**
   * Add a memory to the knowledge graph
   */
  async addMemory(memory: RetrievedMemory, embedding?: number[]): Promise<KnowledgeNode> {
    const nodeId = `memory-${memory.topicId}-${memory.sequence}`;
    
    // Extract concepts from memory
    const concepts = this.extractConcepts(memory.content);
    
    const node: KnowledgeNode = {
      id: nodeId,
      type: 'memory',
      label: this.generateLabel(memory),
      content: memory.content,
      timestamp: memory.timestamp.getTime(),
      weight: this.calculateMemoryWeight(memory),
      embedding,
      metadata: {
        category: memory.content?.category,
        confidence: memory.content?.success ? 1 : 0.5,
        verified: memory.content?.success === true
      }
    };

    this.nodes.set(nodeId, node);
    this.adjacencyList.set(nodeId, new Set());

    // Create edges to related concepts
    for (const concept of concepts) {
      const conceptNode = await this.ensureConcept(concept);
      this.addEdge(nodeId, conceptNode.id, 'relates_to', 0.7);
    }

    // Connect to similar memories
    await this.connectSimilarMemories(node);

    // Check for contradictions
    await this.detectContradictions(node);

    logger.debug('KnowledgeGraph', {
      nodeId,
      concepts: concepts.length,
      message: 'Memory added to knowledge graph'
    });

    return node;
  }

  /**
   * Add a pattern to the knowledge graph
   */
  async addPattern(pattern: ImplementationPattern): Promise<KnowledgeNode> {
    const nodeId = `pattern-${pattern.id}`;

    const node: KnowledgeNode = {
      id: nodeId,
      type: 'pattern',
      label: pattern.title,
      content: pattern,
      timestamp: pattern.timestamp,
      weight: pattern.verified ? 1 : 0.6,
      metadata: {
        category: pattern.category,
        confidence: pattern.verified ? 1 : 0.5,
        verified: pattern.verified,
        usageCount: pattern.usedBy?.length || 0
      }
    };

    this.nodes.set(nodeId, node);
    this.adjacencyList.set(nodeId, new Set());

    // Connect to components
    for (const component of pattern.components) {
      const conceptNode = await this.ensureConcept(component, 'tool');
      this.addEdge(nodeId, conceptNode.id, 'uses', 0.9);
    }

    // Connect dependencies
    if (pattern.dependsOn) {
      for (const depId of pattern.dependsOn) {
        this.addEdge(nodeId, `pattern-${depId}`, 'depends_on', 0.9);
      }
    }

    // Connect to related memories
    const relatedMemories = await this.findRelatedMemories(pattern);
    for (const memory of relatedMemories.slice(0, 5)) {
      this.addEdge(nodeId, `memory-${memory.topicId}-${memory.sequence}`, 'implements', 0.6);
    }

    return node;
  }

  /**
   * Extract key concepts from content
   */
  private extractConcepts(content: any): string[] {
    const concepts = new Set<string>();
    const text = JSON.stringify(content).toLowerCase();

    // Hedera-specific concept extraction
    const conceptPatterns = [
      // Tools
      { regex: /hts|token service/gi, concept: 'HTS' },
      { regex: /hcs|consensus|topic/gi, concept: 'HCS' },
      { regex: /smart contract|solidity|evm/gi, concept: 'Smart Contracts' },
      { regex: /saucerswap|dex|swap/gi, concept: 'SaucerSwap' },
      { regex: /bonzo|lending/gi, concept: 'Bonzo' },
      { regex: /dovu|carbon|guardian/gi, concept: 'Carbon' },
      { regex: /x402|payment|escrow/gi, concept: 'Payments' },
      
      // Patterns
      { regex: /create token|mint|airdrop/gi, concept: 'Token Creation' },
      { regex: /liquidity pool|add liquidity/gi, concept: 'Liquidity' },
      { regex: /batch|bulk|optimize/gi, concept: 'Optimization' },
      
      // Languages/Frameworks
      { regex: /typescript|javascript|node/gi, concept: 'TypeScript' },
      { regex: /python|fastapi/gi, concept: 'Python' },
      { regex: /react|vue|angular/gi, concept: 'Frontend' },
    ];

    for (const pattern of conceptPatterns) {
      if (pattern.regex.test(text)) {
        concepts.add(pattern.concept);
      }
    }

    // Extract entity IDs (0.0.xxxxx)
    const entityMatches = text.match(/0\.0\.\d+/g);
    if (entityMatches) {
      for (const match of entityMatches) {
        concepts.add(`Entity:${match}`);
      }
    }

    return Array.from(concepts);
  }

  /**
   * Generate human-readable label for memory
   */
  private generateLabel(memory: RetrievedMemory): string {
    if (memory.content?.user_query) {
      return memory.content.user_query.slice(0, 50) + '...';
    }
    if (memory.content?.category) {
      return `${memory.content.category} interaction`;
    }
    return `Memory #${memory.sequence}`;
  }

  /**
   * Calculate importance weight of memory
   */
  private calculateMemoryWeight(memory: RetrievedMemory): number {
    let weight = 0.5;

    // Success bonus
    if (memory.content?.success) weight += 0.3;

    // Feedback bonus
    if (memory.content?.user_feedback === 'positive') weight += 0.2;

    // Tool usage richness
    if (memory.content?.tools_used?.length > 0) {
      weight += Math.min(memory.content.tools_used.length * 0.05, 0.15);
    }

    // Recency decay (older = less weight)
    const ageDays = (Date.now() - memory.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    const recencyFactor = Math.exp(-ageDays / 30); // Decay over 30 days
    weight *= recencyFactor;

    return Math.min(weight, 1);
  }

  /**
   * Ensure a concept node exists
   */
  private async ensureConcept(label: string, type: 'concept' | 'tool' = 'concept'): Promise<KnowledgeNode> {
    const nodeId = `concept-${label.toLowerCase().replace(/\s+/g, '-')}`;
    
    if (this.nodes.has(nodeId)) {
      return this.nodes.get(nodeId)!;
    }

    const node: KnowledgeNode = {
      id: nodeId,
      type,
      label,
      content: { label, type },
      timestamp: Date.now(),
      weight: 0.8,
      metadata: {}
    };

    this.nodes.set(nodeId, node);
    this.adjacencyList.set(nodeId, new Set());

    return node;
  }

  /**
   * Add edge between nodes
   */
  private addEdge(
    source: string,
    target: string,
    type: KnowledgeEdge['type'],
    weight: number,
    bidirectional: boolean = false
  ): KnowledgeEdge {
    const edgeId = `${source}-${type}-${target}`;
    
    const edge: KnowledgeEdge = {
      id: edgeId,
      source,
      target,
      type,
      weight,
      evidence: [],
      timestamp: Date.now(),
      bidirectional
    };

    this.edges.set(edgeId, edge);
    
    // Update adjacency list
    this.adjacencyList.get(source)?.add(target);
    if (bidirectional) {
      this.adjacencyList.get(target)?.add(source);
    }

    return edge;
  }

  /**
   * Connect similar memories based on semantic similarity
   */
  private async connectSimilarMemories(newNode: KnowledgeNode): Promise<void> {
    if (!newNode.embedding) return;

    for (const [id, node] of this.nodes) {
      if (id === newNode.id || node.type !== 'memory' || !node.embedding) continue;

      const similarity = this.cosineSimilarity(newNode.embedding, node.embedding);
      
      if (similarity > 0.85) {
        this.addEdge(newNode.id, id, 'similar_to', similarity, true);
      }
    }
  }

  /**
   * Find memories related to a pattern
   */
  private async findRelatedMemories(pattern: ImplementationPattern): Promise<RetrievedMemory[]> {
    const keywords = [
      pattern.category,
      ...pattern.components,
      ...pattern.tags
    ];

    return await hcsBrainRetrieval.retrieveContextualMemories({
      query: keywords.join(' '),
      limit: 10
    });
  }

  /**
   * Detect contradictions in knowledge
   */
  private async detectContradictions(newNode: KnowledgeNode): Promise<void> {
    // Check for contradictory edges
    for (const [id, edge] of this.edges) {
      if (edge.type === 'contradicts') continue; // Already known

      // Check if this creates a contradiction
      const contradiction = this.checkContradiction(newNode, edge);
      
      if (contradiction) {
        const contradictionId = `contradiction-${newNode.id}-${edge.target}`;
        
        this.contradictions.set(contradictionId, {
          id: contradictionId,
          nodeA: newNode.id,
          nodeB: edge.target,
          contradiction: contradiction.description,
          evidence: [newNode.content as RetrievedMemory],
          confidence: contradiction.confidence,
          detectedAt: Date.now()
        });

        // Add contradiction edge
        this.addEdge(newNode.id, edge.target, 'contradicts', contradiction.confidence);

        logger.warn('KnowledgeGraph', {
          nodeA: newNode.id,
          nodeB: edge.target,
          description: contradiction.description,
          message: 'Knowledge contradiction detected'
        });
      }
    }
  }

  /**
   * Check if two nodes contradict
   */
  private checkContradiction(nodeA: KnowledgeNode, edge: KnowledgeEdge): 
    { description: string; confidence: number } | null {
    const nodeB = this.nodes.get(edge.target);
    if (!nodeB) return null;

    // Simple contradiction checks
    
    // 1. Same approach, different results
    if (nodeA.type === 'memory' && nodeB.type === 'memory') {
      const aSuccess = nodeA.content?.success;
      const bSuccess = nodeB.content?.success;
      const similarQuery = this.similarStrings(
        nodeA.content?.user_query || '',
        nodeB.content?.user_query || ''
      );

      if (similarQuery > 0.7 && aSuccess !== bSuccess) {
        return {
          description: `Same query approach yielded different results: ${aSuccess ? 'success' : 'failure'} vs ${bSuccess ? 'success' : 'failure'}`,
          confidence: similarQuery
        };
      }
    }

    // 2. Dependency cycles
    if (this.createsCycle(nodeA.id, nodeB.id)) {
      return {
        description: 'Circular dependency detected',
        confidence: 0.9
      };
    }

    return null;
  }

  /**
   * Check if adding edge creates cycle
   */
  private createsCycle(from: string, to: string): boolean {
    const visited = new Set<string>();
    const stack = [to];

    while (stack.length > 0) {
      const current = stack.pop()!;
      
      if (current === from) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      // Follow 'depends_on' edges
      for (const [id, edge] of this.edges) {
        if (edge.source === current && edge.type === 'depends_on') {
          stack.push(edge.target);
        }
      }
    }

    return false;
  }

  /**
   * Calculate string similarity (Jaccard)
   */
  private similarStrings(a: string, b: string): number {
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    
    return intersection.size / union.size;
  }

  /**
   * Find paths between two nodes
   */
  findPaths(sourceId: string, targetId: string, maxLength: number = 3): KnowledgePath[] {
    const paths: KnowledgePath[] = [];
    const visited = new Set<string>();

    const dfs = (current: string, path: KnowledgePath) => {
      if (path.length > maxLength) return;
      if (current === targetId) {
        paths.push({ ...path });
        return;
      }

      visited.add(current);

      const neighbors = this.adjacencyList.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            const edge = this.findEdge(current, neighbor);
            if (edge) {
              const node = this.nodes.get(neighbor);
              if (node) {
                path.nodes.push(node);
                path.edges.push(edge);
                path.totalWeight += edge.weight;
                path.length++;

                dfs(neighbor, path);

                // Backtrack
                path.nodes.pop();
                path.edges.pop();
                path.totalWeight -= edge.weight;
                path.length--;
              }
            }
          }
        }
      }

      visited.delete(current);
    };

    const sourceNode = this.nodes.get(sourceId);
    if (sourceNode) {
      dfs(sourceId, {
        nodes: [sourceNode],
        edges: [],
        totalWeight: 0,
        length: 0,
        relevance: 0
      });
    }

    // Calculate relevance and sort
    return paths
      .map(p => ({
        ...p,
        relevance: p.totalWeight / p.length
      }))
      .sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Find edge between two nodes
   */
  private findEdge(source: string, target: string): KnowledgeEdge | undefined {
    for (const edge of this.edges.values()) {
      if (edge.source === source && edge.target === target) {
        return edge;
      }
      if (edge.bidirectional && edge.source === target && edge.target === source) {
        return edge;
      }
    }
    return undefined;
  }

  /**
   * Cluster knowledge into concept groups
   */
  clusterKnowledge(): ConceptCluster[] {
    const clusters: ConceptCluster[] = [];
    const assigned = new Set<string>();

    // Simple clustering: group by connected components
    for (const [id, node] of this.nodes) {
      if (assigned.has(id)) continue;

      const clusterNodes: KnowledgeNode[] = [node];
      const queue = [id];
      assigned.add(id);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = this.adjacencyList.get(current);

        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!assigned.has(neighbor)) {
              const neighborNode = this.nodes.get(neighbor);
              if (neighborNode) {
                clusterNodes.push(neighborNode);
                queue.push(neighbor);
                assigned.add(neighbor);
              }
            }
          }
        }
      }

      // Calculate cluster metrics
      const connections = clusterNodes.reduce((sum, n) => {
        return sum + (this.adjacencyList.get(n.id)?.size || 0);
      }, 0);

      clusters.push({
        id: `cluster-${clusters.length}`,
        label: this.generateClusterLabel(clusterNodes),
        nodes: clusterNodes,
        centroid: this.calculateCentroid(clusterNodes),
        density: connections / (clusterNodes.length * (clusterNodes.length - 1) || 1),
        connections: connections
      });
    }

    this.clusters = new Map(clusters.map(c => [c.id, c]));
    return clusters;
  }

  /**
   * Generate label for cluster
   */
  private generateClusterLabel(nodes: KnowledgeNode[]): string {
    const typeCounts = new Map<string, number>();
    
    for (const node of nodes) {
      typeCounts.set(node.type, (typeCounts.get(node.type) || 0) + 1);
    }

    const dominantType = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed';

    return `${dominantType} cluster (${nodes.length} nodes)`;
  }

  /**
   * Calculate centroid of cluster (average position)
   */
  private calculateCentroid(nodes: KnowledgeNode[]): number[] {
    const embeddingNodes = nodes.filter(n => n.embedding);
    if (embeddingNodes.length === 0) return [];

    const dims = embeddingNodes[0].embedding!.length;
    const centroid = new Array(dims).fill(0);

    for (const node of embeddingNodes) {
      for (let i = 0; i < dims; i++) {
        centroid[i] += node.embedding![i];
      }
    }

    return centroid.map(v => v / embeddingNodes.length);
  }

  /**
   * Get graph statistics
   */
  getStats(): GraphStats {
    const nodeTypes: Record<string, number> = {};
    const edgeTypes: Record<string, number> = {};

    for (const node of this.nodes.values()) {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
    }

    for (const edge of this.edges.values()) {
      edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1;
    }

    const degrees = Array.from(this.adjacencyList.values()).map(s => s.size);
    const avgDegree = degrees.length > 0 
      ? degrees.reduce((a, b) => a + b, 0) / degrees.length 
      : 0;

    // Count orphaned nodes (no connections)
    const orphaned = Array.from(this.nodes.keys()).filter(id => {
      const neighbors = this.adjacencyList.get(id);
      return !neighbors || neighbors.size === 0;
    }).length;

    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.size,
      nodeTypes,
      edgeTypes,
      averageDegree: avgDegree,
      clusteringCoefficient: this.calculateClusteringCoefficient(),
      largestCluster: Math.max(...Array.from(this.clusters.values()).map(c => c.nodes.length), 0),
      orphanedNodes: orphaned,
      contradictions: this.contradictions.size
    };
  }

  /**
   * Calculate clustering coefficient
   */
  private calculateClusteringCoefficient(): number {
    let total = 0;
    let count = 0;

    for (const [nodeId, neighbors] of this.adjacencyList) {
      if (neighbors.size < 2) continue;

      const neighborArray = Array.from(neighbors);
      let edgesBetweenNeighbors = 0;

      for (let i = 0; i < neighborArray.length; i++) {
        for (let j = i + 1; j < neighborArray.length; j++) {
          if (this.adjacencyList.get(neighborArray[i])?.has(neighborArray[j])) {
            edgesBetweenNeighbors++;
          }
        }
      }

      const possibleEdges = (neighborArray.length * (neighborArray.length - 1)) / 2;
      total += edgesBetweenNeighbors / possibleEdges;
      count++;
    }

    return count > 0 ? total / count : 0;
  }

  /**
   * Calculate cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Prune old/unimportant knowledge
   */
  pruneKnowledge(ageThresholdDays: number = 90, minWeight: number = 0.1): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, node] of this.nodes) {
      const ageDays = (now - node.timestamp) / (1000 * 60 * 60 * 24);
      
      if (ageDays > ageThresholdDays && node.weight < minWeight) {
        // Remove node and its edges
        this.nodes.delete(id);
        this.adjacencyList.delete(id);
        
        // Remove connected edges
        for (const [edgeId, edge] of this.edges) {
          if (edge.source === id || edge.target === id) {
            this.edges.delete(edgeId);
          }
        }
        
        removed++;
      }
    }

    logger.info('KnowledgeGraph', {
      removed,
      remaining: this.nodes.size,
      message: 'Knowledge pruning completed'
    });

    return removed;
  }

  /**
   * Export graph for visualization
   */
  exportGraph(): {
    nodes: KnowledgeNode[];
    edges: KnowledgeEdge[];
    clusters: ConceptCluster[];
    contradictions: KnowledgeContradiction[];
  } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      clusters: Array.from(this.clusters.values()),
      contradictions: Array.from(this.contradictions.values())
    };
  }
}

// Export singleton
export const knowledgeGraph = new KnowledgeGraph();
export default knowledgeGraph;
