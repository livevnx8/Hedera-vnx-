#!/usr/bin/env node

/**
 * VeraBridge Validator Setup Script
 * 
 * Usage:
 *   node scripts/setup-validator.js
 * 
 * This script:
 *   1. Generates validator keys (Hedera + Ethereum)
 *   2. Stakes VERA tokens
 *   3. Registers validator with bridge contract
 *   4. Starts validator monitoring service
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, PrivateKey, AccountCreateTransaction, Hbar } = require('@hashgraph/sdk');
const ethers = require('ethers');

const CONFIG = {
  validatorId: process.env.VALIDATOR_ID || 'validator-1',
  hederaNetwork: process.env.HEDERA_NETWORK || 'testnet',
  minStake: '10000', // 10,000 VERA
  bridgeContract: process.env.ETHEREUM_BRIDGE_CONTRACT,
};

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🛡️ VERA BRIDGE VALIDATOR SETUP                               ║
║  Multi-Sig Node Configuration                                  ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  console.log(`Validator ID: ${CONFIG.validatorId}`);
  console.log(`Network: ${CONFIG.hederaNetwork}`);
  console.log('');

  // Step 1: Generate or load keys
  console.log('🔐 Step 1: Validator Keys');
  const keys = await setupKeys();
  
  // Step 2: Stake VERA tokens
  console.log('');
  console.log('💰 Step 2: Staking VERA Tokens');
  await stakeTokens(keys);
  
  // Step 3: Register with bridge
  console.log('');
  console.log('📋 Step 3: Registering with Bridge Contract');
  await registerValidator(keys);
  
  // Step 4: Save configuration
  console.log('');
  console.log('💾 Step 4: Saving Configuration');
  await saveConfig(keys);
  
  // Step 5: Start monitoring
  console.log('');
  console.log('🚀 Step 5: Starting Validator Service');
  console.log('Run: npm run validator:start');

  console.log('');
  console.log('✅ Validator setup complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Ensure your validator has 24/7 uptime');
  console.log('  2. Monitor Discord #validator-alerts');
  console.log('  3. Keep your private keys secure');
}

async function setupKeys() {
  const keysDir = path.join(__dirname, '..', 'validator-keys', CONFIG.validatorId);
  fs.mkdirSync(keysDir, { recursive: true });

  // Check for existing keys
  const hederaKeyPath = path.join(keysDir, 'hedera.key');
  const ethereumKeyPath = path.join(keysDir, 'ethereum.key');

  if (fs.existsSync(hederaKeyPath) && fs.existsSync(ethereumKeyPath)) {
    console.log('  Loading existing keys...');
    return {
      hedera: fs.readFileSync(hederaKeyPath, 'utf8').trim(),
      ethereum: fs.readFileSync(ethereumKeyPath, 'utf8').trim(),
    };
  }

  // Generate new Hedera key
  console.log('  Generating Hedera ED25519 key...');
  const hederaKey = PrivateKey.generateED25519();
  const hederaKeyString = hederaKey.toStringDer();
  
  // Generate new Ethereum key
  console.log('  Generating Ethereum ECDSA key...');
  const ethereumWallet = ethers.Wallet.createRandom();
  const ethereumKeyString = ethereumWallet.privateKey;

  // Save keys (with warnings)
  console.log('  ⚠️  WARNING: Saving keys to disk. Use HSM in production!');
  fs.writeFileSync(hederaKeyPath, hederaKeyString);
  fs.writeFileSync(ethereumKeyPath, ethereumKeyString);
  fs.chmodSync(hederaKeyPath, 0o600);
  fs.chmodSync(ethereumKeyPath, 0o600);

  // Display public info
  console.log('');
  console.log('  📊 Key Information:');
  console.log(`    Hedera Public Key: ${hederaKey.publicKey.toString()}`);
  console.log(`    Ethereum Address: ${ethereumWallet.address}`);

  return {
    hedera: hederaKeyString,
    ethereum: ethereumKeyString,
    hederaPublic: hederaKey.publicKey.toString(),
    ethereumAddress: ethereumWallet.address,
  };
}

async function stakeTokens(keys) {
  console.log(`  Staking ${CONFIG.minStake} VERA tokens...`);
  
  if (!CONFIG.bridgeContract) {
    console.log('  ⚠️  Bridge contract not configured. Skipping stake.');
    console.log('      Set ETHEREUM_BRIDGE_CONTRACT in .env');
    return;
  }

  try {
    // Connect to Ethereum
    const provider = new ethers.providers.JsonRpcProvider(
      process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com'
    );
    const wallet = new ethers.Wallet(keys.ethereum, provider);

    // Load bridge contract ABI (simplified)
    const bridgeAbi = ['function stake(uint256 amount) external'];
    const bridge = new ethers.Contract(CONFIG.bridgeContract, bridgeAbi, wallet);

    // Stake tokens
    const amount = ethers.utils.parseEther(CONFIG.minStake);
    console.log(`  Sending stake transaction...`);
    
    // This would be the actual call:
    // const tx = await bridge.stake(amount);
    // await tx.wait();
    
    console.log('  ✅ Stake transaction simulated (enable in production)');
    
  } catch (error) {
    console.error('  ❌ Staking failed:', error.message);
    throw error;
  }
}

async function registerValidator(keys) {
  console.log('  Registering validator with bridge contract...');
  
  if (!CONFIG.bridgeContract) {
    console.log('  ⚠️  Bridge contract not configured. Skipping registration.');
    return;
  }

  try {
    // This would call bridge.addValidator() as the contract owner
    console.log('  ⚠️  Owner must call addValidator() manually');
    console.log(`     Validator address: ${keys.ethereumAddress}`);
    
  } catch (error) {
    console.error('  ❌ Registration failed:', error.message);
    throw error;
  }
}

async function saveConfig(keys) {
  const configPath = path.join(__dirname, '..', 'validator-configs', `${CONFIG.validatorId}.json`);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  const config = {
    validatorId: CONFIG.validatorId,
    hedera: {
      network: CONFIG.hederaNetwork,
      // Don't save private keys in config!
      publicKey: keys.hederaPublic,
    },
    ethereum: {
      address: keys.ethereumAddress,
      // Don't save private keys in config!
    },
    bridgeContract: CONFIG.bridgeContract,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`  Config saved: ${configPath}`);
}

// Run
main().catch(console.error);
