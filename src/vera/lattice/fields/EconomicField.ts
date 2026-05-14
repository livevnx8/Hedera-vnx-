/**
 * Vera Lattice - Economic Reasoning Field
 * 
 * Cost optimization, market rate analysis, and budget adherence reasoning
 * Dimensions: cost_efficiency, market_rate_alignment, budget_adherence, value_for_money,
 *             fee_competitiveness, payment_reliability, escrow_security
 */

import { ReasoningFieldImpl, LatticeNodeImpl } from '../core/LatticeField.js';
import type { Currency } from '../../types/index.js';
import { logger } from '../../../monitoring/logger.js';

export interface AgentPaymentHistory {
  agentId: string;
  totalSettlements: number;
  successfulSettlements: number;
  failedSettlements: number;
  averageSettlementTimeMs: number;
  totalHbarEarned: number;
  preferredCurrencies: Currency[];
  lastSettlementAt?: number;
}

export interface MarketRateData {
  serviceType: string;
  minFee: number;
  maxFee: number;
  averageFee: number;
  medianFee: number;
  currency: Currency;
  updatedAt: number;
}

export interface EconomicScore {
  agentId: string;
  costEfficiency: number;
  marketRateAlignment: number;
  paymentReliability: number;
  overallScore: number;
  recommendedMaxBudget: number;
  preferredCurrencies?: Currency[]; // Added for currency-aware routing
}

export class EconomicField extends ReasoningFieldImpl {
  private agentPaymentHistories: Map<string, AgentPaymentHistory> = new Map();
  private marketRates: Map<string, MarketRateData> = new Map();
  private currencyExchangeRates: Map<string, number> = new Map();

  constructor() {
    super('economic', 'Economic Optimization', [
      'cost_efficiency',
      'market_rate_alignment',
      'budget_adherence',
      'value_for_money',
      'fee_competitiveness',
      'payment_reliability',
      'escrow_security'
    ]);

    // Initialize default exchange rates (HBAR base)
    this.currencyExchangeRates.set('HBAR', 1.0);
    this.currencyExchangeRates.set('USDC', 0.05);  // 1 HBAR = ~0.05 USDC
    this.currencyExchangeRates.set('DOVU', 100.0); // 1 HBAR = ~100 DOVU
    this.currencyExchangeRates.set('XSGD', 0.07);  // 1 HBAR = ~0.07 XSGD
  }

  /**
   * Score an agent's payment capability based on their history
   */
  scoreAgentPaymentCapability(agentId: string): EconomicScore {
    const history = this.agentPaymentHistories.get(agentId);
    
    if (!history || history.totalSettlements === 0) {
      // New agent - neutral scores
      return {
        agentId,
        costEfficiency: 0.5,
        marketRateAlignment: 0.5,
        paymentReliability: 0.5,
        overallScore: 0.5,
        recommendedMaxBudget: 100 // Default for new agents
      };
    }

    const successRate = history.successfulSettlements / history.totalSettlements;
    const reliabilityScore = this.calculateReliabilityScore(history);
    
    // Cost efficiency based on average earnings vs market rate
    const marketRate = this.getMarketRateForAgent(agentId);
    const costEfficiency = marketRate 
      ? Math.min(1, history.totalHbarEarned / (marketRate.averageFee * history.totalSettlements))
      : 0.5;

    // Market rate alignment
    const marketAlignment = marketRate
      ? this.calculateMarketAlignment(history, marketRate)
      : 0.5;

    const overallScore = (reliabilityScore * 0.4 + costEfficiency * 0.3 + marketAlignment * 0.3);

    return {
      agentId,
      costEfficiency,
      marketRateAlignment: marketAlignment,
      paymentReliability: reliabilityScore,
      overallScore,
      recommendedMaxBudget: this.calculateRecommendedBudget(agentId, overallScore),
      preferredCurrencies: history?.preferredCurrencies || []
    };
  }

  /**
   * Assess settlement reliability for a specific agent
   */
  assessSettlementReliability(agentId: string): number {
    const history = this.agentPaymentHistories.get(agentId);
    if (!history || history.totalSettlements < 5) {
      return 0.5; // Neutral for new agents
    }

    const successRate = history.successfulSettlements / history.totalSettlements;
    const recencyBonus = history.lastSettlementAt && 
      (Date.now() - history.lastSettlementAt) < 86400000 // Within 24h
      ? 0.1 : 0;

    return Math.min(1, successRate + recencyBonus);
  }

