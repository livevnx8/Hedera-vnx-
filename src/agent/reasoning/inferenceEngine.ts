/**
 * Advanced Inference Engine for Vera
 * 
 * Implements Bayesian reasoning, logical inference, and causal analysis
 * for sophisticated problem-solving capabilities.
 */

import { ReasoningGraph, getReasoningGraph } from './reasoningGraph.js';
import { ReasoningNode, NodeType } from './graphNode.js';
import { ReasoningEdge, EdgeType, EdgeUtils } from './graphEdge.js';
import { logger } from '../../monitoring/logger.js';

export interface InferenceResult {
  conclusion: string;
  confidence: number;
  reasoning: string[];
  evidence: string[];
  contradictions: string[];
  assumptions: string[];
  method: InferenceMethod;
}

export type InferenceMethod = 
  | 'deductive' 
  | 'inductive' 
  | 'abductive' 
  | 'bayesian' 
  | 'causal' 
  | 'analogical';

export interface InferenceChain {
  id: string;
  steps: InferenceStep[];
  conclusion: string;
  confidence: number;
  method: InferenceMethod;
  validity: number;
}

export interface InferenceStep {
  id: string;
  type: 'premise' | 'inference' | 'conclusion';
  content: string;
  nodeId?: string;
  edgeId?: string;
  confidence: number;
  justification: string;
}

export interface BayesianNetwork {
  nodes: Map<string, number>; // node probabilities
  edges: Map<string, number>; // conditional probabilities
  evidence: Map<string, boolean>;
}

export class InferenceEngine {
  private reasoningGraph: ReasoningGraph;
  private maxChainLength: number = 10;
  private minConfidenceThreshold: number = 0.3;

  constructor() {
    this.reasoningGraph = getReasoningGraph();
  }

  // Deductive Reasoning - From general to specific
  async deductiveInference(premises: string[]): Promise<InferenceResult> {
    const steps: InferenceStep[] = [];
    const contradictions: string[] = [];
    const evidence: string[] = [];

    try {
      // Convert premises to nodes
      const premiseNodes = await this.findOrCreateNodes(premises, 'fact');
      
      // Find logical implications
      for (const premise of premiseNodes) {
        const implications = this.reasoningGraph.getAdjacentEdges(premise.id)
          .filter(edge => edge.type === 'implies');
        
        for (const implication of implications) {
          const conclusionNode = this.reasoningGraph.getNode(implication.toNode);
          if (conclusionNode) {
            steps.push({
              id: `step_${steps.length}`,
              type: 'inference',
              content: `From "${premise.content}" we can infer "${conclusionNode.content}"`,
              nodeId: conclusionNode.id,
              edgeId: implication.id,
              confidence: EdgeUtils.getEdgeWeight(implication),
              justification: `Logical implication with strength ${implication.strength}`
            });
            
            evidence.push(conclusionNode.content);
          }
        }
      }

      // Check for contradictions
      const contradictionsFound = this.detectContradictions(premiseNodes);
      contradictions.push(...contradictionsFound);

      // Calculate overall confidence
      const overallConfidence = steps.length > 0 
        ? steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length
        : 0;

      const conclusion = steps.length > 0
        ? steps[steps.length - 1].content
        : 'No valid deduction found';

      return {
        conclusion,
        confidence: overallConfidence,
        reasoning: steps.map(step => step.content),
        evidence,
        contradictions,
        assumptions: premises,
        method: 'deductive'
      };

    } catch (error) {
      logger.error('Error in deductive inference', { error: error instanceof Error ? error.message : 'Unknown error' });
      return {
        conclusion: 'Deductive inference failed',
        confidence: 0,
        reasoning: [],
        evidence: [],
        contradictions: [],
        assumptions: premises,
        method: 'deductive'
      };
    }
  }

  // Inductive Reasoning - From specific observations to general principles
  async inductiveInference(observations: string[]): Promise<InferenceResult> {
    const steps: InferenceStep[] = [];
    const patterns: Map<string, number> = new Map();

    try {
      // Analyze patterns in observations
      for (const observation of observations) {
        const patternsFound = this.extractPatterns(observation);
        for (const pattern of patternsFound) {
          patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
        }
      }

      // Generate hypotheses based on patterns
      const hypotheses: string[] = [];
      for (const [pattern, frequency] of patterns.entries()) {
        if (frequency >= 2) { // Pattern appears at least twice
          const hypothesis = `Based on observations, there appears to be a pattern: ${pattern}`;
          hypotheses.push(hypothesis);
          
          steps.push({
            id: `step_${steps.length}`,
            type: 'inference',
            content: hypothesis,
            confidence: Math.min(0.9, frequency / observations.length),
            justification: `Pattern observed in ${frequency} out of ${observations.length} cases`
          });
        }
      }

      const conclusion = hypotheses.length > 0
        ? hypotheses.join(' | ')
        : 'No clear patterns identified';

      const overallConfidence = steps.length > 0
        ? steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length
        : 0;

      return {
        conclusion,
        confidence: overallConfidence,
        reasoning: steps.map(step => step.content),
        evidence: observations,
        contradictions: [],
        assumptions: [],
        method: 'inductive'
      };

    } catch (error) {
      logger.error('Error in inductive inference', { error: error instanceof Error ? error.message : 'Unknown error' });
      return {
        conclusion: 'Inductive inference failed',
        confidence: 0,
        reasoning: [],
        evidence: observations,
        contradictions: [],
        assumptions: [],
        method: 'inductive'
      };
    }
  }

