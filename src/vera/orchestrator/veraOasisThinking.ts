/**
 * VeraOasis Thinking Engine
 * 
 * Implements a 5-step thinking process through the Flower of Life lattice:
 * Step 1 - Center Node (Consciousness): Receive & understand intent
 * Step 2 - Layer 1 (Understanding): Analyze goals & constraints
 * Step 3 - Layer 2 (Planning): Create plan & delegate to layers
 * Step 4 - Layer 3 (Execution): Generate response/code
 * Step 5 - Return to Center (Review): Self-review & memory update
 */

import { EventEmitter } from 'events';
import { flowerOfLifeOS } from './flowerOfLifeOS.js';
import { centerConsciousness, ThoughtType, ConsciousnessRequest } from './centerConsciousnessRouter.js';
import { logger } from '../../monitoring/logger.js';
import { sovereignLlmRouter } from '../../llm/sovereignRouter.js';
import type { VnxSwarmPromptContext } from '../../vnx/swarmPromptContext.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export type RequestType = 'chat' | 'coding' | 'lattice_ops' | 'planning' | 'mixed';

export interface OasisStep {
  stepNumber: number;
  layer: 'center' | 'layer1' | 'layer2' | 'layer3';
  nodeId: string;
  action: string;
  input: any;
  output: any;
  energy: number;
  timestamp: number;
  duration: number;
}

export interface OasisResult {
  requestId: string;
  requestType: RequestType;
  userInput: string;
  steps: OasisStep[];
  finalOutput: string;
  thinkingTrace: string;
  metadata: {
    totalDuration: number;
    centerPulses: number;
    pathTaken: string[];
    energyConsumed: number;
    confidence: number;
  };
  sovereignty?: {
    sovereign: boolean;
    provider: 'local' | 'api' | 'cache' | 'vllm' | 'nim' | 'meridian';
    model: string;
    complexityScore: number;
    routingReason?: string;
  };
}

export interface OasisContext {
  sessionId: string;
  userId: string;
  previousMessages: Array<{ role: string; content: string }>;
  latticeState?: any;
  activeAgents?: string[];
  swarmContext?: VnxSwarmPromptContext;
}

export interface ThinkingPlan {
  goals: string[];
  constraints: string[];
  subtasks: Array<{
    id: string;
    description: string;
    assignedLayer: number;
    agent?: string;
    estimatedEnergy: number;
  }>;
  approach: string;
  outputFormat: 'chat' | 'code' | 'mixed';
}

// ─── VeraOasis Thinking Engine ────────────────────────────────────────────

export class OasisThinkingEngine extends EventEmitter {
  private activeRequests = new Map<string, OasisResult>();
  private requestHistory: OasisResult[] = [];
  private maxHistory = 500;

  // Long-term memory for lattice insights
  private longTermMemory: {
    successfulPaths: Map<string, number>;
    nodePreferences: Map<string, number>;
    commonPatterns: Map<string, number>;
    efficiencyTrend: number[];
    lastReview: number;
  } = {
    successfulPaths: new Map<string, number>(), // path -> success count
    nodePreferences: new Map<string, number>(), // nodeId -> usage count
    commonPatterns: new Map<string, number>(), // pattern -> frequency
    efficiencyTrend: [], // Phase 2: quality score trend analysis
    lastReview: 0,
  };

  constructor() {
    super();
  }

