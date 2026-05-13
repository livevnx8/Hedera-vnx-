# Vera OS

![Vera OS architecture](docs/visuals/vnx-architecture-diagram-png.png)

**Verifiable prediction infrastructure for Hedera-native AI agents.**

Vera OS is a production-grade system that combines a live token prediction engine, a 27-agent Hedera specialist swarm, a novel ternary-weight BitLattice model architecture, and a full observability stack into a single deployable package. Every prediction is cryptographically anchored to Hedera Consensus Service (HCS), making outputs independently verifiable.

---

## Quick Start

```bash
git clone https://github.com/livevnx8/Hedera-vnx-.git
cd Hedera-vnx-
bash quickstart.sh        # creates venv, installs, verifies — one command
```

Or step by step:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[production]"
make verify               # runs all 3 validation suites
```

**Try it immediately:**

```bash
make predict              # run a sample HBAR prediction
make visuals              # list 11 professional visual assets
make swarm                # inspect all 27 Hedera specialist agents
make infra-up             # start full Docker stack (13 services)
```

---

## Prediction Infrastructure

![Performance comparison](docs/visuals/vnx-performance-comparison-png.png)

The prediction engine is a **live, tested system** — not a prototype. It loads trained models, computes features from real-time price data, and returns directional forecasts with confidence scoring.

### What It Does

| Capability | Details |
| --- | --- |
| **Token models** | HBAR (80% accuracy, 60-point history), SAUCE (68.1%, 60-point), DOVU (100%, 40-point) |
| **Feature engineering** | Price momentum, volume change, volatility, RSI proxy, moving average crossovers, Bollinger bands |
| **Confidence scoring** | Multi-factor confidence from model certainty, feature quality, and historical accuracy |
| **Token health** | Real-time model health checks: staleness detection, accuracy degradation, data quality |
| **Inference speed** | < 300ms target latency per prediction |
| **Memory footprint** | < 500MB per model in production |

### How It Works

```python
from vera_os import PredictionService

service = PredictionService()

# Available tokens with live models
print(service.available_tokens())  # ['sauce', 'hbar', 'dovu']

# Compute features from a price snapshot
features = service.features_from_price("hbar", {
    "timestamp": 1715500000,
    "price": 0.09,
    "change_24h": 0.8,
    "volume_24h": 75_000_000,
})

# Get a prediction
result = service.predict("hbar", features)
# → { direction: "up", confidence: 0.82, token: "hbar", features_used: 12, ... }
```

### Architecture

```
Price Feed → Feature Engine → Model Inference → Confidence Filter → API Response
                                    ↓
                          HCS Proof Anchoring (SHA-256 → Merkle Root → HCS Topic)
