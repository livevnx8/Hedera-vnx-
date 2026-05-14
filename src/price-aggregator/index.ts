/**
 * Multi-DEX Price Aggregator Service
 * Coordinates price data from SaucerSwap, BladeSwap, HeliSwap, and Kyber
 * Provides unified price feed for arbitrage detection
 */

import { logger } from '../monitoring/logger.js';
import { kyberIntegration } from '../integrations/kyber.js';

interface PriceData {
  token: string;
  dex: string;
  price: number;
  liquidity: number;
  timestamp: number;
  confidence: number;
}

interface AggregatedPrice {
  token: string;
  medianPrice: number;
  bestBuy: { dex: string; price: number };
  bestSell: { dex: string; price: number };
  spread: number;
  sources: number;
  lastUpdate: number;
  prices: PriceData[];
}

interface ArbitrageSignal {
  token: string;
  spread: number;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  profitPercent: number;
  liquidity: number;
  confidence: number;
  timestamp: number;
}

export class PriceAggregator {
  private priceCache = new Map<string, AggregatedPrice>();
  private arbitrageHistory: ArbitrageSignal[] = [];
  private subscribers: Set<(signal: ArbitrageSignal) => void> = new Set();
  
  readonly CACHE_TTL = 10000; // 10 seconds
  readonly MIN_SPREAD_THRESHOLD = 0.005; // 0.5%
  readonly MAX_HISTORY_SIZE = 1000;

  constructor() {
    this.startAggregationLoop();
  }

  /**
   * Get aggregated price data for a token across all DEXes
   */
  async getAggregatedPrice(token: string): Promise<AggregatedPrice | null> {
    const cached = this.priceCache.get(token);
    if (cached && Date.now() - cached.lastUpdate < this.CACHE_TTL) {
      return cached;
    }

    // Fetch fresh prices from all sources
    const prices = await this.fetchAllPrices(token);
    if (prices.length < 2) {
      return null;
    }

    const aggregated = this.aggregatePrices(token, prices);
    this.priceCache.set(token, aggregated);
    
    // Check for arbitrage opportunity
    this.detectArbitrage(aggregated);
    
    return aggregated;
  }

  /**
   * Fetch prices from all integrated DEXes
   */
  private async fetchAllPrices(token: string): Promise<PriceData[]> {
    const prices: PriceData[] = [];
    const now = Date.now();

    // Fetch from Kyber (Ethereum-side for cross-chain comparison)
    try {
      const kyberPrice = await kyberIntegration.getPrice(token, 'ethereum');
      if (kyberPrice > 0) {
        prices.push({
          token,
          dex: 'Kyber',
          price: kyberPrice,
          liquidity: 1000000, // Default liquidity estimate
          timestamp: now,
          confidence: 0.9
        });
      }
    } catch (error) {
      logger.debug('PriceAggregator', { message: 'Kyber price fetch failed', token });
    }

    // Fetch from Hedera DEXes (simulated - would be actual API calls)
    const hederaDexes = ['SaucerSwap', 'BladeSwap', 'HeliSwap'];
    for (const dex of hederaDexes) {
      try {
        const price = await this.fetchHederaDexPrice(dex, token);
        const liquidity = await this.fetchHederaDexLiquidity(dex, token);
        
        if (price > 0) {
          prices.push({
            token,
            dex,
            price,
            liquidity,
            timestamp: now,
            confidence: 0.85
          });
        }
      } catch (error) {
        logger.debug('PriceAggregator', { message: `${dex} price fetch failed`, token });
      }
    }

    return prices;
  }

