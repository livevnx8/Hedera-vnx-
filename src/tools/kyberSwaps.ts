/**
 * Kyber DEX Swap Tools
 * Agent-accessible tools for Kyber liquidity operations
 */

import { Client } from '@hashgraph/sdk';
import { logger } from '../monitoring/logger.js';
import { kyberIntegration } from '../integrations/kyber.js';

export interface KyberSwapResult {
  success: boolean;
  route?: string[];
  expectedOutput?: string;
  priceImpact?: number;
  gasEstimate?: string;
  error?: string;
}

export interface KyberPriceResult {
  success: boolean;
  token: string;
  priceUSD: number;
  priceHBAR: number;
  source: string;
  timestamp: number;
  error?: string;
}

export interface ArbitrageCheckResult {
  success: boolean;
  token: string;
  kyberPrice: number;
  hederaPrice: number;
  spread: number;
  profitable: boolean;
  direction?: 'hedera_to_ethereum' | 'ethereum_to_hedera' | 'none';
  estimatedProfit?: number;
  error?: string;
}

/**
 * Get token price from Kyber
 * Cross-chain price discovery for arbitrage detection
 */
export async function getKyberPrice(
  client: Client,
  token: string,
  chain: 'ethereum' | 'hedera' = 'ethereum'
): Promise<KyberPriceResult> {
  try {
    const start = Date.now();
    const priceUSD = await kyberIntegration.getPrice(token, chain);
    
    // Get HBAR price for conversion
    const hbarPrice = await kyberIntegration.getPrice('HBAR', 'hedera');
    const priceHBAR = priceUSD / hbarPrice;

    logger.info('KyberTools', {
      message: 'Price fetched',
      token,
      chain,
      priceUSD,
      latency: Date.now() - start
    });

    return {
      success: true,
      token,
      priceUSD,
      priceHBAR,
      source: 'kyber',
      timestamp: Date.now()
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('KyberTools', {
      message: 'Price fetch failed',
      token,
      error: errorMsg
    });

    return {
      success: false,
      token,
      priceUSD: 0,
      priceHBAR: 0,
      source: 'kyber',
      timestamp: Date.now(),
      error: errorMsg
    };
  }
}

/**
 * Get best swap route via Kyber
 * For cross-chain planning - returns Ethereum-side routing
 */
export async function getKyberSwapRoute(
  client: Client,
  fromToken: string,
  toToken: string,
  amount: string,
  chain: 'ethereum' | 'hedera' = 'ethereum'
): Promise<KyberSwapResult> {
  try {
    const start = Date.now();
    const route = await kyberIntegration.getSwapRoute(fromToken, toToken, amount, chain);

    if (!route) {
      return {
        success: false,
        error: 'No route found'
      };
    }

    logger.info('KyberTools', {
      message: 'Swap route found',
      fromToken,
      toToken,
      amount,
      route: route.route,
      latency: Date.now() - start
    });

    return {
      success: true,
      route: route.route,
      expectedOutput: route.outputAmount,
      priceImpact: route.priceImpact,
      gasEstimate: route.gas
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('KyberTools', {
      message: 'Route fetch failed',
      fromToken,
      toToken,
      error: errorMsg
    });

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Check cross-chain arbitrage opportunity
 * Compares Kyber (Ethereum) vs Hedera DEX prices
 */
export async function checkKyberArbitrage(
  client: Client,
  token: string,
  hederaPrice: number
): Promise<ArbitrageCheckResult> {
  try {
    const start = Date.now();
    const arb = await kyberIntegration.calculateCrossChainArbitrage(token, hederaPrice);

    logger.info('KyberTools', {
      message: 'Arbitrage check complete',
      token,
      spread: arb.spread,
      profitable: arb.profitable,
      latency: Date.now() - start
    });

    return {
      success: true,
      token,
      kyberPrice: arb.kyberPrice,
      hederaPrice: arb.hederaPrice,
      spread: arb.spread,
      profitable: arb.profitable,
      direction: arb.direction,
      estimatedProfit: arb.estimatedProfit
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('KyberTools', {
      message: 'Arbitrage check failed',
      token,
      error: errorMsg
    });

    return {
      success: false,
      token,
      kyberPrice: 0,
      hederaPrice: 0,
      spread: 0,
      profitable: false,
      error: errorMsg
    };
  }
}

/**
 * Get yield farming opportunities from Kyber
 */
export async function getKyberYieldFarms(
  client: Client,
  chain: 'ethereum' | 'hedera' = 'ethereum'
): Promise<{
  success: boolean;
  farms: Array<{
    pool: string;
    tokens: string[];
    tvl: number;
    apr: number;
    rewards: string[];
    poolType: string;
  }>;
  error?: string;
}> {
  try {
    const farms = await kyberIntegration.getYieldFarms(chain);

    logger.info('KyberTools', {
      message: 'Yield farms fetched',
      chain,
      farms: farms.length
    });

    return {
      success: true,
      farms
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('KyberTools', {
      message: 'Yield farms fetch failed',
      error: errorMsg
    });

    return {
      success: false,
      farms: [],
      error: errorMsg
    };
  }
}

/**
 * Get Kyber pools for a specific token pair
 */
export async function getKyberPools(
  client: Client,
  token0: string,
  token1: string,
  chain: 'ethereum' | 'hedera' = 'ethereum'
): Promise<{
  success: boolean;
  pools: Array<{
    id: string;
    token0: string;
    token1: string;
    tvl: number;
    fee: number;
    apr: number;
    poolType: string;
  }>;
  error?: string;
}> {
  try {
    const allPools = await kyberIntegration.getPools(chain);
    const pools = allPools.filter(p => 
      (p.token0 === token0 && p.token1 === token1) ||
      (p.token0 === token1 && p.token1 === token0)
    );

    return {
      success: true,
      pools: pools.map(p => ({
        id: p.id,
        token0: p.token0,
        token1: p.token1,
        tvl: p.tvl,
        fee: p.fee,
        apr: p.apr,
        poolType: p.poolType
      }))
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      pools: [],
      error: errorMsg
    };
  }
}

/**
 * Tool definitions for agent system
 */
export const kyberToolDefinitions = [
  {
    name: 'kyber_get_price',
    description: 'Get token price from Kyber Network DEX (Ethereum-side prices for cross-chain comparison)',
    parameters: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token symbol (e.g., ETH, USDC, KNC)' },
        chain: { type: 'string', enum: ['ethereum', 'hedera'], description: 'Chain to query' }
      },
      required: ['token']
    }
  },
  {
    name: 'kyber_get_swap_route',
    description: 'Get optimal swap route via Kyber DEX for cross-chain planning',
    parameters: {
      type: 'object',
      properties: {
        from_token: { type: 'string', description: 'Source token symbol' },
        to_token: { type: 'string', description: 'Destination token symbol' },
        amount: { type: 'string', description: 'Amount to swap (in wei for ETH, tinybars for HBAR)' },
        chain: { type: 'string', enum: ['ethereum', 'hedera'], description: 'Target chain' }
      },
      required: ['from_token', 'to_token', 'amount']
    }
  },
  {
    name: 'kyber_check_arbitrage',
    description: 'Check for profitable arbitrage between Kyber (Ethereum) and Hedera DEXes',
    parameters: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token to check (e.g., USDC, ETH)' },
        hedera_price: { type: 'number', description: 'Current price on Hedera DEX (USD)' }
      },
      required: ['token', 'hedera_price']
    }
  },
  {
    name: 'kyber_get_yield_farms',
    description: 'Get yield farming opportunities from Kyber Elastic pools',
    parameters: {
      type: 'object',
      properties: {
        chain: { type: 'string', enum: ['ethereum', 'hedera'], description: 'Chain to query' }
      }
    }
  },
  {
    name: 'kyber_get_pools',
    description: 'Get liquidity pools for a token pair on Kyber',
    parameters: {
      type: 'object',
      properties: {
        token0: { type: 'string', description: 'First token symbol' },
        token1: { type: 'string', description: 'Second token symbol' },
        chain: { type: 'string', enum: ['ethereum', 'hedera'], description: 'Target chain' }
      },
      required: ['token0', 'token1']
    }
  }
];
