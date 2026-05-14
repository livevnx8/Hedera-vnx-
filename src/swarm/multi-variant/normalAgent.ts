/**
 * Normal Swarm Agent - Processing Layer
 * 
 * Specialized for standard workload processing and coordination
 * - 60% Tier-1 Executors
 * - 30% Tier-2 Analysts
 * - 10% Tier-3 Planners
 */

import { BaseSwarmAgent, AgentConfig, Task } from './baseSwarmAgent.js';
import { logger } from '../../monitoring/logger.js';

export interface Workflow {
  id: string;
  steps: WorkflowStep[];
  currentStep: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  result?: any;
}

export interface WorkflowStep {
  id: string;
  type: string;
  payload: any;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export class NormalAgent extends BaseSwarmAgent {
  private workflows: Map<string, Workflow> = new Map();
  private taskQueue: Task[] = [];
  private maxQueueSize: number = 1000;
  private processingIntervalMs: number = 100;
  private processingTimer: NodeJS.Timeout | null = null;
  private workflowsCompleted: number = 0;
  private workflowsFailed: number = 0;

  constructor(config: AgentConfig) {
    super({
      ...config,
      swarmClass: 'normal',
      timeoutMs: 1000, // 1 second timeout for normal operations
      maxConcurrentTasks: 5 // Moderate concurrency for workflows
    });

    this.startProcessingLoop();
  }

  /**
   * Execute task based on role
   */
  protected async executeTask(task: Task): Promise<void> {
    const startTime = Date.now();

    try {
      switch (this.config.role) {
        case 'executor':
          await this.executeWorkflowTask(task);
          break;
        case 'analyst':
          await this.executeAggregationTask(task);
          break;
        case 'planner':
          await this.executeOrchestrationTask(task);
          break;
      }

      const duration = Date.now() - startTime;
      this.handleTaskCompletion(task, { duration, success: true });

    } catch (error) {
      throw error;
    }
  }

  /**
   * Tier-1: Execute workflow task
   */
  private async executeWorkflowTask(task: Task): Promise<void> {
    const workflow = task.payload as Workflow;
    
    if (!workflow || !workflow.steps) {
      throw new Error('Invalid workflow payload');
    }

    // Execute workflow steps
    for (const step of workflow.steps) {
      if (step.status === 'pending' && this.canExecuteStep(step, workflow)) {
        await this.executeStep(step, workflow);
      }
    }

    // Check workflow completion
    const allCompleted = workflow.steps.every(s => s.status === 'completed');
    const anyFailed = workflow.steps.some(s => s.status === 'failed');

    if (allCompleted) {
      workflow.status = 'completed';
      workflow.completedAt = Date.now();
      this.workflowsCompleted++;
    } else if (anyFailed) {
      workflow.status = 'failed';
      this.workflowsFailed++;
    }

    this.workflows.set(workflow.id, workflow);

    logger.debug('NormalAgent', {
      agentId: this.config.id,
      workflowId: workflow.id,
      status: workflow.status,
      stepsCompleted: workflow.steps.filter(s => s.status === 'completed').length,
      message: 'Workflow task executed'
    });
  }

  /**
   * Check if a workflow step can be executed
   */
  private canExecuteStep(step: WorkflowStep, workflow: Workflow): boolean {
    // Check if all dependencies are completed
    return step.dependencies.every(depId => {
      const depStep = workflow.steps.find(s => s.id === depId);
      return depStep && depStep.status === 'completed';
    });
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(step: WorkflowStep, workflow: Workflow): Promise<void> {
    step.status = 'running';

    try {
      // Simulate step execution
      await new Promise(resolve => setTimeout(resolve, 50));

      // Process based on step type
      switch (step.type) {
        case 'verification':
          step.result = await this.executeVerification(step.payload);
          break;
        case 'transfer':
          step.result = await this.executeTransfer(step.payload);
          break;
        case 'analysis':
          step.result = await this.executeAnalysis(step.payload);
          break;
        default:
          step.result = { success: true, type: step.type };
      }

      step.status = 'completed';

    } catch (error) {
      step.status = 'failed';
      step.error = (error as Error).message;
      throw error;
    }
  }

  /**
   * Execute verification step
   */
  private async executeVerification(payload: any): Promise<any> {
    // Simulate carbon credit verification
    const { projectId, carbonTons } = payload;
    
    logger.debug('NormalAgent', {
      agentId: this.config.id,
      projectId,
      carbonTons,
      message: 'Executing verification'
    });

    return {
      verified: true,
      confidence: 0.95,
      projectId,
      carbonTons,
      timestamp: Date.now()
    };
  }

  /**
   * Execute transfer step
   */
  private async executeTransfer(payload: any): Promise<any> {
    const { from, to, amount, tokenId } = payload;
    
    logger.debug('NormalAgent', {
      agentId: this.config.id,
      from,
      to,
      amount,
      tokenId: tokenId || 'HBAR',
      message: 'Executing transfer'
    });

    return {
      success: true,
      transactionId: `tx-${Date.now()}`,
      from,
      to,
      amount
    };
  }

  /**
   * Execute analysis step
   */
  private async executeAnalysis(payload: any): Promise<any> {
    const { data, analysisType } = payload;
    
    logger.debug('NormalAgent', {
      agentId: this.config.id,
      analysisType,
      dataSize: JSON.stringify(data).length,
      message: 'Executing analysis'
    });

    // Simple analysis simulation
    return {
      analysisType,
      result: 'completed',
      insights: ['insight-1', 'insight-2'],
      timestamp: Date.now()
    };
  }

  /**
   * Tier-2: Execute aggregation task
   */
  private async executeAggregationTask(task: Task): Promise<void> {
    const { source, data, aggregationType } = task.payload;
    
    if (!data || !Array.isArray(data)) {
      throw new Error('Invalid aggregation data');
    }

    // Perform meet operation on data
    const meetResult = this.performMeetAggregation(data);
    
    // Perform join operation on data
    const joinResult = this.performJoinAggregation(data);

    logger.debug('NormalAgent', {
      agentId: this.config.id,
      source,
      aggregationType,
      dataCount: data.length,
      meetScore: meetResult.score,
      joinCoverage: joinResult.coverage,
      message: 'Aggregation task executed'
    });

    // Store results
    task.payload.result = {
      meet: meetResult,
      join: joinResult,
      timestamp: Date.now()
    };
  }

  /**
   * Perform meet aggregation (intersection)
   */
  private performMeetAggregation(data: any[]): { score: number; common: any[] } {
    if (data.length === 0) return { score: 0, common: [] };
    if (data.length === 1) return { score: 1, common: data[0] };

    // Find common elements
    const first = new Set(data[0]);
    const common = data.slice(1).reduce((acc, curr) => {
      const currSet = new Set(curr);
      return acc.filter(x => currSet.has(x));
    }, Array.from(first));

    const score = common.length / Math.max(...data.map(d => d.length));

    return { score, common };
  }

  /**
   * Perform join aggregation (union)
   */
  private performJoinAggregation(data: any[]): { coverage: number; union: any[] } {
    if (data.length === 0) return { coverage: 0, union: [] };

    const union = [...new Set(data.flat())];
    const totalUnique = union.length;
    const avgSize = data.reduce((sum, d) => sum + d.length, 0) / data.length;
    const coverage = Math.min(1, totalUnique / (avgSize * data.length));

    return { coverage, union };
  }

  /**
   * Tier-3: Execute orchestration task
   */
  private async executeOrchestrationTask(task: Task): Promise<void> {
    const { action, targets, strategy } = task.payload;
    
    logger.info('NormalAgent', {
      agentId: this.config.id,
      action,
      targetCount: targets?.length || 0,
      strategy,
      message: 'Orchestration task executed'
    });

    // In production, coordinate with other agents
    // For now, simulate coordination
    await new Promise(resolve => setTimeout(resolve, 100));

    task.payload.result = {
      coordinated: targets?.length || 0,
      strategy,
      timestamp: Date.now()
    };
  }

  /**
   * Start processing loop
   */
  private startProcessingLoop(): void {
    this.processingTimer = setInterval(() => {
      this.processQueue();
    }, this.processingIntervalMs);
  }

  /**
   * Process task queue
   */
  private processQueue(): void {
    while (this.taskQueue.length > 0 && this.canAcceptTask()) {
      const task = this.taskQueue.shift();
      if (task) {
        this.assignTask(task).catch(error => {
          logger.error('NormalAgent', {
            agentId: this.config.id,
            taskId: task.id,
            error: error.message,
            message: 'Task assignment failed'
          });
        });
      }
    }
  }

  /**
   * Queue a task for processing
   */
  queueTask(task: Task): boolean {
    if (this.taskQueue.length >= this.maxQueueSize) {
      logger.warn('NormalAgent', {
        agentId: this.config.id,
        message: 'Task queue full'
      });
      return false;
    }

    this.taskQueue.push(task);
    return true;
  }

  /**
   * Get normal-specific metrics
   */
  getNormalMetrics() {
    return {
      ...this.metrics,
      workflowsCompleted: this.workflowsCompleted,
      workflowsFailed: this.workflowsFailed,
      queueSize: this.taskQueue.length,
      activeWorkflows: this.workflows.size,
      workflowSuccessRate: this.workflowsCompleted > 0
        ? (this.workflowsCompleted / (this.workflowsCompleted + this.workflowsFailed)).toFixed(2)
        : 'N/A'
    };
  }

  /**
   * Shutdown agent
   */
  shutdown(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }

    // Complete active workflows
    for (const workflow of this.workflows.values()) {
      if (workflow.status === 'running') {
        workflow.status = 'failed';
        workflow.completedAt = Date.now();
      }
    }

    super.shutdown();
  }
}