  /**
   * Aggregate price data from multiple sources
   */
  private aggregatePrices(token: string, prices: PriceData[]): AggregatedPrice {
    // Sort by price
    const sorted = [...prices].sort((a, b) => a.price - b.price);
    
    // Calculate median
    const mid = Math.floor(sorted.length / 2);
    const medianPrice = sorted.length % 2 === 0
      ? (sorted[mid - 1].price + sorted[mid].price) / 2
      : sorted[mid].price;

    // Best buy (lowest price) and best sell (highest price)
    const bestBuy = { dex: sorted[0].dex, price: sorted[0].price };
    const bestSell = { dex: sorted[sorted.length - 1].dex, price: sorted[sorted.length - 1].price };
    
    // Calculate spread
    const spread = (bestSell.price - bestBuy.price) / bestBuy.price;
    
    // Minimum liquidity between best buy/sell DEXes
    const buyLiquidity = prices.find(p => p.dex === bestBuy.dex)?.liquidity || 0;
    const sellLiquidity = prices.find(p => p.dex === bestSell.dex)?.liquidity || 0;
    const minLiquidity = Math.min(buyLiquidity, sellLiquidity);

    return {
      token,
      medianPrice,
      bestBuy,
      bestSell,
      spread,
      sources: prices.length,
      lastUpdate: Date.now(),
      prices
    };
  }

  /**
   * Detect arbitrage opportunity and notify subscribers
   */
  private detectArbitrage(aggregated: AggregatedPrice): void {
    const { token, spread, bestBuy, bestSell, prices } = aggregated;
    
    if (spread < this.MIN_SPREAD_THRESHOLD) {
      return;
    }

    // Get liquidity
    const buyLiquidity = prices.find(p => p.dex === bestBuy.dex)?.liquidity || 0;
    const sellLiquidity = prices.find(p => p.dex === bestSell.dex)?.liquidity || 0;
    const liquidity = Math.min(buyLiquidity, sellLiquidity);

    // Calculate confidence based on liquidity and spread
    let confidence = 0.5;
    confidence += Math.min(spread * 10, 0.3); // Higher spread = higher confidence
    confidence += Math.min(liquidity / 1000000, 0.2); // Higher liquidity = higher confidence
    confidence = Math.min(0.95, confidence);

    const signal: ArbitrageSignal = {
      token,
      spread,
      buyDex: bestBuy.dex,
      sellDex: bestSell.dex,
      buyPrice: bestBuy.price,
      sellPrice: bestSell.price,
      profitPercent: spread * 100,
      liquidity,
      confidence,
      timestamp: Date.now()
    };

    // Store in history
    this.arbitrageHistory.push(signal);
    if (this.arbitrageHistory.length > this.MAX_HISTORY_SIZE) {
      this.arbitrageHistory.shift();
    }

    // Notify subscribers
    this.subscribers.forEach(callback => {
      try {
        callback(signal);
      } catch (error) {
        logger.error('PriceAggregator', { message: 'Subscriber callback failed', error });
      }
    });

    logger.info('PriceAggregator', {
      message: 'Arbitrage signal detected',
      token,
      spread: (spread * 100).toFixed(2) + '%',
      buyDex: bestBuy.dex,
      sellDex: bestSell.dex,
      confidence: (confidence * 100).toFixed(1) + '%'
    });
  }