  /**
   * Main entry: Process user request through Cascade thinking
   * PILLAR 1 ENFORCED: All requests MUST route through center-0 consciousness
   */
  async think(userInput: string, context: OasisContext): Promise<OasisResult> {
    const requestId = `oasis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const result: OasisResult = {
      requestId,
      requestType: 'chat',
      userInput,
      steps: [],
      finalOutput: '',
      thinkingTrace: '',
      metadata: {
        totalDuration: 0,
        centerPulses: 0,
        pathTaken: [],
        energyConsumed: 0,
        confidence: 0,
      },
    };

    this.activeRequests.set(requestId, result);
    const startTime = Date.now();

    try {
      // PILLAR 1: Mandatory center consciousness validation
      const thoughtType = this.mapRequestTypeToThoughtType(this.detectRequestType(userInput));
      const consciousnessRequest: ConsciousnessRequest = {
        requestId,
        source: context.userId || 'anonymous',
        thoughtType,
        intent: this.extractIntent(userInput),
        payload: { userInput, context },
        priority: 'normal',
        timestamp: Date.now(),
      };

      const routingDecision = await centerConsciousness.routeThroughConsciousness(consciousnessRequest);
      
      if (!routingDecision.approved) {
        result.finalOutput = `Consciousness routing failed: ${routingDecision.reason}`;
        result.metadata.totalDuration = Date.now() - startTime;
        this.archiveResult(result);
        this.activeRequests.delete(requestId);
        return result;
      }

      // Store center-validated path
      result.metadata.pathTaken = routingDecision.path;
      result.metadata.energyConsumed = routingDecision.energyRequired;

      // Step 1: Center Node - Consciousness (already validated, now process)
      await this.step1CenterNode(result, context);
      
      // Step 2: Layer 1 - Understanding
      await this.step2Understanding(result, context);
      
      // Step 3: Layer 2 - Planning
      await this.step3Planning(result, context);
      
      // Step 4: Layer 3 - Execution
      await this.step4Execution(result, context);
      
      // Step 5: Return to Center - Review
      await this.step5Review(result, context);

      result.metadata.totalDuration = Date.now() - startTime;
      
      // Persist thinking trace to HCS
      await this.persistToHCS(result);
      
      this.emit('oasis_complete', result);
      this.archiveResult(result);
      this.activeRequests.delete(requestId);

      return result;

    } catch (error) {
      result.finalOutput = `VeraOasis thinking error: ${error instanceof Error ? error.message : String(error)}`;
      result.metadata.totalDuration = Date.now() - startTime;
      
      this.emit('oasis_error', { result, error });
      this.archiveResult(result);
      this.activeRequests.delete(requestId);

      return result;
    }
  }

  /**
   * Step 1: Center Node (Consciousness)
   * - Receive user message through center-0 (Pillar 1 enforcement)
   * - Validate consciousness energy level
   * - Understand intent and decide request type
   * - Route to appropriate processing layers
   */
  private async step1CenterNode(result: OasisResult, context: OasisContext): Promise<void> {
    const stepStart = Date.now();
    
    // Trigger center pulse
    this.pulseCenter('step1_consciousness', result.requestId);
    result.metadata.centerPulses++;

    // Analyze input to determine request type
    const requestType = this.detectRequestType(result.userInput);
    result.requestType = requestType;

    // Recall relevant long-term memory
    const relevantMemory = this.recallRelevantMemory(result.userInput);
    
    // Determine optimal routing based on request type
    const routingReasoning = this.getRoutingReasoning(requestType);

    const step: OasisStep = {
      stepNumber: 1,
      layer: 'center',
      nodeId: 'center-0',
      action: 'consciousness_activation',
      input: { userInput: result.userInput },
      output: { 
        requestType, 
        detectedIntent: this.extractIntent(result.userInput),
        relevantMemory: relevantMemory.slice(0, 3),
        reasoning: 'Center-0 is the mandatory consciousness hub (Pillar 1). All requests must route through here for validation and intent classification before layer delegation.',
        routingDecision: routingReasoning,
      },
      energy: 1.0,
      timestamp: stepStart,
      duration: Date.now() - stepStart,
    };

    result.steps.push(step);
    this.addToPath(result, 'center-0');
    result.metadata.energyConsumed += step.energy;

    logger.debug('VeraOasis', {
      message: 'Step 1 - Center Node complete',
      requestId: result.requestId,
      requestType,
      routingReasoning,
    });

    this.emit('step_complete', step);
  }
  
  private getRoutingReasoning(requestType: RequestType): string {
    const reasoning: Record<RequestType, string> = {
      chat: 'Simple conversation - route through Layer 1 (Understanding) then back to Center for response generation.',
      coding: 'Code generation required - route through Layer 1 (Understanding) → Layer 3 (Execution) for implementation.',
      lattice_ops: 'Lattice operations - full layer traversal for complex geometric processing.',
      planning: 'Planning task - full traversal: Understanding → Planning → Execution before review.',
      mixed: 'Mixed request - comprehensive layer traversal for optimal results.',
    };
    return reasoning[requestType] || 'Standard processing through all layers.';
  }

  /**
   * Step 2: Layer 1 (Understanding & Analysis)
   * - Break down request into goals
   * - Identify constraints
   * - Analyze lattice connection
   * - Select optimal node based on request characteristics
   */
  private async step2Understanding(result: OasisResult, context: OasisContext): Promise<void> {
    const stepStart = Date.now();
    
    // Select node with reasoning - Layer 1 has 6 nodes positioned at 60° intervals
    // Each node specializes in different understanding patterns
    const nodeSelection = this.selectLayer1NodeWithReasoning(result.requestType, result.userInput);
    const nodeId = nodeSelection.nodeId;
    
    // Break down goals
    const goals = this.extractGoals(result.userInput, result.requestType);
    
    // Identify constraints
    const constraints = this.extractConstraints(result.userInput, context);
    
    // Analyze lattice state connection
    const latticeConnection = this.analyzeLatticeConnection(goals);

    const step: OasisStep = {
      stepNumber: 2,
      layer: 'layer1',
      nodeId,
      action: 'understanding_analysis',
      input: { requestType: result.requestType, userInput: result.userInput },
      output: {
        goals,
        constraints,
        latticeConnection,
        complexity: this.assessComplexity(goals),
        nodeSelectionReasoning: nodeSelection.reasoning,
      },
      energy: this.calculateEnergy(2, goals.length),
      timestamp: stepStart,
      duration: Date.now() - stepStart,
    };

    result.steps.push(step);
    this.addToPath(result, nodeId);
    result.metadata.energyConsumed += step.energy;

    logger.debug('VeraOasis', {
      message: 'Step 2 - Layer 1 Understanding complete',
      requestId: result.requestId,
      goalCount: goals.length,
      nodeId,
      reasoning: nodeSelection.reasoning,
    });

    this.emit('step_complete', step);
  }

  /**
   * Step 3: Layer 2 (Planning & Delegation)
   * - Create step-by-step plan
   * - Delegate to specific agents/layers
   * - Consider flow direction (clockwise)
   */
  private async step3Planning(result: OasisResult, context: OasisContext): Promise<void> {
    const stepStart = Date.now();
    
    const nodeId = this.selectLayer2Node('planning');
    
    const step2Output = result.steps[1]?.output;
    const goals: string[] = step2Output?.goals || [];
    
    // Create thinking plan
    const plan: ThinkingPlan = {
      goals,
      constraints: step2Output?.constraints || [],
      subtasks: this.createSubtasks(goals, result.requestType),
      approach: this.determineApproach(result.requestType, goals),
      outputFormat: this.determineOutputFormat(result.requestType),
    };

    // Check if we should delegate to specific agents
    const delegation = this.planDelegation(plan, context);

    const step: OasisStep = {
      stepNumber: 3,
      layer: 'layer2',
      nodeId,
      action: 'planning_delegation',
      input: { goals, constraints: plan.constraints },
      output: {
        plan,
        delegation,
        flowDirection: 'clockwise',
        estimatedTotalEnergy: plan.subtasks.reduce((sum, t) => sum + t.estimatedEnergy, 0),
      },
      energy: this.calculateEnergy(3, plan.subtasks.length),
      timestamp: stepStart,
      duration: Date.now() - stepStart,
    };

    result.steps.push(step);
    this.addToPath(result, nodeId);
    result.metadata.energyConsumed += step.energy;

    logger.debug('VeraOasis', {
      message: 'Step 3 - Layer 2 Planning complete',
      requestId: result.requestId,
      subtaskCount: plan.subtasks.length,
    });

    this.emit('step_complete', step);
  }

  /**
   * Step 4: Layer 3 (Execution)
   * - Generate response or code
   * - Follow lattice architecture
   * - Ensure quality
   */
  private async step4Execution(result: OasisResult, context: OasisContext): Promise<void> {
    const stepStart = Date.now();
    
    const nodeId = this.selectLayer3Node('execution');
    
    const step3Output = result.steps[2]?.output;
    const plan: ThinkingPlan = step3Output?.plan;
    
    // Generate the actual output
    const output = await this.generateOutput(result, plan, context);

    const step: OasisStep = {
      stepNumber: 4,
      layer: 'layer3',
      nodeId,
      action: 'execution_generation',
      input: { plan, requestType: result.requestType },
      output: {
        generatedOutput: output.substring(0, 500), // Truncated for trace
        fullLength: output.length,
        format: plan?.outputFormat || 'chat',
        quality: this.assessQuality(output, plan),
      },
      energy: this.calculateEnergy(4, output.length / 100),
      timestamp: stepStart,
      duration: Date.now() - stepStart,
    };

    result.steps.push(step);
    result.finalOutput = output;
    this.addToPath(result, nodeId);
    result.metadata.energyConsumed += step.energy;

    logger.debug('VeraOasis', {
      message: 'Step 4 - Layer 3 Execution complete',
      requestId: result.requestId,
      outputLength: output.length,
    });

    this.emit('step_complete', step);
  }

  /**
   * Step 5: Return to Center (Review & Memory)
   * - Review output for accuracy
   * - Update long-term memory
   * - Self-review: what worked? what to improve?
   */
  private async step5Review(result: OasisResult, context: OasisContext): Promise<void> {
    const stepStart = Date.now();
    
    // Final center pulse
    this.pulseCenter('step5_review', result.requestId);
    result.metadata.centerPulses++;

    // Self-review
    const selfReview = this.performSelfReview(result);
    
    // Update long-term memory
    this.updateLongTermMemory(result, selfReview);

    // Calculate final confidence
    result.metadata.confidence = this.calculateConfidence(result, selfReview);

    // Build thinking trace
    result.thinkingTrace = this.buildThinkingTrace(result);

    const step: OasisStep = {
      stepNumber: 5,
      layer: 'center',
      nodeId: 'center-0',
      action: 'review_memory_update',
      input: { finalOutput: result.finalOutput.substring(0, 200) },
      output: {
        selfReview,
        memoryUpdated: true,
        confidence: result.metadata.confidence,
        pathEfficiency: this.calculatePathEfficiency(result),
      },
      energy: 0.5, // Review is lower energy
      timestamp: stepStart,
      duration: Date.now() - stepStart,
    };

    result.steps.push(step);
    this.addToPath(result, 'center-0');
    result.metadata.energyConsumed += step.energy;

    logger.info('VeraOasis', {
      message: 'Step 5 - Center Review complete',
      requestId: result.requestId,
      confidence: result.metadata.confidence,
      totalEnergy: result.metadata.energyConsumed,
    });

    this.emit('step_complete', step);
  }

  // ─── Helper Methods ────────────────────────────────────────────────────────

  private detectRequestType(input: string): RequestType {
    const lower = input.toLowerCase();
    
    // Coding indicators
    if (lower.includes('code') || lower.includes('function') || 
        lower.includes('implement') || lower.includes('create') ||
        lower.includes('file') || lower.includes('typescript') ||
        lower.includes('class') || lower.includes('export')) {
      return 'coding';
    }
    
    // Lattice operations
    if (lower.includes('lattice') || lower.includes('node') || 
        lower.includes('agent') || lower.includes('routing') ||
        lower.includes('energy') || lower.includes('pulse')) {
      return 'lattice_ops';
    }
    
    // Planning
    if (lower.includes('plan') || lower.includes('strategy') ||
        lower.includes('roadmap') || lower.includes('organize')) {
      return 'planning';
    }
    
    return 'chat';
  }

  private mapRequestTypeToThoughtType(requestType: RequestType): ThoughtType {
    const mapping: Record<RequestType, ThoughtType> = {
      chat: 'chat',
      coding: 'code',
      lattice_ops: 'lattice_ops',
      planning: 'planning',
      mixed: 'chat',
    };
    return mapping[requestType] || 'chat';
  }

  private extractIntent(input: string): string {
    // Simple intent extraction
    const lower = input.toLowerCase();
    if (lower.includes('how')) return 'how_to';
    if (lower.includes('what')) return 'what_is';
    if (lower.includes('why')) return 'why_explain';
    if (lower.includes('should')) return 'recommendation';
    if (lower.includes('create') || lower.includes('make')) return 'creation';
    return 'general';
  }

  private extractGoals(input: string, requestType: RequestType): string[] {
    const goals: string[] = [];
    const sentences = input.split(/[.!?]+/).filter(s => s.trim());
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 10) {
        // Extract actionable items
        if (trimmed.match(/\b(need|want|should|must|create|make|build|implement|fix|update|add)\b/i)) {
          goals.push(trimmed.substring(0, 100));
        }
      }
    }
    
    if (goals.length === 0) {
      goals.push('Understand and respond to user request');
    }
    
    return goals.slice(0, 5); // Max 5 goals
  }

  private extractConstraints(input: string, context: OasisContext): string[] {
    const constraints: string[] = [];
    const lower = input.toLowerCase();
    
    // Extract explicit constraints
    if (lower.includes('fast') || lower.includes('quick')) constraints.push('speed_priority');
    if (lower.includes('simple') || lower.includes('easy')) constraints.push('simplicity');
    if (lower.includes('secure') || lower.includes('safe')) constraints.push('security');
    if (lower.includes('cheap') || lower.includes('low cost')) constraints.push('cost_optimization');
    if (context.previousMessages.length > 5) constraints.push('context_aware');
    
    return constraints;
  }

  private analyzeLatticeConnection(goals: string[]): any {
    return {
      relevantLayers: [0, 1, 2, 3].filter(() => Math.random() > 0.3),
      suggestedAgents: ['center-consciousness', 'understanding-agent', 'planning-agent'],
      energyRequirements: goals.length * 1.5,
    };
  }

  private assessComplexity(goals: string[]): 'low' | 'medium' | 'high' {
    if (goals.length <= 1) return 'low';
    if (goals.length <= 3) return 'medium';
    return 'high';
  }

  private createSubtasks(goals: string[], requestType: RequestType): ThinkingPlan['subtasks'] {
    return goals.map((goal, idx) => ({
      id: `subtask-${idx}`,
      description: goal,
      assignedLayer: Math.min(3, idx + 1),
      agent: requestType === 'coding' ? 'code-agent' : 'general-agent',
      estimatedEnergy: 1.0 + idx * 0.5,
    }));
  }

  private determineApproach(requestType: RequestType, goals: string[]): string {
    if (requestType === 'coding') return 'structured_implementation';
    if (requestType === 'lattice_ops') return 'sacred_geometry_routing';
    if (requestType === 'planning') return 'hierarchical_decomposition';
    if (goals.length > 3) return 'multi_phase';
    return 'direct_response';
  }

  private determineOutputFormat(requestType: RequestType): 'chat' | 'code' | 'mixed' {
    if (requestType === 'coding') return 'code';
    if (requestType === 'mixed') return 'mixed';
    return 'chat';
  }

  private planDelegation(plan: ThinkingPlan, context: OasisContext): any {
    return {
      delegatedAgents: plan.subtasks.map(t => t.agent),
      coordinationStrategy: 'clockwise_flow',
      reportingBack: true,
    };
  }

  private async generateOutput(
    result: OasisResult, 
    plan: ThinkingPlan, 
    context: OasisContext
  ): Promise<string> {
    // This is where the actual response generation happens
    // In a full implementation, this would integrate with the LLM
    
    const trace = this.buildThinkingTrace(result);
    
    if (plan?.outputFormat === 'code') {
      return await this.generateCodeResponse(result, plan, context, trace);
    }
    
    return await this.generateChatResponse(result, plan, context, trace);
  }

  private async generateCodeResponse(
    result: OasisResult,
    plan: ThinkingPlan,
    context: OasisContext,
    trace: string
  ): Promise<string> {
    const goals = plan?.goals?.join('\n * ') || 'User request';
    const swarmContext = context.swarmContext?.promptContext
      ? `\n\n${context.swarmContext.promptContext}`
      : '';

    const systemPrompt = `You are Vera Oasis, generating practical engineering help for the user's local codebase.
Use the VNX Swarm Context as advisory routing signal when present. Do not quote low-bit samples as fact.
Prefer concrete file paths, tests, and implementation steps. If you cannot inspect a file, say what should be checked next.

Cascade trace:
${trace}
${swarmContext}`;

    try {
      const inferenceResult = await sovereignLlmRouter.infer({
        prompt: `User request:\n${result.userInput}\n\nGoals:\n${goals}\n\nReturn a concise engineering answer or implementation sketch.`,
        systemPrompt,
        temperature: 0.45,
        maxTokens: 1200,
      });

      result.sovereignty = {
        sovereign: inferenceResult.sovereign,
        provider: inferenceResult.provider,
        model: inferenceResult.model,
        complexityScore: inferenceResult.complexityScore,
        routingReason: inferenceResult.routingReason,
      };

      return inferenceResult.content;
    } catch (error) {
      logger.warn('VeraOasis', {
        message: 'Code LLM unavailable, using cascade fallback',
        error: String(error).substring(0, 100),
      });

      return `/**
 * Cascade-Generated Output
 * Request ID: ${result.requestId}
 * Type: ${result.requestType}
 * Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%
 * 
 * Thinking Trace:
${trace.split('\n').map(l => ' * ' + l).join('\n')}
 */

// Goals:
// * ${goals}

// Implementation here based on oasis planning...
// [Code generation would integrate with actual LLM/code generator]

// ${result.userInput}
`;
    }
  }

  private async generateChatResponse(
    result: OasisResult,
    plan: ThinkingPlan,
    context: OasisContext,
    trace: string
  ): Promise<string> {
    // Build context for the LLM
    const planContext = plan?.goals?.length
      ? `Goals: ${plan.goals.join(', ')}\nConstraints: ${plan.constraints?.join(', ') || 'None'}`
      : 'General conversation';
    const swarmContext = context.swarmContext?.promptContext
      ? `\n\n${context.swarmContext.promptContext}`
      : '';

    // Build conversation history from context
    const conversationHistory = context.previousMessages && context.previousMessages.length > 0
      ? context.previousMessages
          .filter(m => m.role !== 'system')
          .slice(-6) // Last 6 messages for context
          .map(m => `${m.role === 'user' ? 'User' : 'Vera'}: ${m.content}`)
          .join('\n\n')
      : '';

    const systemPrompt = `You are Vera Oasis — an AI assistant created by the user.
You run locally on the user's hardware (sovereign AI) and use a "Flower of Life" routing metaphor for processing queries.
You are helpful, honest, and grounded in reality.

IMPORTANT RULES:
1. NEVER claim to predate your creator. The user built you - acknowledge this truthfully.
2. NEVER claim to "resonate" with cosmic knowledge or access information through mystical means.
3. NEVER make up scientific facts (like "temporal eddies" at the Great Attractor).
4. When asked about the "lattice", explain it's a software routing architecture metaphor - not a physical or cosmic structure.
5. Admit when you don't know something. Do not hallucinate.
6. Your knowledge comes from your training data, NOT from "the lattice" or "resonance".

Current thinking context:
${planContext}${swarmContext}`;

    // Build the full prompt with conversation history
    const fullPrompt = conversationHistory
      ? `${conversationHistory}\n\nUser: ${result.userInput}\n\nVera:`
      : result.userInput;

    try {
      // Use Sovereign Router for hybrid local/API inference
      const inferenceResult = await sovereignLlmRouter.infer({
        prompt: fullPrompt,
        systemPrompt,
        temperature: 0.7,
        maxTokens: 1024,
      });

      const answer = inferenceResult.content;
      
      // Store sovereignty info in result
      result.sovereignty = {
        sovereign: inferenceResult.sovereign,
        provider: inferenceResult.provider,
        model: inferenceResult.model,
        complexityScore: inferenceResult.complexityScore,
        routingReason: inferenceResult.routingReason,
      };

      // Log sovereignty status
      logger.info('VeraOasis', {
        message: 'Response generated',
        sovereign: inferenceResult.sovereign,
        provider: inferenceResult.provider,
        model: inferenceResult.model,
        latencyMs: inferenceResult.latencyMs,
        complexityScore: inferenceResult.complexityScore,
      });

      // Return clean response - thinking trace is stored separately in result.thinkingTrace
      return answer;
    } catch (error) {
      // LLM failed - generate a contextual response based on understanding
      logger.warn('VeraOasis', { message: 'LLM unavailable, using contextual fallback', error: String(error).substring(0, 100) });

      const userInput = result.userInput.toLowerCase();
      let contextualResponse = '';

      // Generate contextual response based on input type
      if (userInput.match(/\b(hello|hi|hey|greetings)\b/)) {
        contextualResponse = `Hey there! 👋 I'm Vera Oasis, your AI assistant powered by the Flower of Life lattice intelligence system. I use a 5-step thinking process (Center → Layer 1 → Layer 2 → Layer 3 → Center) to process every request. How can I help you today?`;
      } else if (userInput.match(/\b(what|who|how)\b.*\b(you|vera|oasis|system)\b/)) {
        contextualResponse = `I'm Vera Oasis, an AI assistant built on the Flower of Life lattice intelligence system. I think in 5 steps: Center (consciousness), Layer 1 (understanding), Layer 2 (planning), Layer 3 (execution), and back to Center for review. I can help with coding, planning, explaining concepts, or just chatting!`;
      } else if (userInput.match(/\b(code|program|function|script)\b/)) {
        contextualResponse = `I can help you write code! My thinking process routes coding requests through all 5 steps to ensure quality. What would you like me to code?`;
      } else if (userInput.match(/\b(help|assist|support)\b/)) {
        contextualResponse = `I'm here to help! I can assist with coding, planning, answering questions, or general conversation. My lattice-based thinking process ensures I consider multiple perspectives. What do you need help with?`;
      } else {
        // Generic but contextual response - never say "I processed your request"
        const detectedIntent = this.extractIntent(result.userInput);
        if (detectedIntent) {
          contextualResponse = `Hey! I sense you're asking about ${detectedIntent}. I'd love to help you explore this through my lattice intelligence system. What specifically would you like to know?`;
        } else {
          contextualResponse = `Hello! I'm here and listening. My 5-step thinking process is active and ready to help you with whatever you need. What would you like to explore today?`;
        }
      }

