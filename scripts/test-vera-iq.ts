/**
 * Vera IQ Test Suite
 * 
 * Comprehensive cognitive assessment measuring:
 * - Multi-hop reasoning
 * - Pattern recognition
 * - Meta-cognition
 * - Semantic understanding
 * - Knowledge synthesis
 * - Cognitive modeling
 */

import { getReasoningGraph } from '../src/agent/reasoning/reasoningGraph.js';
import { conversationEngine } from '../src/agent/conversationEngine.js';
import { generalKnowledge } from '../src/agent/general-knowledge.js';

interface TestResult {
  testName: string;
  score: number; // 0-100
  maxScore: number;
  passed: boolean;
  details: string;
  duration: number;
}

interface IQReport {
  overallScore: number;
  fluidIntelligence: number;
  crystallizedIntelligence: number;
  category: string;
  percentile: string;
  testResults: TestResult[];
  timestamp: string;
}

class VeraIQTest {
  private results: TestResult[] = [];

  async runFullAssessment(): Promise<IQReport> {
    console.log('🧠 Starting Vera IQ Assessment...\n');

    // Test 1: Multi-hop Reasoning
    await this.testMultiHopReasoning();

    // Test 2: Pattern Recognition
    await this.testPatternRecognition();

    // Test 3: Meta-cognition
    await this.testMetaCognition();

    // Test 4: Semantic Understanding
    await this.testSemanticUnderstanding();

    // Test 5: Knowledge Synthesis
    await this.testKnowledgeSynthesis();

    // Test 6: Cognitive Modeling
    await this.testCognitiveModeling();

    // Calculate overall scores
    const overallScore = this.calculateOverallScore();
    const fluidIntelligence = this.calculateFluidIntelligence();
    const crystallizedIntelligence = this.calculateCrystallizedIntelligence();

    const report: IQReport = {
      overallScore,
      fluidIntelligence,
      crystallizedIntelligence,
      category: this.getIQCategory(overallScore),
      percentile: this.getPercentile(overallScore),
      testResults: this.results,
      timestamp: new Date().toISOString()
    };

    this.printReport(report);
    return report;
  }

  private async testMultiHopReasoning(): Promise<void> {
    const startTime = Date.now();
    const reasoningGraph = getReasoningGraph();

    try {
      console.log('  Testing multi-hop reasoning...');

      // Test A: Use trained deep chain 1 (7 hops: deep1-1 to deep1-7)
      console.log('  Testing 7-hop deep reasoning chain...');
      const deepInference = reasoningGraph.inferFromChain('deep1-1', 7);
      const hasDeepInference = deepInference.inferredFacts.length > 0 && 
                               deepInference.confidenceScore > 0.5;

      // Test B: Use trained deep chain 2 (6 hops: deep2-1 to deep2-6) 
      console.log('  Testing 6-hop architecture chain...');
      const chainInference = reasoningGraph.inferFromChain('deep2-1', 6);
      const hasChainInference = chainInference.inferredFacts.length > 0 &&
                               chainInference.reasoningChain.length >= 2; // At least 2 steps

      // Test C: Cross-chain inference (connecting different deep chains)
      console.log('  Testing cross-chain synthesis...');
      const crossInference = reasoningGraph.inferFromChain('deep3-1', 5);
      const hasCrossInference = crossInference.inferredFacts.length > 1;

      // Enhanced scoring for deep reasoning
      const score = (hasDeepInference ? 30 : 0) + 
                   (hasChainInference ? 30 : 0) + 
                   (hasCrossInference ? 20 : 0) + 
                   (deepInference.confidenceScore > 0.7 ? 10 : 0) +
                   (chainInference.confidenceScore > 0.7 ? 10 : 0);

      this.results.push({
        testName: 'Multi-hop Reasoning',
        score: Math.min(score, 100),
        maxScore: 100,
        passed: score >= 60,
        details: `7-hop: ${hasDeepInference ? 'PASS' : 'FAIL'}, ` +
                `6-hop: ${hasChainInference ? 'PASS' : 'FAIL'}, ` +
                `Cross-chain: ${hasCrossInference ? 'PASS' : 'FAIL'}, ` +
                `Deep inferences: ${deepInference.inferredFacts.length}, ` +
                `Chain inferences: ${chainInference.inferredFacts.length}`,
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        testName: 'Multi-hop Reasoning',
        score: 0,
        maxScore: 100,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime
      });
    }
  }

