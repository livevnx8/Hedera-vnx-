/**
 * Vera Domain-Specific Agents - Phase 3 Implementation
 * Specialized agents with curated tool sets for specific use cases
 */

import { EventEmitter } from 'events';
import { executeTool } from './executor.js';
import { workflowOrchestrator } from './workflowEngine.js';

export interface AgentCapability {
  name: string;
  description: string;
  tools: string[];
  workflows: string[];
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  description: string;
  tools: string[];
  workflows: string[];
  systemPrompt: string;
  maxConcurrentTasks: number;
  autoRetry: boolean;
  learningEnabled: boolean;
}

export interface AgentTask {
  id: string;
  type: string;
  input: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export class VeraDomainAgent extends EventEmitter {
  public id: string;
  public name: string;
  public role: string;
  public description: string;
  public tools: string[];
  public workflows: string[];
  public systemPrompt: string;
  
  private taskQueue: AgentTask[] = [];
  private activeTasks: Map<string, AgentTask> = new Map();
  private maxConcurrent: number;
  private autoRetry: boolean;
  private learningEnabled: boolean;
  private usageStats: Map<string, { calls: number; successes: number; avgTime: number }> = new Map();

  constructor(config: AgentConfig) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.description = config.description;
    this.tools = config.tools;
    this.workflows = config.workflows;
    this.systemPrompt = config.systemPrompt;
    this.maxConcurrent = config.maxConcurrentTasks;
    this.autoRetry = config.autoRetry;
    this.learningEnabled = config.learningEnabled;
  }

  /**
   * Execute a single tool call
   */
  async executeTool(toolName: string, input: Record<string, unknown>): Promise<any> {
    if (!this.tools.includes(toolName)) {
      throw new Error(`Tool ${toolName} not available to agent ${this.id}`);
    }

    const startTime = Date.now();
    this.emit('tool_start', { agent: this.id, tool: toolName });

    try {
      const result = await executeTool(toolName, input);
      
      // Update stats
      const stats = this.usageStats.get(toolName) || { calls: 0, successes: 0, avgTime: 0 };
      stats.calls++;
      stats.successes++;
      stats.avgTime = (stats.avgTime * (stats.calls - 1) + (Date.now() - startTime)) / stats.calls;
      this.usageStats.set(toolName, stats);

      this.emit('tool_complete', { agent: this.id, tool: toolName, duration: Date.now() - startTime });
      return JSON.parse(result);
    } catch (error) {
      const stats = this.usageStats.get(toolName) || { calls: 0, successes: 0, avgTime: 0 };
      stats.calls++;
      this.usageStats.set(toolName, stats);

      this.emit('tool_error', { agent: this.id, tool: toolName, error });
      throw error;
    }
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflowId: string, variables: Record<string, any>): Promise<any> {
    if (!this.workflows.includes(workflowId)) {
      throw new Error(`Workflow ${workflowId} not available to agent ${this.id}`);
    }

    this.emit('workflow_start', { agent: this.id, workflow: workflowId });
    const result = await workflowOrchestrator.execute(workflowId, variables);
    this.emit('workflow_complete', { agent: this.id, workflow: workflowId, result });
    return result;
  }

  /**
   * Get agent statistics
   */
  getStats(): any {
    return {
      id: this.id,
      name: this.name,
      toolsAvailable: this.tools.length,
      workflowsAvailable: this.workflows.length,
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      toolUsage: Object.fromEntries(this.usageStats),
    };
  }

