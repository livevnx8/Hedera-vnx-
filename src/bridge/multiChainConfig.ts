/**
 * VeraBridge Multi-Chain Architecture
 * 
 * Service Model: "You bring the users, we do the bridging"
 * 
 * Features:
 * - 50+ chain support via modular adapters
 * - Embeddable widget for any website
 * - JavaScript SDK for developers
 * - REST API for backend integration
 * - White-label solution
 * - Revenue share for partners
 */

import { logger } from '../monitoring/logger.js';

// Supported chains (Top 50 by TVL/Volume)
export const SUPPORTED_CHAINS = {
  // EVM Chains (35)
  ETHEREUM: {
    id: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    rpcUrls: ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
    explorer: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    verification: 'Etherscan API',
    type: 'evm',
    htlcContract: '',
    tvl: '$50B+',
  },
  BSC: {
    id: 56,
    name: 'BNB Chain',
    symbol: 'BSC',
    rpcUrls: ['https://bsc-dataseed.binance.org', 'https://rpc.ankr.com/bsc'],
    explorer: 'https://bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    type: 'evm',
    tvl: '$5B+',
  },
  POLYGON: {
    id: 137,
    name: 'Polygon PoS',
    symbol: 'MATIC',
    rpcUrls: ['https://polygon.llamarpc.com', 'https://rpc.ankr.com/polygon'],
    explorer: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    type: 'evm',
    tvl: '$2B+',
  },
  ARBITRUM: {
    id: 42161,
    name: 'Arbitrum One',
    symbol: 'ARB',
    rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum'],
    explorer: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$15B+',
  },
  OPTIMISM: {
    id: 10,
    name: 'Optimism',
    symbol: 'OP',
    rpcUrls: ['https://mainnet.optimism.io', 'https://rpc.ankr.com/optimism'],
    explorer: 'https://optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$8B+',
  },
  BASE: {
    id: 8453,
    name: 'Base',
    symbol: 'BASE',
    rpcUrls: ['https://mainnet.base.org', 'https://rpc.ankr.com/base'],
    explorer: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$3B+',
  },
  AVALANCHE: {
    id: 43114,
    name: 'Avalanche C-Chain',
    symbol: 'AVAX',
    rpcUrls: ['https://api.avax.network/ext/bc/C/rpc', 'https://rpc.ankr.com/avalanche'],
    explorer: 'https://snowtrace.io',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
    type: 'evm',
    tvl: '$1B+',
  },
  FANTOM: {
    id: 250,
    name: 'Fantom',
    symbol: 'FTM',
    rpcUrls: ['https://rpc.ftm.tools', 'https://rpc.ankr.com/fantom'],
    explorer: 'https://ftmscan.com',
    nativeCurrency: { name: 'FTM', symbol: 'FTM', decimals: 18 },
    type: 'evm',
    tvl: '$500M+',
  },
  CRONOS: {
    id: 25,
    name: 'Cronos',
    symbol: 'CRO',
    rpcUrls: ['https://evm.cronos.org', 'https://rpc.vvs.finance'],
    explorer: 'https://cronoscan.com',
    nativeCurrency: { name: 'CRO', symbol: 'CRO', decimals: 18 },
    type: 'evm',
    tvl: '$400M+',
  },
  GNOSIS: {
    id: 100,
    name: 'Gnosis Chain',
    symbol: 'GNO',
    rpcUrls: ['https://rpc.gnosischain.com', 'https://rpc.ankr.com/gnosis'],
    explorer: 'https://gnosisscan.io',
    nativeCurrency: { name: 'xDAI', symbol: 'XDAI', decimals: 18 },
    type: 'evm',
    tvl: '$200M+',
  },
  KLAYTN: {
    id: 8217,
    name: 'Klaytn',
    symbol: 'KLAY',
    rpcUrls: ['https://public-node-api.klaytnapi.com/v1/cypress'],
    explorer: 'https://klaytnscope.com',
    nativeCurrency: { name: 'KLAY', symbol: 'KLAY', decimals: 18 },
    type: 'evm',
    tvl: '$150M+',
  },
  CELO: {
    id: 42220,
    name: 'Celo',
    symbol: 'CELO',
    rpcUrls: ['https://forno.celo.org', 'https://rpc.ankr.com/celo'],
    explorer: 'https://celoscan.io',
    nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
    type: 'evm',
    tvl: '$100M+',
  },
  MOONBEAM: {
    id: 1284,
    name: 'Moonbeam',
    symbol: 'GLMR',
    rpcUrls: ['https://rpc.api.moonbeam.network', 'https://rpc.ankr.com/moonbeam'],
    explorer: 'https://moonscan.io',
    nativeCurrency: { name: 'GLMR', symbol: 'GLMR', decimals: 18 },
    type: 'evm',
    tvl: '$80M+',
  },
  MOONRIVER: {
    id: 1285,
    name: 'Moonriver',
    symbol: 'MOVR',
    rpcUrls: ['https://rpc.api.moonriver.moonbeam.network'],
    explorer: 'https://moonriver.moonscan.io',
    nativeCurrency: { name: 'MOVR', symbol: 'MOVR', decimals: 18 },
    type: 'evm',
    tvl: '$30M+',
  },
  AURORA: {
    id: 1313161554,
    name: 'Aurora',
    symbol: 'AURORA',
    rpcUrls: ['https://mainnet.aurora.dev'],
    explorer: 'https://explorer.aurora.dev',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$50M+',
  },
  HARMONY: {
    id: 1666600000,
    name: 'Harmony',
    symbol: 'ONE',
    rpcUrls: ['https://api.harmony.one', 'https://rpc.ankr.com/harmony'],
    explorer: 'https://explorer.harmony.one',
    nativeCurrency: { name: 'ONE', symbol: 'ONE', decimals: 18 },
    type: 'evm',
    tvl: '$40M+',
  },
  BOBA: {
    id: 288,
    name: 'Boba Network',
    symbol: 'BOBA',
    rpcUrls: ['https://mainnet.boba.network'],
    explorer: 'https://bobascan.com',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$60M+',
  },
  METIS: {
    id: 1088,
    name: 'Metis',
    symbol: 'METIS',
    rpcUrls: ['https://andromeda.metis.io/?owner=1088'],
    explorer: 'https://andromeda.explorer.metis.io',
    nativeCurrency: { name: 'METIS', symbol: 'METIS', decimals: 18 },
    type: 'evm',
    tvl: '$70M+',
  },
  ZKSYNC: {
    id: 324,
    name: 'zkSync Era',
    symbol: 'ZKS',
    rpcUrls: ['https://mainnet.era.zksync.io', 'https://rpc.ankr.com/zksync_era'],
    explorer: 'https://explorer.zksync.io',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    type: 'evm-zk',
    tvl: '$1B+',
  },
  STARKNET: {
    id: 'starknet',
    name: 'StarkNet',
    symbol: 'STRK',
    rpcUrls: ['https://starknet-mainnet.public.blastapi.io'],
    explorer: 'https://starkscan.co',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    type: 'starknet',
    tvl: '$500M+',
  },
  SCROLL: {
    id: 534352,
    name: 'Scroll',
    symbol: 'SCROLL',
    rpcUrls: ['https://rpc.scroll.io', 'https://rpc.ankr.com/scroll'],
    explorer: 'https://scrollscan.com',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$200M+',
  },
  LINEA: {
    id: 59144,
    name: 'Linea',
    symbol: 'LINEA',
    rpcUrls: ['https://rpc.linea.build', 'https://linea-mainnet.infura.io/v3/'],
    explorer: 'https://lineascan.build',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$150M+',
  },
  MANTLE: {
    id: 5000,
    name: 'Mantle',
    symbol: 'MNT',
    rpcUrls: ['https://rpc.mantle.xyz', 'https://mantle-mainnet.public.blastapi.io'],
    explorer: 'https://explorer.mantle.xyz',
    nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 },
    type: 'evm',
    tvl: '$100M+',
  },
  MANTA: {
    id: 169,
    name: 'Manta Pacific',
    symbol: 'MANTA',
    rpcUrls: ['https://pacific-rpc.manta.network/http'],
    explorer: 'https://pacific-explorer.manta.network',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$80M+',
  },
  BLAST: {
    id: 81457,
    name: 'Blast',
    symbol: 'BLAST',
    rpcUrls: ['https://rpc.blast.io', 'https://blast.dinero.rpc.com'],
    explorer: 'https://blastscan.io',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$1B+',
  },
  MODE: {
    id: 34443,
    name: 'Mode',
    symbol: 'MODE',
    rpcUrls: ['https://mainnet.mode.network'],
    explorer: 'https://explorer.mode.network',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$200M+',
  },
  FRAXTAL: {
    id: 252,
    name: 'Fraxtal',
    symbol: 'FRAX',
    rpcUrls: ['https://rpc.frax.com'],
    explorer: 'https://fraxscan.com',
    nativeCurrency: { name: 'frxETH', symbol: 'frxETH', decimals: 18 },
    type: 'evm',
    tvl: '$100M+',
  },
  REDSTONE: {
    id: 690,
    name: 'Redstone',
    symbol: 'REDSTONE',
    rpcUrls: ['https://rpc.redstonechain.com'],
    explorer: 'https://explorer.redstone.xyz',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$50M+',
  },
  CYBER: {
    id: 7560,
    name: 'Cyber',
    symbol: 'CYBER',
    rpcUrls: ['https://rpc.cyber.co'],
    explorer: 'https://cyberscan.co',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    type: 'evm',
    tvl: '$30M+',
  },
  SEI: {
    id: 1329,
    name: 'Sei',
    symbol: 'SEI',
    rpcUrls: ['https://evm-rpc.sei-apis.com'],
    explorer: 'https://seiscan.app',
    nativeCurrency: { name: 'SEI', symbol: 'SEI', decimals: 18 },
    type: 'evm-cosmos',
    tvl: '$200M+',
  },

  // Non-EVM Chains (15)
  SOLANA: {
    id: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    rpcUrls: ['https://api.mainnet-beta.solana.com', 'https://solana-mainnet.rpc.extrnode.com'],
    explorer: 'https://solscan.io',
    nativeCurrency: { name: 'SOL', symbol: 'SOL', decimals: 9 },
    type: 'solana',
    tvl: '$4B+',
  },
  SUI: {
    id: 'sui',
    name: 'Sui',
    symbol: 'SUI',
    rpcUrls: ['https://fullnode.mainnet.sui.io:443'],
    explorer: 'https://suiscan.xyz',
    nativeCurrency: { name: 'SUI', symbol: 'SUI', decimals: 9 },
    type: 'sui',
    tvl: '$800M+',
  },
  APTOS: {
    id: 'aptos',
    name: 'Aptos',
    symbol: 'APT',
    rpcUrls: ['https://fullnode.mainnet.aptoslabs.com/v1'],
    explorer: 'https://aptoscan.com',
    nativeCurrency: { name: 'APT', symbol: 'APT', decimals: 8 },
    type: 'aptos',
    tvl: '$400M+',
  },
  COSMOS: {
    id: 'cosmoshub-4',
    name: 'Cosmos Hub',
    symbol: 'ATOM',
    rpcUrls: ['https://rpc-cosmoshub-ia.cosmosia.notional.ventures'],
    explorer: 'https://mintscan.io/cosmos',
    nativeCurrency: { name: 'ATOM', symbol: 'ATOM', decimals: 6 },
    type: 'cosmos',
    tvl: '$300M+',
  },
  OSMOSIS: {
    id: 'osmosis-1',
    name: 'Osmosis',
    symbol: 'OSMO',
    rpcUrls: ['https://rpc.osmosis.zone'],
    explorer: 'https://mintscan.io/osmosis',
    nativeCurrency: { name: 'OSMO', symbol: 'OSMO', decimals: 6 },
    type: 'cosmos',
    tvl: '$200M+',
  },
  NEAR: {
    id: 'near',
    name: 'NEAR Protocol',
    symbol: 'NEAR',
    rpcUrls: ['https://rpc.mainnet.near.org'],
    explorer: 'https://nearscan.io',
    nativeCurrency: { name: 'NEAR', symbol: 'NEAR', decimals: 24 },
    type: 'near',
    tvl: '$150M+',
  },
  ALGORAND: {
    id: 'algorand',
    name: 'Algorand',
    symbol: 'ALGO',
    rpcUrls: ['https://mainnet-api.algonode.cloud'],
    explorer: 'https://algoexplorer.io',
    nativeCurrency: { name: 'ALGO', symbol: 'ALGO', decimals: 6 },
    type: 'algorand',
    tvl: '$100M+',
  },
  CARDANO: {
    id: 'cardano',
    name: 'Cardano',
    symbol: 'ADA',
    rpcUrls: ['https://cardano-mainnet.blockfrost.io/api/v0'],
    explorer: 'https://cardanoscan.io',
    nativeCurrency: { name: 'ADA', symbol: 'ADA', decimals: 6 },
    type: 'cardano',
    tvl: '$200M+',
  },
  HEDERA: {
    id: 'hedera',
    name: 'Hedera',
    symbol: 'HBAR',
    rpcUrls: ['https://mainnet-public.mirrornode.hedera.com'],
    explorer: 'https://hashscan.io/mainnet',
    nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 8 },
    type: 'hedera',
    tvl: '$1B+',
    hcsTopic: '0.0.10417507',
  },
  INJECTIVE: {
    id: 'injective-1',
    name: 'Injective',
    symbol: 'INJ',
    rpcUrls: ['https://injective-rpc.polkachu.com'],
    explorer: 'https://mintscan.io/injective',
    nativeCurrency: { name: 'INJ', symbol: 'INJ', decimals: 18 },
    type: 'cosmos-evm',
    tvl: '$300M+',
  },
  POLKADOT: {
    id: 'polkadot',
    name: 'Polkadot',
    symbol: 'DOT',
    rpcUrls: ['https://rpc.polkadot.io'],
    explorer: 'https://polkadot.subscan.io',
    nativeCurrency: { name: 'DOT', symbol: 'DOT', decimals: 10 },
    type: 'substrate',
    tvl: '$500M+',
  },
  KUSAMA: {
    id: 'kusama',
    name: 'Kusama',
    symbol: 'KSM',
    rpcUrls: ['https://kusama-rpc.polkadot.io'],
    explorer: 'https://kusama.subscan.io',
    nativeCurrency: { name: 'KSM', symbol: 'KSM', decimals: 12 },
    type: 'substrate',
    tvl: '$100M+',
  },
  TRON: {
    id: 'tron',
    name: 'TRON',
    symbol: 'TRX',
    rpcUrls: ['https://api.trongrid.io'],
    explorer: 'https://tronscan.org',
    nativeCurrency: { name: 'TRX', symbol: 'TRX', decimals: 6 },
    type: 'tron',
    tvl: '$6B+',
  },
  TEZOS: {
    id: 'tezos',
    name: 'Tezos',
    symbol: 'XTZ',
    rpcUrls: ['https://mainnet.api.tez.ie'],
    explorer: 'https://tzkt.io',
    nativeCurrency: { name: 'XTZ', symbol: 'XTZ', decimals: 6 },
    type: 'tezos',
    tvl: '$50M+',
  },
  STELLAR: {
    id: 'stellar',
    name: 'Stellar',
    symbol: 'XLM',
    rpcUrls: ['https://horizon.stellar.org'],
    explorer: 'https://stellar.expert/explorer/public',
    nativeCurrency: { name: 'XLM', symbol: 'XLM', decimals: 7 },
    type: 'stellar',
    tvl: '$100M+',
  },
};

