/**
 * Yield Aggregator 2.0 Sub-Agent
 * Multi-protocol yield optimization across SaucerSwap, BladeSwap, HeliSwap, and Kyber
 * Provides intelligent yield farming recommendations with auto-compound strategies
 */

import { SubAgent } from '../base.mjs';

export class YieldAggregator extends SubAgent {
  constructor(config) {
    super({
      ...config,
      role: 'YIELD_AGGREGATOR',
      interval: config.interval || 300000 // 5 minutes default
    });
    
    // Protocol configurations
    this.protocols = config.protocols || ['SaucerSwap', 'BladeSwap', 'HeliSwap', 'Kyber'];
    this.tokens = config.tokens || ['HBAR', 'USDC', 'SAUCE', 'DOVU', 'HBARX', 'KNC'];
    
    // Risk parameters
    this.minApyThreshold = config.minApyThreshold || 0.08; // 8% minimum APY
    this.maxRiskLevel = config.maxRiskLevel || 'MEDIUM'; // LOW, MEDIUM, HIGH
    this.minTvlThreshold = config.minTvlThreshold || 100000; // $100k minimum TVL
    
    // Tracking
    this.analysesCompleted = 0;
    this.recommendations = [];
    this.activePositions = new Map(); // userId -> positions[]
    this.yieldHistory = [];
    
    // Auto-compound settings
    this.autoCompoundEnabled = config.autoCompoundEnabled || false;
    this.compoundThreshold = config.compoundThreshold || 10; // Compound when rewards > $10
    
    // Cache
    this.poolCache = new Map();
    this.lastUpdate = 0;
    this.cacheTTL = 60000; // 1 minute
  }

  async performTask(parentContext) {
    const analysis = {
      timestamp: Date.now(),
      opportunities: [],
      topPools: [],
      riskAdjusted: [],
      recommendations: [],
      autoCompoundTriggers: []
    };
    
    // Fetch fresh data from all protocols
    await this.updatePoolCache();
    
    // Analyze each protocol
    for (const protocol of this.protocols) {
      const pools = await this.getProtocolPools(protocol);
      
      for (const pool of pools) {
        const poolAnalysis = this.analyzePool(pool, protocol);
        
        if (poolAnalysis.currentApy >= this.minApyThreshold && 
            poolAnalysis.tvl >= this.minTvlThreshold &&
            this.riskLevelToNumber(poolAnalysis.riskLevel) <= this.riskLevelToNumber(this.maxRiskLevel)) {
          analysis.opportunities.push(poolAnalysis);
        }
      }
    }
    
    // Sort by APY
    analysis.topPools = analysis.opportunities
      .sort((a, b) => b.currentApy - a.currentApy)
      .slice(0, 10);
    
    // Risk-adjusted opportunities
    analysis.riskAdjusted = analysis.opportunities
      .filter(o => o.riskScore < 0.5)
      .sort((a, b) => b.riskAdjustedApy - a.riskAdjustedApy);
    
    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);
    
    // Check auto-compound triggers
    if (this.autoCompoundEnabled) {
      analysis.autoCompoundTriggers = await this.checkAutoCompoundTriggers();
    }
    
    // Update tracking
    this.recommendations.push(...analysis.recommendations);
    if (this.recommendations.length > 50) {
      this.recommendations = this.recommendations.slice(-50);
    }
    
    this.analysesCompleted++;
    
