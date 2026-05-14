/**
 * Vera Lattice Manager - Central coordination for all reasoning fields
 * Manages multiple lattice fields and cross-field operations
 */

import { EventEmitter } from 'events';
import { ReasoningFieldImpl } from './LatticeField.js';
import { EconomicField } from '../fields/EconomicField.js';
import { SecurityField } from '../fields/SecurityField.js';
import { PerformanceField } from '../fields/PerformanceField.js';
import type {
  LatticeNode,
  LatticeNodeState,
  ReasoningField,
  FieldStats,
  InterferenceResult,
  CoherentPath,
  TaskIntent,
  LatticeRoutingDecision,
} from '../../types/index.js';
import { logger } from '../../../monitoring/logger.js';

export class VeraLatticeManager extends EventEmitter {
  private fields: Map<string, ReasoningFieldImpl> = new Map();
  private crossFieldEntanglements: Map<string, Set<string>> = new Map();

  constructor() {
    super();
  }

  /**
   * Create a new reasoning field
   */
  createField(id: string, name: string, dimensions: string[]): ReasoningField {
    if (this.fields.has(id)) {
      throw new Error(`Field ${id} already exists`);
    }

    const field = new ReasoningFieldImpl(id, name, dimensions);
    this.fields.set(id, field);

    // Forward field events
    field.on('hypotheses_superposed', (data) => this.emit('hypotheses_superposed', data));
    field.on('node_collapsed', (data) => this.emit('node_collapsed', data));
    field.on('nodes_entangled', (data) => this.emit('nodes_entangled', data));

    logger.info('VeraLatticeManager', {
      message: 'Field created',
      fieldId: id,
      fieldName: name,
      dimensions: dimensions.length,
    });

    this.emit('field_created', { fieldId: id, name, dimensions });
    return field;
  }

  /**
   * Get a field by ID
   */
  getField(id: string): ReasoningFieldImpl | undefined {
    return this.fields.get(id);
  }

  /**
   * Get all fields
   */
  getAllFields(): ReasoningField[] {
    return Array.from(this.fields.values());
  }

  /**
   * Register a specialized field instance (Economic, Security, Performance)
   */
  registerField(field: ReasoningFieldImpl): void {
    if (this.fields.has(field.id)) {
      logger.warn('VeraLatticeManager', {
        message: 'Field already exists, overwriting',
        fieldId: field.id,
      });
    }

    this.fields.set(field.id, field);

    // Forward field events
    field.on('hypotheses_superposed', (data) => this.emit('hypotheses_superposed', data));
    field.on('node_collapsed', (data) => this.emit('node_collapsed', data));
    field.on('nodes_entangled', (data) => this.emit('nodes_entangled', data));

    logger.info('VeraLatticeManager', {
      message: 'Specialized field registered',
      fieldId: field.id,
      fieldName: field.name,
    });

    this.emit('field_registered', { fieldId: field.id, name: field.name });
  }

  /**
   * Get economic field
   */
  getEconomicField(): EconomicField | undefined {
    return this.fields.get('economic') as EconomicField | undefined;
  }

  /**
   * Get security field
   */
  getSecurityField(): SecurityField | undefined {
    return this.fields.get('security') as SecurityField | undefined;
  }

  /**
   * Get performance field
   */
  getPerformanceField(): PerformanceField | undefined {
    return this.fields.get('performance') as PerformanceField | undefined;
  }
  removeField(id: string): boolean {
    const field = this.fields.get(id);
    if (!field) return false;

    // Remove all cross-field entanglements
    this.crossFieldEntanglements.delete(id);
    for (const [fieldId, entangledSet] of this.crossFieldEntanglements.entries()) {
      if (entangledSet.has(id)) {
        entangledSet.delete(id);
      }
    }

    this.fields.delete(id);

    logger.info('VeraLatticeManager', {
      message: 'Field removed',
      fieldId: id,
    });

    this.emit('field_removed', { fieldId: id });
    return true;
  }

