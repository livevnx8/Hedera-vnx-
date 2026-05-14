/**
 * Reasoning Graph Edge Definitions
 * 
 * Edge types and relationships for connecting reasoning nodes.
 * Supports causal inference, logical implications, and semantic relationships.
 */

export type EdgeType = 'causes' | 'implies' | 'contradicts' | 'supports' | 'related' | 'exemplifies' | 'generalizes' | 'questions' | 'answers';

export interface ReasoningEdge {
  id: string;
  fromNode: string;
  toNode: string;
  type: EdgeType;
  strength: number; // 0-1, confidence in the relationship
  evidence: Evidence[];
  bidirectional: boolean;
  metadata: EdgeMetadata;
  createdAt: Date;
  updatedAt: Date;
  userId?: string;
}

export interface Evidence {
  id: string;
  source: string;
  content: string;
  credibility: number;
  relevance: number;
  timestamp: Date;
  evidenceType: 'empirical' | 'logical' | 'statistical' | 'expert_testimony' | 'documentary';
}

export interface EdgeMetadata {
  temporal?: {
    valid_from?: Date;
    valid_until?: Date;
    duration?: number; // For causal relationships
  };
  conditional?: {
    condition: string;
    probability: number;
  };
  quantitative?: {
    correlation: number;
    causation_strength: number;
    sample_size?: number;
  };
  logical?: {
    inference_type: 'deductive' | 'inductive' | 'abductive';
    validity_score: number;
  };
}

export class ReasoningEdgeFactory {
  static createEdge(params: {
    id: string;
    fromNode: string;
    toNode: string;
    type: EdgeType;
    strength?: number;
    evidence?: Evidence[];
    bidirectional?: boolean;
    userId?: string;
  }): ReasoningEdge {
    return {
      id: params.id,
      fromNode: params.fromNode,
      toNode: params.toNode,
      type: params.type,
      strength: params.strength ?? 0.7,
      evidence: params.evidence ?? [],
      bidirectional: params.bidirectional ?? false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: params.userId
    };
  }

  static createCausalEdge(params: {
    id: string;
    causeNode: string;
    effectNode: string;
    strength?: number;
    duration?: number;
    evidence?: Evidence[];
    userId?: string;
  }): ReasoningEdge {
    return ReasoningEdgeFactory.createEdge({
      id: params.id,
      fromNode: params.causeNode,
      toNode: params.effectNode,
      type: 'causes',
      strength: params.strength ?? 0.6,
      evidence: params.evidence ?? [],
      bidirectional: false,
      userId: params.userId
    });
  }

  static createImplicationEdge(params: {
    id: string;
    premiseNode: string;
    conclusionNode: string;
    strength?: number;
    validity?: number;
    evidence?: Evidence[];
    userId?: string;
  }): ReasoningEdge {
    const edge = ReasoningEdgeFactory.createEdge({
      id: params.id,
      fromNode: params.premiseNode,
      toNode: params.conclusionNode,
      type: 'implies',
      strength: params.strength ?? 0.8,
      evidence: params.evidence ?? [],
      bidirectional: false,
      userId: params.userId
    });

    edge.metadata.logical = {
      inference_type: 'deductive',
      validity_score: params.validity ?? 0.8
    };

    return edge;
  }

  static createContradictionEdge(params: {
    id: string;
    node1: string;
    node2: string;
    strength?: number;
    evidence?: Evidence[];
    userId?: string;
  }): ReasoningEdge {
    return ReasoningEdgeFactory.createEdge({
      id: params.id,
      fromNode: params.node1,
      toNode: params.node2,
      type: 'contradicts',
      strength: params.strength ?? 0.8,
      evidence: params.evidence ?? [],
      bidirectional: true,
      userId: params.userId
    });
  }

  static createSupportEdge(params: {
    id: string;
    supportingNode: string;
    supportedNode: string;
    strength?: number;
    evidence?: Evidence[];
    userId?: string;
  }): ReasoningEdge {
    return ReasoningEdgeFactory.createEdge({
      id: params.id,
      fromNode: params.supportingNode,
      toNode: params.supportedNode,
      type: 'supports',
      strength: params.strength ?? 0.7,
      evidence: params.evidence ?? [],
      bidirectional: false,
      userId: params.userId
    });
  }

