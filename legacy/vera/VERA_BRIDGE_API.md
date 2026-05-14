# VeraBridge API Documentation

## Overview

VeraBridge is a **50-chain cross-chain bridge** that can be embedded on any website. You bring the users, we handle the bridging infrastructure.

**Base URL:** `https://api.veralattice.com/v1/bridge`

**Features:**
- 50+ supported chains (all major EVM and non-EVM)
- Embeddable widget (2 lines of code)
- JavaScript SDK for custom integrations
- REST API for backend systems
- Revenue sharing (up to 50% of fees)
- White-label branding
- HCS-attested transparency
- Falcon-512 post-quantum security

## Quick Start

### Option 1: Embeddable Widget (Easiest)

Add this to any HTML page:

```html
<div id="vera-bridge"></div>
<script src="https://veralattice.com/bridge-widget.js"></script>
<script>
  VeraBridge.init({
    container: '#vera-bridge',
    apiKey: 'your-api-key',
    partnerId: 'your-partner-id'
  });
</script>
```

### Option 2: JavaScript SDK

```bash
npm install @veralattice/bridge-sdk
```

```javascript
import { VeraBridge } from '@veralattice/bridge-sdk';

const bridge = new VeraBridge({
  apiKey: 'your-api-key',
  partnerId: 'your-partner-id'
});

await bridge.connectWallet();
await bridge.bridge({
  fromChain: 'ethereum',
  toChain: 'hedera',
  amount: '1.5',
  token: 'ETH'
});
```

### Option 3: REST API

```bash
curl -X POST https://api.veralattice.com/v1/bridge/initiate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "sourceChain": "ethereum",
    "targetChain": "hedera",
    "amount": "1.5",
    "sender": "0x...",
    "recipient": "0.0.12345",
    "token": "ETH"
  }'
```

## Authentication

All requests require an API key in the header:

```
X-API-Key: your-api-key
```

