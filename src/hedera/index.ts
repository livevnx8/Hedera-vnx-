/**
 * Hedera Module - Complete Hedera Hashgraph Integration
 * 
 * Provides intuitive wallet-style API and comprehensive tool coverage
 * for all Hedera Token Service (HTS), Consensus Service (HCS), and account operations.
 */

// Wallet API - Intuitive wallet-style interface
export {
  HederaWallet,
  createWallet,
  quickSendHBAR,
  quickSendToken,
  quickBalance,
  type WalletConfig,
  type TokenBalance,
  type TransactionReceipt,
  type SendOptions
} from './wallet.js';

// Tool Registry - All Hedera tools registered and ready
export {
  hederaToolRegistry,
  HederaToolRegistry,
  type HederaTool,
  type ToolResult
} from './tools/index.js';

// Individual tool categories
export { htsTools, extendedHtsTools } from './tools/hts/index.js';
export { hcsTools } from './tools/hcs/index.js';
export { accountTools } from './tools/account/index.js';
export { queryTools } from './tools/queries/index.js';

// Advanced Hedera features
export { HederaLatticeIntegration, getHederaLatticeIntegration } from '../vera/orchestrator/hederaLatticeIntegration.js';
export type { LatticeHederaConfig, HederaOperation } from '../vera/orchestrator/hederaLatticeIntegration.js';

// Client management  
export { getClient } from './tools/client.js';

// Utility functions - simple inline implementations
export function formatHbar(tinybar: number | string): string {
  const val = typeof tinybar === 'string' ? parseFloat(tinybar) : tinybar;
  return (val / 100_000_000).toFixed(8);
}

export function parseHbar(hbar: number | string): string {
  const val = typeof hbar === 'string' ? parseFloat(hbar) : hbar;
  return Math.floor(val * 100_000_000).toString();
}

export function formatTokenAmount(amount: number | string, decimals: number = 8): string {
  const val = typeof amount === 'string' ? parseFloat(amount) : amount;
  return (val / Math.pow(10, decimals)).toFixed(decimals);
}

export function isValidAccountId(id: string): boolean {
  return /^0\.0\.\d+$/.test(id);
}

export function isValidTokenId(id: string): boolean {
  return /^0\.0\.\d+$/.test(id);
}

// Constants
export const HEDERA_NETWORKS = {
  MAINNET: 'mainnet',
  TESTNET: 'testnet',
  PREVIEWNET: 'previewnet'
} as const;

export const HEDERA_DECIMALS = {
  HBAR: 8,
  USDC: 6,
  DEFAULT_TOKEN: 8
} as const;

// Re-export commonly used types from SDK
export type { AccountId, TokenId, TransactionId, Hbar } from '@hashgraph/sdk';
