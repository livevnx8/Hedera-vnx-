/**
 * Vera Voice Command Registry
 * Defines all voice-executable commands for Vera OS
 */

export interface CommandDefinition {
  name: string;
  description: string;
  patterns: string[]; // Regex patterns or keyword strings to match
  handler: (params: CommandParams) => Promise<CommandResult>;
  requiresWakeWord: boolean;
  cooldown: number; // ms between executions
  category: 'query' | 'action' | 'navigation' | 'configuration';
}

export interface CommandParams {
  rawCommand: string;
  entities: Record<string, string>;
  context: ConversationContext;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  speakResponse: boolean;
  visualUpdate?: string;
}

export interface ConversationContext {
  sessionId: string;
  lastCommand?: string;
  lastIntent?: string;
  lastEntities?: Record<string, string>;
  turnCount: number;
  timestamp: number;
}

// Command registry storage
const commandRegistry = new Map<string, CommandDefinition>();
const cooldowns = new Map<string, number>();

/**
 * Register a new voice command
 */
export function registerCommand(command: CommandDefinition): void {
  commandRegistry.set(command.name, command);
}

/**
 * Get all registered commands
 */
export function getAllCommands(): CommandDefinition[] {
  return Array.from(commandRegistry.values());
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: CommandDefinition['category']): CommandDefinition[] {
  return getAllCommands().filter(cmd => cmd.category === category);
}

/**
 * Find matching command for user input
 */
export function findCommand(input: string): { command: CommandDefinition; params: CommandParams } | null {
  const normalized = input.toLowerCase().trim();

  for (const [name, command] of commandRegistry) {
    for (const pattern of command.patterns) {
      // Simple keyword matching
      if (normalized.includes(pattern.toLowerCase())) {
        const entities = extractEntities(normalized, command);
        
        // Check cooldown
        const lastExecution = cooldowns.get(name);
        if (lastExecution && Date.now() - lastExecution < command.cooldown) {
          continue;
        }

        cooldowns.set(name, Date.now());

        return {
          command,
          params: {
            rawCommand: input,
            entities,
            context: createContext(),
          },
        };
      }

      // Regex pattern matching (if pattern starts with ^)
      if (pattern.startsWith('^')) {
        const regex = new RegExp(pattern, 'i');
        const match = normalized.match(regex);
        if (match) {
          const entities: Record<string, string> = {};
          if (match.groups) {
            Object.assign(entities, match.groups);
          }

          return {
            command,
            params: {
              rawCommand: input,
              entities,
              context: createContext(),
            },
          };
        }
      }
    }
  }

  return null;
}

/**
 * Execute a command
 */
export async function executeCommand(
  command: CommandDefinition,
  params: CommandParams
): Promise<CommandResult> {
  try {
    return await command.handler(params);
  } catch (error) {
    return {
      success: false,
      message: `Error executing command: ${error instanceof Error ? error.message : 'Unknown error'}`,
      speakResponse: true,
    };
  }
}

/**
 * Extract entities from command text
 */
function extractEntities(input: string, command: CommandDefinition): Record<string, string> {
  const entities: Record<string, string> = {};

  // Layer extraction
  const layerMatch = input.match(/layer\s*(\d|one|two|three|four)/i);
  if (layerMatch) {
    const layerMap: Record<string, string> = { one: '1', two: '2', three: '3', four: '4' };
    entities.layer = layerMap[layerMatch[1].toLowerCase()] || layerMatch[1];
  }

  // Agent type extraction
  const agentTypes = ['defi', 'carbon', 'compliance', 'orchestrator', 'executor', 'analyst'];
  for (const type of agentTypes) {
    if (input.includes(type)) {
      entities.agentType = type;
      break;
    }
  }

  // Energy level extraction
  const energyMatch = input.match(/(\d+)%?\s*(?:energy|pulse)/i);
  if (energyMatch) {
    entities.energyLevel = energyMatch[1];
  }

  // Node extraction
  const nodeMatch = input.match(/node\s*(\d+|center)/i);
  if (nodeMatch) {
    entities.nodeId = nodeMatch[1].toLowerCase() === 'center' ? 'center-0' : `node-${nodeMatch[1]}`;
  }

  // Direction extraction
  if (input.includes('clockwise')) entities.direction = 'clockwise';
  if (input.includes('counter') || input.includes('counterclockwise')) entities.direction = 'counterclockwise';

  return entities;
}

