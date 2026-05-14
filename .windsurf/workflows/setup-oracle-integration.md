---
description: Chainlink, Pyth, custom oracle feeds into lattice
---

# Setup Oracle Integration

Feed external price/data oracles into Vera lattice for AI consensus.

## Chainlink Integration

```bash
// turbo
cat >> .env << 'EOF'

# Oracle endpoints
CHAINLINK_HBAR_USD=0xXXXX
PYTH_ENDPOINT=https://hermes.pyth.network
CUSTOM_ORACLE_URL=https://oracle.vera.network
EOF
```

## Pyth Price Feeds

```bash
cat > scripts/pyth-oracle.mjs << 'EOF'
import fetch from 'node-fetch';

const FEEDS = {
  'HBAR/USD': '0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd',
  'ETH/USD': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'BTC/USD': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43'
};

async function fetchPrices() {
  const ids = Object.values(FEEDS).map(id => `ids[]=${id}`).join('&');
  const res = await fetch(`${process.env.PYTH_ENDPOINT}/api/latest_price_feeds?${ids}`);
  const prices = await res.json();
  
  prices.forEach(p => {
    const price = p.price.price * Math.pow(10, p.price.expo);
    console.log(`${p.id}: $${price.toFixed(4)}`);
  });
  
  return prices;
}

fetchPrices();
EOF

node scripts/pyth-oracle.mjs
```

## Custom Oracle → Lattice

```bash
// turbo
cat > scripts/oracle-to-lattice.mjs << 'EOF'
import fs from 'fs';
import fetch from 'node-fetch';

const LATTICE_ORACLE = '/mnt/vera-mirror-shards/vera-lattice/oracle-feeds';
fs.mkdirSync(LATTICE_ORACLE, { recursive: true });

async function syncOracle() {
  // Fetch all price feeds
  const prices = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph,bitcoin,ethereum&vs_currencies=usd').then(r => r.json());
  
  const shard = {
    timestamp: Date.now(),
    source: 'coingecko',
    prices,
    layer: 2
  };
  
  fs.writeFileSync(
    `${LATTICE_ORACLE}/feed-${Date.now()}.json`,
    JSON.stringify(shard, null, 2)
  );
  
  // Publish to HCS oracle topic
  await fetch('http://localhost:8088/api/hcs/publish', {
    method: 'POST',
    body: JSON.stringify({ topic: 'oracle', data: shard })
  });
  
  console.log('✅ Oracle synced to lattice & HCS');
}

setInterval(syncOracle, 60000);
syncOracle();
EOF

node scripts/oracle-to-lattice.mjs &
```

## Query Oracle

```bash
curl http://localhost:8088/api/oracle/price/HBAR-USD | jq .
curl http://localhost:8088/api/oracle/aggregate | jq .
```

## Consensus Across Sources

```bash
# Weighted median from multiple oracles
curl -X POST http://localhost:8088/api/oracle/consensus \
  -d '{"symbol":"HBAR-USD","sources":["pyth","chainlink","coingecko"]}'
```