  static createEvidenceItem(params: {
    source: string;
    content: string;
    credibility?: number;
    relevance?: number;
    evidenceType?: Evidence['evidenceType'];
  }): Evidence {
    return {
      id: `evidence_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source: params.source,
      content: params.content,
      credibility: params.credibility ?? 0.7,
      relevance: params.relevance ?? 0.8,
      timestamp: new Date(),
      evidenceType: params.evidenceType ?? 'documentary'
    };
  }
}

export class EdgeUtils {
  static isEdgeValid(edge: ReasoningEdge): boolean {
    return (
      edge.fromNode !== edge.toNode &&
      edge.strength >= 0 && edge.strength <= 1 &&
      edge.fromNode.length > 0 &&
      edge.toNode.length > 0
    );
  }

  static getEdgeWeight(edge: ReasoningEdge): number {
    let weight = edge.strength;

    // Adjust weight based on evidence quality
    if (edge.evidence.length > 0) {
      const avgEvidenceCredibility = edge.evidence.reduce((sum, ev) => sum + ev.credibility, 0) / edge.evidence.length;
      weight *= (0.5 + 0.5 * avgEvidenceCredibility);
    }

    // Adjust weight based on edge type importance
    const typeWeights = {
      'causes': 1.2,
      'implies': 1.1,
      'contradicts': 1.3,
      'supports': 1.0,
      'related': 0.8,
      'exemplifies': 0.9,
      'generalizes': 1.0,
      'questions': 0.7,
      'answers': 0.9
    };

    weight *= typeWeights[edge.type] || 1.0;

    return Math.min(1, weight);
  }

  static isContradictory(edge: ReasoningEdge): boolean {
    return edge.type === 'contradicts';
  }

  static isCausal(edge: ReasoningEdge): boolean {
    return edge.type === 'causes';
  }

  static isLogical(edge: ReasoningEdge): boolean {
    return ['implies', 'supports'].includes(edge.type);
  }

  static getEdgeDirection(edge: ReasoningEdge): 'forward' | 'backward' | 'bidirectional' {
    if (edge.bidirectional) return 'bidirectional';
    return 'forward';
  }

  static shouldIncludeInContext(edge: ReasoningEdge, availableTokens: number): boolean {
    const estimatedTokens = this.estimateTokenCount(edge);
    return estimatedTokens <= availableTokens;
  }

  static estimateTokenCount(edge: ReasoningEdge): number {
    // Rough estimation for edge representation
    const edgeString = `${edge.fromNode}-${edge.type}-${edge.toNode}`;
    return Math.ceil(edgeString.length / 4);
  }

  static compressEdge(edge: ReasoningEdge): ReasoningEdge {
    // Compress edge for context window
    return {
      ...edge,
      evidence: edge.evidence.slice(0, 2), // Keep only top 2 evidence items
      metadata: Object.fromEntries(
        Object.entries(edge.metadata).filter(([key]) => 
          ['logical', 'quantitative'].includes(key)
        )
      )
    };
  }

  static getEdgeConfidence(edge: ReasoningEdge): number {
    let confidence = edge.strength;

    // Factor in evidence quality
    if (edge.evidence.length > 0) {
      const evidenceConfidence = edge.evidence.reduce((sum, ev) => 
        sum + ev.credibility * ev.relevance, 0) / edge.evidence.length;
      confidence = (confidence + evidenceConfidence) / 2;
    }

    // Factor in metadata confidence if available
    if (edge.metadata.logical?.validity_score) {
      confidence = (confidence + edge.metadata.logical.validity_score) / 2;
    }

    return confidence;
  }

  static updateEdgeStrength(edge: ReasoningEdge, newStrength: number, evidence?: Evidence[]): ReasoningEdge {
    const updatedEdge = { ...edge };
    updatedEdge.strength = Math.max(0, Math.min(1, newStrength));
    updatedEdge.updatedAt = new Date();

    if (evidence) {
      updatedEdge.evidence = [...updatedEdge.evidence, ...evidence];
    }

    return updatedEdge;
  }

  static findContradictions(edges: ReasoningEdge[]): Array<[ReasoningEdge, ReasoningEdge]> {
    const contradictions: Array<[ReasoningEdge, ReasoningEdge]> = [];
    
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const edge1 = edges[i];
        const edge2 = edges[j];
        
        // Check for direct contradictions
        if (edge1.toNode === edge2.toNode && 
            ((edge1.type === 'supports' && edge2.type === 'contradicts') ||
             (edge1.type === 'contradicts' && edge2.type === 'supports'))) {
          contradictions.push([edge1, edge2]);
        }
      }
    }
    
    return contradictions;
  }
}
