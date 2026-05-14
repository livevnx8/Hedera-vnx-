/**
 * Hardhat Configuration for VeraBridge
 */

require('@nomicfoundation/hardhat-toolbox');
require('@nomicfoundation/hardhat-verify');
require('dotenv').config();

const PRIVATE_KEY = process.env.ETHEREUM_PRIVATE_KEY || '';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';

// Validate private key format
function validatePrivateKey(key) {
  if (!key || key === '0x...' || key === '...') {
    return null;
  }
  // Remove 0x prefix if present
  const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
  // Check if it's 64 hex characters (32 bytes)
  if (cleanKey.length === 64 && /^[a-fA-F0-9]+$/.test(cleanKey)) {
    return '0x' + cleanKey;
  }
  return null;
}

const validKey = validatePrivateKey(PRIVATE_KEY);
const accounts = validKey ? [validKey] : [];

// Network configurations (only added if key is valid)
const networkConfigs = validKey ? {
  // Mainnet
  mainnet: {
    url: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    accounts: accounts,
    chainId: 1,
  },
  
  // Testnets
  goerli: {
    url: process.env.GOERLI_RPC_URL || 'https://goerli.infura.io/v3/',
    accounts: accounts,
    chainId: 5,
  },
  
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/',
    accounts: accounts,
    chainId: 11155111,
  },
  
  // L2s
  arbitrum: {
    url: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    accounts: accounts,
    chainId: 42161,
  },
  
  optimism: {
    url: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    accounts: accounts,
    chainId: 10,
  },
  
  base: {
    url: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    accounts: accounts,
    chainId: 8453,
  },
  
  polygon: {
    url: process.env.POLYGON_RPC_URL || 'https://polygon.llamarpc.com',
    accounts: accounts,
    chainId: 137,
  },
  
  bsc: {
    url: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    accounts: accounts,
    chainId: 56,
  },
  
  avalanche: {
    url: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
    accounts: accounts,
    chainId: 43114,
  },
} : {};

module.exports = {
  solidity: {
    version: '0.8.19',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  
  networks: {
    // Local (always available)
    hardhat: {
      chainId: 31337,
    },
    
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
    },
    
    // External networks (only if key configured)
    ...networkConfigs,
  },
  
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      goerli: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
      arbitrumOne: process.env.ARBISCAN_API_KEY || '',
      optimisticEthereum: process.env.OPTIMISTIC_ETHERSCAN_API_KEY || '',
      polygon: process.env.POLYGONSCAN_API_KEY || '',
      bsc: process.env.BSCSCAN_API_KEY || '',
      avalanche: process.env.SNOWTRACE_API_KEY || '',
      base: process.env.BASESCAN_API_KEY || '',
    },
  },
  
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  
  mocha: {
    timeout: 40000,
  },
};

// Warn if no valid key
if (!validKey) {
  console.log('\n⚠️  WARNING: No valid ETHEREUM_PRIVATE_KEY found in .env');
  console.log('   External networks disabled. Only hardhat/localhost available.');
  console.log('   Set a valid 64-character private key to enable deployments.\n');
}
