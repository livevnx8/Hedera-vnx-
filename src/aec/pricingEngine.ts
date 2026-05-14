/**
 * Dynamic Pricing Engine (Phase 18)
 * 
 * Real-time service pricing based on demand, congestion, competitive
 * analysis, and value optimization.
 */

import { logger } from '../monitoring/logger.js';
import type {
  ServiceType,
  PricePoint,
  DemandForecast,
  MarketPosition
} from './types.js';

interface PricingConfig {
  basePrices: Record<ServiceType, number>;
  maxCongestionMultiplier: number;
  maxDemandMultiplier: number;
  updateIntervalMs: number;
  minPrice: number;
  currency: string;
}

interface ServiceMetrics {
  service: ServiceType;
  currentPrice: number;
  requestsLastHour: number;
  avgResponseTime: number;
  queueDepth: number;
  competitorPrices: number[];
  priceHistory: Array<{ price: number; timestamp: number }>;
}

export class DynamicPricingEngine {
  private config: PricingConfig;
  private metrics: Map<ServiceType, ServiceMetrics> = new Map();
  private currentPrices: Map<ServiceType, PricePoint> = new Map();
  private priceChangeHistory: Array<{ service: ServiceType; oldPrice: number; newPrice: number; reason: string; timestamp: number }> = [];

  constructor(config: Partial<PricingConfig> = {}) {
    this.config = {
      basePrices: {
        inference: 0.01,
        bridge: 0.05,
        governance: 0.10,
        storage: 0.001,
        compute: 0.02,
        multimodal: 0.05
      },
      maxCongestionMultiplier: 3.0,
      maxDemandMultiplier: 2.0,
      updateIntervalMs: 300000, // 5 minutes
      minPrice: 0.001,
      currency: 'USD',
      ...config
    };

    this.initializeMetrics();
  }

  /**
   * Calculate optimal price for a service
   */
  async calculateOptimalPrice(service: ServiceType): Promise<PricePoint> {
    const basePrice = this.config.basePrices[service];
    const metrics = this.metrics.get(service)!;

    // Calculate congestion multiplier
    const congestionMult = await this.adjustForCongestion(
      metrics.queueDepth / 100 // Normalized queue depth
    );

    // Calculate demand multiplier
    const demandForecast = await this.predictDemand(service, 24);
    const demandMult = this.calculateDemandMultiplier(demandForecast);

    // Calculate competitiveness adjustment
    const marketPos = await this.competitivePriceAnalysis(service);
    const competitiveMult = this.calculateCompetitiveMultiplier(marketPos);

    // Combine multipliers
    const finalMultiplier = congestionMult * demandMult * competitiveMult;
    let finalPrice = basePrice * finalMultiplier;

    // Apply floor
    finalPrice = Math.max(finalPrice, this.config.minPrice);

    // Round to 4 decimals
    finalPrice = Math.round(finalPrice * 10000) / 10000;

    const pricePoint: PricePoint = {
      service,
      basePrice,
      congestionMultiplier: congestionMult,
      demandMultiplier: demandMult,
      finalPrice,
      currency: this.config.currency,
      validUntil: Date.now() + this.config.updateIntervalMs
    };

    // Record price change if significant
    const currentPrice = this.currentPrices.get(service);
    if (currentPrice && Math.abs(currentPrice.finalPrice - finalPrice) / currentPrice.finalPrice > 0.05) {
      this.recordPriceChange(service, currentPrice.finalPrice, finalPrice, 'optimization');
    }

    this.currentPrices.set(service, pricePoint);
    metrics.currentPrice = finalPrice;
    metrics.priceHistory.push({ price: finalPrice, timestamp: Date.now() });

    // Keep only last 100 price points
    if (metrics.priceHistory.length > 100) {
      metrics.priceHistory.shift();
    }

    logger.info('DynamicPricingEngine', {
      message: 'Price optimized',
      service,
      basePrice,
      finalPrice,
      multiplier: finalMultiplier.toFixed(2)
    });

    return pricePoint;
  }

