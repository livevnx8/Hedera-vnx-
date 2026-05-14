/**
 * Vera Lattice Health Monitor & Auto-Recovery
 * 
 * Continuous health monitoring with automatic recovery actions.
 * Integrates with lattice fields, agent discovery, and consensus
 * to maintain system reliability.
 * 
 * Features:
 * - Health check orchestration across all components
 * - Automated recovery actions (restart, scale, reroute)
 * - Alert generation for critical issues
 * - Integration with EconomicField for cost-aware recovery
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { latticeManager } from '../lattice/core/LatticeManager.js';
import { performanceField } from '../lattice/fields/PerformanceField.js';
import { securityField } from '../lattice/fields/SecurityField.js';
import { economicField } from '../lattice/fields/EconomicField.js';
import { enhancedSettlement } from '../payments/enhancedX402Settlement.js';

export interface HealthCheckConfig {
  checkIntervalMs: number;
  recoveryEnabled: boolean;
  maxRecoveryAttempts: number;
  alertThreshold: 'critical' | 'high' | 'medium';
  autoScaleOnFailure: boolean;
  costAwareRecovery: boolean;
  maxRecoveryCostHbar: number;
}

export interface ComponentHealth {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  lastCheck: number;
  metrics: Record<string, number>;
  issues: string[];
  recoveryAttempts: number;
}

export interface RecoveryAction {
  type: 'restart' | 'scale_up' | 'reroute' | 'isolate' | 'alert';
  target: string;
  reason: string;
  estimatedCost: number;
  success: boolean;
  executedAt: number;
}

export class LatticeHealthMonitor extends EventEmitter {
  private config: HealthCheckConfig;
  private healthStatus = new Map<string, ComponentHealth>();
  private recoveryHistory: RecoveryAction[] = [];
  private checkTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: Partial<HealthCheckConfig> = {}) {
    super();
    this.config = {
      checkIntervalMs: config.checkIntervalMs || 30000,
      recoveryEnabled: config.recoveryEnabled ?? true,
      maxRecoveryAttempts: config.maxRecoveryAttempts || 3,
      alertThreshold: config.alertThreshold || 'high',
      autoScaleOnFailure: config.autoScaleOnFailure ?? true,
      costAwareRecovery: config.costAwareRecovery ?? true,
      maxRecoveryCostHbar: config.maxRecoveryCostHbar || 50
    };
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.checkTimer = setInterval(() => {
      this.runHealthChecks();
    }, this.config.checkIntervalMs);

    logger.info('LatticeHealthMonitor', {
      message: 'Health monitoring started',
      interval: this.config.checkIntervalMs
    });

    // Run initial check
    this.runHealthChecks();
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    this.isRunning = false;
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    logger.info('LatticeHealthMonitor', { message: 'Health monitoring stopped' });
  }

  isMonitoring(): boolean {
    return this.isRunning;
  }

  getStatus() {
    return {
      running: this.isRunning,
      components: Array.from(this.healthStatus.values()),
      recoveries: this.recoveryHistory.slice(-20),
    };
  }

  /**
   * Run health checks on all components
   */
  private runHealthChecks(): void {
    const results = [
      this.checkLatticeHealth(),
      this.checkPerformanceHealth(),
      this.checkSecurityHealth(),
      this.checkEconomicHealth(),
      this.checkPaymentHealth()
    ];
    
    // Evaluate and trigger recoveries
    for (const health of results) {
      this.healthStatus.set(health.component, health);
      
      if (health.status !== 'healthy' && this.config.recoveryEnabled) {
        this.evaluateRecovery(health);
      }
    }

    this.emit('health_check_complete', results);
  }

  /**
   * Check lattice manager health
   */
  private checkLatticeHealth(): ComponentHealth {
    const coherence = latticeManager.getSystemCoherence();
    const stats = latticeManager.getLatticeStats();
    
    const issues: string[] = [];
    let status: ComponentHealth['status'] = 'healthy';

    if (coherence < 0.3) {
      status = 'critical';
      issues.push(`System coherence critically low: ${(coherence * 100).toFixed(1)}%`);
    } else if (coherence < 0.5) {
      status = 'degraded';
      issues.push(`System coherence degraded: ${(coherence * 100).toFixed(1)}%`);
    }

    if (stats.entanglements === 0 && stats.fields > 1) {
      issues.push('No cross-field entanglements detected');
    }

    return {
      component: 'lattice',
      status,
      lastCheck: Date.now(),
      metrics: { coherence, fields: stats.fields, entanglements: stats.entanglements },
      issues,
      recoveryAttempts: this.getRecoveryAttempts('lattice')
    };
  }

  /**
   * Check performance field health
   */
  private checkPerformanceHealth(): ComponentHealth {
    const stats = performanceField.getPerformanceStats();
    const issues: string[] = [];
    let status: ComponentHealth['status'] = 'healthy';

    if (stats.criticalBottlenecks > 0) {
      status = 'critical';
      issues.push(`${stats.criticalBottlenecks} critical bottlenecks detected`);
    } else if (stats.agentsWithBottlenecks > stats.totalAgents * 0.3) {
      status = 'degraded';
      issues.push(`${stats.agentsWithBottlenecks} agents experiencing bottlenecks`);
    }

    if (stats.averageErrorRate > 0.1) {
      status = status === 'healthy' ? 'degraded' : status;
      issues.push(`High error rate: ${(stats.averageErrorRate * 100).toFixed(1)}%`);
    }

    return {
      component: 'performance',
      status,
      lastCheck: Date.now(),
      metrics: { 
        avgLatency: stats.averageLatencyMs, 
        errorRate: stats.averageErrorRate,
        bottlenecks: stats.agentsWithBottlenecks 
      },
      issues,
      recoveryAttempts: this.getRecoveryAttempts('performance')
    };
  }

  /**
   * Check security field health
   */
  private checkSecurityHealth(): ComponentHealth {
    const stats = securityField.getSecurityStats();
    const issues: string[] = [];
    let status: ComponentHealth['status'] = 'healthy';

    if (stats.criticalIncidents > 0) {
      status = 'critical';
      issues.push(`${stats.criticalIncidents} critical security incidents`);
    }

    if (stats.unresolvedIncidents > 5) {
      status = status === 'healthy' ? 'degraded' : status;
      issues.push(`${stats.unresolvedIncidents} unresolved security incidents`);
    }

    if (stats.averageComplianceScore < 0.5) {
      status = status === 'healthy' ? 'degraded' : status;
      issues.push(`Low compliance score: ${(stats.averageComplianceScore * 100).toFixed(1)}%`);
    }

    return {
      component: 'security',
      status,
      lastCheck: Date.now(),
      metrics: { 
        compliance: stats.averageComplianceScore,
        incidents: stats.totalIncidents,
        unresolved: stats.unresolvedIncidents
      },
      issues,
      recoveryAttempts: this.getRecoveryAttempts('security')
    };
  }

  /**
   * Check economic field health
   */
  private checkEconomicHealth(): ComponentHealth {
    const stats = economicField.getEconomicStats();
    const issues: string[] = [];
    let status: ComponentHealth['status'] = 'healthy';

    if (stats.averageReliability < 0.5) {
      status = 'degraded';
      issues.push(`Low payment reliability: ${(stats.averageReliability * 100).toFixed(1)}%`);
    }

    return {
      component: 'economic',
      status,
      lastCheck: Date.now(),
      metrics: { 
        reliability: stats.averageReliability,
        volume: stats.totalVolumeHbar,
        agents: stats.totalAgentsTracked
      },
      issues,
      recoveryAttempts: this.getRecoveryAttempts('economic')
    };
  }

  /**
   * Check payment settlement health
   */
  private checkPaymentHealth(): ComponentHealth {
    const stats = enhancedSettlement.getStats();
    const circuitStats = enhancedSettlement.getCircuitBreakerStats();
    const issues: string[] = [];
    let status: ComponentHealth['status'] = 'healthy';

    if (circuitStats.state === 'OPEN') {
      status = 'critical';
      issues.push('Circuit breaker is OPEN - payments failing');
    } else if (circuitStats.state === 'HALF_OPEN') {
      status = 'degraded';
      issues.push('Circuit breaker is HALF_OPEN');
    }

    if (stats.successRate < 0.8 && stats.total > 10) {
      status = status === 'healthy' ? 'degraded' : status;
      issues.push(`Low settlement success rate: ${(stats.successRate * 100).toFixed(1)}%`);
    }

    return {
      component: 'payments',
      status,
      lastCheck: Date.now(),
      metrics: { 
        successRate: stats.successRate,
        pending: stats.pending,
        circuitState: circuitStats.state === 'CLOSED' ? 1 : 0
      },
      issues,
      recoveryAttempts: this.getRecoveryAttempts('payments')
    };
  }

  /**
   * Evaluate and execute recovery action
   */
  private evaluateRecovery(health: ComponentHealth): void {
    if (health.recoveryAttempts >= this.config.maxRecoveryAttempts) {
      logger.error('LatticeHealthMonitor', {
        message: 'Max recovery attempts exceeded',
        component: health.component,
        attempts: health.recoveryAttempts
      });
      this.emit('max_recovery_exceeded', health);
      return;
    }

    const action = this.determineRecoveryAction(health);
    
    if (action && this.shouldExecuteRecovery(action)) {
      this.executeRecovery(action, health);
    }
  }

  /**
   * Determine appropriate recovery action
   */
  private determineRecoveryAction(health: ComponentHealth): RecoveryAction | null {
    const actions: Record<string, RecoveryAction['type']> = {
      'lattice': 'restart',
      'performance': 'scale_up',
      'security': 'isolate',
      'economic': 'reroute',
      'payments': 'restart'
    };

    const type = actions[health.component];
    if (!type) return null;

    const estimatedCost = this.estimateRecoveryCost(type);

    return {
      type,
      target: health.component,
      reason: health.issues.join('; '),
      estimatedCost,
      success: false,
      executedAt: 0
    };
  }

  /**
   * Check if recovery should be executed (cost-aware)
   */
  private shouldExecuteRecovery(action: RecoveryAction): boolean {
    if (!this.config.costAwareRecovery) return true;
    
    return action.estimatedCost <= this.config.maxRecoveryCostHbar;
  }

  /**
   * Execute recovery action
   */
  private executeRecovery(action: RecoveryAction, health: ComponentHealth): void {
    action.executedAt = Date.now();
    
    logger.info('LatticeHealthMonitor', {
      message: 'Executing recovery action',
      component: action.target,
      action: action.type,
      reason: action.reason,
      estimatedCost: action.estimatedCost
    });

    // Simulate recovery execution
    switch (action.type) {
      case 'restart':
        action.success = this.simulateRestart(action.target);
        break;
      case 'scale_up':
        action.success = this.config.autoScaleOnFailure;
        this.emit('scale_request', { component: action.target });
        break;
      case 'reroute':
        action.success = true;
        this.emit('reroute_request', { component: action.target });
        break;
      case 'isolate':
        action.success = true;
        this.emit('isolate_request', { component: action.target });
        break;
      case 'alert':
        action.success = true;
        this.emit('alert', { component: action.target, issues: health.issues });
        break;
    }

    this.recoveryHistory.push(action);
    
    this.emit('recovery_executed', action);

    if (action.success) {
      // Reset recovery attempts on success
      const updatedHealth = { ...health, recoveryAttempts: 0 };
      this.healthStatus.set(health.component, updatedHealth);
    }
  }

  /**
   * Estimate cost of recovery action
   */
  private estimateRecoveryCost(type: RecoveryAction['type']): number {
    const costs: Record<string, number> = {
      'restart': 5,
      'scale_up': 20,
      'reroute': 2,
      'isolate': 1,
      'alert': 0.1
    };
    return costs[type] || 5;
  }

  /**
   * Simulate component restart
   */
  private simulateRestart(component: string): boolean {
    // In production, this would actually restart the component
    logger.info('LatticeHealthMonitor', {
      message: 'Simulating component restart',
      component
    });
    return true;
  }

  /**
   * Get recovery attempts for a component
   */
  private getRecoveryAttempts(component: string): number {
    return this.recoveryHistory.filter(
      r => r.target === component && r.executedAt > Date.now() - 3600000
    ).length;
  }

  /**
   * Get current health status of all components
   */
  getHealthStatus(): ComponentHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get recovery history
   */
  getRecoveryHistory(): RecoveryAction[] {
    return [...this.recoveryHistory];
  }

  /**
   * Get health monitor stats
   */
  getStats(): {
    components: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    critical: number;
    totalRecoveries: number;
    successfulRecoveries: number;
  } {
    const statuses = Array.from(this.healthStatus.values());
    const recoveries = this.recoveryHistory;
    
    return {
      components: statuses.length,
      healthy: statuses.filter(s => s.status === 'healthy').length,
      degraded: statuses.filter(s => s.status === 'degraded').length,
      unhealthy: statuses.filter(s => s.status === 'unhealthy').length,
      critical: statuses.filter(s => s.status === 'critical').length,
      totalRecoveries: recoveries.length,
      successfulRecoveries: recoveries.filter(r => r.success).length
    };
  }
}

// Singleton instance
export const latticeHealthMonitor = new LatticeHealthMonitor();
export default latticeHealthMonitor;
