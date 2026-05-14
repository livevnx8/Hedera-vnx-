/**
 * NVIDIA AI-Q Open Agent Blueprint
 * Structured multi-agent workflow orchestration
 * Reference implementation for building custom AI agents with perceive-reason-act cycles
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { openShellRuntime } from '../agents/openShellRuntime.js';
import { nemoClawMemory } from '../memory/nemoClawMemory.js';
import { nemotronRouter } from '../../llm/nemotronRouter.js';

export interface AIQAgent {
  id: string;
  name: string;
  role: 'perceiver' | 'reasoner' | 'actor' | 'coordinator' | 'memory';
  capabilities: string[];
  policyName: string;
  status: 'idle' | 'active' | 'error';
  lastHeartbeat: Date;
}

export interface AIQWorkflow {
  id: string;
  name: string;
  description: string;
  steps: AIQStep[];
  agents: string[]; // Agent IDs
  state: 'pending' | 'running' | 'completed' | 'failed';
  context: Map<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIQStep {
  id: string;
  name: string;
  agentRole: AIQAgent['role'];
  input: string; // Template for input
  output: string; // Expected output key
  dependencies: string[]; // Step IDs that must complete first
  timeout: number;
  retryCount: number;
}

export interface AIQPerception extends Record<string, unknown> {
  rawInput: string;
  context: Record<string, unknown>;
  extractedEntities: string[];
  intent: string;
  confidence: number;
}

export interface AIQReasoning {
  problem: string;
  analysis: string;
  hypotheses: string[];
  selectedApproach: string;
  confidence: number;
  requiredCapabilities: string[];
}

export interface AIQAction {
  type: 'respond' | 'delegate' | 'store' | 'query' | 'execute' | 'coordinate';
  target: string;
  payload: unknown;
  expectedOutcome: string;
  fallbackAction?: AIQAction;
}

export interface AIQWorkflowResult {
  workflowId: string;
  success: boolean;
  outputs: Record<string, unknown>;
  executionTime: number;
  agentContributions: Map<string, string[]>;
  learnings: string[];
}

/**
 * NVIDIA AI-Q Blueprint Orchestrator
 * Implements perceive-reason-act cycles for multi-agent coordination
 */
export class AIQBlueprint extends EventEmitter {
  private agents: Map<string, AIQAgent> = new Map();
  private workflows: Map<string, AIQWorkflow> = new Map();
  private activeExecutions: Map<string, AbortController> = new Map();

  constructor() {
    super();
    logger.info('AIQBlueprint', { message: 'AI-Q Blueprint orchestrator initialized' });
  }

  /**
   * Register an agent for workflow participation
   */
  registerAgent(agent: Omit<AIQAgent, 'id' | 'status' | 'lastHeartbeat'>): AIQAgent {
    const id = `aiq-${agent.role}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const fullAgent: AIQAgent = {
      ...agent,
      id,
      status: 'idle',
      lastHeartbeat: new Date(),
    };

    this.agents.set(id, fullAgent);
    
    // Create OpenShell sandbox
    openShellRuntime.createSandbox(id, agent.policyName);

    logger.info('AIQBlueprint', {
      message: 'Agent registered',
      agentId: id,
      role: agent.role,
      capabilities: agent.capabilities,
    });

    this.emit('agent:registered', fullAgent);
    return fullAgent;
  }

  /**
   * Create a structured workflow
   */
  createWorkflow(
    name: string,
    description: string,
    steps: Omit<AIQStep, 'id'>[],
    agentIds: string[]
  ): AIQWorkflow {
    const id = `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const workflowSteps: AIQStep[] = steps.map((step, index) => ({
      ...step,
      id: `step-${index}-${Date.now()}`,
    }));

    const workflow: AIQWorkflow = {
      id,
      name,
      description,
      steps: workflowSteps,
      agents: agentIds,
      state: 'pending',
      context: new Map(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.workflows.set(id, workflow);
    
    logger.info('AIQBlueprint', {
      message: 'Workflow created',
      workflowId: id,
      name,
      steps: steps.length,
      agents: agentIds.length,
    });

    this.emit('workflow:created', workflow);
    return workflow;
  }

  /**
   * Perceive phase: Extract meaning from input
   */
  async perceive(
    agentId: string,
    rawInput: string,
    context: Record<string, unknown> = {}
  ): Promise<AIQPerception> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.role !== 'perceiver') {
      throw new Error(`Perceiver agent ${agentId} not found`);
    }

    agent.status = 'active';

    try {
      // Use Nemotron for entity extraction and intent classification
      const perception = await nemotronRouter.generateStructured<AIQPerception>(
        `Analyze this input and extract:\n1. Main entities\n2. User intent\n3. Confidence level\n\nInput: "${rawInput}"`,
        JSON.stringify({
          type: 'object',
          properties: {
            rawInput: { type: 'string' },
            context: { type: 'object' },
            extractedEntities: { type: 'array', items: { type: 'string' } },
            intent: { type: 'string' },
            confidence: { type: 'number' },
          },
        }),
        'You are a perception engine. Extract structured information from input.'
      );

      // Store in memory
      await nemoClawMemory.store({
        content: `Perception: ${rawInput} -> ${perception.intent}`,
        metadata: {
          source: 'aiq-perception',
          timestamp: new Date(),
          type: 'insight',
          tags: ['aiq', 'perception', perception.intent],
          importance: perception.confidence,
          agentId,
        },
        relationships: [],
      });

      this.emit('phase:perceive', { agentId, perception });
      return perception;
    } finally {
      agent.status = 'idle';
      agent.lastHeartbeat = new Date();
    }
  }