  /**
   * Entangle nodes across different fields
   */
  entangleCrossField(
    fieldId1: string, 
    nodeId1: string, 
    fieldId2: string, 
    nodeId2: string
  ): boolean {
    const field1 = this.fields.get(fieldId1);
    const field2 = this.fields.get(fieldId2);

    if (!field1 || !field2) {
      logger.warn('VeraLatticeManager', {
        message: 'Cannot cross-field entangle: field not found',
        fieldId1,
        fieldId2,
      });
      return false;
    }

    // Within-field entanglement
    if (fieldId1 === fieldId2) {
      return field1.entangleNodes(nodeId1, nodeId2);
    }

    // Cross-field entanglement tracking
    const key1 = `${fieldId1}:${nodeId1}`;
    const key2 = `${fieldId2}:${nodeId2}`;

    if (!this.crossFieldEntanglements.has(key1)) {
      this.crossFieldEntanglements.set(key1, new Set());
    }
    this.crossFieldEntanglements.get(key1)!.add(key2);

    if (!this.crossFieldEntanglements.has(key2)) {
      this.crossFieldEntanglements.set(key2, new Set());
    }
    this.crossFieldEntanglements.get(key2)!.add(key1);

    logger.debug('VeraLatticeManager', {
      message: 'Cross-field entanglement created',
      fieldId1,
      nodeId1,
      fieldId2,
      nodeId2,
    });

    this.emit('cross_field_entangled', { fieldId1, nodeId1, fieldId2, nodeId2 });
    return true;
  }

  /**
   * Make a routing decision for a task using lattice reasoning
   */
  makeRoutingDecision(
    task: TaskIntent,
    candidateAgents: Array<{ agentId: string; service: string; fee: number }>
  ): LatticeRoutingDecision {
    // Use the verification field for task analysis
    const verificationField = this.fields.get('verification');
    
    if (!verificationField) {
      // Fallback to simple random selection
      return {
        taskId: task.taskId,
        recommendedAgents: candidateAgents.map(a => a.agentId),
        confidence: 0.5,
        estimatedCompletion: task.deadlineMs - Date.now(),
        riskFactors: ['No verification field available'],
        requiresHumanReview: true,
      };
    }

    // Superpose hypotheses about each agent's suitability
    const hypotheses = candidateAgents.map(agent => 
      `Agent ${agent.agentId} can handle ${task.serviceType} within budget ${task.budget}`
    );

    const nodes = verificationField.superposeHypotheses(hypotheses, 
      candidateAgents.map(agent => ({ agentId: agent.agentId, fee: agent.fee }))
    );

    // Add evidence based on agent fit
    nodes.forEach((node, index) => {
      const agent = candidateAgents[index];
      const evidence: string[] = [];
      
      // Service match
      if (agent.service.toLowerCase() === task.serviceType.toLowerCase()) {
        evidence.push('Exact service match');
      } else if (agent.service.toLowerCase().includes(task.serviceType.toLowerCase())) {
        evidence.push('Related service match');
      }

      // Budget fit
      if (agent.fee <= task.budget) {
        evidence.push('Within budget');
      } else {
        evidence.push('Over budget');
      }

      // Add evidence to node
      evidence.forEach(e => (node as any).addEvidence(e, 0.2));
    });

    // Find the most coherent path to a decision
    const startNode = nodes[0];
    const path = verificationField.findCoherentPath(startNode.id, 'suitable');

    // Rank agents by their node confidence
    const rankedAgents = nodes
      .map((node, index) => ({ 
        agentId: candidateAgents[index].agentId, 
        confidence: node.confidence,
        nodeId: node.id,
      }))
      .sort((a, b) => b.confidence - a.confidence);

    const topConfidence = rankedAgents[0]?.confidence || 0;
    const riskFactors: string[] = [];

    if (topConfidence < task.requiredConfidence) {
      riskFactors.push('No agent meets required confidence threshold');
    }
    if (rankedAgents[0] && candidateAgents.find(a => a.agentId === rankedAgents[0].agentId)?.fee! > task.budget) {
      riskFactors.push('Top agent exceeds budget');
    }

    return {
      taskId: task.taskId,
      recommendedAgents: rankedAgents.map(r => r.agentId),
      confidence: topConfidence,
      estimatedCompletion: task.deadlineMs - Date.now(),
      riskFactors,
      requiresHumanReview: topConfidence < task.requiredConfidence || riskFactors.length > 0,
      reasoningPath: path,
    };
  }

