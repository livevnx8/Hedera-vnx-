/**
 * Vera Agent System Integration
 * Comprehensive integration module that wires together all agent components
 */

import { agentRegistry, VeraDomainAgent } from './domainAgents.js';
import { workflowOrchestrator, WorkflowOrchestrator } from './workflowEngine.js';
import { agentLearningSystem, AgentLearningSystem } from './learningSystem.js';
import { latticeFindingsLogger, LatticeFindingsLogger } from './latticeFindings.js';
import { executeTool } from './executor.js';
import { ALL_TOOL_DEFINITIONS } from './definitions.js';
import { EventEmitter } from 'events';

export interface SystemStatus {
  agents: number;
  workflows: number;
  tools: number;
  learningEnabled: boolean;
  healthy: boolean;
}

export interface AgentSystemConfig {
  enableLearning: boolean;
  enableWorkflows: boolean;
  defaultAgent: string;
  hcsLogging: boolean;
}

class VeraAgentSystem extends EventEmitter {
  public registry = agentRegistry;
  public workflows = workflowOrchestrator;
  public learning = agentLearningSystem;
  public findings = latticeFindingsLogger;
  public config: AgentSystemConfig;

  constructor(config: Partial<AgentSystemConfig> = {}) {
    super();
    this.config = {
      enableLearning: true,
      enableWorkflows: true,
      defaultAgent: 'agent-defi',
      hcsLogging: true,
      ...config,
    };

    this.setupEventHandlers();
    console.log('🚀 Vera Agent System initialized');
    console.log(`   Agents: ${this.registry.listAgents().length}`);
    console.log(`   Workflows: ${this.workflows.listWorkflows().length}`);
    console.log(`   Tools: ${ALL_TOOL_DEFINITIONS.length}`);
    
    // Start lattice findings logging if enabled
    if (this.config.hcsLogging) {
      this.findings.startPeriodicSubmission();
      console.log('   HCS Logging: enabled (every 5 minutes)');
    }
  }

  private setupEventHandlers(): void {
    // Listen to workflow events
    this.workflows.on('workflow_started', (data) => {
      this.emit('activity', { type: 'workflow', action: 'started', ...data });
    });

    this.workflows.on('workflow_completed', (data) => {
      this.emit('activity', { type: 'workflow', action: 'completed', ...data });
      
      // Log to lattice findings
      this.findings.recordFinding(
        'result',
        data.definition || 'workflow',
        `Workflow ${data.result?.success ? 'completed' : 'failed'}: ${data.name || data.definition}`,
        { workflowId: data.definition, success: data.result?.success, duration: data.result?.duration },
        data.result?.success ? 6 : 8,
        'workflow'
      );
    });

    // Listen to learning events
    this.learning.on('tool_usage_recorded', (data) => {
      this.emit('activity', { type: 'tool', action: 'recorded', ...data });
    });
  }

  /**
   * Get comprehensive system status
   */
  getStatus(): SystemStatus {
    return {
      agents: this.registry.listAgents().length,
      workflows: this.workflows.listWorkflows().length,
      tools: ALL_TOOL_DEFINITIONS.length,
      learningEnabled: this.config.enableLearning,
      healthy: true,
    };
  }

  /**
   * Execute a task with the best available agent
   */
  async executeTask(
    taskType: string,
    tool: string,
    input: Record<string, unknown>,
    options?: { agentId?: string; trackLearning?: boolean }
  ): Promise<any> {
    const agentId = options?.agentId || this.config.defaultAgent;
    const trackLearning = options?.trackLearning ?? this.config.enableLearning;

    // Get the agent
    const agent = this.registry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Execute with learning tracking
    const result = await executeTool(tool, input, trackLearning ? agentId : undefined);
    
    this.emit('task_completed', {
      agent: agentId,
      tool,
      taskType,
      success: !result.includes('"error"'),
    });

    return JSON.parse(result);
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowId: string,
    variables: Record<string, any>,
    options?: { agentId?: string }
  ): Promise<any> {
    if (!this.config.enableWorkflows) {
      throw new Error('Workflows are disabled in configuration');
    }

    const result = await this.workflows.execute(workflowId, variables);
    
    // Record workflow execution in learning system if agent specified
    if (options?.agentId) {
      this.learning.recordToolSequence(
        options.agentId,
        result.completedSteps || []
      );
    }

    return result;
  }

  /**
   * Get agent recommendations for a task
   */
  getRecommendations(agentId?: string): any {
    if (!this.config.enableLearning) {
      return { learning: 'disabled' };
    }

    if (agentId) {
      return {
        analytics: this.learning.getToolAnalytics(agentId, 7),
        recommendations: this.learning.getRecommendations(agentId),
        skillGraph: this.learning.buildSkillGraph(agentId),
      };
    }

    return {
      allAgents: this.learning.getAllAgentMetrics(),
    };
  }

