---
description: NFT minting, transfers, royalty tracking via HTS
---

# Setup NFT Automation

Automate NFT operations on Hedera Token Service.

## Create NFT Collection

```bash
curl -X POST http://localhost:8088/api/nft/collection/create \
  -d '{
    "name": "Vera Genesis",
    "symbol": "VERAG",
    "maxSupply": 10000,
    "royalties": [{"account": "0.0.XXXX", "numerator": 5, "denominator": 100}]
  }'
```

## Mint NFT

```bash
curl -X POST http://localhost:8088/api/nft/mint \
  -d '{
    "tokenId": "0.0.XXXX",
    "metadata": "ipfs://QmXXXX/1.json"
  }'
```

## Batch Mint

```bash
// turbo
cat > scripts/batch-mint.mjs << 'EOF'
import { veraClient } from '../src/client.js';

const TOKEN_ID = '0.0.XXXX';
const BATCH_SIZE = 10;
const TOTAL = 100;

for (let i = 0; i < TOTAL; i += BATCH_SIZE) {
  const batch = Array.from({length: BATCH_SIZE}, (_, j) => ({
    metadata: `ipfs://QmXXXX/${i + j + 1}.json`
  }));
  
  await veraClient.nftBatchMint(TOKEN_ID, batch);
  console.log(`Minted ${i + BATCH_SIZE}/${TOTAL}`);
}
EOF

node scripts/batch-mint.mjs
```

## Transfer NFT

```bash
curl -X POST http://localhost:8088/api/nft/transfer \
  -d '{"tokenId":"0.0.XXXX","serial":1,"to":"0.0.YYYY"}'
```

## Royalty Tracking

```bash
curl http://localhost:8088/api/nft/royalties/0.0.XXXX | jq '.{
  totalRoyalties: .sum,
  transactions: .count,
  lastPayment: .lastTx
}'
```

## Metadata Management

```bash
# Pin to IPFS via Pinata
cat > scripts/pin-metadata.mjs << 'EOF'
import fs from 'fs';
import pinataSDK from '@pinata/sdk';

const pinata = new pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET);

for (let i = 1; i <= 100; i++) {
  const metadata = {
    name: `Vera Genesis #${i}`,
    description: 'Flower of Life consciousness',
    image: `ipfs://QmImageHash/${i}.png`,
    attributes: [{trait_type: 'Layer', value: 'Genesis'}]
  };
  
  const result = await pinata.pinJSONToIPFS(metadata);
  console.log(`${i}: ${result.IpfsHash}`);
}
EOF
```

## Marketplace Integration

```bash
# List on HashAxis / SentX
curl -X POST http://localhost:8088/api/nft/marketplace/list \
  -d '{
    "marketplace": "hashaxis",
    "tokenId": "0.0.XXXX",
    "serial": 1,
    "price": 100,
    "currency": "HBAR"
  }'
```
