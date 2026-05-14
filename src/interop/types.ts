/**
 * Cross-Chain Interoperability Types (Phase 13)
 * 
 * Type definitions for multi-chain bridging, message passing,
 * and liquidity aggregation across blockchain networks.
 */

export type SupportedChain = 'ethereum' | 'bitcoin' | 'solana' | 'cosmos' | 'polygon' | 'arbitrum' | 'optimism' | 'hedera';

export interface ChainConfig {
  chainId: SupportedChain;
  name: string;
  nativeCurrency: string;
  rpcUrl: string;
  bridgeContract: string;
  confirmationBlocks: number;
  avgBlockTime: number; // seconds
  isActive: boolean;
}

export interface BridgeAsset {
  assetId: string;
  symbol: string;
  name: string;
  decimals: number;
  nativeChain: SupportedChain;
  wrappedAddress?: Record<SupportedChain, string>; // Wrapped token addresses per chain
  iconUrl?: string;
}

export interface BridgeReceipt {
  receiptId: string;
  sourceChain: SupportedChain;
  targetChain: SupportedChain;
  asset: string;
  amount: bigint;
  sender: string;
  recipient: string;
  lockTxHash: string;
  lockTimestamp: number;
  nonce: bigint;
  merkleRoot: string;
  status: 'locked' | 'minted' | 'burned' | 'unlocked' | 'failed';
}

export interface MerkleProof {
  root: string;
  leaf: string;
  path: string[];
  indices: number[];
}

export interface CrossChainMessage {
  messageId: string;
  sourceChain: SupportedChain;
  targetChain: SupportedChain;
  sender: string;
  recipient: string;
  payload: Buffer;
  nonce: bigint;
  timestamp: number;
  status: 'pending' | 'delivered' | 'failed' | 'expired';
  deliveryProof?: string;
  gasLimit: bigint;
  value: bigint;
}

export interface SwapRoute {
  routeId: string;
  from: ChainAsset;
  to: ChainAsset;
  steps: Array<{
    chain: SupportedChain;
    protocol: string;
    fromAsset: string;
    toAsset: string;
    expectedOutput: bigint;
    fee: bigint;
    slippage: number;
  }>;
  totalExpectedOutput: bigint;
  totalFee: bigint;
  totalSlippage: number;
  estimatedTime: number; // seconds
  path: string[]; // Chain IDs in order
}

export interface ChainAsset {
  chain: SupportedChain;
  asset: string;
  amount: bigint;
}

export interface SwapReceipt {
  receiptId: string;
  route: SwapRoute;
  executedSteps: number;
  finalOutput: bigint;
  actualSlippage: number;
  txHashes: Record<SupportedChain, string>;
  status: 'completed' | 'partial' | 'failed';
  completedAt: number;
}

export interface LiquidityPool {
  poolId: string;
  chain: SupportedChain;
  assets: [string, string];
  reserves: [bigint, bigint];
  totalLiquidity: bigint;
  apr: number;
  volume24h: bigint;
  feeTier: number; // basis points
}

export interface BridgeStats {
  totalVolume: bigint;
  totalTransactions: number;
  activeChains: number;
  avgSettlementTime: number;
  feesCollected: bigint;
}
