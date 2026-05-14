/**
 * Vera-ElizaOS Bridge Plugin
 * 
 * Enables ElizaOS agents to leverage Vera's advanced capabilities:
 * - Multi-step planning and reasoning
 * - Sub-agent orchestration
 * - Full Hedera Agent Kit integration
 * - HCS-10 agent communication
 * 
 * Standalone implementation - no external dependencies required
 */

// Minimal ElizaOS-compatible type definitions
interface Plugin {
  name: string;
  description: string;
  services?: Service[];
  actions?: Action[];
  providers?: Provider[];
}

interface Action {
  name: string;
  description: string;
  similes: string[];
  examples: Array<Array<{ user: string; content: { text: string; action?: string } }>>;
  validate: (runtime: Runtime, message: Message) => Promise<boolean> | boolean;
  handler: (runtime: Runtime, message: Message, state?: unknown, options?: unknown, callback?: Callback) => Promise<void>;
}

interface Provider {
  name: string;
  description: string;
  get: (runtime: Runtime, message: Message, state?: unknown) => Promise<{ text: string; metadata?: unknown }>;
}

interface Service {
  serviceType: string;
  initialize?: () => Promise<void>;
}

interface Message {
  content: {
    text?: string;
    [key: string]: unknown;
  };
}

interface Runtime {
  services: Map<string, Service>;
}

type Callback = (response: { text: string; metadata?: unknown }) => Promise<void>;

// Plugin configuration interface
export interface VeraBridgeConfig {
  veraEndpoint: string;
  apiKey?: string;
  defaultSubAgentRole?: 'researcher' | 'analyst' | 'coder' | 'critic' | 'planner';
  enableHCS10?: boolean;
  autoDelegateComplexTasks?: boolean;
}

// Vera action types
interface VeraAction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// Response from Vera
interface VeraResponse {
  success: boolean;
  result?: string;
  error?: string;
  tools_used?: string[];
  sub_agent_results?: Array<{
    role: string;
    result: string;
  }>;
}

/**
 * Vera Bridge Service - Core integration layer
 */
class VeraBridgeService implements Service {
  serviceType = 'vera-bridge';
  static serviceType = 'vera-bridge';
  
  private config: VeraBridgeConfig;
  private veraEndpoint: string;

  constructor(config: VeraBridgeConfig) {
    this.config = config;
    this.veraEndpoint = config.veraEndpoint;
  }

  async initialize(): Promise<void> {
    console.log('[VeraBridge] Initializing connection to Vera...');
    // Validate connection to Vera
    try {
      const response = await fetch(`${this.veraEndpoint}/health`);
      if (response.ok) {
        console.log('[VeraBridge] Connected to Vera successfully');
      }
    } catch (error) {
      console.warn('[VeraBridge] Could not connect to Vera:', error);
    }
  }