  // Abductive Reasoning - Inference to best explanation
  async abductiveInference(observation: string): Promise<InferenceResult> {
    const steps: InferenceStep[] = [];
    const explanations: Array<{ explanation: string; plausibility: number }> = [];

    try {
      // Find potential causes for the observation
      const observationNode = await this.findOrCreateNode(observation, 'fact');
      const causalEdges = this.reasoningGraph.getAdjacentEdges(observationNode.id)
        .filter(edge => edge.type === 'causes' && edge.toNode === observationNode.id);

      // Generate explanations
      for (const edge of causalEdges) {
        const causeNode = this.reasoningGraph.getNode(edge.fromNode);
        if (causeNode) {
          const explanation = `${causeNode.content} could explain ${observation}`;
          const plausibility = EdgeUtils.getEdgeWeight(edge);
          
          explanations.push({ explanation, plausibility });
          
          steps.push({
            id: `step_${steps.length}`,
            type: 'inference',
            content: explanation,
            nodeId: causeNode.id,
            edgeId: edge.id,
            confidence: plausibility,
            justification: `Causal relationship with strength ${edge.strength}`
          });
        }
      }

      // Rank explanations by plausibility
      explanations.sort((a, b) => b.plausibility - a.plausibility);

      const bestExplanation = explanations.length > 0
        ? explanations[0].explanation
        : 'No plausible explanation found';

      const overallConfidence = explanations.length > 0
        ? explanations[0].plausibility
        : 0;

      return {
        conclusion: bestExplanation,
        confidence: overallConfidence,
        reasoning: steps.map(step => step.content),
        evidence: [observation],
        contradictions: [],
        assumptions: explanations.slice(1).map(exp => exp.explanation),
        method: 'abductive'
      };

    } catch (error) {
      logger.error('Error in abductive inference', { error: error instanceof Error ? error.message : 'Unknown error' });
      return {
        conclusion: 'Abductive inference failed',
        confidence: 0,
        reasoning: [],
        evidence: [observation],
        contradictions: [],
        assumptions: [],
        method: 'abductive'
      };
    }
  }

  // Bayesian Reasoning - Probabilistic inference
  async bayesianInference(hypothesis: string, evidence: string[]): Promise<InferenceResult> {
    try {
      // Create Bayesian network
      const network = await this.createBayesianNetwork(hypothesis, evidence);
      
      // Calculate posterior probability
      const priorProbability = network.nodes.get(hypothesis) || 0.5;
      let posteriorProbability = priorProbability;

      // Update probability based on evidence
      for (const evidenceItem of evidence) {
        const likelihood = this.calculateLikelihood(hypothesis, evidenceItem, network);
        const evidenceProbability = this.calculateEvidenceProbability(evidenceItem, network);
        
        if (evidenceProbability > 0) {
          posteriorProbability = (likelihood * posteriorProbability) / evidenceProbability;
        }
      }

      const conclusion = `The probability of "${hypothesis}" given the evidence is ${(posteriorProbability * 100).toFixed(1)}%`;
      
      return {
        conclusion,
        confidence: posteriorProbability,
        reasoning: [`Prior: ${(priorProbability * 100).toFixed(1)}%`, `Posterior: ${(posteriorProbability * 100).toFixed(1)}%`],
        evidence,
        contradictions: [],
        assumptions: [`Evidence is conditionally independent given ${hypothesis}`],
        method: 'bayesian'
      };

    } catch (error) {
      logger.error('Error in Bayesian inference', { error: error instanceof Error ? error.message : 'Unknown error' });
      return {
        conclusion: 'Bayesian inference failed',
        confidence: 0,
        reasoning: [],
        evidence,
        contradictions: [],
        assumptions: [],
        method: 'bayesian'
      };
    }
  }