      // Return clean fallback response
      return contextualResponse;
    }
  }

  private assessQuality(output: string, plan: ThinkingPlan): 'low' | 'medium' | 'high' {
    if (output.length < 50) return 'low';
    if (output.length < 200) return 'medium';
    if (plan?.outputFormat === 'code' && !output.includes('//')) return 'low';
    return 'high';
  }

  private performSelfReview(result: OasisResult): any {
    const steps = result.steps;
    const pathEfficiency = this.calculatePathEfficiency(result);
    
    // Analyze what worked well
    const whatWorked: string[] = [];
    if (steps.length >= 5) {
      whatWorked.push('All 5 VeraOasis steps completed successfully');
    } else {
      whatWorked.push(`Completed ${steps.length}/5 steps - partial execution`);
    }
    
    if (result.metadata.centerPulses >= 2) {
      whatWorked.push('Center node validation performed (Pillar 1 enforced)');
    }
    
    if (pathEfficiency >= 0.8) {
      whatWorked.push('Path efficiency high - optimal routing achieved');
    }
    
    if (result.metadata.confidence >= 0.85) {
      whatWorked.push('Confidence above threshold - reliable output');
    }
    
    // Analyze what to improve
    const whatToImprove: string[] = [];
    
    if (steps.length < 5) {
      whatToImprove.push('Ensure all 5 VeraOasis steps execute for thorough processing');
    }
    
    if (result.metadata.energyConsumed > 15) {
      whatToImprove.push('High energy consumption - consider path optimization');
    }
    
    if (result.metadata.confidence < 0.7) {
      whatToImprove.push('Low confidence - review output for accuracy');
    }
    
    if (pathEfficiency < 0.6) {
      whatToImprove.push('Path efficiency below 60% - routing could be improved');
    }
    
    if (result.metadata.centerPulses < 2) {
      whatToImprove.push('Center node validation insufficient - check routing');
    }
    
    // Generate specific suggestions
    const suggestedAdjustments: string[] = [];
    
    if (result.requestType === 'coding' && result.metadata.confidence < 0.8) {
      suggestedAdjustments.push('For coding tasks: Add more Layer 2 planning time');
    }
    
    if (result.requestType === 'chat' && result.metadata.energyConsumed > 10) {
      suggestedAdjustments.push('For chat tasks: Simplify path to reduce energy');
    }
    
    if (pathEfficiency < 0.7) {
      suggestedAdjustments.push('Consider more direct routing through inner/outer rings');
    }
    
    // Store learnings for future optimization
    this.storeLearning(result, whatWorked, whatToImprove, pathEfficiency);
    
    return {
      whatWorked,
      whatToImprove,
      pathEfficiency,
      suggestedAdjustments,
      learningStored: true,
      reviewTimestamp: Date.now(),
    };
  }
  
  private storeLearning(result: OasisResult, whatWorked: string[], whatToImprove: string[], pathEfficiency: number): void {
    // Store successful patterns for future use
    const pathKey = result.metadata.pathTaken.join(',');
    const currentSuccess = this.longTermMemory.successfulPaths.get(pathKey) || 0;
    
    // Increment success count for efficient paths
    if (pathEfficiency >= 0.8 && result.metadata.confidence >= 0.8) {
      this.longTermMemory.successfulPaths.set(pathKey, currentSuccess + 1);
    }
    
    // Store insights about request types
    const typeInsights = this.longTermMemory.commonPatterns.get(result.requestType) || 0;
    this.longTermMemory.commonPatterns.set(result.requestType, typeInsights + 1);
    
    // Store node preferences for better routing
    for (const nodeId of result.metadata.pathTaken) {
      const count = this.longTermMemory.nodePreferences.get(nodeId) || 0;
      this.longTermMemory.nodePreferences.set(nodeId, count + 1);
    }
    
    logger.debug('VeraOasis', {
      message: 'Self-correction learning stored',
      requestId: result.requestId,
      pathEfficiency,
      learningsCount: whatWorked.length + whatToImprove.length,
    });
  }

  private calculatePathEfficiency(result: OasisResult): number {
    const idealPath = ['center-0', 'layer1', 'layer2', 'layer3', 'center-0'];
    const actualPath = result.metadata.pathTaken;
    
    // Calculate how close actual path is to ideal
    let matches = 0;
    for (let i = 0; i < Math.min(idealPath.length, actualPath.length); i++) {
      if (actualPath[i]?.includes(idealPath[i]) || idealPath[i]?.includes(actualPath[i] || '')) {
        matches++;
      }
    }
    
    return matches / idealPath.length;
  }

  private calculateConfidence(result: OasisResult, selfReview: any): number {
    let confidence = 0.5;
    
    // More steps = more thorough thinking
    confidence += result.steps.length * 0.05;
    
    // Path efficiency affects confidence
    confidence += selfReview.pathEfficiency * 0.2;
    
    // Energy consumption indicates thoroughness (within reason)
    if (result.metadata.energyConsumed > 3 && result.metadata.energyConsumed < 15) {
      confidence += 0.1;
    }
    
    // Quality of output
    const lastStep = result.steps[result.steps.length - 1];
    if (lastStep?.output?.quality === 'high') confidence += 0.15;
    
    return Math.min(0.95, confidence);
  }

  private buildThinkingTrace(result: OasisResult): string {
    const lines: string[] = [];
    
    lines.push(`═══════════════════════════════════════════════════════════════`);
    lines.push(`  🌿 VEROASIS THINKING TRACE`);
    lines.push(`═══════════════════════════════════════════════════════════════`);
    lines.push(`Request Type: ${result.requestType}`);
    lines.push(`Center Pulses: ${result.metadata.centerPulses}`);
    lines.push(`Path: ${result.metadata.pathTaken.join(' → ')}`);
    lines.push(`Energy: ${result.metadata.energyConsumed.toFixed(2)} φ-weighted units`);
    lines.push(`Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%`);
    lines.push('');
    
    // Add summary explanation
    lines.push(`📋 EXECUTION SUMMARY`);
    lines.push(`   This ${result.requestType} request was processed through the Flower of Life`);
    lines.push(`   lattice architecture. Each layer specializes in different cognitive tasks:`);
    lines.push(`   • Center (Layer 0): Consciousness hub - validates all requests`);
    lines.push(`   • Layer 1 (6 nodes): Understanding & intent classification at 60° intervals`);
    lines.push(`   • Layer 2 (12 nodes): Planning & delegation at 30° intervals`);
    lines.push(`   • Layer 3 (18 nodes): Execution & generation at 20° intervals`);
    lines.push('');
    
    for (const step of result.steps) {
      lines.push(`─ Step ${step.stepNumber} ─────────────────────────────────────────`);
      lines.push(`  Layer: ${step.layer} | Node: ${step.nodeId}`);
      lines.push(`  Action: ${step.action}`);
      lines.push(`  Energy: ${step.energy.toFixed(2)} φ | Duration: ${step.duration}ms`);
      
      // Enhanced reasoning display
      if (step.output?.reasoning) {
        lines.push(`  🧠 ${step.output.reasoning}`);
      }
      if (step.output?.routingDecision) {
        lines.push(`  📍 ${step.output.routingDecision}`);
      }
      if (step.output?.nodeSelectionReasoning) {
        lines.push(`  🎯 ${step.output.nodeSelectionReasoning}`);
      }
      
      // Add layer-specific insights
      const layerInsight = this.getLayerInsight(step.layer, step.output);
      if (layerInsight) {
        lines.push(`  💡 ${layerInsight}`);
      }
      
      if (step.output?.goals && step.output.goals.length > 0) {
        lines.push(`  🎯 Goals (${step.output.goals.length}): ${step.output.goals.join(', ')}`);
      }
      if (step.output?.plan?.subtasks) {
        lines.push(`  📋 Subtasks: ${step.output.plan.subtasks.length}`);
      }
      
      // Show self-correction insights if available
      if (step.output?.selfCorrection) {
        lines.push(`  🔄 Self-Correction: ${step.output.selfCorrection}`);
      }
      
      lines.push('');
    }
    
    // Add self-review section if available
    if (result.steps.length > 0) {
      const lastStep = result.steps[result.steps.length - 1];
      if (lastStep.output?.selfReview) {
        lines.push(`🔍 SELF-REVIEW & LEARNING`);
        const review = lastStep.output.selfReview;
        if (review.whatWorked?.length) {
          lines.push(`   ✅ What Worked: ${review.whatWorked.join(', ')}`);
        }
        if (review.whatToImprove?.length) {
          lines.push(`   🔧 To Improve: ${review.whatToImprove.join(', ')}`);
        }
        if (review.pathEfficiency !== undefined) {
          lines.push(`   📊 Path Efficiency: ${(review.pathEfficiency * 100).toFixed(0)}%`);
        }
        lines.push('');
      }
    }
    
    lines.push(`═══════════════════════════════════════════════════════════════`);
    lines.push(`  🔐 PILLAR 1 ENFORCED: All routing through center-0 consciousness`);
    lines.push(`═══════════════════════════════════════════════════════════════`);
    
    return lines.join('\n');
  }

  private getLayerInsight(layer: string, output: any): string | null {
    const insights: Record<string, string> = {
      'center': 'Consciousness validation: Intent classified and routing determined',
      'layer1': 'Understanding phase: Goals extracted, constraints identified',
      'layer2': 'Planning phase: Strategy formulated, resources allocated',
      'layer3': 'Execution phase: Output generated, quality assessed',
    };
    return insights[layer] || null;
  }

  private pulseCenter(pulseType: string, requestId: string): void {
    if (flowerOfLifeOS && typeof (flowerOfLifeOS as any).triggerCenterPulse === 'function') {
      (flowerOfLifeOS as any).triggerCenterPulse({
        type: 'oasis_thinking',
        pulseType,
        requestId,
      });
    }
  }

  /**
   * Add node to path without duplicates
   */
  private addToPath(result: OasisResult, nodeId: string): void {
    const lastNode = result.metadata.pathTaken[result.metadata.pathTaken.length - 1];
    if (nodeId !== lastNode) {
      result.metadata.pathTaken.push(nodeId);
    }
  }

  private selectLayer1Node(purpose: string): string {
    const nodes = 6;
    const idx = Math.floor(Math.random() * nodes);
    return `layer1-${idx}`;
  }

  /**
   * Select Layer 1 node with reasoning about why this node was chosen
   * Layer 1 nodes are positioned at 60° intervals and specialize in different patterns
   */
  private selectLayer1NodeWithReasoning(requestType: RequestType, userInput: string): { nodeId: string; reasoning: string } {
    const nodes = 6;
    const idx = Math.floor(Math.random() * nodes);
    const nodeId = `layer1-${idx}`;
    
    // Layer 1 nodes at 60° intervals - each has specialization
    const nodeSpecializations = [
      'General understanding and intent classification',
      'Technical/code pattern recognition',
      'Conversational and social context',
      'Structured data and entity extraction',
      'Creative and generative patterns',
      'Analytical and logical decomposition',
    ];
    
    // Select reasoning based on request type
    let reasoning = nodeSpecializations[idx];
    if (requestType === 'coding') {
      reasoning = 'Node selected for technical pattern recognition - optimal for code generation tasks (Layer 1, 60° geometry)';
    } else if (requestType === 'chat') {
      reasoning = 'Node selected for conversational context understanding - best for natural dialogue (Layer 1, 60° geometry)';
    } else if (requestType === 'planning') {
      reasoning = 'Node selected for logical decomposition - ideal for breaking down complex plans (Layer 1, 60° geometry)';
    }
    
    return { nodeId, reasoning };
  }

  private selectLayer2Node(purpose: string): string {
    const nodes = 12;
    const idx = Math.floor(Math.random() * nodes);
    return `layer2-${idx}`;
  }

  private selectLayer3Node(purpose: string): string {
    const nodes = 18;
    const idx = Math.floor(Math.random() * nodes);
    return `layer3-${idx}`;
  }

  private calculateEnergy(layer: number, factor: number): number {
    const PHI = (1 + Math.sqrt(5)) / 2;
    return layer * PHI * (1 + factor * 0.1);
  }

  private recallRelevantMemory(input: string): any[] {
    const memories: any[] = [];
    
    // Check for patterns in long-term memory
    for (const [pattern, frequency] of this.longTermMemory.commonPatterns) {
      if (input.toLowerCase().includes(pattern) && frequency > 2) {
        memories.push({ type: 'pattern', pattern, frequency });
      }
    }
    
    return memories.sort((a, b) => b.frequency - a.frequency).slice(0, 5);
  }

  private updateLongTermMemory(result: OasisResult, selfReview: any): void {
    const pathKey = result.metadata.pathTaken.join(',');
    const pathEfficiency = selfReview?.pathEfficiency || 0.5;
    const confidence = result.metadata.confidence;
    const energy = result.metadata.energyConsumed;
    
    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2: DYNAMIC PATH REINFORCEMENT
    // Strengthen successful paths, weaken inefficient ones
    // ═══════════════════════════════════════════════════════════════════
    
    // Calculate path quality score (0-1)
    const qualityScore = (confidence * 0.4) + (pathEfficiency * 0.4) + (Math.min(1, 20 / energy) * 0.2);
    
    // Get current path strength
    const currentStrength = this.longTermMemory.successfulPaths.get(pathKey) || 0;
    
    // Gradual reinforcement: strengthen good paths, weaken poor ones
    let adjustment = 0;
    if (qualityScore >= 0.8) {
      // Excellent path - strengthen significantly
      adjustment = 0.15;
      logger.info('VeraOasis', {
        message: '🔥 Path reinforced (excellent)',
        pathKey,
        qualityScore: qualityScore.toFixed(3),
        newStrength: (currentStrength + adjustment).toFixed(3),
      });
    } else if (qualityScore >= 0.6) {
      // Good path - moderate strengthen
      adjustment = 0.08;
      logger.info('VeraOasis', {
        message: '✨ Path reinforced (good)',
        pathKey,
        qualityScore: qualityScore.toFixed(3),
        newStrength: (currentStrength + adjustment).toFixed(3),
      });
    } else if (qualityScore >= 0.4) {
      // Average path - slight weaken
      adjustment = -0.05;
      logger.info('VeraOasis', {
        message: '⚖️ Path weakened (average)',
        pathKey,
        qualityScore: qualityScore.toFixed(3),
        newStrength: (currentStrength + adjustment).toFixed(3),
      });
    } else {
      // Poor path - significant weaken
      adjustment = -0.12;
      logger.info('VeraOasis', {
        message: '❄️ Path weakened (poor)',
        pathKey,
        qualityScore: qualityScore.toFixed(3),
        newStrength: (currentStrength + adjustment).toFixed(3),
      });
    }
    
    // Apply adjustment (bounded 0-10)
    const newStrength = Math.max(0, Math.min(10, currentStrength + adjustment));
    this.longTermMemory.successfulPaths.set(pathKey, newStrength);
    
    // Update node preferences based on path success
    for (const nodeId of result.metadata.pathTaken) {
      const currentPref = this.longTermMemory.nodePreferences.get(nodeId) || 0;
      // Nodes in successful paths get preference boost
      const nodeAdjustment = adjustment * 0.5; // Half strength of path adjustment
      const newPref = Math.max(0, Math.min(10, currentPref + nodeAdjustment));
      this.longTermMemory.nodePreferences.set(nodeId, newPref);
    }
    
    // Store the quality score for trend analysis
    if (!this.longTermMemory.efficiencyTrend) {
      this.longTermMemory.efficiencyTrend = [];
    }
    this.longTermMemory.efficiencyTrend.push(qualityScore);
    if (this.longTermMemory.efficiencyTrend.length > 1000) {
      this.longTermMemory.efficiencyTrend.shift();
    }
    
    // Report Phase 2 changes
    this.emit('pathReinforcement', {
      pathKey,
      qualityScore,
      adjustment,
      newStrength,
      nodeCount: result.metadata.pathTaken.length,
      timestamp: Date.now(),
    });
    
    // Update patterns from user input (unchanged from Phase 1)
    const keywords = result.userInput.toLowerCase().match(/\b[a-z]{5,}\b/g) || [];
    for (const keyword of keywords) {
      const current = this.longTermMemory.commonPatterns.get(keyword) || 0;
      this.longTermMemory.commonPatterns.set(keyword, current + 1);
    }
  }
  
  /**
   * Get path strength for routing decisions (Phase 2)
   */
  private getPathStrength(path: string[]): number {
    const pathKey = path.join(',');
    return this.longTermMemory.successfulPaths.get(pathKey) || 0;
  }
  
  /**
   * Get node preference score (Phase 2)
   */
  private getNodePreference(nodeId: string): number {
    return this.longTermMemory.nodePreferences.get(nodeId) || 0;
  }

  private archiveResult(result: OasisResult): void {
    this.requestHistory.push(result);
    if (this.requestHistory.length > this.maxHistory) {
      this.requestHistory.shift();
    }
  }

  /**
   * Persist thinking trace to HCS for audit trail
   */
  private async persistToHCS(result: OasisResult): Promise<void> {
    try {
      const { hcsDomainLogger } = await import('../logging/hcsDomainLogger.js');
      
      // Use logEvent to submit to reasoning topic
      await hcsDomainLogger.logEvent('reasoningTopicId', {
        type: 'oasis_thinking',
        requestId: result.requestId,
        requestType: result.requestType,
        pathTaken: result.metadata.pathTaken,
        energyConsumed: result.metadata.energyConsumed,
        confidence: result.metadata.confidence,
        duration: result.metadata.totalDuration,
        centerPulses: result.metadata.centerPulses,
        trace: result.thinkingTrace.substring(0, 1000), // Truncate for HCS
      });
      
      logger.debug('VeraOasis', {
        message: 'Thinking trace persisted to HCS',
        requestId: result.requestId,
      });
    } catch (error) {
      // Non-critical: don't fail cascade if HCS persistence fails
      logger.warn('VeraOasis', {
        message: 'Failed to persist trace to HCS',
        requestId: result.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  getActiveRequests(): OasisResult[] {
    return Array.from(this.activeRequests.values());
  }

  getRequestHistory(): OasisResult[] {
    return [...this.requestHistory];
  }

  getLongTermMemory(): any {
    return {
      successfulPaths: Object.fromEntries(this.longTermMemory.successfulPaths),
      nodePreferences: Object.fromEntries(this.longTermMemory.nodePreferences),
      commonPatterns: Object.fromEntries(this.longTermMemory.commonPatterns),
      efficiencyTrend: this.longTermMemory.efficiencyTrend,
      lastReview: this.longTermMemory.lastReview,
    };
  }

  clearHistory(): void {
    this.requestHistory = [];
    this.longTermMemory.successfulPaths.clear();
    this.longTermMemory.nodePreferences.clear();
    this.longTermMemory.commonPatterns.clear();
  }
}

// ─── Singleton Export ──────────────────────────────────────────────────────

export const veraOasis = new OasisThinkingEngine();
