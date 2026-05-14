/**
 * Monetary Policy Controller (Phase 18)
 * 
 * Algorithmic monetary policy for economic stability:
 * staking rewards, token buybacks, and inflation targeting.
 */

import { logger } from '../monitoring/logger.js';
import type {
  EconomicIndicators,
  InflationTarget,
  RewardAdjustment,
  BuybackExecution,
  StressReport
} from './types.js';

interface MPCConfig {
  targetInflation: number;
  maxInflation: number;
  minStakingRate: number;
  maxStakingRate: number;
  buybackThreshold: number; // months of runway surplus
  emergencyThreshold: number; // months of runway minimum
  hederaTokenId: string;
  hederaTreasury: string;
}

export class MonetaryPolicyController {
  private config: MPCConfig;
  private indicators: EconomicIndicators[] = [];
  private currentStakingRate: number = 0.10; // 10% default
  private rewardHistory: RewardAdjustment[] = [];
  private buybacks: BuybackExecution[] = [];
  private isEmergencyMode: boolean = false;

  constructor(config: Partial<MPCConfig> = {}) {
    this.config = {
      targetInflation: 0.02, // 2% annual
      maxInflation: 0.05,
      minStakingRate: 0.02,
      maxStakingRate: 0.20,
      buybackThreshold: 24, // Buyback if >24 months runway
      emergencyThreshold: 3, // Emergency mode if <3 months
      hederaTokenId: '0.0.1234',
      hederaTreasury: '0.0.treasury',
      ...config
    };
  }

  /**
   * Measure current economic health
   */
  async measureEconomicHealth(): Promise<EconomicIndicators> {
    // Mock economic data - would fetch from chain and oracles
    const tokenPrice = 0.50 + Math.random() * 0.20; // $0.50-0.70
    const marketCap = BigInt(Math.floor(tokenPrice * 1000000 * 100_000_000)); // 1B tokens
    const stakingRatio = 0.60 + Math.random() * 0.20; // 60-80% staked
    const velocity = 0.15 + Math.random() * 0.10; // Low velocity = store of value
    
    // Calculate actual inflation from supply growth
    const inflationRate = this.calculateActualInflation();

    // Get treasury data
    const runwayMonths = 12 + Math.random() * 12; // 12-24 months
    const treasurySurplus = runwayMonths > this.config.buybackThreshold ? 1 : 0;

    const indicators: EconomicIndicators = {
      timestamp: Date.now(),
      tokenPrice,
      marketCap,
      stakingRatio,
      velocity,
      inflationRate,
      treasurySurplus,
      runwayMonths
    };

    this.indicators.push(indicators);

    // Keep only last 1000 measurements
    if (this.indicators.length > 1000) {
      this.indicators.shift();
    }

    // Check for emergency mode
    this.isEmergencyMode = runwayMonths < this.config.emergencyThreshold;

    if (this.isEmergencyMode) {
      logger.warn('MonetaryPolicyController', {
        message: 'EMERGENCY MODE ACTIVATED',
        runway: runwayMonths.toFixed(1),
        threshold: this.config.emergencyThreshold
      });
    }

    logger.info('MonetaryPolicyController', {
      message: 'Economic health measured',
      tokenPrice: tokenPrice.toFixed(2),
      inflation: `${(inflationRate * 100).toFixed(1)}%`,
      runway: runwayMonths.toFixed(1)
    });

    return indicators;
  }