**Get an API key:** [https://veralattice.com/partners](https://veralattice.com/partners)

## Supported Chains (50 Total)

### EVM Chains (35)
| Chain | ID | Type | TVL |
|-------|-----|------|-----|
| Ethereum | 1 | EVM | $50B+ |
| BNB Chain | 56 | EVM | $5B+ |
| Polygon | 137 | EVM | $2B+ |
| Arbitrum | 42161 | EVM | $15B+ |
| Optimism | 10 | EVM | $8B+ |
| Base | 8453 | EVM | $3B+ |
| Avalanche | 43114 | EVM | $1B+ |
| Fantom | 250 | EVM | $500M+ |
| Cronos | 25 | EVM | $400M+ |
| Gnosis | 100 | EVM | $200M+ |
| Klaytn | 8217 | EVM | $150M+ |
| Celo | 42220 | EVM | $100M+ |
| Moonbeam | 1284 | EVM | $80M+ |
| Moonriver | 1285 | EVM | $30M+ |
| Aurora | 1313161554 | EVM | $50M+ |
| Harmony | 1666600000 | EVM | $40M+ |
| Boba | 288 | EVM | $60M+ |
| Metis | 1088 | EVM | $70M+ |
| zkSync | 324 | zkEVM | $1B+ |
| StarkNet | starknet | zkRollup | $500M+ |
| Scroll | 534352 | EVM | $200M+ |
| Linea | 59144 | EVM | $150M+ |
| Mantle | 5000 | EVM | $100M+ |
| Manta | 169 | EVM | $80M+ |
| Blast | 81457 | EVM | $1B+ |
| Mode | 34443 | EVM | $200M+ |
| Fraxtal | 252 | EVM | $100M+ |
| Redstone | 690 | EVM | $50M+ |
| Cyber | 7560 | EVM | $30M+ |
| Sei | 1329 | EVM+ | $200M+ |
| Plus 5 more... |

### Non-EVM Chains (15)
| Chain | Type | TVL |
|-------|------|-----|
| Solana | Solana | $4B+ |
| Sui | Move | $800M+ |
| Aptos | Move | $400M+ |
| Cosmos | Cosmos SDK | $300M+ |
| Osmosis | Cosmos SDK | $200M+ |
| NEAR | NEAR | $150M+ |
| Algorand | Algorand | $100M+ |
| Cardano | UTXO | $200M+ |
| Hedera | Hashgraph | $1B+ |
| Injective | Cosmos+EVM | $300M+ |
| Polkadot | Substrate | $500M+ |
| Kusama | Substrate | $100M+ |
| TRON | TVM | $6B+ |
| Tezos | Michelson | $50M+ |
| Stellar | Stellar | $100M+ |

## API Endpoints

### 1. Get Supported Routes

```http
GET /routes
```

**Response:**
```json
{
  "routes": [
    {
      "sourceChain": "ethereum",
      "targetChain": "hedera",
      "supportedTokens": ["ETH", "USDC", "USDT", "WBTC"],
      "estimatedTime": 120,
      "bridgeFee": 0.0025,
      "minAmount": "0.001",
      "maxAmount": "1000000"
    }
  ]
}
```

### 2. Get Quote

```http
POST /quote
```

**Request:**
```json
{
  "sourceChain": "ethereum",
  "targetChain": "hedera",
  "amount": "1.5",
  "token": "ETH"
}
```

**Response:**
```json
{
  "quote": {
    "sourceAmount": "1.5",
    "bridgeFee": "0.00375",
    "networkFee": "0.001",
    "targetAmount": "1.49525",
    "targetToken": "WHBAR",
    "exchangeRate": "200",
    "estimatedTime": 180,
    "validUntil": "2026-01-15T10:30:00Z"
  }
}
```

### 3. Initiate Bridge

```http
POST /initiate
```

**Request:**
```json
{
  "sourceChain": "ethereum",
  "targetChain": "hedera",
  "amount": "1.5",
  "token": "ETH",
  "sender": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "recipient": "0.0.12345",
  "partnerId": "your-partner-id",
  "webhookUrl": "https://your-site.com/webhook"
}
```

**Response:**
```json
{
  "bridgeId": "bridge_abc123",
  "htlcId": "0x7f8d9e...",
  "status": "pending",
  "sourceTx": "0x3a4b5c...",
  "estimatedCompletion": "2026-01-15T10:32:00Z",
  "hcsAttestation": "https://hashscan.io/mainnet/topic/0.0.10417507"
}
```

### 4. Get Bridge Status

```http
GET /status/:bridgeId
```

**Response:**
```json
{
  "bridgeId": "bridge_abc123",
  "status": "confirmed",
  "progress": 100,
  "sourceTx": "0x3a4b5c...",
  "targetTx": "0.0.12345@1234567890.123456789",
  "signatures": 5,
  "completedAt": "2026-01-15T10:31:45Z"
}
```

### 5. Get Transaction History

```http
GET /history
```

**Query Parameters:**
- `address` (required): User address
- `chain` (optional): Filter by chain
- `limit` (optional): Results per page (default: 20)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "transactions": [
    {
      "bridgeId": "bridge_abc123",
      "sourceChain": "ethereum",
      "targetChain": "hedera",
      "amount": "1.5",
      "token": "ETH",
      "status": "completed",
      "timestamp": "2026-01-15T10:31:45Z"
    }
  ],
  "total": 150,
  "hasMore": true
}
```

### 6. Validate Address

```http
POST /validate-address
```

**Request:**
```json
{
  "chain": "hedera",
  "address": "0.0.12345"
}
```

**Response:**
```json
{
  "valid": true,
  "normalized": "0.0.12345"
}
```

## Widget Configuration

### Basic Setup

```javascript
VeraBridge.init({
  // Required
  container: '#vera-bridge',
  apiKey: 'your-api-key',
  partnerId: 'your-partner-id',
  
  // Optional - Appearance
  theme: 'dark', // 'dark' | 'light'
  primaryColor: '#667eea',
  maxHeight: '600px',
  
  // Optional - Chains
  chains: ['ethereum', 'bsc', 'polygon', 'solana', 'hedera'],
  defaultFromChain: 'ethereum',
  defaultToChain: 'hedera',
  
  // Optional - Tokens
  tokens: ['ETH', 'USDC', 'USDT', 'WBTC', 'SOL', 'HBAR'],
  
  // Optional - Callbacks
  onBridgeInitiated: (result) => console.log('Bridge started:', result),
  onBridgeComplete: (result) => console.log('Bridge done:', result),
  onError: (error) => console.error('Bridge error:', error),
});
```

### White-Label Branding

```javascript
VeraBridge.init({
  container: '#vera-bridge',
  apiKey: 'your-api-key',
  partnerId: 'your-partner-id',
  
  // White-label options
  customBranding: {
    logo: 'https://your-site.com/logo.png',
    primaryColor: '#FF6B35',
    companyName: 'YourCompany Bridge'
  },
  
  // Hide Vera branding
  hidePoweredBy: false, // Set to true to remove "Powered by Vera"
});
```

## JavaScript SDK

### Installation

```bash
npm install @veralattice/bridge-sdk
# or
yarn add @veralattice/bridge-sdk
```

### Usage

```javascript
import { VeraBridge } from '@veralattice/bridge-sdk';

const bridge = new VeraBridge({
  apiKey: 'your-api-key',
  partnerId: 'your-partner-id',
  environment: 'production' // 'production' | 'sandbox'
});

// Connect wallet
await bridge.connectWallet('metamask'); // 'metamask' | 'walletconnect' | 'phantom'

// Get quote
const quote = await bridge.getQuote({
  fromChain: 'ethereum',
  toChain: 'hedera',
  amount: '1.5',
  token: 'ETH'
});

console.log('You will receive:', quote.targetAmount, 'WHBAR');

