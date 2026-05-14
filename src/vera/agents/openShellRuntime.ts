/**
 * NVIDIA OpenShell Runtime Integration for Vera
 * Provides agent sandboxing, policy enforcement, and secure multi-agent coordination
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface OpenShellPolicy {
  name: string;
  description: string;
  constraints: {
    maxExecutionTimeMs: number;
    maxMemoryMb: number;
    allowedOperations: string[];
    forbiddenOperations: string[];
    requireApproval: boolean;
  };
}

export interface AgentSandbox {
  agentId: string;
  sessionId: string;
  policy: OpenShellPolicy;
  status: 'idle' | 'running' | 'paused' | 'error' | 'completed';
  startTime: Date;
  memoryUsage: number;
  operationsExecuted: string[];
  violations: PolicyViolation[];
}

export interface PolicyViolation {
  timestamp: Date;
  operation: string;
  reason: string;
  severity: 'warning' | 'error' | 'critical';
  action: 'blocked' | 'allowed' | 'logged';
}

export interface HeartbeatPulse {
  agentId: string;
  timestamp: Date;
  status: 'healthy' | 'stressed' | 'error' | 'offline';
  loadFactor: number; // 0-1
  memoryUsage: number;
  lastOperation: string;
  policyCompliant: boolean;
}

export interface LatticeCoordination {
  latticeId: string;
  agents: string[];
  coordinationMode: 'broadcast' | 'ring' | 'star' | 'mesh';
  sharedContext: Map<string, unknown>;
  consensusRequired: boolean;
}

export class OpenShellRuntime extends EventEmitter {
  private sandboxes: Map<string, AgentSandbox> = new Map();
  private policies: Map<string, OpenShellPolicy> = new Map();
  private heartbeats: Map<string, HeartbeatPulse> = new Map();
  private lattices: Map<string, LatticeCoordination> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  // Default sovereign policy - restrictive but functional
  private readonly defaultPolicy: OpenShellPolicy = {
    name: 'vera-sovereign-default',
    description: 'Default policy for Vera agents - local-only, no external calls',
    constraints: {
      maxExecutionTimeMs: 30000,
      maxMemoryMb: 512,
      allowedOperations: [
        'memory.query',
        'memory.store',
        'graph.query',
        'graph.traverse',
        'llm.infer',
        'agent.spawn',
        'agent.message',
        'crypto.sign',
        'hcs.submit',
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
  };

  constructor() {
    super();
    this.startMonitoring();
    logger.info('OpenShellRuntime', { message: 'OpenShell runtime initialized' });
  }

  /**
   * Register a policy for agent sandboxing
   */
  registerPolicy(policy: OpenShellPolicy): void {
    this.policies.set(policy.name, policy);
    logger.info('OpenShellRuntime', {
      message: 'Policy registered',
      policy: policy.name,
    });
  }

  /**
   * Create a sandboxed agent environment
   */
  createSandbox(agentId: string, policyName?: string): AgentSandbox {
    const policy = policyName 
      ? this.policies.get(policyName) || this.defaultPolicy
      : this.defaultPolicy;

    const sandbox: AgentSandbox = {
      agentId,
      sessionId: `shell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      policy,
      status: 'idle',
      startTime: new Date(),
      memoryUsage: 0,
      operationsExecuted: [],
      violations: [],
    };

    this.sandboxes.set(agentId, sandbox);
    
    logger.info('OpenShellRuntime', {
      message: 'Sandbox created',
      agentId,
      sessionId: sandbox.sessionId,
      policy: policy.name,
    });

    this.emit('sandbox:created', { agentId, sandbox });
    return sandbox;
  }

  /**
   * Execute an operation within sandbox constraints
   */
  async executeInSandbox<T>(
    agentId: string,
    operation: string,
    executor: () => Promise<T>
  ): Promise<{ success: boolean; result?: T; violation?: PolicyViolation }> {
    const sandbox = this.sandboxes.get(agentId);
    if (!sandbox) {
      throw new Error(`Sandbox not found for agent ${agentId}`);
    }

    // Check policy constraints
    const violation = this.checkPolicy(sandbox, operation);
    if (violation && violation.severity === 'critical') {
      sandbox.violations.push(violation);
      sandbox.status = 'error';
      this.emit('policy:violation', { agentId, violation });
      return { success: false, violation };
    }

    if (violation) {
      sandbox.violations.push(violation);
    }

    // Execute with timeout
    sandbox.status = 'running';
    sandbox.operationsExecuted.push(operation);
    
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), 
          sandbox.policy.constraints.maxExecutionTimeMs);
      });

      const result = await Promise.race([executor(), timeoutPromise]);
      
      sandbox.status = 'completed';
      this.emit('operation:complete', { agentId, operation });
      
      return { success: true, result };
    } catch (error) {
      sandbox.status = 'error';
      logger.error('OpenShellRuntime', {
        message: 'Sandbox execution error',
        agentId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return { 
        success: false, 
        violation: {
          timestamp: new Date(),
          operation,
          reason: error instanceof Error ? error.message : 'Execution failed',
          severity: 'error',
          action: 'blocked',
        }
      };
    }
  }

  /**
   * Check if operation complies with policy
   */
  private checkPolicy(sandbox: AgentSandbox, operation: string): PolicyViolation | null {
    const constraints = sandbox.policy.constraints;

    // Check forbidden operations
    if (constraints.forbiddenOperations.includes(operation)) {
      return {
        timestamp: new Date(),
        operation,
        reason: 'Operation is in forbidden list',
        severity: 'critical',
        action: 'blocked',
      };
    }

    // Check allowed operations (if whitelist is defined)
    if (constraints.allowedOperations.length > 0 && 
        !constraints.allowedOperations.includes(operation)) {
      return {
        timestamp: new Date(),
        operation,
        reason: 'Operation not in allowed list',
        severity: 'warning',
        action: 'logged',
      };
    }

    return null;
  }

  /**
   * Record heartbeat from agent
   */
  recordHeartbeat(pulse: HeartbeatPulse): void {
    this.heartbeats.set(pulse.agentId, pulse);
    
    // Check for policy compliance issues
    if (!pulse.policyCompliant) {
      this.emit('heartbeat:violation', { agentId: pulse.agentId, pulse });
    }

    // Emit lattice coordination event for swarm awareness
    this.emit('heartbeat:received', pulse);
  }

  /**
   * Create a multi-agent lattice coordination
   */
  createLattice(
    latticeId: string, 
    agentIds: string[], 
    mode: LatticeCoordination['coordinationMode'] = 'mesh'
  ): LatticeCoordination {
    const lattice: LatticeCoordination = {
      latticeId,
      agents: agentIds,
      coordinationMode: mode,
      sharedContext: new Map(),
      consensusRequired: true,
    };

    this.lattices.set(latticeId, lattice);
    
    logger.info('OpenShellRuntime', {
      message: 'Lattice coordination created',
      latticeId,
      agents: agentIds.length,
      mode,
    });

    this.emit('lattice:created', lattice);
    return lattice;
  }

  /**
   * Broadcast message to all agents in lattice
   */
  broadcastToLattice(latticeId: string, message: unknown): void {
    const lattice = this.lattices.get(latticeId);
    if (!lattice) {
      throw new Error(`Lattice ${latticeId} not found`);
    }

    for (const agentId of lattice.agents) {
      this.emit('lattice:message', {
        latticeId,
        agentId,
        message,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get lattice health status
   */
  getLatticeHealth(latticeId: string): {
    healthy: number;
    stressed: number;
    error: number;
    offline: number;
    policyViolations: number;
  } {
    const lattice = this.lattices.get(latticeId);
    if (!lattice) {
      return { healthy: 0, stressed: 0, error: 0, offline: 0, policyViolations: 0 };
    }

    const health = { healthy: 0, stressed: 0, error: 0, offline: 0, policyViolations: 0 };

    for (const agentId of lattice.agents) {
      const heartbeat = this.heartbeats.get(agentId);
      if (!heartbeat) {
        health.offline++;
        continue;
      }

      health[heartbeat.status]++;
      if (!heartbeat.policyCompliant) {
        health.policyViolations++;
      }
    }

    return health;
  }

  /**
   * Get sandbox statistics
   */
  getSandboxStats(agentId: string): {
    operations: number;
    violations: number;
    runtime: number;
    memoryPeak: number;
  } | null {
    const sandbox = this.sandboxes.get(agentId);
    if (!sandbox) return null;

    return {
      operations: sandbox.operationsExecuted.length,
      violations: sandbox.violations.length,
      runtime: Date.now() - sandbox.startTime.getTime(),
      memoryPeak: sandbox.memoryUsage,
    };
  }

  /**
   * Start health monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      // Check for stale heartbeats
      const now = Date.now();
      for (const [agentId, pulse] of this.heartbeats) {
        const age = now - pulse.timestamp.getTime();
        if (age > 30000 && pulse.status !== 'offline') {
          pulse.status = 'offline';
          this.emit('agent:offline', { agentId, lastSeen: pulse.timestamp });
        }
      }

      // Monitor lattice health
      for (const [latticeId, lattice] of this.lattices) {
        const health = this.getLatticeHealth(latticeId);
        const total = lattice.agents.length;
        const healthy = health.healthy + health.stressed;
        
        if (healthy < total * 0.5) {
          this.emit('lattice:degraded', { latticeId, health, threshold: '50%' });
        }
      }
    }, 5000);
  }

  /**
   * Destroy sandbox and cleanup
   */
  destroySandbox(agentId: string): void {
    const sandbox = this.sandboxes.get(agentId);
    if (sandbox) {
      sandbox.status = 'completed';
      this.emit('sandbox:destroyed', { agentId, sessionId: sandbox.sessionId });
      this.sandboxes.delete(agentId);
      this.heartbeats.delete(agentId);
      
      logger.info('OpenShellRuntime', {
        message: 'Sandbox destroyed',
        agentId,
        sessionId: sandbox.sessionId,
      });
    }
  }

  /**
   * Shutdown runtime
   */
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    // Cleanup all sandboxes
    for (const agentId of this.sandboxes.keys()) {
      this.destroySandbox(agentId);
    }
    
    this.removeAllListeners();
    logger.info('OpenShellRuntime', { message: 'OpenShell runtime shutdown' });
  }
}

// Export singleton instance
export const openShellRuntime = new OpenShellRuntime();
