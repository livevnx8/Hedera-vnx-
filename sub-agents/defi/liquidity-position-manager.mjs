/**
 * Liquidity Position Manager Sub-Agent
 * Tracks and manages LP positions across SaucerSwap, BladeSwap, HeliSwap, and Kyber
 * Provides IL monitoring, rebalancing suggestions, and auto-withdrawal protection
 */

import { SubAgent } from '../base.mjs';

export class LiquidityPositionManager extends SubAgent {
  constructor(config) {
    super({
      ...config,
      role: 'LIQUIDITY_POSITION_MANAGER',
      interval: config.interval || 60000 // 1 minute default for IL monitoring
    });
    
    // Protocol support
    this.protocols = config.protocols || ['SaucerSwap', 'BladeSwap', 'HeliSwap', 'Kyber'];
    
    // IL monitoring thresholds
    this.ilWarningThreshold = config.ilWarningThreshold || 0.02; // 2% IL warning
    this.ilAlertThreshold = config.ilAlertThreshold || 0.05; // 5% IL alert
    this.ilExitThreshold = config.ilExitThreshold || 0.10; // 10% IL consider exit
    
    // Fee APR monitoring
    this.minFeeAprThreshold = config.minFeeAprThreshold || 0.05; // 5% min fee APR
    
    // Position tracking
    this.positions = new Map(); // positionId -> position
    this.userPositions = new Map(); // userId -> positionIds[]
    this.ilHistory = []; // IL events
    this.feeHistory = []; // Fee accrual history
    
    // Alerts and notifications
    this.pendingAlerts = [];
    this.alertHistory = [];
    
    // Rebalancing recommendations
    this.rebalancingQueue = [];
    
    // Auto-exit settings
    this.autoExitEnabled = config.autoExitEnabled || false;
    this.autoExitThreshold = config.autoExitThreshold || 0.15; // 15% IL auto-exit
  }

  async performTask(parentContext) {
    const analysis = {
      timestamp: Date.now(),
      positionsAnalyzed: 0,
      ilAlerts: [],
      feeUpdates: [],
      rebalancingSuggestions: [],
      autoExitTriggered: [],
      portfolioSummary: {}
    };
    
    // Update all position values
    await this.updatePositionValues();
    
    // Analyze each position
    for (const [positionId, position] of this.positions) {
      analysis.positionsAnalyzed++;
      
      // Check impermanent loss
      const ilAnalysis = this.analyzeImpermanentLoss(position);
      if (ilAnalysis.alert) {
        analysis.ilAlerts.push(ilAnalysis);
        this.ilHistory.push({
          positionId,
          timestamp: Date.now(),
          il: ilAnalysis.currentIL
        });
      }
      
      // Check if auto-exit should trigger
      if (this.autoExitEnabled && ilAnalysis.currentIL >= this.autoExitThreshold) {
        analysis.autoExitTriggered.push({
          positionId,
          position: position.pool,
          il: ilAnalysis.currentIL,
          reason: 'Auto-exit threshold reached'
        });
      }
      
      // Update fee earnings
      const feeUpdate = this.updateFeeEarnings(position);
      if (feeUpdate.significant) {
        analysis.feeUpdates.push(feeUpdate);
      }
      
      // Check if rebalancing is recommended
      const rebalance = this.checkRebalancingNeed(position);
      if (rebalance.needed) {
        analysis.rebalancingSuggestions.push(rebalance);
      }
    }
    
    // Generate portfolio summary
    analysis.portfolioSummary = this.generatePortfolioSummary();
    
    // Keep history limited
    this.trimHistory();
    
    return analysis;
  }

