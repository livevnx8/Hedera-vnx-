/**
 * OpenShell Agent Dispatcher
 * Wraps Vera's agent dispatcher with OpenShell sandboxing and lattice coordination
 */

import { openShellRuntime, OpenShellPolicy } from './openShellRuntime.js';
import { agentDispatcher } from './agentDispatcher.js';
import { logger } from '../../monitoring/logger.js';
import type { DispatchResult } from './agentDispatcher.js';

export interface SecureDispatchRequest {
  message: string;
  context?: Record<string, unknown>;
  agentType?: string;
  policyName?: string;
  latticeId?: string;
  requireHeartbeat?: boolean;
  consensusMode?: 'broadcast' | 'ring' | 'star' | 'mesh';
}

export interface SecureDispatchResult extends DispatchResult {
  sandboxId: string;
  policyCompliant: boolean;
  violations: string[];
  latticeCoordination?: {
    latticeId: string;
    agentCount: number;
    consensusAchieved: boolean;
  };
}

/**
 * Sovereign Agent Policies
 */
export const SOVEREIGN_POLICIES: Record<string, OpenShellPolicy> = {
  'vera-core': {
    name: 'vera-core',
    description: 'Vera core agent - full lattice access',
    constraints: {
      maxExecutionTimeMs: 60000,
      maxMemoryMb: 1024,
      allowedOperations: [
        'memory.query',
        'memory.store',
        'graph.query',
        'graph.traverse',
        'llm.infer',
        'agent.spawn',
        'agent.message',
        'agent.coordinate',
        'crypto.sign',
        'hcs.submit',
        'lattice.sync',
      ],
      forbiddenOperations: [
        'network.http.external',
        'network.dns.external',
        'filesystem.write.outside_sandbox',
        'process.exec.system',
        'env.read.sensitive',
      ],
      requireApproval: false,
    },
  },
  'sub-agent': {
    name: 'sub-agent',
    description: 'Sub-agent with restricted scope',
    constraints: {
      maxExecutionTimeMs: 30000,
      maxMemoryMb: 512,
      allowedOperations: [
        'memory.query',
        'memory.store',
        'llm.infer',
        'agent.message',
      ],
      forbiddenOperations: [
        'graph.query',
        'agent.spawn',
        'crypto.sign',
        'hcs.submit',
        'network.http.external',
        'network.dns.external',
        'filesystem.write.outside_sandbox',
        'process.exec.system',
      ],
      requireApproval: true,
    },
  },
  'bridge-agent': {
    name: 'bridge-agent',
    description: 'Bridge agent for external data (read-only)',
    constraints: {
      maxExecutionTimeMs: 45000,
      maxMemoryMb: 512,
      allowedOperations: [
        'memory.query',
        'memory.store',
        'llm.infer',
        'agent.message',
        'network.http.hedera',
        'crypto.verify',
      ],
      forbiddenOperations: [
        'agent.spawn',
        'crypto.sign',
        'network.http.external',
        'process.exec.system',
      ],
      requireApproval: true,
    },
  },
};

export class OpenShellAgentDispatcher {
  private lattices: Map<string, string[]> = new Map();

  constructor() {
    // Register sovereign policies
    for (const policy of Object.values(SOVEREIGN_POLICIES)) {
      openShellRuntime.registerPolicy(policy);
    }

    // Listen to OpenShell events
    openShellRuntime.on('policy:violation', ({ agentId, violation }) => {
      logger.warn('OpenShellDispatcher', {
        message: 'Policy violation detected',
        agentId,
        violation,
      });
    });

    openShellRuntime.on('lattice:degraded', ({ latticeId, health }) => {
      logger.error('OpenShellDispatcher', {
        message: 'Lattice degraded',
        latticeId,
        health,
      });
    });

    logger.info('OpenShellDispatcher', {
      message: 'OpenShell agent dispatcher initialized',
      policies: Object.keys(SOVEREIGN_POLICIES),
    });
  }

  /**
   * Dispatch agent with OpenShell sandboxing
   */
  async dispatchSecure(
    request: SecureDispatchRequest
  ): Promise<SecureDispatchResult> {
    const agentId = request.agentType || 'unknown';
    const policyName = request.policyName || 'sub-agent';
    
    // Create sandboxed environment
    const sandbox = openShellRuntime.createSandbox(agentId, policyName);
    
    // Create lattice if specified
    let latticeId = request.latticeId;
    if (latticeId) {
      const lattice = openShellRuntime.createLattice(
        latticeId,
        [agentId],
        request.consensusMode || 'mesh'
      );
      this.lattices.set(latticeId, lattice.agents);
    }

    // Execute in sandbox
    const { success, result, violation } = await openShellRuntime.executeInSandbox(
      agentId,
      'agent.spawn',
      async () => {
        // Record heartbeat before execution
        openShellRuntime.recordHeartbeat({
          agentId,
          timestamp: new Date(),
          status: 'healthy',
          loadFactor: 0.5,
          memoryUsage: 256,
          lastOperation: 'agent.spawn',
          policyCompliant: true,
        });

        // Call underlying agent dispatcher
        return await agentDispatcher.dispatch(request.message, request.context);
      }
    );

    // Collect violations
    const violations = openShellRuntime.getSandboxStats(agentId)?.violations || 0;

    // Get lattice coordination info
    let latticeCoordination;
    if (latticeId) {
      const health = openShellRuntime.getLatticeHealth(latticeId);
      latticeCoordination = {
        latticeId,
        agentCount: health.healthy + health.stressed,
        consensusAchieved: health.policyViolations === 0,
      };
    }

    // Cleanup sandbox
    openShellRuntime.destroySandbox(agentId);

    if (!success || !result) {
      return {
        ...result,
        success: false,
        sandboxId: sandbox.sessionId,
        policyCompliant: !violation,
        violations: violation ? [violation.reason] : [],
        latticeCoordination,
      } as SecureDispatchResult;
    }

    return {
      ...result,
      sandboxId: sandbox.sessionId,
      policyCompliant: violations === 0,
      violations: violations > 0 ? ['Policy violations detected'] : [],
      latticeCoordination,
    };
  }