// Chain adapter interface
export interface ChainAdapter {
  chainId: string;
  name: string;
  
  // Connection
  connect(rpcUrl: string): Promise<boolean>;
  disconnect(): void;
  
  // Balance queries
  getBalance(address: string, token?: string): Promise<string>;
  getTokenBalance(address: string, tokenContract: string): Promise<string>;
  
  // Bridge operations
  createHTLC(params: HTLCParams): Promise<HTLCResult>;
  claimHTLC(htlcId: string, secret: string, signatures: string[]): Promise<TransactionResult>;
  refundHTLC(htlcId: string): Promise<TransactionResult>;
  
  // Transaction queries
  getTransactionStatus(txHash: string): Promise<'pending' | 'confirmed' | 'failed'>;
  waitForConfirmation(txHash: string, timeout?: number): Promise<boolean>;
  
  // Event listening
  subscribeToEvents(event: string, callback: (data: any) => void): void;
  unsubscribeFromEvents(event: string): void;
}

export interface HTLCParams {
  sender: string;
  recipient: string;
  amount: string;
  token: string; // native token or contract address
  hashLock: string;
  expiry: number; // Unix timestamp
  destinationChain: string;
  destinationAddress: string;
}

export interface HTLCResult {
  htlcId: string;
  txHash: string;
  status: 'created' | 'pending' | 'confirmed';
  expiry: number;
}

