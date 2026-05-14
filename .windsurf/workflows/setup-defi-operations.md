---
description: DeFi operations via SaucerSwap, HeliSwap, yield farming
---

# Setup DeFi Operations

Automated DeFi: swaps, liquidity, yield farming on Hedera.

## Configure DEXes

```bash
// turbo
cat >> .env << 'EOF'

# DeFi contracts (mainnet)
SAUCERSWAP_ROUTER=0.0.3045981
SAUCERSWAP_FACTORY=0.0.1062784
HELISWAP_ROUTER=0.0.1331922
WHBAR_TOKEN=0.0.1456986
SAUCE_TOKEN=0.0.731861
EOF
```

## Token Swap

```bash
curl -X POST http://localhost:8088/api/defi/swap \
  -d '{
    "dex": "saucerswap",
    "fromToken": "HBAR",
    "toToken": "SAUCE",
    "amount": "10",
    "slippage": 0.5
  }'
```

## Add Liquidity

```bash
curl -X POST http://localhost:8088/api/defi/liquidity/add \
  -d '{
    "dex": "saucerswap",
    "tokenA": "HBAR",
    "tokenB": "SAUCE",
    "amountA": "100",
    "amountB": "250"
  }'
```

## Yield Farming

```bash
# Stake LP tokens
curl -X POST http://localhost:8088/api/defi/farm/stake \
  -d '{"pool":"HBAR-SAUCE","lpAmount":"50"}'

# Claim rewards
curl -X POST http://localhost:8088/api/defi/farm/harvest \
  -d '{"pool":"HBAR-SAUCE"}'
```

## Price Oracle

```bash
curl http://localhost:8088/api/defi/price/SAUCE | jq .
curl http://localhost:8088/api/defi/tvl | jq .
```

## Automated Strategy

```bash
// turbo
cat > scripts/defi-strategy.mjs << 'EOF'
// Dollar-cost average HBAR → SAUCE
import { veraClient } from '../src/client.js';

async function dca() {
  const hbarPrice = await veraClient.getPrice('HBAR');
  const saucePrice = await veraClient.getPrice('SAUCE');
  
  // Swap 10 HBAR daily
  await veraClient.swap({
    dex: 'saucerswap',
    fromToken: 'HBAR',
    toToken: 'SAUCE',
    amount: '10'
  });
  
  console.log(`✅ DCA executed: 10 HBAR @ $${hbarPrice} → SAUCE @ $${saucePrice}`);
}

dca();
EOF

# Schedule daily
(crontab -l; echo "0 12 * * * node /home/vera-live-0-1/hedera-llm-api/scripts/defi-strategy.mjs") | crontab -
```
