/**
 * Chain-of-Thought Reasoning Engine
 * 
 * Implements multi-step reasoning with:
 * - Step-by-step decomposition
 * - Self-consistency (multiple reasoning paths)
 * - Reflection and self-correction
 * - Tool use integration
 * 
 * @module ai/reasoning/chainOfThought
 */

import { logger } from '../../monitoring/logger.js';
import { sovereignLlmRouter } from '../../llm/sovereignRouter.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReasoningStep {
  stepNumber: number;
  thought: string;
  action?: string;
  observation?: string;
  confidence: number;
  timestamp: number;
}

export interface ChainOfThoughtResult {
  problem: string;
  steps: ReasoningStep[];
  finalAnswer: string;
  confidence: number;
  reasoningPath: string;
  toolCalls: ToolCall[];
  totalDuration: number;
  reflectionScore: number;
}

export interface ToolCall {
  tool: string;
  input: any;
  output: any;
  duration: number;
}

export interface Tool {
  name: string;
  description: string;
  execute: (input: any) => Promise<any>;
}

// ─── Chain-of-Thought Engine ───────────────────────────────────────────────

export class ChainOfThoughtEngine {
  private tools: Map<string, Tool> = new Map();
  private maxSteps: number;
  private minConfidence: number;

  constructor(options: { maxSteps?: number; minConfidence?: number } = {}) {
    this.maxSteps = options.maxSteps || 10;
    this.minConfidence = options.minConfidence || 0.7;
    this.registerDefaultTools();
  }

  /**
   * Register available tools for the engine
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Register default tools
   */
  private registerDefaultTools(): void {
    // Calculator tool
    this.registerTool({
      name: 'calculator',
      description: 'Perform mathematical calculations',
      execute: async (input: { expression: string }) => {
        try {
          // Safe evaluation of mathematical expressions
          const sanitized = input.expression.replace(/[^0-9+\-*/().\s]/g, '');
          const result = Function('"use strict"; return (' + sanitized + ')')();
          return { result, expression: sanitized };
        } catch (error) {
          return { error: 'Invalid expression' };
        }
      },
    });

    // Search tool (stub - would integrate with search API)
    this.registerTool({
      name: 'search',
      description: 'Search for information',
      execute: async (input: { query: string }) => {
        // In production, integrate with search API
        return { results: [], query: input.query };
      },
    });

    // Hedera token info tool (stub)
    this.registerTool({
      name: 'hedera_token_info',
      description: 'Get information about a Hedera token',
      execute: async (input: { tokenId: string }) => {
        // In production, query Hedera mirror node
        return { tokenId: input.tokenId, info: {} };
      },
    });
  }

