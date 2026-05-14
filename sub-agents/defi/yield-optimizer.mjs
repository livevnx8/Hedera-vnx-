/**
 * Yield Optimizer Sub-Agent
 * Analyzes yield farming opportunities and optimal allocation strategies
 */

import { SubAgent } from '../base.mjs';

export class YieldOptimizer extends SubAgent {
  constructor(config) {
    super({
      ...config,
      role: 'YIELD_OPTIMIZER',
      interval: config.interval || 300000 // 5 minutes default
    });
    
    this.pools = config.pools || [
      { name: 'HBAR-USDC', protocol: 'SaucerSwap', baseApy: 0.15 },
      { name: 'SAUCE-HBAR', protocol: 'SaucerSwap', baseApy: 0.25 },
      { name: 'DOVU-HBAR', protocol: 'SaucerSwap', baseApy: 0.20 },
      { name: 'HBARX', protocol: 'Stader', baseApy: 0.08 },
      { name: 'HBAR-USDC', protocol: 'BladeSwap', baseApy: 0.18 },
      { name: 'KNC-ETH', protocol: 'Kyber', baseApy: 0.28, type: 'elastic' },
      { name: 'ETH-USDC', protocol: 'Kyber', baseApy: 0.12, type: 'elastic' },
      { name: 'WBTC-ETH', protocol: 'Kyber', baseApy: 0.08, type: 'elastic' }
    ];
    this.minApyThreshold = config.minApyThreshold || 0.10; // 10% minimum
    this.analysesCompleted = 0;
    this.recommendations = [];
  }

  async performTask(parentContext) {
    const analysis = {
      opportunities: [],
      topPools: [],
      riskAdjusted: [],
      recommendations: []
    };
    
    // Analyze each pool
    for (const pool of this.pools) {
      const poolAnalysis = this.analyzePool(pool);
      
      if (poolAnalysis.currentApy >= this.minApyThreshold) {
        analysis.opportunities.push(poolAnalysis);
      }
    }
    
    // Sort by APY
    analysis.topPools = analysis.opportunities
      .sort((a, b) => b.currentApy - a.currentApy)
      .slice(0, 5);
    
    // Risk-adjusted opportunities
    analysis.riskAdjusted = analysis.opportunities
      .filter(o => o.riskScore < 0.5)
      .sort((a, b) => b.riskAdjustedApy - a.riskAdjustedApy);
    
    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);
    this.recommendations.push(...analysis.recommendations);
    
    // Keep only last 20 recommendations
    if (this.recommendations.length > 20) {
      this.recommendations = this.recommendations.slice(-20);
    }
    
    this.analysesCompleted++;
    
    return {
      ...analysis,
      totalAnalyses: this.analysesCompleted,
      timestamp: Date.now()
    };
  }

  analyzePool(pool) {
    const volatility = Math.random() * 0.3;
    const currentApy = pool.baseApy * (0.8 + Math.random() * 0.4);
    const tvl = Math.floor(Math.random() * 10000000) + 1000000;
    const riskScore = this.calculateRiskScore(pool, volatility, tvl);
    const impermanentLoss = this.calculateImpermanentLoss(pool, volatility);
    
    return {
      pool: pool.name,
      protocol: pool.protocol,
      currentApy: currentApy,
      apyFormatted: (currentApy * 100).toFixed(2) + '%',
      tvl,
      tvlFormatted: '$' + (tvl / 1000000).toFixed(2) + 'M',
      volatility: (volatility * 100).toFixed(1) + '%',
      riskScore,
      riskLevel: riskScore < 0.3 ? 'LOW' : riskScore < 0.6 ? 'MEDIUM' : 'HIGH',
      impermanentLoss: (impermanentLoss * 100).toFixed(2) + '%',
      riskAdjustedApy: currentApy * (1 - riskScore),
      timestamp: Date.now()
    };
  }

  calculateRiskScore(pool, volatility, tvl) {
    let score = 0;
    
    // Protocol risk
    if (pool.protocol === 'SaucerSwap') score += 0.1;
    else if (pool.protocol === 'Stader') score += 0.15;
    else if (pool.protocol === 'Kyber') score += 0.08; // Lower risk due to higher liquidity
    else score += 0.25;
    
    // Kyber Elastic pools have concentrated liquidity risk
    if (pool.protocol === 'Kyber' && pool.type === 'elastic') {
      score += 0.05;
    }
    
    // Volatility risk
    score += volatility * 0.5;
    
    // TVL risk (higher TVL = lower risk)
    score += Math.max(0, 0.2 - (tvl / 10000000) * 0.2);
    
    return Math.min(1.0, score);
  }

  calculateImpermanentLoss(pool, volatility) {
    // Simplified IL calculation
    return volatility * 0.5;
  }

  generateRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.topPools.length > 0) {
      const topPool = analysis.topPools[0];
      recommendations.push({
        type: 'TOP_OPPORTUNITY',
        pool: topPool.pool,
        protocol: topPool.protocol,
        apy: topPool.apyFormatted,
        action: `Consider allocating to ${topPool.pool} on ${topPool.protocol} for ${topPool.apyFormatted} APY`,
        priority: 'HIGH',
        timestamp: Date.now()
      });
    }
    
    if (analysis.riskAdjusted.length > 0) {
      const safePick = analysis.riskAdjusted[0];
      recommendations.push({
        type: 'RISK_ADJUSTED',
        pool: safePick.pool,
        protocol: safePick.protocol,
        apy: safePick.apyFormatted,
        riskLevel: safePick.riskLevel,
        action: `Conservative option: ${safePick.pool} with ${safePick.riskLevel} risk and ${safePick.apyFormatted} APY`,
        priority: 'MEDIUM',
        timestamp: Date.now()
      });
    }
    
    return recommendations;
  }

  getStats() {
    return {
      ...super.getStats(),
      poolsTracked: this.pools.length,
      minApyThreshold: this.minApyThreshold,
      analysesCompleted: this.analysesCompleted,
      recentRecommendations: this.recommendations.slice(-3)
    };
  }
}

export default YieldOptimizer;
