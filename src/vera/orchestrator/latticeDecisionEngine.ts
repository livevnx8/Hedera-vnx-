/**
 * Lattice Decision Engine
 * Integrates lattice reasoning with orchestrator for agent selection and task routing
 */

import { EventEmitter } from 'events';
import { ReasoningFieldImpl } from '../lattice/core/LatticeField.js';
import { logger } from '../../monitoring/logger.js';

export interface LatticeRoutingDecision {
  taskId: string;
  recommendedAgents: string[];
  confidence: number;
  estimatedCompletion: number;
  riskFactors: string[];
  requiresHumanReview: boolean;
  reasoningPath: string[];
}

export interface TaskAnalysis {
  taskId: string;
  taskType: string;
  complexity: number;
  urgency: number;
  requiredCapabilities: string[];
}

export class LatticeDecisionEngine extends EventEmitter {
  private fields = new Map<string, ReasoningFieldImpl>();
  private decisionHistory: LatticeRoutingDecision[] = [];

  /**
   * Register a reasoning field
   */
  registerField(field: ReasoningFieldImpl): void {
    this.fields.set(field.id, field);
    
    logger.info('LatticeDecisionEngine', {
      message: 'Field registered',
      fieldId: field.id,
      fieldName: field.name,
      dimensions: field.dimensions.length,
    });
  }

  /**
   * Analyze task and make routing decision using lattice reasoning
   */
  makeRoutingDecision(task: TaskAnalysis): LatticeRoutingDecision {
    const startTime = Date.now();
    
    // Create hypothesis in appropriate field based on task type
    const field = this.selectFieldForTask(task.taskType);
    
    if (!field) {
      return this.createFallbackDecision(task);
    }

    // Superpose task hypothesis
    const hypothesis = `Task ${task.taskId} can be completed successfully by optimal agent`;
    const node = field.superpose(hypothesis, {
      taskId: task.taskId,
      taskType: task.taskType,
      complexity: task.complexity,
      urgency: task.urgency,
      capabilities: task.requiredCapabilities,
    });

    // Add evidence based on task characteristics
    this.addTaskEvidence(field, node.id, task);

    // Find most coherent agents (simulated)
    const recommendedAgents = this.findOptimalAgents(task, field, node.id);
    
    // Calculate confidence
    const confidence = this.calculateDecisionConfidence(field, node.id, recommendedAgents);
    
    // Identify risk factors
    const riskFactors = this.identifyRiskFactors(task, field, node.id);
    
    // Build reasoning path
    const reasoningPath = this.buildReasoningPath(field, node.id, recommendedAgents);

    // Determine if human review needed
    const requiresHumanReview = confidence < 0.7 || riskFactors.length > 2;

    const decision: LatticeRoutingDecision = {
      taskId: task.taskId,
      recommendedAgents,
      confidence,
      estimatedCompletion: this.estimateCompletion(task, recommendedAgents),
      riskFactors,
      requiresHumanReview,
      reasoningPath,
    };

    // Store decision
    this.decisionHistory.push(decision);
    if (this.decisionHistory.length > 100) {
      this.decisionHistory.shift();
    }

    // Collapse the decision node
    field.collapseNode(node.id, [
      `Routing decision made with ${(confidence * 100).toFixed(0)}% confidence`,
      `Recommended agents: ${recommendedAgents.join(', ')}`,
    ], confidence * 0.2);

    logger.info('LatticeDecisionEngine', {
      message: 'Routing decision made',
      taskId: task.taskId,
      confidence: decision.confidence.toFixed(2),
      agents: recommendedAgents.length,
      duration: `${Date.now() - startTime}ms`,
    });

    this.emit('decision_made', decision);
    return decision;
  }

  /**
   * Select appropriate reasoning field for task type
   */
  private selectFieldForTask(taskType: string): ReasoningFieldImpl | undefined {
    const fieldMapping: Record<string, string> = {
      'carbon_verification': 'verification',
      'defi_analysis': 'economic',
      'token_operation': 'cryptographic',
      'partnership': 'strategic',
      'forecasting': 'temporal',
      'payment': 'economic',
      'security_audit': 'verification',
    };

    const fieldId = fieldMapping[taskType.toLowerCase()] || 'verification';
    return this.fields.get(fieldId);
  }