  /**
   * Generate a comprehensive system report
   */
  generateReport(): string {
    const sections: string[] = [];
    
    sections.push('# Vera Agent System Report');
    sections.push(`Generated: ${new Date().toISOString()}\n`);

    // System status
    const status = this.getStatus();
    sections.push('## System Status');
    sections.push(`- Agents: ${status.agents}`);
    sections.push(`- Workflows: ${status.workflows}`);
    sections.push(`- Tools: ${status.tools}`);
    sections.push(`- Learning: ${status.learningEnabled ? 'enabled' : 'disabled'}`);
    sections.push(`- Health: ${status.healthy ? '✅ healthy' : '❌ unhealthy'}\n`);

    // Registered agents
    sections.push('## Registered Agents');
    for (const agent of this.registry.listAgents()) {
      sections.push(`- **${agent.name}** (${agent.id})`);
      sections.push(`  - Role: ${agent.role}`);
      sections.push(`  - Tools: ${agent.tools}`);
    }
    sections.push('');

    // Available workflows
    sections.push('## Available Workflows');
    for (const workflow of this.workflows.listWorkflows()) {
      sections.push(`- **${workflow.name}** (${workflow.id})`);
      sections.push(`  - Category: ${workflow.category}`);
      sections.push(`  - Version: ${workflow.version}`);
    }
    sections.push('');

    // Learning summary
    if (this.config.enableLearning) {
      sections.push('## Learning Summary');
      const metrics = this.learning.getAllAgentMetrics();
      for (const m of metrics) {
        sections.push(`- ${m.agentId}: ${m.totalCalls} calls, ${(m.successRate * 100).toFixed(0)}% success, ${m.learningProgress}% learned`);
      }
    }

    return sections.join('\n');
  }

  /**
   * List all available tools grouped by category
   */
  listToolsByCategory(): Record<string, string[]> {
    const categories: Record<string, string[]> = {
      'Hedera Native': [],
      'Agent Kit': [],
      'Staking': [],
      'File Service': [],
      'Advanced Token': [],
      'DeFi': [],
      'Smart Contract': [],
      'Web': [],
      'QVX': [],
      'Memory': [],
    };

    for (const tool of ALL_TOOL_DEFINITIONS) {
      const name = tool.function.name;
      
      if (name.startsWith('hedera_')) categories['Hedera Native'].push(name);
      else if (name.startsWith('hts_') || name.startsWith('hbar_') || name.startsWith('hcs_') || name.startsWith('kit_')) categories['Agent Kit'].push(name);
      else if (name.startsWith('stake_') || name.startsWith('get_staking') || name.startsWith('enable_staking') || name.startsWith('disable_staking') || name.startsWith('claim_')) categories['Staking'].push(name);
      else if (name.startsWith('file_')) categories['File Service'].push(name);
      else if (name.startsWith('token_')) categories['Advanced Token'].push(name);
      else if (name.startsWith('saucerswap_') || name.startsWith('evm_')) categories['DeFi'].push(name);
      else if (name.startsWith('vera_')) categories['Smart Contract'].push(name);
      else if (name.startsWith('web_') || name.startsWith('wiki_') || name.startsWith('hackernews_') || name.startsWith('get_news')) categories['Web'].push(name);
      else if (name.startsWith('qvx_')) categories['QVX'].push(name);
      else if (name.startsWith('vera_memory_')) categories['Memory'].push(name);
    }

    // Remove empty categories
    for (const [key, value] of Object.entries(categories)) {
      if (value.length === 0) delete categories[key];
    }

    return categories;
  }

  /**
   * Quick access to domain agents
   */
  get defi(): VeraDomainAgent | undefined {
    return this.registry.getAgent('agent-defi');
  }

  get nft(): VeraDomainAgent | undefined {
    return this.registry.getAgent('agent-nft');
  }

  get governance(): VeraDomainAgent | undefined {
    return this.registry.getAgent('agent-governance');
  }

  get treasury(): VeraDomainAgent | undefined {
    return this.registry.getAgent('agent-treasury');
  }

  get security(): VeraDomainAgent | undefined {
    return this.registry.getAgent('agent-security');
  }

  get enterprise(): VeraDomainAgent | undefined {
    return this.registry.getAgent('agent-enterprise');
  }
}

// Export singleton
export const veraAgentSystem = new VeraAgentSystem();

// Export class for custom configuration
export { VeraAgentSystem };
