/**
 * Vera Lattice-Orchestrator Integration
 * Connects lattice reasoning to task orchestration for intelligent agent selection
 */

import { EventEmitter } from 'events';
import { 
  latticeManager,
  initializeCrossFieldReasoning,
  crossFieldReasoning,
  CrossFieldDecision,
  economicField,
  securityField,
  performanceField
} from '../lattice/index.js';
import { verificationLattice } from '../lattice/fields/VerificationLattice.js';
import type {
  TaskIntent,
  TaskBid,
  AgentRegistration,
  LatticeRoutingDecision,
  CoherentPath,
  LatticeNode,
  Currency,
} from '../types/index.js';
import { featureFlags } from './featureFlags.js';
import { logger } from '../../monitoring/logger.js';

export interface AgentMatch {
  agentId: string;
  score: number;
  confidence: number;
  reasoning: string[];
  latticePath?: CoherentPath;
}

export interface TaskAnalysis {
  taskId: string;
  complexity: number; // 0-1
  risk: number; // 0-1
  urgency: number; // 0-1
  recommendedStrategy: 'lowest_cost' | 'fastest' | 'highest_quality' | 'balanced';
  latticeField: string;
}

export class LatticeOrchestratorIntegration extends EventEmitter {
  private initialized = false;

  constructor() {
    super();
    this.initializeFields();
  }

  /**
   * Initialize lattice fields for orchestration
   */
  private initializeFields(): void {
    if (this.initialized) return;

    // Create default fields if they don't exist
    if (!latticeManager.getField('verification')) {
      latticeManager.createField('verification', 'Agent Verification', [
        'skill_match',
        'reputation',
        'availability',
        'cost_efficiency',
        'success_rate',
      ]);
    }

    if (!latticeManager.getField('economic')) {
      latticeManager.createField('economic', 'Economic Optimization', [
        'fee_competitiveness',
        'market_rate_alignment',
        'budget_adherence',
        'value_for_money',
      ]);
    }

    this.initialized = true;
    logger.info('LatticeOrchestratorIntegration', { message: 'Integration layer initialized' });
  }

  /**
   * Analyze a task and determine routing strategy using lattice reasoning
   */
  async analyzeTask(task: TaskIntent): Promise<TaskAnalysis> {
    // Check if lattice is enabled for this service
    if (!featureFlags.isLatticeEnabledForService(task.serviceType)) {
      return {
        taskId: task.taskId,
        complexity: 0.5,
        risk: 0.3,
        urgency: 0.5,
        recommendedStrategy: 'balanced',
        latticeField: 'none',
      };
    }

    const field = latticeManager.getField('verification');
    if (!field) {
      return {
        taskId: task.taskId,
        complexity: 0.5,
        risk: 0.3,
        urgency: 0.5,
        recommendedStrategy: 'balanced',
        latticeField: 'none',
      };
    }

    // Superpose hypotheses about task characteristics
    const hypotheses = [
      'Task is simple and routine',
      'Task requires specialized expertise',
      'Task has tight deadline pressure',
      'Task has high risk of failure',
      'Task requires multi-agent coordination',
    ];

    const nodes = field.superposeHypotheses(hypotheses);

    // Add evidence based on task characteristics
    if (task.budget < 100) {
      nodes[0].addEvidence('Low budget suggests simple task', 0.3);
    }
    if (task.requiredConfidence > 0.9) {
      nodes[1].addEvidence('High confidence requirement suggests expertise needed', 0.3);
    }
    if (task.deadlineMs - Date.now() < 300000) { // < 5 minutes
      nodes[2].addEvidence('Tight deadline detected', 0.4);
    }
    if (task.description.includes('critical') || task.description.includes('urgent')) {
      nodes[3].addEvidence('Keywords indicate high risk', 0.3);
    }

    // Calculate scores based on confidence values
    const complexity = (nodes[1].confidence + nodes[4].confidence) / 2;
    const risk = nodes[3].confidence;
    const urgency = nodes[2].confidence;

    // Determine strategy
    let strategy: TaskAnalysis['recommendedStrategy'] = 'balanced';
    if (urgency > 0.7) {
      strategy = 'fastest';
    } else if (complexity > 0.7) {
      strategy = 'highest_quality';
    } else if (task.budget < 50) {
      strategy = 'lowest_cost';
    }

    return {
      taskId: task.taskId,
      complexity,
      risk,
      urgency,
      recommendedStrategy: strategy,
      latticeField: 'verification',
    };
  }

