# Extended Hedera Features

**Date**: 2026-05-10

## New Features Added (15+ from Live Hedera Data)

### Mirror Node Data Sources

| Feature | API Endpoint | Description |
|---------|-------------|-------------|
| **Exchange Rate** | `/network/exchangerate` | HBAR/USD price |
| **Supply** | `/network/supply` | Total/released HBAR |
| **Transactions** | `/transactions` | Network tx volume by type |
| **Accounts** | `/accounts/{id}` | Staking info, rewards |
| **Nodes** | `/network/nodes` | Node count, health |
| **Blocks** | `/blocks` | Consensus rounds |
| **Tokens** | `/tokens/{id}` | HTS metadata |
| **Topics** | `/topics/{id}/messages` | HCS messages |
| **Contracts** | `/contracts/{id}/logs` | Smart contract events |
| **Schedules** | `/schedules` | Scheduled transactions |

### ML Features Extracted

| Feature | Value (Live) | Source |
|---------|-------------|--------|
| `hbar_price_usd` | **$0.0957** | Exchange rate |
| `network_tx_volume_proxy` | **1.0** | Tx count / 100 |
| `crypto_transfer_ratio` | **0.88** | % CRYPTO TRANSFER |
| `consensus_submit_ratio` | **0.11** | % HCS messages |
| `supply_released_ratio` | **0.867** | Released/Total |
| `fee_proxy` | **0.479** | Price-based |
| `staking_proxy` | **0.5** | Staking activity |
| `network_node_count_proxy` | **0.33** | Nodes / 30 |
| `consensus_round_proxy` | **1.0** | Block count |
| `hts_token_proxy` | **0.5** | Token activity |

## New API Endpoints (33 total)

| Endpoint | Data |
|----------|------|
| `GET /hedera/stats` | Network stats |
| `GET /hedera/features` | 14+ ML features |
| `GET /hedera/supply` | HBAR supply |
| `GET /hedera/staking/{account}` | Staking info |
| `GET /hedera/blocks` | Consensus blocks |
| `GET /hedera/token/{token_id}` | HTS metadata |
| `GET /hedera/topic/{topic_id}` | HCS messages |

## Architecture

```
Hedera Mirror Node (REST API)
    ├── Exchange Rate → hbar_price_usd
    ├── Supply → supply_released_ratio
    ├── Transactions → network_tx_volume_proxy
    ├── Accounts → staking_proxy
    ├── Nodes → network_node_count_proxy
    ├── Blocks → consensus_round_proxy
    ├── Tokens → hts_token_proxy
    └── Topics → consensus_submit_ratio
            ↓
    Python ML Model (14+ features)
            ↓
    /hedera/features endpoint
```

## Verified Test Results

| Test | Result |
|------|--------|
| Mirror Node Connection | ✅ 10 nodes |
| HBAR Price | ✅ $0.0957 |
| Supply | ✅ 4.3T released / 5T total |
| Features Extracted | ✅ 14 features |
| Server Compile | ✅ OK |

## Files

| File | Purpose |
|------|---------|
| `hedera_connector.py` | Mirror Node REST client |
| `prediction_server_v3.py` | 33 API endpoints |
