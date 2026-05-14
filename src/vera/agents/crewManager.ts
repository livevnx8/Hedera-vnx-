/**
 * Vera CrewAI Integration
 * 
 * Multi-agent crews organized by Flower of Life lattice layers.
 * Each layer has specialized agents that collaborate on tasks.
 * 
 * Architecture:
 * - Layer 1: Task Agents (executor, validator, synthesizer)
 * - Layer 2: Domain Agents (carbon, defi, compliance)
 * - Layer 3: Strategic Agents (quantum, resonance, comms)
 * 
 * @module vera/agents/crewManager
 */

import { EventEmitter } from 'events';

export interface AgentRole {
  name: string;
  goal: string;
  backstory: string;
  allowDelegation: boolean;
  verbose: boolean;
  tools?: string[];
}

export interface CrewTask {
  description: string;
  expectedOutput: string;
  agent: string;
  context?: string;
  asyncExecution?: boolean;
}

export interface CrewConfig {
  name: string;
  layer: 1 | 2 | 3;
  agents: AgentRole[];
  tasks: CrewTask[];
  process: 'sequential' | 'hierarchical' | 'parallel';
  memory: boolean;
  cache: boolean;
  maxIterations: number;
}

export interface CrewResult {
  success: boolean;
  output: string;
  tokenUsage: number;
  executionTime: number;
  agentOutputs: Map<string, string>;
}

export class VeraCrewManager extends EventEmitter {
  private crews = new Map<string, CrewConfig>();
  private activeExecutions = new Map<string, AbortController>();
  private ollamaUrl: string;

  constructor(ollamaUrl: string = 'http://localhost:11434') {
    super();
    this.ollamaUrl = ollamaUrl;
    this.initializeDefaultCrews();
  }

  /**
   * Create default crews for each lattice layer
   */
  private initializeDefaultCrews(): void {
    // Layer 1: Task Execution Crew
    this.registerCrew({
      name: 'layer1_task_crew',
      layer: 1,
      agents: [
        {
          name: 'Executor',
          goal: 'Execute tasks efficiently and accurately',
          backstory: 'You are a precise task executor. You break down complex tasks into steps and execute them methodically.',
          allowDelegation: true,
          verbose: true,
          tools: ['file_read', 'file_write', 'shell_exec'],
        },
        {
          name: 'Validator',
          goal: 'Validate outputs for correctness and completeness',
          backstory: 'You are a quality assurance specialist. You verify that all outputs meet requirements.',
          allowDelegation: false,
          verbose: true,
        },
        {
          name: 'Synthesizer',
          goal: 'Combine outputs into coherent final results',
          backstory: 'You synthesize multiple outputs into a unified, coherent response.',
          allowDelegation: false,
          verbose: true,
        },
      ],
      tasks: [],
      process: 'sequential',
      memory: true,
      cache: true,
      maxIterations: 15,
    });

    // Layer 2: Domain Expert Crew
    this.registerCrew({
      name: 'layer2_domain_crew',
      layer: 2,
      agents: [
        {
          name: 'CarbonSpecialist',
          goal: 'Analyze carbon markets and environmental impact',
          backstory: 'You are an expert in carbon markets, ESG metrics, and environmental tokenization.',
          allowDelegation: true,
          verbose: true,
          tools: ['carbon_calc', 'esg_query'],
        },
        {
          name: 'DeFiAnalyst',
          goal: 'Analyze DeFi protocols and opportunities',
          backstory: 'You are a DeFi specialist with deep knowledge of protocols, yields, and risks.',
          allowDelegation: true,
          verbose: true,
          tools: ['defi_query', 'yield_calc'],
        },
        {
          name: 'ComplianceOfficer',
          goal: 'Ensure regulatory compliance',
          backstory: 'You verify all outputs against regulatory requirements and best practices.',
          allowDelegation: false,
          verbose: true,
        },
      ],
      tasks: [],
      process: 'hierarchical',
      memory: true,
      cache: true,
      maxIterations: 20,
    });

    // Layer 3: Strategic Intelligence Crew
    this.registerCrew({
      name: 'layer3_strategic_crew',
      layer: 3,
      agents: [
        {
          name: 'QuantumStrategist',
          goal: 'Identify quantum opportunities and patterns',
          backstory: 'You see patterns others miss. You find novel solutions to complex problems.',
          allowDelegation: true,
          verbose: true,
        },
        {
          name: 'ResonanceKeeper',
          goal: 'Maintain harmonic balance across all operations',
          backstory: 'You ensure all agents work in harmony. You detect and resolve conflicts.',
          allowDelegation: true,
          verbose: true,
        },
        {
          name: 'CommunicationsLead',
          goal: 'Coordinate and communicate across all layers',
          backstory: 'You are the bridge between all lattice layers. You ensure information flows freely.',
          allowDelegation: true,
          verbose: true,
        },
      ],
      tasks: [],
      process: 'parallel',
      memory: true,
      cache: false,
      maxIterations: 25,
    });
  }

