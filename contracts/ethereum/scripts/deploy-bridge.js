const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

/**
 * VeraBridge Ethereum Contract Deployment
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-bridge.js --network mainnet
 *   npx hardhat run scripts/deploy-bridge.js --network goerli
 */

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🚀 VERA BRIDGE ETHEREUM DEPLOYMENT                            ║
║  Super Highway to Hedera                                       ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  const [deployer] = await ethers.getSigners();
  const balance = await deployer.getBalance();
  
  console.log('Deploying with account:', deployer.address);
  console.log('Account balance:', ethers.utils.formatEther(balance), 'ETH');
  console.log('Network:', network.name);
  console.log('');

  // Check if we have enough balance
  if (balance.lt(ethers.utils.parseEther('0.1'))) {
    console.error('❌ Insufficient balance. Need at least 0.1 ETH for gas.');
    process.exit(1);
  }

  // Deploy VeraBridge
  console.log('📄 Deploying VeraBridge...');
  const VeraBridge = await ethers.getContractFactory('VeraBridge');
  const bridge = await VeraBridge.deploy();
  await bridge.deployed();

  console.log('✅ VeraBridge deployed to:', bridge.address);
  console.log('Transaction hash:', bridge.deployTransaction.hash);

  // Verify initial parameters
  const bridgeFee = await bridge.bridgeFee();
  const requiredSigs = await bridge.requiredSignatures();
  
  console.log('');
  console.log('📊 Initial Configuration:');
  console.log('  Bridge Fee:', bridgeFee.toString(), 'basis points (0.10%)');
  console.log('  Required Signatures:', requiredSigs.toString(), 'of 5');

  // Add initial validators (would be done separately in production)
  console.log('');
  console.log('⚠️  Next steps:');
  console.log('  1. Add validators with addValidator()');
  console.log('  2. Register wrapped tokens with registerWrappedToken()');
  console.log('  3. Fund the contract with initial liquidity');
  console.log('  4. Verify contract on Etherscan');

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployer.address,
    contracts: {
      VeraBridge: {
        address: bridge.address,
        transactionHash: bridge.deployTransaction.hash,
        blockNumber: bridge.deployTransaction.blockNumber,
        gasPrice: bridge.deployTransaction.gasPrice?.toString(),
        gasLimit: bridge.deployTransaction.gasLimit?.toString(),
      }
    },
    timestamp: new Date().toISOString(),
  };

  const deploymentPath = path.join(__dirname, '..', 'deployments', `ethereum-${network.name}.json`);
  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log('');
  console.log('💾 Deployment info saved to:', deploymentPath);

  // Generate verification command
  console.log('');
  console.log('🔍 Verification command:');
  console.log(`npx hardhat verify --network ${network.name} ${bridge.address}`);

  console.log('');
  console.log('✨ Deployment complete!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