  /**
   * Add a new LP position
   */
  addPosition(userId, positionData) {
    const positionId = `lp_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const position = {
      id: positionId,
      userId,
      protocol: positionData.protocol,
      pool: positionData.pool,
      token0: positionData.token0,
      token1: positionData.token1,
      initialAmount0: positionData.amount0,
      initialAmount1: positionData.amount1,
      initialPrice: positionData.price,
      entryTimestamp: Date.now(),
      currentAmount0: positionData.amount0,
      currentAmount1: positionData.amount1,
      currentPrice: positionData.price,
      feesEarned0: 0,
      feesEarned1: 0,
      totalFeesUSD: 0,
      currentIL: 0,
      status: 'active'
    };
    
    this.positions.set(positionId, position);
    
    if (!this.userPositions.has(userId)) {
      this.userPositions.set(userId, []);
    }
    this.userPositions.get(userId).push(positionId);
    
    return positionId;
  }

  /**
   * Remove a position
   */
  removePosition(positionId) {
    const position = this.positions.get(positionId);
    if (!position) return false;
    
    // Remove from user positions
    const userPositions = this.userPositions.get(position.userId);
    if (userPositions) {
      const index = userPositions.indexOf(positionId);
      if (index > -1) userPositions.splice(index, 1);
    }
    
    // Archive position data before removal
    this.archivePosition(position);
    
    // Remove from active positions
    this.positions.delete(positionId);
    
    return true;
  }

  /**
   * Update position values (simulated price movements)
   */
  async updatePositionValues() {
    for (const [positionId, position] of this.positions) {
      if (position.status !== 'active') continue;
      
      // Simulate price movement
      const priceChange = (Math.random() - 0.5) * 0.02; // ±1% price movement
      position.currentPrice = position.initialPrice * (1 + priceChange);
      
      // Calculate new amounts based on constant product formula (x*y=k)
      const k = position.initialAmount0 * position.initialAmount1;
      const newAmount0 = Math.sqrt(k / position.currentPrice);
      const newAmount1 = Math.sqrt(k * position.currentPrice);
      
      position.currentAmount0 = newAmount0;
      position.currentAmount1 = newAmount1;
      
      // Simulate fee accrual (0.01% per check)
      const feeRate = 0.0001;
      position.feesEarned0 += position.currentAmount0 * feeRate;
      position.feesEarned1 += position.currentAmount1 * feeRate;
      
      // Update total fees in USD (simplified)
      const token0Price = this.getTokenPrice(position.token0);
      const token1Price = this.getTokenPrice(position.token1);
      position.totalFeesUSD = 
        (position.feesEarned0 * token0Price) + 
        (position.feesEarned1 * token1Price);
    }
  }

  /**
   * Analyze impermanent loss for a position
   */
  analyzeImpermanentLoss(position) {
    const priceRatio = position.currentPrice / position.initialPrice;
    
    // IL formula: 2√(priceRatio) / (1 + priceRatio) - 1
    const il = (2 * Math.sqrt(priceRatio) / (1 + priceRatio)) - 1;
    position.currentIL = Math.abs(il);
    
    const analysis = {
      positionId: position.id,
      pool: position.pool,
      protocol: position.protocol,
      currentIL: Math.abs(il),
      ilFormatted: (Math.abs(il) * 100).toFixed(2) + '%',
      priceChange: ((priceRatio - 1) * 100).toFixed(2) + '%',
      feesOffset: position.totalFeesUSD,
      netPnL: this.calculateNetPnL(position),
      alert: false,
      severity: 'none'
    };
    
    // Determine alert level
    if (Math.abs(il) >= this.ilExitThreshold) {
      analysis.alert = true;
      analysis.severity = 'critical';
      analysis.message = `Critical IL: ${analysis.ilFormatted} - Consider exiting position`;
    } else if (Math.abs(il) >= this.ilAlertThreshold) {
      analysis.alert = true;
      analysis.severity = 'high';
      analysis.message = `High IL: ${analysis.ilFormatted} - Monitor closely`;
    } else if (Math.abs(il) >= this.ilWarningThreshold) {
      analysis.alert = true;
      analysis.severity = 'medium';
      analysis.message = `IL Warning: ${analysis.ilFormatted}`;
    }
    
    return analysis;
  }

  /**
   * Calculate net P&L (fees - IL)
   */
  calculateNetPnL(position) {
    const token0Price = this.getTokenPrice(position.token0);
    const token1Price = this.getTokenPrice(position.token1);
    
    const initialValue = 
      (position.initialAmount0 * token0Price) + 
      (position.initialAmount1 * token1Price);
    
    const currentValue = 
      (position.currentAmount0 * token0Price) + 
      (position.currentAmount1 * token1Price);
    
    const ilLoss = initialValue - currentValue;
    const netPnL = position.totalFeesUSD - ilLoss;
    
    return {
      initialValue,
      currentValue,
      ilLoss,
      feesEarned: position.totalFeesUSD,
      netPnL,
      roi: ((netPnL / initialValue) * 100).toFixed(2) + '%'
    };
  }

  /**
   * Update fee earnings
   */
  updateFeeEarnings(position) {
    const hourlyFeeRate = 0.0005; // 0.05% per hour
    const feesSinceLast = position.totalFeesUSD * hourlyFeeRate;
    
    const update = {
      positionId: position.id,
      pool: position.pool,
      feesSinceLast,
      totalFees: position.totalFeesUSD,
      apr: this.calculateFeeAPR(position),
      significant: feesSinceLast > 1 // Significant if > $1
    };
    
    if (update.significant) {
      this.feeHistory.push({
        positionId: position.id,
        timestamp: Date.now(),
        fees: feesSinceLast
      });
    }
    
    return update;
  }

  /**
   * Calculate fee APR for position
   */
  calculateFeeAPR(position) {
    const pnl = this.calculateNetPnL(position);
    const daysSinceEntry = (Date.now() - position.entryTimestamp) / (1000 * 60 * 60 * 24);
    
    if (daysSinceEntry < 1) return 0;
    
    const dailyReturn = pnl.feesEarned / daysSinceEntry / pnl.initialValue;
    return dailyReturn * 365;
  }

  /**
   * Check if rebalancing is needed
   */
  checkRebalancingNeed(position) {
    const result = {
      positionId: position.id,
      pool: position.pool,
      needed: false,
      reason: null,
      currentAllocation: 0,
      suggestedAllocation: 0,
      priority: 'low'
    };
    
    // Check fee APR
    const feeAPR = this.calculateFeeAPR(position);
    if (feeAPR < this.minFeeAprThreshold) {
      result.needed = true;
      result.reason = 'Low fee APR';
      result.currentAPR = (feeAPR * 100).toFixed(2) + '%';
      result.minAPR = (this.minFeeAprThreshold * 100) + '%';
      result.priority = 'medium';
    }
    
    // Check IL vs fees balance
    const pnl = this.calculateNetPnL(position);
    if (pnl.ilLoss > pnl.feesEarned * 2) {
      result.needed = true;
      result.reason = result.reason ? `${result.reason}, IL exceeding fees` : 'IL exceeding fees';
      result.ilToFeeRatio = (pnl.ilLoss / pnl.feesEarned).toFixed(2);
      result.priority = 'high';
    }
    
    return result;
  }

  /**
   * Generate portfolio summary for a user
   */
  getUserPortfolio(userId) {
    const positionIds = this.userPositions.get(userId) || [];
    const positions = positionIds.map(id => this.positions.get(id)).filter(p => p);
    
    if (positions.length === 0) {
      return null;
    }
    
    let totalValue = 0;
    let totalFees = 0;
    let totalIL = 0;
    let weightedIL = 0;
    
    const protocolBreakdown = {};
    const poolBreakdown = [];
    
    for (const position of positions) {
      const pnl = this.calculateNetPnL(position);
      totalValue += pnl.currentValue;
      totalFees += pnl.feesEarned;
      totalIL += pnl.ilLoss;
      weightedIL += position.currentIL * pnl.currentValue;
      
      // Protocol breakdown
      if (!protocolBreakdown[position.protocol]) {
        protocolBreakdown[position.protocol] = {
          positions: 0,
          value: 0,
          fees: 0
        };
      }
      protocolBreakdown[position.protocol].positions++;
      protocolBreakdown[position.protocol].value += pnl.currentValue;
      protocolBreakdown[position.protocol].fees += pnl.feesEarned;
      
      // Pool breakdown
      poolBreakdown.push({
        id: position.id,
        pool: position.pool,
        protocol: position.protocol,
        value: pnl.currentValue,
        fees: pnl.feesEarned,
        il: pnl.ilLoss,
        netPnL: pnl.netPnL,
        roi: pnl.roi,
        ilPercent: (position.currentIL * 100).toFixed(2) + '%'
      });
    }
    
    return {
      userId,
      totalPositions: positions.length,
      totalValue,
      totalValueFormatted: '$' + totalValue.toLocaleString(),
      totalFees,
      totalFeesFormatted: '$' + totalFees.toLocaleString(),
      totalIL,
      totalILFormatted: '$' + totalIL.toLocaleString(),
      netPnL: totalFees - totalIL,
      netPnLFormatted: '$' + (totalFees - totalIL).toLocaleString(),
      avgIL: totalValue > 0 ? (weightedIL / totalValue) : 0,
      avgILFormatted: totalValue > 0 ? ((weightedIL / totalValue) * 100).toFixed(2) + '%' : '0%',
      protocolBreakdown,
      poolBreakdown: poolBreakdown.sort((a, b) => b.value - a.value)
    };
  }

  /**
   * Generate overall portfolio summary
   */
  generatePortfolioSummary() {
    const allPositions = Array.from(this.positions.values());
    
    if (allPositions.length === 0) {
      return { positions: 0, totalValue: 0 };
    }
    
    let totalValue = 0;
    let totalFees = 0;
    let totalIL = 0;
    
    const protocolStats = {};
    
    for (const position of allPositions) {
      const pnl = this.calculateNetPnL(position);
      totalValue += pnl.currentValue;
      totalFees += pnl.feesEarned;
      totalIL += pnl.ilLoss;
      
      if (!protocolStats[position.protocol]) {
        protocolStats[position.protocol] = { positions: 0, value: 0, fees: 0 };
      }
      protocolStats[position.protocol].positions++;
      protocolStats[position.protocol].value += pnl.currentValue;
      protocolStats[position.protocol].fees += pnl.feesEarned;
    }
    
    return {
      totalPositions: allPositions.length,
      uniqueUsers: this.userPositions.size,
      totalValue,
      totalValueFormatted: '$' + totalValue.toLocaleString(),
      totalFees,
      totalFeesFormatted: '$' + totalFees.toLocaleString(),
      totalIL,
      totalILFormatted: '$' + totalIL.toLocaleString(),
      netPnL: totalFees - totalIL,
      netPnLFormatted: '$' + (totalFees - totalIL).toLocaleString(),
      protocolStats
    };
  }

  /**
   * Archive position data before removal
   */
  archivePosition(position) {
    // In production, this would save to database
    console.log(`[LiquidityPositionManager] Archiving position ${position.id}`);
  }

  /**
   * Trim history arrays to prevent memory bloat
   */
  trimHistory() {
    if (this.ilHistory.length > 1000) {
      this.ilHistory = this.ilHistory.slice(-500);
    }
    if (this.feeHistory.length > 1000) {
      this.feeHistory = this.feeHistory.slice(-500);
    }
    if (this.alertHistory.length > 500) {
      this.alertHistory = this.alertHistory.slice(-250);
    }
  }

  /**
   * Get token price (simplified - would be from price oracle in production)
   */
  getTokenPrice(token) {
    const prices = {
      'HBAR': 0.15,
      'USDC': 1.0,
      'USDT': 1.0,
      'SAUCE': 0.08,
      'DOVU': 0.05,
      'HBARX': 0.16,
      'KNC': 0.65,
      'ETH': 2500,
      'WBTC': 65000
    };
    return prices[token] || 1.0;
  }

  /**
   * Get comprehensive stats
   */
  getStats() {
    const summary = this.generatePortfolioSummary();
    
    return {
      ...super.getStats(),
      protocols: this.protocols,
      positions: summary.totalPositions,
      users: summary.uniqueUsers,
      totalValue: summary.totalValue,
      totalFees: summary.totalFees,
      totalIL: summary.totalIL,
      netPnL: summary.netPnL,
      ilAlerts24h: this.ilHistory.filter(h => Date.now() - h.timestamp < 86400000).length,
      autoExitEnabled: this.autoExitEnabled
    };
  }

  /**
   * Reset all data
   */
  reset() {
    super.reset();
    this.positions.clear();
    this.userPositions.clear();
    this.ilHistory = [];
    this.feeHistory = [];
    this.pendingAlerts = [];
    this.alertHistory = [];
    this.rebalancingQueue = [];
  }
}

export default LiquidityPositionManager;
