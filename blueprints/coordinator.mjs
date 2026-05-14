#!/usr/bin/env node
/**
 * AgentCoordinator - Routes tasks between parent and sub-agents
 * Manages sub-agent lifecycle and task distribution
 * Phase 3 Implementation
 */

import { SubAgent, LoadPredictionSubAgent, AnomalyDetectionSubAgent, WhaleTrackingSubAgent, ThreatAnalysisSubAgent } from './sub-agent.mjs';
import { AdaptiveScheduler, PriorityQueue, CircuitBreaker, DomainSchedulers } from './adaptive-scheduler.mjs';

/**
 * AgentCoordinator - Central orchestrator for multi-agent system
 */
export class AgentCoordinator {
  constructor(config = {}) {
    this.id = config.id || `coordinator-${Date.now()}`;
    this.subAgents = new Map();
    this.schedulers = DomainSchedulers;
    this.taskQueue = new PriorityQueue();
    this.circuitBreakers = new Map();
    
    // Configuration
    this.maxSubAgents = config.maxSubAgents || 10;
    this.subAgentTTL = config.subAgentTTL || 300000; // 5 min idle timeout
    
    // Health tracking
    this.health = {
      tasksRouted: 0,
      tasksCompleted: 0,
      activeSubAgents: 0,
      lastCycle: Date.now()
    };
  }
  
  /**
   * Spawn a specialized sub-agent
   * @param {string} type - Sub-agent type
   * @param {string} parentId - Parent agent ID
   * @returns {SubAgent} Spawned sub-agent
   */
  spawnSubAgent(type, parentId) {
    if (this.subAgents.size >= this.maxSubAgents) {
      this._cleanupIdleSubAgents();
    }
    
    let subAgent;
    const id = `${type.toLowerCase()}-${Date.now()}`;
    
    switch (type) {
      case 'LOAD_PREDICTOR':
        subAgent = new LoadPredictionSubAgent(parentId);
        break;
      case 'ANOMALY_DETECTOR':
        subAgent = new AnomalyDetectionSubAgent(parentId);
        break;
      case 'WHALE_TRACKER':
        subAgent = new WhaleTrackingSubAgent(parentId);
        break;
      case 'THREAT_ANALYZER':
        subAgent = new ThreatAnalysisSubAgent(parentId);
        break;
      default:
        throw new Error(`Unknown sub-agent type: ${type}`);
    }
    
    this.subAgents.set(subAgent.id, {
      agent: subAgent,
      parentId,
      spawnedAt: Date.now(),
      lastUsed: Date.now()
    });
    
    this.health.activeSubAgents = this.subAgents.size;
    return subAgent;
  }
  
  /**
   * Route task to appropriate sub-agent
   * @param {string} parentId - Parent agent requesting
   * @param {string} taskType - Type of task
   * @param {Object} data - Task data
   * @param {number} priority - Task priority
   */
  async routeTask(parentId, taskType, data, priority = 5) {
    const task = {
      id: Math.random().toString(36).substring(7),
      parentId,
      taskType,
      data,
      enqueuedAt: Date.now()
    };
    
    // Add to priority queue
    this.taskQueue.enqueue(task, priority);
    this.health.tasksRouted++;
    
    // Process queue
    await this._processQueue();
    
    return task.id;
  }
  
  async _processQueue() {
    if (this.taskQueue.processing) return;
    
    await this.taskQueue.processAll(async (task) => {
      // Find or spawn appropriate sub-agent
      const subAgentType = this._mapTaskToSubAgent(task.taskType);
      
      // Reuse existing sub-agent for same parent if available
      let subAgentInfo = this._findExistingSubAgent(task.parentId, subAgentType);
      
      if (!subAgentInfo) {
        const subAgent = this.spawnSubAgent(subAgentType, task.parentId);
        subAgentInfo = this.subAgents.get(subAgent.id);
      }
      
      // Update last used
      subAgentInfo.lastUsed = Date.now();
      
      // Execute with circuit breaker
      const cb = this._getCircuitBreaker(subAgentInfo.agent.id);
      
      try {
        const result = await cb.execute(() => 
          subAgentInfo.agent.execute(task.data)
        );
        
        this.health.tasksCompleted++;
        
        // Notify parent of completion
        this._notifyParent(task.parentId, task.taskType, result);
        
      } catch (error) {
        console.error(`[${this.id}] Task ${task.id} failed:`, error.message);
      }
    });
  }
  