  /**
   * Find the best agents for a task using lattice reasoning
   */
  async findBestAgents(
    task: TaskIntent,
    candidates: AgentRegistration[],
    bids: TaskBid[]
  ): Promise<LatticeRoutingDecision> {
    // Check feature flag
    if (!featureFlags.isLatticeEnabledForService(task.serviceType)) {
      // Fallback to basic selection
      return {
        taskId: task.taskId,
        recommendedAgents: candidates.map(c => c.agentId),
        confidence: 0.5,
        estimatedCompletion: task.deadlineMs - Date.now(),
        riskFactors: ['Lattice reasoning disabled'],
        requiresHumanReview: false,
      };
    }

    const field = latticeManager.getField('verification');
    if (!field) {
      return {
        taskId: task.taskId,
        recommendedAgents: candidates.map(c => c.agentId),
        confidence: 0.5,
        estimatedCompletion: task.deadlineMs - Date.now(),
        riskFactors: ['No verification field available'],
        requiresHumanReview: true,
      };
    }

    // Create agent match hypotheses
    const hypotheses = candidates.map(agent => 
      `Agent ${agent.agentId} is optimal for ${task.serviceType}`
    );

    const nodes = field.superposeHypotheses(
      hypotheses,
      candidates.map(agent => ({ agentId: agent.agentId, metadata: agent }))
    );

    // Score each agent
    const agentScores: AgentMatch[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const agent = candidates[i];
      const node = nodes[i];
      const bid = bids.find(b => b.agentId === agent.agentId);

      const reasoning: string[] = [];

      // Skill match
      const skillMatch = agent.service.toLowerCase() === task.serviceType.toLowerCase() ||
        agent.service.toLowerCase().includes(task.serviceType.toLowerCase());
      if (skillMatch) {
        node.addEvidence('Exact skill match', 0.2);
        reasoning.push('Exact skill match');
      } else {
        node.addEvidence('Partial skill match', 0.1);
        reasoning.push('Partial skill match');
      }

      // Budget fit
      if (bid) {
        if (bid.fee <= task.budget) {
          node.addEvidence('Within budget', 0.15);
          reasoning.push(`Within budget (${bid.fee} HBAR)`);
        } else {
          node.addEvidence('Over budget', -0.1);
          reasoning.push(`Over budget (${bid.fee} > ${task.budget})`);
        }

        // Confidence
        if (bid.confidence >= task.requiredConfidence) {
          node.addEvidence('Meets confidence threshold', 0.1);
          reasoning.push('Meets confidence requirement');
        }
      }

      // Calculate final score
      const score = node.confidence;

      agentScores.push({
        agentId: agent.agentId,
        score,
        confidence: node.confidence,
        reasoning,
        latticePath: field.findCoherentPath(node.id, 'optimal'),
      });
    }

    // Sort by score descending
    agentScores.sort((a, b) => b.score - a.score);

    // Calculate overall confidence
    const topConfidence = agentScores[0]?.confidence || 0;
    const riskFactors: string[] = [];

    if (topConfidence < task.requiredConfidence) {
      riskFactors.push('No agent meets required confidence threshold');
    }
    if (agentScores[0] && bids.find(b => b.agentId === agentScores[0].agentId)?.fee! > task.budget) {
      riskFactors.push('Top agent exceeds budget');
    }
    if (agentScores.length < 2) {
      riskFactors.push('Limited agent options available');
    }

    // Estimate completion time
    const topBid = bids.find(b => b.agentId === agentScores[0]?.agentId);
    const estimatedCompletion = topBid?.estimatedDurationMs || 60000;

    logger.info('LatticeOrchestratorIntegration', {
      message: 'Agent selection complete',
      taskId: task.taskId,
      topAgent: agentScores[0]?.agentId,
      confidence: topConfidence,
      candidatesConsidered: candidates.length,
    });

    return {
      taskId: task.taskId,
      recommendedAgents: agentScores.map(a => a.agentId),
      confidence: topConfidence,
      estimatedCompletion,
      riskFactors,
      requiresHumanReview: topConfidence < task.requiredConfidence || riskFactors.length > 2,
      reasoningPath: agentScores[0]?.latticePath,
    };
  }

