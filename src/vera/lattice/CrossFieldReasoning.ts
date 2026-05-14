/**
 * Vera Lattice - Cross-Field Reasoning Engine
 * 
 * Aggregates insights across multiple lattice fields (verification, economic, security, performance)
 * to make unified routing decisions with conflict detection and resolution
 */

import { EventEmitter } from 'events';
import { latticeManager, VeraLatticeManager } from './core/LatticeManager.js';
import type { 
  LatticeNode, 
  LatticeRoutingDecision, 
  TaskIntent, 
  TaskBid,
  AgentRegistration,
  CoherentPath 
} from '../types/index.js';
import { logger } from '../../monitoring/logger.js';
import { EconomicField, EconomicScore } from './fields/EconomicField.js';
import { SecurityField } from './fields/SecurityField.js';
import { PerformanceField, LatencyPrediction } from './fields/PerformanceField.js';

export interface FieldScore {
  fieldId: string;
  confidence: number;
  recommendation: string;
  weight: number;
}

export interface CrossFieldDecision {
  taskId: string;
  fieldScores: FieldScore[];
  aggregateConfidence: number;
  contradictions: Array<{ fieldA: string; fieldB: string; issue: string; severity: 'low' | 'medium' | 'high' }>;
  resolution: string;
  finalRecommendation: string[];
  requiresHumanReview: boolean;
  reasoningPath?: CoherentPath;
}

export interface AgentMultiFieldScore {
  agentId: string;
  verificationScore: number;
  economicScore: EconomicScore;
  securityScore: { risk: number; compliance: number };
  performanceScore: { overall: number; latency: LatencyPrediction };
  aggregateScore: number;
  confidence: number;
  riskFlags: string[];
}

export interface ConflictResolutionStrategy {
  name: string;
  priority: string[]; // Field IDs in priority order
  thresholdOverrides: Record<string, number>;
}

export class CrossFieldReasoning extends EventEmitter {
  private manager: VeraLatticeManager;
  private economicField: EconomicField;
  private securityField: SecurityField;
  private performanceField: PerformanceField;

  private resolutionStrategies: Map<string, ConflictResolutionStrategy> = new Map();
  private fieldWeights: Map<string, number> = new Map();

  constructor(
    manager: VeraLatticeManager = latticeManager,
    economic: EconomicField,
    security: SecurityField,
    performance: PerformanceField
  ) {
    super();
    this.manager = manager;
    this.economicField = economic;
    this.securityField = security;
    this.performanceField = performance;

    this.initializeDefaultStrategies();
    this.initializeDefaultWeights();
  }