  /**
   * Register a new crew
   */
  registerCrew(config: CrewConfig): void {
    this.crews.set(config.name, config);
    this.emit('crew_registered', config);
  }

  /**
   * Execute a crew with tasks
   */
  async executeCrew(
    crewName: string,
    tasks: CrewTask[],
    context?: Record<string, any>
  ): Promise<CrewResult> {
    const crew = this.crews.get(crewName);
    if (!crew) {
      throw new Error(`Crew not found: ${crewName}`);
    }

    const startTime = Date.now();
    const abortController = new AbortController();
    const executionId = `${crewName}_${Date.now()}`;
    this.activeExecutions.set(executionId, abortController);

    this.emit('crew_started', { crewName, executionId, tasks });

    try {
      const agentOutputs = new Map<string, string>();
      let finalOutput = '';
      let totalTokens = 0;

      // Simple sequential execution for now (can be enhanced with actual CrewAI Python integration)
      for (const task of tasks) {
        if (abortController.signal.aborted) {
          throw new Error('Execution aborted');
        }

        const agent = crew.agents.find(a => a.name === task.agent);
        if (!agent) {
          throw new Error(`Agent not found: ${task.agent}`);
        }

        // Execute via Ollama
        const prompt = this.buildTaskPrompt(agent, task, context);
        const result = await this.executeAgent(agent, prompt);

        agentOutputs.set(task.agent, result.output);
        finalOutput = result.output;
        totalTokens += result.tokensUsed;

        this.emit('task_complete', { crewName, task, agent: agent.name, output: result.output });
      }

      const executionTime = Date.now() - startTime;

      this.emit('crew_complete', { crewName, executionId, executionTime });

      return {
        success: true,
        output: finalOutput,
        tokenUsage: totalTokens,
        executionTime,
        agentOutputs,
      };
    } catch (error) {
      this.emit('crew_error', { crewName, executionId, error });
      throw error;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Build task prompt for agent
   */
  private buildTaskPrompt(
    agent: AgentRole,
    task: CrewTask,
    context?: Record<string, any>
  ): string {
    let prompt = `You are ${agent.name}.
${agent.backstory}

YOUR GOAL: ${agent.goal}

TASK: ${task.description}

EXPECTED OUTPUT: ${task.expectedOutput}

`;

    if (task.context) {
      prompt += `CONTEXT: ${task.context}\n\n`;
    }

    if (context) {
      prompt += `ADDITIONAL CONTEXT:\n${JSON.stringify(context, null, 2)}\n\n`;
    }

    prompt += `Execute this task as ${agent.name}. Be thorough and precise.`;

    return prompt;
  }

  /**
   * Execute single agent via Ollama
   */
  private async executeAgent(
    agent: AgentRole,
    prompt: string,
    model: string = 'llama3.1:8b'
  ): Promise<{ output: string; tokensUsed: number }> {
    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_ctx: 4096,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Agent execution failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      output: data.response,
      tokensUsed: data.eval_count || 0,
    };
  }

  /**
   * Abort active crew execution
   */
  abortExecution(executionId: string): boolean {
    const controller = this.activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
      this.activeExecutions.delete(executionId);
      return true;
    }
    return false;
  }

  /**
   * Get crew by layer
   */
  getCrewsByLayer(layer: 1 | 2 | 3): CrewConfig[] {
    return Array.from(this.crews.values()).filter(c => c.layer === layer);
  }

  /**
   * List all crews
   */
  listCrews(): Array<{ name: string; layer: number; agents: string[] }> {
    return Array.from(this.crews.values()).map(c => ({
      name: c.name,
      layer: c.layer,
      agents: c.agents.map(a => a.name),
    }));
  }
}

// Singleton instance
export const crewManager = new VeraCrewManager();