export interface TransactionResult {
  txHash: string;
  status: 'success' | 'failed';
  gasUsed?: string;
  blockNumber?: number;
}

// Bridge configuration
export interface BridgeRoute {
  sourceChain: string;
  targetChain: string;
  supportedTokens: string[];
  estimatedTime: number; // seconds
  bridgeFee: number; // percentage (e.g., 0.0025 for 0.25%)
  minAmount: string;
  maxAmount: string;
}

// Partner integration config
export interface PartnerConfig {
  partnerId: string;
  apiKey: string;
  allowedOrigins: string[];
  allowedChains: string[];
  customBranding?: {
    logo: string;
    primaryColor: string;
    companyName: string;
  };
  revenueShare: number; // percentage (e.g., 0.50 for 50%)
  webhookUrl?: string;
}

// Service fee structure
export const BRIDGE_FEES = {
  standard: 0.0025, // 0.25%
  partner: 0.0020,  // 0.20% (discounted)
  volume: {
    tier1: { threshold: 10000, fee: 0.0020 },   // $10K+
    tier2: { threshold: 100000, fee: 0.0015 },  // $100K+
    tier3: { threshold: 1000000, fee: 0.0010 }, // $1M+
  },
};

// Revenue sharing tiers
export const REVENUE_SHARE_TIERS = {
  starter: 0.30,    // 30% to partner
  growth: 0.40,     // 40% to partner (>$100K monthly)
  enterprise: 0.50, // 50% to partner (>$1M monthly)
};

