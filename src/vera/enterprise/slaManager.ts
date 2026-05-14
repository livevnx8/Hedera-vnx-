/**
 * Enterprise SLA Manager
 * Tiered service levels: Basic, Pro, Enterprise
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export type ServiceTier = 'basic' | 'pro' | 'enterprise';

export interface SLAMetrics {
  uptimePercent: number;
  avgLatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  lastIncident: number | null;
}

export interface SLAPolicy {
  tier: ServiceTier;
  uptimeSLO: number; // e.g., 0.999 for 99.9%
  latencySLO: number; // ms
  errorRateSLO: number; // e.g., 0.001 for 0.1%
  supportResponseTime: number; // minutes
  dedicatedResources: boolean;
  priority: number; // 1 = highest
}

export const SLA_POLICIES: Record<ServiceTier, SLAPolicy> = {
  basic: {
    tier: 'basic',
    uptimeSLO: 0.99, // 99%
    latencySLO: 2000, // 2 seconds
    errorRateSLO: 0.01, // 1%
    supportResponseTime: 240, // 4 hours
    dedicatedResources: false,
    priority: 3,
  },
  pro: {
    tier: 'pro',
    uptimeSLO: 0.999, // 99.9%
    latencySLO: 500, // 500ms
    errorRateSLO: 0.001, // 0.1%
    supportResponseTime: 60, // 1 hour
    dedicatedResources: false,
    priority: 2,
  },
  enterprise: {
    tier: 'enterprise',
    uptimeSLO: 0.9999, // 99.99%
    latencySLO: 100, // 100ms
    errorRateSLO: 0.0001, // 0.01%
    supportResponseTime: 15, // 15 minutes
    dedicatedResources: true,
    priority: 1,
  },
};

export class SLAManager extends EventEmitter {
  private metrics: Map<ServiceTier, SLAMetrics> = new Map();
  private violations: Array<{ tier: ServiceTier; metric: string; severity: 'warning' | 'critical'; timestamp: number }> = [];

  constructor() {
    super();
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    for (const tier of Object.keys(SLA_POLICIES) as ServiceTier[]) {
      this.metrics.set(tier, {
        uptimePercent: 1.0,
        avgLatencyMs: 0,
        p99LatencyMs: 0,
        errorRate: 0,
        lastIncident: null,
      });
    }
  }

  /**
   * Update metrics for a tier
   */
  updateMetrics(tier: ServiceTier, metrics: Partial<SLAMetrics>): void {
    const current = this.metrics.get(tier);
    if (current) {
      this.metrics.set(tier, { ...current, ...metrics });
      this.checkViolations(tier);
    }
  }

  /**
   * Check for SLA violations
   */
  private checkViolations(tier: ServiceTier): void {
    const policy = SLA_POLICIES[tier];
    const metrics = this.metrics.get(tier);
    if (!metrics) return;

    // Check uptime
    if (metrics.uptimePercent < policy.uptimeSLO) {
      this.recordViolation(tier, 'uptime', metrics.uptimePercent < policy.uptimeSLO - 0.01 ? 'critical' : 'warning');
    }

    // Check latency
    if (metrics.p99LatencyMs > policy.latencySLO) {
      this.recordViolation(tier, 'latency', metrics.p99LatencyMs > policy.latencySLO * 2 ? 'critical' : 'warning');
    }

    // Check error rate
    if (metrics.errorRate > policy.errorRateSLO) {
      this.recordViolation(tier, 'errorRate', metrics.errorRate > policy.errorRateSLO * 10 ? 'critical' : 'warning');
    }
  }

  private recordViolation(tier: ServiceTier, metric: string, severity: 'warning' | 'critical'): void {
    const violation = {
      tier,
      metric,
      severity,
      timestamp: Date.now(),
    };

    this.violations.push(violation);
    
    logger.warn('SLAManager', {
      message: `SLA ${severity}: ${tier}.${metric}`,
      tier,
      metric,
      severity,
    });

    this.emit('violation', violation);

    // Trim violations array
    if (this.violations.length > 1000) {
      this.violations = this.violations.slice(-500);
    }
  }

  /**
   * Get current SLA status for all tiers
   */
  getStatus(): Array<{
    tier: ServiceTier;
    policy: SLAPolicy;
    metrics: SLAMetrics;
    compliance: 'compliant' | 'at-risk' | 'breached';
    recentViolations: number;
  }> {
    return (Object.keys(SLA_POLICIES) as ServiceTier[]).map(tier => {
      const policy = SLA_POLICIES[tier];
      const metrics = this.metrics.get(tier)!;
      
      const recentViolations = this.violations.filter(
        v => v.tier === tier && v.timestamp > Date.now() - 86400000 // Last 24h
      ).length;

      let compliance: 'compliant' | 'at-risk' | 'breached' = 'compliant';
      if (metrics.uptimePercent < policy.uptimeSLO || metrics.errorRate > policy.errorRateSLO * 2) {
        compliance = 'breached';
      } else if (metrics.p99LatencyMs > policy.latencySLO || metrics.errorRate > policy.errorRateSLO) {
        compliance = 'at-risk';
      }

      return {
        tier,
        policy,
        metrics,
        compliance,
        recentViolations,
      };
    });
  }

  /**
   * Get priority for message routing
   */
  getPriority(tier: ServiceTier): number {
    return SLA_POLICIES[tier].priority;
  }

  /**
   * Check if tier has dedicated resources
   */
  hasDedicatedResources(tier: ServiceTier): boolean {
    return SLA_POLICIES[tier].dedicatedResources;
  }
}

export default SLAManager;
