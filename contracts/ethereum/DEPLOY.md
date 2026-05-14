# VeraBridge Deployment Guide

## Quick Start

### 1. Install Dependencies

```bash
cd contracts/ethereum
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your keys and configuration
```

### 3. Compile Contracts

```bash
npm run compile
```

### 4. Deploy to Testnet

```bash
# Goerli
npm run deploy:goerli

# Sepolia  
npm run deploy:sepolia
```

### 5. Deploy to Mainnet

**⚠️ DANGER: This will use real funds!**

```bash
# Set CONFIRM_MAINNET_DEPLOYMENT=true in .env
npm run deploy:mainnet
```

## Deployment Scripts

### Ethereum Bridge Contract

Deploys the VeraBridge contract with tiered fee structure:
- Standard: 0.10%
- Partner: 0.08%
- Founding Member: 0.05%

```bash
npx hardhat run scripts/deploy-bridge.js --network <network>
```

### Supported Networks

| Network | Chain ID | Command |
|---------|----------|---------|
| Ethereum | 1 | `npm run deploy:mainnet` |
| Goerli | 5 | `npm run deploy:goerli` |
| Sepolia | 11155111 | `npm run deploy:sepolia` |
| Arbitrum | 42161 | `npm run deploy:arbitrum` |
| Optimism | 10 | `npm run deploy:optimism` |
| Base | 8453 | `npm run deploy:base` |
| Polygon | 137 | `npm run deploy:polygon` |
| BSC | 56 | `npm run deploy:bsc` |
| Avalanche | 43114 | `npm run deploy:avalanche` |

## Post-Deployment Steps

### 1. Verify Contract

```bash
npx hardhat verify --network <network> <contract-address>
```

### 2. Add Validators

Validators must stake 10,000 VERA tokens first:

```javascript
// As validator
await bridge.stake(ethers.utils.parseEther('10000'));

// As owner
await bridge.addValidator(validatorAddress);
```

### 3. Register Wrapped Tokens

```javascript
await bridge.registerWrappedToken('WHBAR', wrappedTokenAddress);
```

### 4. Add Founding Members

```javascript
await bridge.addFoundingMember(memberAddress);
```

### 5. Fund Bridge Liquidity

Transfer tokens to the bridge contract for outgoing transfers.

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run coverage

# Start local node
npm run node
```

## Contract Architecture

```
VeraBridge (Main Contract)
├── HTLC Management
│   ├── createHTLC()
│   ├── claimHTLC()
│   └── refundHTLC()
├── Validator Management
│   ├── addValidator()
│   ├── removeValidator()
│   └── stake()
├── Fee Management
│   ├── addFoundingMember()
│   ├── addPartner()
│   └── getEffectiveFee()
└── Token Registry
    └── registerWrappedToken()
```

## Security Checklist

Before mainnet deployment:

- [ ] Contracts audited by CertiK/Trail of Bits
- [ ] Multi-sig wallet set up for admin
- [ ] Validator keys secured in HSM
- [ ] Emergency pause functionality tested
- [ ] Bug bounty program launched
- [ ] Insurance coverage arranged

## Troubleshooting

### "Insufficient funds"

You need ETH for gas. Estimate:
- Testnet: 0.01 ETH
- Mainnet: 0.05 ETH

### "Invalid API key"

Get API keys from:
- Etherscan: https://etherscan.io/apis
- Infura: https://infura.io
- Alchemy: https://alchemy.com

### "Contract verification failed"

Wait 5-10 blocks after deployment before verifying.

## Support

- Discord: https://discord.gg/veralattice
- Email: dev@veralattice.com
- Docs: https://docs.veralattice.com
