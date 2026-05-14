/**
 * Liquidity Aggregator (Phase 13)
 * 
 * Aggregates liquidity across chains and finds optimal swap routes.
 * Enables unified liquidity pools with cross-chain rebalancing.
 */

import { logger } from '../monitoring/logger.js';
import type { 
  SupportedChain, 
  ChainAsset, 
  SwapRoute, 
  SwapReceipt, 
  LiquidityPool 
} from './types.js';

interface AggregatorConfig {
  maxHops: number;
  maxSlippage: number; // basis points
  minLiquidity: bigint;
  rebalanceThreshold: number; // percentage
}

export class LiquidityAggregator {
  private config: AggregatorConfig;
  private pools: Map<string, LiquidityPool> = new Map();
  private swapHistory: SwapReceipt[] = [];
  private chainBalances: Map<SupportedChain, Map<string, bigint>> = new Map(); // chain -> asset -> balance

  constructor(config: Partial<AggregatorConfig> = {}) {
    this.config = {
      maxHops: 4,
      maxSlippage: 100, // 1%
      minLiquidity: BigInt(10000),
      rebalanceThreshold: 20, // 20%
      ...config
    };
  }

  /**
   * Register a liquidity pool
   */
  registerPool(pool: LiquidityPool): void {
    this.pools.set(pool.poolId, pool);
    
    // Initialize chain balance tracking
    if (!this.chainBalances.has(pool.chain)) {
      this.chainBalances.set(pool.chain, new Map());
    }
    
    logger.info('LiquidityAggregator', {
      message: 'Pool registered',
      poolId: pool.poolId,
      chain: pool.chain,
      assets: pool.assets,
      totalLiquidity: pool.totalLiquidity.toString()
    });
  }