  _mapTaskToSubAgent(taskType) {
    const mapping = {
      'predict_load': 'LOAD_PREDICTOR',
      'detect_anomaly': 'ANOMALY_DETECTOR',
      'track_whales': 'WHALE_TRACKER',
      'analyze_threats': 'THREAT_ANALYZER'
    };
    return mapping[taskType] || 'ANOMALY_DETECTOR';
  }
  
  _findExistingSubAgent(parentId, type) {
    for (const [id, info] of this.subAgents) {
      if (info.parentId === parentId && info.agent.type === type) {
        return info;
      }
    }
    return null;
  }
  
  _getCircuitBreaker(subAgentId) {
    if (!this.circuitBreakers.has(subAgentId)) {
      this.circuitBreakers.set(subAgentId, new CircuitBreaker(3, 30000));
    }
    return this.circuitBreakers.get(subAgentId);
  }
  
  _cleanupIdleSubAgents() {
    const now = Date.now();
    for (const [id, info] of this.subAgents) {
      if (now - info.lastUsed > this.subAgentTTL) {
        this.subAgents.delete(id);
        this.circuitBreakers.delete(id);
      }
    }
    this.health.activeSubAgents = this.subAgents.size;
  }
  
  _notifyParent(parentId, taskType, result) {
    // Placeholder for parent notification
    // In real implementation, this could use HCS or direct messaging
  }
  
  /**
   * Get adaptive interval for a domain
   * @param {string} domain - Domain name (energy, defi, security, carbon)
   * @param {Object} metrics - Recent metrics
   */
  getAdaptiveInterval(domain, metrics) {
    const scheduler = this.schedulers[domain];
    if (!scheduler) return 300000; // Default 5 min
    
    return scheduler.getNextInterval(metrics);
  }
  
  /**
   * Get coordinator health status
   */
  getHealth() {
    this._cleanupIdleSubAgents();
    
    return {
      ...this.health,
      queueLength: this.taskQueue.length,
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([id, cb]) => ({
        subAgentId: id,
        ...cb.getStatus()
      })),
      subAgents: Array.from(this.subAgents.entries()).map(([id, info]) => ({
        id,
        type: info.agent.type,
        status: info.agent.status,
        idleTime: Date.now() - info.lastUsed,
        ...info.agent.getHealth()
      }))
    };
  }
  
  /**
   * Generate coordinator report
   */
  generateReport() {
    const health = this.getHealth();
    
    return {
      coordinatorId: this.id,
      timestamp: new Date().toISOString(),
      summary: {
        tasksRouted: health.tasksRouted,
        tasksCompleted: health.tasksCompleted,
        activeSubAgents: health.activeSubAgents,
        queueBacklog: health.queueLength,
        successRate: health.tasksRouted > 0 
          ? Math.round((health.tasksCompleted / health.tasksRouted) * 100) 
          : 0
      },
      subAgents: health.subAgents,
      circuitBreakers: health.circuitBreakers,
      recommendations: this._generateRecommendations(health)
    };
  }
  
  _generateRecommendations(health) {
    const recs = [];
    
    if (health.queueLength > 10) {
      recs.push('Queue backlog high - consider spawning more sub-agents');
    }
    
    if (health.successRate < 80) {
      recs.push('Task failure rate elevated - check circuit breakers');
    }
    
    if (health.activeSubAgents > this.maxSubAgents * 0.8) {
      recs.push('Near sub-agent capacity limit - increase maxSubAgents');
    }
    
    if (recs.length === 0) {
      recs.push('System operating within normal parameters');
    }
    
    return recs;
  }
}

// Singleton instance for system-wide coordination
export const coordinator = new AgentCoordinator();

export default {
  AgentCoordinator,
  coordinator
};
