/**
 * Cross-Chain Interoperability Hub (Phase 13)
 * 
 * Multi-chain bridging, message passing, and liquidity aggregation.
 * Connects Hedera to Ethereum, Bitcoin, Solana, Cosmos, and more.
 */

export {
  BridgeManager,
  getBridgeManager
} from './bridgeManager.js';

export {
  LiquidityAggregator,
  getLiquidityAggregator
} from './liquidityAggregator.js';

export type {
  SupportedChain,
  ChainConfig,
  BridgeAsset,
  BridgeReceipt,
  MerkleProof,
  CrossChainMessage,
  SwapRoute,
  SwapReceipt,
  LiquidityPool,
  ChainAsset,
  BridgeStats
} from './types.js';