/**
 * Create conversation context
 */
function createContext(): ConversationContext {
  return {
    sessionId: `session-${Date.now()}`,
    turnCount: 0,
    timestamp: Date.now(),
  };
}

/**
 * Get help text for all commands
 */
export function getHelpText(): string {
  const commands = getAllCommands();
  const categories = ['query', 'action', 'navigation', 'configuration'] as const;
  
  let help = 'Here are the voice commands you can use:\n\n';
  
  for (const category of categories) {
    const categoryCommands = commands.filter(c => c.category === category);
    if (categoryCommands.length === 0) continue;
    
    help += `${category.toUpperCase()}:\n`;
    for (const cmd of categoryCommands) {
      help += `  • ${cmd.description}\n`;
    }
    help += '\n';
  }
  
  return help;
}

// ─── BUILT-IN COMMANDS ────────────────────────────────────────────────────

// Lattice Query Commands
registerCommand({
  name: 'show_lattice_stats',
  description: 'Show lattice statistics',
  patterns: ['show lattice stats', 'lattice status', 'system status', 'what is the status'],
  category: 'query',
  requiresWakeWord: true,
  cooldown: 2000,
  handler: async () => {
    // This would fetch from flowerOfLifeOS
    return {
      success: true,
      message: 'Current lattice energy is 87%, flow is clockwise with 43 active nodes and 192 synaptic edges.',
      speakResponse: true,
      visualUpdate: 'highlight_stats',
    };
  },
});

registerCommand({
  name: 'show_energy',
  description: 'Show current energy level',
  patterns: ['show energy', 'what is the energy', 'current energy', 'energy level'],
  category: 'query',
  requiresWakeWord: true,
  cooldown: 2000,
  handler: async () => {
    return {
      success: true,
      message: 'Core energy is at 87%. Signal strength is 100% with clockwise flow direction.',
      speakResponse: true,
      visualUpdate: 'pulse_energy',
    };
  },
});

registerCommand({
  name: 'show_flow_direction',
  description: 'Show energy flow direction',
  patterns: ['flow direction', 'which direction', 'flow status', 'energy flow'],
  category: 'query',
  requiresWakeWord: true,
  cooldown: 2000,
  handler: async () => {
    return {
      success: true,
      message: 'Energy is flowing clockwise through the lattice at 336 pulses per minute.',
      speakResponse: true,
      visualUpdate: 'show_flow',
    };
  },
});

registerCommand({
  name: 'show_top_agents',
  description: 'Show top performing agents',
  patterns: ['top agents', 'best agents', 'who are top', 'top performers'],
  category: 'query',
  requiresWakeWord: true,
  cooldown: 3000,
  handler: async () => {
    return {
      success: true,
      message: 'Top performer is carbon-agent-3 with 99.2% success rate and 847 tasks completed. DeFi analyst follows with 97.8% success rate.',
      speakResponse: true,
      visualUpdate: 'highlight_agents',
    };
  },
});

registerCommand({
  name: 'show_layer_status',
  description: 'Show specific layer status',
  patterns: ['^layer (?<layer>\\d|one|two|three|four) status', '^show layer (?<layer>\\d|one|two|three|four)'],
  category: 'query',
  requiresWakeWord: true,
  cooldown: 2000,
  handler: async (params) => {
    const layer = params.entities.layer || '1';
    return {
      success: true,
      message: `Layer ${layer} has 12 active nodes, energy at 92%, and 3 assigned agents. All systems optimal.`,
      speakResponse: true,
      visualUpdate: `highlight_layer_${layer}`,
    };
  },
});

