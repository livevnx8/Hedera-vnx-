/**
 * Autonomous Treasury Manager (Phase 18)
 * 
 * Self-managing treasury with algorithmic yield strategies,
 * portfolio optimization, and runway management.
 */

import { logger } from '../monitoring/logger.js';
import type {
  TreasuryAsset,
  RebalancePlan,
  YieldReport,
  RunwayProjection,
  RiskExposure,
  HedgePosition,
  TreasuryReport,
  AssetClass,
  YieldStrategy,
  TradeInstruction
} from './types.js';

interface TreasuryConfig {
  hederaAccount: string;
  minRunwayMonths: number;
  targetRunwayMonths: number;
  maxDrawdown: number;
  requireApprovalAbove: bigint;
  autoRebalance: boolean;
}

export class AutonomousTreasury {
  private config: TreasuryConfig;
  private assets: Map<string, TreasuryAsset> = new Map();
  private plans: Map<string, RebalancePlan> = new Map();
  private yields: YieldReport[] = [];
  private hedges: Map<string, HedgePosition> = new Map();
  private lastRebalance: number = 0;

  constructor(config: Partial<TreasuryConfig> = {}) {
    this.config = {
      hederaAccount: '0.0.treasury',
      minRunwayMonths: 6,
      targetRunwayMonths: 18,
      maxDrawdown: 0.20,
      requireApprovalAbove: BigInt(50000 * 100_000_000), // $50K in HBAR
      autoRebalance: true,
      ...config
    };

    this.initializeDefaultAssets();
  }

  /**
   * Optimize portfolio allocation based on market conditions
   */
  async optimizePortfolio(): Promise<RebalancePlan> {
    const planId = `rebal-${Date.now()}`;
    const current = this.calculateCurrentAllocation();
    
    // Target allocation based on runway needs
    const runway = await this.manageRunway(this.config.targetRunwayMonths);
    const target = this.determineTargetAllocation(runway);

    // Generate trades to reach target
    const trades = this.generateTrades(current, target);

    const plan: RebalancePlan = {
      planId,
      currentAllocation: current,
      targetAllocation: target,
      trades,
      expectedYield: this.calculateExpectedYield(target),
      riskDelta: this.calculateRiskDelta(current, target)
    };

    this.plans.set(planId, plan);

    logger.info('AutonomousTreasury', {
      message: 'Rebalance plan created',
      planId,
      tradeCount: trades.length,
      expectedYield: plan.expectedYield.toFixed(2)
    });

    // Auto-execute if enabled and within safe parameters
    if (this.config.autoRebalance && this.isSafeToExecute(plan)) {
      await this.executeRebalance(plan);
    }

    return plan;
  }

  /**
   * Execute yield strategy on specific asset
   */
  async executeYieldStrategy(
    assetId: string,
    strategy: YieldStrategy
  ): Promise<YieldReport> {
    const asset = this.assets.get(assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }

    // Mock yield execution - would integrate with actual protocols
    const yields: Record<YieldStrategy, number> = {
      lending: 0.08,
      staking: 0.12,
      liquidity: 0.15,
      arbitrage: 0.25,
      hold: 0
    };

    const apy = yields[strategy];
    const dailyYield = Number(asset.balance) * apy / 365;

    const report: YieldReport = {
      period: {
        start: Date.now() - 86400000,
        end: Date.now()
      },
      totalYieldUsd: dailyYield / 100_000_000, // Convert from HBAR to USD
      yieldByAsset: { [assetId]: dailyYield },
      apr: apy,
      benchmark: 0.05, // 5% risk-free rate
      alpha: apy - 0.05
    };

    this.yields.push(report);
    asset.yieldStrategy = strategy;
    asset.apy = apy;
    this.assets.set(assetId, asset);

    logger.info('AutonomousTreasury', {
      message: 'Yield strategy executed',
      assetId,
      strategy,
      apy: `${(apy * 100).toFixed(1)}%`
    });

    return report;
  }

  /**
   * Calculate and project runway
   */
  async manageRunway(targetMonths: number): Promise<RunwayProjection> {
    const totalAum = this.getTotalAum();
    const monthlyBurn = this.estimateMonthlyBurn();
    const monthlyYield = this.estimateMonthlyYield();
    const netBurn = monthlyBurn - monthlyYield;
    const runway = totalAum / Math.max(netBurn, 1);

    const projection: RunwayProjection = {
      currentRunwayMonths: runway,
      targetRunwayMonths: targetMonths,
      monthlyBurn,
      monthlyYield,
      netRunway: runway,
      projection: []
    };

    // Generate 24-month projection
    for (let i = 0; i < 24; i++) {
      const balance = totalAum - netBurn * i;
      projection.projection.push({ month: i, balance: Math.max(0, balance) });
    }

    // Adjust strategy if below minimum
    if (runway < this.config.minRunwayMonths) {
      logger.warn('AutonomousTreasury', {
        message: 'Runway below minimum! Activating preservation mode',
        runway: runway.toFixed(1),
        minimum: this.config.minRunwayMonths
      });
    }

    return projection;
  }

