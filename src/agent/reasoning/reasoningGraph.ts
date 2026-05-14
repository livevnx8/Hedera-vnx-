/**
 * Reasoning Graph System
 * 
 * Core graph management for Vera's reasoning capabilities.
 * Optimized for QVX GPU acceleration and 4096 token context management.
 */

import Database from 'better-sqlite3';
import { ReasoningNode, NodeType, NodeUtils } from './graphNode.js';
import { ReasoningEdge, EdgeType, EdgeUtils } from './graphEdge.js';
import { logger } from '../../monitoring/logger.js';

export interface GraphQuery {
  nodeIds?: string[];
  nodeTypes?: NodeType[];
  edgeTypes?: EdgeType[];
  userId?: string;
  tags?: string[];
  minConfidence?: number;
  maxDepth?: number;
  includeBidirectional?: boolean;
}

export interface GraphPath {
  nodes: string[];
  edges: string[];
  totalStrength: number;
  pathType: 'causal' | 'logical' | 'semantic' | 'mixed';
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<NodeType, number>;
  edgesByType: Record<EdgeType, number>;
  averageNodeConfidence: number;
  averageEdgeStrength: number;
  connectedComponents: number;
  graphDensity: number;
}

export class ReasoningGraph {
  private db: Database.Database;
  private nodeCache: Map<string, ReasoningNode> = new Map();
  private edgeCache: Map<string, ReasoningEdge> = new Map();
  private maxCacheSize: number = 1000;
  private contextWindowLimit: number = 4096;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    // Create nodes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reasoning_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('concept', 'fact', 'hypothesis', 'inference', 'question', 'claim')),
        content TEXT NOT NULL,
        confidence REAL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
        embedding BLOB,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        user_id TEXT,
        priority REAL DEFAULT 0.5 CHECK (priority >= 0.0 AND priority <= 1.0),
        tags TEXT
      )
    `);

    // Create edges table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reasoning_edges (
        id TEXT PRIMARY KEY,
        from_node TEXT NOT NULL,
        to_node TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('causes', 'implies', 'contradicts', 'supports', 'related', 'exemplifies', 'generalizes', 'questions', 'answers')),
        strength REAL DEFAULT 0.0 CHECK (strength >= 0.0 AND strength <= 1.0),
        evidence TEXT,
        bidirectional BOOLEAN DEFAULT 0,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        user_id TEXT,
        FOREIGN KEY(from_node) REFERENCES reasoning_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY(to_node) REFERENCES reasoning_nodes(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for nodes table
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_nodes_type ON reasoning_nodes(type);
      CREATE INDEX IF NOT EXISTS idx_nodes_user ON reasoning_nodes(user_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_created ON reasoning_nodes(created_at);
      CREATE INDEX IF NOT EXISTS idx_nodes_priority ON reasoning_nodes(priority);
    `);

    // Create indexes for edges table
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_edges_from ON reasoning_edges(from_node);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON reasoning_edges(to_node);
      CREATE INDEX IF NOT EXISTS idx_edges_type ON reasoning_edges(type);
      CREATE INDEX IF NOT EXISTS idx_edges_strength ON reasoning_edges(strength);
    `);

    logger.info('Reasoning graph database initialized');
  }

  // Node Management
  addNode(node: ReasoningNode): boolean {
    try {
      // Check cache first
      if (this.nodeCache.has(node.id)) {
        logger.warn('Node already exists', { nodeId: node.id });
        return false;
      }

      // Insert into database
      const stmt = this.db.prepare(`
        INSERT INTO reasoning_nodes 
        (id, type, content, confidence, embedding, metadata, created_at, updated_at, user_id, priority, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        node.id,
        node.type,
        node.content,
        node.confidence,
        node.embedding ? JSON.stringify(node.embedding) : null,
        JSON.stringify(node.metadata),
        node.createdAt.toISOString(),
        node.updatedAt.toISOString(),
        node.userId || null,
        node.priority,
        JSON.stringify(node.tags)
      );

      // Update cache
      this.updateNodeCache(node);

      logger.debug('Node added to reasoning graph', { nodeId: node.id, type: node.type });
      return true;
    } catch (error) {
      logger.error('Error adding node', { error: error instanceof Error ? error.message : 'Unknown error', nodeId: node.id });
      return false;
    }
  }

  getNode(nodeId: string): ReasoningNode | null {
    // Check cache first
    const cached = this.nodeCache.get(nodeId);
    if (cached) return cached;

    try {
      const stmt = this.db.prepare('SELECT * FROM reasoning_nodes WHERE id = ?');
      const row = stmt.get(nodeId) as any;

      if (!row) return null;

      const node: ReasoningNode = {
        id: row.id,
        type: row.type,
        content: row.content,
        confidence: row.confidence,
        embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        userId: row.user_id,
        priority: row.priority,
        tags: JSON.parse(row.tags || '[]')
      };

      this.updateNodeCache(node);
      return node;
    } catch (error) {
      logger.error('Error getting node', { error: error instanceof Error ? error.message : 'Unknown error', nodeId });
      return null;
    }
  }

  updateNode(node: Partial<ReasoningNode> & { id: string }): boolean {
    try {
      const existing = this.getNode(node.id);
      if (!existing) return false;

      const updated: ReasoningNode = {
        ...existing,
        ...node,
        updatedAt: new Date()
      };

      const stmt = this.db.prepare(`
        UPDATE reasoning_nodes 
        SET content = ?, confidence = ?, embedding = ?, metadata = ?, updated_at = ?, priority = ?, tags = ?
        WHERE id = ?
      `);

      stmt.run(
        updated.content,
        updated.confidence,
        updated.embedding ? JSON.stringify(updated.embedding) : null,
        JSON.stringify(updated.metadata),
        updated.updatedAt.toISOString(),
        updated.priority,
        JSON.stringify(updated.tags),
        updated.id
      );

      // Update cache
      this.nodeCache.set(updated.id, updated);

      logger.debug('Node updated', { nodeId: updated.id });
      return true;
    } catch (error) {
      logger.error('Error updating node', { error: error instanceof Error ? error.message : 'Unknown error', nodeId: node.id });
      return false;
    }
  }

  removeNode(nodeId: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM reasoning_nodes WHERE id = ?');
      const result = stmt.run(nodeId);

      // Remove from cache
      this.nodeCache.delete(nodeId);
      
      // Remove related edges from cache
      this.edgeCache.clear(); // Clear edge cache since edges might be affected

      logger.debug('Node removed', { nodeId, changes: result.changes });
      return result.changes > 0;
    } catch (error) {
      logger.error('Error removing node', { error: error instanceof Error ? error.message : 'Unknown error', nodeId });
      return false;
    }
  }

  // Edge Management
  addEdge(edge: ReasoningEdge): boolean {
    try {
      if (!EdgeUtils.isEdgeValid(edge)) {
        logger.warn('Invalid edge', { edgeId: edge.id });
        return false;
      }

      // Check if nodes exist
      const fromNode = this.getNode(edge.fromNode);
      const toNode = this.getNode(edge.toNode);
      if (!fromNode || !toNode) {
        logger.warn('Edge references non-existent nodes', { 
          edgeId: edge.id, 
          fromNode: edge.fromNode, 
          toNode: edge.toNode 
        });
        return false;
      }

      // Insert into database
      const stmt = this.db.prepare(`
        INSERT INTO reasoning_edges 
        (id, from_node, to_node, type, strength, evidence, bidirectional, metadata, created_at, updated_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        edge.id,
        edge.fromNode,
        edge.toNode,
        edge.type,
        edge.strength,
        JSON.stringify(edge.evidence),
        edge.bidirectional ? 1 : 0,
        JSON.stringify(edge.metadata),
        edge.createdAt.toISOString(),
        edge.updatedAt.toISOString(),
        edge.userId || null
      );

      // Update cache
      this.updateEdgeCache(edge);

      logger.debug('Edge added to reasoning graph', { edgeId: edge.id, type: edge.type });
      return true;
    } catch (error) {
      logger.error('Error adding edge', { error: error instanceof Error ? error.message : 'Unknown error', edgeId: edge.id });
      return false;
    }
  }

  getEdge(edgeId: string): ReasoningEdge | null {
    // Check cache first
    const cached = this.edgeCache.get(edgeId);
    if (cached) return cached;

    try {
      const stmt = this.db.prepare('SELECT * FROM reasoning_edges WHERE id = ?');
      const row = stmt.get(edgeId) as any;

      if (!row) return null;

      const edge: ReasoningEdge = {
        id: row.id,
        fromNode: row.from_node,
        toNode: row.to_node,
        type: row.type,
        strength: row.strength,
        evidence: JSON.parse(row.evidence || '[]'),
        bidirectional: Boolean(row.bidirectional),
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        userId: row.user_id
      };

      this.updateEdgeCache(edge);
      return edge;
    } catch (error) {
      logger.error('Error getting edge', { error: error instanceof Error ? error.message : 'Unknown error', edgeId });
      return null;
    }
  }

  updateEdge(edge: Partial<ReasoningEdge> & { id: string }): boolean {
    try {
      const existing = this.getEdge(edge.id);
      if (!existing) return false;

      const updated: ReasoningEdge = {
        ...existing,
        ...edge,
        updatedAt: new Date()
      };

      const stmt = this.db.prepare(`
        UPDATE reasoning_edges 
        SET strength = ?, evidence = ?, bidirectional = ?, metadata = ?, updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        updated.strength,
        JSON.stringify(updated.evidence),
        updated.bidirectional ? 1 : 0,
        JSON.stringify(updated.metadata),
        updated.updatedAt.toISOString(),
        updated.id
      );

      // Update cache
      this.edgeCache.set(updated.id, updated);

      logger.debug('Edge updated', { edgeId: updated.id });
      return true;
    } catch (error) {
      logger.error('Error updating edge', { error: error instanceof Error ? error.message : 'Unknown error', edgeId: edge.id });
      return false;
    }
  }

  removeEdge(edgeId: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM reasoning_edges WHERE id = ?');
      const result = stmt.run(edgeId);

      // Remove from cache
      this.edgeCache.delete(edgeId);

      logger.debug('Edge removed', { edgeId, changes: result.changes });
      return result.changes > 0;
    } catch (error) {
      logger.error('Error removing edge', { error: error instanceof Error ? error.message : 'Unknown error', edgeId });
      return false;
    }
  }

  // Graph Traversal and Query
  findPath(fromNodeId: string, toNodeId: string, maxDepth: number = 5): GraphPath[] {
    const paths: GraphPath[] = [];
    const visited = new Set<string>();
    const queue: Array<{ node: string; path: string[]; edges: string[]; strength: number }> = [
      { node: fromNodeId, path: [fromNodeId], edges: [], strength: 1.0 }
    ];

    while (queue.length > 0) {
      const { node, path, edges, strength } = queue.shift()!;

      if (node === toNodeId) {
        paths.push({ nodes: path, edges, totalStrength: strength, pathType: 'mixed' });
        continue;
      }

      if (visited.has(node) || path.length > maxDepth) continue;
      visited.add(node);

      const adjacentEdges = this.getAdjacentEdges(node);
      for (const edge of adjacentEdges) {
        const nextNode = edge.fromNode === node ? edge.toNode : edge.fromNode;
        if (!visited.has(nextNode)) {
          queue.push({
            node: nextNode,
            path: [...path, nextNode],
            edges: [...edges, edge.id],
            strength: strength * EdgeUtils.getEdgeWeight(edge)
          });
        }
      }
    }

    return paths.sort((a, b) => b.totalStrength - a.totalStrength);
  }

  getAdjacentEdges(nodeId: string): ReasoningEdge[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM reasoning_edges 
        WHERE from_node = ? OR (to_node = ? AND bidirectional = 1)
      `);
      const rows = stmt.all(nodeId, nodeId) as any[];

      return rows.map(row => ({
        id: row.id,
        fromNode: row.from_node,
        toNode: row.to_node,
        type: row.type,
        strength: row.strength,
        evidence: JSON.parse(row.evidence || '[]'),
        bidirectional: Boolean(row.bidirectional),
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        userId: row.user_id
      }));
    } catch (error) {
      logger.error('Error getting adjacent edges', { error: error instanceof Error ? error.message : 'Unknown error', nodeId });
      return [];
    }
  }

  query(query: GraphQuery): { nodes: ReasoningNode[]; edges: ReasoningEdge[] } {
    let nodes: ReasoningNode[] = [];
    let edges: ReasoningEdge[] = [];

    // Query nodes
    if (query.nodeIds) {
      nodes = query.nodeIds.map(id => this.getNode(id)).filter(Boolean) as ReasoningNode[];
    } else {
      // Build dynamic query based on parameters
      let sql = 'SELECT * FROM reasoning_nodes WHERE 1=1';
      const params: any[] = [];

      if (query.nodeTypes && query.nodeTypes.length > 0) {
        sql += ` AND type IN (${query.nodeTypes.map(() => '?').join(', ')})`;
        params.push(...query.nodeTypes);
      }

      if (query.userId) {
        sql += ' AND user_id = ?';
        params.push(query.userId);
      }

      if (query.minConfidence) {
        sql += ' AND confidence >= ?';
        params.push(query.minConfidence);
      }

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      nodes = rows.map(row => ({
        id: row.id,
        type: row.type,
        content: row.content,
        confidence: row.confidence,
        embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        userId: row.user_id,
        priority: row.priority,
        tags: JSON.parse(row.tags || '[]')
      }));

      // Filter by tags if specified
      if (query.tags && query.tags.length > 0) {
        nodes = nodes.filter(node => 
          query.tags!.some(tag => node.tags.includes(tag))
        );
      }
    }

    // Query edges
    if (nodes.length > 0) {
      const nodeIds = nodes.map(n => n.id);
      const placeholders = nodeIds.map(() => '?').join(',');
      
      let edgeSql = `SELECT * FROM reasoning_edges WHERE from_node IN (${placeholders}) OR to_node IN (${placeholders})`;
      const edgeParams = [...nodeIds, ...nodeIds];

      if (query.edgeTypes && query.edgeTypes.length > 0) {
        edgeSql += ` AND type IN (${query.edgeTypes.map(() => '?').join(', ')})`;
        edgeParams.push(...query.edgeTypes);
      }

      const edgeStmt = this.db.prepare(edgeSql);
      const edgeRows = edgeStmt.all(...edgeParams) as any[];

      edges = edgeRows.map(row => ({
        id: row.id,
        fromNode: row.from_node,
        toNode: row.to_node,
        type: row.type,
        strength: row.strength,
        evidence: JSON.parse(row.evidence || '[]'),
        bidirectional: Boolean(row.bidirectional),
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        userId: row.user_id
      }));
    }

    return { nodes, edges };
  }

  // Context Management for QVX
  getContextForNodes(nodeIds: string[], maxTokens: number = 2000): { nodes: ReasoningNode[]; edges: ReasoningEdge[]; tokensUsed: number } {
    const nodes: ReasoningNode[] = [];
    const edges: ReasoningEdge[] = [];
    let tokensUsed = 0;

    // Add nodes by priority
    const sortedNodes = nodeIds
      .map(id => this.getNode(id))
      .filter(Boolean) as ReasoningNode[];
    
    sortedNodes.sort((a: ReasoningNode, b: ReasoningNode) => b.priority - a.priority);

    for (const node of sortedNodes) {
      const nodeTokens = NodeUtils.estimateTokenCount(node);
      
      if (tokensUsed + nodeTokens > maxTokens) {
        break;
      }
      
      nodes.push(node);
      tokensUsed += nodeTokens;
      
      // Add relevant edges
      const nodeEdges = this.getEdgesForNode(node.id);
      edges.push(...nodeEdges);
    }
    
    return { nodes, edges, tokensUsed };
  }

  // Helper method to get edges for a node
  private getEdgesForNode(nodeId: string): ReasoningEdge[] {
    try {
      const edgeRecords = this.db.prepare('SELECT * FROM reasoning_edges WHERE fromNode = ? OR toNode = ?').all(nodeId, nodeId) as any[];
      return edgeRecords.map(record => ({
        id: record.id,
        fromNode: record.fromNode,
        toNode: record.toNode,
        type: record.type as EdgeType,
        strength: record.strength,
        evidence: JSON.parse(record.evidence || '[]'),
        bidirectional: record.bidirectional === 1,
        metadata: JSON.parse(record.metadata || '{}'),
        timestamp: new Date(record.timestamp),
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt)
      }));
    } catch (error) {
      logger.error('Error getting edges for node', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  // Statistics and Analysis
  getStats(): GraphStats {
    try {
      const nodeStats = this.db.prepare('SELECT type, COUNT(*) as count FROM reasoning_nodes GROUP BY type').all() as any[];
      const edgeStats = this.db.prepare('SELECT type, COUNT(*) as count FROM reasoning_edges GROUP BY type').all() as any[];
      const avgConfidence = this.db.prepare('SELECT AVG(confidence) as avg FROM reasoning_nodes').get() as any;
      const avgStrength = this.db.prepare('SELECT AVG(strength) as avg FROM reasoning_edges').get() as any;

      const nodesByType = nodeStats.reduce((acc, row) => {
        acc[row.type as NodeType] = row.count as number;
        return acc;
      }, {} as Record<NodeType, number>);

      const edgesByType = edgeStats.reduce((acc, row) => {
        acc[row.type as EdgeType] = row.count as number;
        return acc;
      }, {} as Record<EdgeType, number>);

      const totalNodes = Object.values(nodesByType).reduce((sum: number, count: number) => sum + count, 0) as number;
      const totalEdges = Object.values(edgesByType).reduce((sum: number, count: number) => sum + count, 0) as number;

      // Calculate connected components using Union-Find algorithm
      const connectedComponents = this.calculateConnectedComponents();

      return {
        totalNodes: totalNodes as number,
        totalEdges: totalEdges as number,
        nodesByType,
        edgesByType,
        averageNodeConfidence: (avgConfidence?.avg as number) || 0,
        averageEdgeStrength: (avgStrength?.avg as number) || 0,
        connectedComponents,
        graphDensity: totalNodes > 1 ? (2 * totalEdges) / (totalNodes * (totalNodes - 1)) : 0
      };
    } catch (error) {
      logger.error('Error getting graph stats', { error: error instanceof Error ? error.message : 'Unknown error' });
      return {
        totalNodes: 0,
        totalEdges: 0,
        nodesByType: {} as Record<NodeType, number>,
        edgesByType: {} as Record<EdgeType, number>,
        averageNodeConfidence: 0,
        averageEdgeStrength: 0,
        connectedComponents: 0,
        graphDensity: 0
      };
    }
  }

  // IQ Enhancement: Advanced Inference and Reasoning
  /**
   * Perform multi-hop reasoning to infer new facts from existing knowledge
   * This enhances IQ by connecting disparate pieces of information
   */
  inferFromChain(startNodeId: string, reasoningDepth: number = 3): {
    inferredFacts: Array<{ fact: string; confidence: number; path: string[]; inferenceType: string }>;
    confidenceScore: number;
    reasoningChain: string[];
  } {
    try {
      const inferredFacts: Array<{ fact: string; confidence: number; path: string[]; inferenceType: string }> = [];
      const visited = new Set<string>();
      const queue: Array<{ nodeId: string; path: string[]; accumulatedConfidence: number; depth: number }> = [
        { nodeId: startNodeId, path: [startNodeId], accumulatedConfidence: 1.0, depth: 0 }
      ];

      while (queue.length > 0) {
        const { nodeId, path, accumulatedConfidence, depth } = queue.shift()!;
        
        if (visited.has(nodeId) || depth > reasoningDepth) continue;
        visited.add(nodeId);

        const node = this.getNode(nodeId);
        if (!node) continue;

        // Get adjacent edges for reasoning
        const adjacentEdges = this.getAdjacentEdges(nodeId);
        
        for (const edge of adjacentEdges) {
          const nextNodeId = edge.fromNode === nodeId ? edge.toNode : edge.fromNode;
          const nextNode = this.getNode(nextNodeId);
          if (!nextNode || visited.has(nextNodeId)) continue;

          // Calculate inference confidence based on edge strength and node confidence
          const inferenceConfidence = accumulatedConfidence * edge.strength * nextNode.confidence;
          
          // Adaptive threshold: deeper chains naturally have lower confidence
          // Scale threshold down significantly for deep reasoning (0.7 -> 0.3 over depth)
          const adaptiveThreshold = Math.max(0.3, 0.7 - (depth * 0.08));
          
          // Only consider high-confidence inferences (IQ threshold)
          if (inferenceConfidence > adaptiveThreshold) {
            const inferenceType = this.determineInferenceType(edge.type, node.type, nextNode.type);
            const inferredFact = this.generateInferredFact(node, nextNode, edge, inferenceType);
            
            if (inferredFact) {
              inferredFacts.push({
                fact: inferredFact,
                confidence: inferenceConfidence,
                path: [...path, nextNodeId],
                inferenceType
              });
            }

            queue.push({
              nodeId: nextNodeId,
              path: [...path, nextNodeId],
              accumulatedConfidence: inferenceConfidence,
              depth: depth + 1
            });
          }
        }
      }

      // Sort by confidence and deduplicate
      const uniqueFacts = this.deduplicateInferences(inferredFacts);
      const confidenceScore = uniqueFacts.reduce((sum, f) => sum + f.confidence, 0) / Math.max(1, uniqueFacts.length);

      return {
        inferredFacts: uniqueFacts.slice(0, 10), // Top 10 most confident inferences
        confidenceScore,
        reasoningChain: Array.from(visited)
      };
    } catch (error) {
      logger.error('Error in inference chain', { error: error instanceof Error ? error.message : 'Unknown error', startNodeId });
      return { inferredFacts: [], confidenceScore: 0, reasoningChain: [] };
    }
  }

  /**
   * Detect patterns in the reasoning graph to enhance IQ
   * Identifies recurring structures, causal chains, and logical patterns
   */
  detectPatterns(): {
    causalChains: Array<{ chain: string[]; strength: number; pattern: string }>;
    logicalClusters: Array<{ nodes: string[]; theme: string; coherence: number }>;
    contradictions: Array<{ node1: string; node2: string; severity: number }>;
    knowledgeGaps: Array<{ relatedNodes: string[]; suggestedFill: string; priority: number }>;
  } {
    const causalChains: Array<{ chain: string[]; strength: number; pattern: string }> = [];
    const logicalClusters: Array<{ nodes: string[]; theme: string; coherence: number }> = [];
    const contradictions: Array<{ node1: string; node2: string; severity: number }> = [];
    const knowledgeGaps: Array<{ relatedNodes: string[]; suggestedFill: string; priority: number }> = [];

    try {
      // Find causal chains (sequences of 'causes' OR 'implies' edges - enhanced for training data)
      const causalEdges = [...this.getEdgesByType('causes'), ...this.getEdgesByType('implies')];
      const chainPaths = this.findLongPaths(causalEdges, 2); // Lower threshold from 3 to 2
      
      for (const path of chainPaths) {
        const strength = this.calculateChainStrength(path);
        if (strength > 0.5) { // Lower threshold from 0.6 to 0.5
          causalChains.push({
            chain: path,
            strength,
            pattern: this.identifyPatternType(path)
          });
        }
      }

      // Find logical clusters (groups of highly interconnected nodes)
      const clusters = this.findLogicalClusters();
      for (const cluster of clusters) {
        const coherence = this.calculateClusterCoherence(cluster);
        if (coherence > 0.5) { // Lower threshold from 0.7 to 0.5
          logicalClusters.push({
            nodes: cluster,
            theme: this.extractClusterTheme(cluster),
            coherence
          });
        }
      }

      // Detect contradictions (nodes connected by 'contradicts' edges)
      const contradictEdges = this.getEdgesByType('contradicts');
      for (const edge of contradictEdges) {
        const severity = edge.strength * 10; // Scale to 0-10
        if (severity > 5) {
          contradictions.push({
            node1: edge.fromNode,
            node2: edge.toNode,
            severity
          });
        }
      }

      // Identify knowledge gaps (nodes with few connections)
      const gaps = this.identifyKnowledgeGaps();
      knowledgeGaps.push(...gaps);

      return { causalChains, logicalClusters, contradictions, knowledgeGaps };
    } catch (error) {
      logger.error('Error detecting patterns', { error: error instanceof Error ? error.message : 'Unknown error' });
      return { causalChains, logicalClusters, contradictions, knowledgeGaps };
    }
  }

  /**
   * Propagate confidence through the reasoning graph
   * Updates node confidences based on their connections (IQ enhancement)
   */
  propagateConfidence(iterations: number = 3): void {
    try {
      for (let i = 0; i < iterations; i++) {
        const nodes = this.getAllNodes();
        
        for (const node of nodes) {
          const adjacentEdges = this.getAdjacentEdges(node.id);
          if (adjacentEdges.length === 0) continue;

          // Calculate new confidence based on neighbors
          let totalWeightedConfidence = node.confidence * 0.5; // Preserve original confidence
          let totalWeight = 0.5;

          for (const edge of adjacentEdges) {
            const neighborId = edge.fromNode === node.id ? edge.toNode : edge.fromNode;
            const neighbor = this.getNode(neighborId);
            if (!neighbor) continue;

            const weight = edge.strength * (edge.type === 'supports' ? 1.2 : 1.0);
            totalWeightedConfidence += neighbor.confidence * weight;
            totalWeight += weight;
          }

          const newConfidence = totalWeightedConfidence / totalWeight;
          const boundedConfidence = Math.max(0.1, Math.min(0.95, newConfidence)); // IQ bounds

          // Only update if significant change
          if (Math.abs(boundedConfidence - node.confidence) > 0.05) {
            this.updateNode({ id: node.id, confidence: boundedConfidence });
          }
        }
      }
      
      logger.info('Confidence propagation completed', { iterations });
    } catch (error) {
      logger.error('Error propagating confidence', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Meta-cognition: Analyze the reasoning process itself
   * Evaluates the quality and reliability of the reasoning graph
   */
  analyzeReasoningQuality(): {
    overallQuality: number;
    reasoningDepth: number;
    logicalConsistency: number;
    knowledgeCompleteness: number;
    suggestedImprovements: string[];
    cognitiveBiases: string[];
  } {
    try {
      const stats = this.getStats();
      const patterns = this.detectPatterns();

      // Calculate quality metrics (IQ assessment)
      const reasoningDepth = this.calculateReasoningDepth();
      const logicalConsistency = 1 - (patterns.contradictions.length / Math.max(1, stats.totalEdges));
      const knowledgeCompleteness = this.calculateKnowledgeCompleteness();

      // Overall quality score (0-1, higher is better IQ)
      const overallQuality = (
        stats.averageNodeConfidence * 0.3 +
        stats.averageEdgeStrength * 0.2 +
        logicalConsistency * 0.3 +
        Math.min(1, reasoningDepth / 5) * 0.2
      );

      // Generate improvement suggestions
      const suggestedImprovements: string[] = [];
      if (patterns.knowledgeGaps.length > 5) {
        suggestedImprovements.push(`Fill ${patterns.knowledgeGaps.length} identified knowledge gaps`);
      }
      if (patterns.contradictions.length > 0) {
        suggestedImprovements.push(`Resolve ${patterns.contradictions.length} logical contradictions`);
      }
      if (stats.averageNodeConfidence < 0.7) {
        suggestedImprovements.push('Increase node confidence through evidence strengthening');
      }
      if (reasoningDepth < 3) {
        suggestedImprovements.push('Deepen reasoning chains for more sophisticated inferences');
      }

      // Detect potential cognitive biases
      const cognitiveBiases = this.detectCognitiveBiases(patterns);

      return {
        overallQuality,
        reasoningDepth,
        logicalConsistency,
        knowledgeCompleteness,
        suggestedImprovements,
        cognitiveBiases
      };
    } catch (error) {
      logger.error('Error analyzing reasoning quality', { error: error instanceof Error ? error.message : 'Unknown error' });
      return {
        overallQuality: 0,
        reasoningDepth: 0,
        logicalConsistency: 0,
        knowledgeCompleteness: 0,
        suggestedImprovements: [],
        cognitiveBiases: []
      };
    }
  }

  // Helper methods for IQ enhancement

  private determineInferenceType(edgeType: string, fromType: string, toType: string): string {
    const inferenceMap: Record<string, string> = {
      'causes': 'causal_inference',
      'implies': 'logical_inference',
      'supports': 'evidential_inference',
      'generalizes': 'abstraction_inference',
      'exemplifies': 'instantiation_inference',
      'answers': 'explanatory_inference'
    };
    return inferenceMap[edgeType] || 'associative_inference';
  }

  private generateInferredFact(node1: ReasoningNode, node2: ReasoningNode, edge: ReasoningEdge, inferenceType: string): string | null {
    try {
      switch (inferenceType) {
        case 'causal_inference':
          return `${node1.content} leads to ${node2.content}`;
        case 'logical_inference':
          return `If ${node1.content}, then ${node2.content}`;
        case 'evidential_inference':
          return `${node1.content} provides evidence for ${node2.content}`;
        case 'abstraction_inference':
          return `${node2.content} is a generalization of ${node1.content}`;
        default:
          return `${node1.content} is related to ${node2.content} via ${edge.type}`;
      }
    } catch {
      return null;
    }
  }

  private deduplicateInferences(inferences: Array<{ fact: string; confidence: number; path: string[]; inferenceType: string }>): typeof inferences {
    const seen = new Set<string>();
    return inferences.filter(inf => {
      const key = inf.fact.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private getEdgesByType(type: string): ReasoningEdge[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM reasoning_edges WHERE type = ?');
      const rows = stmt.all(type) as any[];
      return rows.map(row => ({
        id: row.id,
        fromNode: row.from_node,
        toNode: row.to_node,
        type: row.type,
        strength: row.strength,
        evidence: JSON.parse(row.evidence || '[]'),
        bidirectional: Boolean(row.bidirectional),
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        userId: row.user_id
      }));
    } catch (error) {
      logger.error('Error getting edges by type', { error: error instanceof Error ? error.message : 'Unknown error', type });
      return [];
    }
  }

  private findLongPaths(edges: ReasoningEdge[], minLength: number): string[][] {
    const paths: string[][] = [];
    const adjacency = new Map<string, string[]>();

    // Build adjacency list
    for (const edge of edges) {
      if (!adjacency.has(edge.fromNode)) adjacency.set(edge.fromNode, []);
      adjacency.get(edge.fromNode)!.push(edge.toNode);
    }

    // Find paths
    for (const [start] of adjacency) {
      const visited = new Set<string>();
      const path: string[] = [start];
      
      const dfs = (node: string) => {
        if (path.length >= minLength) {
          paths.push([...path]);
        }
        
        const neighbors = adjacency.get(node) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            path.push(neighbor);
            dfs(neighbor);
            path.pop();
            visited.delete(neighbor);
          }
        }
      };

      visited.add(start);
      dfs(start);
    }

    return paths;
  }

  private calculateChainStrength(path: string[]): number {
    let strength = 1.0;
    for (let i = 0; i < path.length - 1; i++) {
      const edges = this.getAdjacentEdges(path[i]).filter(e => 
        e.toNode === path[i + 1] || (e.bidirectional && e.fromNode === path[i + 1])
      );
      const maxStrength = Math.max(...edges.map(e => e.strength), 0);
      strength *= maxStrength;
    }
    return strength;
  }

  private identifyPatternType(path: string[]): string {
    if (path.length < 2) return 'simple';
    if (path.length > 5) return 'complex_chain';
    
    const nodes = path.map(id => this.getNode(id)).filter(Boolean);
    const types = nodes.map(n => n!.type);
    
    if (types.includes('hypothesis') && types.includes('fact')) return 'hypothesis_validation';
    if (types.every(t => t === 'fact')) return 'factual_chain';
    if (types.includes('inference')) return 'inference_chain';
    
    return 'mixed_chain';
  }

  private findLogicalClusters(): string[][] {
    // Simple clustering based on connectivity
    const clusters: string[][] = [];
    const visited = new Set<string>();
    const allNodes = this.getAllNodes();

    for (const node of allNodes) {
      if (visited.has(node.id)) continue;
      
      const cluster: string[] = [];
      const queue = [node.id];
      
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        
        visited.add(current);
        cluster.push(current);
        
        const edges = this.getAdjacentEdges(current);
        for (const edge of edges) {
          const neighbor = edge.fromNode === current ? edge.toNode : edge.fromNode;
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
      
      if (cluster.length > 2) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  private calculateClusterCoherence(cluster: string[]): number {
    if (cluster.length < 2) return 1.0;
    
    let totalStrength = 0;
    let edgeCount = 0;
    
    for (const nodeId of cluster) {
      const edges = this.getAdjacentEdges(nodeId);
      for (const edge of edges) {
        const neighbor = edge.fromNode === nodeId ? edge.toNode : edge.fromNode;
        if (cluster.includes(neighbor)) {
          totalStrength += edge.strength;
          edgeCount++;
        }
      }
    }
    
    const maxPossibleEdges = cluster.length * (cluster.length - 1);
    return edgeCount > 0 ? (totalStrength / edgeCount) * (edgeCount / maxPossibleEdges) : 0;
  }

  private extractClusterTheme(cluster: string[]): string {
    const nodes = cluster.map(id => this.getNode(id)).filter(Boolean);
    const types = nodes.map(n => n!.type);
    const contents = nodes.map(n => n!.content.toLowerCase());
    
    // Extract common themes
    if (types.filter(t => t === 'concept').length > types.length / 2) return 'conceptual';
    if (types.filter(t => t === 'fact').length > types.length / 2) return 'factual';
    if (types.filter(t => t === 'hypothesis').length > 0) return 'hypothetical';
    
    // Check for domain-specific themes
    if (contents.some(c => c.includes('quantum'))) return 'quantum_reasoning';
    if (contents.some(c => c.includes('hedera'))) return 'hedera_knowledge';
    if (contents.some(c => c.includes('blockchain'))) return 'blockchain_domain';
    
    return 'general_knowledge';
  }

  private identifyKnowledgeGaps(): Array<{ relatedNodes: string[]; suggestedFill: string; priority: number }> {
    const gaps: Array<{ relatedNodes: string[]; suggestedFill: string; priority: number }> = [];
    const allNodes = this.getAllNodes();
    
    for (const node of allNodes) {
      const edges = this.getAdjacentEdges(node.id);
      
      // Nodes with very few connections might indicate knowledge gaps
      if (edges.length <= 1 && node.type === 'question') {
        const relatedNodes = edges.map(e => e.fromNode === node.id ? e.toNode : e.fromNode);
        gaps.push({
          relatedNodes,
          suggestedFill: `Answer to: ${node.content}`,
          priority: node.priority
        });
      }
    }
    
    return gaps.sort((a, b) => b.priority - a.priority).slice(0, 10);
  }

  private calculateReasoningDepth(): number {
    const allPaths = this.findLongPaths(this.getEdgesByType('implies'), 2);
    return allPaths.length > 0 ? Math.max(...allPaths.map(p => p.length)) : 0;
  }

  private calculateKnowledgeCompleteness(): number {
    const stats = this.getStats();
    const idealRatio = 1.5; // Ideal edges to nodes ratio
    const actualRatio = stats.totalNodes > 0 ? stats.totalEdges / stats.totalNodes : 0;
    return Math.min(1, actualRatio / idealRatio);
  }

  /**
   * Calculate connected components using Union-Find (Disjoint Set Union)
   * Returns the number of disconnected subgraphs in the reasoning graph
   */
  private calculateConnectedComponents(): number {
    try {
      const allNodes = this.getAllNodes();
      if (allNodes.length === 0) return 0;

      // Union-Find data structure
      const parent = new Map<string, string>();
      const rank = new Map<string, number>();

      // Initialize each node as its own set
      for (const node of allNodes) {
        parent.set(node.id, node.id);
        rank.set(node.id, 0);
      }

      // Find with path compression
      const find = (x: string): string => {
        if (parent.get(x) !== x) {
          parent.set(x, find(parent.get(x)!));
        }
        return parent.get(x)!;
      };

      // Union by rank
      const union = (x: string, y: string): void => {
        const rootX = find(x);
        const rootY = find(y);

        if (rootX === rootY) return;

        const rankX = rank.get(rootX) || 0;
        const rankY = rank.get(rootY) || 0;

        if (rankX < rankY) {
          parent.set(rootX, rootY);
        } else if (rankX > rankY) {
          parent.set(rootY, rootX);
        } else {
          parent.set(rootY, rootX);
          rank.set(rootX, rankX + 1);
        }
      };

      // Process all edges to union connected nodes
      const allEdges = this.getEdgesByType('implies')
        .concat(this.getEdgesByType('supports'))
        .concat(this.getEdgesByType('causes'));

      for (const edge of allEdges) {
        union(edge.fromNode, edge.toNode);
      }

      // Count unique roots (connected components)
      const uniqueRoots = new Set<string>();
      for (const node of allNodes) {
        uniqueRoots.add(find(node.id));
      }

      return uniqueRoots.size;
    } catch (error) {
      logger.error('Error calculating connected components', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return 0;
    }
  }

  private detectCognitiveBiases(patterns: any): string[] {
    const biases: string[] = [];
    
    // Check for confirmation bias (only 'supports' edges, no 'contradicts')
    const supportEdges = this.getEdgesByType('supports');
    const contradictEdges = this.getEdgesByType('contradicts');
    if (supportEdges.length > 0 && contradictEdges.length === 0) {
      biases.push('potential_confirmation_bias');
    }
    
    // Check for overconfidence (high confidence without supporting evidence)
    const allNodes = this.getAllNodes();
    const overconfidentNodes = allNodes.filter(n => n.confidence > 0.9 && this.getAdjacentEdges(n.id).length < 2);
    if (overconfidentNodes.length > allNodes.length * 0.2) {
      biases.push('overconfidence_in_underconnected_nodes');
    }
    
    return biases;
  }

  private getAllNodes(): ReasoningNode[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM reasoning_nodes');
      const rows = stmt.all() as any[];
      return rows.map(row => ({
        id: row.id,
        type: row.type,
        content: row.content,
        confidence: row.confidence,
        embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        userId: row.user_id,
        priority: row.priority,
        tags: JSON.parse(row.tags || '[]')
      }));
    } catch (error) {
      logger.error('Error getting all nodes', { error: error instanceof Error ? error.message : 'Unknown error' });
      return [];
    }
  }

  // Cache Management
  private updateNodeCache(node: ReasoningNode): void {
    if (this.nodeCache.size >= this.maxCacheSize) {
      // Remove least recently used items
      const firstKey = this.nodeCache.keys().next().value;
      if (firstKey) {
        this.nodeCache.delete(firstKey);
      }
    }
    this.nodeCache.set(node.id, node);
  }

  private updateEdgeCache(edge: ReasoningEdge): void {
    if (this.edgeCache.size >= this.maxCacheSize) {
      // Remove least recently used items
      const firstKey = this.edgeCache.keys().next().value;
      if (firstKey) {
        this.edgeCache.delete(firstKey);
      }
    }
    this.edgeCache.set(edge.id, edge);
  }

  clearCache(): void {
    this.nodeCache.clear();
    this.edgeCache.clear();
  }

  // Cleanup
  close(): void {
    this.db.close();
    logger.info('Reasoning graph database closed');
  }
}

// Singleton instance
let reasoningGraphInstance: ReasoningGraph | null = null;

export function getReasoningGraph(): ReasoningGraph {
  if (!reasoningGraphInstance) {
    const dbPath = process.env.REASONING_DB_PATH || './data/reasoning.db';
    reasoningGraphInstance = new ReasoningGraph(dbPath);
  }
  return reasoningGraphInstance;
}
