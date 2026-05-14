/**
 * Reasoning Graph Node Definitions
 * 
 * Core node types and interfaces for Vera's reasoning graph system.
 * Optimized for QVX GPU acceleration and 4096 token context management.
 */

export type NodeType = 'concept' | 'fact' | 'hypothesis' | 'inference' | 'question' | 'claim';

export interface ReasoningNode {
  id: string;
  type: NodeType;
  content: string;
  confidence: number;
  embedding?: number[]; // Vector embedding for semantic similarity
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  userId?: string; // For personalization
  priority: number; // 0-1, higher = more important for context window
  tags: string[]; // For categorization and retrieval
}

export interface ConceptNode extends ReasoningNode {
  type: 'concept';
  definition: string;
  examples: string[];
  relatedConcepts: string[]; // References to other concept node IDs
}

export interface FactNode extends ReasoningNode {
  type: 'fact';
  source: string;
  verifiable: boolean;
  lastVerified?: Date;
  verificationAttempts: number;
}

export interface HypothesisNode extends ReasoningNode {
  type: 'hypothesis';
  status: 'proposed' | 'testing' | 'confirmed' | 'rejected' | 'partially_confirmed';
  testResults: TestResult[];
  alternativeHypotheses: string[]; // References to other hypothesis node IDs
}

export interface InferenceNode extends ReasoningNode {
  type: 'inference';
  premises: string[]; // References to premise node IDs
  conclusion: string;
  inferenceType: 'deductive' | 'inductive' | 'abductive' | 'analogical';
  validity: number; // 0-1, logical validity score
}

export interface QuestionNode extends ReasoningNode {
  type: 'question';
  questionType: 'what' | 'why' | 'how' | 'when' | 'where' | 'which' | 'open';
  answerCandidates: string[]; // References to potential answer node IDs
  urgency: 'low' | 'medium' | 'high';
}

export interface ClaimNode extends ReasoningNode {
  type: 'claim';
  claimType: 'assertion' | 'prediction' | 'opinion' | 'analysis';
  supportingEvidence: string[]; // References to evidence node IDs
  contradictingEvidence: string[]; // References to contradictory evidence
  verifiability: 'verifiable' | 'partially_verifiable' | 'unverifiable';
}

export interface TestResult {
  id: string;
  testType: 'empirical' | 'logical' | 'statistical' | 'expert_review';
  outcome: 'pass' | 'fail' | 'inconclusive';
  confidence: number;
  evidence: string;
  timestamp: Date;
  methodology: string;
}

export interface NodeMetadata {
  source?: string;
  context?: string;
  relevance?: number;
  temporal?: {
    created: Date;
    valid_from?: Date;
    valid_until?: Date;
  };
  domain?: string;
  complexity?: 'simple' | 'moderate' | 'complex';
  certainty?: number;
}

export class ReasoningNodeFactory {
  static createConcept(params: {
    id: string;
    content: string;
    definition: string;
    examples: string[];
    confidence?: number;
    userId?: string;
  }): ConceptNode {
    return {
      id: params.id,
      type: 'concept',
      content: params.content,
      definition: params.definition,
      examples: params.examples,
      relatedConcepts: [],
      confidence: params.confidence ?? 0.8,
      embedding: undefined,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: params.userId,
      priority: 0.7,
      tags: ['concept']
    };
  }

  static createFact(params: {
    id: string;
    content: string;
    source: string;
    confidence?: number;
    userId?: string;
  }): FactNode {
    return {
      id: params.id,
      type: 'fact',
      content: params.content,
      source: params.source,
      verifiable: true,
      verificationAttempts: 0,
      confidence: params.confidence ?? 0.9,
      embedding: undefined,
      metadata: { source: params.source },
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: params.userId,
      priority: 0.8,
      tags: ['fact']
    };
  }