  // Causal Reasoning - Understanding cause and effect
  async causalInference(event: string): Promise<InferenceResult> {
    const steps: InferenceStep[] = [];
    const causes: string[] = [];
    const effects: string[] = [];

    try {
      const eventNode = await this.findOrCreateNode(event, 'fact');
      
      // Find causes
      const causalInEdges = this.reasoningGraph.getAdjacentEdges(eventNode.id)
        .filter(edge => edge.type === 'causes' && edge.toNode === eventNode.id);
      
      for (const edge of causalInEdges) {
        const causeNode = this.reasoningGraph.getNode(edge.fromNode);
        if (causeNode) {
          causes.push(causeNode.content);
          steps.push({
            id: `cause_${steps.length}`,
            type: 'premise',
            content: `Cause: ${causeNode.content}`,
            nodeId: causeNode.id,
            edgeId: edge.id,
            confidence: EdgeUtils.getEdgeWeight(edge),
            justification: `Causal strength: ${edge.strength}`
          });
        }
      }

      // Find effects
      const causalOutEdges = this.reasoningGraph.getAdjacentEdges(eventNode.id)
        .filter(edge => edge.type === 'causes' && edge.fromNode === eventNode.id);
      
      for (const edge of causalOutEdges) {
        const effectNode = this.reasoningGraph.getNode(edge.toNode);
        if (effectNode) {
          effects.push(effectNode.content);
          steps.push({
            id: `effect_${steps.length}`,
            type: 'inference',
            content: `Effect: ${effectNode.content}`,
            nodeId: effectNode.id,
            edgeId: edge.id,
            confidence: EdgeUtils.getEdgeWeight(edge),
            justification: `Causal strength: ${edge.strength}`
          });
        }
      }

      const conclusion = `Causal analysis of "${event}": ${causes.length > 0 ? `Causes: ${causes.join(', ')}` : 'No known causes'}; ${effects.length > 0 ? `Effects: ${effects.join(', ')}` : 'No known effects'}`;
      
      const overallConfidence = steps.length > 0
        ? steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length
        : 0;

      return {
        conclusion,
        confidence: overallConfidence,
        reasoning: steps.map(step => step.content),
        evidence: [...causes, ...effects],
        contradictions: [],
        assumptions: ['Causal relationships are correctly identified'],
        method: 'causal'
      };

    } catch (error) {
      logger.error('Error in causal inference', { error: error instanceof Error ? error.message : 'Unknown error' });
      return {
        conclusion: 'Causal inference failed',
        confidence: 0,
        reasoning: [],
        evidence: [],
        contradictions: [],
        assumptions: [],
        method: 'causal'
      };
    }
  }

  // Analogical Reasoning - Reasoning by analogy
  async analogicalInference(source: string, target: string): Promise<InferenceResult> {
    const steps: InferenceStep[] = [];
    const similarities: string[] = [];
    const differences: string[] = [];

    try {
      const sourceNode = await this.findOrCreateNode(source, 'concept');
      const targetNode = await this.findOrCreateNode(target, 'concept');

      // Find relationships between source and target
      const relatedEdges = this.reasoningGraph.getAdjacentEdges(sourceNode.id)
        .filter(edge => 
          this.reasoningGraph.getAdjacentEdges(targetNode.id)
            .some(targetEdge => targetEdge.type === edge.type)
        );

      for (const edge of relatedEdges) {
        const relatedNode = this.reasoningGraph.getNode(
          edge.fromNode === sourceNode.id ? edge.toNode : edge.fromNode
        );
        
        if (relatedNode) {
          similarities.push(`Both share relationship: ${edge.type}`);
          steps.push({
            id: `analogy_${steps.length}`,
            type: 'inference',
            content: `Analogous relationship: ${edge.type}`,
            nodeId: relatedNode.id,
            edgeId: edge.id,
            confidence: EdgeUtils.getEdgeWeight(edge) * 0.7, // Reduce confidence for analogical reasoning
            justification: 'Analogical similarity'
          });
        }
      }

      const conclusion = similarities.length > 0
        ? `Analogical reasoning suggests similarities between "${source}" and "${target}": ${similarities.join(', ')}`
        : `No clear analogies found between "${source}" and "${target}"`;

      const overallConfidence = steps.length > 0
        ? steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length
        : 0;

      return {
        conclusion,
        confidence: overallConfidence,
        reasoning: steps.map(step => step.content),
        evidence: similarities,
        contradictions: [],
        assumptions: ['Analogous relationships imply similar properties'],
        method: 'analogical'
      };

    } catch (error) {
      logger.error('Error in analogical inference', { error: error instanceof Error ? error.message : 'Unknown error' });
      return {
        conclusion: 'Analogical inference failed',
        confidence: 0,
        reasoning: [],
        evidence: [],
        contradictions: [],
        assumptions: [],
        method: 'analogical'
      };
    }
  }

