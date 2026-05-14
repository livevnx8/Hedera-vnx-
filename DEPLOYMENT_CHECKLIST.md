# Hedera Prediction Market - Production Deployment Checklist

## Pre-Deployment Verification

- [x] All 3 token models loaded (HBAR 80%, SAUCE 68.1%, DOVU 100%)
- [x] Price history pre-seeded from corpus files
- [x] SQLite cache directory exists (`cache/prices.db`)
- [x] Log directory exists (`logs/server.log`)
- [x] Circuit breaker: CLOSED
- [x] Load test passed (0.47% error rate under 100 concurrent requests)

## Deployment Steps

### 1. Start Prediction Server
```bash
cd /home/vera-live-0-1/hedera-llm-api
python3 prediction_server_production.py
```
Verify:
- `curl http://localhost:8000/health` returns `status: healthy`
- `curl http://localhost:8000/metrics` shows error_rate < 0.01

### 2. Test Predictions
```bash
curl http://localhost:8000/predict/hbar
curl http://localhost:8000/predict/sauce
curl http://localhost:8000/predict/dovu
```
Expected: JSON with direction, probability, confidence

### 3. Deploy Smart Contract (Hedera Testnet)
```bash
# Using Hedera SDK or hardhat
# Contract: contracts/PredictionMarket.sol
# Constructor: oracle_address (your oracle wallet)
```

### 4. Configure Oracle
```bash
# Set environment variables
export HEDERA_OPERATOR_ID=0.0.xxx
export HEDERA_OPERATOR_KEY=0x...
export PREDICTION_SERVER=http://localhost:8000

# Run oracle
python3 oracle/resolve_markets.py --all --dry-run  # Test first
python3 oracle/resolve_markets.py --all             # Production
```

### 5. Monitoring
```bash
# Watch logs
tail -f logs/server.log

# Check health every minute
curl http://localhost:8000/health

# Metrics for Prometheus
curl http://localhost:8000/metrics
```

## Production Settings

| Setting | Value | Reason |
|---------|-------|--------|
| Port | 8000 | Default FastAPI |
| Cache TTL | 3600s (1h) | Reduce CoinGecko API calls |
| Circuit breaker threshold | 3 failures | Avoid hammering failing API |
| Circuit breaker recovery | 300s (5min) | Allow API to recover |
| Retry attempts | 3 | Exponential backoff |
| Retry delays | 1s, 2s, 4s | Exponential backoff |
| Max price history | 200 points | ~8 days of hourly data |
| SQLite cache | `cache/prices.db` | Persist across restarts |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Unknown token" | Token not in `CG_IDS` mapping — add to `prediction_server_production.py` |
| "Insufficient price history" | Wait for 50+ price updates, or pre-seed from corpus |
| "Circuit breaker OPEN" | CoinGecko is down — wait 5min or check API status |
| High error rate (>5%) | Check `logs/server.log` for specific errors |
| Slow inference (>10ms) | Check GPU availability — falls back to CPU |

## Files

| File | Purpose |
|------|---------|
| `prediction_server_production.py` | Main server |
| `load_test.py` | Verify under pressure |
| `oracle/resolve_markets.py` | Automated resolution |
| `contracts/PredictionMarket.sol` | Smart contract |
| `logs/server.log` | Server logs |
| `cache/prices.db` | Price cache |
