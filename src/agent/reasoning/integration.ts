/**
 * Reasoning System Integration for Vera
 * 
 * Integrates the advanced reasoning engine with Vera's existing architecture,
 * providing new reasoning capabilities while maintaining compatibility.
 */

import { runAgentStream, ChatMessage } from '../runner.js';
import { ReasoningGraph, getReasoningGraph } from './reasoningGraph.js';
import { InferenceEngine, InferenceMethod } from './inferenceEngine.js';
import { HypothesisTester } from './hypothesisTester.js';
import { InformationFusionEngine } from '../information/fusionEngine.js';
import { QualityAssessment } from '../information/qualityAssessment.js';
import { logger } from '../../monitoring/logger.js';

export interface ReasoningRequest {
  problem: string;
  method?: InferenceMethod;
  context?: string;
  generateHypotheses?: boolean;
  verifyClaims?: boolean;
  synthesizeInformation?: boolean;
  maxDepth?: number;
}

export interface ReasoningResponse {
  conclusion: string;
  confidence: number;
  method: InferenceMethod;
  reasoning: string[];
  evidence: string[];
  contradictions: string[];
  hypotheses?: string[];
  synthesis?: any;
  metadata: {
    processingTime: number;
    nodesCreated: number;
    edgesCreated: number;
    sourcesUsed: number;
  };
}

export class ReasoningIntegration {
  private reasoningGraph: ReasoningGraph;
  private inferenceEngine: InferenceEngine;
  private hypothesisTester: HypothesisTester;
  private fusionEngine: InformationFusionEngine;
  private qualityAssessment: QualityAssessment;

  constructor() {
    this.reasoningGraph = getReasoningGraph();
    this.inferenceEngine = new InferenceEngine();
    this.hypothesisTester = new HypothesisTester();
    this.fusionEngine = new InformationFusionEngine();
    this.qualityAssessment = new QualityAssessment();
  }

