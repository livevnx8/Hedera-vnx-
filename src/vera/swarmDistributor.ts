/**
 * Vera's Swarm Load Balancer
 * 
 * Distributes tasks across the 7 domain agents via HCS,
 * tracks agent capacity, and routes to least-loaded agents.
 */
import { veraOrchestrator } from './orchestrator/orchestratorLoop.js';

interface AgentCapacity {
  agentId: string;
  agentType: string;
  activeTasks: number;
  maxTasks: number;
  avgLatency: number;
  successRate: number;
  lastHeartbeat: number;
  capabilities: string[];
}

interface TaskRoute {
  taskId: string;
  agentId: string;
  tool: string;
  priority: number;
  estimatedCost: number;
  routeReason: string;
}

const AGENT_CAPS: Record<string, string[]> = {
  'compliance-agent': ['compliance', 'audit', 'verify', 'report'],
  'defi-agent': ['defi', 'swap', 'liquidity', 'yield', 'saucerswap'],
  'nft-agent': ['nft', 'mint', 'transfer', 'royalty'],
  'data-processor': ['data', 'query', 'analytics', 'mirror'],
  'treasury-agent': ['treasury', 'rebalance', 'payment', 'schedule'],
  'hcs-agent': ['hcs', 'topic', 'message', 'stream'],
  'hedera-agent': ['hedera', 'hts', 'account', 'token'],
};

class SwarmDistributor {
  private agents = new Map<string, AgentCapacity>();
  private tasks = new Map<string, TaskRoute>();

  registerAgent(agentId: string, agentType: string, capabilities: string[]): void {
    this.agents.set(agentId, {
      agentId,
      agentType,
      activeTasks: 0,
      maxTasks: 10,
      avgLatency: 100,
      successRate: 1.0,
      lastHeartbeat: Date.now(),
      capabilities,
    });
  }

  updateHeartbeat(agentId: string, metrics: Partial<AgentCapacity>): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      Object.assign(agent, metrics);
      agent.lastHeartbeat = Date.now();
    }
  }

  routeTask(tool: string, args: unknown, priority = 5): TaskRoute | null {
    // Find best agent
    const candidates = this.findCandidates(tool);
    if (candidates.length === 0) return null;

    // Score: prefer low load, low latency, high success
    const scored = candidates.map(a => ({
      agent: a,
      score: (
        (1 - a.activeTasks / a.maxTasks) * 0.4 +
        (1 - Math.min(a.avgLatency, 1000) / 1000) * 0.3 +
        a.successRate * 0.3
      ),
    }));

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].agent;

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const route: TaskRoute = {
      taskId,
      agentId: best.agentId,
      tool,
      priority,
      estimatedCost: 0.1,
      routeReason: `${best.agentType} (load: ${best.activeTasks}/${best.maxTasks}, latency: ${best.avgLatency}ms)`,
    };

    this.tasks.set(taskId, route);
    best.activeTasks++;

    // Submit to HCS
    this.submitToHCS(route, args);

    return route;
  }

  private findCandidates(tool: string): AgentCapacity[] {
    const toolCategory = tool.split('_')[0];
    const now = Date.now();

    return Array.from(this.agents.values()).filter(a => {
      // Healthy
      if (now - a.lastHeartbeat > 60000) return false;
      if (a.successRate < 0.5) return false;
      if (a.activeTasks >= a.maxTasks) return false;

      // Capable
      return a.capabilities.some(c => 
        tool.includes(c) || 
        AGENT_CAPS[a.agentType]?.includes(toolCategory)
      );
    });
  }

  private async submitToHCS(route: TaskRoute, args: unknown): Promise<void> {
    try {
      await veraOrchestrator.submitTask(
        `Execute ${route.tool}`,
        route.agentId.split('-')[0],
        route.estimatedCost,
        {
          requiredConfidence: 0.8,
          deadlineMs: 60000,
          metadata: { tool: route.tool, params: args, targetAgent: route.agentId },
        }
      );
    } catch { /* silent */ }
  }

  completeTask(taskId: string, success: boolean): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const agent = this.agents.get(task.agentId);
    if (agent) {
      agent.activeTasks = Math.max(0, agent.activeTasks - 1);
      // Update success rate with exponential decay
      agent.successRate = agent.successRate * 0.9 + (success ? 1 : 0) * 0.1;
    }

    this.tasks.delete(taskId);
  }

  getSwarmStats(): {
    agents: number;
    activeTasks: number;
    healthyAgents: number;
    avgLoad: number;
  } {
    const now = Date.now();
    const agents = Array.from(this.agents.values());
    const healthy = agents.filter(a => now - a.lastHeartbeat < 60000);
    
    return {
      agents: agents.length,
      activeTasks: agents.reduce((s, a) => s + a.activeTasks, 0),
      healthyAgents: healthy.length,
      avgLoad: healthy.length > 0 
        ? healthy.reduce((s, a) => s + a.activeTasks / a.maxTasks, 0) / healthy.length 
        : 0,
    };
  }

  getAgentLoad(): AgentCapacity[] {
    return Array.from(this.agents.values())
      .sort((a, b) => b.activeTasks - a.activeTasks);
  }
}

export const swarmDistributor = new SwarmDistributor();

// Auto-register known agents
for (const [type, caps] of Object.entries(AGENT_CAPS)) {
  swarmDistributor.registerAgent(`${type}-001`, type, caps);
}