  /**
   * Auto-hedge risk exposure
   */
  async autoHedge(exposure: RiskExposure): Promise<HedgePosition | null> {
    // Only hedge if exposure > $100K or volatility > 50%
    if (exposure.exposureUsd < 100000 && exposure.volatility < 0.5) {
      return null;
    }

    const hedgeId = `hedge-${Date.now()}`;
    const hedgeSize = BigInt(Math.floor(exposure.exposureUsd * 0.5)); // Hedge 50%

    const hedge: HedgePosition = {
      hedgeId,
      underlying: exposure.assetId,
      hedgeAsset: 'USDC', // Simple hedge: move to stable
      positionSize: hedgeSize,
      cost: Number(hedgeSize) * 0.001, // 0.1% cost
      protectionLevel: 0.5
    };

    this.hedges.set(hedgeId, hedge);

    logger.info('AutonomousTreasury', {
      message: 'Auto-hedge position created',
      hedgeId,
      underlying: exposure.assetId,
      protectionLevel: '50%'
    });

    return hedge;
  }

  /**
   * Generate report for DAO governance
   */
  async reportToDAOs(): Promise<TreasuryReport> {
    const runway = await this.manageRunway(this.config.targetRunwayMonths);
    const performance = this.getLatestYieldReport();

    const report: TreasuryReport = {
      timestamp: Date.now(),
      totalAum: this.getTotalAum(),
      assetBreakdown: Array.from(this.assets.values()),
      performance,
      runway,
      activeHedges: Array.from(this.hedges.values()),
      recommendations: this.generateRecommendations(runway)
    };

    return report;
  }

  /**
   * Get total AUM in USD
   */
  getTotalAum(): number {
    return Array.from(this.assets.values())
      .reduce((sum, a) => sum + a.valueUsd, 0);
  }

  /**
   * Get treasury statistics
   */
  getStats() {
    const aum = this.getTotalAum();
    const yields = this.yields.slice(-30); // Last 30 reports
    const avgApr = yields.length > 0
      ? yields.reduce((sum, y) => sum + y.apr, 0) / yields.length
      : 0;

    return {
      timestamp: Date.now(),
      hederaAccount: this.config.hederaAccount,
      totalAum: aum,
      assetCount: this.assets.size,
      activeHedges: this.hedges.size,
      avgApr: avgApr,
      pendingPlans: this.plans.size,
      autoRebalanceEnabled: this.config.autoRebalance
    };
  }

  // Private methods
  private initializeDefaultAssets(): void {
    const defaultAssets: TreasuryAsset[] = [
      {
        assetId: 'hbar',
        symbol: 'HBAR',
        balance: BigInt(1000000 * 100_000_000), // 1M HBAR
        valueUsd: 500000,
        assetClass: 'liquid',
        yieldStrategy: 'staking',
        apy: 0.12,
        riskScore: 30
      },
      {
        assetId: 'usdc',
        symbol: 'USDC',
        balance: BigInt(300000 * 100_000_000), // $300K
        valueUsd: 300000,
        assetClass: 'stable',
        yieldStrategy: 'lending',
        apy: 0.08,
        riskScore: 5
      },
      {
        assetId: 'sauce',
        symbol: 'SAUCE',
        balance: BigInt(50000 * 100_000_000), // 50K SAUCE
        valueUsd: 150000,
        assetClass: 'growth',
        yieldStrategy: 'liquidity',
        apy: 0.15,
        riskScore: 60
      }
    ];

    defaultAssets.forEach(a => this.assets.set(a.assetId, a));
  }

  private calculateCurrentAllocation(): Record<AssetClass, number> {
    const total = this.getTotalAum();
    const allocation: Partial<Record<AssetClass, number>> = {};

    for (const asset of this.assets.values()) {
      const current = allocation[asset.assetClass] || 0;
      allocation[asset.assetClass] = current + (asset.valueUsd / total);
    }

    return allocation as Record<AssetClass, number>;
  }