```

- **Model loading**: hot-reload from disk with accuracy metadata
- **Feature pipeline**: 12+ engineered features per prediction
- **Proof chain**: every prediction hashed and anchored to HCS for auditability
- **Circuit breaker**: automatic fallback when upstream services degrade
- **Tiered caching**: L1 in-memory (1000 keys, sub-ms) + L2 Redis (distributed, TTL-based)

### Resilience Layer

| Component | What It Does |
| --- | --- |
| `CircuitBreaker` | 3-state (closed/open/half-open) with configurable thresholds, exponential backoff |
| `TieredCache` | L1 LRU (in-process) + L2 Redis with pattern invalidation and hit-rate stats |
| `DeepHealthCheck` | Recursive dependency checks: DB, Redis, model files, disk, memory |
| `RetryWithBackoff` | Configurable retry decorator with jitter for transient failures |

---

## Hedera Specialist Agents

![Verifiability diagram](docs/visuals/vnx-verifiability-diagram-png.png)

The `HederaSpecialistSwarm` is a **27-agent micro-specialist system** that monitors the Hedera network across 5 domains. Each specialist runs independently, produces typed alerts, and contributes to a composite confidence signal.

### Full Agent Roster

#### Hedera Infrastructure (6 agents)

| Agent | ID | Purpose |
| --- | --- | --- |
| HCS Topic Monitor | `hcs_consensus_001` | Track consensus message throughput, topic creation rate, sequence gaps |
| HTS Token Monitor | `hts_token_001` | Monitor token mints, burns, transfers, supply changes across HTS |
| Network Health Monitor | `network_health_001` | Node uptime, TPS, finality time, gossip health |
| Staking Monitor | `staking_monitor_001` | Stake distribution, reward rates, validator changes |
| Contract Monitor | `contract_monitor_001` | Smart contract deployments, calls, gas usage, reverts |
| Transaction Volume Monitor | `tx_volume_001` | Real-time transaction count, fee burn rate, network congestion |

#### Market Intelligence (9 agents)

| Agent | ID | Purpose |
| --- | --- | --- |
| Volatility Monitor | `volatility_001` | Realized and implied volatility, VIX-like indicator for HBAR |
| Trend Detector | `trend_001` | Multi-timeframe trend identification (1h, 4h, 1d, 1w) |
| Momentum Tracker | `momentum_001` | RSI, MACD, Stochastic RSI, rate-of-change signals |
| Support/Resistance Analyst | `sr_levels_001` | Dynamic S/R levels from order book and historical price action |
| Correlation Monitor | `correlation_001` | Cross-asset correlation: HBAR vs BTC, ETH, SOL, macro indices |
| Drawdown Risk Assessor | `drawdown_001` | Maximum drawdown probability, value-at-risk estimation |
| Market Regime Detector | `regime_001` | Classify current regime: trending, ranging, volatile, capitulation |
| Sentiment Analyzer | `sentiment_001` | Social signal aggregation, fear/greed scoring |
| Liquidity Depth Tracker | `liquidity_001` | Order book depth, bid-ask spread, slippage estimation |

#### Security and Risk (5 agents)

| Agent | ID | Purpose |
| --- | --- | --- |
| Whale Activity Monitor | `whale_watch_001` | Large transfer detection, wallet clustering, accumulation patterns |
| Flash Loan Detector | `flash_loan_001` | Detect flash-loan-style attacks and abnormal borrowing patterns |
| Reentrancy Attack Guard | `reentrancy_001` | Monitor contract interactions for reentrancy vulnerability exploitation |
| Statistical Anomaly Detector | `anomaly_001` | Z-score and isolation forest anomaly detection on all metrics |
| Rug Pull Predictor | `rugpull_001` | Liquidity withdrawal patterns, developer wallet behavior, red flags |

#### Governance and Economics (4 agents)

| Agent | ID | Purpose |
| --- | --- | --- |
| Governance Proposal Tracker | `proposal_001` | Track HIPs, voting status, council decisions |
| Treasury Flow Monitor | `treasury_001` | Hedera treasury outflows, grant disbursements, burn events |
| HBAR Inflation Tracker | `inflation_001` | Supply schedule adherence, emission rate vs plan |
| Staking Yield Monitor | `yield_001` | APY tracking, reward distribution timing, compounding analysis |

#### Cross-Chain (3 agents)

| Agent | ID | Purpose |
| --- | --- | --- |
| Fee Market Optimizer | `gas_001` | Optimal fee bidding for transaction inclusion |
| Cross-Chain Bridge Monitor | `bridge_001` | Bridge TVL, flow direction, latency, exploit risk scoring |
| Wrapped Asset Tracker | `wrapped_001` | Peg stability, reserve auditing, redemption delays |

### Swarm Usage

```python
from vera_os import HederaSpecialistSwarm

swarm = HederaSpecialistSwarm()

# Status overview
status = swarm.status()
print(status["total_specialists"])  # 27
print(status["status"])             # "ready"