// API rate limits
export const RATE_LIMITS = {
  free: { requestsPerMinute: 60, maxTransfer: 1000 },
  pro: { requestsPerMinute: 600, maxTransfer: 100000 },
  enterprise: { requestsPerMinute: 6000, maxTransfer: 10000000 },
};

// Logger wrapper
export function logBridgeEvent(
  event: string,
  data: object,
  partnerId?: string
): void {
  logger.info('VeraBridgeMultiChain', {
    event,
    partnerId,
    timestamp: Date.now(),
    ...data,
  });
}

// Get chain by ID
export function getChainById(chainId: string | number): typeof SUPPORTED_CHAINS[keyof typeof SUPPORTED_CHAINS] | undefined {
  return Object.values(SUPPORTED_CHAINS).find(
    (chain) => chain.id === chainId || chain.symbol === chainId
  );
}

// Get all supported routes
export function getAllRoutes(): BridgeRoute[] {
  const chains = Object.values(SUPPORTED_CHAINS);
  const routes: BridgeRoute[] = [];
  
  for (const source of chains) {
    for (const target of chains) {
      if (source.id !== target.id) {
        routes.push({
          sourceChain: source.symbol,
          targetChain: target.symbol,
          supportedTokens: getSupportedTokens(source.type, target.type),
          estimatedTime: 120, // 2 minutes average
          bridgeFee: BRIDGE_FEES.standard,
          minAmount: '0.001',
          maxAmount: '1000000',
        });
      }
    }
  }
  
  return routes;
}

// Helper to determine supported tokens between chain types
function getSupportedTokens(sourceType: string, targetType: string): string[] {
  const commonTokens = ['USDC', 'USDT', 'ETH', 'WBTC'];
  
  if (sourceType === 'evm' && targetType === 'evm') {
    return [...commonTokens, 'DAI', 'LINK', 'UNI', 'AAVE'];
  }
  
  if (sourceType.includes('cosmos') || targetType.includes('cosmos')) {
    return [...commonTokens, 'ATOM', 'OSMO', 'INJ'];
  }
  
  if (sourceType === 'solana' || targetType === 'solana') {
    return [...commonTokens, 'SOL', 'RAY', 'SRM'];
  }
  
  return commonTokens;
}
