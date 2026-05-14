/**
 * Vera Lattice Core - Reasoning Field Implementation
 * Multi-dimensional lattice-based reasoning with superposition, entanglement, and interference
 */

import { EventEmitter } from 'events';
import type {
  LatticeNode,
  LatticeNodeState,
  ReasoningField,
  FieldStats,
  InterferenceResult,
  CoherentPath,
} from '../../types/index.js';
import { logger } from '../../../monitoring/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lattice Node Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class LatticeNodeImpl implements LatticeNode {
  id: string;
  fieldId: string;
  hypothesis: string;
  state: LatticeNodeState;
  confidence: number;
  evidence: string[];
  coordinates: number[];
  entangledWith: string[];
  createdAt: number;
  collapsedAt?: number;
  metadata?: Record<string, unknown>;

  constructor(
    id: string,
    fieldId: string,
    hypothesis: string,
    dimensions: number,
    metadata?: Record<string, unknown>
  ) {
    this.id = id;
    this.fieldId = fieldId;
    this.hypothesis = hypothesis;
    this.state = 'superposed';
    this.confidence = 0.5; // Start in superposition at 50%
    this.evidence = [];
    this.coordinates = this.generateCoordinates(dimensions);
    this.entangledWith = [];
    this.createdAt = Date.now();
    this.metadata = metadata;
  }

  private generateCoordinates(dimensions: number): number[] {
    // Generate random coordinates in n-dimensional space
    // Each coordinate is between -1 and 1
    return Array.from({ length: dimensions }, () => (Math.random() * 2 - 1));
  }

  /**
   * Calculate Euclidean distance to another node
   */
  distanceTo(other: LatticeNode): number {
    if (this.coordinates.length !== other.coordinates.length) {
      throw new Error('Cannot calculate distance: different dimensions');
    }

    const sum = this.coordinates.reduce((acc, coord, i) => {
      const diff = coord - other.coordinates[i];
      return acc + diff * diff;
    }, 0);

    return Math.sqrt(sum);
  }

  /**
   * Add evidence and update confidence
   */
  addEvidence(evidence: string, weight: number = 0.1): void {
    this.evidence.push(evidence);
    // Bayesian-like confidence update
    const priorConfidence = this.confidence;
    const evidenceStrength = weight;
    
    // Update confidence using a simple weighted average approach
    this.confidence = priorConfidence + (evidenceStrength * (1 - priorConfidence));
    this.confidence = Math.min(1, Math.max(0, this.confidence));
  }

  /**
   * Collapse this node from superposition to a specific state
   */
  collapse(finalConfidence: number, triggeringEvidence: string[]): void {
    if (this.state !== 'superposed') {
      return; // Already collapsed or entangled
    }

    this.state = 'collapsed';
    this.confidence = Math.min(1, Math.max(0, finalConfidence));
    this.evidence.push(...triggeringEvidence);
    this.collapsedAt = Date.now();

    logger.debug('LatticeNode', {
      message: 'Node collapsed',
      nodeId: this.id,
      fieldId: this.fieldId,
      finalConfidence: this.confidence,
      evidenceCount: this.evidence.length,
    });
  }

  /**
   * Entangle this node with another
   */
  entangleWith(nodeId: string): void {
    if (!this.entangledWith.includes(nodeId)) {
      this.entangledWith.push(nodeId);
      this.state = 'entangled';
    }
  }

  /**
   * Break entanglement with a specific node
   */
  breakEntanglement(nodeId: string): void {
    this.entangledWith = this.entangledWith.filter(id => id !== nodeId);
    if (this.entangledWith.length === 0 && this.state === 'entangled') {
      this.state = this.collapsedAt ? 'collapsed' : 'superposed';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reasoning Field Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class ReasoningFieldImpl extends EventEmitter implements ReasoningField {
  id: string;
  name: string;
  dimensions: string[];
  nodes: Map<string, LatticeNode>;
  coherence: number;
  createdAt: number;
  lastUpdated: number;

  private nodeImpls: Map<string, LatticeNodeImpl> = new Map();

  constructor(id: string, name: string, dimensions: string[]) {
    super();
    this.id = id;
    this.name = name;
    this.dimensions = dimensions;
    this.nodes = new Map();
    this.coherence = 1.0;
    this.createdAt = Date.now();
    this.lastUpdated = Date.now();
  }

  /**
   * Create multiple superposed hypotheses
   */
  superposeHypotheses(hypotheses: string[], metadata?: Record<string, unknown>[]): LatticeNode[] {
    const nodes: LatticeNode[] = [];

    hypotheses.forEach((hypothesis, index) => {
      const nodeId = `${this.id}-node-${Date.now()}-${index}`;
      const nodeMeta = metadata?.[index] || {};
      
      const node = new LatticeNodeImpl(
        nodeId,
        this.id,
        hypothesis,
        this.dimensions.length,
        nodeMeta
      );

      this.nodeImpls.set(nodeId, node);
      this.nodes.set(nodeId, node);
      nodes.push(node);
    });

    this.lastUpdated = Date.now();
    this.calculateCoherence();

    logger.info('ReasoningField', {
      message: 'Hypotheses superposed',
      fieldId: this.id,
      fieldName: this.name,
      hypothesisCount: hypotheses.length,
    });

    this.emit('hypotheses_superposed', { fieldId: this.id, nodes });
    return nodes;
  }

  /**
   * Create a single superposed hypothesis
   */
  superpose(hypothesis: string, metadata?: Record<string, unknown>): LatticeNode {
    return this.superposeHypotheses([hypothesis], metadata ? [metadata] : undefined)[0];
  }

  /**
   * Collapse a node based on evidence
   */
  collapseNode(nodeId: string, evidence: string[], confidenceDelta: number): LatticeNode | null {
    const node = this.nodeImpls.get(nodeId);
    if (!node) return null;

    // Add all evidence
    evidence.forEach(e => node.addEvidence(e, confidenceDelta / evidence.length));

    // Calculate final confidence
    const finalConfidence = node.confidence + confidenceDelta;
    node.collapse(finalConfidence, evidence);

    this.lastUpdated = Date.now();
    this.calculateCoherence();

    // Propagate to entangled nodes
    this.propagateCollapse(node);

    this.emit('node_collapsed', { fieldId: this.id, nodeId, confidence: finalConfidence });
    return node;
  }

  /**
   * Propagate collapse effects to entangled nodes
   */
  private propagateCollapse(sourceNode: LatticeNodeImpl): void {
    for (const entangledId of sourceNode.entangledWith) {
      const entangledNode = this.nodeImpls.get(entangledId);
      if (entangledNode && entangledNode.state === 'superposed') {
        // Entangled nodes are affected by the collapse
        // They get a confidence boost/penalty based on interference
        const interference = this.calculateInterferenceValue(sourceNode, entangledNode);
        const effect = interference * 0.3; // 30% influence
        
        entangledNode.confidence = Math.min(1, Math.max(0, 
          entangledNode.confidence + effect
        ));

        // If confidence becomes very high or low, collapse it too
        if (entangledNode.confidence > 0.9) {
          entangledNode.collapse(entangledNode.confidence, [
            `Entangled with ${sourceNode.id} collapse`
          ]);
        } else if (entangledNode.confidence < 0.1) {
          entangledNode.collapse(entangledNode.confidence, [
            `Entangled with ${sourceNode.id} collapse (negative)`
          ]);
        }
      }
    }
  }

  /**
   * Entangle two nodes
   */
  entangleNodes(nodeId1: string, nodeId2: string): boolean {
    const node1 = this.nodeImpls.get(nodeId1);
    const node2 = this.nodeImpls.get(nodeId2);

    if (!node1 || !node2) {
      logger.warn('ReasoningField', {
        message: 'Cannot entangle: node not found',
        fieldId: this.id,
        nodeId1,
        nodeId2,
      });
      return false;
    }

    node1.entangleWith(nodeId2);
    node2.entangleWith(nodeId1);

    // Both become entangled state
    node1.state = 'entangled';
    node2.state = 'entangled';

    this.lastUpdated = Date.now();

    logger.debug('ReasoningField', {
      message: 'Nodes entangled',
      fieldId: this.id,
      nodeId1,
      nodeId2,
    });

    this.emit('nodes_entangled', { fieldId: this.id, nodeId1, nodeId2 });
    return true;
  }

  /**
   * Calculate interference between two nodes (-1 to 1)
   */
  calculateInterference(nodeId1: string, nodeId2: string): InterferenceResult {
    const node1 = this.nodeImpls.get(nodeId1);
    const node2 = this.nodeImpls.get(nodeId2);

    if (!node1 || !node2) {
      throw new Error('Cannot calculate interference: node not found');
    }

    const interference = this.calculateInterferenceValue(node1, node2);

    let type: InterferenceResult['type'];
    if (interference > 0.3) type = 'constructive';
    else if (interference < -0.3) type = 'destructive';
    else type = 'orthogonal';

    return {
      nodeA: nodeId1,
      nodeB: nodeId2,
      interference,
      type,
    };
  }

  private calculateInterferenceValue(node1: LatticeNodeImpl, node2: LatticeNodeImpl): number {
    // Interference is based on:
    // 1. Coordinate similarity (closer = more interference)
    // 2. Confidence alignment (both high or both low = constructive)
    // 3. Evidence overlap

    const distance = node1.distanceTo(node2);
    const proximityFactor = Math.max(0, 1 - distance / Math.sqrt(node1.coordinates.length));

    const confidenceDiff = node1.confidence - node2.confidence;
    const alignmentFactor = 1 - Math.abs(confidenceDiff);

    // Evidence overlap
    const commonEvidence = node1.evidence.filter(e => 
      node2.evidence.some(e2 => e2.includes(e) || e.includes(e2))
    );
    const evidenceFactor = commonEvidence.length / 
      Math.max(node1.evidence.length, node2.evidence.length, 1);

    // Combined interference: -1 to 1
    const interference = (proximityFactor * 0.4 + alignmentFactor * 0.4 + evidenceFactor * 0.2) * 2 - 1;
    
    return Math.max(-1, Math.min(1, interference));
  }

  /**
   * Find the most coherent path from start to goal
   */
  findCoherentPath(startNodeId: string, goalKeyword: string): CoherentPath {
    const startNode = this.nodeImpls.get(startNodeId);
    if (!startNode) {
      throw new Error(`Start node ${startNodeId} not found`);
    }

    // Find candidate goal nodes (hypotheses matching keyword)
    const candidates: LatticeNodeImpl[] = [];
    for (const node of this.nodeImpls.values()) {
      if (node.id !== startNodeId && 
          node.hypothesis.toLowerCase().includes(goalKeyword.toLowerCase())) {
        candidates.push(node);
      }
    }

    if (candidates.length === 0) {
      return {
        nodes: [startNode],
        totalConfidence: startNode.confidence,
        averageCoherence: this.coherence,
        length: 1,
      };
    }

    // Build path through highest coherence connections
    const path: LatticeNode[] = [startNode];
    let currentNode = startNode;
    let totalConfidence = startNode.confidence;

    // Sort candidates by distance (closest first for coherence)
    candidates.sort((a, b) => currentNode.distanceTo(a) - currentNode.distanceTo(b));

    // Add closest matching node
    const nextNode = candidates[0];
    path.push(nextNode);
    totalConfidence += nextNode.confidence;

    return {
      nodes: path,
      totalConfidence,
      averageCoherence: this.coherence,
      length: path.length,
    };
  }

  /**
   * Calculate field coherence based on collapsed nodes
   */
  calculateCoherence(): number {
    const allNodes = Array.from(this.nodeImpls.values());
    if (allNodes.length === 0) {
      this.coherence = 1.0;
      return this.coherence;
    }

    const collapsedNodes = allNodes.filter(n => n.state === 'collapsed');
    if (collapsedNodes.length === 0) {
      this.coherence = 0.5; // All superposed = medium coherence
      return this.coherence;
    }

    // Coherence is how aligned the collapsed nodes are
    const avgConfidence = collapsedNodes.reduce((sum, n) => sum + n.confidence, 0) / 
      collapsedNodes.length;

    // Variance in confidence (lower variance = higher coherence)
    const variance = collapsedNodes.reduce((sum, n) => 
      sum + Math.pow(n.confidence - avgConfidence, 2), 0) / collapsedNodes.length;
    
    this.coherence = avgConfidence * (1 - variance);
    return this.coherence;
  }

  /**
   * Get field statistics
   */
  getStats(): FieldStats {
    const allNodes = Array.from(this.nodeImpls.values());
    const collapsedNodes = allNodes.filter(n => n.state === 'collapsed');
    const superposedNodes = allNodes.filter(n => n.state === 'superposed');

    // Count entangled pairs (each pair counted once)
    const entangledPairs = new Set<string>();
    for (const node of allNodes) {
      for (const otherId of node.entangledWith) {
        const pairKey = [node.id, otherId].sort().join('-');
        entangledPairs.add(pairKey);
      }
    }

    return {
      fieldId: this.id,
      coherence: this.coherence,
      averageConfidence: allNodes.length > 0 
        ? allNodes.reduce((sum, n) => sum + n.confidence, 0) / allNodes.length 
        : 0,
      totalNodes: allNodes.length,
      collapsedNodes: collapsedNodes.length,
      entangledPairs: entangledPairs.size,
      superposedNodes: superposedNodes.length,
    };
  }

  /**
   * Get nodes by state
   */
  getNodesByState(state: LatticeNodeState): LatticeNode[] {
    return Array.from(this.nodeImpls.values()).filter(n => n.state === state);
  }

  /**
   * Remove a node from the field
   */
  removeNode(nodeId: string): boolean {
    const node = this.nodeImpls.get(nodeId);
    if (!node) return false;

    // Break all entanglements first
    for (const otherId of node.entangledWith) {
      const other = this.nodeImpls.get(otherId);
      if (other) {
        other.breakEntanglement(nodeId);
      }
    }

    this.nodeImpls.delete(nodeId);
    this.nodes.delete(nodeId);
    this.lastUpdated = Date.now();
    this.calculateCoherence();

    return true;
  }

  /**
   * Clear all nodes from the field
   */
  clear(): void {
    this.nodeImpls.clear();
    this.nodes.clear();
    this.coherence = 1.0;
    this.lastUpdated = Date.now();
  }
}