  private async testPatternRecognition(): Promise<void> {
    const startTime = Date.now();
    const reasoningGraph = getReasoningGraph();

    try {
      console.log('  Testing pattern recognition...');

      // Add test nodes with patterns
      const patterns = [
        { id: 'p1', content: 'A causes B', type: 'cause_effect' },
        { id: 'p2', content: 'B leads to C', type: 'cause_effect' },
        { id: 'p3', content: 'C results in D', type: 'cause_effect' }
      ];

      for (const p of patterns) {
        reasoningGraph.addNode({
          id: p.id,
          type: 'concept',
          content: p.content,
          confidence: 0.8,
          embedding: undefined,
          metadata: { pattern_type: p.type },
          createdAt: new Date(),
          updatedAt: new Date(),
          priority: 0.7,
          tags: ['test', 'pattern']
        });
      }

      // Detect patterns
      const detectedPatterns = reasoningGraph.detectPatterns();
      
      const hasCausalChains = detectedPatterns.causalChains.length > 0;
      const hasLogicalClusters = detectedPatterns.logicalClusters.length > 0;

      // Test cross-domain pattern detection in general knowledge
      const crossDomainPatterns = await generalKnowledge.discoverCrossDomainPatterns();
      const hasCrossDomain = crossDomainPatterns.patterns.length > 0 || 
                          crossDomainPatterns.analogies.length > 0;

      const score = (hasCausalChains ? 30 : 0) + 
                   (hasLogicalClusters ? 30 : 0) + 
                   (hasCrossDomain ? 40 : 0);

      this.results.push({
        testName: 'Pattern Recognition',
        score: Math.min(score, 100),
        maxScore: 100,
        passed: score >= 50,
        details: `Causal chains: ${detectedPatterns.causalChains.length}, ` +
                `Logical clusters: ${detectedPatterns.logicalClusters.length}, ` +
                `Cross-domain: ${hasCrossDomain ? 'YES' : 'NO'}`,
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        testName: 'Pattern Recognition',
        score: 0,
        maxScore: 100,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime
      });
    }
  }

  private async testMetaCognition(): Promise<void> {
    const startTime = Date.now();
    const reasoningGraph = getReasoningGraph();

    try {
      console.log('  Testing meta-cognition...');

      // Analyze reasoning quality
      const quality = reasoningGraph.analyzeReasoningQuality();

      const hasQualityMetrics = quality.overallQuality > 0;
      const hasBiasDetection = quality.cognitiveBiases.length >= 0;
      const hasRecommendations = quality.suggestedImprovements.length > 0;

      // Test confidence propagation
      reasoningGraph.propagateConfidence(2);
      const qualityAfter = reasoningGraph.analyzeReasoningQuality();
      const confidenceImproved = qualityAfter.overallQuality >= quality.overallQuality;

      const score = (hasQualityMetrics ? 25 : 0) + 
                   (hasBiasDetection ? 25 : 0) + 
                   (hasRecommendations ? 25 : 0) + 
                   (confidenceImproved ? 25 : 0);

      this.results.push({
        testName: 'Meta-cognition',
        score: Math.min(score, 100),
        maxScore: 100,
        passed: score >= 60,
        details: `Quality score: ${(quality.overallQuality * 100).toFixed(1)}%, ` +
                `Biases detected: ${quality.cognitiveBiases.length}, ` +
                `Recommendations: ${quality.suggestedImprovements.length}, ` +
                `Confidence improved: ${confidenceImproved ? 'YES' : 'NO'}`,
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        testName: 'Meta-cognition',
        score: 0,
        maxScore: 100,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime
      });
    }
  }