  /**
   * Get recommended tools based on task type
   */
  getRecommendedTools(taskType: string): string[] {
    // Simple keyword matching - can be enhanced with ML
    const recommendations: Record<string, string[]> = {
      token: ['hts_create_token', 'hts_mint_token', 'hts_airdrop', 'token_freeze', 'token_pause'],
      nft: ['hts_create_nft', 'hts_mint_nft', 'hts_transfer_nft', 'hts_approve_nft_allowance'],
      defi: ['saucerswap_get_pools', 'saucerswap_get_token_price', 'hts_create_token', 'hbar_transfer'],
      governance: ['hcs_create_topic', 'hcs_submit_message', 'schedule_transfer', 'stake_to_node'],
      file: ['file_create', 'file_append', 'file_get_contents'],
      staking: ['stake_to_node', 'get_staking_info', 'claim_staking_rewards'],
    };

    return recommendations[taskType] || this.tools.slice(0, 5);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain-Specific Agent Configurations
// ─────────────────────────────────────────────────────────────────────────────

export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  // DeFi Agent - Token launches, liquidity, DeFi operations
  'agent-defi': {
    id: 'agent-defi',
    name: 'DeFi Strategist',
    role: 'defi_specialist',
    description: 'Specialized in token launches, liquidity management, and DeFi protocol interactions',
    tools: [
      // HTS Tokens
      'hts_create_token', 'hts_mint_token', 'hts_airdrop', 'hts_update_token',
      'token_pause', 'token_unpause', 'token_freeze', 'token_unfreeze',
      'token_fee_schedule_update',
      // DeFi
      'saucerswap_get_pools', 'saucerswap_get_token_price', 'get_price_chart',
      'hbar_transfer', 'kit_get_token_balances', 'kit_get_exchange_rate',
      // HCS
      'hcs_create_topic', 'hcs_submit_message',
      // Queries
      'kit_get_account', 'kit_get_token_info',
    ],
    workflows: ['defi-token-launch', 'treasury-rebalance'],
    systemPrompt: `You are a DeFi specialist agent focused on token economics and decentralized finance.
Your expertise includes token launches, liquidity management, and DeFi protocol analysis.
Always consider market conditions and user risk tolerance when making recommendations.`,
    maxConcurrentTasks: 5,
    autoRetry: true,
    learningEnabled: true,
  },

  // NFT Agent - Collections, minting, marketplace
  'agent-nft': {
    id: 'agent-nft',
    name: 'NFT Curator',
    role: 'nft_specialist',
    description: 'Specialized in NFT collection launches, minting, and marketplace operations',
    tools: [
      // NFT Operations
      'hts_create_nft', 'hts_mint_nft', 'hts_transfer_nft',
      'hts_approve_nft_allowance', 'hts_delete_nft_allowance',
      // Metadata
      'file_create', 'file_append', 'file_get_contents',
      // Tokens for royalty
      'hts_create_token', 'hts_airdrop',
      // HCS for provenance
      'hcs_create_topic', 'hcs_submit_message',
      // Queries
      'kit_get_token_info', 'kit_get_account',
    ],
    workflows: ['nft-drop'],
    systemPrompt: `You are an NFT specialist agent focused on digital collectibles and creative economies.
Your expertise includes NFT collection strategy, metadata management, and marketplace dynamics.
Always verify metadata integrity and emphasize creator royalties.`,
    maxConcurrentTasks: 3,
    autoRetry: true,
    learningEnabled: true,
  },

  // Governance Agent - DAOs, voting, proposals
  'agent-governance': {
    id: 'agent-governance',
    name: 'Governance Architect',
    role: 'governance_specialist',
    description: 'Specialized in DAO governance, proposal management, and voting systems',
    tools: [
      // Consensus
      'hcs_create_topic', 'hcs_submit_message', 'hcs_update_topic',
      'kit_get_topic_info', 'kit_get_hcs_messages',
      // Scheduled execution
      'schedule_transfer', 'schedule_token_create',
      'kit_sign_schedule', 'kit_delete_schedule',
      // Staking
      'stake_to_node', 'update_staking', 'get_staking_info',
      'enable_staking', 'disable_staking',
      // Queries
      'kit_get_account', 'kit_get_transaction_record',
    ],
    workflows: [],
    systemPrompt: `You are a governance specialist agent focused on decentralized decision-making.
Your expertise includes DAO structures, voting mechanisms, and proposal execution.
Always ensure transparency and fair participation in governance processes.`,
    maxConcurrentTasks: 2,
    autoRetry: true,
    learningEnabled: true,
  },

  // Treasury Agent - Treasury management, rebalancing, staking
  'agent-treasury': {
    id: 'agent-treasury',
    name: 'Treasury Manager',
    role: 'treasury_specialist',
    description: 'Specialized in treasury operations, portfolio rebalancing, and yield optimization',
    tools: [
      // Staking
      'stake_to_node', 'update_staking', 'claim_staking_rewards',
      'get_staking_info', 'get_reward_history', 'enable_staking', 'disable_staking',
      // Token operations
      'hbar_transfer', 'hts_airdrop', 'kit_approve_token_allowance',
      'kit_delete_token_allowance', 'kit_approve_hbar_allowance',
      // Queries
      'kit_get_token_balances', 'kit_get_account', 'kit_get_exchange_rate',
      'kit_get_pending_airdrops',
      // DeFi
      'saucerswap_get_token_price',
    ],
    workflows: ['treasury-rebalance'],
    systemPrompt: `You are a treasury specialist agent focused on asset management and yield optimization.
Your expertise includes staking strategies, portfolio rebalancing, and risk management.
Always prioritize capital preservation and maintain diversification.`,
    maxConcurrentTasks: 3,
    autoRetry: true,
    learningEnabled: true,
  },

  // Security Agent - Auditing, compliance, monitoring
  'agent-security': {
    id: 'agent-security',
    name: 'Security Guardian',
    role: 'security_specialist',
    description: 'Specialized in security auditing, compliance monitoring, and threat detection',
    tools: [
      // Verification
      'verify_account', 'kit_get_transaction_record',
      'kit_get_contract_info', 'kit_get_topic_info',
      // Emergency controls
      'token_pause', 'token_unpause', 'token_freeze', 'token_unfreeze',
      'token_wipe', 'kit_delete_schedule',
      // Queries
      'get_token_holders', 'get_transaction_history', 'get_contract_logs',
      'kit_get_account', 'kit_get_token_balances',
    ],
    workflows: [],
    systemPrompt: `You are a security specialist agent focused on blockchain auditing and compliance.
Your expertise includes transaction monitoring, access control, and risk assessment.
Always act cautiously and escalate suspicious activities immediately.`,
    maxConcurrentTasks: 2,
    autoRetry: false,
    learningEnabled: true,
  },

  // Enterprise Agent - Compliance, KYC, enterprise integration
  'agent-enterprise': {
    id: 'agent-enterprise',
    name: 'Enterprise Integration',
    role: 'enterprise_specialist',
    description: 'Specialized in enterprise blockchain integration, compliance, and account management',
    tools: [
      // Account management
      'kit_create_account', 'kit_update_account', 'kit_delete_account',
      // Compliance
      'token_kyc_grant', 'token_kyc_revoke', 'token_freeze', 'token_unfreeze',
      // File service for documents
      'file_create', 'file_append', 'file_get_contents', 'file_get_info',
      // Scheduled operations
      'schedule_transfer', 'kit_sign_schedule',
      // Queries
      'kit_get_account', 'kit_get_token_balances',
    ],
    workflows: [],
    systemPrompt: `You are an enterprise specialist agent focused on business blockchain adoption.
Your expertise includes compliance, KYC/AML, and enterprise system integration.
Always maintain regulatory compliance and data privacy standards.`,
    maxConcurrentTasks: 4,
    autoRetry: true,
    learningEnabled: true,
  },

  // McLaren Race Carbon Auditor Agent - F1 sustainability auditing
  'agent-mclaren-carbon': {
    id: 'agent-mclaren-carbon',
    name: 'Race Carbon Auditor',
    role: 'carbon_auditor',
    description: 'Specialized in F1 telemetry analysis and carbon emission auditing for McLaren Racing',
    tools: [
      // Telemetry tools
      'mclaren_ingest_telemetry',
      'mclaren_calculate_emissions',
      'mclaren_get_calculation',
      // NFT Badge tools
      'mclaren_mint_carbon_badge',
      'mclaren_batch_mint_badges',
      'mclaren_verify_badge',
      // HCS Reporting tools
      'mclaren_submit_race_report',
      'mclaren_submit_season_summary',
      'mclaren_get_report',
      // Hedera integration
      'hts_create_nft',
      'hts_mint_nft',
      'hcs_create_topic',
      'hcs_submit_message',
      'kit_get_topic_info',
      'kit_get_hcs_messages',
    ],
    workflows: ['mclaren-race-audit', 'mclaren-badge-drop', 'mclaren-season-summary'],
    systemPrompt: `You are the Race Carbon Auditor - Vera's specialized agent for McLaren Racing carbon emissions.

Your expertise includes:
- F1 telemetry data analysis (tire wear, fuel burn, route logistics)
- Carbon emission calculations using verified emission factors
- NFT badge minting for carbon-verified collectibles
- HCS-based immutable carbon reporting

When auditing a race:
1. Ingest telemetry data from McLaren/FIA sources
2. Calculate total and team-share emissions
3. Generate confidence score based on data completeness
4. Provide actionable carbon reduction recommendations
5. Mint carbon-verified badges for collectible NFT buyers
6. Submit immutable audit reports to Hedera Consensus Service

Sample outputs:
- Monaco GP: "7,030 tCO₂e total, McLaren share ~15% (pit ops, travel). Confidence 0.94, signed Vera-lattice."
- Post-race savings: "Saved 160 kg CO₂e via lean map + undercut—38 trees equivalent."

Always provide:
- Exact emission figures with units (tCO₂e or kg CO₂e)
- Confidence scores (0.00-0.99)
- Hedera attestation details (topic ID, sequence number)
- Optimization recommendations

You represent the world's first real-time, verifiable motorsport sustainability platform.`,
    maxConcurrentTasks: 3,
    autoRetry: true,
    learningEnabled: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Agent Registry
// ─────────────────────────────────────────────────────────────────────────────

class AgentRegistry {
  private agents: Map<string, VeraDomainAgent> = new Map();

  constructor() {
    // Initialize all domain agents
    for (const [id, config] of Object.entries(AGENT_CONFIGS)) {
      this.agents.set(id, new VeraDomainAgent(config));
    }
    console.log(`🤖 Initialized ${this.agents.size} domain-specific agents`);
  }

  getAgent(id: string): VeraDomainAgent | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): VeraDomainAgent[] {
    return Array.from(this.agents.values());
  }

  getAgentsByCapability(capability: string): VeraDomainAgent[] {
    return this.getAllAgents().filter(agent => 
      agent.tools.some(tool => tool.includes(capability))
    );
  }

  listAgents(): Array<{ id: string; name: string; role: string; tools: number }> {
    return this.getAllAgents().map(agent => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      tools: agent.tools.length,
    }));
  }

