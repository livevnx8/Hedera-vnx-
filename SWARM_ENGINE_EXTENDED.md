# Extended Swarm Engine - 35 Specialists

**Date**: 2026-05-10

## VNX Swarm (20 specialists)

| Layer | Count | Description |
|-------|-------|-------------|
| **Domain** | 3 | HBAR, SAUCE, DOVU price prediction |
| **Concept** | 14 | Feature-level signal proxies |
| **Pattern** | 3 | Signal combination proxies |

## Hedera VNX Swarm (15 specialists)

| ID | Specialization | Detects |
|----|---------------|---------|
| `hcs_consensus_001` | HCS Topic Monitor | Message floods, stale topics |
| `hts_token_001` | HTS Token Monitor | Whale movements, supply changes |
| `network_health_001` | Network Health Monitor | Node outages, price anomalies |
| `staking_monitor_001` | Staking Monitor | Reward delays, concentration |
| `contract_monitor_001` | Contract Monitor | Event floods, failures |
| `tx_volume_001` | Transaction Volume Monitor | Volume spikes, congestion |
| `volatility_001` | Volatility Monitor | High/low volatility, clustering |
| `trend_001` | Trend Detector | Uptrend, downtrend, sideways |
| `momentum_001` | Momentum Tracker | Overbought, oversold, divergence |
| `sr_levels_001` | Support/Resistance Analyst | Breakouts, bounces, levels |
| `correlation_001` | Correlation Monitor | HBAR-BTC decoupling |
| `drawdown_001` | Drawdown Risk Assessor | Deep drawdowns, recovery |
| `regime_001` | Market Regime Detector | Bull, bear, accumulation |
| `sentiment_001` | Sentiment Analyzer | Extreme fear/greed |
| `liquidity_001` | Liquidity Depth Tracker | Spread spikes, depth |

## System Totals

| Metric | Value |
|--------|-------|
| **Python files** | 64 (all compile) |
| **API endpoints** | 47+ |
| **Total specialist types** | 31 |
| **VNX specialists** | 35 (20 + 15) |
| **Model compression** | 63x (247 KB → 3.9 KB) |

## Files

| File | Purpose |
|------|---------|
| `vnx_swarm_engine.py` | VNX swarm inference (20 specialists) |
| `hedera_vnx_specialists.py` | Base 6 Hedera micro-specialists |
| `hedera_vnx_specialists_extended.py` | +9 additional specialists (15 total) |
| `test_vnx_swarm.py` | VNX tests (6/6 PASS) |
| `test_hedera_vnx_specialists.py` | Hedera VNX tests (6/6 PASS) |

## Architecture

```
Prediction Server v3 (47+ endpoints)
├── Predictions (3 tokens)
├── Analytics
├── Graph Data
├── Feature Infrastructure
├── Governance (3 specialists)
├── Hedera Native (15+ features)
├── Agent Toolkit (4 agents)
├── VNX Swarm (20 specialists)
│   ├── Domain: HBAR, SAUCE, DOVU
│   ├── Concept: 14 features
│   └── Pattern: 3 combinations
└── Hedera VNX Swarm (15 specialists)
    ├── Infrastructure: HCS, HTS, Network, Staking, Contract, TX
    └── Market: Volatility, Trend, Momentum, S/R, Correlation, Drawdown, Regime, Sentiment, Liquidity
```

## Server Status

- ✅ **62 files compile** (all Python syntax valid)
- ✅ **v3 server imports** (47+ endpoints)
- ✅ **VNX swarm** (20 specialists loaded)
- ✅ **Hedera VNX swarm** (15 specialists loaded)
- ✅ **All tests pass**