  /**
   * Subscribe to arbitrage signals
   */
  subscribe(callback: (signal: ArbitrageSignal) => void): () => void {
    this.subscribers.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get all current arbitrage opportunities above threshold
   */
  async getArbitrageOpportunities(minSpread = this.MIN_SPREAD_THRESHOLD): Promise<ArbitrageSignal[]> {
    const opportunities: ArbitrageSignal[] = [];
    const tokens = ['HBAR', 'USDC', 'SAUCE', 'DOVU', 'HBARX', 'KNC'];
    
    for (const token of tokens) {
      const aggregated = await this.getAggregatedPrice(token);
      if (aggregated && aggregated.spread >= minSpread) {
        const buyLiquidity = aggregated.prices.find(p => p.dex === aggregated.bestBuy.dex)?.liquidity || 0;
        const sellLiquidity = aggregated.prices.find(p => p.dex === aggregated.bestSell.dex)?.liquidity || 0;
        
        opportunities.push({
          token,
          spread: aggregated.spread,
          buyDex: aggregated.bestBuy.dex,
          sellDex: aggregated.bestSell.dex,
          buyPrice: aggregated.bestBuy.price,
          sellPrice: aggregated.bestSell.price,
          profitPercent: aggregated.spread * 100,
          liquidity: Math.min(buyLiquidity, sellLiquidity),
          confidence: 0.7 + Math.min(aggregated.spread * 5, 0.25),
          timestamp: aggregated.lastUpdate
        });
      }
    }
    
    return opportunities.sort((a, b) => b.spread - a.spread);
  }

  /**
   * Get arbitrage history
   */
  getArbitrageHistory(limit = 100): ArbitrageSignal[] {
    return this.arbitrageHistory.slice(-limit);
  }

  /**
   * Get price statistics for a token
   */
  getPriceStats(token: string): {
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    volatility: number;
    samples: number;
  } | null {
    const aggregated = this.priceCache.get(token);
    if (!aggregated || aggregated.prices.length === 0) {
      return null;
    }

    const prices = aggregated.prices.map(p => p.price);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    // Calculate volatility (standard deviation / mean)
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - avgPrice, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const volatility = stdDev / avgPrice;

    return {
      avgPrice,
      minPrice,
      maxPrice,
      volatility,
      samples: prices.length
    };
  }

  /**
   * Simulate Hedera DEX price fetch (would be actual API in production)
   */
  private async fetchHederaDexPrice(dex: string, token: string): Promise<number> {
    const basePrices: Record<string, number> = {
      HBAR: 0.15,
      USDC: 1.0,
      USDT: 1.0,
      SAUCE: 0.08,
      DOVU: 0.05,
      HBARX: 0.16,
      KNC: 0.65
    };

    const basePrice = basePrices[token] || 1.0;
    
    // DEX-specific variance
    const dexVariance: Record<string, number> = {
      'SaucerSwap': 0,
      'BladeSwap': 0.002,
      'HeliSwap': -0.001
    };
    
    const variance = dexVariance[dex] || 0;
    const randomVariance = (Math.random() - 0.5) * 0.01;
    
    return basePrice * (1 + variance + randomVariance);
  }

  /**
   * Simulate Hedera DEX liquidity fetch (would be actual API in production)
   */
  private async fetchHederaDexLiquidity(dex: string, token: string): Promise<number> {
    const baseLiquidity: Record<string, number> = {
      HBAR: 5000000,
      USDC: 3000000,
      SAUCE: 800000,
      DOVU: 500000,
      HBARX: 1000000,
      KNC: 200000
    };

    const base = baseLiquidity[token] || 100000;
    
    // DEX-specific liquidity multipliers
    const dexMultipliers: Record<string, number> = {
      'SaucerSwap': 1.0,
      'BladeSwap': 0.6,
      'HeliSwap': 0.4
    };
    
    const multiplier = dexMultipliers[dex] || 0.5;
    const variance = 0.9 + Math.random() * 0.2; // ±10%
    
    return base * multiplier * variance;
  }

  /**
   * Start continuous price aggregation
   */
  private startAggregationLoop(): void {
    const tokens = ['HBAR', 'USDC', 'SAUCE', 'DOVU', 'HBARX', 'KNC'];
    
    // Initial fetch
    tokens.forEach(token => this.getAggregatedPrice(token));
    
    // Periodic updates
    setInterval(() => {
      tokens.forEach(async (token) => {
        try {
          await this.getAggregatedPrice(token);
        } catch (error) {
          logger.error('PriceAggregator', { message: 'Price update failed', token, error });
        }
      });
    }, this.CACHE_TTL);
  }

  /**
   * Health check
   */
  async getHealth(): Promise<{
    status: string;
    cachedTokens: number;
    subscribers: number;
    arbitrageSignals: number;
  }> {
    return {
      status: this.priceCache.size > 0 ? 'healthy' : 'degraded',
      cachedTokens: this.priceCache.size,
      subscribers: this.subscribers.size,
      arbitrageSignals: this.arbitrageHistory.length
    };
  }
}

// Singleton instance
export const priceAggregator = new PriceAggregator();

export default PriceAggregator;
