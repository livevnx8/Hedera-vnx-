/**
 * Vera Agent Auto-Scaler
 * 
 * Monitors agent swarm load and dynamically scales based on queue depth,
 * task complexity, and resource utilization.
 */

import { EventEmitter } from 'events';
import { logger } from '../blueprints/logger.mjs';
import { spawn } from 'child_process';
import { getTemplate, createAgentConfig } from '../templates/agentRegistry.mjs';

class AgentAutoScaler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.thresholds = {
      high: options.highThreshold || 0.8,      // 80% = scale up
      low: options.lowThreshold || 0.3,        // 30% = scale down
      maxAgents: options.maxAgents || 100,     // Max per type
      minAgents: options.minAgents || 2,         // Min per type
      maxTotal: options.maxTotal || 400          // Global max
    };
    
    this.cooldown = options.cooldown || 300000; // 5 min cooldown
    this.lastScaleTime = 0;
    this.agents = new Map(); // agentId -> { pid, type, startTime, status }
    this.metrics = {
      scaleUpEvents: 0,
      scaleDownEvents: 0,
      totalSpawned: 0,
      totalShutdown: 0
    };
    
    // Start monitoring
    this.monitorInterval = setInterval(() => this.evaluate(), 60000); // Every minute
  }

  /**
   * Register a running agent
   */
  registerAgent(agentId, pid, type) {
    this.agents.set(agentId, {
      pid,
      type,
      startTime: Date.now(),
      status: 'running'
    });
    
    logger.info('Agent registered with autoscaler', { agentId, type, pid });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'stopped';
      this.agents.delete(agentId);
      logger.info('Agent unregistered', { agentId });
    }
  }

  /**
   * Get current utilization metrics
   */
  async getMetrics() {
    const byType = {};
    let totalActive = 0;
    
    for (const [id, agent] of this.agents) {
      if (agent.status === 'running') {
        byType[agent.type] = (byType[agent.type] || 0) + 1;
        totalActive++;
      }
    }
    
    // Simulated queue depth (in production, read from actual queue)
    const queueDepth = Math.floor(Math.random() * 100);
    const utilization = Math.min(queueDepth / 100, 1);
    
    return {
      totalActive,
      byType,
      queueDepth,
      utilization,
      capacity: this.thresholds.maxTotal,
      canScaleUp: totalActive < this.thresholds.maxTotal && utilization > this.thresholds.high,
      canScaleDown: totalActive > this.thresholds.minAgents && utilization < this.thresholds.low
    };
  }

  /**
   * Evaluate and scale if needed
   */
  async evaluate() {
    const now = Date.now();
    
    // Check cooldown
    if (now - this.lastScaleTime < this.cooldown) {
      return;
    }
    
    const metrics = await this.getMetrics();
    logger.debug('Auto-scaler evaluation', metrics);
    
    if (metrics.canScaleUp) {
      await this.scaleUp(5); // Add 5 agents
    } else if (metrics.canScaleDown) {
      await this.scaleDown(3); // Remove 3 agents
    }
  }

  /**
   * Scale up by spawning new agents
   */
  async scaleUp(count) {
    const now = Date.now();
    this.lastScaleTime = now;
    
    logger.info('Scaling up', { count });
    
    // Determine which types need more agents
    const templateIds = ['healthcare-supply', 'finance-fraud-detection', 'logistics-tracker'];
    
    for (let i = 0; i < count; i++) {
      const templateId = templateIds[i % templateIds.length];
      await this.spawnAgent(templateId);
    }
    
    this.metrics.scaleUpEvents++;
    this.emit('scaleUp', { count, timestamp: now });
  }

  /**
   * Scale down by shutting down idle agents
   */
  async scaleDown(count) {
    const now = Date.now();
    this.lastScaleTime = now;
    
    logger.info('Scaling down', { count });
    
    // Find oldest running agents to shut down
    const candidates = Array.from(this.agents.entries())
      .filter(([id, agent]) => agent.status === 'running')
      .sort((a, b) => a[1].startTime - b[1].startTime);
    
    for (let i = 0; i < Math.min(count, candidates.length); i++) {
      const [agentId] = candidates[i];
      await this.shutdownAgent(agentId);
    }
    
    this.metrics.scaleDownEvents++;
    this.emit('scaleDown', { count, timestamp: now });
  }

  /**
   * Spawn a new agent process
   */
  async spawnAgent(templateId) {
    const template = getTemplate(templateId);
    const agentId = `${templateId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    try {
      // Determine agent file path based on template
      const agentFiles = {
        'healthcare-supply': 'healthcare-supply-1.mjs',
        'healthcare-compliance': 'healthcare-hipaa-1.mjs',
        'finance-fraud-detection': 'finance-fraud-1.mjs',
        'logistics-tracker': 'logistics-track-1.mjs'
      };
      
      const agentFile = agentFiles[templateId];
      if (!agentFile) {
        logger.warn('No agent file for template', { templateId });
        return null;
      }
      
      // Spawn the agent process
      const child = spawn('node', [`./agents/${agentFile}`], {
        detached: true,
        stdio: 'ignore',
        env: { 
          ...process.env, 
          AGENT_ID: agentId,
          HEDERA_OPERATOR_ACCOUNT_ID: process.env.HEDERA_OPERATOR_ACCOUNT_ID,
          HEDERA_OPERATOR_PRIVATE_KEY: process.env.HEDERA_OPERATOR_PRIVATE_KEY
        }
      });
      
      child.unref();
      
      this.registerAgent(agentId, child.pid, templateId);
      this.metrics.totalSpawned++;
      
      logger.info('Agent spawned', { agentId, templateId, pid: child.pid });
      
      return { agentId, pid: child.pid };
    } catch (error) {
      logger.error('Failed to spawn agent', { templateId, error: error.message });
      return null;
    }
  }

  /**
   * Gracefully shutdown an agent
   */
  async shutdownAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    try {
      // Send graceful shutdown signal
      process.kill(agent.pid, 'SIGTERM');
      
      agent.status = 'shutting_down';
      this.metrics.totalShutdown++;
      
      // Remove after grace period
      setTimeout(() => {
        this.unregisterAgent(agentId);
      }, 5000);
      
      logger.info('Agent shutdown initiated', { agentId, pid: agent.pid });
    } catch (error) {
      logger.error('Failed to shutdown agent', { agentId, error: error.message });
    }
  }

  /**
   * Get scaler statistics
   */
  getStats() {
    return {
      agents: {
        total: this.agents.size,
        byStatus: Array.from(this.agents.values()).reduce((acc, a) => {
          acc[a.status] = (acc[a.status] || 0) + 1;
          return acc;
        }, {})
      },
      metrics: { ...this.metrics },
      thresholds: { ...this.thresholds },
      lastScaleTime: this.lastScaleTime
    };
  }

  /**
   * Stop the auto-scaler
   */
  stop() {
    clearInterval(this.monitorInterval);
    logger.info('Auto-scaler stopped');
  }
}

// Export singleton
let scalerInstance = null;

export function getAutoScaler(options) {
  if (!scalerInstance) {
    scalerInstance = new AgentAutoScaler(options);
  }
  return scalerInstance;
}

export function resetAutoScaler() {
  if (scalerInstance) {
    scalerInstance.stop();
    scalerInstance = null;
  }
}

export default AgentAutoScaler;