  /**
   * Find best swap route between any two assets across any chains
   */
  async findBestRoute(
    from: ChainAsset,
    to: ChainAsset,
    maxHops: number = this.config.maxHops
  ): Promise<SwapRoute | null> {
    try {
      // Simple pathfinding (Dijkstra-like)
      const routes = this.findAllRoutes(from, to, maxHops);
      
      if (routes.length === 0) {
        logger.warn('LiquidityAggregator', {
          message: 'No route found',
          from: `${from.chain}:${from.asset}`,
          to: `${to.chain}:${to.asset}`
        });
        return null;
      }

      // Score routes by output amount, fees, and time
      const scoredRoutes = routes.map(route => ({
        route,
        score: this.scoreRoute(route)
      })).sort((a, b) => b.score - a.score);

      const bestRoute = scoredRoutes[0].route;
      
      logger.info('LiquidityAggregator', {
        message: 'Best route found',
        routeId: bestRoute.routeId,
        path: bestRoute.path,
        expectedOutput: bestRoute.totalExpectedOutput.toString(),
        totalFee: bestRoute.totalFee.toString()
      });

      return bestRoute;

    } catch (error) {
      logger.error('LiquidityAggregator', {
        message: 'Route finding failed',
        from,
        to,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Execute cross-chain swap along a route
   */
  async executeCrossChainSwap(route: SwapRoute): Promise<SwapReceipt> {
    try {
      const receiptId = `swap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let executedSteps = 0;
      const txHashes: Record<SupportedChain, string> = {} as any;

      // Execute each step
      for (const step of route.steps) {
        const txHash = await this.executeSwapStep(step);
        txHashes[step.chain] = txHash;
        executedSteps++;

        logger.debug('LiquidityAggregator', {
          message: 'Swap step executed',
          step: executedSteps,
          chain: step.chain,
          txHash
        });
      }

      // Calculate actual slippage (mock)
      const actualSlippage = Math.random() * 0.5; // 0-0.5%

      const receipt: SwapReceipt = {
        receiptId,
        route,
        executedSteps,
        finalOutput: route.totalExpectedOutput, // Mock: no slippage
        actualSlippage,
        txHashes,
        status: executedSteps === route.steps.length ? 'completed' : 'partial',
        completedAt: Date.now()
      };

      this.swapHistory.push(receipt);

      logger.info('LiquidityAggregator', {
        message: 'Cross-chain swap executed',
        receiptId,
        status: receipt.status,
        steps: executedSteps,
        finalOutput: receipt.finalOutput.toString()
      });

      return receipt;

    } catch (error) {
      logger.error('LiquidityAggregator', {
        message: 'Swap execution failed',
        routeId: route.routeId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Rebalance liquidity across chains
   */
  async rebalancePools(): Promise<{
    rebalanced: number;
    movements: Array<{ from: string; to: string; amount: bigint }>;
  }> {
    const movements: Array<{ from: string; to: string; amount: bigint }> = [];
    let rebalanced = 0;

    // Find imbalances
    const imbalances = this.detectImbalances();
    
    for (const imbalance of imbalances) {
      if (imbalance.deviation > this.config.rebalanceThreshold) {
        // Calculate rebalance amount
        const rebalanceAmount = imbalance.excess / BigInt(2);
        
        movements.push({
          from: imbalance.poolId,
          to: imbalance.targetPoolId,
          amount: rebalanceAmount
        });
        
        rebalanced++;

        logger.info('LiquidityAggregator', {
          message: 'Pool rebalanced',
          from: imbalance.poolId,
          to: imbalance.targetPoolId,
          amount: rebalanceAmount.toString()
        });
      }
    }

    return { rebalanced, movements };
  }

  /**
   * Get liquidity depth for an asset on a chain
   */
  getLiquidityDepth(chain: SupportedChain, asset: string): bigint {
    let total = BigInt(0);
    
    for (const pool of this.pools.values()) {
      if (pool.chain === chain) {
        const assetIndex = pool.assets.indexOf(asset);
        if (assetIndex !== -1) {
          total += pool.reserves[assetIndex];
        }
      }
    }
    
    return total;
  }

  /**
   * Get all registered pools
   */
  getPools(): LiquidityPool[] {
    return Array.from(this.pools.values());
  }

  /**
   * Get pools by chain
   */
  getPoolsByChain(chain: SupportedChain): LiquidityPool[] {
    return Array.from(this.pools.values()).filter(p => p.chain === chain);
  }

  /**
   * Get swap history
   */
  getSwapHistory(limit: number = 100): SwapReceipt[] {
    return this.swapHistory.slice(-limit);
  }

  /**
   * Get aggregator statistics
   */
  getStats() {
    const pools = Array.from(this.pools.values());
    const swaps = this.swapHistory;
    
    return {
      timestamp: Date.now(),
      totalPools: pools.length,
      totalLiquidity: pools.reduce((sum, p) => sum + p.totalLiquidity, BigInt(0)),
      totalSwaps: swaps.length,
      successfulSwaps: swaps.filter(s => s.status === 'completed').length,
      avgSlippage: swaps.length > 0 
        ? swaps.reduce((sum, s) => sum + s.actualSlippage, 0) / swaps.length 
        : 0,
      totalVolume: swaps.reduce((sum, s) => sum + s.finalOutput, BigInt(0)),
      byChain: this.getStatsByChain()
    };
  }

  // Private methods
  private findAllRoutes(from: ChainAsset, to: ChainAsset, maxHops: number): SwapRoute[] {
    const routes: SwapRoute[] = [];
    
    // Direct route (same chain)
    if (from.chain === to.chain) {
      const directRoute = this.buildDirectRoute(from, to);
      if (directRoute) routes.push(directRoute);
    }
    
    // Cross-chain routes via Hedera (hub)
    if (from.chain !== to.chain) {
      const crossChainRoute = this.buildHubRoute(from, to);
      if (crossChainRoute) routes.push(crossChainRoute);
    }
    
    return routes;
  }

  private buildDirectRoute(from: ChainAsset, to: ChainAsset): SwapRoute | null {
    // Find pool with both assets
    for (const pool of this.pools.values()) {
      if (pool.chain === from.chain) {
        const fromIndex = pool.assets.indexOf(from.asset);
        const toIndex = pool.assets.indexOf(to.asset);
        
        if (fromIndex !== -1 && toIndex !== -1) {
          const expectedOutput = this.calculateSwapOutput(
            pool.reserves[fromIndex],
            pool.reserves[toIndex],
            from.amount,
            pool.feeTier
          );
          
          const fee = (from.amount * BigInt(pool.feeTier)) / BigInt(10000);
          
          return {
            routeId: `direct-${Date.now()}`,
            from,
            to,
            steps: [{
              chain: from.chain,
              protocol: 'native-pool',
              fromAsset: from.asset,
              toAsset: to.asset,
              expectedOutput,
              fee,
              slippage: 0.001,
            }],
            totalExpectedOutput: expectedOutput,
            totalFee: fee,
            totalSlippage: 0.001,
            estimatedTime: 3,
            path: [from.chain]
          };
        }
      }
    }
    
    return null;
  }

  private buildHubRoute(from: ChainAsset, to: ChainAsset): SwapRoute | null {
    // Route via Hedera as hub
    // Step 1: from.chain -> hedera
    // Step 2: hedera -> to.chain
    
    const step1Output = from.amount; // Assume 1:1 for wrapped tokens
    const bridgeFee1 = (from.amount * BigInt(10)) / BigInt(10000); // 0.1%
    
    const step2Input = step1Output - bridgeFee1;
    const bridgeFee2 = (step2Input * BigInt(10)) / BigInt(10000);
    const finalOutput = step2Input - bridgeFee2;
    
    return {
      routeId: `hub-${Date.now()}`,
      from,
      to,
      steps: [
        {
          chain: from.chain,
          protocol: 'bridge-lock',
          fromAsset: from.asset,
          toAsset: `w${from.asset}`,
          expectedOutput: step1Output,
          fee: bridgeFee1,
          slippage: 0,
        },
        {
          chain: 'hedera',
          protocol: 'bridge-mint',
          fromAsset: `w${from.asset}`,
          toAsset: `w${to.asset}`,
          expectedOutput: step2Input,
          fee: BigInt(0),
          slippage: 0.001,
        },
        {
          chain: to.chain,
          protocol: 'bridge-unlock',
          fromAsset: `w${to.asset}`,
          toAsset: to.asset,
          expectedOutput: finalOutput,
          fee: bridgeFee2,
          slippage: 0,
        }
      ],
      totalExpectedOutput: finalOutput,
      totalFee: bridgeFee1 + bridgeFee2,
      totalSlippage: 0.001,
      estimatedTime: 45,
      path: [from.chain, 'hedera', to.chain]
    };
  }

  private calculateSwapOutput(
    reserveIn: bigint,
    reserveOut: bigint,
    amountIn: bigint,
    feeTier: number
  ): bigint {
    // Constant product formula: x * y = k
    const amountInWithFee = amountIn * BigInt(10000 - feeTier);
    const numerator = amountInWithFee * reserveOut;
    const denominator = (reserveIn * BigInt(10000)) + amountInWithFee;
    return numerator / denominator;
  }

  private scoreRoute(route: SwapRoute): number {
    // Higher score = better route
    // Factors: output amount (40%), low fees (30%), speed (20%), reliability (10%)
    
    const outputScore = Number(route.totalExpectedOutput) / 1e18 * 40;
    const feeScore = (1 - Number(route.totalFee) / Number(route.totalExpectedOutput)) * 30;
    const speedScore = (60 - Math.min(route.estimatedTime, 60)) / 60 * 20;
    const reliabilityScore = route.path.length <= 2 ? 10 : 5;
    
    return outputScore + feeScore + speedScore + reliabilityScore;
  }

  private async executeSwapStep(step: SwapRoute['steps'][0]): Promise<string> {
    // Mock execution
    await new Promise(resolve => setTimeout(resolve, 100));
    return `tx-${step.chain}-${Date.now()}`;
  }

  private detectImbalances(): Array<{
    poolId: string;
    targetPoolId: string;
    deviation: number;
    excess: bigint;
  }> {
    // Mock imbalance detection
    return [];
  }

  private getStatsByChain(): Record<SupportedChain, { pools: number; volume: bigint }> {
    const stats: Partial<Record<SupportedChain, { pools: number; volume: bigint }>> = {};
    
    for (const chain of this.chainBalances.keys()) {
      const chainPools = this.getPoolsByChain(chain);
      stats[chain] = {
        pools: chainPools.length,
        volume: chainPools.reduce((sum, p) => sum + p.volume24h, BigInt(0))
      };
    }
    
    return stats as Record<SupportedChain, { pools: number; volume: bigint }>;
  }
}

// Singleton
let aggregatorInstance: LiquidityAggregator | null = null;

export function getLiquidityAggregator(config?: Partial<AggregatorConfig>): LiquidityAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new LiquidityAggregator(config);
  }
  return aggregatorInstance;
}