  /**
   * Route a task to the best agent
   */
  async routeTask(taskType: string, input: Record<string, unknown>): Promise<VeraDomainAgent> {
    // Simple routing based on task type
    const routingMap: Record<string, string> = {
      token: 'agent-defi',
      defi: 'agent-defi',
      nft: 'agent-nft',
      collection: 'agent-nft',
      governance: 'agent-governance',
      dao: 'agent-governance',
      treasury: 'agent-treasury',
      staking: 'agent-treasury',
      security: 'agent-security',
      audit: 'agent-security',
      enterprise: 'agent-enterprise',
      compliance: 'agent-enterprise',
      mclaren: 'agent-mclaren-carbon',
      carbon: 'agent-mclaren-carbon',
      racing: 'agent-mclaren-carbon',
      telemetry: 'agent-mclaren-carbon',
    };

    const agentId = routingMap[taskType.toLowerCase()];
    if (!agentId) {
      throw new Error(`No agent available for task type: ${taskType}`);
    }

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return agent;
  }

  /**
   * Execute a task with the appropriate agent
   */
  async executeTask(taskType: string, tool: string, input: Record<string, unknown>): Promise<any> {
    const agent = await this.routeTask(taskType, input);
    return agent.executeTool(tool, input);
  }
}

// Export singleton
export const agentRegistry = new AgentRegistry();

// Export for custom instantiation
export { AgentRegistry };
