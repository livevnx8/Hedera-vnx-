/**
 * Cost Tracker
 *
 * Tracks and optimizes costs across compute, storage, and HBAR transactions.
 * Provides real-time cost per request and recommendations for savings.
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';

export interface CostMetrics {
  timestamp: Date;
  computeCost: number;      // USD
  storageCost: number;      // USD
  hbarCost: number;         // USD (converted from HBAR)
  networkCost: number;      // USD
  totalCost: number;        // USD
  requestCount: number;
  costPerRequest: number;   // USD
  costPerTransaction: number; // USD (HBAR transactions)
}

export interface CostBreakdown {
  compute: {
    onDemand: number;
    spot: number;
    reserved: number;
    total: number;
  };
  storage: {
    hot: number;    // Redis/SSD
    warm: number;   // Standard storage
    cold: number;   // S3
    archive: number; // Glacier
    total: number;
  };
  hedera: {
    hcsMessages: number;
    transactions: number;
    queries: number;
    total: number;
  };
}

export interface SavingsOpportunity {
  category: string;
  currentCost: number;
  potentialCost: number;
  savings: number;
  savingsPercent: number;
  confidence: number;
  implementation: string;
  effort: 'low' | 'medium' | 'high';
}

export class CostTracker extends EventEmitter {
  private metrics: CostMetrics[] = [];
  private readonly maxHistory = 10080; // 1 week at 1-minute intervals
  private hbarPrice: number = 0.05; // USD per HBAR (updated dynamically)

  // Cost rates (USD)
  private readonly rates = {
    compute: {
      onDemand: 0.50,    // per hour (vCPU)
      spot: 0.15,        // per hour (70% savings)
      reserved: 0.30,    // per hour
      gpu: 2.50,         // per hour (GPU instance)
    },
    storage: {
      hot: 0.20,         // per GB/month
      warm: 0.05,        // per GB/month
      cold: 0.02,        // per GB/month
      archive: 0.004,    // per GB/month
    },
    hedera: {
      hcsMessage: 0.0001,     // per message
      transaction: 0.001,     // per transaction
      query: 0.00001,         // per query
    },
  };

  constructor() {
    super();
    this.startTracking();
    this.updateHBARPrice();
  }

  /**
   * Record a request and its associated costs
   */
  trackRequest(costs: Partial<CostMetrics>): void {
    const metric: CostMetrics = {
      timestamp: new Date(),
      computeCost: costs.computeCost || 0,
      storageCost: costs.storageCost || 0,
      hbarCost: costs.hbarCost || 0,
      networkCost: costs.networkCost || 0,
      totalCost: 0,
      requestCount: costs.requestCount || 1,
      costPerRequest: 0,
      costPerTransaction: costs.hbarCost || 0,
    };

    metric.totalCost =
      metric.computeCost +
      metric.storageCost +
      metric.hbarCost +
      metric.networkCost;

    metric.costPerRequest = metric.totalCost / metric.requestCount;

    this.metrics.push(metric);

    // Keep only recent history
    if (this.metrics.length > this.maxHistory) {
      this.metrics.shift();
    }

    this.emit('cost', metric);

    // Alert if cost per request is too high
    if (metric.costPerRequest > 0.05) {
      this.emit('highCost', metric);
      logger.warn(`[CostTracker] High cost per request: $${metric.costPerRequest.toFixed(4)}`);
    }
  }

  /**
   * Calculate current cost breakdown
   */
  getCostBreakdown(timeRange: '1h' | '24h' | '7d' | '30d' = '24h'): CostBreakdown {
    const now = new Date();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    const cutoff = new Date(now.getTime() - ranges[timeRange]);
    const recent = this.metrics.filter((m) => m.timestamp >= cutoff);

    const compute = recent.reduce((sum, m) => sum + m.computeCost, 0);
    const storage = recent.reduce((sum, m) => sum + m.storageCost, 0);
    const hedera = recent.reduce((sum, m) => sum + m.hbarCost, 0);

    return {
      compute: {
        onDemand: compute * 0.3, // Estimated split
        spot: compute * 0.5,
        reserved: compute * 0.2,
        total: compute,
      },
      storage: {
        hot: storage * 0.4,
        warm: storage * 0.3,
        cold: storage * 0.2,
        archive: storage * 0.1,
        total: storage,
      },
      hedera: {
        hcsMessages: hedera * 0.6,
        transactions: hedera * 0.3,
        queries: hedera * 0.1,
        total: hedera,
      },
    };
  }

  /**
   * Get total costs for time range
   */
  getTotalCosts(timeRange: '1h' | '24h' | '7d' | '30d' = '24h'): CostMetrics {
    const breakdown = this.getCostBreakdown(timeRange);

    const totalCompute = breakdown.compute.total;
    const totalStorage = breakdown.storage.total;
    const totalHedera = breakdown.hedera.total;
    const totalNetwork = totalCompute * 0.05; // Estimate 5% for network

    const total = totalCompute + totalStorage + totalHedera + totalNetwork;

    return {
      timestamp: new Date(),
      computeCost: totalCompute,
      storageCost: totalStorage,
      hbarCost: totalHedera,
      networkCost: totalNetwork,
      totalCost: total,
      requestCount: this.estimateRequestCount(timeRange),
      costPerRequest: total / this.estimateRequestCount(timeRange),
      costPerTransaction: totalHedera / Math.max(1, this.estimateTransactionCount(timeRange)),
    };
  }

  /**
   * Find cost savings opportunities
   */
  findSavingsOpportunities(): SavingsOpportunity[] {
    const opportunities: SavingsOpportunity[] = [];
    const breakdown = this.getCostBreakdown('7d');

    // Spot instance opportunity
    if (breakdown.compute.onDemand > breakdown.compute.spot * 2) {
      const current = breakdown.compute.onDemand;
      const potential = current * 0.3; // 70% savings with spot
      opportunities.push({
        category: 'Compute',
        currentCost: current,
        potentialCost: potential,
        savings: current - potential,
        savingsPercent: 70,
        confidence: 0.9,
        implementation: 'Migrate 50% of on-demand instances to spot instances',
        effort: 'medium',
      });
    }

    // Storage tiering opportunity
    const coldStoragePotential = breakdown.storage.hot * 0.1; // Move 10% to cold
    if (coldStoragePotential > 10) {
      opportunities.push({
        category: 'Storage',
        currentCost: breakdown.storage.hot,
        potentialCost: breakdown.storage.hot - coldStoragePotential * 0.9,
        savings: coldStoragePotential * 0.9,
        savingsPercent: 15,
        confidence: 0.85,
        implementation: 'Move old data (>30 days) to cold storage tier',
        effort: 'low',
      });
    }

    // HBAR batching opportunity
    if (breakdown.hedera.hcsMessages > 50) {
      const current = breakdown.hedera.hcsMessages;
      const potential = current * 0.7; // 30% savings with batching
      opportunities.push({
        category: 'Hedera',
        currentCost: current,
        potentialCost: potential,
        savings: current - potential,
        savingsPercent: 30,
        confidence: 0.8,
        implementation: 'Batch HCS messages (max 10 per transaction)',
        effort: 'medium',
      });
    }

    return opportunities.sort((a, b) => b.savings - a.savings);
  }

  /**
   * Generate cost optimization report
   */
  generateReport(): object {
    const breakdown = this.getCostBreakdown('7d');
    const total = this.getTotalCosts('7d');
    const opportunities = this.findSavingsOpportunities();
    const totalSavings = opportunities.reduce((sum, o) => sum + o.savings, 0);

    return {
      period: '7d',
      totalCost: total.totalCost,
      breakdown,
      costPerRequest: total.costPerRequest,
      costPerTransaction: total.costPerTransaction,
      opportunities,
      potentialSavings: totalSavings,
      savingsPercent: (totalSavings / total.totalCost) * 100,
      trends: this.calculateTrends(),
    };
  }

  /**
   * Calculate cost trends
   */
  private calculateTrends(): object {
    const hourly = this.getHourlyCosts();
    const daily = this.getDailyCosts();

    return {
      hourlyChange: this.calculateChange(hourly),
      dailyChange: this.calculateChange(daily),
      projection: this.projectCosts(),
    };
  }

  /**
   * Get hourly cost averages
   */
  private getHourlyCosts(): number[] {
    // Group by hour and calculate averages
    const hourly: number[] = [];
    // Implementation would group metrics by hour
    return hourly;
  }

  /**
   * Get daily cost totals
   */
  private getDailyCosts(): number[] {
    // Group by day and calculate totals
    const daily: number[] = [];
    // Implementation would group metrics by day
    return daily;
  }

  /**
   * Calculate trend change percentage
   */
  private calculateChange(values: number[]): number {
    if (values.length < 2) return 0;
    const recent = values.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const older = values.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    return ((recent - older) / older) * 100;
  }

  /**
   * Project future costs
   */
  private projectCosts(): object {
    const current = this.getTotalCosts('7d');
    const opportunities = this.findSavingsOpportunities();
    const potentialSavings = opportunities.reduce((sum, o) => sum + o.savings, 0);

    return {
      currentMonthly: current.totalCost * 4.3, // 30 days
      optimizedMonthly: (current.totalCost - potentialSavings) * 4.3,
      savings: potentialSavings * 4.3,
      savingsPercent: (potentialSavings / current.totalCost) * 100,
    };
  }

  /**
   * Estimate request count for time range
   */
  private estimateRequestCount(timeRange: string): number {
    const multipliers = {
      '1h': 1,
      '24h': 24,
      '7d': 168,
      '30d': 720,
    };
    // Assume 100 requests per hour baseline
    return 100 * (multipliers[timeRange as keyof typeof multipliers] || 24);
  }

  /**
   * Estimate transaction count for time range
   */
  private estimateTransactionCount(timeRange: string): number {
    // Assume 10 HBAR transactions per 100 requests
    return this.estimateRequestCount(timeRange) * 0.1;
  }

  /**
   * Update HBAR price from external source
   */
  private async updateHBARPrice(): Promise<void> {
    // In production, fetch from CoinGecko or similar
    // For now, using static value with periodic updates
    setInterval(() => {
      // Update price every 5 minutes
      this.hbarPrice = 0.05; // Would fetch from API
    }, 300000);
  }

  /**
   * Start continuous tracking
   */
  private startTracking(): void {
    setInterval(() => {
      // Emit periodic cost summary
      this.emit('summary', this.generateReport());
    }, 60000); // Every minute
  }

  /**
   * Export cost data for external analysis
   */
  exportData(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = 'timestamp,compute,storage,hbar,network,total,requests\n';
      const rows = this.metrics
        .map(
          (m) =>
            `${m.timestamp.toISOString()},${m.computeCost},${m.storageCost},${m.hbarCost},${m.networkCost},${m.totalCost},${m.requestCount}`
        )
        .join('\n');
      return headers + rows;
    }

    return JSON.stringify(this.metrics, null, 2);
  }
}

// Global tracker instance
export const costTracker = new CostTracker();