  /**
   * Calculate optimal inflation target and adjustments
   */
  async calculateOptimalInflation(): Promise<InflationTarget> {
    const current = this.getLatestIndicators();
    
    // Calculate target based on economic conditions
    let target = this.config.targetInflation;
    let mechanism: InflationTarget['mechanism'] = 'rewards';
    let rationale = 'Standard 2% inflation target';

    if (this.isEmergencyMode) {
      // Emergency: reduce inflation to preserve value
      target = 0.005; // 0.5%
      mechanism = 'burn';
      rationale = 'Emergency deflationary policy to preserve runway';
    } else if (current.runwayMonths > this.config.buybackThreshold) {
      // Surplus: aggressive buybacks to reduce supply
      target = -0.01; // Deflation
      mechanism = 'buyback';
      rationale = 'Surplus runway - executing buybacks';
    } else if (current.inflationRate > this.config.maxInflation) {
      // High inflation: reduce rewards
      target = this.config.maxInflation;
      mechanism = 'rewards';
      rationale = 'Inflation too high - reducing staking rewards';
    } else if (current.stakingRatio < 0.50) {
      // Low staking: increase rewards to incentivize
      target = 0.03; // 3%
      mechanism = 'rewards';
      rationale = 'Low staking ratio - increasing rewards';
    }

    const adjustment = target - current.inflationRate;

    const inflationTarget: InflationTarget = {
      target,
      current: current.inflationRate,
      adjustment,
      mechanism,
      rationale
    };

    logger.info('MonetaryPolicyController', {
      message: 'Inflation target calculated',
      target: `${(target * 100).toFixed(1)}%`,
      mechanism,
      adjustment: adjustment.toFixed(3)
    });

    return inflationTarget;
  }

  /**
   * Adjust staking rewards
   */
  async adjustStakingRewards(): Promise<RewardAdjustment> {
    const inflationTarget = await this.calculateOptimalInflation();
    
    // Calculate new rate based on target
    let newRate = this.currentStakingRate;

    if (inflationTarget.mechanism === 'rewards') {
      // Adjust rewards to hit inflation target
      const adjustment = inflationTarget.adjustment * 2; // Amplify effect
      newRate = Math.max(
        this.config.minStakingRate,
        Math.min(
          this.config.maxStakingRate,
          this.currentStakingRate + adjustment
        )
      );
    } else if (inflationTarget.mechanism === 'burn') {
      // Reduce rewards during burn phase
      newRate = this.config.minStakingRate;
    } else if (inflationTarget.mechanism === 'buyback') {
      // Reduce rewards, redirect to buybacks
      newRate = Math.max(this.currentStakingRate * 0.8, this.config.minStakingRate);
    }

    const adjustment: RewardAdjustment = {
      oldRate: this.currentStakingRate,
      newRate,
      effectiveAt: Date.now() + 86400000, // 24 hour notice
      estimatedImpact: `Inflation change: ${(inflationTarget.adjustment * 100).toFixed(1)}%`
    };

    this.rewardHistory.push(adjustment);
    this.currentStakingRate = newRate;

    logger.info('MonetaryPolicyController', {
      message: 'Staking rewards adjusted',
      oldRate: `${(adjustment.oldRate * 100).toFixed(1)}%`,
      newRate: `${(adjustment.newRate * 100).toFixed(1)}%`,
      effective: new Date(adjustment.effectiveAt).toISOString()
    });

    return adjustment;
  }

  /**
   * Execute token buyback
   */
  async manageTokenBuybacks(): Promise<BuybackExecution | null> {
    const indicators = this.getLatestIndicators();

    // Only buyback if we have surplus runway
    if (indicators.runwayMonths < this.config.buybackThreshold) {
      return null;
    }

    // Calculate buyback amount (5% of monthly surplus)
    const monthlySurplus = BigInt(100000 * 100_000_000); // Mock $100K
    const buybackAmount = monthlySurplus * BigInt(5) / BigInt(100);
    const buybackPrice = indicators.tokenPrice;

    const buyback: BuybackExecution = {
      amount: buybackAmount,
      price: buybackPrice,
      tokensBurned: BigInt(Math.floor(Number(buybackAmount) / buybackPrice)),
      txHash: `0xbb-${Date.now()}`,
      executedAt: Date.now()
    };

    this.buybacks.push(buyback);

    logger.info('MonetaryPolicyController', {
      message: 'Token buyback executed',
      amount: buybackAmount.toString(),
      price: buybackPrice.toFixed(2),
      burned: buyback.tokensBurned.toString()
    });

    return buyback;
  }

