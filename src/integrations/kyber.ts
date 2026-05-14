/**
 * Kyber Network DEX Integration
 * Cross-chain liquidity aggregation and price discovery
 * Supports Kyber Elastic (concentrated liquidity) and Classic pools
 */

import { logger } from '../monitoring/logger.js';
import axios from 'axios';

const KYBER_CONFIG = {
  apiEndpoint: process.env.KYBER_API_URL || 'https://aggregator-api.kyberswap.com',
  ethereumRpc: process.env.ETHEREUM_RPC_URL || 'https://ethereum.publicnode.com',
  supportedTokens: {
    ethereum: ['ETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'KNC', 'LINK', 'UNI'],
    hedera: ['HBAR', 'USDC', 'SAUCE', 'DOVU', 'HBARX']
  },
  chainId: {
    ethereum: 1,
    hedera: 296 // Hedera mainnet equivalent
  }
};

interface KyberPool {
  id: string;
  token0: string;
  token1: string;
  token0Address: string;
  token1Address: string;
  reserve0: string;
  reserve1: string;
  tvl: number;
  volume24h: number;
  fee: number;
  apr: number;
  poolType: 'elastic' | 'classic';
  amp?: number; // For stable pools
}

interface KyberRoute {
  route: string[];
  outputAmount: string;
  gas: string;
  priceImpact: number;
  routerAddress: string;
}

interface TokenPrice {
  token: string;
  priceUSD: number;
  priceHBAR: number;
  timestamp: number;
  source: string;
}

export class KyberIntegration {
  private poolCache = new Map<string, KyberPool>();
  private priceCache = new Map<string, TokenPrice>();
  private lastUpdate = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor() {
    this.startPoolMonitor();
  }

  /**
   * Get pools from Kyber Elastic and Classic
   * Note: Returns Ethereum-side pools for cross-chain planning
   */
  async getPools(chain: 'ethereum' | 'hedera' = 'ethereum'): Promise<KyberPool[]> {
    try {
      // For Hedera, we rely on cached or bridged data
      // For Ethereum, we can fetch from Kyber API
      if (chain === 'ethereum') {
        return await this.fetchEthereumPools();
      }
      
      // Return cached Hedera pools (populated via bridge monitoring)
      return Array.from(this.poolCache.values()).filter(p => 
        KYBER_CONFIG.supportedTokens.hedera.includes(p.token0) ||
        KYBER_CONFIG.supportedTokens.hedera.includes(p.token1)
      );
    } catch (error) {
      logger.error('KyberIntegration', {
        message: 'Failed to fetch pools',
        chain,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Fetch pools from Kyber Ethereum API
   */
  private async fetchEthereumPools(): Promise<KyberPool[]> {
    try {
      const response = await axios.get(
        `${KYBER_CONFIG.apiEndpoint}/ethereum/api/v1/pools`,
        {
          params: {
            page: 1,
            limit: 100,
            isWhitelisted: true
          },
          timeout: 5000
        }
      );

      const pools = response.data?.data?.pools || [];
      
      return pools.map((pool: any) => ({
        id: pool.id,
        token0: pool.token0.symbol,
        token1: pool.token1.symbol,
        token0Address: pool.token0.id,
        token1Address: pool.token1.id,
        reserve0: pool.reserve0,
        reserve1: pool.reserve1,
        tvl: parseFloat(pool.tvlUSD) || 0,
        volume24h: parseFloat(pool.volumeUSD24h) || 0,
        fee: parseFloat(pool.fee) / 10000, // Convert from basis points
        apr: parseFloat(pool.apr) || 0,
        poolType: pool.type === 'elastic' ? 'elastic' : 'classic',
        amp: pool.amp
      }));
    } catch (error) {
      logger.warn('KyberIntegration', {
        message: 'Kyber API unavailable, using fallback',
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return fallback data for development
      return this.getFallbackPools();
    }
  }

  /**
   * Get best swap route via Kyber
   * Returns Ethereum-side route for cross-chain planning
   */
  async getSwapRoute(
    fromToken: string,
    toToken: string,
    amount: string,
    chain: 'ethereum' | 'hedera' = 'ethereum'
  ): Promise<KyberRoute | null> {
    try {
      if (chain === 'hedera') {
        // For Hedera, we can't use Kyber directly yet
        // Return a cross-chain route hint
        return {
          route: [fromToken, 'ETH_BRIDGE', toToken],
          outputAmount: '0',
          gas: '0',
          priceImpact: 0,
          routerAddress: 'cross-chain'
        };
      }

      const response = await axios.get(
        `${KYBER_CONFIG.apiEndpoint}/ethereum/api/v1/routes`,
        {
          params: {
            tokenIn: fromToken,
            tokenOut: toToken,
            amountIn: amount,
            source: 'kyber'
          },
          timeout: 5000
        }
      );

      const route = response.data?.data?.route;
      if (!route) return null;

      return {
        route: route.swaps?.map((s: any) => s.pool.tokenOut.symbol) || [],
        outputAmount: route.outputAmount,
        gas: route.gas,
        priceImpact: parseFloat(route.priceImpact) || 0,
        routerAddress: route.routerAddress
      };
    } catch (error) {
      logger.error('KyberIntegration', {
        message: 'Failed to get swap route',
        fromToken,
        toToken,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Get token price in USD via Kyber
   */
  async getPrice(token: string, chain: 'ethereum' | 'hedera' = 'ethereum'): Promise<number> {
    const cacheKey = `${chain}:${token}`;
    const cached = this.priceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.priceUSD;
    }

    try {
      let priceUSD = 0;

      if (chain === 'ethereum') {
        // Fetch from Kyber price API
        const response = await axios.get(
          `${KYBER_CONFIG.apiEndpoint}/ethereum/api/v1/tokens/price`,
          {
            params: { tokens: token },
            timeout: 3000
          }
        );
        
        priceUSD = parseFloat(response.data?.data?.[token]?.priceUSD) || 0;
      } else {
        // For Hedera tokens, use SaucerSwap price as reference
        // This would be populated by cross-chain monitoring
        priceUSD = this.getHederaPriceFallback(token);
      }

      const priceData: TokenPrice = {
        token,
        priceUSD,
        priceHBAR: priceUSD / (this.priceCache.get('ethereum:ETH')?.priceUSD || 2500),
        timestamp: Date.now(),
        source: 'kyber'
      };

      this.priceCache.set(cacheKey, priceData);
      return priceUSD;
    } catch (error) {
      logger.warn('KyberIntegration', {
        message: 'Price fetch failed, using fallback',
        token,
        error: error instanceof Error ? error.message : String(error)
      });
      return this.getHederaPriceFallback(token);
    }
  }

  /**
   * Calculate cross-chain arbitrage opportunity
   * Compares Kyber (Ethereum) price vs Hedera DEX prices
   */
  async calculateCrossChainArbitrage(
    token: string,
    hederaPrice: number
  ): Promise<{
    profitable: boolean;
    spread: number;
    kyberPrice: number;
    hederaPrice: number;
    direction: 'hedera_to_ethereum' | 'ethereum_to_hedera' | 'none';
    estimatedProfit: number;
  }> {
    const kyberPrice = await this.getPrice(token, 'ethereum');
    
    if (!kyberPrice || !hederaPrice) {
      return {
        profitable: false,
        spread: 0,
        kyberPrice: 0,
        hederaPrice: 0,
        direction: 'none',
        estimatedProfit: 0
      };
    }

    const spread = (kyberPrice - hederaPrice) / hederaPrice;
    const threshold = 0.005; // 0.5% minimum spread
    
    const profitable = Math.abs(spread) > threshold;
    const direction = spread > 0 ? 'hedera_to_ethereum' : 'ethereum_to_hedera';
    
    // Estimate profit after bridge fees (~0.1%) and swap fees (~0.3%)
    const estimatedProfit = Math.abs(spread) - 0.004; // 0.4% total fees

    return {
      profitable,
      spread: Math.abs(spread),
      kyberPrice,
      hederaPrice,
      direction,
      estimatedProfit
    };
  }

  /**
   * Get yield farming opportunities from Kyber Elastic
   */
  async getYieldFarms(chain: 'ethereum' | 'hedera' = 'ethereum'): Promise<Array<{
    pool: string;
    tokens: string[];
    tvl: number;
    apr: number;
    rewards: string[];
    poolType: string;
  }>> {
    const pools = await this.getPools(chain);
    
    return pools
      .filter(p => p.apr > 0)
      .map(p => ({
        pool: p.id,
        tokens: [p.token0, p.token1],
        tvl: p.tvl,
        apr: p.apr,
        rewards: ['KNC', p.token0, p.token1],
        poolType: p.poolType
      }));
  }

  /**
   * Health check for Kyber integration
   */
  async getHealth(): Promise<{ status: string; latency: number; pools: number }> {
    const start = Date.now();
    try {
      const pools = await this.getPools('ethereum');
      return {
        status: pools.length > 0 ? 'healthy' : 'degraded',
        latency: Date.now() - start,
        pools: pools.length
      };
    } catch (error) {
      return {
        status: 'error',
        latency: Date.now() - start,
        pools: 0
      };
    }
  }

  /**
   * Private: Fallback pool data for development
   */
  private getFallbackPools(): KyberPool[] {
    return [
      {
        id: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
        token0: 'USDC',
        token1: 'ETH',
        token0Address: '0xa0b86a33e6c209809c1476f29c897c8f4c6c6c6c',
        token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        reserve0: '5000000000000',
        reserve1: '2000000000000000000',
        tvl: 15000000,
        volume24h: 5000000,
        fee: 0.0005,
        apr: 0.12,
        poolType: 'elastic'
      },
      {
        id: '0xcbcdf9626bc03e24f779434178a73a0b4bad62ed',
        token0: 'WBTC',
        token1: 'ETH',
        token0Address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        reserve0: '100000000000',
        reserve1: '20000000000000000000',
        tvl: 25000000,
        volume24h: 8000000,
        fee: 0.0005,
        apr: 0.08,
        poolType: 'elastic'
      },
      {
        id: '0x1f8e0196b5ba0e7a62c8e1b7d4f2e7e2d0f5c8a',
        token0: 'KNC',
        token1: 'ETH',
        token0Address: '0xdeFA4e8e7d4c6e02c4b87c71aa9eC8e7c6e02c4',
        token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        reserve0: '50000000000000000000000',
        reserve1: '15000000000000000000',
        tvl: 5000000,
        volume24h: 1200000,
        fee: 0.003,
        apr: 0.25,
        poolType: 'classic'
      }
    ];
  }

  /**
   * Private: Hedera price fallback
   */
  private getHederaPriceFallback(token: string): number {
    const prices: Record<string, number> = {
      HBAR: 0.15,
      USDC: 1.0,
      USDT: 1.0,
      DAI: 1.0,
      SAUCE: 0.08,
      DOVU: 0.05,
      HBARX: 0.16,
      KNC: 0.65,
      ETH: 2500,
      WBTC: 65000,
      LINK: 15,
      UNI: 8
    };
    return prices[token] || 0;
  }

  /**
   * Private: Start pool monitoring
   */
  private startPoolMonitor(): void {
    setInterval(async () => {
      try {
        const pools = await this.getPools('ethereum');
        this.lastUpdate = Date.now();
        
        // Update cache
        pools.forEach(pool => {
          this.poolCache.set(pool.id, pool);
        });
        
        logger.debug('KyberIntegration', {
          message: 'Pool data updated',
          pools: pools.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('KyberIntegration', {
          message: 'Pool monitor error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, 30000); // Every 30 seconds
  }
}

// Singleton instance
export const kyberIntegration = new KyberIntegration();

// Export factory for custom config
export function createKyberIntegration(): KyberIntegration {
  return new KyberIntegration();
}

export default KyberIntegration;