  /**
   * Create a multi-agent lattice swarm
   */
  async createLatticeSwarm(
    latticeId: string,
    agentConfigs: Array<{
      agentType: string;
      policyName?: string;
      task: string;
    }>,
    coordinationMode: 'broadcast' | 'ring' | 'star' | 'mesh' = 'mesh'
  ): Promise<{
    latticeId: string;
    agents: string[];
    coordination: string;
    health: ReturnType<typeof openShellRuntime.getLatticeHealth>;
  }> {
    const agentIds: string[] = [];

    // Create sandboxes for each agent
    for (const config of agentConfigs) {
      const agentId = `${config.agentType}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      agentIds.push(agentId);
      
      openShellRuntime.createSandbox(agentId, config.policyName || 'sub-agent');
      
      // Start heartbeat
      openShellRuntime.recordHeartbeat({
        agentId,
        timestamp: new Date(),
        status: 'healthy',
        loadFactor: 0.3,
        memoryUsage: 128,
        lastOperation: 'lattice.join',
        policyCompliant: true,
      });
    }

    // Create lattice coordination
    openShellRuntime.createLattice(latticeId, agentIds, coordinationMode);
    this.lattices.set(latticeId, agentIds);

    // Broadcast lattice formation
    openShellRuntime.broadcastToLattice(latticeId, {
      type: 'lattice.formed',
      timestamp: new Date(),
      agentCount: agentIds.length,
      coordinationMode,
    });

    const health = openShellRuntime.getLatticeHealth(latticeId);

    logger.info('OpenShellDispatcher', {
      message: 'Lattice swarm created',
      latticeId,
      agents: agentIds.length,
      coordinationMode,
    });

    return {
      latticeId,
      agents: agentIds,
      coordination: coordinationMode,
      health,
    };
  }

  /**
   * Broadcast task to lattice
   */
  async broadcastToLattice(
    latticeId: string,
    task: string,
    context?: Record<string, unknown>
  ): Promise<{
    broadcasted: boolean;
    agentsReached: number;
  }> {
    const agents = this.lattices.get(latticeId);
    if (!agents) {
      return { broadcasted: false, agentsReached: 0 };
    }

    openShellRuntime.broadcastToLattice(latticeId, {
      type: 'task.broadcast',
      task,
      context,
      timestamp: new Date(),
    });

    return {
      broadcasted: true,
      agentsReached: agents.length,
    };
  }

  /**
   * Get lattice status
   */
  getLatticeStatus(latticeId: string): {
    exists: boolean;
    agents: string[];
    health: ReturnType<typeof openShellRuntime.getLatticeHealth>;
    sandboxes: Array<{
      agentId: string;
      operations: number;
      violations: number;
    }>;
  } {
    const agents = this.lattices.get(latticeId);
    if (!agents) {
      return { exists: false, agents: [], health: { healthy: 0, stressed: 0, error: 0, offline: 0, policyViolations: 0 }, sandboxes: [] };
    }

    const health = openShellRuntime.getLatticeHealth(latticeId);
    const sandboxes = agents.map(agentId => {
      const stats = openShellRuntime.getSandboxStats(agentId);
      return {
        agentId,
        operations: stats?.operations || 0,
        violations: stats?.violations || 0,
      };
    });

    return { exists: true, agents, health, sandboxes };
  }

  /**
   * Destroy lattice and cleanup
   */
  destroyLattice(latticeId: string): void {
    const agents = this.lattices.get(latticeId);
    if (agents) {
      for (const agentId of agents) {
        openShellRuntime.destroySandbox(agentId);
      }
      this.lattices.delete(latticeId);
    }

    logger.info('OpenShellDispatcher', {
      message: 'Lattice destroyed',
      latticeId,
    });
  }

  /**
   * Get all active lattices
   */
  getActiveLattices(): Array<{
    latticeId: string;
    agentCount: number;
    health: ReturnType<typeof openShellRuntime.getLatticeHealth>;
  }> {
    return Array.from(this.lattices.entries()).map(([latticeId, agents]) => ({
      latticeId,
      agentCount: agents.length,
      health: openShellRuntime.getLatticeHealth(latticeId),
    }));
  }
}

// Export singleton
export const openShellDispatcher = new OpenShellAgentDispatcher();