  // Main reasoning method
  async reason(request: ReasoningRequest): Promise<ReasoningResponse> {
    const startTime = Date.now();
    let nodesCreated = 0;
    let edgesCreated = 0;
    let sourcesUsed = 0;

    try {
      logger.info('Starting reasoning process', { 
        problem: request.problem.substring(0, 100),
        method: request.method 
      });

      // Step 1: Information synthesis if requested
      let synthesis = null;
      if (request.synthesizeInformation) {
        synthesis = await this.fusionEngine.synthesizeInformation(request.problem);
        sourcesUsed = synthesis.sources.length;
      }

      // Step 2: Generate hypotheses if requested
      let hypotheses = null;
      if (request.generateHypotheses) {
        const generatedHypotheses = await this.hypothesisTester.generateHypotheses(
          request.problem, 
          3
        );
        hypotheses = generatedHypotheses.map(h => h.statement);
        nodesCreated += generatedHypotheses.length;
      }

      // Step 3: Perform inference
      const inferenceResult = await this.inferenceEngine.infer(
        request.problem, 
        request.method
      );

      // Step 4: Verify claims if requested
      let verifiedClaims = null;
      if (request.verifyClaims && synthesis) {
        verifiedClaims = await this.fusionEngine.verifyClaims(synthesis.claims);
      }

      // Step 5: Update reasoning graph
      const problemNode = await this.addProblemToGraph(request.problem);
      nodesCreated++;
      
      if (inferenceResult.conclusion) {
        const conclusionNode = await this.addConclusionToGraph(inferenceResult.conclusion);
        nodesCreated++;
        
        // Add edge between problem and conclusion
        const edgeId = `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const edge = {
          id: edgeId,
          fromNode: problemNode.id,
          toNode: conclusionNode.id,
          type: 'implies' as const,
          strength: inferenceResult.confidence,
          evidence: [],
          bidirectional: false,
          metadata: {} as any,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        this.reasoningGraph.addEdge(edge);
        edgesCreated++;
      }

      const processingTime = Date.now() - startTime;

      const response: ReasoningResponse = {
        conclusion: inferenceResult.conclusion,
        confidence: inferenceResult.confidence,
        method: inferenceResult.method,
        reasoning: inferenceResult.reasoning,
        evidence: inferenceResult.evidence,
        contradictions: inferenceResult.contradictions,
        hypotheses: hypotheses || undefined,
        synthesis: synthesis || undefined,
        metadata: {
          processingTime,
          nodesCreated,
          edgesCreated,
          sourcesUsed
        }
      };

      logger.info('Reasoning completed', { 
        processingTime,
        confidence: response.confidence,
        method: response.method
      });

      return response;

    } catch (error) {
      logger.error('Error in reasoning process', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        problem: request.problem.substring(0, 100)
      });

      return {
        conclusion: 'Reasoning process failed',
        confidence: 0,
        method: request.method || 'deductive',
        reasoning: [],
        evidence: [],
        contradictions: [],
        metadata: {
          processingTime: Date.now() - startTime,
          nodesCreated,
          edgesCreated,
          sourcesUsed
        }
      };
    }
  }

  // Enhanced chat with reasoning
  async enhancedChat(messages: ChatMessage[], options?: {
    enableReasoning?: boolean;
    reasoningMethod?: InferenceMethod;
    synthesizeInfo?: boolean;
    generateHypotheses?: boolean;
  }): Promise<AsyncGenerator<any, void, unknown>> {
    const enableReasoning = options?.enableReasoning ?? true;
    
    if (!enableReasoning) {
      // Fall back to original chat
      return runAgentStream({ messages, enableTools: true });
    }

    // Extract the latest user message
    const latestMessage = messages[messages.length - 1];
    if (latestMessage.role !== 'user') {
      return runAgentStream({ messages, enableTools: true });
    }

    const userContent = latestMessage.content as string;
    
    // Determine if reasoning is needed
    const reasoningKeywords = [
      'why', 'how', 'analyze', 'evaluate', 'compare', 'explain',
      'what if', 'should', 'recommend', 'predict', 'assess'
    ];

    const needsReasoning = reasoningKeywords.some(keyword => 
      userContent.toLowerCase().includes(keyword)
    );

    if (!needsReasoning) {
      return runAgentStream({ messages, enableTools: true });
    }

    // Perform reasoning
    const reasoningRequest: ReasoningRequest = {
      problem: userContent,
      method: options?.reasoningMethod,
      context: messages.slice(-3).map(m => m.content).join(' '),
      generateHypotheses: options?.generateHypotheses,
      synthesizeInformation: options?.synthesizeInfo,
      verifyClaims: true
    };

    const reasoningResult = await this.reason(reasoningRequest);

    // Create enhanced messages with reasoning context
    const enhancedMessages: ChatMessage[] = [
      ...messages.slice(0, -1),
      {
        role: 'system',
        content: `You have access to advanced reasoning capabilities. Recent analysis: ${reasoningResult.conclusion} (confidence: ${(reasoningResult.confidence * 100).toFixed(1)}%). Method: ${reasoningResult.method}. Use this to provide more insightful responses.`
      },
      latestMessage
    ];

    // Stream the enhanced response
    return runAgentStream({ 
      messages: enhancedMessages, 
      enableTools: true 
    });
  }

  // Tool definitions for reasoning capabilities
  getReasoningToolDefinitions() {
    return [
      {
        type: 'function' as const,
        function: {
          name: 'reason_analyze',
          description: 'Analyze a problem using advanced reasoning methods (deductive, inductive, abductive, Bayesian, causal, or analogical)',
          parameters: {
            type: 'object' as const,
            properties: {
              problem: { type: 'string', description: 'The problem or question to analyze' },
              method: { 
                type: 'string', 
                enum: ['deductive', 'inductive', 'abductive', 'bayesian', 'causal', 'analogical'],
                description: 'Reasoning method to use (auto-detected if not specified)'
              },
              generate_hypotheses: { type: 'boolean', description: 'Generate alternative hypotheses', default: false },
              synthesize_information: { type: 'boolean', description: 'Synthesize information from multiple sources', default: false }
            },
            required: ['problem']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'hypothesis_test',
          description: 'Generate and test hypotheses about a given situation',
          parameters: {
            type: 'object' as const,
            properties: {
              situation: { type: 'string', description: 'The situation to analyze' },
              hypothesis_count: { type: 'number', description: 'Number of hypotheses to generate', default: 3 },
              test_methods: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Test methods to use (logical, empirical, statistical, expert_review)',
                default: ['logical', 'empirical']
              }
            },
            required: ['situation']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'synthesize_information',
          description: 'Synthesize information from multiple sources with quality assessment',
          parameters: {
            type: 'object' as const,
            properties: {
              topic: { type: 'string', description: 'Topic to research and synthesize' },
              source_types: { 
                type: 'array', 
                items: { type: 'string', enum: ['news', 'wiki', 'web', 'academic', 'official'] },
                description: 'Preferred source types',
                default: ['news', 'wiki', 'web']
              },
              max_sources: { type: 'number', description: 'Maximum number of sources to use', default: 10 }
            },
            required: ['topic']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'verify_claims',
          description: 'Fact-check and verify claims against multiple sources',
          parameters: {
            type: 'object' as const,
            properties: {
              claims: { type: 'array', items: { type: 'string' }, description: 'Claims to verify' },
              sources: { type: 'array', items: { type: 'string' }, description: 'Specific sources to check (optional)' }
            },
            required: ['claims']
          }
        }
      }
    ];
  }

  // Tool execution handlers
  async executeTool(toolName: string, args: any): Promise<any> {
    try {
      switch (toolName) {
        case 'reason_analyze':
          return await this.reason({
            problem: args.problem,
            method: args.method,
            generateHypotheses: args.generate_hypotheses,
            synthesizeInformation: args.synthesize_information
          });

        case 'hypothesis_test':
          const hypotheses = await this.hypothesisTester.generateHypotheses(
            args.situation, 
            args.hypothesis_count || 3
          );
          const results = [];
          for (const hypothesis of hypotheses) {
            const result = await this.hypothesisTester.testHypothesis(hypothesis.id);
            results.push(result);
          }
          return results;

        case 'synthesize_information':
          return await this.fusionEngine.synthesizeInformation(args.topic, {
            sourceTypes: args.source_types,
            maxSources: args.max_sources
          });

        case 'verify_claims':
          const verificationResults = [];
          for (const claim of args.claims) {
            const result = await this.qualityAssessment.factCheckClaim(claim, args.sources || []);
            verificationResults.push({ claim, ...result });
          }
          return verificationResults;

        default:
          throw new Error(`Unknown reasoning tool: ${toolName}`);
      }
    } catch (error) {
      logger.error('Error executing reasoning tool', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        toolName 
      });
      throw error;
    }
  }

  // Graph management methods
  async getReasoningStats() {
    return this.reasoningGraph.getStats();
  }

  async clearReasoningCache() {
    this.reasoningGraph.clearCache();
    this.fusionEngine.clearCache();
  }

  // Private helper methods
  private async addProblemToGraph(problem: string) {
    const nodeId = `problem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const node = {
      id: nodeId,
      type: 'question' as const,
      content: problem,
      confidence: 1.0,
      embedding: undefined,
      metadata: { timestamp: new Date() },
      createdAt: new Date(),
      updatedAt: new Date(),
      priority: 0.9,
      tags: ['problem', 'question']
    };

    this.reasoningGraph.addNode(node);
    return node;
  }

  private async addConclusionToGraph(conclusion: string) {
    const nodeId = `conclusion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const node = {
      id: nodeId,
      type: 'inference' as const,
      content: conclusion,
      confidence: 0.8,
      embedding: undefined,
      metadata: { timestamp: new Date() },
      createdAt: new Date(),
      updatedAt: new Date(),
      priority: 0.8,
      tags: ['conclusion', 'inference']
    };

    this.reasoningGraph.addNode(node);
    return node;
  }
}

// Export singleton instance
export const reasoningIntegration = new ReasoningIntegration();

// Export for use in existing system
export function getReasoningIntegration(): ReasoningIntegration {
  return reasoningIntegration;
}