  /**
   * Get statistics for all fields
   */
  getAllStats(): FieldStats[] {
    return Array.from(this.fields.values()).map(field => field.getStats());
  }

  /**
   * Get overall system coherence
   */
  getSystemCoherence(): number {
    const fields = Array.from(this.fields.values());
    if (fields.length === 0) return 1.0;

    const totalCoherence = fields.reduce((sum, f) => sum + f.coherence, 0);
    return totalCoherence / fields.length;
  }

  /**
   * Get comprehensive lattice statistics for metrics API
   */
  getLatticeStats(): {
    coherence: number;
    entanglements: number;
    fields: number;
    routingDecisions: number;
    fieldDetails: FieldStats[];
  } {
    const fieldStats = this.getAllStats();
    return {
      coherence: this.getSystemCoherence(),
      entanglements: this.crossFieldEntanglements.size,
      fields: this.fields.size,
      routingDecisions: 0, // Would be tracked in future
      fieldDetails: fieldStats
    };
  }

  /**
   * Export all lattice state (for persistence)
   */
  exportState(): Record<string, unknown> {
    const state: Record<string, unknown> = {
      fields: {},
      crossFieldEntanglements: {},
      timestamp: Date.now(),
    };

    for (const [id, field] of this.fields.entries()) {
      const stats = field.getStats();
      const nodes = Array.from((field as any).nodeImpls.values()).map((node: LatticeNode) => ({
        id: node.id,
        hypothesis: node.hypothesis,
        state: node.state,
        confidence: node.confidence,
        evidence: node.evidence,
        coordinates: node.coordinates,
        entangledWith: node.entangledWith,
        createdAt: node.createdAt,
        collapsedAt: node.collapsedAt,
      }));

      (state.fields as Record<string, unknown>)[id] = {
        id: field.id,
        name: field.name,
        dimensions: field.dimensions,
        coherence: field.coherence,
        nodes,
        stats,
      };
    }

    for (const [key, entangledSet] of this.crossFieldEntanglements.entries()) {
      (state.crossFieldEntanglements as Record<string, string[]>)[key] = Array.from(entangledSet);
    }

    return state;
  }

  /**
   * Import lattice state (for recovery)
   */
  importState(state: Record<string, unknown>): void {
    // Clear existing fields
    this.fields.clear();
    this.crossFieldEntanglements.clear();

    const fields = state.fields as Record<string, Record<string, unknown>>;
    
    for (const [fieldId, fieldData] of Object.entries(fields)) {
      const field = new ReasoningFieldImpl(
        fieldId,
        fieldData.name as string,
        fieldData.dimensions as string[]
      );
      
      (field as any).coherence = fieldData.coherence as number;
      
      // Restore nodes
      const nodes = fieldData.nodes as Array<Record<string, unknown>>;
      for (const nodeData of nodes) {
        const node = (field as any).superpose(nodeData.hypothesis as string, {
          restored: true,
          originalCreatedAt: nodeData.createdAt,
        });
        
        (node as any).state = nodeData.state;
        (node as any).confidence = nodeData.confidence;
        (node as any).evidence = nodeData.evidence;
        (node as any).coordinates = nodeData.coordinates;
        (node as any).entangledWith = nodeData.entangledWith || [];
        (node as any).createdAt = nodeData.createdAt as number;
        (node as any).collapsedAt = nodeData.collapsedAt as number | undefined;
      }

      this.fields.set(fieldId, field);
    }

    // Restore cross-field entanglements
    const crossField = state.crossFieldEntanglements as Record<string, string[]>;
    for (const [key, entangledList] of Object.entries(crossField)) {
      this.crossFieldEntanglements.set(key, new Set(entangledList));
    }

    logger.info('VeraLatticeManager', {
      message: 'State imported',
      fields: this.fields.size,
      crossFieldEntanglements: this.crossFieldEntanglements.size,
    });
  }

  /**
   * Clear all fields
   */
  clear(): void {
    this.fields.clear();
    this.crossFieldEntanglements.clear();
  }
}

// Singleton instance
export const latticeManager = new VeraLatticeManager();
export default latticeManager;
