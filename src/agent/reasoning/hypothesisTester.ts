/**
 * Hypothesis Testing Framework for Vera
 * 
 * Implements systematic hypothesis generation, testing, and validation
 * with confidence scoring and evidence evaluation.
 */

import { ReasoningGraph, getReasoningGraph } from './reasoningGraph.js';
import { ReasoningNode, NodeType, HypothesisNode, TestResult } from './graphNode.js';
import { ReasoningEdge, EdgeType, ReasoningEdgeFactory } from './graphEdge.js';
import { InferenceEngine, InferenceResult } from './inferenceEngine.js';
import { logger } from '../../monitoring/logger.js';

export interface Hypothesis {
  id: string;
  statement: string;
  confidence: number;
  status: 'proposed' | 'testing' | 'confirmed' | 'rejected' | 'partially_confirmed';
  testResults: TestResult[];
  alternativeHypotheses: string[];
  evidence: Evidence[];
  contradictions: Contradiction[];
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Evidence {
  id: string;
  content: string;
  source: string;
  credibility: number;
  relevance: number;
  supports: boolean;
  timestamp: Date;
}

export interface Contradiction {
  id: string;
  content: string;
  source: string;
  strength: number;
  timestamp: Date;
}

export interface TestPlan {
  hypothesisId: string;
  tests: TestMethod[];
  estimatedDuration: number;
  requiredResources: string[];
  successCriteria: string[];
}

export interface TestMethod {
  type: 'empirical' | 'logical' | 'statistical' | 'expert_review';
  description: string;
  procedure: string[];
  expectedOutcome: string;
  confidenceThreshold: number;
}

export class HypothesisTester {
  private reasoningGraph: ReasoningGraph;
  private inferenceEngine: InferenceEngine;
  private maxTestAttempts: number = 5;
  private minConfirmationThreshold: number = 0.8;
  private minRejectionThreshold: number = 0.2;

  constructor() {
    this.reasoningGraph = getReasoningGraph();
    this.inferenceEngine = new InferenceEngine();
  }

  // Generate hypotheses based on available information
  async generateHypotheses(context: string, count: number = 3): Promise<Hypothesis[]> {
    const hypotheses: Hypothesis[] = [];

    try {
      // Analyze context to identify key concepts and relationships
      const concepts = this.extractConcepts(context);
      const relationships = this.identifyRelationships(concepts);

      // Generate different types of hypotheses
      for (let i = 0; i < count; i++) {
        const hypothesis = await this.createHypothesis(concepts, relationships, i);
        hypotheses.push(hypothesis);
      }

      logger.info('Generated hypotheses', { count: hypotheses.length, context });
      return hypotheses;

    } catch (error) {
      logger.error('Error generating hypotheses', { error: error instanceof Error ? error.message : 'Unknown error' });
      return [];
    }
  }

  // Test a hypothesis using multiple methods
  async testHypothesis(hypothesisId: string): Promise<Hypothesis> {
    try {
      const hypothesis = await this.getHypothesis(hypothesisId);
      if (!hypothesis) {
        throw new Error(`Hypothesis ${hypothesisId} not found`);
      }

      // Update status to testing
      hypothesis.status = 'testing';
      hypothesis.updatedAt = new Date();

      // Create test plan
      const testPlan = await this.createTestPlan(hypothesis);
      
      // Execute tests
      const testResults: TestResult[] = [];
      for (const test of testPlan.tests) {
        const result = await this.executeTest(hypothesis, test);
        testResults.push(result);
      }

      // Analyze results
      const analysis = await this.analyzeTestResults(hypothesis, testResults);
      
      // Update hypothesis
      hypothesis.testResults = testResults;
      hypothesis.status = analysis.status;
      hypothesis.confidence = analysis.confidence;
      hypothesis.updatedAt = new Date();

      // Save updated hypothesis
      await this.saveHypothesis(hypothesis);

      logger.info('Hypothesis tested', { 
        hypothesisId, 
        status: hypothesis.status, 
        confidence: hypothesis.confidence 
      });

      return hypothesis;

    } catch (error) {
      logger.error('Error testing hypothesis', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        hypothesisId 
      });
      throw error;
    }
  }

