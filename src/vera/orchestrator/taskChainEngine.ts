/**
 * Vera Task Chain Engine
 * DAG-based task pipelines — an agent's result automatically triggers follow-up tasks.
 *
 * Features:
 * - Define chains as directed acyclic graphs (nodes = tasks, edges = dependencies)
 * - Partial rollback on step failure (compensating tasks)
 * - Aggregate billing across an entire chain
 * - Chain-level timeout and retry policies
 * - HCS audit trail per chain
 *
 * Use case: "Analyze token → price it → list it" as a single chain.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../../monitoring/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChainStepStatus =
  | 'pending'      // waiting for dependencies
  | 'ready'        // dependencies satisfied, awaiting dispatch
  | 'dispatched'   // task published to HCS
  | 'completed'    // agent delivered accepted result
  | 'failed'       // verification failed or timeout
  | 'rolled_back'; // compensating action executed

export type ChainStatus =
  | 'created'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rolling_back'
  | 'rolled_back';

export interface ChainStepDef {
  stepId: string;
  serviceType: string;
  description: string;
  budget: number;                    // HBAR allocation for this step
  dependsOn: string[];               // stepIds that must complete first
  timeout?: number;                  // per-step timeout ms (default: 5 min)
  retries?: number;                  // max retries for this step (default: 1)
  compensate?: {                     // optional rollback task on chain failure
    serviceType: string;
    description: string;
  };
  metadata?: Record<string, unknown>;
}

export interface ChainDef {
  chainId?: string;
  name: string;
  steps: ChainStepDef[];
  totalBudget?: number;              // override sum of step budgets
  timeoutMs?: number;                // chain-level timeout (default: 30 min)
  metadata?: Record<string, unknown>;
}

export interface ChainStep extends ChainStepDef {
  status: ChainStepStatus;
  taskId?: string;                   // orchestrator taskId once dispatched
  agentId?: string;                  // winning agent
  result?: unknown;                  // agent result payload
  error?: string;
  attempts: number;
  startedAt?: number;
  completedAt?: number;
}

export interface Chain {
  chainId: string;
  name: string;
  status: ChainStatus;
  steps: Map<string, ChainStep>;
  totalBudget: number;
  spent: number;
  timeoutMs: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  metadata: Record<string, unknown>;
}

export interface ChainResult {
  chainId: string;
  status: ChainStatus;
  steps: Array<{
    stepId: string;
    status: ChainStepStatus;
    taskId?: string;
    agentId?: string;
    result?: unknown;
    error?: string;
  }>;
  totalSpent: number;
  durationMs: number;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class TaskChainEngine extends EventEmitter {
  private chains: Map<string, Chain> = new Map();
  private stepToChain: Map<string, string> = new Map(); // taskId → chainId
  private tickTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Callback that the orchestrator provides to actually publish a task
  private publishTask: ((intent: {
    taskId: string;
    description: string;
    serviceType: string;
    budget: number;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>) | null = null;

  constructor() {
    super();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(publishTask: TaskChainEngine['publishTask']): void {
    if (this.isRunning) return;
    this.publishTask = publishTask;
    this.isRunning = true;

    // Tick every 5 s to check timeouts and advance ready steps
    this.tickTimer = setInterval(() => this.tick(), 5_000);

    logger.info('TaskChainEngine', { message: 'Started' });
  }

  stop(): void {
    this.isRunning = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    logger.info('TaskChainEngine', { message: 'Stopped' });
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Create and start a new chain.
   * Validates the DAG (no cycles), calculates budget, dispatches root steps.
   */
  async createChain(def: ChainDef): Promise<Chain> {
    const chainId = def.chainId || `chain-${randomUUID().slice(0, 8)}`;

    // Validate DAG — detect cycles
    this.validateDAG(def.steps);

    const steps = new Map<string, ChainStep>();
    let totalBudget = 0;

    for (const stepDef of def.steps) {
      steps.set(stepDef.stepId, {
        ...stepDef,
        status: 'pending',
        attempts: 0,
      });
      totalBudget += stepDef.budget;
    }

    const chain: Chain = {
      chainId,
      name: def.name,
      status: 'created',
      steps,
      totalBudget: def.totalBudget ?? totalBudget,
      spent: 0,
      timeoutMs: def.timeoutMs ?? 30 * 60 * 1000,
      createdAt: Date.now(),
      metadata: def.metadata ?? {},
    };

    this.chains.set(chainId, chain);

    logger.info('TaskChainEngine', {
      message: 'Chain created',
      chainId,
      name: def.name,
      steps: def.steps.length,
      totalBudget: chain.totalBudget,
    });

    // Start the chain — dispatch root steps (no dependencies)
    await this.advanceChain(chain);

    return chain;
  }

  /**
   * Called by the orchestrator when a task belonging to a chain completes.
   */
  async onTaskCompleted(taskId: string, agentId: string, result: unknown): Promise<void> {
    const chainId = this.stepToChain.get(taskId);
    if (!chainId) return; // not part of a chain

    const chain = this.chains.get(chainId);
    if (!chain) return;

    // Find the step
    const step = this.findStepByTaskId(chain, taskId);
    if (!step) return;

    step.status = 'completed';
    step.agentId = agentId;
    step.result = result;
    step.completedAt = Date.now();
    chain.spent += step.budget;

    logger.info('TaskChainEngine', {
      message: 'Chain step completed',
      chainId,
      stepId: step.stepId,
      agentId,
    });

    this.emit('step_completed', { chainId, stepId: step.stepId, agentId, result });

    // Advance the chain — dispatch newly-ready steps or finalize
    await this.advanceChain(chain);
  }

  /**
   * Called by the orchestrator when a task belonging to a chain fails.
   */
  async onTaskFailed(taskId: string, error: string): Promise<void> {
    const chainId = this.stepToChain.get(taskId);
    if (!chainId) return;

    const chain = this.chains.get(chainId);
    if (!chain) return;

    const step = this.findStepByTaskId(chain, taskId);
    if (!step) return;

    step.attempts++;
    const maxRetries = step.retries ?? 1;

    if (step.attempts < maxRetries) {
      // Retry: re-dispatch this step
      step.status = 'ready';
      step.taskId = undefined;
      logger.info('TaskChainEngine', {
        message: 'Retrying chain step',
        chainId,
        stepId: step.stepId,
        attempt: step.attempts,
        maxRetries,
      });
      await this.dispatchStep(chain, step);
    } else {
      // Exhausted retries — fail step and begin rollback
      step.status = 'failed';
      step.error = error;

      logger.warn('TaskChainEngine', {
        message: 'Chain step failed permanently',
        chainId,
        stepId: step.stepId,
        error,
      });

      this.emit('step_failed', { chainId, stepId: step.stepId, error });
      await this.rollbackChain(chain, step.stepId);
    }
  }

  /**
   * Get chain status.
   */
  getChain(chainId: string): Chain | undefined {
    return this.chains.get(chainId);
  }

  /**
   * Get chain result summary.
   */
  getChainResult(chainId: string): ChainResult | null {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    return {
      chainId,
      status: chain.status,
      steps: Array.from(chain.steps.values()).map(s => ({
        stepId: s.stepId,
        status: s.status,
        taskId: s.taskId,
        agentId: s.agentId,
        result: s.result,
        error: s.error,
      })),
      totalSpent: chain.spent,
      durationMs: (chain.completedAt ?? Date.now()) - chain.createdAt,
    };
  }

  /**
   * List all active chains.
   */
  getActiveChains(): ChainResult[] {
    return Array.from(this.chains.values())
      .filter(c => c.status === 'running' || c.status === 'rolling_back')
      .map(c => this.getChainResult(c.chainId)!);
  }

  /**
   * Get engine statistics.
   */
  getStats() {
    const chains = Array.from(this.chains.values());
    return {
      totalChains: chains.length,
      running: chains.filter(c => c.status === 'running').length,
      completed: chains.filter(c => c.status === 'completed').length,
      failed: chains.filter(c => c.status === 'failed' || c.status === 'rolled_back').length,
      totalSpent: chains.reduce((s, c) => s + c.spent, 0),
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * Advance a chain: mark newly-ready steps and dispatch them,
   * or finalize if all steps are done.
   */
  private async advanceChain(chain: Chain): Promise<void> {
    if (chain.status === 'rolling_back' || chain.status === 'rolled_back' || chain.status === 'failed') {
      return;
    }

    if (chain.status === 'created') {
      chain.status = 'running';
      chain.startedAt = Date.now();
    }

    // Find steps whose dependencies are all completed
    for (const step of chain.steps.values()) {
      if (step.status !== 'pending') continue;

      const depsReady = step.dependsOn.every(depId => {
        const dep = chain.steps.get(depId);
        return dep?.status === 'completed';
      });

      if (depsReady) {
        step.status = 'ready';
        await this.dispatchStep(chain, step);
      }
    }

    // Check if chain is complete
    const allDone = Array.from(chain.steps.values()).every(
      s => s.status === 'completed' || s.status === 'rolled_back'
    );

    if (allDone && chain.status === 'running') {
      chain.status = 'completed';
      chain.completedAt = Date.now();

      logger.info('TaskChainEngine', {
        message: 'Chain completed',
        chainId: chain.chainId,
        spent: chain.spent,
        durationMs: chain.completedAt - chain.createdAt,
      });

      this.emit('chain_completed', this.getChainResult(chain.chainId));
    }
  }

  /**
   * Dispatch a single step by publishing it as a task through the orchestrator.
   * Routes through Flower of Life OS center for Pillar 1 enforcement.
   */
  private async dispatchStep(chain: Chain, step: ChainStep): Promise<void> {
    if (!this.publishTask) {
      logger.error('TaskChainEngine', { message: 'No publishTask callback registered' });
      return;
    }

    // ─── Center-Routed Chain Dispatch ─────────────────────────────────────
    // Route dispatch through center-0 for Pillar 1 enforcement
    const { flowerOfLifeOS } = await import('./flowerOfLifeOS.js');
    const centerRoutedDecision = flowerOfLifeOS.centerRoute({
      type: 'chain_dispatch',
      sourceNodeId: 'center-0',
      data: {
        chainId: chain.chainId,
        stepId: step.stepId,
        serviceType: step.serviceType,
        budget: step.budget,
        dependsOn: step.dependsOn,
      },
    });

    // Build metadata with chain context and results from dependencies
    const depResults: Record<string, unknown> = {};
    for (const depId of step.dependsOn) {
      const dep = chain.steps.get(depId);
      if (dep?.result) depResults[depId] = dep.result;
    }

    const taskId = `${chain.chainId}:${step.stepId}:${step.attempts}`;
    step.taskId = taskId;
    step.status = 'dispatched';
    step.startedAt = Date.now();

    // Map taskId back to chain
    this.stepToChain.set(taskId, chain.chainId);

    try {
      await this.publishTask({
        taskId,
        description: step.description,
        serviceType: step.serviceType,
        budget: step.budget,
        metadata: {
          ...step.metadata,
          chainId: chain.chainId,
          stepId: step.stepId,
          attempt: step.attempts,
          dependencyResults: depResults,
          // Center routing metadata
          centerRouted: true,
          centerEnergy: centerRoutedDecision.centerEnergy,
          centerPath: centerRoutedDecision.path,
          centerHops: centerRoutedDecision.hops,
        },
      });

      logger.info('TaskChainEngine', {
        message: 'Chain step center-routed and dispatched',
        chainId: chain.chainId,
        stepId: step.stepId,
        taskId,
        centerEnergy: centerRoutedDecision.centerEnergy.toFixed(4),
        hops: centerRoutedDecision.hops,
      });

      this.emit('step_dispatched', { chainId: chain.chainId, stepId: step.stepId, taskId, centerRouted: true });
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : String(error);

      logger.error('TaskChainEngine', {
        message: 'Failed to dispatch chain step',
        chainId: chain.chainId,
        stepId: step.stepId,
        error: step.error,
      });
    }
  }

  /**
   * Roll back completed steps in reverse topological order.
   * Only steps with a `compensate` definition get rolled back.
   */
  private async rollbackChain(chain: Chain, failedStepId: string): Promise<void> {
    chain.status = 'rolling_back';

    logger.info('TaskChainEngine', {
      message: 'Starting chain rollback',
      chainId: chain.chainId,
      failedStep: failedStepId,
    });

    this.emit('chain_rolling_back', { chainId: chain.chainId, failedStep: failedStepId });

    // Get completed steps in reverse topological order
    const completedSteps = Array.from(chain.steps.values())
      .filter(s => s.status === 'completed' && s.compensate)
      .reverse();

    for (const step of completedSteps) {
      if (!step.compensate || !this.publishTask) continue;

      try {
        const compTaskId = `${chain.chainId}:rollback-${step.stepId}`;
        this.stepToChain.set(compTaskId, chain.chainId);

        await this.publishTask({
          taskId: compTaskId,
          description: step.compensate.description,
          serviceType: step.compensate.serviceType,
          budget: 0, // compensating tasks are free (absorbed by chain budget)
          metadata: {
            chainId: chain.chainId,
            stepId: step.stepId,
            compensating: true,
            originalResult: step.result,
          },
        });

        step.status = 'rolled_back';
        logger.info('TaskChainEngine', {
          message: 'Compensating task dispatched',
          chainId: chain.chainId,
          stepId: step.stepId,
        });
      } catch (error) {
        logger.error('TaskChainEngine', {
          message: 'Compensating task failed',
          chainId: chain.chainId,
          stepId: step.stepId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    chain.status = 'rolled_back';
    chain.completedAt = Date.now();

    logger.info('TaskChainEngine', {
      message: 'Chain rollback completed',
      chainId: chain.chainId,
    });

    this.emit('chain_rolled_back', this.getChainResult(chain.chainId));
  }

  /**
   * Periodic tick: check for step timeouts and chain-level timeouts.
   */
  private tick(): void {
    const now = Date.now();

    for (const chain of this.chains.values()) {
      if (chain.status !== 'running') continue;

      // Chain-level timeout
      if (chain.startedAt && now - chain.startedAt > chain.timeoutMs) {
        logger.warn('TaskChainEngine', {
          message: 'Chain timed out',
          chainId: chain.chainId,
        });
        void this.rollbackChain(chain, '__timeout__');
        continue;
      }

      // Step-level timeouts
      for (const step of chain.steps.values()) {
        if (step.status !== 'dispatched' || !step.startedAt) continue;

        const stepTimeout = step.timeout ?? 5 * 60 * 1000;
        if (now - step.startedAt > stepTimeout) {
          logger.warn('TaskChainEngine', {
            message: 'Chain step timed out',
            chainId: chain.chainId,
            stepId: step.stepId,
          });
          void this.onTaskFailed(step.taskId!, 'Step timed out');
        }
      }
    }
  }

  /**
   * Find a step by its dispatched taskId.
   */
  private findStepByTaskId(chain: Chain, taskId: string): ChainStep | undefined {
    for (const step of chain.steps.values()) {
      if (step.taskId === taskId) return step;
    }
    return undefined;
  }

  /**
   * Validate that the step definitions form a DAG (no cycles).
   */
  private validateDAG(steps: ChainStepDef[]): void {
    const ids = new Set(steps.map(s => s.stepId));
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const dfs = (id: string) => {
      if (visiting.has(id)) throw new Error(`Cycle detected in chain at step "${id}"`);
      if (visited.has(id)) return;

      visiting.add(id);

      const step = steps.find(s => s.stepId === id);
      if (!step) throw new Error(`Unknown dependency step "${id}"`);

      for (const dep of step.dependsOn) {
        if (!ids.has(dep)) throw new Error(`Step "${id}" depends on unknown step "${dep}"`);
        dfs(dep);
      }

      visiting.delete(id);
      visited.add(id);
    };

    for (const step of steps) dfs(step.stepId);
  }
}

// Singleton
export const taskChainEngine = new TaskChainEngine();
