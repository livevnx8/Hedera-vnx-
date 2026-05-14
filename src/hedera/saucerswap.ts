/**
 * saucerswap.ts
 * SaucerSwap DEX integration — pool queries + liquidity management on Hedera mainnet.
 *
 * SaucerSwap V1 (Uniswap V2-style) router: 0.0.3055450
 * SaucerSwap V2 (Uniswap V3-style) router: 0.0.4002341
 */

import axios from 'axios';
import {
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  Hbar,
} from '@hashgraph/sdk';
import { config } from '../config.js';
import { getHederaClient } from './hcs.js';

// ── Constants ────────────────────────────────────────────────────────────────

const SAUCERSWAP_API   = 'https://api.saucerswap.finance';
const V1_ROUTER_ID     = '0.0.3055450';   // mainnet SaucerSwap V1 router
const DEFAULT_SLIPPAGE = 0.005;           // 0.5%
const DEFAULT_DEADLINE = () => Math.floor(Date.now() / 1000) + 60 * 20; // 20 min

// ── Utilities ────────────────────────────────────────────────────────────────

/**
 * Convert a Hedera entity ID (0.0.XXXXX) to a 20-byte EVM address string.
 * Used when calling HTS-token-aware smart contracts.
 */
export function hederaIdToEvmAddress(id: string): string {
  const parts = id.split('.');
  const num = BigInt(parts[2] ?? parts[0]);
  return '0x' + num.toString(16).padStart(40, '0');
}

function explorerTxUrl(txId: string): string {
  const net = config.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  return `https://hashscan.io/${net}/transaction/${txId}`;
}

// ── Read-only pool queries (SaucerSwap REST API) ─────────────────────────────

export interface PoolInfo {
  id: string;
  tokenA: { id: string; symbol: string; name: string };
  tokenB: { id: string; symbol: string; name: string };
  tvlUsd: number;
  volume24hUsd: number;
  fee: number;
  priceTokenAInB: number;
  priceTokenBInA: number;
}

export async function getPools(limit = 20): Promise<PoolInfo[]> {
  const res = await axios.get<any[]>(`${SAUCERSWAP_API}/pools/`, { timeout: 10_000 });
  return res.data.slice(0, limit).map((p: any) => ({
    id:               p.id ?? p.contractId ?? '',
    tokenA:           { id: p.tokenA?.id ?? '', symbol: p.tokenA?.symbol ?? '', name: p.tokenA?.name ?? '' },
    tokenB:           { id: p.tokenB?.id ?? '', symbol: p.tokenB?.symbol ?? '', name: p.tokenB?.name ?? '' },
    tvlUsd:           p.tvlUsd ?? 0,
    volume24hUsd:     p.volume24h ?? p.volumeUsd24h ?? 0,
    fee:              p.fee ?? 0,
    priceTokenAInB:   p.token0Price ?? p.price ?? 0,
    priceTokenBInA:   p.token1Price ?? 0,
  }));
}

