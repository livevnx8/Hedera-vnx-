---
description: Hedera ↔ EVM cross-chain bridge operations
---

# Setup Cross-Chain Bridge

Bridge assets between Hedera and EVM chains (Ethereum, Polygon, Arbitrum).

## Supported Bridges

| Bridge | Chains | Tokens |
|--------|--------|--------|
| Hashport | Hedera ↔ Ethereum, Polygon, BNB | HBAR, USDC, HTS tokens |
| LayerZero | Multi-chain | Native + ERC20 |
| Wormhole | 30+ chains | SPL, ERC20, HTS |

## Configure

```bash
// turbo
cat >> .env << 'EOF'

HASHPORT_API=https://api.hashport.network
LAYERZERO_ENDPOINT=0xXXXX
WORMHOLE_CORE=0xXXXX
SUPPORTED_CHAINS=ethereum,polygon,arbitrum,bnb
EOF
```

## Bridge HBAR → ETH

```bash
curl -X POST http://localhost:8088/api/bridge/send \
  -d '{
    "bridge": "hashport",
    "fromChain": "hedera",
    "toChain": "ethereum",
    "token": "HBAR",
    "amount": "100",
    "destination": "0xXXXX"
  }'
```

## Monitor Transfer

```bash
# Poll until confirmed on destination
curl http://localhost:8088/api/bridge/status/TRANSFER_ID | jq .
```

## Bridge HTS Token → Polygon

```bash
curl -X POST http://localhost:8088/api/bridge/send \
  -d '{
    "bridge": "hashport",
    "fromChain": "hedera",
    "toChain": "polygon",
    "token": "0.0.XXXXX",
    "amount": "1000",
    "destination": "0xYYYY"
  }'
```

## Cross-Chain Message

```bash
# LayerZero message passing
curl -X POST http://localhost:8088/api/bridge/message \
  -d '{
    "bridge": "layerzero",
    "destChain": "arbitrum",
    "destContract": "0xZZZZ",
    "payload": "0xabcd..."
  }'
```

## Arbitrage Detection

```bash
// turbo
cat > scripts/cross-chain-arb.mjs << 'EOF'
import { veraClient } from '../src/client.js';

async function checkArb() {
  const chains = ['hedera', 'ethereum', 'polygon'];
  const prices = {};
  
  for (const chain of chains) {
    prices[chain] = await veraClient.getPrice('USDC', chain);
  }
  
  const sorted = Object.entries(prices).sort((a,b) => a[1] - b[1]);
  const spread = (sorted[sorted.length-1][1] - sorted[0][1]) / sorted[0][1] * 100;
  
  if (spread > 0.5) {
    console.log(`🎯 Arb: Buy on ${sorted[0][0]}, sell on ${sorted[sorted.length-1][0]} (${spread.toFixed(2)}%)`);
  }
}

setInterval(checkArb, 30000);
EOF
```
