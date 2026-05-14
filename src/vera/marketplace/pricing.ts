import { logger } from '../../monitoring/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ServicePricing {
  serviceType: string;
  baseBudgetHbar: number;
  currentBudgetHbar: number;
  supplyCount: number;       // agents offering this service
  demandCount: number;       // tasks requesting this service (rolling window)
  supplyDemandRatio: number;
  lastAdjustedAt: number;
}

export interface PricingConfig {
  baseBudgetHbar: number;      // default budget when no history
  minBudgetHbar: number;       // floor
  maxBudgetHbar: number;       // ceiling
  demandWindowMs: number;      // rolling window for demand measurement
  adjustmentFactor: number;    // how aggressively to adjust (0.0–1.0)
  surplusDiscount: number;     // max discount when supply >> demand
  scarcityPremium: number;     // max premium when demand >> supply
}

// ─── Dynamic Pricing Engine ──────────────────────────────────────────────────

const DEFAULT_CONFIG: PricingConfig = {
  baseBudgetHbar: 0.5,
  minBudgetHbar: 0.01,
  maxBudgetHbar: 50,
  demandWindowMs: 10 * 60_000,  // 10 minutes
  adjustmentFactor: 0.3,
  surplusDiscount: 0.5,         // up to 50% cheaper
  scarcityPremium: 2.0,         // up to 2x more expensive
};

interface DemandRecord {
  serviceType: string;
  timestamp: number;
}

export class DynamicPricingEngine {
  private config: PricingConfig;
  private servicePricing = new Map<string, ServicePricing>();
  private demandLog: DemandRecord[] = [];
  private supplyMap = new Map<string, number>(); // serviceType → agent count

  constructor(overrides?: Partial<PricingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...overrides };
  }

  /**
   * Update the supply count for a service type (from registry watcher).
   */
  updateSupply(serviceType: string, agentCount: number): void {
    this.supplyMap.set(serviceType.toLowerCase(), agentCount);
    this.recalculate(serviceType);
  }

  /**
   * Record a task demand event for a service type.
   */
  recordDemand(serviceType: string): void {
    this.demandLog.push({
      serviceType: serviceType.toLowerCase(),
      timestamp: Date.now(),
    });
    this.recalculate(serviceType);
  }

  /**
   * Get the recommended budget for a service type.
   */
  getBudget(serviceType: string): number {
    const pricing = this.servicePricing.get(serviceType.toLowerCase());
    return pricing?.currentBudgetHbar ?? this.config.baseBudgetHbar;
  }

  /**
   * Get full pricing info for a service type.
   */
  getPricing(serviceType: string): ServicePricing {
    const key = serviceType.toLowerCase();
    const existing = this.servicePricing.get(key);
    if (existing) return existing;

    return {
      serviceType: key,
      baseBudgetHbar: this.config.baseBudgetHbar,
      currentBudgetHbar: this.config.baseBudgetHbar,
      supplyCount: 0,
      demandCount: 0,
      supplyDemandRatio: 1,
      lastAdjustedAt: Date.now(),
    };
  }

  /**
   * Recalculate pricing for a service type based on supply/demand.
   */
  private recalculate(serviceType: string): void {
    const key = serviceType.toLowerCase();
    const now = Date.now();
    const windowStart = now - this.config.demandWindowMs;

    // Clean old demand records
    this.demandLog = this.demandLog.filter((d) => d.timestamp > windowStart);

    // Count demand in window
    const demandCount = this.demandLog.filter((d) => d.serviceType === key).length;
    const supplyCount = this.supplyMap.get(key) ?? 0;

    // Supply/demand ratio (> 1 means surplus, < 1 means scarcity)
    const ratio = demandCount > 0
      ? supplyCount / demandCount
      : supplyCount > 0 ? 2.0 : 1.0; // surplus if agents but no demand

    // Calculate price multiplier
    let multiplier = 1.0;
    if (ratio > 1) {
      // Surplus: discount — more agents than tasks
      const discount = Math.min(this.config.surplusDiscount, (ratio - 1) * this.config.adjustmentFactor);
      multiplier = 1 - discount;
    } else if (ratio < 1) {
      // Scarcity: premium — more tasks than agents
      const premium = Math.min(this.config.scarcityPremium, (1 / ratio - 1) * this.config.adjustmentFactor);
      multiplier = 1 + premium;
    }

    const currentBudgetHbar = Math.max(
      this.config.minBudgetHbar,
      Math.min(this.config.maxBudgetHbar, this.config.baseBudgetHbar * multiplier),
    );

    const pricing: ServicePricing = {
      serviceType: key,
      baseBudgetHbar: this.config.baseBudgetHbar,
      currentBudgetHbar: Math.round(currentBudgetHbar * 1000) / 1000,
      supplyCount,
      demandCount,
      supplyDemandRatio: Math.round(ratio * 100) / 100,
      lastAdjustedAt: now,
    };

    this.servicePricing.set(key, pricing);

    logger.debug('DynamicPricing', {
      message: 'Price recalculated',
      serviceType: key,
      supply: supplyCount,
      demand: demandCount,
      ratio: pricing.supplyDemandRatio,
      budget: pricing.currentBudgetHbar,
    });
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  getAllPricing(): ServicePricing[] {
    return Array.from(this.servicePricing.values());
  }

  getStats() {
    const all = this.getAllPricing();
    return {
      trackedServices: all.length,
      averageBudget: all.length > 0
        ? all.reduce((s, p) => s + p.currentBudgetHbar, 0) / all.length
        : this.config.baseBudgetHbar,
      totalSupply: all.reduce((s, p) => s + p.supplyCount, 0),
      totalDemand: all.reduce((s, p) => s + p.demandCount, 0),
      config: this.config,
    };
  }
}

export const dynamicPricing = new DynamicPricingEngine();