# Run all specialists (produces alerts and composite signal)
result = swarm.run()
print(result["total_alerts"])
print(result["composite_confidence"])
```

---

## BitLattice Architecture

![BitLattice architecture](docs/visuals/vnx-bitlattice-architecture-png.png)

BitLattice is a **novel ternary-weight neural network** designed for extreme edge deployment. Weights are constrained to {-1, 0, +1}, enabling:

| Property | Value |
| --- | --- |
| **Model size** | < 5 KB (vs 1GB+ for standard models) |
| **Compression ratio** | 200,000x vs GPT-class models |
| **Bit packing** | 5 ternary weights per byte |
| **Inference** | Pure integer arithmetic — no GPU required |
| **Routing** | Dodecahedral lattice topology (20-vertex graph) |

### Key Components

| Module | File | Purpose |
| --- | --- | --- |
| BitLattice Model | `src/starlit/bitlattice_model.py` | Core ternary model with lattice routing |
| PyTorch BitLattice | `src/starlit/bitlattice_model_pytorch.py` | GPU-accelerated training with STE gradients |
| CUDA Lattice Routing | `src/starlit/lattice_routing_cuda.py` | Custom CUDA kernels for lattice traversal |
| Ternary QAT | `src/starlit/ternary_qat.py` | Quantization-aware training pipeline |
| Learning Retention | `src/starlit/learning_retention.py` | Catastrophic forgetting prevention |
| Artifact Format | `src/starlit/artifact_format.py` | Compact serialization for ternary models |

### Why It Matters

Traditional models need cloud GPUs for inference. BitLattice runs predictions **locally on any device** — phone, Raspberry Pi, browser — with no API calls, no latency, and no data leaving the device. Combined with HCS proof anchoring, this means verifiable AI that runs anywhere.

---

## Production Infrastructure

### Docker Stack (13 services)

```bash
make infra-up    # launches everything
```

| Service | Port | Role |
| --- | --- | --- |
| **vera-app** | 8080 | FastAPI prediction server |
| **qvx-server** | 5101 | GPU inference node (NVIDIA) |
| **PostgreSQL** | 5432 | Persistent state, model metadata |
| **Redis** | 6379 | Tiered cache, pub/sub |
| **Prometheus** | 9090 | Metrics collection (20 custom metrics) |
| **Grafana** | 3000 | Dashboards (pre-provisioned) |
| **Loki** | 3100 | Log aggregation |
| **Promtail** | — | Log shipping |
| **Jaeger** | 16686 | Distributed tracing |
| **Alertmanager** | 9093 | Alert routing (11 rules) |
| **Node Exporter** | 9100 | Host metrics |
| **Redis Exporter** | 9121 | Redis metrics |
| **Traefik** | 80/443 | Reverse proxy + TLS |

### Database

PostgreSQL with Alembic migrations:

```bash
alembic upgrade head    # apply schema
alembic revision -m "add_new_table" --autogenerate
```

Schema includes: predictions, model_metadata, specialist_alerts, proof_anchors, feature_snapshots.

### Observability

- **20 Prometheus metrics**: prediction latency, model accuracy, cache hit rates, specialist health, API throughput
- **11 alert rules**: high latency, model degradation, specialist failures, disk/memory pressure, proof anchoring failures
- **Grafana dashboards**: pre-provisioned VNX Swarm dashboard with all metrics
- **Loki**: structured logs from all services
- **Jaeger**: end-to-end request tracing

---

## API Surface

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/predict/{token}` | GET | Run a token prediction with live features |
| `/tokens` | GET | List loaded token models with accuracy metadata |
| `/health` | GET | Deep health check (DB, Redis, models, disk) |
| `/metrics` | GET | Prometheus metrics endpoint |
| `/analytics/market` | GET | Market-wide analytics and regime |
| `/analytics/{token}` | GET | Per-token performance analytics |
| `/graph/*` | GET | Chart data and historical predictions |
| `/features/*` | GET | Feature importance, drift detection, engineering data |
| `/governance/*` | GET | Model governance and validation |
| `/hedera/*` | GET | Hedera toolkit: topics, tokens, accounts |
| `/hedera-swarm/*` | GET | Specialist swarm: status, execution, alerts |

---

## Python Facade

The public `vera_os` package gives developers stable import points without needing to understand the internal layout.

```python
from vera_os import (
    PredictionService,       # Token predictions with confidence scoring
    HederaSpecialistSwarm,   # 27-agent Hedera monitoring swarm
    HealthService,           # Deep health checks
    VisualAsset,             # Visual asset dataclass
    get_visual_assets,       # Get all 11 visual assets
    get_visual_asset_pairs,  # Get PNG/SVG pairs
)
```

---

## Visual Assets

11 professional-grade visuals in both PNG and SVG formats:

| Visual | Description |
| --- | --- |
| ![Architecture](docs/visuals/vnx-architecture-diagram-png.png) | System architecture overview |
| ![Performance](docs/visuals/vnx-performance-comparison-png.png) | Benchmark comparison vs alternatives |
| ![Accuracy](docs/visuals/vnx-accuracy-metrics-png.png) | Model accuracy across tokens |
| ![BitLattice](docs/visuals/vnx-bitlattice-architecture-png.png) | Ternary lattice network topology |
| ![Competitive](docs/visuals/vnx-competitive-advantage-grid-png.png) | 6 competitive advantages |
| ![Model Size](docs/visuals/vnx-model-size-comparison-png.png) | 200,000x size reduction |
| ![Scalability](docs/visuals/vnx-scalability-visualization-png.png) | Throughput scaling |
| ![Verifiability](docs/visuals/vnx-verifiability-diagram-png.png) | HCS proof chain flow |
| ![Sustainability](docs/visuals/vnx-sustainability-infographic-png.png) | Energy efficiency metrics |
| ![Timeline](docs/visuals/vnx-research-timeline-png.png) | Research milestones |
| ![Edge Perf](docs/visuals/vnx-edge-performance-dashboard-png.png) | Edge deployment targets |

All available at `docs/visuals/` as `*-png.png` and `*-svg.svg`.

---

## Repository Map

```
vera_os/                    → Public Python facade (pip install -e .)
  __init__.py               → Exports: PredictionService, HederaSpecialistSwarm, ...
  prediction.py             → PredictionService wrapper
  specialists.py            → HederaSpecialistSwarm wrapper
  health.py                 → HealthService wrapper
  visuals.py                → Visual asset catalog

src/starlit/                → BitLattice ternary model system
  bitlattice_model.py       → Core ternary-weight lattice model
  bitlattice_model_pytorch.py → GPU training with STE
  lattice_routing_cuda.py   → CUDA kernels for lattice traversal
  ternary_qat.py            → Quantization-aware training
  learning_retention.py     → Anti-forgetting mechanisms
  artifact_format.py        → Compact model serialization

src/cache/                  → Tiered caching (L1 memory + L2 Redis)
src/health/                 → Deep health checks
src/resilience/             → Circuit breaker, retry, backoff
src/metrics/                → Prometheus metrics collection

hedera_vnx_specialists.py         → Base specialist swarm (9 agents)
hedera_vnx_specialists_advanced.py → Advanced specialists (9 agents)
hedera_vnx_specialists_extended.py → Extended specialists (9 agents)
hedera_connector.py                → Hedera SDK integration layer
hedera_agent_toolkit.py            → Agent toolkit for HCS/HTS operations

prediction_server_v3.py            → FastAPI application (all endpoints)
prediction_server_production.py    → Production server with full middleware

monitoring/                 → Prometheus, Grafana, Loki, Promtail, alerts
infrastructure/postgres/    → SQL schema initialization
alembic/                    → Database migrations
docker-compose.yml          → Full 13-service stack
docker-compose.production.yml → Production variant
docker-compose.monitoring.yml → Monitoring-only stack

examples/                   → Ready-to-run Python examples
tests/                      → Validation suites (3 validators)
docs/visuals/               → 11 PNG + 11 SVG visual assets
```

---

## Validation

```bash
make verify    # runs all three
```

| Validator | Checks |
| --- | --- |
| `validate_vera_os_release.py` | Imports, exports, examples, docs, README links, visual integrity |
| `validate_infrastructure.py` | Compose files, monitoring configs, alerts, migrations, wiring |
| `smoke_test.py` | End-to-end: model loading, prediction, caching, health, metrics |

---

## Security

- Zero secrets in the repository — all credentials via environment variables
- `.gitignore` excludes `.env`, models, checkpoints, and all binary artifacts
- Non-root Docker user with minimal capabilities
- Circuit breaker prevents cascade failures from compromised upstreams
- HCS anchoring provides tamper-evident audit trail for all predictions

---

## Further Documentation

- [Vera OS Overview](docs/vera-os-overview.md)
- [Prediction Infrastructure](docs/prediction-infrastructure.md)
- [Hedera Specialists](docs/hedera-specialists.md)
- [Visual Assets](docs/visual-assets.md)
- [Model Artifacts](docs/model-artifacts.md)
- [GitHub Release Checklist](docs/github-release-checklist.md)
- [Build Manifest](BUILD_MANIFEST.md)
- [Infrastructure Completion Report](INFRASTRUCTURE_COMPLETE.md)

---

## License

MIT License. See [LICENSE](LICENSE).