  /**
   * Reason phase: Analyze and decide
   */
  async reason(
    agentId: string,
    perception: AIQPerception,
    constraints: string[] = []
  ): Promise<AIQReasoning> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.role !== 'reasoner') {
      throw new Error(`Reasoner agent ${agentId} not found`);
    }

    agent.status = 'active';

    try {
      // Retrieve relevant memories
      const memories = await nemoClawMemory.retrieveContext(
        perception.intent,
        undefined,
        2000
      );

      // Use Nemotron for reasoning
      const reasoning = await nemotronRouter.reason(
        `Problem: ${perception.rawInput}\n` +
        `Intent: ${perception.intent}\n` +
        `Context: ${memories.summary}\n` +
        `Constraints: ${constraints.join(', ')}`,
        3 // 3-step chain
      );

      const result: AIQReasoning = {
        problem: perception.rawInput,
        analysis: reasoning.chain.join('\n'),
        hypotheses: reasoning.chain.slice(0, -1),
        selectedApproach: reasoning.conclusion,
        confidence: 0.85,
        requiredCapabilities: agent.capabilities,
      };

      this.emit('phase:reason', { agentId, reasoning: result });
      return result;
    } finally {
      agent.status = 'idle';
      agent.lastHeartbeat = new Date();
    }
  }

  /**
   * Act phase: Execute action
   */
  async act(
    agentId: string,
    reasoning: AIQReasoning,
    availableActions: AIQAction['type'][]
  ): Promise<AIQAction> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.role !== 'actor') {
      throw new Error(`Actor agent ${agentId} not found`);
    }

    agent.status = 'active';

    try {
      // Select best action
      const actionType = this.selectActionType(reasoning, availableActions);
      
      const action: AIQAction = {
        type: actionType,
        target: agentId,
        payload: {
          approach: reasoning.selectedApproach,
          analysis: reasoning.analysis,
        },
        expectedOutcome: reasoning.selectedApproach,
        fallbackAction: {
          type: 'respond',
          target: 'user',
          payload: { message: 'I need more information to proceed.' },
          expectedOutcome: 'Clarification requested',
        },
      };

      this.emit('phase:act', { agentId, action });
      return action;
    } finally {
      agent.status = 'idle';
      agent.lastHeartbeat = new Date();
    }
  }

  /**
   * Execute complete perceive-reason-act cycle
   */
  async executeCycle(
    input: string,
    perceiverId: string,
    reasonerId: string,
    actorId: string
  ): Promise<{
    perception: AIQPerception;
    reasoning: AIQReasoning;
    action: AIQAction;
    executionTime: number;
  }> {
    const startTime = Date.now();

    // Perceive
    const perception = await this.perceive(perceiverId, input);

    // Reason
    const reasoning = await this.reason(reasonerId, perception);

    // Act
    const action = await this.act(actorId, reasoning, ['respond', 'delegate', 'store']);

    const executionTime = Date.now() - startTime;

    return { perception, reasoning, action, executionTime };
  }

  /**
   * Execute a full workflow
   */
  async executeWorkflow(
    workflowId: string,
    initialInput: string
  ): Promise<AIQWorkflowResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const startTime = Date.now();
    const abortController = new AbortController();
    this.activeExecutions.set(workflowId, abortController);

    workflow.state = 'running';
    workflow.context.set('input', initialInput);
    workflow.updatedAt = new Date();

    const outputs: Record<string, unknown> = {};
    const agentContributions = new Map<string, string[]>();
    const learnings: string[] = [];

    try {
      // Topological sort of steps based on dependencies
      const sortedSteps = this.topologicalSort(workflow.steps);

      for (const step of sortedSteps) {
        if (abortController.signal.aborted) {
          throw new Error('Workflow aborted');
        }

        // Find agent for this step
        const agent = this.findAgentForRole(workflow.agents, step.agentRole);
        if (!agent) {
          throw new Error(`No agent available for role ${step.agentRole}`);
        }

        // Execute step
        const stepStart = Date.now();
        
        try {
          const result = await this.executeStep(step, agent, workflow.context, outputs);
          outputs[step.output] = result;
          
          // Track contribution
          const contributions = agentContributions.get(agent.id) || [];
          contributions.push(step.id);
          agentContributions.set(agent.id, contributions);

          learnings.push(`Step ${step.name} completed by ${agent.name}`);

          logger.debug('AIQBlueprint', {
            message: 'Step completed',
            workflowId,
            step: step.name,
            agent: agent.id,
            latencyMs: Date.now() - stepStart,
          });
        } catch (error) {
          if (step.retryCount > 0) {
            step.retryCount--;
            logger.warn('AIQBlueprint', {
              message: 'Step failed, retrying',
              step: step.name,
              retriesLeft: step.retryCount,
            });
          } else {
            throw error;
          }
        }
      }

      workflow.state = 'completed';
      
      const result: AIQWorkflowResult = {
        workflowId,
        success: true,
        outputs,
        executionTime: Date.now() - startTime,
        agentContributions,
        learnings,
      };

      this.emit('workflow:completed', result);
      return result;
    } catch (error) {
      workflow.state = 'failed';
      
      logger.error('AIQBlueprint', {
        message: 'Workflow failed',
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        workflowId,
        success: false,
        outputs,
        executionTime: Date.now() - startTime,
        agentContributions,
        learnings: [...learnings, `Failed: ${error instanceof Error ? error.message : String(error)}`],
      };
    } finally {
      this.activeExecutions.delete(workflowId);
      workflow.updatedAt = new Date();
    }
  }

  /**
   * Abort running workflow
   */
  abortWorkflow(workflowId: string): void {
    const controller = this.activeExecutions.get(workflowId);
    if (controller) {
      controller.abort();
      this.activeExecutions.delete(workflowId);
      
      const workflow = this.workflows.get(workflowId);
      if (workflow) {
        workflow.state = 'failed';
        workflow.updatedAt = new Date();
      }
    }
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId: string): {
    exists: boolean;
    workflow?: AIQWorkflow;
    executionTime?: number;
    progress?: number;
  } {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { exists: false };

    const completedSteps = workflow.state === 'completed' 
      ? workflow.steps.length 
      : workflow.steps.filter(s => workflow.context.has(s.output)).length;

    return {
      exists: true,
      workflow,
      progress: completedSteps / workflow.steps.length,
    };
  }

  /**
   * Get all registered agents
   */
  getAgents(): AIQAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get all workflows
   */
  getWorkflows(): AIQWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Private: Execute a single workflow step
   */
  private async executeStep(
    step: AIQStep,
    agent: AIQAgent,
    context: Map<string, unknown>,
    outputs: Record<string, unknown>
  ): Promise<unknown> {
    // Build input from template and context
    const input = step.input.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (key === 'input') return context.get('input') as string;
      return outputs[key] !== undefined ? String(outputs[key]) : match;
    });

    // Execute based on agent role
    switch (step.agentRole) {
      case 'perceiver':
        const perception = await this.perceive(agent.id, input);
        return perception;
      
      case 'reasoner':
        const mockPerception: AIQPerception = {
          rawInput: input,
          context: Object.fromEntries(context),
          extractedEntities: [],
          intent: 'analyze',
          confidence: 0.8,
        };
        const reasoning = await this.reason(agent.id, mockPerception);
        return reasoning;
      
      case 'actor':
        const mockReasoning: AIQReasoning = {
          problem: input,
          analysis: 'Direct execution',
          hypotheses: [],
          selectedApproach: input,
          confidence: 0.9,
          requiredCapabilities: agent.capabilities,
        };
        const action = await this.act(agent.id, mockReasoning, ['respond', 'store']);
        return action;
      
      default:
        return { input, agent: agent.id };
    }
  }

  /**
   * Private: Find agent for a role
   */
  private findAgentForRole(agentIds: string[], role: AIQAgent['role']): AIQAgent | null {
    for (const id of agentIds) {
      const agent = this.agents.get(id);
      if (agent && agent.role === role && agent.status === 'idle') {
        return agent;
      }
    }
    // Fallback: return any agent with matching role
    for (const id of agentIds) {
      const agent = this.agents.get(id);
      if (agent && agent.role === role) {
        return agent;
      }
    }
    return null;
  }

  /**
   * Private: Select action type based on reasoning
   */
  private selectActionType(
    reasoning: AIQReasoning,
    available: AIQAction['type'][]
  ): AIQAction['type'] {
    const actionMap: Record<string, AIQAction['type']> = {
      'query': 'query',
      'store': 'store',
      'delegate': 'delegate',
      'execute': 'execute',
      'coordinate': 'coordinate',
    };

    for (const [keyword, action] of Object.entries(actionMap)) {
      if (reasoning.selectedApproach.toLowerCase().includes(keyword) &&
          available.includes(action)) {
        return action;
      }
    }

    return available.includes('respond') ? 'respond' : available[0];
  }

  /**
   * Private: Topological sort for workflow steps
   */
  private topologicalSort(steps: AIQStep[]): AIQStep[] {
    const visited = new Set<string>();
    const result: AIQStep[] = [];
    const stepMap = new Map(steps.map(s => [s.id, s]));

    const visit = (step: AIQStep) => {
      if (visited.has(step.id)) return;
      visited.add(step.id);

      for (const depId of step.dependencies) {
        const dep = stepMap.get(depId);
        if (dep) visit(dep);
      }

      result.push(step);
    };

    for (const step of steps) {
      visit(step);
    }

    return result;
  }
}

// Export singleton
export const aiqBlueprint = new AIQBlueprint();