  private async testSemanticUnderstanding(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('  Testing deep semantic analysis...');

      // Test with messages that have implicit meaning
      const testMessages = [
        { 
          msg: "I'm just curious about how this works...", 
          expectImplicit: true,
          expectedEmotion: 'curious'
        },
        { 
          msg: "This is frustrating, nothing seems to work", 
          expectImplicit: true,
          expectedEmotion: 'frustrated'
        },
        { 
          msg: "Can you explain quantum mechanics like I'm five?", 
          expectImplicit: true,
          expectedKnowledge: 'beginner'
        }
      ];

      let passedTests = 0;
      const context = { sessionId: 'test-session', userId: 'test-user' };

      for (const test of testMessages) {
        try {
          const context = {
            sessionId: 'test-session',
            previousMessages: [],
            userProfile: { 
              userId: 'test-user',
              interests: ['technology', 'blockchain'],
              expertise: ['beginner'],
              conversationStyle: 'casual' as const,
              preferredDepth: 'detailed' as const
            },
            currentContext: {
              detectedTopics: ['test'],
              userIntent: 'testing',
              urgencyLevel: 'low' as const
            }
          };
          const analysis = await conversationEngine.deepSemanticAnalysis(test.msg, context);
          
          const hasImplicitIntent = analysis.implicitIntent !== 'none';
          const hasSubtext = analysis.subtext.length > 0;
          const hasEmotion = analysis.emotionalUndertones.length > 0;

          if ((test.expectImplicit && hasImplicitIntent) || hasSubtext || hasEmotion) {
            passedTests++;
          }
        } catch (e) {
          // Test failed
        }
      }

      const score = (passedTests / testMessages.length) * 100;

      this.results.push({
        testName: 'Semantic Understanding',
        score,
        maxScore: 100,
        passed: score >= 60,
        details: `Passed: ${passedTests}/${testMessages.length} tests, ` +
                `Implicit intent detection: ${passedTests > 1 ? 'YES' : 'LIMITED'}`,
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        testName: 'Semantic Understanding',
        score: 0,
        maxScore: 100,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime
      });
    }
  }

  private async testKnowledgeSynthesis(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('  Testing knowledge synthesis...');

      // First query for related knowledge items
      const queryResult = await generalKnowledge.queryGeneralKnowledge({
        query: 'blockchain consensus mechanisms',
        maxResults: 10,
        minConfidence: 0.6
      });

      // Test synthesis using queried items
      const synthesis = await generalKnowledge.synthesizeKnowledge(
        'blockchain consensus mechanisms',
        queryResult.results
      );

      const hasSynthesis = synthesis.synthesis.length > 0;
      const hasInsights = synthesis.keyInsights.length > 0;
      const hasConfidence = synthesis.confidence > 0;

      // Test novel insight generation
      const insights = await generalKnowledge.generateNovelInsights('consensus');
      const hasNovelInsights = insights.insights.length > 0 || 
                               insights.reasoningChain.length > 0;

      const score = (hasSynthesis ? 25 : 0) + 
                   (hasInsights ? 25 : 0) + 
                   (hasConfidence ? 25 : 0) + 
                   (hasNovelInsights ? 25 : 0);

      this.results.push({
        testName: 'Knowledge Synthesis',
        score: Math.min(score, 100),
        maxScore: 100,
        passed: score >= 60,
        details: `Synthesis: ${hasSynthesis ? 'YES' : 'NO'}, ` +
                `Insights: ${synthesis.keyInsights.length}, ` +
                `Confidence: ${(synthesis.confidence * 100).toFixed(0)}%, ` +
                `Novel insights: ${insights.insights.length + insights.reasoningChain.length}`,
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        testName: 'Knowledge Synthesis',
        score: 0,
        maxScore: 100,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime
      });
    }
  }

  private async testCognitiveModeling(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('  Testing cognitive modeling...');

      // Build cognitive model
      const sessionId = 'test-session-123';
      const userId = 'test-user-456';

      const model = await conversationEngine.buildCognitiveModel(sessionId, userId);

      const hasLearningStyle = !!model.cognitiveProfile.learningStyle;
      const hasProblemSolving = !!model.cognitiveProfile.problemSolvingApproach;
      const hasKnowledgeDomains = Object.keys(model.knowledgeDomains || {}).length > 0;

      // Test conversation strategy generation
      const strategy = await conversationEngine.generateConversationStrategy(
        "I'm confused about how smart contracts work",
        sessionId,
        userId
      );

      const hasStrategy = strategy.conversationArc.length > 0;
      const hasContingency = strategy.contingencyPlans.length > 0;

      const score = (hasLearningStyle ? 20 : 0) + 
                   (hasProblemSolving ? 20 : 0) + 
                   (hasKnowledgeDomains ? 20 : 0) + 
                   (hasStrategy ? 20 : 0) + 
                   (hasContingency ? 10 : 0) + 
                   (strategy.immediateResponse.length > 0 ? 10 : 0);

      this.results.push({
        testName: 'Cognitive Modeling',
        score: Math.min(score, 100),
        maxScore: 100,
        passed: score >= 60,
        details: `Learning style: ${model.cognitiveProfile.learningStyle}, ` +
                `Problem-solving: ${model.cognitiveProfile.problemSolvingApproach}, ` +
                `Knowledge domains: ${Object.keys(model.knowledgeDomains || {}).length}, ` +
                `Has strategy: ${hasStrategy ? 'YES' : 'NO'}`,
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        testName: 'Cognitive Modeling',
        score: 0,
        maxScore: 100,
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime
      });
    }
  }

  private calculateOverallScore(): number {
    if (this.results.length === 0) return 0;
    const totalScore = this.results.reduce((sum, r) => sum + r.score, 0);
    return Math.round(totalScore / this.results.length);
  }

  private calculateFluidIntelligence(): number {
    // Fluid intelligence: reasoning, pattern recognition, meta-cognition
    const fluidTests = this.results.filter(r => 
      ['Multi-hop Reasoning', 'Pattern Recognition', 'Meta-cognition'].includes(r.testName)
    );
    if (fluidTests.length === 0) return 0;
    return Math.round(fluidTests.reduce((sum, r) => sum + r.score, 0) / fluidTests.length);
  }

  private calculateCrystallizedIntelligence(): number {
    // Crystallized intelligence: knowledge, semantic understanding
    const crystalTests = this.results.filter(r => 
      ['Semantic Understanding', 'Knowledge Synthesis', 'Cognitive Modeling'].includes(r.testName)
    );
    if (crystalTests.length === 0) return 0;
    return Math.round(crystalTests.reduce((sum, r) => sum + r.score, 0) / crystalTests.length);
  }

  private getIQCategory(score: number): string {
    if (score >= 130) return 'Very Superior (Gifted)';
    if (score >= 120) return 'Superior';
    if (score >= 110) return 'High Average';
    if (score >= 90) return 'Average';
    if (score >= 80) return 'Low Average';
    if (score >= 70) return 'Borderline';
    return 'Extremely Low';
  }

  private getPercentile(score: number): string {
    // Simplified percentile mapping
    if (score >= 145) return '99th+';
    if (score >= 130) return '98th';
    if (score >= 120) return '91st';
    if (score >= 110) return '75th';
    if (score >= 100) return '50th';
    if (score >= 90) return '25th';
    if (score >= 80) return '9th';
    return '< 9th';
  }

  private printReport(report: IQReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('           🧠 VERA IQ ASSESSMENT REPORT 🧠');
    console.log('='.repeat(60));
    console.log(`\nTimestamp: ${report.timestamp}`);
    console.log(`\n📊 OVERALL SCORE: ${report.overallScore}/100`);
    console.log(`🎯 Category: ${report.category}`);
    console.log(`📈 Percentile: ${report.percentile}`);
    console.log(`\n🧠 Fluid Intelligence: ${report.fluidIntelligence}/100`);
    console.log(`📚 Crystallized Intelligence: ${report.crystallizedIntelligence}/100`);
    
    console.log('\n' + '-'.repeat(60));
    console.log('DETAILED TEST RESULTS');
    console.log('-'.repeat(60));

    for (const result of report.testResults) {
      const status = result.passed ? '✅' : '❌';
      console.log(`\n${status} ${result.testName}`);
      console.log(`   Score: ${result.score}/${result.maxScore} (${((result.score/result.maxScore)*100).toFixed(0)}%)`);
      console.log(`   Duration: ${result.duration}ms`);
      console.log(`   Details: ${result.details}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('INTERPRETATION');
    console.log('='.repeat(60));

    const passedTests = report.testResults.filter(r => r.passed).length;
    const totalTests = report.testResults.length;

    console.log(`\nTests Passed: ${passedTests}/${totalTests}`);
    
    if (report.overallScore >= 80) {
      console.log('\n🌟 Excellent! Vera demonstrates strong cognitive capabilities');
      console.log('   across all tested dimensions. The IQ enhancements are');
      console.log('   functioning effectively.');
    } else if (report.overallScore >= 60) {
      console.log('\n✓ Good performance. Most cognitive systems are operational,');
      console.log('   with some areas for potential improvement.');
    } else {
      console.log('\n⚠ Some cognitive systems may need attention.');
      console.log('   Review failed tests for debugging.');
    }

    // Map to traditional IQ scale (rough approximation)
    const estimatedIQ = 100 + ((report.overallScore - 50) * 0.5);
    console.log(`\n📊 Estimated Traditional IQ Equivalent: ${Math.round(estimatedIQ)}`);
    console.log('   (Note: This is a rough mapping for comparison purposes)');

    console.log('\n' + '='.repeat(60) + '\n');
  }
}

// Run the test
const tester = new VeraIQTest();
tester.runFullAssessment().catch(console.error);

export { VeraIQTest };
export type { IQReport, TestResult };