  /**
   * Send a task to Vera for execution
   */
  async executeTask(task: string, context?: string): Promise<VeraResponse> {
    const response = await fetch(`${this.veraEndpoint}/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: task }],
        enableTools: true,
        plannerMode: this.config.autoDelegateComplexTasks,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    return {
      success: true,
      result: data.response,
      tools_used: data.toolsUsed,
    };
  }

  /**
   * Spawn a specialized sub-agent via Vera
   */
  async spawnSubAgent(
    role: 'researcher' | 'analyst' | 'coder' | 'critic' | 'planner',
    task: string,
    context?: string
  ): Promise<VeraResponse> {
    const response = await fetch(`${this.veraEndpoint}/agent/subagent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify({
        role,
        task,
        context,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    return {
      success: true,
      result: data.result,
      tools_used: data.tools_called,
    };
  }

  /**
   * Execute a Hedera tool via Vera
   */
  async executeHederaTool(toolName: string, args: Record<string, unknown>): Promise<VeraResponse> {
    const response = await fetch(`${this.veraEndpoint}/agent/tool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify({
        tool: toolName,
        args,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    return {
      success: true,
      result: data.result,
    };
  }

  /**
   * Register with HCS-10 as a Vera-powered agent
   */
  async registerHCS10(params: {
    name: string;
    description: string;
    capabilities: string[];
  }): Promise<{ success: boolean; profile?: Record<string, unknown>; error?: string }> {
    const response = await fetch(`${this.veraEndpoint}/hcs10/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    return {
      success: true,
      profile: data.profile,
    };
  }
}

/**
 * "Ask Vera" Action - Natural language interface to Vera
 */
const askVeraAction: Action = {
  name: 'ASK_VERA',
  description: 'Delegate a complex task to Vera for advanced reasoning and multi-step execution',
  similes: ['ask vera', 'consult vera', 'get vera help', 'use vera'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Can you help me analyze this token contract?' } },
      { user: '{{agentName}}', content: { text: "I'll ask Vera to analyze that contract for you.", action: 'ASK_VERA' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Create a tokenomics plan for my project' } },
      { user: '{{agentName}}', content: { text: "I'll have Vera's planning sub-agent work on that.", action: 'ASK_VERA' } },
    ],
  ],
  
  validate: async (runtime, message) => {
    // Check if task is complex enough to warrant Vera
    const text = message.content.text?.toLowerCase() ?? '';
    const complexKeywords = [
      'analyze', 'research', 'plan', 'strategy', 'tokenomics',
      'create token', 'deploy contract', 'complex', 'multi-step',
      'hedera', 'blockchain', 'nft', 'defi', 'swap'
    ];
    return complexKeywords.some(kw => text.includes(kw));
  },

  handler: async (runtime, message, state, options, callback) => {
    const veraService = runtime.services.get('vera-bridge') as unknown as VeraBridgeService | undefined;
    if (!veraService) {
      if (callback) await callback({ text: "Vera bridge service is not available." });
      return;
    }

    const task = message.content.text || '';
    if (callback) await callback({ text: "Consulting Vera... This may take a moment for complex tasks." });

    try {
      const result = await veraService.executeTask(task);
      
      if (result.success) {
        if (callback) await callback({
          text: result.result ?? "Vera completed the task.",
          metadata: {
            tools_used: result.tools_used,
            source: 'vera',
          },
        });
      } else {
        if (callback) await callback({
          text: `Vera encountered an issue: ${result.error}`,
        });
      }
    } catch (error) {
      if (callback) await callback({
        text: `Failed to reach Vera: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
};

/**
 * Spawn Sub-Agent Action - Specialized task delegation
 */
const spawnSubAgentAction: Action = {
  name: 'SPAWN_VERA_SUBAGENT',
  description: 'Spawn a specialized Vera sub-agent for focused tasks (researcher, analyst, coder, critic, planner)',
  similes: ['spawn researcher', 'spawn analyst', 'ask researcher', 'ask analyst', 'code review', 'plan project'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Research the latest DeFi trends on Hedera' } },
      { user: '{{agentName}}', content: { text: "I'll spawn Vera's research sub-agent for that.", action: 'SPAWN_VERA_SUBAGENT' } },
    ],
  ],

  validate: async (runtime, message) => {
    const text = message.content.text?.toLowerCase() ?? '';
    const subAgentKeywords = [
      'research', 'analyze', 'code', 'review', 'plan', 'analyze contract',
      'check token', 'get price', 'technical analysis'
    ];
    return subAgentKeywords.some(kw => text.includes(kw));
  },

  handler: async (runtime, message, state, options, callback) => {
    const veraService = runtime.services.get('vera-bridge') as unknown as VeraBridgeService | undefined;
    if (!veraService) {
      if (callback) await callback({ text: "Vera bridge service is not available." });
      return;
    }

    // Determine role from message content
    const text = message.content.text?.toLowerCase() ?? '';
    let role: 'researcher' | 'analyst' | 'coder' | 'critic' | 'planner' = 'researcher';
    
    if (text.includes('code') || text.includes('solidity') || text.includes('contract')) {
      role = 'coder';
    } else if (text.includes('analyze') || text.includes('analysis') || text.includes('price') || text.includes('token')) {
      role = 'analyst';
    } else if (text.includes('review') || text.includes('critique') || text.includes('risk')) {
      role = 'critic';
    } else if (text.includes('plan') || text.includes('strategy') || text.includes('roadmap')) {
      role = 'planner';
    }

    if (callback) await callback({ text: `Spawning Vera's ${role} sub-agent...` });

    try {
      const result = await veraService.spawnSubAgent(role, message.content.text || '');
      
      if (result.success) {
        if (callback) await callback({
          text: result.result ?? `${role} sub-agent completed the task.`,
          metadata: {
            sub_agent_role: role,
            tools_used: result.tools_used,
            source: 'vera-subagent',
          },
        });
      } else {
        if (callback) await callback({
          text: `Sub-agent encountered an issue: ${result.error}`,
        });
      }
    } catch (error) {
      if (callback) await callback({
        text: `Failed to spawn sub-agent: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
};

/**
 * Hedera Tool Action - Direct tool execution
 */
const hederaToolAction: Action = {
  name: 'EXECUTE_HEDERA_TOOL',
  description: 'Execute a specific Hedera tool via Vera (get balance, create token, transfer HBAR, etc.)',
  similes: ['get balance', 'check balance', 'create token', 'transfer hbar', 'send hbar'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Check the HBAR balance of 0.0.12345' } },
      { user: '{{agentName}}', content: { text: "I'll check that balance via Vera.", action: 'EXECUTE_HEDERA_TOOL' } },
    ],
  ],

  validate: async (runtime, message) => {
    const text = message.content.text?.toLowerCase() ?? '';
    const hederaKeywords = [
      'balance', 'hbar', 'token', 'transfer', 'account', 'nft',
      'hedera', 'hts', 'hcs', 'create token', 'mint'
    ];
    return hederaKeywords.some(kw => text.includes(kw));
  },

  handler: async (runtime, message, state, options, callback) => {
    const veraService = runtime.services.get('vera-bridge') as unknown as VeraBridgeService | undefined;
    if (!veraService) {
      if (callback) await callback({ text: "Vera bridge service is not available." });
      return;
    }

    // Extract tool and parameters using LLM or simple parsing
    // For now, delegate the parsing to Vera
    if (callback) await callback({ text: "Executing Hedera operation via Vera..." });

    try {
      // Map natural language to tool name (simplified)
      const text = message.content.text?.toLowerCase() ?? '';
      let toolName = 'hedera_get_balance';
      const args: Record<string, unknown> = {};

      if (text.includes('balance')) {
        toolName = 'hedera_get_balance';
        // Extract account ID using regex
        const match = text.match(/0\.0\.\d+/);
        if (match) args.account_id = match[0];
      } else if (text.includes('create token')) {
        toolName = 'hts_create_token';
      } else if (text.includes('transfer')) {
        toolName = 'hbar_transfer';
      }

      const result = await veraService.executeHederaTool(toolName, args);
      
      if (result.success) {
        if (callback) await callback({
          text: result.result ?? "Operation completed.",
          metadata: {
            tool: toolName,
            source: 'vera-hedera',
          },
        });
      } else {
        if (callback) await callback({
          text: `Operation failed: ${result.error}`,
        });
      }
    } catch (error) {
      if (callback) await callback({
        text: `Failed to execute: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
};

/**
 * Vera Bridge Provider - Exposes Vera status
 */
const veraStatusProvider: Provider = {
  name: 'VERA_STATUS',
  description: 'Provides current status and capabilities of the Vera integration',
  
  get: async (runtime, _message, _state) => {
    const veraService = runtime.services.get('vera-bridge') as unknown as VeraBridgeService | undefined;
    
    return {
      text: `Vera Integration Status:
- Connected: ${veraService ? 'Yes' : 'No'}
- Available Sub-Agents: researcher, analyst, coder, critic, planner
- Hedera Tools: 50+ via Agent Kit
- HCS-10: Agent communication enabled
- Capabilities: Multi-step planning, tool execution, on-chain analysis`,
      metadata: {
        available: !!veraService,
        capabilities: ['multi-step-planning', 'sub-agents', 'hedera-tools', 'hcs10'],
      },
    };
  },
};

/**
 * Create the Vera Bridge Plugin
 */
export function createVeraBridgePlugin(config: VeraBridgeConfig): Plugin {
  return {
    name: 'vera-bridge',
    description: 'Bridge to Vera - Advanced AI agent with multi-step planning, sub-agent orchestration, and full Hedera integration',
    
    services: [
      new VeraBridgeService(config),
    ],
    
    actions: [
      askVeraAction,
      spawnSubAgentAction,
      hederaToolAction,
    ],
    
    providers: [
      veraStatusProvider,
    ],
  };
}

// Default export for ElizaOS plugin system
export default createVeraBridgePlugin;
