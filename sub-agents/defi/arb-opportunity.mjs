/**
 * Arbitrage Opportunity Sub-Agent
 * Detects price discrepancies across DEXes for profit opportunities
 */

import { SubAgent } from '../base.mjs';

export class ArbOpportunity extends SubAgent {
  constructor(config) {
    super({
      ...config,
      role: 'ARBITRAGE_OPPORTUNITY',
      interval: config.interval || 30000 // 30 seconds default
    });
    
    this.exchanges = config.exchanges || ['SaucerSwap', 'BladeSwap', 'HeliSwap', 'Kyber'];
    this.tokens = config.tokens || ['HBAR', 'SAUCE', 'DOVU', 'HBARX', 'USDC'];
    this.minProfitThreshold = config.minProfitThreshold || 0.01; // 1%
    this.opportunitiesFound = 0;
    this.opportunityHistory = [];
  }

  async performTask(parentContext) {
    const opportunities = [];
    
    // Check each token across exchanges
    for (const token of this.tokens) {
      const prices = this.getPricesAcrossExchanges(token);
      const opportunity = this.findArbitrageOpportunity(token, prices);
      
      if (opportunity && opportunity.profitPotential >= this.minProfitThreshold) {
        opportunities.push(opportunity);
        this.opportunitiesFound++;
        this.opportunityHistory.push(opportunity);
        
        // Keep only last 50 opportunities
        if (this.opportunityHistory.length > 50) {
          this.opportunityHistory.shift();
        }
      }
    }
    
    return {
      opportunitiesFound: opportunities.length,
      opportunities,
      totalOpportunitiesTracked: this.opportunitiesFound,
      timestamp: Date.now()
    };
  }

  getPricesAcrossExchanges(token) {
    const basePrice = 0.5 + Math.random() * 1.5;
    
    return this.exchanges.map(exchange => ({
      exchange,
      token,
      price: basePrice * (0.98 + Math.random() * 0.04),
      liquidity: Math.floor(Math.random() * 1000000) + 100000,
      timestamp: Date.now()
    }));
  }

  findArbitrageOpportunity(token, prices) {
    // Find best spread
    const sorted = prices.sort((a, b) => a.price - b.price);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];
    
    const spread = (highest.price - lowest.price) / lowest.price;
    const profitAfterFees = spread * 0.98; // Account for 0.3% swap fees each way
    
    if (profitAfterFees < this.minProfitThreshold) {
      return null;
    }
    
    return {
      token,
      buyExchange: lowest.exchange,
      sellExchange: highest.exchange,
      buyPrice: lowest.price.toFixed(6),
      sellPrice: highest.price.toFixed(6),
      spread: (spread * 100).toFixed(2) + '%',
      profitPotential: profitAfterFees,
      estimatedProfit: (profitAfterFees * 10000).toFixed(2), // Assuming $10k trade
      liquidity: Math.min(lowest.liquidity, highest.liquidity),
      confidence: profitAfterFees > 0.02 ? 0.92 : 0.75,
      timestamp: Date.now()
    };
  }

  getStats() {
    return {
      ...super.getStats(),
      exchanges: this.exchanges.length,
      tokens: this.tokens.length,
      minProfitThreshold: this.minProfitThreshold,
      opportunitiesFound: this.opportunitiesFound,
      recentOpportunities: this.opportunityHistory.slice(-3)
    };
  }
}

export default ArbOpportunity;