  /**
   * Run stress tests on economy
   */
  async stressTestEconomy(): Promise<StressReport[]> {
    const scenarios = [
      {
        name: 'Token Price Crash (-50%)',
        probability: 0.10,
        impact: 'high' as const,
        mitigation: ['Activate emergency staking reduction', 'Pause buybacks', 'Increase fees']
      },
      {
        name: 'Mass Unstaking (50% exit)',
        probability: 0.05,
        impact: 'critical' as const,
        mitigation: ['Emergency rewards spike', 'Treasury intervention', 'DAO governance']
      },
      {
        name: 'Revenue Drop (-30%)',
        probability: 0.20,
        impact: 'medium' as const,
        mitigation: ['Cost reduction', 'Pricing optimization', 'New service launches']
      },
      {
        name: 'Regulatory Crackdown',
        probability: 0.15,
        impact: 'high' as const,
        mitigation: ['Geographic diversification', 'Compliance tooling', 'Legal reserves']
      }
    ];

    const reports: StressReport[] = scenarios.map(s => ({
      scenario: s.name,
      probability: s.probability,
      impact: s.impact,
      mitigations: s.mitigation,
      survivalLikelihood: this.calculateSurvivalLikelihood(s.impact, s.probability)
    }));

    logger.info('MonetaryPolicyController', {
      message: 'Stress test complete',
      scenarios: scenarios.length,
      criticalRisks: reports.filter(r => r.impact === 'critical').length
    });

    return reports;
  }

  /**
   * Get current economic indicators
   */
  getLatestIndicators(): EconomicIndicators {
    return this.indicators[this.indicators.length - 1] || {
      timestamp: Date.now(),
      tokenPrice: 0.50,
      marketCap: BigInt(500000000 * 100_000_000),
      stakingRatio: 0.70,
      velocity: 0.20,
      inflationRate: 0.02,
      treasurySurplus: 0,
      runwayMonths: 12
    };
  }

  /**
   * Get current staking rate
   */
  getCurrentStakingRate(): number {
    return this.currentStakingRate;
  }

  /**
   * Get buyback history
   */
  getBuybackHistory(): BuybackExecution[] {
    return this.buybacks;
  }

  /**
   * Get reward adjustment history
   */
  getRewardHistory(): RewardAdjustment[] {
    return this.rewardHistory;
  }

  /**
   * Get MPC statistics
   */
  getStats() {
    const latest = this.getLatestIndicators();
    const totalBurned = this.buybacks.reduce((s, b) => s + b.tokensBurned, BigInt(0));

    return {
      timestamp: Date.now(),
      currentStakingRate: this.currentStakingRate,
      currentInflation: latest.inflationRate,
      tokenPrice: latest.tokenPrice,
      stakingRatio: latest.stakingRatio,
      runwayMonths: latest.runwayMonths,
      isEmergencyMode: this.isEmergencyMode,
      totalTokensBurned: totalBurned.toString(),
      buybackCount: this.buybacks.length,
      rewardAdjustments: this.rewardHistory.length,
      targetInflation: this.config.targetInflation
    };
  }

  // Private methods
  private calculateActualInflation(): number {
    // Calculate from indicators history
    if (this.indicators.length < 30) {
      return this.config.targetInflation;
    }

    const recent = this.indicators.slice(-30);
    const oldSupply = Number(recent[0].marketCap) / recent[0].tokenPrice;
    const newSupply = Number(recent[recent.length - 1].marketCap) / recent[recent.length - 1].tokenPrice;
    
    const monthlyInflation = (newSupply - oldSupply) / oldSupply;
    return monthlyInflation * 12; // Annualized
  }

  private calculateSurvivalLikelihood(
    impact: StressReport['impact'],
    probability: number
  ): number {
    const impactMultiplier: Record<typeof impact, number> = {
      low: 0.95,
      medium: 0.85,
      high: 0.70,
      critical: 0.50
    };

    return Math.max(0, impactMultiplier[impact] - probability);
  }
}

// Singleton
let mpcInstance: MonetaryPolicyController | null = null;

export function getMonetaryPolicyController(config?: Partial<MPCConfig>): MonetaryPolicyController {
  if (!mpcInstance) {
    mpcInstance = new MonetaryPolicyController(config);
  }
  return mpcInstance;
}