// Execute bridge
const result = await bridge.bridge({
  fromChain: 'ethereum',
  toChain: 'hedera',
  amount: '1.5',
  token: 'ETH',
  recipient: '0.0.12345'
});

// Poll for completion
const status = await bridge.waitForCompletion(result.bridgeId, {
  onProgress: (progress) => console.log(`${progress}% complete`),
  timeout: 300000 // 5 minutes
});

console.log('Bridge completed!');
```

### SDK Methods

#### `connectWallet(provider)`
Connects a wallet provider.

**Parameters:**
- `provider`: 'metamask' | 'walletconnect' | 'phantom' | 'solflare'

#### `getQuote(params)`
Gets a bridge quote.

**Parameters:**
- `fromChain`: Source chain
- `toChain`: Target chain
- `amount`: Amount to bridge
- `token`: Token symbol

#### `bridge(params)`
Initiates a bridge transaction.

**Returns:**
- `bridgeId`: Unique bridge identifier
- `status`: Current status
- `sourceTx`: Source chain transaction hash

#### `getStatus(bridgeId)`
Gets current bridge status.

#### `waitForCompletion(bridgeId, options)`
Polls until bridge completes or fails.

#### `getHistory(address, options)`
Gets transaction history for an address.

#### `disconnect()`
Disconnects wallet and cleans up.

## Fees & Revenue Share

### Standard Fees

| Volume Tier | Fee |
|-------------|-----|
| Standard | 0.25% |
| $10K+ monthly | 0.20% |
| $100K+ monthly | 0.15% |
| $1M+ monthly | 0.10% |

### Revenue Share for Partners

| Monthly Volume | Your Share |
|----------------|------------|
| <$100K | 30% |
| $100K - $1M | 40% |
| $1M+ | 50% |

**Example:**
- Your users bridge $500K in a month
- Total fees: $500K × 0.25% = $1,250
- Your revenue (40% tier): $500

## Webhooks

Receive real-time updates:

```javascript
// Configure webhook URL in dashboard
// Or per-request:

const result = await bridge.bridge({
  fromChain: 'ethereum',
  toChain: 'hedera',
  amount: '1.5',
  webhookUrl: 'https://your-site.com/webhook'
});
```

**Webhook Payload:**
```json
{
  "event": "bridge.completed",
  "bridgeId": "bridge_abc123",
  "partnerId": "your-partner-id",
  "data": {
    "sourceChain": "ethereum",
    "targetChain": "hedera",
    "amount": "1.5",
    "status": "completed",
    "completedAt": "2026-01-15T10:31:45Z"
  },
  "signature": "0x..." // HMAC signature for verification
}
```

## Security

### Falcon-512 Signatures
Every bridge transaction is signed with NIST-standardized post-quantum cryptography.

### HCS Attestation
All bridge operations are logged to Hedera Consensus Service (Topic 0.0.10417507) for complete transparency.

### Multi-Sig Validation
3-of-5 validator consensus required for all transfers >$10K.

### HTLC Atomic Swaps
Non-custodial transfers with 24-hour expiry window.

## Rate Limits

| Plan | Requests/Min | Max Transfer |
|------|------------|--------------|
| Free | 60 | $1,000 |
| Pro ($99/mo) | 600 | $100,000 |
| Enterprise | 6,000 | Unlimited |

## Support

- **Documentation:** [docs.veralattice.com](https://docs.veralattice.com)
- **Discord:** [discord.gg/veralattice](https://discord.gg/veralattice)
- **Email:** partners@veralattice.com
- **Status:** [status.veralattice.com](https://status.veralattice.com)

## Examples

### React Integration

```jsx
import { useEffect, useRef } from 'react';

function BridgeWidget() {
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (window.VeraBridge) {
      window.VeraBridge.init({
        container: containerRef.current,
        apiKey: process.env.REACT_APP_VERA_API_KEY,
        partnerId: 'acme-corp',
        theme: 'dark'
      });
    }
  }, []);
  
  return <div ref={containerRef} style={{ maxWidth: '480px' }} />;
}
```

### Vue Integration

```vue
<template>
  <div ref="bridgeContainer" />
</template>

<script>
export default {
  mounted() {
    window.VeraBridge.init({
      container: this.$refs.bridgeContainer,
      apiKey: 'your-api-key',
      partnerId: 'acme-corp'
    });
  }
}
</script>
```

### WordPress Integration

Add to your theme's footer:

```php
<div id="vera-bridge"></div>
<script src="https://veralattice.com/bridge-widget.js"></script>
<script>
  VeraBridge.init({
    container: '#vera-bridge',
    apiKey: '<?php echo get_option('vera_api_key'); ?>',
    partnerId: 'wordpress-site'
  });
</script>
```

---

**Ready to integrate?** Get your API key at [veralattice.com/partners](https://veralattice.com/partners)