    return analysis;
  }

  /**
   * Update pool cache from all protocols
   */
  async updatePoolCache() {
    const now = Date.now();
    if (now - this.lastUpdate < this.cacheTTL) {
      return;
    }
    
    for (const protocol of this.protocols) {
      try {
        const pools = await this.fetchProtocolPools(protocol);
        this.poolCache.set(protocol, {
          pools,
          timestamp: now
        });
      } catch (error) {
        console.warn(`[YieldAggregator] Failed to fetch ${protocol} pools:`, error.message);
      }
    }
    
    this.lastUpdate = now;
  }

  /**
   * Get pools for a specific protocol
   */
  async getProtocolPools(protocol) {
    const cached = this.poolCache.get(protocol);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.pools;
    }
    
    return this.fetchProtocolPools(protocol);
  }

  /**
   * Fetch pools from protocol (simulated - would be API calls in production)
   */
  async fetchProtocolPools(protocol) {
    const basePools = {
      'SaucerSwap': [
        { name: 'HBAR-USDC', baseApy: 0.15, tvl: 1500000, token0: 'HBAR', token1: 'USDC' },
        { name: 'SAUCE-HBAR', baseApy: 0.25, tvl: 800000, token0: 'SAUCE', token1: 'HBAR' },
        { name: 'DOVU-HBAR', baseApy: 0.20, tvl: 500000, token0: 'DOVU', token1: 'HBAR' },
        { name: 'HBARX-HBAR', baseApy: 0.08, tvl: 2000000, token0: 'HBARX', token1: 'HBAR' }
      ],
      'BladeSwap': [
        { name: 'HBAR-USDC', baseApy: 0.18, tvl: 800000, token0: 'HBAR', token1: 'USDC' },
        { name: 'SAUCE-HBAR', baseApy: 0.22, tvl: 400000, token0: 'SAUCE', token1: 'HBAR' },
        { name: 'KNC-HBAR', baseApy: 0.35, tvl: 150000, token0: 'KNC', token1: 'HBAR' }
      ],
      'HeliSwap': [
        { name: 'HBAR-USDC', baseApy: 0.12, tvl: 300000, token0: 'HBAR', token1: 'USDC' },
        { name: 'DOVU-HBAR', baseApy: 0.16, tvl: 200000, token0: 'DOVU', token1: 'HBAR' }
      ],
      'Kyber': [
        { name: 'ETH-USDC', baseApy: 0.12, tvl: 5000000, token0: 'ETH', token1: 'USDC', type: 'elastic' },
        { name: 'WBTC-ETH', baseApy: 0.08, tvl: 8000000, token0: 'WBTC', token1: 'ETH', type: 'elastic' },
        { name: 'KNC-ETH', baseApy: 0.28, tvl: 600000, token0: 'KNC', token1: 'ETH', type: 'classic' },
        { name: 'USDC-USDT', baseApy: 0.06, tvl: 12000000, token0: 'USDC', token1: 'USDT', type: 'elastic', stable: true }
      ]
    };
    
    const pools = basePools[protocol] || [];
    
    // Add some random variance to simulate real-time data
    return pools.map(pool => ({
      ...pool,
      currentApy: pool.baseApy * (0.85 + Math.random() * 0.3), // ±15% variance
      tvl: pool.tvl * (0.9 + Math.random() * 0.2), // ±10% variance
      protocol,
      timestamp: Date.now()
    }));
  }

  /**
   * Analyze a pool for yield opportunity
   */
  analyzePool(pool, protocol) {
    const volatility = this.estimateVolatility(pool);
    const currentApy = pool.currentApy || pool.baseApy;
    const tvl = pool.tvl;
    
    // Calculate risk score
    const riskScore = this.calculateRiskScore(pool, protocol, volatility, tvl);
    const riskLevel = this.scoreToRiskLevel(riskScore);
    
    // Impermanent loss estimate
    const impermanentLoss = this.estimateImpermanentLoss(pool, volatility);
    
    // Risk-adjusted APY
    const riskAdjustedApy = currentApy * (1 - riskScore);
    
    // Rewards breakdown
    const rewards = this.calculateRewards(pool);
    
    return {
      pool: pool.name,
      protocol,
      tokens: [pool.token0, pool.token1],
      currentApy,
      apyFormatted: (currentApy * 100).toFixed(2) + '%',
      tvl,
      tvlFormatted: '$' + (tvl / 1000000).toFixed(2) + 'M',
      riskScore,
      riskLevel,
      impermanentLoss: (impermanentLoss * 100).toFixed(2) + '%',
      riskAdjustedApy,
      volatility: (volatility * 100).toFixed(1) + '%',
      rewards,
      timestamp: Date.now(),
      poolType: pool.type || 'classic',
      isStable: pool.stable || false
    };
  }

  /**
   * Calculate risk score for a pool
   */
  calculateRiskScore(pool, protocol, volatility, tvl) {
    let score = 0;
    
    // Protocol risk
    const protocolRisk = {
      'SaucerSwap': 0.10,
      'BladeSwap': 0.12,
      'HeliSwap': 0.15,
      'Kyber': 0.08 // Lower risk due to higher liquidity
    };
    score += protocolRisk[protocol] || 0.15;
    
    // Volatility risk
    score += volatility * 0.5;
    
    // TVL risk (lower TVL = higher risk)
    score += Math.max(0, 0.2 - (tvl / 5000000) * 0.2);
    
    // Stable pairs have lower risk
    if (pool.stable) {
      score *= 0.5;
    }
    
    // Kyber Elastic pools have concentrated liquidity risk
    if (pool.type === 'elastic' && !pool.stable) {
      score += 0.05;
    }
    
    return Math.min(1.0, score);
  }

  /**
   * Estimate volatility for a pool
   */
  estimateVolatility(pool) {
    if (pool.stable) return 0.001; // Stable pairs very low volatility
    
    // Token-specific volatility estimates
    const tokenVolatility = {
      'ETH': 0.025,
      'WBTC': 0.03,
      'HBAR': 0.04,
      'SAUCE': 0.08,
      'DOVU': 0.10,
      'KNC': 0.06,
      'USDC': 0.001,
      'USDT': 0.001,
      'HBARX': 0.035
    };
    
    const vol0 = tokenVolatility[pool.token0] || 0.05;
    const vol1 = tokenVolatility[pool.token1] || 0.05;
    
    return (vol0 + vol1) / 2;
  }

  /**
   * Estimate impermanent loss
   */
  estimateImpermanentLoss(pool, volatility) {
    // Simplified IL calculation based on volatility
    // IL ≈ 0.5 * σ² for small price movements
    return 0.5 * Math.pow(volatility, 2);
  }

  /**
   * Calculate reward breakdown
   */
  calculateRewards(pool) {
    const rewards = [];
    const baseApy = pool.currentApy || pool.baseApy;
    
    // Base swap fees (typically 40-60% of APY)
    rewards.push({
      type: 'swap_fees',
      token: pool.token0 + '/' + pool.token1,
      percentage: baseApy * 0.5,
      formatted: (baseApy * 50).toFixed(2) + '%'
    });
    
    // Protocol rewards
    if (pool.protocol === 'SaucerSwap') {
      rewards.push({
        type: 'protocol_rewards',
        token: 'SAUCE',
        percentage: baseApy * 0.3,
        formatted: (baseApy * 30).toFixed(2) + '%'
      });
    } else if (pool.protocol === 'Kyber') {
      rewards.push({
        type: 'protocol_rewards',
        token: 'KNC',
        percentage: baseApy * 0.35,
        formatted: (baseApy * 35).toFixed(2) + '%'
      });
    }
    
    // Additional incentives
    if (pool.tvl < 1000000) {
      rewards.push({
        type: 'incentives',
        token: 'INCENTIVE',
        percentage: baseApy * 0.15,
        description: 'Low TVL boost'
      });
    }
    
    return rewards;
  }

  /**
   * Generate yield recommendations
   */
  generateRecommendations(analysis) {
    const recommendations = [];
    
    // Top opportunity recommendation
    if (analysis.topPools.length > 0) {
      const top = analysis.topPools[0];
      recommendations.push({
        type: 'TOP_OPPORTUNITY',
        pool: top.pool,
        protocol: top.protocol,
        apy: top.apyFormatted,
        riskLevel: top.riskLevel,
        action: `Consider allocating to ${top.pool} on ${top.protocol} for ${top.apyFormatted} APY (Risk: ${top.riskLevel})`,
        priority: top.riskLevel === 'LOW' ? 'HIGH' : 'MEDIUM',
        details: top
      });
    }
    
    // Risk-adjusted recommendation
    if (analysis.riskAdjusted.length > 0) {
      const safe = analysis.riskAdjusted[0];
      recommendations.push({
        type: 'RISK_ADJUSTED',
        pool: safe.pool,
        protocol: safe.protocol,
        apy: safe.apyFormatted,
        riskLevel: safe.riskLevel,
        action: `Conservative option: ${safe.pool} on ${safe.protocol} with ${safe.riskLevel} risk and ${safe.apyFormatted} APY`,
        priority: 'HIGH',
        details: safe
      });
    }
    
    // Multi-protocol diversification
    if (analysis.opportunities.length >= 3) {
      const protocols = [...new Set(analysis.opportunities.map(o => o.protocol))];
      if (protocols.length >= 2) {
        recommendations.push({
          type: 'DIVERSIFICATION',
          action: `Diversify across ${protocols.length} protocols: ${protocols.join(', ')} to reduce protocol risk`,
          priority: 'MEDIUM'
        });
      }
    }
    
    // Kyber-specific recommendation for cross-chain yields
    const kyberPools = analysis.opportunities.filter(o => o.protocol === 'Kyber');
    if (kyberPools.length > 0) {
      const bestKyber = kyberPools.sort((a, b) => b.currentApy - a.currentApy)[0];
      recommendations.push({
        type: 'KYBER_CROSS_CHAIN',
        pool: bestKyber.pool,
        apy: bestKyber.apyFormatted,
        action: `Cross-chain opportunity: ${bestKyber.pool} on Kyber for ${bestKyber.apyFormatted} APY via Ethereum bridge`,
        priority: 'MEDIUM',
        details: bestKyber
      });
    }
    
    return recommendations;
  }

  /**
   * Check auto-compound triggers
   */
  async checkAutoCompoundTriggers() {
    const triggers = [];
    
    for (const [userId, positions] of this.activePositions) {
      for (const position of positions) {
        const pendingRewards = position.pendingRewards || 0;
        
        if (pendingRewards >= this.compoundThreshold) {
          triggers.push({
            userId,
            position: position.id,
            pool: position.pool,
            pendingRewards,
            action: 'compound',
            estimatedGas: 0.5 // $0.50 gas estimate
          });
        }
      }
    }
    
    return triggers;
  }

  /**
   * Add or update user position
   */
  addPosition(userId, position) {
    if (!this.activePositions.has(userId)) {
      this.activePositions.set(userId, []);
    }
    
    const positions = this.activePositions.get(userId);
    const existingIndex = positions.findIndex(p => p.id === position.id);
    
    if (existingIndex >= 0) {
      positions[existingIndex] = { ...positions[existingIndex], ...position };
    } else {
      positions.push(position);
    }
  }

  /**
   * Remove user position
   */
  removePosition(userId, positionId) {
    if (!this.activePositions.has(userId)) return false;
    
    const positions = this.activePositions.get(userId);
    const index = positions.findIndex(p => p.id === positionId);
    
    if (index >= 0) {
      positions.splice(index, 1);
      return true;
    }
    
    return false;
  }

  /**
   * Get user positions
   */
  getUserPositions(userId) {
    return this.activePositions.get(userId) || [];
  }

  /**
   * Helper: Convert risk level to number
   */
  riskLevelToNumber(level) {
    const levels = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
    return levels[level] || 2;
  }

  /**
   * Helper: Convert score to risk level
   */
  scoreToRiskLevel(score) {
    if (score < 0.3) return 'LOW';
    if (score < 0.6) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Get comprehensive stats
   */
  getStats() {
    const allPositions = Array.from(this.activePositions.values()).flat();
    
    return {
      ...super.getStats(),
      protocols: this.protocols,
      analysesCompleted: this.analysesCompleted,
      opportunitiesTracked: this.recommendations.length,
      activePositions: allPositions.length,
      uniqueUsers: this.activePositions.size,
      topRecommendation: this.recommendations[this.recommendations.length - 1] || null,
      minApyThreshold: this.minApyThreshold,
      maxRiskLevel: this.maxRiskLevel,
      autoCompoundEnabled: this.autoCompoundEnabled
    };
  }

  /**
   * Get Prometheus metrics
   */
  getPrometheusMetrics() {
    const baseMetrics = super.getPrometheusMetrics();
    const allPositions = Array.from(this.activePositions.values()).flat();
    
    return `${baseMetrics}

# HELP yield_aggregator_analyses_total Total yield analyses completed
# TYPE yield_aggregator_analyses_total counter
yield_aggregator_analyses_total ${this.analysesCompleted}

# HELP yield_aggregator_active_positions Current active yield positions
# TYPE yield_aggregator_active_positions gauge
yield_aggregator_active_positions ${allPositions.length}

# HELP yield_aggregator_unique_users Number of unique users with positions
# TYPE yield_aggregator_unique_users gauge
yield_aggregator_unique_users ${this.activePositions.size}

# HELP yield_aggregator_min_apy_threshold Configured minimum APY threshold
# TYPE yield_aggregator_min_apy_threshold gauge
yield_aggregator_min_apy_threshold ${this.minApyThreshold}
`;
  }

  /**
   * Reset all stats
   */
  reset() {
    super.reset();
    this.analysesCompleted = 0;
    this.recommendations = [];
    this.activePositions.clear();
    this.poolCache.clear();
    this.lastUpdate = 0;
    this.yieldHistory = [];
  }
}

export default YieldAggregator;
