# VNX Latency Benchmark — Cross-Network Performance Report

**Date:** 2026-05-15  
**Version:** v3.1  
**Components Tested:** SQLite (WAL), Hiero Mirror Node REST API, HCS Verification, End-to-End Cycle  

---

## Executive Summary

| Metric | Testnet | Mainnet | Delta |
|--------|---------|---------|-------|
| **SQLite Write** | 10.377 ms | 4.877 ms | -52.9% faster on mainnet |
| **SQLite Query (last 10)** | 0.235 ms | 0.224 ms | Comparable |
| **Hiero Mirror Node Query** | 114.513 ms | 133.170 ms | +16.3% slower on mainnet |
| **HCS Verify by Hash** | 91.372 ms | 100.963 ms | +10.5% slower on mainnet |
| **End-to-End Cycle** | 109.847 ms | 113.371 ms | +3.2% slower on mainnet |
| **Average Latency** | 65.269 ms | 70.521 ms | +8.0% slower on mainnet |

---

## Test Methodology

All tests run via `benchmarks/vnx_latency_benchmark.py` using Python `time.perf_counter()` for microsecond precision.

### 1. SQLite Price Tick Write
```
INSERT OR REPLACE INTO price_ticks (timestamp, price, volume_24h, change_24h)
```
- Measures local disk write with WAL mode enabled
- Expected: < 20 ms (SSD baseline)

### 2. SQLite Prediction Query (Last 10)
```
SELECT * FROM fast_predictions ORDER BY timestamp DESC LIMIT 10
```
- Measures indexed read performance
- Expected: < 1 ms (hot cache)

### 3. Hiero Mirror Node Query
```
GET /api/v1/topics/{topicId}/messages?limit=1
```
- HTTP round-trip to Hiero mirror node REST API
- **Testnet:** `testnet.mirrornode.hedera.com`
- **Mainnet:** `mainnet-public.mirrornode.hedera.com` (with fallback to `mainnet.mirrornode.hedera.com`)
- Expected: 80–150 ms (geographic latency dependent)

### 4. HCS Verify by Hash
```python
verifier.verify_by_hash(proof_hash, topic_id)
```
- Searches last 50 messages for matching proof hash
- Includes HTTP fetch + base64 decode + JSON parse
- Expected: 80–120 ms

### 5. End-to-End Verify Cycle
```
DB read → compute SHA-256 → mirror node verification
```
- Simulates what `GET /fast/verify/{prediction_id}` does internally
- Expected: 100–150 ms

---

## Detailed Results

### Testnet (`testnet.mirrornode.hedera.com`)

| Test | Latency | Status | Notes |
|------|---------|--------|-------|
| sqlite_price_tick_write | **10.377 ms** | ✅ | WAL mode write |
| sqlite_prediction_query_last10 | **0.235 ms** | ✅ | Indexed read, hot cache |
| hiero_mirror_node_query | **114.513 ms** | ✅ | Topic empty but API responded |
| hiero_verify_by_hash | **91.372 ms** | ✅ | Correctly reported "not found" |
| end_to_end_verify_cycle | **109.847 ms** | ✅ | Full cycle completed |

### Mainnet (`mainnet-public.mirrornode.hedera.com`)

| Test | Latency | Status | Notes |
|------|---------|--------|-------|
| sqlite_price_tick_write | **4.877 ms** | ✅ | WAL mode write |
| sqlite_prediction_query_last10 | **0.224 ms** | ✅ | Indexed read, hot cache |
| hiero_mirror_node_query | **133.170 ms** | ✅ | Topic empty but API responded |
| hiero_verify_by_hash | **100.963 ms** | ✅ | Correctly reported "not found" |
| end_to_end_verify_cycle | **113.371 ms** | ✅ | Full cycle completed |

---

## Key Findings

### 1. SQLite Performance is Excellent
- **Writes:** 5–10 ms with WAL mode — suitable for 60-second tick intervals
- **Reads:** < 0.25 ms for indexed queries — effectively instant for dashboards
- **WAL mode** enables concurrent reads during writes without locking

### 2. Hiero Mirror Node Latency is Geographic
- Mainnet is ~16% slower than testnet due to:
  - More loaded mainnet mirror nodes
  - Potential geographic distance to mainnet servers
  - Higher request volume on mainnet infrastructure
- **Both are well within acceptable range** for verification use cases

### 3. HCS Verification is Lightweight
- **~100 ms** to verify a proof hash against on-chain data
- No SDK initialization overhead — pure HTTP REST
- Stateless: can be run from any environment without credentials

### 4. End-to-End Cycle is Sub-200ms
- Full path: DB read → hash compute → mirror query → parse response
- **~110 ms** total — fast enough for real-time dashboard updates

---

## Performance Budget

| Component | Budget | Actual (Mainnet) | Headroom |
|-----------|--------|------------------|----------|
| SQLite Write | < 20 ms | 4.877 ms | 75% ✅ |
| SQLite Read | < 1 ms | 0.224 ms | 78% ✅ |
| Mirror Node Query | < 200 ms | 133.170 ms | 33% ✅ |
| Verify by Hash | < 150 ms | 100.963 ms | 33% ✅ |
| End-to-End Cycle | < 200 ms | 113.371 ms | 43% ✅ |

---

## Recommendations

1. **SQLite is not a bottleneck** — WAL mode performance exceeds requirements by 3-4x
2. **Mirror node latency is acceptable** — 100–130 ms is fine for async verification
3. **For sub-50ms verification:** Run a local Hiero mirror node or cache recent messages
4. **Multi-node fallback is working** — mainnet has 2 mirror URLs configured for redundancy

---

## Raw Data Files

- `latency_data_testnet_20260515_005413.json`
- `latency_data_mainnet_20260515_005405.json`
- `latency_report_testnet_20260515_005413.md`
- `latency_report_mainnet_20260515_005405.md`

Run benchmarks yourself:
```bash
# Testnet (default)
python3 benchmarks/vnx_latency_benchmark.py

# Mainnet
HEDERA_NETWORK=mainnet python3 benchmarks/vnx_latency_benchmark.py
```

---

*Generated by benchmarks/vnx_latency_benchmark.py*  
*Hiero Mirror Node REST API v1 — Apache-2.0 Open Source*
