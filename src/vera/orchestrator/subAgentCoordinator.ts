/**
 * Vera Sub-Agent Coordinator
 * 
 * Manages the lifecycle of sub-agents:
 * - Spawn new sub-agents
 * - Monitor sub-agent health
 * - Route tasks to appropriate sub-agents
 * - Collect metrics from all sub-agents
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { swarmEventLogger } from '../logging/swarmEventLogger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SubAgentRole = 
  | 'GRID_MONITOR' 
  | 'WEATHER_ANALYZER' 
  | 'LOAD_PREDICTOR'
  | 'THREAT_DETECTOR'
  | 'CONTRACT_MONITOR'
  | 'ACCESS_ANALYZER'
  | 'WHALE_TRACKER'
  | 'ARB_OPPORTUNITY'
  | 'YIELD_OPTIMIZER';

export interface SubAgentConfig {
  id: string;
  parentId: string;
  role: SubAgentRole;
  interval?: number;
  domain: 'energy' | 'security' | 'defi' | 'carbon';
  params?: Record<string, unknown>;
}

export interface SubAgentStatus {
  id: string;
  parentId: string;
  role: SubAgentRole;
  domain: string;
  state: 'IDLE' | 'RUNNING' | 'ERROR' | 'STOPPED';
  lastRun: number;
  runCount: number;
  errorCount: number;
  metrics: {
    executionsTotal: number;
    errorsTotal: number;
    avgExecutionTimeMs: number;
  };
}

// ─── Sub-Agent Registry ──────────────────────────────────────────────────────

class SubAgentRegistry extends EventEmitter {
  private subAgents = new Map<string, SubAgentStatus>();
  private activeTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Register a new sub-agent
   */
  register(config: SubAgentConfig): SubAgentStatus {
    const status: SubAgentStatus = {
      id: config.id,
      parentId: config.parentId,
      role: config.role,
      domain: config.domain,
      state: 'IDLE',
      lastRun: 0,
      runCount: 0,
      errorCount: 0,
      metrics: {
        executionsTotal: 0,
        errorsTotal: 0,
        avgExecutionTimeMs: 0
      }
    };

    this.subAgents.set(config.id, status);
    
    // Log to swarm
    swarmEventLogger.log('lattice.agent-joined', {
      from: config.parentId,
      to: config.id,
      data: {
        role: config.role,
        domain: config.domain,
        interval: config.interval || 60000
      }
    });

    logger.info('SubAgentCoordinator', {
      message: 'Sub-agent registered',
      subAgentId: config.id,
      role: config.role,
      domain: config.domain
    });

    this.emit('registered', status);
    return status;
  }

  /**
   * Update sub-agent status
   */
  updateStatus(id: string, update: Partial<SubAgentStatus>): void {
    const status = this.subAgents.get(id);
    if (!status) return;

    Object.assign(status, update);
    this.emit('updated', status);
  }

  /**
   * Record sub-agent execution
   */
  recordExecution(id: string, executionTimeMs: number, success: boolean): void {
    const status = this.subAgents.get(id);
    if (!status) return;

    status.lastRun = Date.now();
    status.runCount++;
    status.metrics.executionsTotal++;
    
    if (!success) {
      status.errorCount++;
      status.metrics.errorsTotal++;
    }

    // Update average execution time
    const prevAvg = status.metrics.avgExecutionTimeMs;
    const count = status.metrics.executionsTotal;
    status.metrics.avgExecutionTimeMs = 
      (prevAvg * (count - 1) + executionTimeMs) / count;

    this.emit('execution', { id, executionTimeMs, success });
  }

  /**
   * Unregister a sub-agent
   */
  unregister(id: string): boolean {
    const status = this.subAgents.get(id);
    if (!status) return false;

    // Clear any active timer
    const timer = this.activeTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.activeTimers.delete(id);
    }

    status.state = 'STOPPED';
    this.subAgents.delete(id);

    // Log to swarm
    swarmEventLogger.log('lattice.agent-left', {
      from: status.parentId,
      to: id,
      data: {
        role: status.role,
        finalRunCount: status.runCount
      }
    });

    logger.info('SubAgentCoordinator', {
      message: 'Sub-agent unregistered',
      subAgentId: id
    });

    this.emit('unregistered', id);
    return true;
  }

  /**
   * Get all sub-agents
   */
  getAll(): SubAgentStatus[] {
    return Array.from(this.subAgents.values());
  }

  /**
   * Get sub-agents by domain
   */
  getByDomain(domain: string): SubAgentStatus[] {
    return this.getAll().filter(s => s.domain === domain);
  }

  /**
   * Get sub-agents by parent
   */
  getByParent(parentId: string): SubAgentStatus[] {
    return this.getAll().filter(s => s.parentId === parentId);
  }

  /**
   * Get single sub-agent
   */
  get(id: string): SubAgentStatus | undefined {
    return this.subAgents.get(id);
  }

  /**
   * Get health summary
   */
  getHealth(): {
    total: number;
    idle: number;
    running: number;
    error: number;
    byDomain: Record<string, number>;
  } {
    const all = this.getAll();
    return {
      total: all.length,
      idle: all.filter(s => s.state === 'IDLE').length,
      running: all.filter(s => s.state === 'RUNNING').length,
      error: all.filter(s => s.state === 'ERROR').length,
      byDomain: all.reduce((acc, s) => {
        acc[s.domain] = (acc[s.domain] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}

// ─── Coordinator ──────────────────────────────────────────────────────────────

export class SubAgentCoordinator extends EventEmitter {
  private registry: SubAgentRegistry;

  constructor() {
    super();
    this.registry = new SubAgentRegistry();
    
    // Forward registry events
    this.registry.on('registered', (s) => this.emit('subAgent:registered', s));
    this.registry.on('unregistered', (id) => this.emit('subAgent:unregistered', id));
    this.registry.on('execution', (e) => this.emit('subAgent:execution', e));
  }

  /**
   * Spawn a new sub-agent
   */
  async spawn(config: SubAgentConfig): Promise<SubAgentStatus> {
    // Validate role
    const validRoles: SubAgentRole[] = [
      'GRID_MONITOR', 'WEATHER_ANALYZER', 'LOAD_PREDICTOR',
      'THREAT_DETECTOR', 'CONTRACT_MONITOR', 'ACCESS_ANALYZER',
      'WHALE_TRACKER', 'ARB_OPPORTUNITY', 'YIELD_OPTIMIZER'
    ];
    
    if (!validRoles.includes(config.role)) {
      throw new Error(`Invalid sub-agent role: ${config.role}`);
    }

    // Register the sub-agent
    const status = this.registry.register(config);
    
    logger.info('SubAgentCoordinator', {
      message: 'Spawned sub-agent',
      subAgentId: config.id,
      role: config.role
    });

    return status;
  }

  /**
   * Kill a sub-agent
   */
  async kill(subAgentId: string): Promise<boolean> {
    return this.registry.unregister(subAgentId);
  }

  /**
   * Get all sub-agents
   */
  getAllSubAgents(): SubAgentStatus[] {
    return this.registry.getAll();
  }

  /**
   * Get sub-agents by domain
   */
  getByDomain(domain: string): SubAgentStatus[] {
    return this.registry.getByDomain(domain);
  }

  /**
   * Get health status
   */
  getHealth() {
    return this.registry.getHealth();
  }

  /**
   * Record execution from a sub-agent
   */
  recordExecution(subAgentId: string, executionTimeMs: number, success: boolean): void {
    this.registry.recordExecution(subAgentId, executionTimeMs, success);
  }

  /**
   * Update sub-agent state
   */
  updateState(subAgentId: string, state: SubAgentStatus['state']): void {
    this.registry.updateStatus(subAgentId, { state });
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const subAgentCoordinator = new SubAgentCoordinator();