  /**
   * Verify a task result using lattice reasoning
   */
  async verifyResult(
    taskId: string,
    result: Record<string, unknown>,
    expectedSchema?: Record<string, string>
  ): Promise<{
    valid: boolean;
    confidence: number;
    issues: string[];
  }> {
    const field = latticeManager.getField('verification');
    if (!field) {
      return { valid: true, confidence: 0.5, issues: ['No verification field'] };
    }

    // Superpose result validity hypotheses
    const hypotheses = [
      'Result is complete and valid',
      'Result has missing fields',
      'Result has incorrect format',
      'Result is suspicious',
    ];

    const nodes = field.superposeHypotheses(hypotheses);

    // Check schema compliance
    let issues: string[] = [];
    if (expectedSchema) {
      for (const [field, type] of Object.entries(expectedSchema)) {
        if (!(field in result)) {
          nodes[1].addEvidence(`Missing field: ${field}`, 0.2);
          issues.push(`Missing required field: ${field}`);
        } else if (typeof result[field] !== type) {
          nodes[2].addEvidence(`Type mismatch for ${field}`, 0.2);
          issues.push(`Type mismatch for ${field}: expected ${type}, got ${typeof result[field]}`);
        } else {
          nodes[0].addEvidence(`Valid field: ${field}`, 0.1);
        }
      }
    }

    // Check for suspicious patterns
    const resultStr = JSON.stringify(result);
    if (resultStr.length < 10) {
      nodes[3].addEvidence('Result unusually short', 0.2);
      issues.push('Result is suspiciously short');
    }
    if (resultStr.includes('error') || resultStr.includes('failed')) {
      nodes[3].addEvidence('Contains error indicators', 0.3);
      issues.push('Result may contain errors');
    }

    const valid = nodes[0].confidence > 0.7 && issues.length < 2;
    const confidence = nodes[0].confidence;

    return { valid, confidence, issues };
  }

  /**
   * Get integration statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      latticeFields: latticeManager.getAllStats().length,
      systemCoherence: latticeManager.getSystemCoherence(),
      crossFieldCoherence: crossFieldReasoning?.getSystemCoherence(),
    };
  }

  /**
   * Find best agents using multi-field reasoning (verification + economic + security + performance)
   */
  async findBestAgentsMultiField(
    task: TaskIntent,
    candidates: AgentRegistration[],
    bids: TaskBid[],
    options: {
      strategy?: 'balanced' | 'security_priority' | 'performance_priority' | 'cost_priority';
      minSecurityScore?: number;
      maxLatencyMs?: number;
      preferredCurrency?: Currency;
    } = {}
  ): Promise<CrossFieldDecision> {
    // Check feature flag
    if (!featureFlags.isLatticeEnabledForService(task.serviceType)) {
      // Initialize cross-field reasoning if needed
      if (!crossFieldReasoning) {
        initializeCrossFieldReasoning(economicField, securityField, performanceField);
      }

      // Fallback to basic selection wrapped in CrossFieldDecision format
      return {
        taskId: task.taskId,
        fieldScores: [],
        aggregateConfidence: 0.5,
        contradictions: [],
        resolution: 'lattice_disabled_fallback',
        finalRecommendation: candidates.map(c => c.agentId).slice(0, 3),
        requiresHumanReview: true,
      };
    }

    // Initialize cross-field reasoning on first use
    if (!crossFieldReasoning) {
      initializeCrossFieldReasoning(economicField, securityField, performanceField);
    }

    // Apply strategy-specific weights
    if (options.strategy) {
      const strategyWeights: Record<string, Record<string, number>> = {
        balanced: { verification: 0.25, economic: 0.25, security: 0.25, performance: 0.25 },
        security_priority: { verification: 0.2, economic: 0.15, security: 0.4, performance: 0.25 },
        performance_priority: { verification: 0.2, economic: 0.15, security: 0.2, performance: 0.45 },
        cost_priority: { verification: 0.2, economic: 0.45, security: 0.15, performance: 0.2 },
      };
      crossFieldReasoning!.setFieldWeights(strategyWeights[options.strategy]);
    }

    // Register all specialized fields
    if (!latticeManager.getField('economic')) {
      latticeManager.registerField(economicField);
    }
    if (!latticeManager.getField('security')) {
      latticeManager.registerField(securityField);
    }
    if (!latticeManager.getField('performance')) {
      latticeManager.registerField(performanceField);
    }

    // Perform cross-field reasoning
    const decision = await crossFieldReasoning!.makeRoutingDecision(task, candidates, bids);

    // Apply additional filters from options
    if (options.minSecurityScore !== undefined) {
      const secureAgents = securityField.getSecureAgents(options.minSecurityScore);
      decision.finalRecommendation = decision.finalRecommendation.filter(
        id => secureAgents.includes(id)
      );
    }

    if (options.maxLatencyMs !== undefined) {
      decision.finalRecommendation = decision.finalRecommendation.filter(agentId => {
        const prediction = performanceField.predictLatency(agentId);
        return prediction.predictedLatencyMs <= options.maxLatencyMs!;
      });
    }

    if (options.preferredCurrency) {
      // Sort by currency preference
      const scored = decision.finalRecommendation.map(agentId => {
        const history = economicField['agentPaymentHistories']?.get(agentId);
        const supportsCurrency = history?.preferredCurrencies?.includes(options.preferredCurrency!) ?? false;
        return { agentId, supportsCurrency };
      });
      
      scored.sort((a, b) => (b.supportsCurrency ? 1 : 0) - (a.supportsCurrency ? 1 : 0));
      decision.finalRecommendation = scored.map(s => s.agentId);
    }

    logger.info('LatticeOrchestratorIntegration', {
      message: 'Multi-field agent selection complete',
      taskId: task.taskId,
      strategy: options.strategy || 'balanced',
      topAgents: decision.finalRecommendation.slice(0, 3),
      aggregateConfidence: decision.aggregateConfidence,
      contradictions: decision.contradictions.length,
    });

    return decision;
  }