  static createHypothesis(params: {
    id: string;
    content: string;
    confidence?: number;
    userId?: string;
  }): HypothesisNode {
    return {
      id: params.id,
      type: 'hypothesis',
      content: params.content,
      status: 'proposed',
      testResults: [],
      alternativeHypotheses: [],
      confidence: params.confidence ?? 0.5,
      embedding: undefined,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: params.userId,
      priority: 0.6,
      tags: ['hypothesis']
    };
  }

  static createInference(params: {
    id: string;
    content: string;
    premises: string[];
    conclusion: string;
    inferenceType: 'deductive' | 'inductive' | 'abductive' | 'analogical';
    confidence?: number;
    userId?: string;
  }): InferenceNode {
    return {
      id: params.id,
      type: 'inference',
      content: params.content,
      premises: params.premises,
      conclusion: params.conclusion,
      inferenceType: params.inferenceType,
      validity: params.confidence ?? 0.7,
      confidence: params.confidence ?? 0.7,
      embedding: undefined,
      metadata: { inferenceType: params.inferenceType },
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: params.userId,
      priority: 0.7,
      tags: ['inference', params.inferenceType]
    };
  }

  static createQuestion(params: {
    id: string;
    content: string;
    questionType: 'what' | 'why' | 'how' | 'when' | 'where' | 'which' | 'open';
    urgency?: 'low' | 'medium' | 'high';
    userId?: string;
  }): QuestionNode {
    return {
      id: params.id,
      type: 'question',
      content: params.content,
      questionType: params.questionType,
      answerCandidates: [],
      urgency: params.urgency ?? 'medium',
      confidence: 1.0, // Questions are always confident in their existence
      embedding: undefined,
      metadata: { questionType: params.questionType },
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: params.userId,
      priority: params.urgency === 'high' ? 0.9 : params.urgency === 'medium' ? 0.7 : 0.5,
      tags: ['question', params.questionType]
    };
  }

  static createClaim(params: {
    id: string;
    content: string;
    claimType: 'assertion' | 'prediction' | 'opinion' | 'analysis';
    confidence?: number;
    userId?: string;
  }): ClaimNode {
    return {
      id: params.id,
      type: 'claim',
      content: params.content,
      claimType: params.claimType,
      supportingEvidence: [],
      contradictingEvidence: [],
      verifiability: 'verifiable',
      confidence: params.confidence ?? 0.6,
      embedding: undefined,
      metadata: { claimType: params.claimType },
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: params.userId,
      priority: 0.6,
      tags: ['claim', params.claimType]
    };
  }
}

// Utility functions for node management
export class NodeUtils {
  static isNodeExpired(node: ReasoningNode, maxAge: number = 30 * 24 * 60 * 60 * 1000): boolean {
    return Date.now() - node.updatedAt.getTime() > maxAge;
  }

  static getNodeRelevanceScore(node: ReasoningNode, currentContext: string[]): number {
    let score = node.priority;
    
    // Boost score if node tags match current context
    const matchingTags = node.tags.filter(tag => currentContext.includes(tag));
    score += matchingTags.length * 0.1;
    
    // Boost score based on confidence
    score += node.confidence * 0.2;
    
    // Boost score based on recency
    const recency = 1 - (Date.now() - node.updatedAt.getTime()) / (7 * 24 * 60 * 60 * 1000);
    score += Math.max(0, recency) * 0.1;
    
    return Math.min(1, score);
  }

  static shouldIncludeInContext(node: ReasoningNode, availableTokens: number): boolean {
    const estimatedTokens = this.estimateTokenCount(node);
    return estimatedTokens <= availableTokens;
  }

  static estimateTokenCount(node: ReasoningNode): number {
    // Rough estimation: ~4 characters per token
    const contentLength = node.content.length;
    const metadataLength = JSON.stringify(node.metadata).length;
    return Math.ceil((contentLength + metadataLength) / 4);
  }

  static compressNode(node: ReasoningNode): ReasoningNode {
    // Compress node for context window by removing less important metadata
    return {
      ...node,
      metadata: Object.fromEntries(
        Object.entries(node.metadata).filter(([key]) => 
          ['source', 'inferenceType', 'questionType', 'claimType'].includes(key)
        )
      )
    };
  }
}