  /**
   * Predict settlement latency for a currency type
   */
  predictPaymentLatency(currency: Currency): number {
    // Base latencies in milliseconds
    const baseLatencies: Record<Currency, number> = {
      'HBAR': 3000,    // ~3s for Hedera finality
      'USDC': 5000,    // ~5s for HTS token
      'DOVU': 4000,    // ~4s for DOVU token
      'XSGD': 5000     // ~5s for XSGD token
    };

    // Add network congestion factor (could be dynamic based on actual network metrics)
    const congestionFactor = 1.2; // 20% buffer

    return baseLatencies[currency] * congestionFactor;
  }

  /**
   * Compare agent fees to market rate and score competitiveness
   */
  scoreFeeCompetitiveness(agentId: string, fee: number, serviceType: string): number {
    const marketRate = this.marketRates.get(serviceType);
    if (!marketRate) {
      return 0.5;
    }

    // Score based on position within market range
    if (fee < marketRate.minFee) {
      return 1.0; // Below market minimum - very competitive
    }
    if (fee > marketRate.maxFee) {
      return 0.0; // Above market maximum - not competitive
    }

    // Linear interpolation within market range
    const range = marketRate.maxFee - marketRate.minFee;
    const position = fee - marketRate.minFee;
    const competitiveness = 1 - (position / range);

    // Bonus for being below median
    if (fee <= marketRate.medianFee) {
      return Math.min(1, competitiveness + 0.1);
    }

    return competitiveness;
  }

  /**
   * Calculate optimal budget allocation across multiple agents
   */
  calculateBudgetAllocation(
    totalBudget: number,
    agentIds: string[],
    serviceType: string
  ): Map<string, number> {
    const allocations = new Map<string, number>();
    const marketRate = this.marketRates.get(serviceType);
    
    if (!marketRate || agentIds.length === 0) {
      // Equal distribution fallback
      const equalShare = totalBudget / agentIds.length;
      agentIds.forEach(id => allocations.set(id, equalShare));
      return allocations;
    }

    // Calculate weighted scores for each agent
    const agentScores = agentIds.map(agentId => {
      const economicScore = this.scoreAgentPaymentCapability(agentId);
      return {
        agentId,
        score: economicScore.overallScore,
        reliability: economicScore.paymentReliability
      };
    });

    const totalScore = agentScores.reduce((sum, a) => sum + a.score, 0);
    
    // Allocate proportionally to scores, with reliability floor
    agentScores.forEach(({ agentId, score, reliability }) => {
      const proportion = totalScore > 0 ? score / totalScore : 1 / agentIds.length;
      const baseAllocation = totalBudget * proportion;
      
      // Ensure minimum allocation for reliable agents
      const minAllocation = reliability > 0.8 ? totalBudget * 0.1 : 0;
      const finalAllocation = Math.max(minAllocation, baseAllocation);
      
      allocations.set(agentId, finalAllocation);
    });

    // Normalize to ensure total equals budget
    const allocatedTotal = Array.from(allocations.values()).reduce((a, b) => a + b, 0);
    if (allocatedTotal !== totalBudget) {
      const scaleFactor = totalBudget / allocatedTotal;
      allocations.forEach((amount, id) => allocations.set(id, amount * scaleFactor));
    }

    return allocations;
  }

  /**
   * Update market rates based on recent transactions
   */
  updateMarketRate(serviceType: string, recentFees: number[], currency: Currency): void {
    if (recentFees.length === 0) return;

    const sorted = [...recentFees].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];

    this.marketRates.set(serviceType, {
      serviceType,
      minFee: min,
      maxFee: max,
      averageFee: avg,
      medianFee: median,
      currency,
      updatedAt: Date.now()
    });

