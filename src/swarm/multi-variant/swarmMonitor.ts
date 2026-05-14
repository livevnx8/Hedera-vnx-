/**
 * Swarm Monitoring & Metrics System
 * 
 * Collects and exposes metrics for the multi-variant swarm architecture
 * including health checks, performance metrics, and operational status.
 */

import { EventEmitter } from 'events';
import { BaseSwarmAgent } from './baseSwarmAgent.js';
import { MicroAgent } from './microAgent.js';
import { NormalAgent } from './normalAgent.js';
import { MacroAgent } from './macroAgent.js';
import { HederaToolAgent } from './hederaToolAgent.js';
import { logger } from '../../monitoring/logger.js';

export interface AgentHealth {
  id: string;
  swarmClass: string;
  status: string;
  healthy: boolean;
  load: number;
  lastHeartbeat: number;
  tasksCompleted: number;
  tasksFailed: number;
  uptime: number;
}

export interface SwarmClassHealth {
  totalAgents: number;
  healthyAgents: number;
  failedAgents: number;
  averageLoad: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  classHealth: 'healthy' | 'degraded' | 'critical';
}

export interface SystemMetrics {
  timestamp: number;
  totalAgents: number;
  byClass: Record<string, SwarmClassHealth>;
  relayStats: {
    messagesUp: number;
    messagesDown: number;
    meetOperations: number;
    joinOperations: number;
    errors: number;
  };
  hederaStats?: {
    totalExecutions: number;
    successRate: string;
    averageExecutionTime: number;
  };
}

export class SwarmMonitor extends EventEmitter {
  private agents: Map<string, BaseSwarmAgent> = new Map();
  private hederaAgents: Map<string, HederaToolAgent> = new Map();
  private metrics: SystemMetrics[] = [];
  private maxMetricsHistory: number = 1000;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;
  
  // Health thresholds
  private thresholds = {
    maxLoad: 0.9,
    maxFailedRatio: 0.2,
    heartbeatTimeout: 30000, // 30 seconds
    minHealthyAgents: 5
  };

  constructor() {
    super();
  }

  /**
   * Start monitoring
   */
  start(agents: Map<string, BaseSwarmAgent>, hederaAgents?: Map<string, HederaToolAgent>): void {
    if (this.isMonitoring) return;

    this.agents = agents;
    if (hederaAgents) {
      this.hederaAgents = hederaAgents;
    }

    this.isMonitoring = true;

    // Collect metrics every 5 seconds
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, 5000);

    logger.info('SwarmMonitor', { message: 'Monitoring started' });
    this.emit('started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('SwarmMonitor', { message: 'Monitoring stopped' });
    this.emit('stopped');
  }

  /**
   * Collect current metrics
   */
  private collectMetrics(): void {
    const timestamp = Date.now();
    
    const metrics: SystemMetrics = {
      timestamp,
      totalAgents: this.agents.size,
      byClass: this.collectClassMetrics(),
      relayStats: this.collectRelayStats(),
      hederaStats: this.collectHederaStats()
    };

    this.metrics.push(metrics);

    // Trim history
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.shift();
    }

    // Check for alerts
    this.checkAlerts(metrics);

