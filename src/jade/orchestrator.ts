/**
 * Jade Orchestrator
 * 
 * Central coordination system for all agent execution.
 * Consolidates executor, runner, and planner into a unified orchestration layer.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logger } from '../monitoring/logger.js';
import { executeTool } from '../agent/executor.js';
import { runSubAgent, SubAgentRole } from '../agent/subAgent.js';
import type { ChatMessage } from '../agent/runner.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExecutionContext {
  sessionId: string;
  userId?: string;
  requestId: string;
  startTime: number;
  metadata: Record<string, unknown>;
}

export interface ExecutionResult {
  success: boolean;
  result: unknown;
  durationMs: number;
  toolCalls: string[];
  subAgents: string[];
  errors: string[];
}

export interface QueuedTask {
  id: string;
  priority: number;
  type: 'tool' | 'subagent' | 'plan';
  payload: unknown;
  context: ExecutionContext;
  resolve: (value: ExecutionResult) => void;
  reject: (reason: Error) => void;
}

// ─── Circuit Breaker ────────────────────────────────────────────────────────

class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold = 5,
    private timeoutMs = 30000
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.timeoutMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}

// ─── Execution Queue ───────────────────────────────────────────────────────

class ExecutionQueue {
  private queue: QueuedTask[] = [];
  private running = 0;
  private maxConcurrency = 3;
  
  constructor(private orchestrator: JadeOrchestrator) {}
  
  enqueue(task: QueuedTask): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
      this.queue.push(task);
      this.queue.sort((a, b) => b.priority - a.priority);
      this.processQueue();
    });
  }
  
  private async processQueue() {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }
    
    const task = this.queue.shift();
    if (!task) return;
    
    this.running++;
    
    try {
      const result = await this.executeTask(task);
      task.resolve(result);
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.running--;
      this.processQueue();
    }
  }
  
  private async executeTask(task: QueuedTask): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      switch (task.type) {
        case 'tool':
          return await this.executeToolTask(task);
        case 'subagent':
          return await this.executeSubAgentTask(task);
        case 'plan':
          return await this.executePlanTask(task);
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
    } catch (error) {
      return {
        success: false,
        result: null,
        durationMs: Date.now() - startTime,
        toolCalls: [],
        subAgents: [],
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
  
  private async executeToolTask(task: QueuedTask): Promise<ExecutionResult> {
    const payload = task.payload as { tool: string; args: Record<string, unknown> };
    const startTime = Date.now();
    
    const result = await this.orchestrator.circuitBreaker.execute(
      () => executeTool(payload.tool, payload.args)
    );
    
    return {
      success: !result.includes('"error"'),
      result,
      durationMs: Date.now() - startTime,
      toolCalls: [payload.tool],
      subAgents: [],
      errors: result.includes('"error"') ? [result] : [],
    };
  }
  
  private async executeSubAgentTask(task: QueuedTask): Promise<ExecutionResult> {
    const payload = task.payload as { role: SubAgentRole; task: string; context?: string };
    const startTime = Date.now();
    
    const result = await runSubAgent({
      role: payload.role,
      task: payload.task,
      context: payload.context,
    });
    
    return {
      success: !result.result.includes('error'),
      result,
      durationMs: Date.now() - startTime,
      toolCalls: result.tools_called,
      subAgents: [payload.role],
      errors: [],
    };
  }
  
  private async executePlanTask(task: QueuedTask): Promise<ExecutionResult> {
    // Delegate to planner runner
    const { runPlannerAgentStream } = await import('../agent/plannerRunner.js');
    const payload = task.payload as { messages: ChatMessage[] };
    
    const results: unknown[] = [];
    const toolCalls: string[] = [];
    
    for await (const event of runPlannerAgentStream(payload.messages)) {
      if (event.type === 'tool_use') {
        toolCalls.push(event.name);
      }
      results.push(event);
    }
    
    return {
      success: true,
      result: results,
      durationMs: Date.now() - task.context.startTime,
      toolCalls,
      subAgents: [],
      errors: [],
    };
  }
}

// ─── Jade Orchestrator ─────────────────────────────────────────────────────

export class JadeOrchestrator {
  private queue: ExecutionQueue;
  circuitBreaker = new CircuitBreaker();
  private metrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageDurationMs: 0,
  };
  
  constructor() {
    this.queue = new ExecutionQueue(this);
  }
  
  /**
   * Execute a tool with circuit breaker and queuing
   */
  async executeTool(
    tool: string,
    args: Record<string, unknown>,
    context: Partial<ExecutionContext> = {}
  ): Promise<ExecutionResult> {
    const execContext: ExecutionContext = {
      sessionId: context.sessionId || this.generateId(),
      requestId: this.generateId(),
      startTime: Date.now(),
      metadata: context.metadata || {},
      ...context,
    };
    
    return this.queue.enqueue({
      id: this.generateId(),
      priority: 1,
      type: 'tool',
      payload: { tool, args },
      context: execContext,
      resolve: () => {},
      reject: () => {},
    });
  }
  
  /**
   * Spawn a sub-agent with queuing
   */
  async spawnAgent(
    role: SubAgentRole,
    task: string,
    context?: string,
    execContext: Partial<ExecutionContext> = {}
  ): Promise<ExecutionResult> {
    const executionContext: ExecutionContext = {
      sessionId: execContext.sessionId || this.generateId(),
      requestId: this.generateId(),
      startTime: Date.now(),
      metadata: execContext.metadata || {},
      ...execContext,
    };
    
    return this.queue.enqueue({
      id: this.generateId(),
      priority: 2, // Sub-agents have higher priority
      type: 'subagent',
      payload: { role, task, context },
      context: executionContext,
      resolve: () => {},
      reject: () => {},
    });
  }
  
  /**
   * Execute a multi-step plan
   */
  async executePlan(
    messages: Array<{ role: string; content: string }>,
    context: Partial<ExecutionContext> = {}
  ): Promise<ExecutionResult> {
    const execContext: ExecutionContext = {
      sessionId: context.sessionId || this.generateId(),
      requestId: this.generateId(),
      startTime: Date.now(),
      metadata: context.metadata || {},
      ...context,
    };
    
    return this.queue.enqueue({
      id: this.generateId(),
      priority: 1,
      type: 'plan',
      payload: { messages },
      context: execContext,
      resolve: () => {},
      reject: () => {},
    });
  }
  
  /**
   * Chain multiple sub-agents sequentially
   */
  async chainAgents(
    agents: Array<{ role: SubAgentRole; task: string; transform?: (prev: unknown) => string }>,
    initialContext?: string
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    let context = initialContext;
    
    for (const agent of agents) {
      const result = await this.spawnAgent(agent.role, agent.task, context);
      results.push(result);
      
      if (agent.transform && result.success) {
        context = agent.transform(result.result);
      }
    }
    
    return results;
  }
  
  /**
   * Get orchestrator metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
  
  /**
   * Update metrics after execution
   */
  private updateMetrics(result: ExecutionResult) {
    this.metrics.totalExecutions++;
    if (result.success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }
    
    // Rolling average
    this.metrics.averageDurationMs = 
      (this.metrics.averageDurationMs * (this.metrics.totalExecutions - 1) + result.durationMs) 
      / this.metrics.totalExecutions;
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const jadeOrchestrator = new JadeOrchestrator();

// ─── Fastify Routes ────────────────────────────────────────────────────────

export async function registerJadeRoutes(app: FastifyInstance) {
  /**
   * POST /jade/execute/tool
   * Execute a single tool
   */
  app.post('/jade/execute/tool', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      tool: z.string(),
      args: z.record(z.any()).default({}),
      priority: z.number().default(1),
    });
    
    try {
      const body = schema.parse(req.body);
      const result = await jadeOrchestrator.executeTool(body.tool, body.args);
      return reply.send(result);
    } catch (error) {
      logger.error('Jade', { error, message: 'Tool execution failed' });
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  /**
   * POST /jade/execute/agent
   * Spawn a sub-agent
   */
  app.post('/jade/execute/agent', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      role: z.enum(['researcher', 'analyst', 'coder', 'critic', 'planner']),
      task: z.string(),
      context: z.string().optional(),
    });
    
    try {
      const body = schema.parse(req.body);
      const result = await jadeOrchestrator.spawnAgent(
        body.role as SubAgentRole,
        body.task,
        body.context
      );
      return reply.send(result);
    } catch (error) {
      logger.error('Jade', { error, message: 'Sub-agent execution failed' });
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  /**
   * POST /jade/execute/chain
   * Chain multiple sub-agents
   */
  app.post('/jade/execute/chain', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      agents: z.array(z.object({
        role: z.enum(['researcher', 'analyst', 'coder', 'critic', 'planner']),
        task: z.string(),
      })),
      initialContext: z.string().optional(),
    });
    
    try {
      const body = schema.parse(req.body);
      const results = await jadeOrchestrator.chainAgents(
        body.agents as Array<{ role: SubAgentRole; task: string }>,
        body.initialContext
      );
      return reply.send({ success: true, results });
    } catch (error) {
      logger.error('Jade', { error, message: 'Agent chain execution failed' });
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  /**
   * GET /jade/metrics
   * Get orchestrator metrics
   */
  app.get('/jade/metrics', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      metrics: jadeOrchestrator.getMetrics(),
    });
  });
  
  logger.info('Jade', { message: 'Jade orchestrator routes registered' });
}