  /**
   * Make a unified routing decision using all available fields
   */
  async makeRoutingDecision(
    task: TaskIntent,
    candidateAgents: AgentRegistration[],
    bids: TaskBid[]
  ): Promise<CrossFieldDecision> {
    const startTime = Date.now();
    
    // Get scores from each field
    const verificationField = this.manager.getField('verification');
    const fieldScores: FieldScore[] = [];
    const agentMultiScores: Map<string, AgentMultiFieldScore> = new Map();

    // Initialize agent scores
    for (const agent of candidateAgents) {
      agentMultiScores.set(agent.agentId, {
        agentId: agent.agentId,
        verificationScore: 0.5,
        economicScore: this.economicField.scoreAgentPaymentCapability(agent.agentId),
        securityScore: { risk: 0.5, compliance: 0.5 },
        performanceScore: { overall: 0.5, latency: this.performanceField.predictLatency(agent.agentId) },
        aggregateScore: 0,
        confidence: 0.5,
        riskFlags: []
      });
    }

    // Verification field scoring
    if (verificationField) {
      const hypotheses = candidateAgents.map(agent => 
        `Agent ${agent.agentId} is suitable for ${task.serviceType}`
      );
      const nodes = verificationField.superposeHypotheses(hypotheses);
      
      nodes.forEach((node, index) => {
        const agent = candidateAgents[index];
        const bid = bids.find(b => b.agentId === agent.agentId);
        
        // Add evidence based on match quality
        if (agent.service.toLowerCase() === task.serviceType.toLowerCase()) {
          (node as any).addEvidence('Exact service match', 0.2);
        }
        if (bid && bid.fee <= task.budget) {
          (node as any).addEvidence('Within budget', 0.15);
        }

        const score = agentMultiScores.get(agent.agentId)!;
        score.verificationScore = node.confidence;
      });

      fieldScores.push({
        fieldId: 'verification',
        confidence: Math.max(...nodes.map(n => n.confidence)),
        recommendation: candidateAgents[nodes.findIndex(n => n.confidence === Math.max(...nodes.map(n2 => n2.confidence)))]?.agentId || '',
        weight: this.fieldWeights.get('verification') || 0.25
      });
    }

    // Security field scoring
    for (const agent of candidateAgents) {
      const riskAssessment = this.securityField.assessAgentRisk(agent.agentId);
      const compliance = this.securityField.scoreCompliance(agent.agentId);
      const score = agentMultiScores.get(agent.agentId)!;
      
      score.securityScore = {
        risk: 1 - riskAssessment.overallRisk, // Invert so higher is better
        compliance: compliance.score
      };

      if (riskAssessment.requiresIsolation) {
        score.riskFlags.push('security_isolation_required');
      }
      if (compliance.violations.length > 0) {
        score.riskFlags.push(`compliance_violations_${compliance.violations.length}`);
      }
    }

    fieldScores.push({
      fieldId: 'security',
      confidence: Math.min(...candidateAgents.map(a => agentMultiScores.get(a.agentId)!.securityScore.compliance)),
      recommendation: 'security_check_complete',
      weight: this.fieldWeights.get('security') || 0.25
    });

    // Performance field scoring
    for (const agent of candidateAgents) {
      const perfScore = this.performanceField.scorePerformance(agent.agentId);
      const prediction = this.performanceField.predictLatency(agent.agentId);
      const score = agentMultiScores.get(agent.agentId)!;
      
      score.performanceScore = {
        overall: perfScore.overall,
        latency: prediction
      };

      // Check if can meet deadline
      if (prediction.predictedLatencyMs > task.deadlineMs - Date.now()) {
        score.riskFlags.push('may_miss_deadline');
      }
    }

    fieldScores.push({
      fieldId: 'performance',
      confidence: Math.max(...Array.from(agentMultiScores.values()).map(s => s.performanceScore.overall)),
      recommendation: 'performance_optimized',
      weight: this.fieldWeights.get('performance') || 0.25
    });

    // Economic field already scored above
    fieldScores.push({
      fieldId: 'economic',
      confidence: Math.max(...Array.from(agentMultiScores.values()).map(s => s.economicScore.overallScore)),
      recommendation: 'cost_optimized',
      weight: this.fieldWeights.get('economic') || 0.25
    });

    // Detect contradictions
    const contradictions = this.detectContradictions(agentMultiScores, task);

    // Resolve conflicts and calculate aggregate scores
    const resolution = this.resolveConflicts(contradictions, task.serviceType);
    
    for (const [agentId, score] of agentMultiScores) {
      const weights = Array.from(this.fieldWeights.values());
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      
      score.aggregateScore = (
        score.verificationScore * (this.fieldWeights.get('verification') || 0.25) +
        score.economicScore.overallScore * (this.fieldWeights.get('economic') || 0.25) +
        score.securityScore.compliance * (this.fieldWeights.get('security') || 0.25) +
        score.performanceScore.overall * (this.fieldWeights.get('performance') || 0.25)
      ) / totalWeight;

      // Penalize for risk flags
      score.aggregateScore *= Math.max(0.5, 1 - (score.riskFlags.length * 0.1));
      
      score.confidence = score.aggregateScore;
    }

    // Sort by aggregate score
    const sortedAgents = Array.from(agentMultiScores.values())
      .sort((a, b) => b.aggregateScore - a.aggregateScore);

    const finalRecommendation = sortedAgents.slice(0, 3).map(s => s.agentId);
    const topScore = sortedAgents[0];

    const decision: CrossFieldDecision = {
      taskId: task.taskId,
      fieldScores,
      aggregateConfidence: topScore?.aggregateScore || 0,
      contradictions,
      resolution,
      finalRecommendation,
      requiresHumanReview: contradictions.length > 2 || topScore?.riskFlags.length! > 2,
    };

    const duration = Date.now() - startTime;
    logger.info('CrossFieldReasoning', {
      message: 'Routing decision complete',
      taskId: task.taskId,
      candidates: candidateAgents.length,
      contradictions: contradictions.length,
      topAgent: finalRecommendation[0],
      confidence: decision.aggregateConfidence,
      durationMs: duration
    });

    this.emit('decision_made', decision);
    return decision;
  }