    logger.info('EconomicField', {
      message: 'Market rate updated',
      serviceType,
      averageFee: avg,
      sampleSize: recentFees.length
    });
  }

  /**
   * Record a settlement outcome for an agent
   */
  recordSettlement(
    agentId: string,
    amount: number,
    currency: Currency,
    success: boolean,
    durationMs: number
  ): void {
    const history = this.agentPaymentHistories.get(agentId) || {
      agentId,
      totalSettlements: 0,
      successfulSettlements: 0,
      failedSettlements: 0,
      averageSettlementTimeMs: 0,
      totalHbarEarned: 0,
      preferredCurrencies: []
    };

    history.totalSettlements++;
    if (success) {
      history.successfulSettlements++;
      // Convert to HBAR equivalent
      const hbarEquivalent = amount * (this.currencyExchangeRates.get(currency) || 1);
      history.totalHbarEarned += hbarEquivalent;
    } else {
      history.failedSettlements++;
    }

    // Update rolling average settlement time
    history.averageSettlementTimeMs = 
      (history.averageSettlementTimeMs * (history.totalSettlements - 1) + durationMs) / 
      history.totalSettlements;

    history.lastSettlementAt = Date.now();

    if (!history.preferredCurrencies.includes(currency)) {
      history.preferredCurrencies.push(currency);
    }

    this.agentPaymentHistories.set(agentId, history);

    logger.debug('EconomicField', {
      message: 'Settlement recorded',
      agentId,
      success,
      amount,
      currency
    });
  }

  /**
   * Convert amount between currencies
   */
  convertCurrency(amount: number, from: Currency, to: Currency): number {
    const fromRate = this.currencyExchangeRates.get(from);
    const toRate = this.currencyExchangeRates.get(to);
    
    if (!fromRate || !toRate) {
      throw new Error(`Exchange rate not available for ${from} or ${to}`);
    }

    // Convert to HBAR base then to target
    const hbarEquivalent = amount / fromRate;
    return hbarEquivalent * toRate;
  }

  /**
   * Get the most cost-effective agents for a task
   */
  findMostCostEffectiveAgents(
    agentIds: string[],
    budget: number,
    minReliability: number = 0.7
  ): Array<{ agentId: string; score: EconomicScore; recommendedFee: number }> {
    const scored = agentIds
      .map(id => ({
        agentId: id,
        score: this.scoreAgentPaymentCapability(id)
      }))
      .filter(({ score }) => score.paymentReliability >= minReliability)
      .sort((a, b) => b.score.overallScore - a.score.overallScore);

    return scored.map(({ agentId, score }) => ({
      agentId,
      score,
      recommendedFee: Math.min(budget * 0.9, score.recommendedMaxBudget)
    }));
  }

  /**
   * Get field-specific statistics
   */
  getEconomicStats(): {
    totalAgentsTracked: number;
    totalMarketRates: number;
    averageReliability: number;
    totalVolumeHbar: number;
  } {
    const histories = Array.from(this.agentPaymentHistories.values());
    const totalVolume = histories.reduce((sum, h) => sum + h.totalHbarEarned, 0);
    const avgReliability = histories.length > 0
      ? histories.reduce((sum, h) => sum + (h.successfulSettlements / h.totalSettlements), 0) / histories.length
      : 0;

    return {
      totalAgentsTracked: histories.length,
      totalMarketRates: this.marketRates.size,
      averageReliability: avgReliability,
      totalVolumeHbar: totalVolume
    };
  }

  // Private helper methods

  private calculateReliabilityScore(history: AgentPaymentHistory): number {
    const successRate = history.successfulSettlements / history.totalSettlements;
    const volumeFactor = Math.min(1, history.totalSettlements / 20); // Max bonus at 20+ settlements
    const speedFactor = Math.max(0, 1 - (history.averageSettlementTimeMs / 10000)); // Bonus for fast settlement

    return (successRate * 0.6 + volumeFactor * 0.2 + speedFactor * 0.2);
  }

  private getMarketRateForAgent(agentId: string): MarketRateData | undefined {
    // Find market rate by looking up the agent's preferred service type
    // This is a simplified version - in production, agents would register their service type
    return Array.from(this.marketRates.values())[0];
  }

  private calculateMarketAlignment(history: AgentPaymentHistory, marketRate: MarketRateData): number {
    const avgEarning = history.totalHbarEarned / history.totalSettlements;
    const deviation = Math.abs(avgEarning - marketRate.averageFee) / marketRate.averageFee;
    return Math.max(0, 1 - deviation);
  }

  private calculateRecommendedBudget(agentId: string, score: number): number {
    // Higher scores get higher recommended budgets
    const baseBudget = 100;
    const scoreMultiplier = 1 + (score - 0.5) * 2; // 0.5 score = 1x, 1.0 score = 2x
    return Math.round(baseBudget * scoreMultiplier);
  }
}

// Singleton instance
export const economicField = new EconomicField();
export default economicField;