  /**
   * Solve a problem using chain-of-thought reasoning
   */
  async solve(problem: string, context?: any): Promise<ChainOfThoughtResult> {
    const startTime = Date.now();
    const steps: ReasoningStep[] = [];
    const toolCalls: ToolCall[] = [];

    logger.info('ChainOfThought', { message: 'Starting reasoning', problem: problem.substring(0, 100) });

    try {
      // Step 1: Problem decomposition
      const decomposition = await this.decomposeProblem(problem, context);
      steps.push({
        stepNumber: 1,
        thought: decomposition,
        confidence: 0.8,
        timestamp: Date.now(),
      });

      // Step 2-9: Iterative reasoning
      let currentThought = decomposition;
      for (let i = 2; i <= this.maxSteps; i++) {
        const step = await this.generateStep(i, currentThought, problem, steps);
        steps.push(step);

        // Check for tool usage
        if (step.action) {
          const toolCall = await this.executeTool(step.action);
          if (toolCall) {
            toolCalls.push(toolCall);
            steps[steps.length - 1].observation = JSON.stringify(toolCall.output);
          }
        }

        // Check if we have an answer
        if (step.confidence >= this.minConfidence && this.isAnswerComplete(step.thought)) {
          break;
        }

        currentThought = step.thought;
      }

      // Step 10: Final synthesis with reflection
      const finalStep = await this.synthesizeAnswer(problem, steps);
      steps.push(finalStep);

      // Calculate reflection score
      const reflectionScore = await this.performReflection(steps);

      const result: ChainOfThoughtResult = {
        problem,
        steps,
        finalAnswer: finalStep.thought,
        confidence: finalStep.confidence,
        reasoningPath: this.buildReasoningPath(steps),
        toolCalls,
        totalDuration: Date.now() - startTime,
        reflectionScore,
      };

      logger.info('ChainOfThought', {
        message: 'Reasoning complete',
        steps: steps.length,
        confidence: result.confidence,
        duration: result.totalDuration,
      });

      return result;

    } catch (error) {
      logger.error('ChainOfThought', {
        message: 'Reasoning failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Decompose the problem into sub-problems
   */
  private async decomposeProblem(problem: string, context?: any): Promise<string> {
    const prompt = `Break down this problem into clear steps:

Problem: ${problem}

Context: ${context ? JSON.stringify(context) : 'None'}

Provide a step-by-step decomposition of how to solve this problem.`;

    const response = await sovereignLlmRouter.infer({
      prompt,
      systemPrompt: 'You are a problem decomposition expert. Break down complex problems into clear, logical steps.',
      temperature: 0.3,
      maxTokens: 512,
    });

    return response.content;
  }

  /**
   * Generate the next reasoning step
   */
  private async generateStep(
    stepNumber: number,
    previousThought: string,
    originalProblem: string,
    previousSteps: ReasoningStep[]
  ): Promise<ReasoningStep> {
    const stepHistory = previousSteps
      .map(s => `Step ${s.stepNumber}: ${s.thought}${s.observation ? `\nObservation: ${s.observation}` : ''}`)
      .join('\n\n');

    const prompt = `Original Problem: ${originalProblem}

Previous reasoning:
${stepHistory}

Current thought: ${previousThought}

What is the next logical step in solving this problem? 
If you need to use a tool (calculator, search, hedera_token_info), format your action as:
ACTION: tool_name|{"param": "value"}

Otherwise, continue reasoning.`;

    const response = await sovereignLlmRouter.infer({
      prompt,
      systemPrompt: 'You are a careful, step-by-step reasoner. Think through problems methodically. Only use tools when necessary.',
      temperature: 0.4,
      maxTokens: 256,
    });

    const content = response.content;
    
    // Check for tool action
    let action: string | undefined;
    const actionMatch = content.match(/ACTION:\s*(\w+)\|(\{.*?\})/);
    if (actionMatch) {
      action = `${actionMatch[1]}|${actionMatch[2]}`;
    }

    // Extract thought (remove action line)
    const thought = content.replace(/ACTION:.*?\n?/, '').trim();

    // Calculate confidence based on reasoning quality
    const confidence = this.calculateConfidence(thought, stepNumber);

    return {
      stepNumber,
      thought,
      action,
      confidence,
      timestamp: Date.now(),
    };
  }

  /**
   * Execute a tool call
   */
  private async executeTool(action: string): Promise<ToolCall | null> {
    const parts = action.split('|');
    if (parts.length !== 2) return null;

    const [toolName, inputJson] = parts;
    const tool = this.tools.get(toolName);
    if (!tool) return null;

    const startTime = Date.now();
    try {
      const input = JSON.parse(inputJson);
      const output = await tool.execute(input);
      
      return {
        tool: toolName,
        input,
        output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        tool: toolName,
        input: JSON.parse(inputJson),
        output: { error: error instanceof Error ? error.message : String(error) },
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Synthesize final answer from all steps
   */
  private async synthesizeAnswer(problem: string, steps: ReasoningStep[]): Promise<ReasoningStep> {
    const reasoningHistory = steps
      .map(s => `Step ${s.stepNumber}: ${s.thought}`)
      .join('\n');

    const prompt = `Based on the following reasoning steps:

${reasoningHistory}

Provide a clear, concise final answer to the original problem: ${problem}

Include the reasoning process briefly, then give the final answer.`;

    const response = await sovereignLlmRouter.infer({
      prompt,
      systemPrompt: 'You are a synthesis expert. Combine reasoning steps into a clear, accurate final answer.',
      temperature: 0.3,
      maxTokens: 512,
    });

    return {
      stepNumber: steps.length + 1,
      thought: response.content,
      confidence: this.calculateConfidence(response.content, steps.length + 1),
      timestamp: Date.now(),
    };
  }

  /**
   * Perform self-reflection on the reasoning process
   */
  private async performReflection(steps: ReasoningStep[]): Promise<number> {
    const reasoningPath = this.buildReasoningPath(steps);
    
    const prompt = `Review this reasoning process:

${reasoningPath}

Identify any errors, gaps, or areas where the reasoning could be improved.
Rate the overall quality from 0.0 to 1.0.`;

    try {
      const response = await sovereignLlmRouter.infer({
        prompt,
        systemPrompt: 'You are a critical reviewer. Identify flaws in reasoning and provide an objective quality score.',
        temperature: 0.3,
        maxTokens: 256,
      });

      // Extract score
      const scoreMatch = response.content.match(/(\d+\.?\d*)/);
      if (scoreMatch) {
        return Math.min(1, Math.max(0, parseFloat(scoreMatch[1])));
      }
    } catch {
      // If reflection fails, use average step confidence
    }

    // Fallback: average confidence
    const avgConfidence = steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length;
    return avgConfidence;
  }

  /**
   * Build human-readable reasoning path
   */
  private buildReasoningPath(steps: ReasoningStep[]): string {
    return steps
      .map(s => {
        let line = `Step ${s.stepNumber}: ${s.thought}`;
        if (s.action) line += `\n  → Action: ${s.action}`;
        if (s.observation) line += `\n  ← Observation: ${s.observation}`;
        return line;
      })
      .join('\n\n');
  }

  /**
   * Check if the reasoning has reached a conclusion
   */
  private isAnswerComplete(thought: string): boolean {
    const completionIndicators = [
      'therefore',
      'in conclusion',
      'final answer',
      'the answer is',
      'result:',
    ];
    const lower = thought.toLowerCase();
    return completionIndicators.some(indicator => lower.includes(indicator));
  }

  /**
   * Calculate confidence score for a step
   */
  private calculateConfidence(thought: string, stepNumber: number): number {
    let score = 0.7;

    // Longer reasoning tends to be more confident
    if (thought.length > 100) score += 0.1;

    // Indicators of certainty
    const certaintyWords = ['definitely', 'certainly', 'clearly', 'obviously'];
    const uncertaintyWords = ['maybe', 'perhaps', 'possibly', 'might', 'could'];
    
    const lower = thought.toLowerCase();
    certaintyWords.forEach(word => { if (lower.includes(word)) score += 0.05; });
    uncertaintyWords.forEach(word => { if (lower.includes(word)) score -= 0.1; });

    // Later steps should be more confident
    score += Math.min(0.1, stepNumber * 0.01);

    return Math.min(1, Math.max(0, score));
  }
}

// ─── Self-Consistency Engine ─────────────────────────────────────────────────

export class SelfConsistencyEngine {
  private chainOfThought: ChainOfThoughtEngine;
  private numSamples: number;

  constructor(options: { numSamples?: number } = {}) {
    this.chainOfThought = new ChainOfThoughtEngine();
    this.numSamples = options.numSamples || 5;
  }

  /**
   * Solve with self-consistency: multiple samples, majority vote
   */
  async solveWithConsistency(problem: string, context?: any): Promise<{
    answer: string;
    confidence: number;
    votes: number;
    totalSamples: number;
    allResults: ChainOfThoughtResult[];
  }> {
    logger.info('SelfConsistency', {
      message: 'Starting self-consistency reasoning',
      samples: this.numSamples,
    });

    // Generate multiple reasoning paths
    const results: ChainOfThoughtResult[] = [];
    for (let i = 0; i < this.numSamples; i++) {
      const result = await this.chainOfThought.solve(problem, context);
      results.push(result);
    }

    // Extract answers and count votes
    const answerCounts = new Map<string, number>();
    results.forEach(r => {
      const simplified = this.simplifyAnswer(r.finalAnswer);
      const count = answerCounts.get(simplified) || 0;
      answerCounts.set(simplified, count + 1);
    });

    // Find majority answer
    let bestAnswer = '';
    let bestVotes = 0;
    answerCounts.forEach((votes, answer) => {
      if (votes > bestVotes) {
        bestVotes = votes;
        bestAnswer = answer;
      }
    });

    const confidence = bestVotes / this.numSamples;

    logger.info('SelfConsistency', {
      message: 'Voting complete',
      bestVotes,
      totalSamples: this.numSamples,
      confidence,
    });

    return {
      answer: bestAnswer,
      confidence,
      votes: bestVotes,
      totalSamples: this.numSamples,
      allResults: results,
    };
  }

  /**
   * Simplify answer for comparison (remove reasoning, keep core)
   */
  private simplifyAnswer(answer: string): string {
    // Extract final answer section
    const finalMatch = answer.match(/(?:final answer|the answer is|result:)\s*:?\s*(.+)/i);
    if (finalMatch) {
      return finalMatch[1].trim().toLowerCase();
    }
    
    // If no explicit final answer, take last sentence
    const sentences = answer.split(/[.!?]+/);
    return sentences[sentences.length - 2]?.trim().toLowerCase() || answer.toLowerCase();
  }
}

// ─── Singleton Exports ─────────────────────────────────────────────────────

export const chainOfThought = new ChainOfThoughtEngine();
export const selfConsistency = new SelfConsistencyEngine();
export default chainOfThought;
