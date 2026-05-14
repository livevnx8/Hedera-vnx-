/**
 * Kybernaties Arbitrage Sub-Agent
 * Intelligent cross-DEX arbitrage detection and execution
 * Monitors SaucerSwap, BladeSwap, HeliSwap, and Kyber for price discrepancies
 */

import { SubAgent } from '../base.mjs';

export class KybernatiesArbitrage extends SubAgent {
  constructor(config) {
    super({
      ...config,
      role: 'KYBERNATIES_ARBITRAGE',
      interval: config.interval || 15000 // 15 seconds for high-frequency monitoring
    });
    
    // DEX configurations
    this.dexes = config.dexes || ['SaucerSwap', 'BladeSwap', 'HeliSwap', 'Kyber'];
    this.tokens = config.tokens || ['HBAR', 'USDC', 'SAUCE', 'DOVU', 'HBARX', 'KNC'];
    
    // Risk parameters
    this.minProfitThreshold = config.minProfitThreshold || 0.005; // 0.5% minimum spread
    this.maxTradeSize = config.maxTradeSize || 10000; // $10k max per trade
    this.minTradeSize = config.minTradeSize || 100; // $100 minimum
    this.dailyVolumeLimit = config.dailyVolumeLimit || 100000; // $100k daily limit
    
    // Tracking
    this.opportunitiesFound = 0;
    this.opportunitiesExecuted = 0;
    this.totalProfit = 0;
    this.dailyVolume = 0;
    this.opportunityHistory = [];
    this.activeTrades = new Map();
    this.lastReset = Date.now();
    
    // Price cache
    this.priceCache = new Map(); // token -> { dex, price, timestamp }
    this.priceCacheTTL = 10000; // 10 seconds
    
    // Cooldown to prevent spam
    this.cooldowns = new Map(); // token -> lastExecutionTime
    this.cooldownPeriod = 60000; // 1 minute between same-token trades
  }

  async performTask(parentContext) {
    const opportunities = [];
    const now = Date.now();
    
    // Reset daily volume if needed
    if (now - this.lastReset > 86400000) { // 24 hours
      this.dailyVolume = 0;
      this.lastReset = now;
    }
    
    // Check daily volume limit
    if (this.dailyVolume >= this.dailyVolumeLimit) {
      return {
        success: true,
        status: 'DAILY_LIMIT_REACHED',
        message: 'Daily volume limit reached, skipping scan',
        dailyVolume: this.dailyVolume
      };
    }
    
    // Fetch fresh prices for all tokens across all DEXes
    await this.updatePriceCache();
    
    // Analyze each token for arbitrage
    for (const token of this.tokens) {
      // Check cooldown
      const lastExecution = this.cooldowns.get(token);
      if (lastExecution && (now - lastExecution) < this.cooldownPeriod) {
        continue;
      }
      
      const opportunity = await this.findArbitrageOpportunity(token);
      
      if (opportunity && opportunity.profitable) {
        opportunities.push(opportunity);
        this.opportunitiesFound++;
        
        // Auto-execute if confidence is high enough
        if (opportunity.confidence >= 0.85 && parentContext.autoExecute !== false) {
          const result = await this.executeArbitrage(opportunity);
          if (result.success) {
            this.opportunitiesExecuted++;
            this.totalProfit += result.profit;
            this.dailyVolume += opportunity.tradeSize;
            this.cooldowns.set(token, now);
          }
        }
        
        // Record opportunity
        this.opportunityHistory.push({
          ...opportunity,
          timestamp: now,
          executed: opportunity.confidence >= 0.85
        });
        
        // Keep only last 100 opportunities
        if (this.opportunityHistory.length > 100) {
          this.opportunityHistory.shift();
        }
      }
    }
    
    return {
      success: true,
      opportunitiesFound: opportunities.length,
      opportunities,
      totalOpportunities: this.opportunitiesFound,
      totalExecuted: this.opportunitiesExecuted,
      totalProfit: this.totalProfit,
      dailyVolume: this.dailyVolume,
      timestamp: now
    };
  }

  /**
   * Update price cache from all DEXes
   */
  async updatePriceCache() {
    const now = Date.now();
    
    for (const token of this.tokens) {
      const prices = {};
      
      for (const dex of this.dexes) {
        try {
          const price = await this.fetchPrice(dex, token);
          if (price > 0) {
            prices[dex] = {
              price,
              timestamp: now,
              liquidity: await this.fetchLiquidity(dex, token)
            };
          }
        } catch (error) {
          // Silently skip unavailable DEXes
        }
      }
      
      if (Object.keys(prices).length >= 2) {
        this.priceCache.set(token, prices);
      }
    }
  }

