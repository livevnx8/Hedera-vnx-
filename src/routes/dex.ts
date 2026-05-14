/**
 * DEX API Routes
 * REST endpoints for Kyber integration and cross-DEX operations
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { kyberIntegration } from '../integrations/kyber.js';
import { priceAggregator } from '../price-aggregator/index.js';
import { logger } from '../monitoring/logger.js';

// Extend FastifyInstance to include our properties
declare module 'fastify' {
  interface FastifyInstance {
    kyber: typeof kyberIntegration;
    priceAggregator: typeof priceAggregator;
  }
}

interface PriceRequest {
  Params: {
    token: string;
  };
  Querystring: {
    chain?: 'ethereum' | 'hedera';
  };
}

interface SwapRouteRequest {
  Querystring: {
    from: string;
    to: string;
    amount: string;
    chain?: 'ethereum' | 'hedera';
  };
}

interface ArbitrageRequest {
  Querystring: {
    token: string;
    hedera_price: string;
  };
}

interface PoolsRequest {
  Querystring: {
    token0: string;
    token1: string;
    chain?: 'ethereum' | 'hedera';
  };
}

export default async function dexRoutes(fastify: FastifyInstance, options: any) {
  // Attach integrations to fastify instance
  fastify.decorate('kyber', kyberIntegration);
  fastify.decorate('priceAggregator', priceAggregator);

  /**
   * GET /api/v1/dex/kyber/pools
   * List all Kyber pools or filter by chain
   */
  fastify.get('/api/v1/dex/kyber/pools', async (request: FastifyRequest<{ Querystring: { chain?: 'ethereum' | 'hedera' } }>, reply: FastifyReply) => {
    try {
      const chain = request.query.chain || 'ethereum';
      const pools = await kyberIntegration.getPools(chain);
      
      return {
        success: true,
        chain,
        pools: pools.map(p => ({
          id: p.id,
          tokens: [p.token0, p.token1],
          tvl: p.tvl,
          volume24h: p.volume24h,
          fee: p.fee,
          apr: p.apr,
          poolType: p.poolType
        })),
        count: pools.length
      };
    } catch (error) {
      logger.error('DEXRoutes', { message: 'Failed to get Kyber pools', error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to fetch pools'
      };
    }
  });

  /**
   * GET /api/v1/dex/kyber/pools/:token0/:token1
   * Get specific pool pair
   */
  fastify.get('/api/v1/dex/kyber/pools/:token0/:token1', async (request: FastifyRequest<{ Params: { token0: string; token1: string }; Querystring: { chain?: 'ethereum' | 'hedera' } }>, reply: FastifyReply) => {
    try {
      const { token0, token1 } = request.params;
      const chain = request.query.chain || 'ethereum';
      const allPools = await kyberIntegration.getPools(chain);
      
      const pools = allPools.filter(p => 
        (p.token0 === token0 && p.token1 === token1) ||
        (p.token0 === token1 && p.token1 === token0)
      );
      
      return {
        success: true,
        chain,
        tokenPair: `${token0}/${token1}`,
        pools,
        count: pools.length
      };
    } catch (error) {
      logger.error('DEXRoutes', { message: 'Failed to get pool pair', error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to fetch pool pair'
      };
    }
  });

  /**
   * GET /api/v1/dex/kyber/price/:token
   * Get token price from Kyber
   */
  fastify.get('/api/v1/dex/kyber/price/:token', async (request: FastifyRequest<PriceRequest>, reply: FastifyReply) => {
    try {
      const { token } = request.params;
      const chain = request.query.chain || 'ethereum';
      
      const priceUSD = await kyberIntegration.getPrice(token, chain);
      const hbarPrice = await kyberIntegration.getPrice('HBAR', 'hedera');
      
      return {
        success: true,
        token,
        chain,
        priceUSD,
        priceHBAR: priceUSD / hbarPrice,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('DEXRoutes', { message: 'Failed to get Kyber price', token: request.params.token, error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to fetch price'
      };
    }
  });

  /**
   * GET /api/v1/dex/kyber/route
   * Get swap route via Kyber
   */
  fastify.get('/api/v1/dex/kyber/route', async (request: FastifyRequest<SwapRouteRequest>, reply: FastifyReply) => {
    try {
      const { from, to, amount, chain = 'ethereum' } = request.query;
      
      if (!from || !to || !amount) {
        reply.status(400);
        return {
          success: false,
          error: 'Missing required parameters: from, to, amount'
        };
      }
      
      const route = await kyberIntegration.getSwapRoute(from, to, amount, chain);
      
      if (!route) {
        reply.status(404);
        return {
          success: false,
          error: 'No route found'
        };
      }
      
      return {
        success: true,
        route: {
          from,
          to,
          amount,
          path: route.route,
          expectedOutput: route.outputAmount,
          gasEstimate: route.gas,
          priceImpact: route.priceImpact,
          routerAddress: route.routerAddress
        }
      };
    } catch (error) {
      logger.error('DEXRoutes', { message: 'Failed to get swap route', error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to calculate route'
      };
    }
  });

  /**
   * GET /api/v1/dex/kyber/arbitrage
   * Check arbitrage opportunity between Kyber and Hedera
   */
  fastify.get('/api/v1/dex/kyber/arbitrage', async (request: FastifyRequest<ArbitrageRequest>, reply: FastifyReply) => {
    try {
      const { token, hedera_price } = request.query;
      
      if (!token || !hedera_price) {
        reply.status(400);
        return {
          success: false,
          error: 'Missing required parameters: token, hedera_price'
        };
      }
      
      const hederaPrice = parseFloat(hedera_price);
      if (isNaN(hederaPrice)) {
        reply.status(400);
        return {
          success: false,
          error: 'Invalid hedera_price'
        };
      }
      
      const arb = await kyberIntegration.calculateCrossChainArbitrage(token, hederaPrice);
      
      return {
        success: true,
        token,
        kyberPrice: arb.kyberPrice,
        hederaPrice: arb.hederaPrice,
        spread: arb.spread,
        profitable: arb.profitable,
        direction: arb.direction,
        estimatedProfit: arb.estimatedProfit,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('DEXRoutes', { message: 'Arbitrage check failed', error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to check arbitrage'
      };
    }
  });

  /**
   * GET /api/v1/dex/kyber/yield
   * Get Kyber yield farming opportunities
   */
  fastify.get('/api/v1/dex/kyber/yield', async (request: FastifyRequest<{ Querystring: { chain?: 'ethereum' | 'hedera' } }>, reply: FastifyReply) => {
    try {
      const chain = request.query.chain || 'ethereum';
      const farms = await kyberIntegration.getYieldFarms(chain);
      
      return {
        success: true,
        chain,
        farms,
        count: farms.length
      };
    } catch (error) {
      logger.error('DEXRoutes', { message: 'Failed to get yield farms', error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to fetch yield farms'
      };
    }
  });

  /**
   * GET /api/v1/dex/prices
   * Get aggregated prices from all DEXes
   */
  fastify.get('/api/v1/dex/prices', async (request: FastifyRequest<{ Querystring: { token?: string } }>, reply: FastifyReply) => {
    try {
      const { token } = request.query;
      
      if (token) {
        // Get specific token price
        const aggregated = await priceAggregator.getAggregatedPrice(token);
        if (!aggregated) {
          reply.status(404);
          return {
            success: false,
            error: `No price data available for ${token}`
          };
        }
        
        return {
          success: true,
          token,
          medianPrice: aggregated.medianPrice,
          bestBuy: aggregated.bestBuy,
          bestSell: aggregated.bestSell,
          spread: aggregated.spread,
          sources: aggregated.sources,
          prices: aggregated.prices
        };
      } else {
        // Get all token prices
        const tokens = ['HBAR', 'USDC', 'SAUCE', 'DOVU', 'HBARX', 'KNC'];
        const prices: Record<string, any> = {};
        
        for (const t of tokens) {
          const aggregated = await priceAggregator.getAggregatedPrice(t);
          if (aggregated) {
            prices[t] = {
              medianPrice: aggregated.medianPrice,
              spread: aggregated.spread,
              sources: aggregated.sources
            };
          }
        }
        
        return {
          success: true,
          prices,
          count: Object.keys(prices).length
        };
      }
    } catch (error) {
      logger.error('DEXRoutes', { message: 'Failed to get prices', error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to fetch prices'
      };
    }
  });

  /**
   * GET /api/v1/dex/arbitrage/opportunities
   * Get current arbitrage opportunities across all DEXes
   */
  fastify.get('/api/v1/dex/arbitrage/opportunities', async (request: FastifyRequest<{ Querystring: { minSpread?: string } }>, reply: FastifyReply) => {
    try {
      const minSpread = parseFloat(request.query.minSpread || '0.005');
      const opportunities = await priceAggregator.getArbitrageOpportunities(minSpread);
      
      return {
        success: true,
        minSpread,
        opportunities,
        count: opportunities.length,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('DEXRoutes', { message: 'Failed to get arbitrage opportunities', error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to fetch opportunities'
      };
    }
  });

  /**
   * GET /api/v1/dex/arbitrage/history
   * Get historical arbitrage signals
   */
  fastify.get('/api/v1/dex/arbitrage/history', async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
    try {
      const limit = parseInt(request.query.limit || '100');
      const history = priceAggregator.getArbitrageHistory(limit);
      
      return {
        success: true,
        history,
        count: history.length
      };
    } catch (error) {
      logger.error('DEXRoutes', { message: 'Failed to get arbitrage history', error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to fetch history'
      };
    }
  });

  /**
   * GET /api/v1/dex/health
   * Health check for all DEX integrations
   */
  fastify.get('/api/v1/dex/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [kyberHealth, aggregatorHealth] = await Promise.all([
        kyberIntegration.getHealth(),
        priceAggregator.getHealth()
      ]);
      
      return {
        success: true,
        status: kyberHealth.status === 'healthy' && aggregatorHealth.status === 'healthy' ? 'healthy' : 'degraded',
        kyber: kyberHealth,
        aggregator: aggregatorHealth,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('DEXRoutes', { message: 'Health check failed', error });
      reply.status(500);
      return {
        success: false,
        error: 'Health check failed'
      };
    }
  });

  logger.info('DEXRoutes', { message: 'DEX API routes registered' });
}
