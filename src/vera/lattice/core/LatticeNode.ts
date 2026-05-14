/**
 * Lattice Node
 * Represents a hypothesis in superposition state within a reasoning field
 */

export type NodeState = 'superposed' | 'collapsed' | 'entangled';

export interface LatticeNodeConfig {
  id: string;
  fieldId: string;
  hypothesis: string;
  coordinates: number[];
  confidence?: number;
  evidence?: string[];
}

export class LatticeNode {
  id: string;
  fieldId: string;
  hypothesis: string;
  state: NodeState;
  confidence: number;
  evidence: string[];
  coordinates: number[];
  entangledWith: string[];
  createdAt: number;
  collapsedAt?: number;
  collapsedValue?: boolean;

  constructor(config: LatticeNodeConfig) {
    this.id = config.id;
    this.fieldId = config.fieldId;
    this.hypothesis = config.hypothesis;
    this.coordinates = config.coordinates;
    this.confidence = config.confidence ?? 0.5;
    this.evidence = config.evidence ?? [];
    this.state = 'superposed';
    this.entangledWith = [];
    this.createdAt = Date.now();
  }

  /**
   * Collapse the node to a definite state based on evidence
   */
  collapse(value: boolean, finalConfidence: number): void {
    this.state = 'collapsed';
    this.collapsedValue = value;
    this.confidence = finalConfidence;
    this.collapsedAt = Date.now();
  }

  /**
   * Add evidence to the node, adjusting confidence
   */
  addEvidence(evidence: string, weight: number): void {
    this.evidence.push(evidence);
    // Bayesian-like confidence update
    this.confidence = (this.confidence + weight) / (1 + weight);
    this.confidence = Math.min(1, Math.max(0, this.confidence));
  }

  /**
   * Entangle this node with another
   */
  entangle(nodeId: string): void {
    if (!this.entangledWith.includes(nodeId)) {
      this.entangledWith.push(nodeId);
    }
    if (this.state !== 'entangled' && this.state !== 'collapsed') {
      this.state = 'entangled';
    }
  }

  /**
   * Calculate distance to another node in coordinate space
   */
  distanceTo(other: LatticeNode): number {
    if (this.coordinates.length !== other.coordinates.length) {
      throw new Error('Cannot calculate distance: dimension mismatch');
    }
    
    return Math.sqrt(
      this.coordinates.reduce((sum, coord, i) => {
        const diff = coord - other.coordinates[i];
        return sum + diff * diff;
      }, 0)
    );
  }

  /**
   * Get node state summary
   */
  getState(): object {
    return {
      id: this.id,
      fieldId: this.fieldId,
      hypothesis: this.hypothesis,
      state: this.state,
      confidence: this.confidence,
      evidence: this.evidence.length,
      coordinates: this.coordinates,
      entangledWith: this.entangledWith,
      createdAt: this.createdAt,
      collapsedAt: this.collapsedAt,
      collapsedValue: this.collapsedValue,
      age: Date.now() - this.createdAt,
    };
  }

  /**
   * Check if node is in superposition
   */
  isSuperposed(): boolean {
    return this.state === 'superposed';
  }

  /**
   * Check if node has been collapsed
   */
  isCollapsed(): boolean {
    return this.state === 'collapsed';
  }

  /**
   * Get coherence score (0-1, higher = more stable)
   */
  getCoherence(): number {
    if (this.state === 'collapsed') {
      return this.confidence;
    }
    // Superposed nodes have coherence based on evidence consistency
    return this.confidence * (1 - 0.1 * this.entangledWith.length);
  }
}

export default LatticeNode;