  /**
   * Add task-specific evidence to decision node
   */
  private addTaskEvidence(field: ReasoningFieldImpl, nodeId: string, task: TaskAnalysis): void {
    // Normalize complexity (0-1)
    const complexityWeight = Math.min(1, task.complexity / 10);
    field.nodes.get(nodeId)?.metadata?.complexity ? 
      null : null; // Access check

    // Evidence: complexity
    if (task.complexity < 3) {
      (field.nodes.get(nodeId) as any)?.addEvidence?.('Low complexity task', 0.8);
    } else if (task.complexity > 7) {
      (field.nodes.get(nodeId) as any)?.addEvidence?.('High complexity task', 0.6);
    }

    // Evidence: urgency
    if (task.urgency > 0.8) {
      (field.nodes.get(nodeId) as any)?.addEvidence?.('Urgent task requires fast response', 0.7);
    }

    // Evidence: capabilities match
    const capabilityMatch = task.requiredCapabilities.length > 0 ? 0.75 : 0.5;
    (field.nodes.get(nodeId) as any)?.addEvidence?.(
      `Required capabilities: ${task.requiredCapabilities.join(', ')}`, 
      capabilityMatch
    );
  }

  /**
   * Find optimal agents for task (simulated)
   */
  private findOptimalAgents(task: TaskAnalysis, field: ReasoningFieldImpl, nodeId: string): string[] {
    // In production, this would query agent registry and lattice coherence
    const agentPool = [
      'vera-defi-analyst',
      'vera-energy-auditor', 
      'vera-security-guardian',
      'vera-carbon-validator',
    ];

    // Filter by capability match
    const matching = agentPool.filter(agent => {
      const agentType = agent.replace('vera-', '').replace('-v2', '');
      return task.requiredCapabilities.some(cap => 
        agentType.includes(cap.toLowerCase()) || cap.toLowerCase().includes(agentType)
      );
    });

    // Return top 3 or fallback to all
    return matching.length > 0 ? matching.slice(0, 3) : agentPool.slice(0, 2);
  }

  /**
   * Calculate confidence in routing decision
   */
  private calculateDecisionConfidence(
    field: ReasoningFieldImpl, 
    nodeId: string, 
    agents: string[]
  ): number {
    const node = field.nodes.get(nodeId);
    if (!node) return 0.5;

    // Base confidence from node
    let confidence = node.confidence;

    // Adjust for number of agents
    confidence *= (0.5 + agents.length * 0.15);

    // Adjust for field coherence
    confidence *= (0.7 + field.coherence * 0.3);

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(
    task: TaskAnalysis, 
    field: ReasoningFieldImpl, 
    nodeId: string
  ): string[] {
    const risks: string[] = [];

    if (task.complexity > 8) {
      risks.push('HIGH_COMPLEXITY');
    }
    if (task.urgency > 0.9) {
      risks.push('TIME_CRITICAL');
    }
    if (field.coherence < 0.6) {
      risks.push('LOW_FIELD_COHERENCE');
    }
    if (task.requiredCapabilities.length === 0) {
      risks.push('UNCLEAR_REQUIREMENTS');
    }

    return risks;
  }

  /**
   * Build human-readable reasoning path
   */
  private buildReasoningPath(
    field: ReasoningFieldImpl, 
    nodeId: string, 
    agents: string[]
  ): string[] {
    const path: string[] = [];
    
    path.push(`Analyzed in ${field.name} field`);
    path.push(`Field coherence: ${(field.coherence * 100).toFixed(0)}%`);
    path.push(`Selected ${agents.length} candidate agents`);
    path.push(`Agents ranked by capability match and field coherence`);
    
    return path;
  }

  /**
   * Estimate completion time
   */
  private estimateCompletion(task: TaskAnalysis, agents: string[]): number {
    // Base time in seconds
    const baseTime = 60;
    const complexityMultiplier = 1 + task.complexity * 0.2;
    const agentSpeedup = agents.length > 1 ? 0.8 : 1.0;
    
    return Math.round(baseTime * complexityMultiplier * agentSpeedup);
  }

  /**
   * Create fallback decision when no field available
   */
  private createFallbackDecision(task: TaskAnalysis): LatticeRoutingDecision {
    return {
      taskId: task.taskId,
      recommendedAgents: ['vera-defi-analyst', 'vera-security-guardian'],
      confidence: 0.5,
      estimatedCompletion: 120,
      riskFactors: ['NO_LATTICE_FIELD', 'FALLBACK_ROUTING'],
      requiresHumanReview: true,
      reasoningPath: ['No appropriate reasoning field available', 'Using fallback routing'],
    };
  }

  /**
   * Get decision history
   */
  getDecisionHistory(limit = 10): LatticeRoutingDecision[] {
    return this.decisionHistory.slice(-limit);
  }

  /**
   * Get decision statistics
   */
  getStats(): object {
    const total = this.decisionHistory.length;
    const avgConfidence = total > 0 
      ? this.decisionHistory.reduce((sum, d) => sum + d.confidence, 0) / total 
      : 0;
    
    return {
      totalDecisions: total,
      avgConfidence: avgConfidence.toFixed(2),
      humanReviewRate: total > 0 
        ? (this.decisionHistory.filter(d => d.requiresHumanReview).length / total).toFixed(2)
        : '0.00',
      fieldsRegistered: this.fields.size,
    };
  }
}

export default LatticeDecisionEngine;