    this.emit('metrics', metrics);
  }

  /**
   * Collect metrics by swarm class
   */
  private collectClassMetrics(): Record<string, SwarmClassHealth> {
    const byClass: Record<string, SwarmClassHealth> = {};

    // Group agents by class
    const classAgents: Record<string, BaseSwarmAgent[]> = {
      micro: [],
      normal: [],
      macro: []
    };

    for (const agent of this.agents.values()) {
      const swarmClass = agent.getSwarmClass();
      if (classAgents[swarmClass]) {
        classAgents[swarmClass].push(agent);
      }
    }

    // Calculate metrics for each class
    for (const [swarmClass, agents] of Object.entries(classAgents)) {
      const healthy = agents.filter(a => a.isHealthy());
      const failed = agents.filter(a => a.getStatus() === 'failed');
      
      const totalTasksCompleted = agents.reduce((sum, a) => sum + a.getMetrics().tasksCompleted, 0);
      const totalTasksFailed = agents.reduce((sum, a) => sum + a.getMetrics().tasksFailed, 0);
      const avgLoad = agents.length > 0 
        ? agents.reduce((sum, a) => sum + a.getCurrentLoad(), 0) / agents.length 
        : 0;

      // Determine health status
      let classHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
      const failedRatio = agents.length > 0 ? failed.length / agents.length : 0;
      
      if (failedRatio > this.thresholds.maxFailedRatio || healthy.length < this.thresholds.minHealthyAgents) {
        classHealth = 'critical';
      } else if (avgLoad > this.thresholds.maxLoad || failedRatio > 0.1) {
        classHealth = 'degraded';
      }

      byClass[swarmClass] = {
        totalAgents: agents.length,
        healthyAgents: healthy.length,
        failedAgents: failed.length,
        averageLoad: avgLoad,
        totalTasksCompleted,
        totalTasksFailed,
        classHealth
      };
    }

    return byClass;
  }

  /**
   * Collect relay statistics
   */
  private collectRelayStats(): SystemMetrics['relayStats'] {
    // In production, these would come from the actual LatticeRelay
    // For now, return placeholder values
    return {
      messagesUp: 0,
      messagesDown: 0,
      meetOperations: 0,
      joinOperations: 0,
      errors: 0
    };
  }

  /**
   * Collect Hedera statistics
   */
  private collectHederaStats(): SystemMetrics['hederaStats'] {
    if (this.hederaAgents.size === 0) return undefined;

    const totalExecutions = Array.from(this.hederaAgents.values())
      .reduce((sum, a) => sum + a.getToolMetrics().toolExecutions, 0);
    
    const totalFailures = Array.from(this.hederaAgents.values())
      .reduce((sum, a) => sum + a.getToolMetrics().toolFailures, 0);

    const avgTime = Array.from(this.hederaAgents.values())
      .reduce((sum, a) => sum + a.getToolMetrics().averageExecutionTime, 0) / 
      (this.hederaAgents.size || 1);

    return {
      totalExecutions,
      successRate: totalExecutions > 0
        ? ((totalExecutions - totalFailures) / totalExecutions * 100).toFixed(2) + '%'
        : 'N/A',
      averageExecutionTime: Math.round(avgTime)
    };
  }

  /**
   * Check for alerts
   */
  private checkAlerts(metrics: SystemMetrics): void {
    // Check each class for critical conditions
    for (const [swarmClass, classMetrics] of Object.entries(metrics.byClass)) {
      if (classMetrics.classHealth === 'critical') {
        this.emit('alert', {
          severity: 'critical',
          swarmClass,
          message: `${swarmClass} swarm is critical: ${classMetrics.failedAgents} failed agents`,
          metrics: classMetrics
        });
      } else if (classMetrics.classHealth === 'degraded') {
        this.emit('alert', {
          severity: 'warning',
          swarmClass,
          message: `${swarmClass} swarm is degraded: ${(classMetrics.averageLoad * 100).toFixed(0)}% avg load`,
          metrics: classMetrics
        });
      }
    }
  }

  /**
   * Get agent health details
   */
  getAgentHealth(): AgentHealth[] {
    return Array.from(this.agents.values()).map(agent => {
      const metrics = agent.getMetrics();
      const isHealthy = agent.isHealthy();
      
      return {
        id: agent.getId(),
        swarmClass: agent.getSwarmClass(),
        status: agent.getStatus(),
        healthy: isHealthy,
        load: agent.getCurrentLoad(),
        lastHeartbeat: metrics.lastHeartbeat,
        tasksCompleted: metrics.tasksCompleted,
        tasksFailed: metrics.tasksFailed,
        uptime: Date.now() - metrics.lastHeartbeat
      };
    });
  }

  /**
   * Get system health summary
   */
  getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'critical';
    totalAgents: number;
    healthyAgents: number;
    failedAgents: number;
    issues: string[];
  } {
    const agentHealth = this.getAgentHealth();
    const healthy = agentHealth.filter(a => a.healthy);
    const failed = agentHealth.filter(a => !a.healthy);
    
    const issues: string[] = [];
    
    // Check overall health
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    
    if (failed.length / (agentHealth.length || 1) > this.thresholds.maxFailedRatio) {
      status = 'critical';
      issues.push(`High failure rate: ${failed.length}/${agentHealth.length} agents failed`);
    } else if (healthy.length < this.thresholds.minHealthyAgents) {
      status = 'critical';
      issues.push(`Insufficient healthy agents: ${healthy.length} < ${this.thresholds.minHealthyAgents}`);
    } else if (failed.length > 0) {
      status = 'degraded';
      issues.push(`${failed.length} agents are not healthy`);
    }

    return {
      status,
      totalAgents: agentHealth.length,
      healthyAgents: healthy.length,
      failedAgents: failed.length,
      issues
    };
  }

  /**
   * Get latest metrics
   */
  getLatestMetrics(): SystemMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(durationMs: number = 3600000): SystemMetrics[] {
    const cutoff = Date.now() - durationMs;
    return this.metrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Export metrics for external monitoring (Prometheus format)
   */
  exportPrometheusMetrics(): string {
    const latest = this.getLatestMetrics();
    if (!latest) return '';

    let output = '';

    // Agent counts
    output += `# HELP swarm_agents_total Total number of agents\n`;
    output += `# TYPE swarm_agents_total gauge\n`;
    output += `swarm_agents_total ${latest.totalAgents}\n`;

    // By class
    for (const [swarmClass, metrics] of Object.entries(latest.byClass)) {
      output += `swarm_agents{class="${swarmClass}"} ${metrics.totalAgents}\n`;
      output += `swarm_healthy_agents{class="${swarmClass}"} ${metrics.healthyAgents}\n`;
      output += `swarm_failed_agents{class="${swarmClass}"} ${metrics.failedAgents}\n`;
      output += `swarm_load_average{class="${swarmClass}"} ${metrics.averageLoad}\n`;
      output += `swarm_tasks_completed{class="${swarmClass}"} ${metrics.totalTasksCompleted}\n`;
    }

    // Hedera metrics
    if (latest.hederaStats) {
      output += `# HELP swarm_hedera_executions_total Total Hedera tool executions\n`;
      output += `# TYPE swarm_hedera_executions_total counter\n`;
      output += `swarm_hedera_executions_total ${latest.hederaStats.totalExecutions}\n`;
      
      output += `# HELP swarm_hedera_execution_time Average execution time\n`;
      output += `# TYPE swarm_hedera_execution_time gauge\n`;
      output += `swarm_hedera_execution_time ${latest.hederaStats.averageExecutionTime}\n`;
    }

    return output;
  }

  /**
   * Print status to console
   */
  printStatus(): void {
    const health = this.getSystemHealth();
    const latest = this.getLatestMetrics();

    console.log('\n📊 Swarm Monitor Status');
    console.log('========================\n');
    
    const statusEmoji = health.status === 'healthy' ? '✅' : 
                        health.status === 'degraded' ? '⚠️' : '❌';
    console.log(`System Health: ${statusEmoji} ${health.status.toUpperCase()}`);
    console.log(`Agents: ${health.healthyAgents}/${health.totalAgents} healthy (${health.failedAgents} failed)`);
    
    if (health.issues.length > 0) {
      console.log('\nIssues:');
      health.issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    }

    if (latest) {
      console.log('\nBy Class:');
      for (const [swarmClass, metrics] of Object.entries(latest.byClass)) {
        const healthEmoji = metrics.classHealth === 'healthy' ? '💚' : 
                           metrics.classHealth === 'degraded' ? '💛' : '❤️';
        console.log(`  ${healthEmoji} ${swarmClass.toUpperCase()}: ${metrics.healthyAgents}/${metrics.totalAgents} healthy, load: ${(metrics.averageLoad * 100).toFixed(1)}%`);
      }

      if (latest.hederaStats) {
        console.log(`\nHedera: ${latest.hederaStats.totalExecutions} executions, ${latest.hederaStats.successRate} success, ${latest.hederaStats.averageExecutionTime}ms avg`);
      }
    }

    console.log('\n========================\n');
  }
}