  /**
   * Detect contradictions between field recommendations
   */
  private detectContradictions(
    scores: Map<string, AgentMultiFieldScore>,
    task: TaskIntent
  ): Array<{ fieldA: string; fieldB: string; issue: string; severity: 'low' | 'medium' | 'high' }> {
    const contradictions: Array<{ fieldA: string; fieldB: string; issue: string; severity: 'low' | 'medium' | 'high' }> = [];

    for (const [agentId, score] of scores) {
      // Economic vs Performance: High performance but low cost efficiency
      if (score.economicScore.costEfficiency < 0.3 && score.performanceScore.overall > 0.8) {
        contradictions.push({
          fieldA: 'economic',
          fieldB: 'performance',
          issue: `Agent ${agentId} has high performance but poor cost efficiency`,
          severity: 'medium'
        });
      }

      // Security vs Economic: Good security but expensive
      if (score.securityScore.compliance > 0.9 && score.economicScore.costEfficiency < 0.4) {
        contradictions.push({
          fieldA: 'security',
          fieldB: 'economic',
          issue: `Agent ${agentId} has high security compliance but is expensive`,
          severity: 'low'
        });
      }

      // Security red flags
      if (score.securityScore.risk < 0.3) {
        contradictions.push({
          fieldA: 'security',
          fieldB: 'verification',
          issue: `Agent ${agentId} has high security risk`,
          severity: 'high'
        });
      }

      // Performance vs Deadline
      if (score.performanceScore.latency.predictedLatencyMs > task.deadlineMs - Date.now()) {
        contradictions.push({
          fieldA: 'performance',
          fieldB: 'verification',
          issue: `Agent ${agentId} predicted latency exceeds deadline`,
          severity: 'high'
        });
      }

      // Budget conflict
      if (score.economicScore.recommendedMaxBudget < task.budget * 0.8) {
        contradictions.push({
          fieldA: 'economic',
          fieldB: 'verification',
          issue: `Agent ${agentId} recommended budget below task budget`,
          severity: 'medium'
        });
      }
    }

    return contradictions;
  }

  /**
   * Resolve conflicts using configured strategies
   */
  private resolveConflicts(
    contradictions: Array<{ fieldA: string; fieldB: string; issue: string; severity: 'low' | 'medium' | 'high' }>,
    serviceType: string
  ): string {
    const strategy = this.resolutionStrategies.get(serviceType) || 
                     this.resolutionStrategies.get('default')!;

    const highSeverityCount = contradictions.filter(c => c.severity === 'high').length;
    const mediumSeverityCount = contradictions.filter(c => c.severity === 'medium').length;

    if (highSeverityCount > 2) {
      return 'manual_review_required_due_to_high_severity_conflicts';
    }

    if (highSeverityCount > 0) {
      return `prioritizing_${strategy.priority[0]}_due_to_high_severity_issues`;
    }

    if (mediumSeverityCount > 3) {
      return 'balanced_approach_with_moderate_penalties';
    }

    return 'weighted_aggregate_score_used';
  }