// Action Commands
registerCommand({
  name: 'pulse_center',
  description: 'Trigger center node pulse',
  patterns: ['pulse center', 'pulse the center', 'trigger pulse', 'center pulse'],
  category: 'action',
  requiresWakeWord: true,
  cooldown: 5000,
  handler: async () => {
    return {
      success: true,
      message: 'Center consciousness pulse initiated. Energy radiating outward through all layers.',
      speakResponse: true,
      visualUpdate: 'center_pulse',
    };
  },
});

registerCommand({
  name: 'route_task',
  description: 'Route task to specific agent type',
  patterns: ['route task', 'send task', 'assign task', 'route to'],
  category: 'action',
  requiresWakeWord: true,
  cooldown: 3000,
  handler: async (params) => {
    const agentType = params.entities.agentType || 'general';
    return {
      success: true,
      message: `Routing task to ${agentType} agent on optimal layer. Task assigned to agent node with highest energy.`,
      speakResponse: true,
      visualUpdate: 'show_routing',
    };
  },
});

registerCommand({
  name: 'navigate_workload',
  description: 'Navigate workload between layers',
  patterns: ['navigate workload', 'rebalance', 'move workload', 'shift agents'],
  category: 'action',
  requiresWakeWord: true,
  cooldown: 5000,
  handler: async (params) => {
    const layer = params.entities.layer || '2';
    return {
      success: true,
      message: `Rebalancing workload to layer ${layer}. Moving 5 agents to optimize energy distribution. Estimated completion in 12 seconds.`,
      speakResponse: true,
      visualUpdate: 'show_navigation',
    };
  },
});

// Navigation Commands
registerCommand({
  name: 'rotate_view',
  description: 'Rotate 3D lattice view',
  patterns: ['rotate view', 'spin lattice', 'turn around', 'rotate'],
  category: 'navigation',
  requiresWakeWord: true,
  cooldown: 1000,
  handler: async () => {
    return {
      success: true,
      message: 'Rotating lattice view.',
      speakResponse: false,
      visualUpdate: 'auto_rotate',
    };
  },
});

registerCommand({
  name: 'focus_layer',
  description: 'Focus view on specific layer',
  patterns: ['focus layer', 'zoom to layer', 'show layer', 'view layer'],
  category: 'navigation',
  requiresWakeWord: true,
  cooldown: 2000,
  handler: async (params) => {
    const layer = params.entities.layer || '1';
    return {
      success: true,
      message: `Focusing on layer ${layer}.`,
      speakResponse: true,
      visualUpdate: `focus_layer_${layer}`,
    };
  },
});

registerCommand({
  name: 'reset_view',
  description: 'Reset 3D view to default',
  patterns: ['reset view', 'default view', 'center view', 'reset camera'],
  category: 'navigation',
  requiresWakeWord: true,
  cooldown: 1000,
  handler: async () => {
    return {
      success: true,
      message: 'Resetting to default view.',
      speakResponse: false,
      visualUpdate: 'reset_camera',
    };
  },
});

// Configuration Commands
registerCommand({
  name: 'help',
  description: 'Show available voice commands',
  patterns: ['help', 'what can I say', 'commands', 'voice commands'],
  category: 'configuration',
  requiresWakeWord: true,
  cooldown: 1000,
  handler: async () => {
    return {
      success: true,
      message: 'You can say: show lattice stats, show energy, pulse the center, route task, navigate workload, show top agents, rotate view, focus layer, or reset view.',
      speakResponse: true,
    };
  },
});

registerCommand({
  name: 'stop_listening',
  description: 'Stop voice listening',
  patterns: ['stop listening', 'disable voice', 'turn off voice', 'goodbye vera'],
  category: 'configuration',
  requiresWakeWord: true,
  cooldown: 0,
  handler: async () => {
    return {
      success: true,
      message: 'Voice control disabled. Say "Hey Vera" to reactivate.',
      speakResponse: true,
      visualUpdate: 'voice_disabled',
    };
  },
});

export { commandRegistry };