  /**
   * Predict demand for a service
   */
  async predictDemand(service: ServiceType, horizon: number): Promise<DemandForecast> {
    const metrics = this.metrics.get(service)!;
    const history = metrics.priceHistory;

    // Simple trend analysis
    let trend: 'up' | 'down' | 'stable' = 'stable';
    let predictedDemand = metrics.requestsLastHour;

    if (history.length >= 2) {
      const recent = history.slice(-5);
      const avgRecent = recent.reduce((s, p) => s + p.price, 0) / recent.length;
      const older = history.slice(-10, -5);
      const avgOlder = older.length > 0 
        ? older.reduce((s, p) => s + p.price, 0) / older.length 
        : avgRecent;

      if (avgRecent > avgOlder * 1.1) {
        trend = 'up';
        predictedDemand *= 1.2;
      } else if (avgRecent < avgOlder * 0.9) {
        trend = 'down';
        predictedDemand *= 0.8;
      }
    }

    // Apply seasonality (mock - would use actual patterns)
    const hour = new Date().getHours();
    const seasonality = (hour >= 9 && hour <= 17) ? 1.3 : 0.7; // Business hours
    predictedDemand *= seasonality;

    const forecast: DemandForecast = {
      service,
      horizon,
      predictedDemand,
      confidence: 0.75,
      seasonality,
      trend
    };

    return forecast;
  }

  /**
   * Adjust price based on network congestion
   */
  async adjustForCongestion(networkLoad: number): Promise<number> {
    // networkLoad: 0-1 where 1 is 100% capacity
    let multiplier = 1.0;

    if (networkLoad < 0.3) {
      // Low load - discount to drive usage
      multiplier = 0.9;
    } else if (networkLoad < 0.6) {
      // Normal load - standard pricing
      multiplier = 1.0;
    } else if (networkLoad < 0.8) {
      // Elevated - slight premium
      multiplier = 1.3;
    } else if (networkLoad < 0.95) {
      // High congestion - significant premium
      multiplier = 2.0;
    } else {
      // Critical - max premium
      multiplier = this.config.maxCongestionMultiplier;
    }

    return Math.min(multiplier, this.config.maxCongestionMultiplier);
  }

  /**
   * Analyze competitive market position
   */
  async competitivePriceAnalysis(service: ServiceType): Promise<MarketPosition> {
    const metrics = this.metrics.get(service)!;
    const ourPrice = metrics.currentPrice;

    // Mock competitor prices - would fetch from market APIs
    const competitors = metrics.competitorPrices.length > 0 
      ? metrics.competitorPrices 
      : this.getMockCompetitorPrices(service);

    const marketAvg = competitors.reduce((a, b) => a + b, 0) / competitors.length;
    const percentile = competitors.filter(p => p < ourPrice).length / competitors.length * 100;

    let competitiveness: 'premium' | 'competitive' | 'discount';
    if (percentile > 75) {
      competitiveness = 'premium';
    } else if (percentile < 25) {
      competitiveness = 'discount';
    } else {
      competitiveness = 'competitive';
    }

    return {
      service,
      ourPrice,
      marketAvg,
      percentile,
      competitiveness
    };
  }

  /**
   * Execute price change
   */
  async executePriceChange(newPrice: PricePoint): Promise<void> {
    const service = newPrice.service;
    const current = this.currentPrices.get(service);

    if (current) {
      this.recordPriceChange(service, current.finalPrice, newPrice.finalPrice, 'manual');
    }

    this.currentPrices.set(service, newPrice);

    const metrics = this.metrics.get(service)!;
    metrics.currentPrice = newPrice.finalPrice;

    logger.info('DynamicPricingEngine', {
      message: 'Price change executed',
      service,
      newPrice: newPrice.finalPrice,
      validUntil: new Date(newPrice.validUntil).toISOString()
    });
  }

  /**
   * Get current price for a service
   */
  getCurrentPrice(service: ServiceType): PricePoint | undefined {
    return this.currentPrices.get(service);
  }

  /**
   * Get all current prices
   */
  getAllPrices(): PricePoint[] {
    return Array.from(this.currentPrices.values());
  }