  // Validate hypothesis against existing knowledge
  async validateHypothesis(hypothesisId: string): Promise<{
    isValid: boolean;
    confidence: number;
    contradictions: Contradiction[];
    supportingEvidence: Evidence[];
  }> {
    try {
      const hypothesis = await this.getHypothesis(hypothesisId);
      if (!hypothesis) {
        throw new Error(`Hypothesis ${hypothesisId} not found`);
      }

      const contradictions: Contradiction[] = [];
      const supportingEvidence: Evidence[] = [];

      // Check against existing facts
      const existingFacts = this.reasoningGraph.query({
        nodeTypes: ['fact'],
        minConfidence: 0.7
      });

      for (const fact of existingFacts.nodes) {
        const contradiction = await this.checkContradiction(hypothesis.statement, fact.content);
        if (contradiction) {
          contradictions.push(contradiction);
        } else {
          const support = await this.checkSupport(hypothesis.statement, fact.content);
          if (support) {
            supportingEvidence.push(support);
          }
        }
      }

      // Calculate overall confidence
      const supportScore = supportingEvidence.reduce((sum, ev) => sum + ev.credibility * ev.relevance, 0);
      const contradictionScore = contradictions.reduce((sum, con) => sum + con.strength, 0);
      const totalScore = supportScore - contradictionScore;
      const confidence = Math.max(0, Math.min(1, totalScore / Math.max(1, supportingEvidence.length + contradictions.length)));

      const isValid = contradictions.length === 0 || (supportingEvidence.length > contradictions.length && confidence > 0.5);

      logger.info('Hypothesis validation completed', { 
        hypothesisId, 
        isValid, 
        confidence,
        supportingEvidence: supportingEvidence.length,
        contradictions: contradictions.length
      });

      return {
        isValid,
        confidence,
        contradictions,
        supportingEvidence
      };

    } catch (error) {
      logger.error('Error validating hypothesis', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        hypothesisId 
      });
      return {
        isValid: false,
        confidence: 0,
        contradictions: [],
        supportingEvidence: []
      };
    }
  }

  // Create alternative hypotheses
  async createAlternatives(hypothesisId: string): Promise<Hypothesis[]> {
    try {
      const original = await this.getHypothesis(hypothesisId);
      if (!original) {
        throw new Error(`Hypothesis ${hypothesisId} not found`);
      }

      const alternatives: Hypothesis[] = [];

      // Generate different perspectives on the same problem
      const alternativeStatements = this.generateAlternativeStatements(original.statement);

      for (const statement of alternativeStatements) {
        const alternative: Hypothesis = {
          id: `alt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          statement,
          confidence: 0.5,
          status: 'proposed',
          testResults: [],
          alternativeHypotheses: [],
          evidence: [],
          contradictions: [],
          priority: original.priority * 0.8,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        alternatives.push(alternative);
      }

      // Link alternatives to original
      original.alternativeHypotheses = alternatives.map(alt => alt.id);
      await this.saveHypothesis(original);

      // Save alternatives
      for (const alt of alternatives) {
        alt.alternativeHypotheses = [original.id];
        await this.saveHypothesis(alt);
      }

      logger.info('Created alternative hypotheses', { 
        originalId: hypothesisId, 
        alternatives: alternatives.length 
      });

      return alternatives;

    } catch (error) {
      logger.error('Error creating alternatives', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        hypothesisId 
      });
      return [];
    }
  }

  // Private helper methods
  private async createHypothesis(concepts: string[], relationships: string[], index: number): Promise<Hypothesis> {
    const statement = this.generateHypothesisStatement(concepts, relationships, index);
    
    const hypothesis: Hypothesis = {
      id: `hyp_${Date.now()}_${index}`,
      statement,
      confidence: 0.5,
      status: 'proposed',
      testResults: [],
      alternativeHypotheses: [],
      evidence: [],
      contradictions: [],
      priority: 0.7,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.saveHypothesis(hypothesis);
    return hypothesis;
  }

  private generateHypothesisStatement(concepts: string[], relationships: string[], index: number): string {
    // Generate different types of hypotheses based on index
    const templates = [
      `${concepts[0] || 'X'} ${relationships[0] || 'influences'} ${concepts[1] || 'Y'}`,
      `If ${concepts[0] || 'X'} increases, then ${concepts[1] || 'Y'} will ${relationships[0] || 'decrease'}`,
      `${concepts[0] || 'X'} is ${relationships[0] || 'correlated with'} ${concepts[1] || 'Y'}`,
      `The relationship between ${concepts[0] || 'X'} and ${concepts[1] || 'Y'} is ${relationships[0] || 'significant'}`
    ];

    return templates[index % templates.length];
  }

  private extractConcepts(context: string): string[] {
    // Simple concept extraction - can be enhanced with NLP
    const concepts: string[] = [];
    const words = context.split(/\s+/);
    
    // Extract nouns and proper nouns (simplified)
    for (let i = 0; i < words.length - 1; i++) {
      const word = words[i].toLowerCase();
      if (word.length > 3 && !this.isStopWord(word)) {
        concepts.push(words[i]);
      }
    }
    
    return concepts.slice(0, 5); // Limit to top 5 concepts
  }

  private identifyRelationships(concepts: string[]): string[] {
    // Simple relationship identification
    const relationships = [
      'causes', 'influences', 'correlates with', 'predicts', 'depends on',
      'increases', 'decreases', 'affects', 'impacts', 'relates to'
    ];
    
    return relationships.slice(0, 3); // Return top 3 relationships
  }

  private isStopWord(word: string): boolean {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must'];
    return stopWords.includes(word);
  }

  private async createTestPlan(hypothesis: Hypothesis): Promise<TestPlan> {
    const tests: TestMethod[] = [];

    // Logical consistency test
    tests.push({
      type: 'logical',
      description: 'Check logical consistency',
      procedure: [
        'Analyze hypothesis for internal contradictions',
        'Check against known logical principles',
        'Validate reasoning structure'
      ],
      expectedOutcome: 'No logical contradictions found',
      confidenceThreshold: 0.7
    });

    // Empirical evidence test
    tests.push({
      type: 'empirical',
      description: 'Gather empirical evidence',
      procedure: [
        'Search for supporting data',
        'Collect relevant measurements',
        'Analyze empirical patterns'
      ],
      expectedOutcome: 'Sufficient empirical evidence found',
      confidenceThreshold: 0.6
    });

    // Statistical validation test
    tests.push({
      type: 'statistical',
      description: 'Statistical significance test',
      procedure: [
        'Collect statistical data',
        'Perform significance testing',
        'Calculate confidence intervals'
      ],
      expectedOutcome: 'Statistically significant results',
      confidenceThreshold: 0.8
    });

    return {
      hypothesisId: hypothesis.id,
      tests,
      estimatedDuration: 300, // 5 minutes
      requiredResources: ['data_sources', 'analysis_tools'],
      successCriteria: ['logical_consistency', 'empirical_support', 'statistical_significance']
    };
  }

  private async executeTest(hypothesis: Hypothesis, test: TestMethod): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      let outcome: 'pass' | 'fail' | 'inconclusive';
      let confidence: number;
      let evidence: string;

      switch (test.type) {
        case 'logical':
          const logicalResult = await this.performLogicalTest(hypothesis);
          outcome = logicalResult.outcome;
          confidence = logicalResult.confidence;
          evidence = logicalResult.evidence;
          break;

        case 'empirical':
          const empiricalResult = await this.performEmpiricalTest(hypothesis);
          outcome = empiricalResult.outcome;
          confidence = empiricalResult.confidence;
          evidence = empiricalResult.evidence;
          break;

        case 'statistical':
          const statisticalResult = await this.performStatisticalTest(hypothesis);
          outcome = statisticalResult.outcome;
          confidence = statisticalResult.confidence;
          evidence = statisticalResult.evidence;
          break;

        default:
          outcome = 'inconclusive';
          confidence = 0.5;
          evidence = 'Test type not implemented';
      }

      const testResult: TestResult = {
        id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        testType: test.type,
        outcome,
        confidence,
        evidence,
        timestamp: new Date(),
        methodology: test.description
      };

      logger.debug('Test executed', { 
        hypothesisId: hypothesis.id, 
        testType: test.type, 
        outcome, 
        confidence 
      });

      return testResult;

    } catch (error) {
      logger.error('Error executing test', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        hypothesisId: hypothesis.id, 
        testType: test.type 
      });

      return {
        id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        testType: test.type,
        outcome: 'inconclusive',
        confidence: 0,
        evidence: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        methodology: test.description
      };
    }
  }

  private async performLogicalTest(hypothesis: Hypothesis): Promise<{ outcome: 'pass' | 'fail' | 'inconclusive'; confidence: number; evidence: string }> {
    // Check for logical consistency using inference engine
    const result = await this.inferenceEngine.deductiveInference([hypothesis.statement]);
    
    if (result.contradictions.length > 0) {
      return {
        outcome: 'fail',
        confidence: 0.2,
        evidence: `Contradictions found: ${result.contradictions.join(', ')}`
      };
    }

    if (result.confidence > 0.7) {
      return {
        outcome: 'pass',
        confidence: result.confidence,
        evidence: result.reasoning.join('; ')
      };
    }

    return {
      outcome: 'inconclusive',
      confidence: result.confidence,
      evidence: 'Insufficient logical evidence'
    };
  }

  private async performEmpiricalTest(hypothesis: Hypothesis): Promise<{ outcome: 'pass' | 'fail' | 'inconclusive'; confidence: number; evidence: string }> {
    // Search for empirical evidence (simplified)
    const validation = await this.validateHypothesis(hypothesis.id);
    
    if (validation.supportingEvidence.length > validation.contradictions.length) {
      return {
        outcome: 'pass',
        confidence: validation.confidence,
        evidence: `Found ${validation.supportingEvidence.length} supporting pieces of evidence`
      };
    }

    if (validation.contradictions.length > 0) {
      return {
        outcome: 'fail',
        confidence: 1 - validation.confidence,
        evidence: `Found ${validation.contradictions.length} contradictions`
      };
    }

    return {
      outcome: 'inconclusive',
      confidence: validation.confidence,
      evidence: 'Insufficient empirical evidence'
    };
  }

  private async performStatisticalTest(hypothesis: Hypothesis): Promise<{ outcome: 'pass' | 'fail' | 'inconclusive'; confidence: number; evidence: string }> {
    // Simplified statistical test - in practice would use actual statistical methods
    const validation = await this.validateHypothesis(hypothesis.id);
    
    // Simulate statistical significance based on evidence strength
    const evidenceStrength = validation.supportingEvidence.length / Math.max(1, validation.supportingEvidence.length + validation.contradictions.length);
    const statisticalSignificance = evidenceStrength > 0.7;
    
    if (statisticalSignificance) {
      return {
        outcome: 'pass',
        confidence: validation.confidence,
        evidence: `Statistically significant with p < 0.05 (simulated)`
      };
    }

    return {
      outcome: 'inconclusive',
      confidence: validation.confidence,
      evidence: 'Not statistically significant'
    };
  }

  private async analyzeTestResults(hypothesis: Hypothesis, testResults: TestResult[]): Promise<{
    status: 'confirmed' | 'rejected' | 'partially_confirmed' | 'testing';
    confidence: number;
  }> {
    const passCount = testResults.filter(r => r.outcome === 'pass').length;
    const failCount = testResults.filter(r => r.outcome === 'fail').length;
    const totalTests = testResults.length;
    
    const averageConfidence = testResults.reduce((sum, r) => sum + r.confidence, 0) / totalTests;
    
    let status: 'confirmed' | 'rejected' | 'partially_confirmed' | 'testing';
    let confidence: number;

    if (passCount / totalTests >= 0.8 && averageConfidence >= this.minConfirmationThreshold) {
      status = 'confirmed';
      confidence = averageConfidence;
    } else if (failCount / totalTests >= 0.8 || averageConfidence <= this.minRejectionThreshold) {
      status = 'rejected';
      confidence = 1 - averageConfidence;
    } else if (passCount > failCount) {
      status = 'partially_confirmed';
      confidence = averageConfidence;
    } else {
      status = 'testing';
      confidence = averageConfidence;
    }

    return { status, confidence };
  }

  private async checkContradiction(hypothesis: string, fact: string): Promise<Contradiction | null> {
    // Simple contradiction detection - can be enhanced with NLP
    const contradictionKeywords = ['not', 'never', 'opposite', 'contrary', 'false'];
    
    for (const keyword of contradictionKeywords) {
      if (fact.toLowerCase().includes(keyword) && 
          fact.toLowerCase().includes(hypothesis.toLowerCase())) {
        return {
          id: `contr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          content: `Contradiction: "${fact}" contradicts "${hypothesis}"`,
          source: 'fact_check',
          strength: 0.8,
          timestamp: new Date()
        };
      }
    }
    
    return null;
  }

  private async checkSupport(hypothesis: string, fact: string): Promise<Evidence | null> {
    // Simple support detection - can be enhanced with NLP
    const supportKeywords = ['supports', 'confirms', 'validates', 'proves', 'demonstrates'];
    
    for (const keyword of supportKeywords) {
      if (fact.toLowerCase().includes(keyword) && 
          fact.toLowerCase().includes(hypothesis.toLowerCase())) {
        return {
          id: `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          content: fact,
          source: 'fact_check',
          credibility: 0.8,
          relevance: 0.9,
          supports: true,
          timestamp: new Date()
        };
      }
    }
    
    return null;
  }

  private generateAlternativeStatements(original: string): string[] {
    // Generate alternative perspectives on the same hypothesis
    const alternatives: string[] = [];
    
    // Negation
    alternatives.push(`It is not true that ${original}`);
    
    // Reverse causality
    if (original.includes('causes') || original.includes('leads to')) {
      alternatives.push(original.replace(/(\w+)\s+(causes|leads to)\s+(\w+)/, '$3 causes $1'));
    }
    
    // Different relationship
    alternatives.push(original.replace(/(\w+)\s+(\w+)\s+(\w+)/, '$1 correlates with $3'));
    
    // Temporal reversal
    alternatives.push(original.replace(/(\w+)\s+(\w+)\s+(\w+)/, '$3 will $2 $1'));
    
    return alternatives.slice(0, 3);
  }

  private async getHypothesis(hypothesisId: string): Promise<Hypothesis | null> {
    // Try to get from reasoning graph first
    const node = this.reasoningGraph.getNode(hypothesisId);
    if (node && node.type === 'hypothesis') {
      const hypothesisNode = node as HypothesisNode;
      return {
        id: hypothesisNode.id,
        statement: hypothesisNode.content,
        confidence: hypothesisNode.confidence,
        status: hypothesisNode.status,
        testResults: hypothesisNode.testResults,
        alternativeHypotheses: hypothesisNode.alternativeHypotheses,
        evidence: [],
        contradictions: [],
        priority: hypothesisNode.priority,
        createdAt: hypothesisNode.createdAt,
        updatedAt: hypothesisNode.updatedAt
      };
    }
    
    return null;
  }

  private async saveHypothesis(hypothesis: Hypothesis): Promise<void> {
    const hypothesisNode: HypothesisNode = {
      id: hypothesis.id,
      type: 'hypothesis',
      content: hypothesis.statement,
      confidence: hypothesis.confidence,
      status: hypothesis.status,
      testResults: hypothesis.testResults,
      alternativeHypotheses: hypothesis.alternativeHypotheses,
      embedding: undefined,
      metadata: {},
      createdAt: hypothesis.createdAt,
      updatedAt: hypothesis.updatedAt,
      userId: undefined,
      priority: hypothesis.priority,
      tags: ['hypothesis']
    };

    this.reasoningGraph.addNode(hypothesisNode);
  }
}
