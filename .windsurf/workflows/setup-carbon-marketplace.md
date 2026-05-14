---
description: Full carbon credit marketplace (scale 7.298t → unlimited)
---

# Setup Carbon Marketplace

Scale Vera from 7.298 tonnes retired to full carbon marketplace.

## Market Structure

| Component | Role |
|-----------|------|
| Issuers | Mint carbon credits (HTS NFTs) |
| Verifiers | Validate offset claims with VCs |
| Buyers | Purchase via HBAR / stablecoins |
| Retirees | Burn credits on HCS topic `0.0.10416187` |

## Create Credit Collection

```bash
curl -X POST http://localhost:8088/api/carbon/collection/create \
  -d '{
    "name": "Vera Verified Carbon",
    "symbol": "VVC",
    "methodology": "VCS-VM0042",
    "vintage": 2026,
    "region": "Global",
    "tonnesPerCredit": 1
  }'
```

## Mint Credits (with verification)

```bash
curl -X POST http://localhost:8088/api/carbon/mint \
  -d '{
    "collectionId": "0.0.XXXX",
    "tonnes": 1000,
    "projectId": "PROJ-001",
    "verifierDid": "did:hedera:mainnet:...",
    "metadata": "ipfs://QmXXX/proj-001-verification.json"
  }'
```

## List for Sale

```bash
curl -X POST http://localhost:8088/api/carbon/market/list \
  -d '{
    "creditId": "0.0.XXXX-1",
    "price": 25,
    "currency": "USDC",
    "quantity": 100
  }'
```

## Buy & Retire

```bash
# Purchase
curl -X POST http://localhost:8088/api/carbon/market/buy \
  -d '{"listingId":"list-001","quantity":10}'

# Retire (burn on HCS)
curl -X POST http://localhost:8088/api/carbon/retire \
  -d '{
    "creditIds": ["0.0.XXXX-1", "0.0.XXXX-2"],
    "beneficiary": "Alice Corp",
    "purpose": "2026 Scope 1 emissions"
  }'
```

## Retirement Certificate

```bash
# Auto-generated after retirement
curl http://localhost:8088/api/carbon/certificate/CERT-001 | jq '.{
  beneficiary: .name,
  tonnes: .amount,
  hcsProof: .topicMessage,
  vcProof: .credential
}'
```

## Price Discovery

```bash
# Average market price
curl http://localhost:8088/api/carbon/market/price | jq '.{
  avg24h: .avgPrice,
  volume: .volume24h,
  topMethodologies: .topProjects
}'
```

## Analytics

```bash
curl http://localhost:8088/api/carbon/analytics | jq '.{
  totalRetired: .tonnesRetired,
  totalIssued: .tonnesIssued,
  activeProjects: .projectCount,
  buyers: .uniqueBuyers,
  marketCap: .totalValue
}'
```

## Registry Integration

Topic `0.0.10416187` is your public retirement ledger — Vera already has 7.298 tonnes retired. All new retirements append here for global transparency.