  /**
   * Update service metrics
   */
  updateMetrics(
    service: ServiceType,
    updates: Partial<Omit<ServiceMetrics, 'service' | 'priceHistory'>>
  ): void {
    const metrics = this.metrics.get(service);
    if (metrics) {
      Object.assign(metrics, updates);
    }
  }

  /**
   * Get price change history
   */
  getPriceHistory(service?: ServiceType): typeof this.priceChangeHistory {
    if (service) {
      return this.priceChangeHistory.filter(h => h.service === service);
    }
    return this.priceChangeHistory;
  }

  /**
   * Get pricing engine statistics
   */
  getStats() {
    const prices = this.getAllPrices();
    const priceChanges = this.priceChangeHistory;

    // Calculate average price change magnitude
    const avgChange = priceChanges.length > 0
      ? priceChanges.reduce((sum, c) => sum + Math.abs(c.newPrice - c.oldPrice) / c.oldPrice, 0) / priceChanges.length
      : 0;

    return {
      timestamp: Date.now(),
      servicesTracked: this.metrics.size,
      activePrices: prices.length,
      totalPriceChanges: priceChanges.length,
      avgPriceChangePct: (avgChange * 100).toFixed(2),
      updateInterval: this.config.updateIntervalMs,
      byService: prices.map(p => ({
        service: p.service,
        price: p.finalPrice,
        competitiveness: p.finalPrice / p.basePrice
      }))
    };
  }

  // Private methods
  private initializeMetrics(): void {
    const services: ServiceType[] = ['inference', 'bridge', 'governance', 'storage', 'compute', 'multimodal'];

    for (const service of services) {
      this.metrics.set(service, {
        service,
        currentPrice: this.config.basePrices[service],
        requestsLastHour: Math.floor(Math.random() * 1000),
        avgResponseTime: 100 + Math.random() * 500,
        queueDepth: Math.floor(Math.random() * 50),
        competitorPrices: this.getMockCompetitorPrices(service),
        priceHistory: [{
          price: this.config.basePrices[service],
          timestamp: Date.now()
        }]
      });

      // Initialize current price
      this.currentPrices.set(service, {
        service,
        basePrice: this.config.basePrices[service],
        congestionMultiplier: 1.0,
        demandMultiplier: 1.0,
        finalPrice: this.config.basePrices[service],
        currency: this.config.currency,
        validUntil: Date.now() + this.config.updateIntervalMs
      });
    }
  }

  private getMockCompetitorPrices(service: ServiceType): number[] {
    const base = this.config.basePrices[service];
    return [
      base * 0.8,
      base * 0.9,
      base * 1.0,
      base * 1.1,
      base * 1.2
    ];
  }

  private calculateDemandMultiplier(forecast: DemandForecast): number {
    const base = 1.0;

    // Trend adjustment
    if (forecast.trend === 'up') {
      return Math.min(base * 1.2, this.config.maxDemandMultiplier);
    } else if (forecast.trend === 'down') {
      return base * 0.9;
    }

    return base;
  }

  private calculateCompetitiveMultiplier(position: MarketPosition): number {
    // Adjust based on market position
    switch (position.competitiveness) {
      case 'premium':
        return 0.95; // Slight reduction to be more competitive
      case 'discount':
        return 1.05; // Slight increase for margin
      case 'competitive':
      default:
        return 1.0;
    }
  }

  private recordPriceChange(
    service: ServiceType,
    oldPrice: number,
    newPrice: number,
    reason: string
  ): void {
    this.priceChangeHistory.push({
      service,
      oldPrice,
      newPrice,
      reason,
      timestamp: Date.now()
    });

    // Keep only last 1000 changes
    if (this.priceChangeHistory.length > 1000) {
      this.priceChangeHistory.shift();
    }
  }
}

// Singleton
let pricingEngineInstance: DynamicPricingEngine | null = null;

export function getDynamicPricingEngine(config?: Partial<PricingConfig>): DynamicPricingEngine {
  if (!pricingEngineInstance) {
    pricingEngineInstance = new DynamicPricingEngine(config);
  }
  return pricingEngineInstance;
}