  // Helper methods
  private async findOrCreateNodes(contents: string[], type: NodeType): Promise<ReasoningNode[]> {
    const nodes: ReasoningNode[] = [];
    
    for (const content of contents) {
      const node = await this.findOrCreateNode(content, type);
      nodes.push(node);
    }
    
    return nodes;
  }

  private async findOrCreateNode(content: string, type: NodeType): Promise<ReasoningNode> {
    // Try to find existing node
    const existingNodes = this.reasoningGraph.query({
      nodeTypes: [type],
      minConfidence: 0.5
    });

    const matchingNode = existingNodes.nodes.find(node => 
      node.content.toLowerCase().includes(content.toLowerCase()) ||
      content.toLowerCase().includes(node.content.toLowerCase())
    );

    if (matchingNode) {
      return matchingNode;
    }

    // Create new node
    const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newNode: ReasoningNode = {
      id: nodeId,
      type,
      content,
      confidence: 0.7,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      priority: 0.7,
      tags: [type]
    };

    this.reasoningGraph.addNode(newNode);
    return newNode;
  }

  private extractPatterns(text: string): string[] {
    const patterns: string[] = [];
    
    // Simple pattern extraction - can be enhanced with NLP
    const sentences = text.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 10) {
        // Look for common patterns
        if (trimmed.includes('because') || trimmed.includes('since')) {
          patterns.push('causal relationship');
        }
        if (trimmed.includes('similar to') || trimmed.includes('like')) {
          patterns.push('analogy');
        }
        if (trimmed.includes('therefore') || trimmed.includes('thus')) {
          patterns.push('logical conclusion');
        }
        if (/\d+/.test(trimmed)) {
          patterns.push('quantitative information');
        }
      }
    }
    
    return patterns;
  }

  private detectContradictions(nodes: ReasoningNode[]): string[] {
    const contradictions: string[] = [];
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];
        
        // Check for direct contradictions
        const edges = this.reasoningGraph.getAdjacentEdges(node1.id)
          .filter(edge => edge.toNode === node2.id && edge.type === 'contradicts');
        
        if (edges.length > 0) {
          contradictions.push(`Contradiction: "${node1.content}" contradicts "${node2.content}"`);
        }
      }
    }
    
    return contradictions;
  }

  private async createBayesianNetwork(hypothesis: string, evidence: string[]): Promise<BayesianNetwork> {
    const network: BayesianNetwork = {
      nodes: new Map(),
      edges: new Map(),
      evidence: new Map()
    };

    // Set prior probability for hypothesis
    network.nodes.set(hypothesis, 0.5);

    // Add evidence nodes
    for (const evidenceItem of evidence) {
      network.nodes.set(evidenceItem, 0.5);
      network.evidence.set(evidenceItem, true);
      
      // Set conditional probabilities (simplified)
      const edgeKey = `${evidenceItem}|${hypothesis}`;
      network.edges.set(edgeKey, 0.7); // Simplified likelihood
    }

    return network;
  }

  private calculateLikelihood(hypothesis: string, evidence: string, network: BayesianNetwork): number {
    const edgeKey = `${evidence}|${hypothesis}`;
    return network.edges.get(edgeKey) || 0.5;
  }

  private calculateEvidenceProbability(evidence: string, network: BayesianNetwork): number {
    // Simplified calculation - in practice would need full Bayesian network inference
    return network.nodes.get(evidence) || 0.5;
  }

  // Public API for multi-method inference
  async infer(problem: string, method?: InferenceMethod): Promise<InferenceResult> {
    // Auto-select method if not specified
    if (!method) {
      method = this.selectBestMethod(problem);
    }

    switch (method) {
      case 'deductive':
        return this.deductiveInference([problem]);
      case 'inductive':
        return this.inductiveInference([problem]);
      case 'abductive':
        return this.abductiveInference(problem);
      case 'bayesian':
        return this.bayesianInference(problem, []);
      case 'causal':
        return this.causalInference(problem);
      case 'analogical':
        return this.analogicalInference(problem, '');
      default:
        return this.deductiveInference([problem]);
    }
  }

  private selectBestMethod(problem: string): InferenceMethod {
    const lowerProblem = problem.toLowerCase();
    
    if (lowerProblem.includes('because') || lowerProblem.includes('therefore')) {
      return 'deductive';
    }
    if (lowerProblem.includes('pattern') || lowerProblem.includes('trend')) {
      return 'inductive';
    }
    if (lowerProblem.includes('explain') || lowerProblem.includes('why')) {
      return 'abductive';
    }
    if (lowerProblem.includes('probability') || lowerProblem.includes('chance')) {
      return 'bayesian';
    }
    if (lowerProblem.includes('cause') || lowerProblem.includes('effect')) {
      return 'causal';
    }
    if (lowerProblem.includes('similar') || lowerProblem.includes('like')) {
      return 'analogical';
    }
    
    return 'deductive'; // Default
  }
}