export async function getTokenPrice(tokenId: string): Promise<{
  tokenId: string; symbol: string; priceUsd: number; priceHbar: number;
}> {
  const { KNOWN_TOKENS } = await import('./tokenRegistry.js');
  const isHbar = tokenId === 'hbar' || tokenId === 'HBAR' || tokenId === '0.0.0';
  const entry  = KNOWN_TOKENS.find(
    (t) => t.token_id === tokenId || t.symbol.toLowerCase() === tokenId.toLowerCase(),
  );
  const cgId = isHbar ? 'hedera-hashgraph' : entry?.coingecko_id;
  if (!cgId) throw new Error(`Token ${tokenId} not found in registry (no CoinGecko ID). Try searching by symbol first.`);

  const { data } = await axios.get<Record<string, Record<string, number>>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${cgId},hedera-hashgraph&vs_currencies=usd`,
    { timeout: 8_000 },
  );
  const priceUsd  = data[cgId]?.usd  ?? 0;
  const hbarUsd   = data['hedera-hashgraph']?.usd ?? 0;
  const priceHbar = hbarUsd > 0 ? priceUsd / hbarUsd : 0;
  return {
    tokenId:   entry?.token_id ?? tokenId,
    symbol:    entry?.symbol   ?? tokenId.toUpperCase(),
    priceUsd,
    priceHbar,
  };
}

export interface ChartResult {
  symbol: string;
  tokenId: string;
  coingeckoId?: string;
  period: string;
  candles: { time: number; open: number; high: number; low: number; close: number }[];
  currentPrice: number;
  priceChange24h: number;
  priceChangePercent: number;
  high24h: number;
  low24h: number;
  summary: string;
}

export async function getPriceChart(params: {
  token: string;   // symbol, token_id, or "HBAR"
  period?: string; // '1d' | '7d' | '30d' | '90d' | '1y'  default '7d'
}): Promise<ChartResult> {
  const { KNOWN_TOKENS } = await import('./tokenRegistry.js');
  const period = params.period ?? '7d';
  const token  = params.token.trim();

  const daysMap: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  const days = daysMap[period] ?? 7;

  // Resolve to coingecko ID
  const isHbar = /^(hbar|HBAR|0\.0\.0)$/i.test(token);
  const entry  = isHbar ? null : KNOWN_TOKENS.find(
    (t) => t.token_id === token || t.symbol.toLowerCase() === token.toLowerCase(),
  );
  const cgId = isHbar ? 'hedera-hashgraph' : entry?.coingecko_id;

  if (!cgId) {
    throw new Error(
      `No price history available for "${token}" — it has no CoinGecko mapping. Use hedera_search_tokens to find its token_id first.`,
    );
  }

  const symbol   = isHbar ? 'HBAR' : (entry?.symbol ?? token.toUpperCase());
  const tokenId  = isHbar ? '0.0.0' : (entry?.token_id ?? token);

  // Fetch OHLC candles from CoinGecko (free tier, no key needed)
  const ohlcRes = await axios.get<[number, number, number, number, number][]>(
    `https://api.coingecko.com/api/v3/coins/${cgId}/ohlc?vs_currency=usd&days=${days}`,
    { timeout: 12_000 },
  );
  const rawCandles = ohlcRes.data ?? [];
  const candles = rawCandles.map(([ts, o, h, l, c]) => ({
    time:  Math.floor(ts / 1000),
    open:  o, high: h, low: l, close: c,
  }));

  // Also fetch current price + 24h change
  const priceRes = await axios.get<Record<string, Record<string, number>>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_high_24h=true&include_low_24h=true`,
    { timeout: 8_000 },
  );
  const pd = priceRes.data[cgId] ?? {};
  const currentPrice       = pd['usd']            ?? candles[candles.length - 1]?.close ?? 0;
  const priceChange24h     = (currentPrice * (pd['usd_24h_change'] ?? 0)) / 100;
  const priceChangePercent = pd['usd_24h_change'] ?? 0;

  // Derive 24h range from candles if CoinGecko free-tier returns 0
  const now24h    = Date.now() / 1000 - 86400;
  const last24h   = candles.filter((c) => c.time >= now24h);
  const h24Cg     = pd['usd_24h_high'] as number | undefined;
  const l24Cg     = pd['usd_24h_low']  as number | undefined;
  const high24h   = (h24Cg && h24Cg > 0) ? h24Cg : (last24h.length ? Math.max(...last24h.map((c) => c.high)) : 0);
  const low24h    = (l24Cg && l24Cg > 0) ? l24Cg : (last24h.length ? Math.min(...last24h.map((c) => c.low))  : 0);

  // Build plain-text summary Vera can read and analyse
  const dir    = priceChangePercent >= 0 ? '▲' : '▼';
  const pct    = Math.abs(priceChangePercent).toFixed(2);
  const periodHigh = candles.length ? Math.max(...candles.map((c) => c.high)) : high24h;
  const periodLow  = candles.length ? Math.min(...candles.map((c) => c.low))  : low24h;
  const firstClose = candles[0]?.close ?? currentPrice;
  const totalPct   = firstClose > 0 ? (((currentPrice - firstClose) / firstClose) * 100).toFixed(2) : '0.00';

  const summary =
    `${symbol} ${period} chart — ${candles.length} candles fetched.\n` +
    `Current: $${currentPrice.toFixed(6)} ${dir}${pct}% (24h)\n` +
    `24h range: $${low24h.toFixed(6)} – $${high24h.toFixed(6)}\n` +
    `${period} range: $${periodLow.toFixed(6)} – $${periodHigh.toFixed(6)}\n` +
    `${period} performance: ${Number(totalPct) >= 0 ? '+' : ''}${totalPct}%`;

  return { symbol, tokenId, coingeckoId: cgId, period, candles, currentPrice, priceChange24h, priceChangePercent, high24h, low24h, summary };
}

export async function getPoolByTokens(tokenAId: string, tokenBId: string): Promise<PoolInfo | null> {
  const pools = await getPools(200);
  return pools.find(p =>
    (p.tokenA.id === tokenAId && p.tokenB.id === tokenBId) ||
    (p.tokenA.id === tokenBId && p.tokenB.id === tokenAId)
  ) ?? null;
}

// ── Token swaps (ContractExecuteTransaction) ─────────────────────────────────

export async function swapHbarForToken(params: {
  tokenId: string;
  hbarAmount: number;
  minTokenOut: number;
  slippage?: number;
}): Promise<{ txId: string; status: string; explorerUrl: string }> {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID) {
    throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
  }
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available');

  const slippage     = params.slippage ?? DEFAULT_SLIPPAGE;
  const minOut       = Math.floor(params.minTokenOut * (1 - slippage));
  const deadline     = DEFAULT_DEADLINE();
  const recipient    = hederaIdToEvmAddress(config.HEDERA_OPERATOR_ACCOUNT_ID);
  const whbarAddr    = hederaIdToEvmAddress('0.0.1456986'); // WHBAR mainnet
  const tokenAddr    = hederaIdToEvmAddress(params.tokenId);

  const tx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(V1_ROUTER_ID))
    .setGas(300_000)
    .setPayableAmount(new Hbar(params.hbarAmount))
    .setFunction(
      'swapExactETHForTokens',
      new ContractFunctionParameters()
        .addUint256(minOut)
        .addAddressArray([whbarAddr, tokenAddr])
        .addAddress(recipient)
        .addUint256(deadline)
    );

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const txId     = response.transactionId.toString();

  return { txId, status: receipt.status.toString(), explorerUrl: explorerTxUrl(txId) };
}

export async function swapTokenForHbar(params: {
  tokenId: string;
  tokenAmount: number;
  minHbarOut: number;
  slippage?: number;
}): Promise<{ txId: string; status: string; explorerUrl: string }> {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID) {
    throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
  }
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available');

  const slippage  = params.slippage ?? DEFAULT_SLIPPAGE;
  const minOut    = Math.floor(params.minHbarOut * (1 - slippage) * 1e8);
  const deadline  = DEFAULT_DEADLINE();
  const recipient = hederaIdToEvmAddress(config.HEDERA_OPERATOR_ACCOUNT_ID);
  const whbarAddr = hederaIdToEvmAddress('0.0.1456986');
  const tokenAddr = hederaIdToEvmAddress(params.tokenId);

  const tx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(V1_ROUTER_ID))
    .setGas(300_000)
    .setFunction(
      'swapExactTokensForETH',
      new ContractFunctionParameters()
        .addUint256(params.tokenAmount)
        .addUint256(minOut)
        .addAddressArray([tokenAddr, whbarAddr])
        .addAddress(recipient)
        .addUint256(deadline)
    );

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const txId     = response.transactionId.toString();

  return { txId, status: receipt.status.toString(), explorerUrl: explorerTxUrl(txId) };
}

// ── Liquidity management (ContractExecuteTransaction) ───────────────────────

export async function addLiquidityHbarToken(params: {
  tokenId: string;
  tokenAmount: number;
  hbarAmount: number;
  slippage?: number;
}): Promise<{ txId: string; status: string; explorerUrl: string }> {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID) {
    throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
  }
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available');

  const slippage = params.slippage ?? DEFAULT_SLIPPAGE;
  const tokenMin = Math.floor(params.tokenAmount * (1 - slippage));
  const hbarMin  = Math.floor(params.hbarAmount * (1 - slippage) * 1e8);
  const deadline = DEFAULT_DEADLINE();

  const recipientEvmAddr = hederaIdToEvmAddress(config.HEDERA_OPERATOR_ACCOUNT_ID);
  const tokenEvmAddr     = hederaIdToEvmAddress(params.tokenId);

  const tx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(V1_ROUTER_ID))
    .setGas(600_000)
    .setPayableAmount(new Hbar(params.hbarAmount))
    .setFunction(
      'addLiquidityETH',
      new ContractFunctionParameters()
        .addAddress(tokenEvmAddr)
        .addUint256(params.tokenAmount)
        .addUint256(tokenMin)
        .addUint256(hbarMin)
        .addAddress(recipientEvmAddr)
        .addUint256(deadline)
    );

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const txId     = response.transactionId.toString();

  return { txId, status: receipt.status.toString(), explorerUrl: explorerTxUrl(txId) };
}

export async function removeLiquidityHbarToken(params: {
  tokenId: string;
  lpAmount: number;
  minToken: number;
  minHbar: number;
  slippage?: number;
}): Promise<{ txId: string; status: string; explorerUrl: string }> {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID) {
    throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
  }
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available');

  const slippage     = params.slippage ?? DEFAULT_SLIPPAGE;
  const tokenMin     = Math.floor(params.minToken * (1 - slippage));
  const hbarMin      = Math.floor(params.minHbar  * (1 - slippage) * 1e8);
  const deadline     = DEFAULT_DEADLINE();
  const recipientEvm = hederaIdToEvmAddress(config.HEDERA_OPERATOR_ACCOUNT_ID);
  const tokenEvm     = hederaIdToEvmAddress(params.tokenId);

  const tx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(V1_ROUTER_ID))
    .setGas(600_000)
    .setFunction(
      'removeLiquidityETH',
      new ContractFunctionParameters()
        .addAddress(tokenEvm)
        .addUint256(params.lpAmount)
        .addUint256(tokenMin)
        .addUint256(hbarMin)
        .addAddress(recipientEvm)
        .addUint256(deadline)
    );

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const txId     = response.transactionId.toString();

  return { txId, status: receipt.status.toString(), explorerUrl: explorerTxUrl(txId) };
}