  /**
   * Find arbitrage opportunity for a specific token
   */
  async findArbitrageOpportunity(token) {
    const prices = this.priceCache.get(token);
    if (!prices || Object.keys(prices).length < 2) {
      return null;
    }
    
    // Find best spread
    const entries = Object.entries(prices);
    let bestSpread = 0;
    let buyDex = null;
    let sellDex = null;
    let buyPrice = 0;
    let sellPrice = 0;
    
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [dex1, data1] = entries[i];
        const [dex2, data2] = entries[j];
        
        const spread1 = (data2.price - data1.price) / data1.price;
        const spread2 = (data1.price - data2.price) / data2.price;
        
        if (spread1 > bestSpread) {
          bestSpread = spread1;
          buyDex = dex1;
          sellDex = dex2;
          buyPrice = data1.price;
          sellPrice = data2.price;
        }
        
        if (spread2 > bestSpread) {
          bestSpread = spread2;
          buyDex = dex2;
          sellDex = dex1;
          buyPrice = data2.price;
          sellPrice = data1.price;
        }
      }
    }
    
    if (!buyDex || bestSpread < this.minProfitThreshold) {
      return null;
    }
    
    // Calculate fees (0.3% typical swap fee each way)
    const swapFee = 0.003;
    const networkFee = 0.0005; // Hedera network fees are minimal
    const totalFees = (swapFee * 2) + networkFee;
    
    // Net profit after fees
    const netProfit = bestSpread - totalFees;
    
    if (netProfit <= 0) {
      return null;
    }
    
    // Determine trade size based on liquidity
    const buyLiquidity = prices[buyDex].liquidity;
    const sellLiquidity = prices[sellDex].liquidity;
    const maxLiquidity = Math.min(buyLiquidity, sellLiquidity);
    const tradeSize = Math.min(this.maxTradeSize, Math.max(this.minTradeSize, maxLiquidity * 0.01)); // 1% of liquidity
    
    // Calculate confidence based on multiple factors
    let confidence = 0.5;
    
    // Higher spread = higher confidence (but cap at 0.95)
    confidence += Math.min(bestSpread * 10, 0.3);
    
    // Higher liquidity = higher confidence
    const liquidityScore = Math.min(maxLiquidity / 100000, 0.15);
    confidence += liquidityScore;
    
    // Price freshness
    const priceAge = Date.now() - prices[buyDex].timestamp;
    if (priceAge < 5000) confidence += 0.1; // < 5 seconds old
    
    // Market volatility check (lower confidence in volatile markets)
    if (token === 'KNC' || token === 'SAUCE') {
      confidence -= 0.1; // Higher volatility tokens
    }
    
    confidence = Math.min(0.95, confidence);
    
    return {
      token,
      buyDex,
      sellDex,
      buyPrice,
      sellPrice,
      spread: bestSpread,
      grossProfit: bestSpread,
      fees: totalFees,
      netProfit,
      tradeSize,
      estimatedProfit: netProfit * tradeSize,
      confidence,
      profitable: netProfit > this.minProfitThreshold,
      liquidity: maxLiquidity,
      timestamp: Date.now()
    };
  }

  /**
   * Execute arbitrage trade (simulation for now)
   */
  async executeArbitrage(opportunity) {
    const { token, buyDex, sellDex, tradeSize, netProfit, confidence } = opportunity;
    
    try {
      // Log the execution attempt
      console.log(`\n🎯 KYBERNATIES EXECUTING ARBITRAGE`);
      console.log(`   Token: ${token}`);
      console.log(`   Buy: ${buyDex} → Sell: ${sellDex}`);
      console.log(`   Size: $${tradeSize.toFixed(2)}`);
      console.log(`   Expected Profit: $${(netProfit * tradeSize).toFixed(2)} (${(netProfit * 100).toFixed(2)}%)`);
      console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
      
      // Simulate execution (would be actual DEX calls in production)
      const executionTime = 200 + Math.random() * 800; // 200-1000ms
      await this.sleep(executionTime);
      
      // Simulate slippage (0.1% to 0.5%)
      const slippage = 0.001 + Math.random() * 0.004;
      const actualProfit = netProfit - slippage;
      
      // Track the trade
      const tradeId = `arb_${Date.now()}_${token}`;
      this.activeTrades.set(tradeId, {
        ...opportunity,
        status: 'completed',
        slippage,
        actualProfit,
        executionTime
      });
      
      return {
        success: true,
        tradeId,
        profit: actualProfit * tradeSize,
        executionTime,
        slippage
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fetch price from specific DEX
   */
  async fetchPrice(dex, token) {
    // Simulated price fetching - would integrate with actual DEX APIs
    const basePrices = {
      HBAR: 0.15,
      USDC: 1.0,
      SAUCE: 0.08,
      DOVU: 0.05,
      HBARX: 0.16,
      KNC: 0.65
    };
    
    const basePrice = basePrices[token] || 1.0;
    
    // Add DEX-specific variance (±2%)
    const variance = (Math.random() - 0.5) * 0.04;
    
    // Kyber typically has slightly different prices (cross-chain)
    if (dex === 'Kyber') {
      const kyberVariance = (Math.random() - 0.5) * 0.02; // ±1%
      return basePrice * (1 + variance + kyberVariance);
    }
    
    return basePrice * (1 + variance);
  }

  /**
   * Fetch liquidity from specific DEX
   */
  async fetchLiquidity(dex, token) {
    // Simulated liquidity - would fetch from actual pools
    const baseLiquidity = {
      HBAR: 5000000,
      USDC: 3000000,
      SAUCE: 800000,
      DOVU: 500000,
      HBARX: 1000000,
      KNC: 200000
    };
    
    const base = baseLiquidity[token] || 100000;
    const variance = 0.8 + Math.random() * 0.4; // 80% to 120%
    
    return base * variance;
  }

  /**
   * Get comprehensive stats
   */
  getStats() {
    return {
      ...super.getStats(),
      dexes: this.dexes,
      tokens: this.tokens,
      opportunitiesFound: this.opportunitiesFound,
      opportunitiesExecuted: this.opportunitiesExecuted,
      totalProfit: this.totalProfit,
      dailyVolume: this.dailyVolume,
      dailyVolumeLimit: this.dailyVolumeLimit,
      successRate: this.opportunitiesFound > 0 
        ? (this.opportunitiesExecuted / this.opportunitiesFound * 100).toFixed(2) + '%'
        : '0%',
      avgProfitPerTrade: this.opportunitiesExecuted > 0
        ? (this.totalProfit / this.opportunitiesExecuted).toFixed(2)
        : '0',
      recentOpportunities: this.opportunityHistory.slice(-5),
      activeTrades: this.activeTrades.size,
      minProfitThreshold: this.minProfitThreshold,
      priceCacheSize: this.priceCache.size
    };
  }

  /**
   * Get Prometheus metrics
   */
  getPrometheusMetrics() {
    const baseMetrics = super.getPrometheusMetrics();
    
    return `${baseMetrics}

# HELP kybernaties_opportunities_found_total Total arbitrage opportunities detected
# TYPE kybernaties_opportunities_found_total counter
kybernaties_opportunities_found_total ${this.opportunitiesFound}

# HELP kybernaties_opportunities_executed_total Total arbitrage trades executed
# TYPE kybernaties_opportunities_executed_total counter
kybernaties_opportunities_executed_total ${this.opportunitiesExecuted}

# HELP kybernaties_total_profit_usd Accumulated profit in USD
# TYPE kybernaties_total_profit_usd gauge
kybernaties_total_profit_usd ${this.totalProfit.toFixed(2)}

# HELP kybernaties_daily_volume_usd Current daily trading volume
# TYPE kybernaties_daily_volume_usd gauge
kybernaties_daily_volume_usd ${this.dailyVolume.toFixed(2)}

# HELP kybernaties_active_trades Current number of active trades
# TYPE kybernaties_active_trades gauge
kybernaties_active_trades ${this.activeTrades.size}

# HELP kybernaties_price_cache_size Number of tokens in price cache
# TYPE kybernaties_price_cache_size gauge
kybernaties_price_cache_size ${this.priceCache.size}
`;
  }

  /**
   * Reset all stats
   */
  reset() {
    super.reset();
    this.opportunitiesFound = 0;
    this.opportunitiesExecuted = 0;
    this.totalProfit = 0;
    this.dailyVolume = 0;
    this.opportunityHistory = [];
    this.activeTrades.clear();
    this.priceCache.clear();
    this.cooldowns.clear();
    this.lastReset = Date.now();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default KybernatiesArbitrage;