  /**
   * Register a custom conflict resolution strategy
   */
  registerResolutionStrategy(
    serviceType: string,
    priority: string[],
    thresholdOverrides?: Record<string, number>
  ): void {
    this.resolutionStrategies.set(serviceType, {
      name: `${serviceType}_strategy`,
      priority,
      thresholdOverrides: thresholdOverrides || {}
    });

    logger.info('CrossFieldReasoning', {
      message: 'Resolution strategy registered',
      serviceType,
      priority
    });
  }

  /**
   * Update field weights for aggregation
   */
  setFieldWeights(weights: Record<string, number>): void {
    for (const [field, weight] of Object.entries(weights)) {
      this.fieldWeights.set(field, weight);
    }

    // Normalize weights
    const total = Array.from(this.fieldWeights.values()).reduce((a, b) => a + b, 0);
    for (const [field, weight] of this.fieldWeights) {
      this.fieldWeights.set(field, weight / total);
    }
  }

  /**
   * Get current field weights
   */
  getFieldWeights(): Record<string, number> {
    return Object.fromEntries(this.fieldWeights);
  }

  /**
   * Get detailed multi-field score for an agent
   */
  getAgentMultiFieldScore(agentId: string): AgentMultiFieldScore | null {
    return null; // Real-time calculation would require all fields
  }

  /**
   * Calculate system-wide coherence across all fields
   */
  getSystemCoherence(): {
    overall: number;
    byField: Record<string, number>;
    crossFieldAlignment: number;
  } {
    const byField: Record<string, number> = {};
    
    for (const fieldId of ['verification', 'economic', 'security', 'performance']) {
      const field = this.manager.getField(fieldId);
      byField[fieldId] = field?.coherence || 0.5;
    }

    const values = Object.values(byField);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    
    return {
      overall: avg,
      byField,
      crossFieldAlignment: 1 - variance
    };
  }

  /**
   * Export cross-field reasoning state
   */
  exportState(): {
    strategies: Record<string, ConflictResolutionStrategy>;
    weights: Record<string, number>;
    timestamp: number;
  } {
    return {
      strategies: Object.fromEntries(this.resolutionStrategies),
      weights: Object.fromEntries(this.fieldWeights),
      timestamp: Date.now()
    };
  }

  // Private initialization

  private initializeDefaultStrategies(): void {
    // Default balanced strategy
    this.resolutionStrategies.set('default', {
      name: 'default_balanced',
      priority: ['security', 'verification', 'performance', 'economic'],
      thresholdOverrides: {}
    });

    // Financial services - prioritize security and economic
    this.resolutionStrategies.set('defi', {
      name: 'financial_priority',
      priority: ['security', 'economic', 'performance', 'verification'],
      thresholdOverrides: { security: 0.8, economic: 0.7 }
    });

    // Time-critical services - prioritize performance
    this.resolutionStrategies.set('urgent', {
      name: 'performance_priority',
      priority: ['performance', 'verification', 'security', 'economic'],
      thresholdOverrides: { performance: 0.85 }
    });

    // Carbon/energy - prioritize verification and economic
    this.resolutionStrategies.set('carbon', {
      name: 'verification_priority',
      priority: ['verification', 'economic', 'security', 'performance'],
      thresholdOverrides: { verification: 0.8 }
    });
  }

  private initializeDefaultWeights(): void {
    this.fieldWeights.set('verification', 0.25);
    this.fieldWeights.set('economic', 0.25);
    this.fieldWeights.set('security', 0.25);
    this.fieldWeights.set('performance', 0.25);
  }
}

// Export singleton instance
// Note: This will be properly instantiated after all fields are created
export let crossFieldReasoning: CrossFieldReasoning;

export function initializeCrossFieldReasoning(
  economic: EconomicField,
  security: SecurityField,
  performance: PerformanceField
): CrossFieldReasoning {
  crossFieldReasoning = new CrossFieldReasoning(latticeManager, economic, security, performance);
  return crossFieldReasoning;
}

export default crossFieldReasoning;