  private determineTargetAllocation(runway: RunwayProjection): Record<AssetClass, number> {
    // Conservative if runway < 12 months
    const isConservative = runway.currentRunwayMonths < 12;

    if (isConservative) {
      return {
        stable: 0.60,
        liquid: 0.25,
        growth: 0.10,
        hedge: 0.05
      };
    }

    // Aggressive growth if runway > 18 months
    if (runway.currentRunwayMonths > 18) {
      return {
        stable: 0.35,
        liquid: 0.25,
        growth: 0.30,
        hedge: 0.10
      };
    }

    // Balanced
    return {
      stable: 0.40,
      liquid: 0.25,
      growth: 0.25,
      hedge: 0.10
    };
  }

  private generateTrades(
    current: Record<AssetClass, number>,
    target: Record<AssetClass, number>
  ): TradeInstruction[] {
    const trades: TradeInstruction[] = [];
    
    // Simple mock trade generation
    // In production, would optimize across DEXs and bridges
    if (target.growth > current.growth) {
      trades.push({
        fromAsset: 'usdc',
        toAsset: 'sauce',
        amount: BigInt(50000 * 100_000_000),
        expectedRate: 3.0,
        slippage: 0.005,
        protocol: 'SaucerSwap'
      });
    }

    return trades;
  }

  private calculateExpectedYield(target: Record<AssetClass, number>): number {
    // Weighted average yield by asset class
    const yields: Record<AssetClass, number> = {
      stable: 0.08,
      liquid: 0.12,
      growth: 0.15,
      hedge: 0.05
    };

    return Object.entries(target).reduce(
      (sum, [cls, weight]) => sum + (yields[cls as AssetClass] || 0) * weight,
      0
    );
  }

  private calculateRiskDelta(
    current: Record<AssetClass, number>,
    target: Record<AssetClass, number>
  ): number {
    // Risk scores by asset class
    const risks: Record<AssetClass, number> = {
      stable: 5,
      liquid: 30,
      growth: 60,
      hedge: 20
    };

    const currentRisk = Object.entries(current).reduce(
      (sum, [cls, weight]) => sum + (risks[cls as AssetClass] || 0) * weight,
      0
    );

    const targetRisk = Object.entries(target).reduce(
      (sum, [cls, weight]) => sum + (risks[cls as AssetClass] || 0) * weight,
      0
    );

    return targetRisk - currentRisk;
  }

  private isSafeToExecute(plan: RebalancePlan): boolean {
    return plan.riskDelta < 10 && // Not increasing risk too much
           plan.trades.every(t => t.slippage < 0.01); // Low slippage
  }

  private async executeRebalance(plan: RebalancePlan): Promise<void> {
    logger.info('AutonomousTreasury', {
      message: 'Auto-executing rebalance plan',
      planId: plan.planId,
      trades: plan.trades.length
    });

    plan.executedAt = Date.now();
    this.plans.set(plan.planId, plan);
    this.lastRebalance = Date.now();
  }

  private estimateMonthlyBurn(): number {
    // Mock burn rate - would calculate from actual expenses
    return 50000; // $50K/month
  }

  private estimateMonthlyYield(): number {
    const aum = this.getTotalAum();
    const avgYield = this.calculateExpectedYield(this.calculateCurrentAllocation());
    return (aum * avgYield) / 12;
  }

  private getLatestYieldReport(): YieldReport {
    return this.yields[this.yields.length - 1] || {
      period: { start: Date.now() - 86400000, end: Date.now() },
      totalYieldUsd: 0,
      yieldByAsset: {},
      apr: 0,
      benchmark: 0.05,
      alpha: 0
    };
  }

  private generateRecommendations(runway: RunwayProjection): string[] {
    const recs: string[] = [];

    if (runway.currentRunwayMonths < this.config.minRunwayMonths) {
      recs.push('URGENT: Activate cost preservation mode immediately');
    } else if (runway.currentRunwayMonths < 12) {
      recs.push('Reduce growth allocation, increase stable assets');
    }

    if (this.assets.get('hbar')!.apy < 0.10) {
      recs.push('Consider alternative HBAR staking options');
    }

    if (this.hedges.size === 0 && this.getTotalAum() > 500000) {
      recs.push('Consider hedging >$500K exposure');
    }

    return recs;
  }
}

// Singleton
let treasuryInstance: AutonomousTreasury | null = null;

export function getAutonomousTreasury(config?: Partial<TreasuryConfig>): AutonomousTreasury {
  if (!treasuryInstance) {
    treasuryInstance = new AutonomousTreasury(config);
  }
  return treasuryInstance;
}