  /**
   * Currency-aware agent routing - considers payment capability and settlement costs
   */
  async routeByCurrency(
    task: TaskIntent,
    candidates: AgentRegistration[],
    currency: Currency,
    minReliability: number = 0.7
  ): Promise<{
    recommendedAgents: string[];
    settlementPrediction: {
      estimatedLatencyMs: number;
      estimatedFeeHbar: number;
      reliability: number;
    };
    reasoning: string[];
  }> {
    const scored = candidates.map(agent => {
      const economicScore = economicField.scoreAgentPaymentCapability(agent.agentId);
      const reliability = economicField.assessSettlementReliability(agent.agentId);
      const supportsCurrency = economicScore.preferredCurrencies?.includes(currency) ?? false;
      
      return {
        agentId: agent.agentId,
        economicScore,
        reliability,
        supportsCurrency,
        score: economicScore.overallScore * (supportsCurrency ? 1.2 : 1.0) // Boost for currency match
      };
    }).filter(s => s.reliability >= minReliability)
      .sort((a, b) => b.score - a.score);

    const recommended = scored.slice(0, 3).map(s => s.agentId);
    
    // Predict settlement characteristics
    const settlementPrediction = {
      estimatedLatencyMs: economicField.predictPaymentLatency(currency),
      estimatedFeeHbar: 0.001, // Base fee estimate
      reliability: scored[0]?.reliability ?? 0.5
    };

    const reasoning: string[] = [];
    if (scored[0]?.supportsCurrency) {
      reasoning.push(`Top agent supports ${currency} natively`);
    }
    reasoning.push(`${recommended.length} agents meet reliability threshold ${minReliability}`);
    reasoning.push(`Predicted settlement latency: ${settlementPrediction.estimatedLatencyMs}ms`);

    return {
      recommendedAgents: recommended,
      settlementPrediction,
      reasoning
    };
  }

  /**
   * Record settlement outcome for lattice learning
   */
  recordSettlementOutcome(
    agentId: string,
    taskId: string,
    amount: number,
    currency: Currency,
    success: boolean,
    durationMs: number
  ): void {
    // Update economic field
    economicField.recordSettlement(agentId, amount, currency, success, durationMs);

    // Update performance metrics
    performanceField.recordMetrics(agentId, {
      averageResponseTimeMs: durationMs,
      lastUpdated: Date.now()
    });

    logger.info('LatticeOrchestratorIntegration', {
      message: 'Settlement outcome recorded',
      agentId,
      taskId,
      success,
      currency,
      durationMs
    });

    this.emit('settlement_recorded', { agentId, taskId, success, currency });
  }
}

// Singleton instance
export const latticeOrchestrator = new LatticeOrchestratorIntegration();
export default latticeOrchestrator;
