# Vera OS

![Vera OS architecture](docs/visuals/vnx-architecture-diagram-png.png)

**Verifiable prediction infrastructure and prediction markets for Hedera.**

Vera OS is a production-grade system that combines a live token prediction engine, a 27-agent Hedera specialist swarm, a novel ternary-weight BitLattice model architecture, a Polymarket-style prediction market infrastructure, and a full observability stack into a single deployable package. Every prediction, trade, and settlement is cryptographically anchored to Hedera Consensus Service (HCS), making outputs independently verifiable.

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

## Prediction Markets (Polymarket on Hedera)

A complete prediction market system where the BitLattice swarm feeds AI probability signals into tradeable markets — HTS outcome tokens, HBAR pools, automated market making, and HCS-anchored settlement.

### Architecture

```
BitLattice Swarm (27 agents)
        │ probability signals
        ▼
   Oracle Feed ──► HCS Topics (verifiable)
        │
        ▼
┌─────────────────────────────────┐
│     Prediction Market Core      │
│  ┌───────────┐  ┌───────────┐  │
│  │ HTS Token │  │   HBAR    │  │
│  │  Markets  │  │   Pools   │  │
│  │  (AMM)    │  │ (simple)  │  │
│  └───────────┘  └───────────┘  │
│         ┌───────────┐          │
│         │  Market    │          │
│         │  Maker Bot │          │
│         └───────────┘          │
└─────────────────────────────────┘
        │ resolution
        ▼
   Settlement Engine ──► HCS Merkle Proof
        │
        ▼
   Leaderboard + Portfolio Tracker
```

### Market Types

| Type | Mechanism | Best For |
| --- | --- | --- |
| **HTS Token** | Constant-product AMM; mint YES/NO outcome tokens via HTS | Liquid, advanced markets with real-time pricing |
| **HBAR Pool** | Direct staking into outcome pools; winners split proportionally | Quick, simple markets with low overhead |
| **Binary** | Standard YES/NO order book with FIFO matching | Traditional prediction market UX |
| **Multi** | 3+ outcomes with weighted probability | Complex event forecasting |

### How It Works

```python
from vera_os import PredictionMarketService

pms = PredictionMarketService()

# Create a market
market = pms.create_market(
    question="Will HBAR reach $0.15 by Friday?",
    outcomes=["YES", "NO"],
    market_type="hts_token",
)

# Users trade outcome tokens
pms.token_manager.buy_outcome(market["market_id"], "YES", 100_000_000, "alice")

# AI oracle feeds probability from BitLattice swarm
pms.oracle_feed.publish_signal(market["market_id"], {
    "direction": "UP",
    "up_probability": 0.78,
    "confidence": 0.85,
    "specialist_count": 27,
})

# Resolve via oracle consensus
pms.settlement_engine.resolve_with_oracle(market["market_id"])

# Leaderboard
print(pms.leaderboard(sort_by="profit"))
```

### Market Modules

| Module | File | Purpose |
| --- | --- | --- |
| **Market Core** | `src/markets/market_core.py` | State machine, order book, FIFO matching |
| **HBAR Pools** | `src/markets/hbar_pools.py` | Winner-takes-pool with 0.5% fee |
| **HTS Tokens** | `src/markets/hts_outcome_tokens.py` | AMM pricing, mint/burn, 0.3% swap fee |
| **Oracle Feed** | `src/markets/oracle_feed.py` | BitLattice → OracleSignal → HCS topics |
| **Settlement** | `src/markets/settlement.py` | Oracle + manual resolution, disputes, Merkle proof |
| **Auto Factory** | `src/markets/auto_market_factory.py` | 9 templates, auto-creates markets from signals |
| **Liquidity** | `src/markets/liquidity.py` | LP incentives, fee distribution, TVL tracking |
| **Portfolio** | `src/markets/portfolio.py` | Cross-market P&L, leaderboard |
| **Market Maker** | `src/markets/market_maker.py` | Automated 2-sided quoting from oracle fair value |
| **API** | `src/markets/market_api.py` | 22 FastAPI endpoints |

### Key Advantages over Polymarket

- **AI-first oracle** — BitLattice swarm is a built-in probability source, not bolted on
- **Hedera-native** — HCS + HTS, no EVM dependency or gas complexity
- **Verifiable** — every signal and settlement gets a Merkle proof on HCS
- **Dual market types** — advanced HTS token AMM and simple HBAR pools
- **Automated market making** — bot bootstraps liquidity using oracle fair value
- **LP incentives** — fee sharing (66.67% to LPs) + platform bonus rewards

---

## Specialized Workflow Agents (57 total)

Beyond the original 27 monitoring specialists, Vera OS includes **30 workflow agents** across 6 operational domains — each producing typed action recommendations with proof hashes for HCS anchoring, event emission, conditional branching, and scheduled execution.

### DeFi Operations (5 agents)

| Agent | ID | Workflow |
| --- | --- | --- |
| **Yield Optimizer** | `defi_yield_001` | Rank DEX pools by risk-adjusted APY, factor in impermanent loss |
| **Swap Router** | `defi_swap_001` | Optimal swap path, slippage estimation, split-order recommendation |
| **LP Position Manager** | `defi_lp_001` | Track LP positions, monitor IL, suggest rebalance or exit |
| **Pool Health Monitor** | `defi_pool_001` | TVL changes, whale concentration, utilization alerts |
| **Fee Harvester** | `defi_fees_001` | Track accrued fees, recommend claim timing vs gas cost |

### Carbon/ESG Compliance (5 agents)

| Agent | ID | Workflow |
| --- | --- | --- |
| **Carbon Credit Verifier** | `carbon_verify_001` | Validate credit metadata, flag suspicious registries/vintages |
| **Retirement Tracker** | `carbon_retire_001` | Monitor retirements, generate offset certificates with proof hash |
| **ESG Score Calculator** | `esg_score_001` | Compute E/S/G scores from on-chain activity, issue grades |
| **Sustainability Reporter** | `esg_report_001` | Auto-generate compliance reports (Paris Agreement, third-party) |
| **Green Token Monitor** | `carbon_token_001` | Track DOVU, carbon NFTs — supply spikes, price crashes |

### Risk Management (5 agents)

| Agent | ID | Workflow |
| --- | --- | --- |
| **Position Sizer** | `risk_size_001` | Kelly criterion + volatility-adjusted sizing |
| **Portfolio Rebalancer** | `risk_rebal_001` | Drift detection, rebalance orders when allocation exceeds threshold |
| **Stop-Loss Automation** | `risk_stop_001` | Trailing stops, ATR-based levels, time-decay adjustments |
| **Exposure Monitor** | `risk_exposure_001` | Per-token and sector concentration limits |
| **Drawdown Protector** | `risk_drawdown_001` | Warning → critical → halt escalation with auto-reduction |

### Hedera Native (5 agents)

| Agent | ID | Workflow |
| --- | --- | --- |
| **HCS Topic Orchestrator** | `hedera_hcs_001` | Topic query/subscribe, sequence gap detection, flood alerts |
| **HTS Token Lifecycle** | `hedera_hts_001` | Mint/burn tracking, supply auditing, risk flag detection |
| **Scheduled Tx Manager** | `hedera_sched_001` | Pending tx tracking, signature progress, expiry alerts |
| **Multi-Sig Coordinator** | `hedera_multisig_001` | Threshold key approvals, stale tx cleanup, backlog alerts |
| **Account Activity Profiler** | `hedera_account_001` | Tx frequency, holdings, topic activity, risk scoring |

### Intelligence & Analytics (5 agents)

| Agent | ID | Workflow |
| --- | --- | --- |
| **Prediction Signal Aggregator** | `intel_signal_001` | Combine BitLattice + oracle + sentiment into composite score |
| **Sentiment Aggregator** | `intel_sentiment_001` | Fear/greed index from social sources, contrarian signals |
| **Whale Behavior Profiler** | `intel_whale_001` | Accumulation/distribution tracking, large-move alerts |
| **Volume Anomaly Scorer** | `intel_volume_001` | Z-score deviations, wash trading detection |
| **Cross-Chain Arb Detector** | `intel_arb_001` | Price discrepancies across bridges, net profit scoring |

### Autonomous Operations (5 agents)

| Agent | ID | Workflow |
| --- | --- | --- |
| **Self-Healer** | `ops_heal_001` | Detect failures, auto-restart, escalation on retry exhaustion |
| **Cost Optimizer** | `ops_cost_001` | HBAR spend tracking, batch recommendations, budget alerts |
| **Circuit Breaker Orchestrator** | `ops_circuit_001` | Upstream dependency monitoring, trip/recovery logic |
| **Task Scheduler** | `ops_scheduler_001` | Overdue task detection, interval tracking |
| **System Health Aggregator** | `ops_health_001` | Composite system score from all components |

### Advanced Workflow Engine

**Conditional Branching** — pipelines with if/else logic based on agent output:
```python
pipeline = [
    {"domain": "risk", "agent": "risk_drawdown_001"},
    {
        "type": "branch",
        "condition": "drawdown_status == 'critical'",
        "if_true":  [{"domain": "risk", "agent": "risk_stop_001"}],
        "if_false": [{"domain": "risk", "agent": "risk_rebal_001"}],
    },
]
```

**Event-Driven Triggers** — auto-fire pipelines when agents emit matching events:
```python
trigger = EventTrigger(
    name="whale_move_response",
    event_pattern="intel.intel_whale_001",
    condition="total_moved_24h > 1000000000000",
    pipeline_steps=[{"domain": "risk", "agent": "risk_exposure_001"}],
)
```

**Scheduled Runs** — cron-style or interval-based periodic execution:
```python
scheduler.register(ScheduleEntry(name="risk_scan_4h", interval_seconds=14400, domain="risk"))
scheduler.register(ScheduleEntry(name="system_health_1h", interval_seconds=3600, domain="ops"))
```

### Multi-Step Pipelines

```python
from vera_os import WorkflowAgentService

was = WorkflowAgentService()

# Run domains
defi_report   = was.run_defi()
hedera_report = was.run_hedera({"account_id": "0.0.12345"})
intel_report  = was.run_intel()
ops_report    = was.run_ops()

# Cross-domain pipeline
result = was.run_pipeline([
    {"domain": "intel", "agent": "intel_signal_001"},
    {"domain": "risk", "agent": "risk_size_001"},
    {"domain": "defi", "agent": "defi_swap_001"},
], context={"portfolio_value": 100_000})
```

Pre-built presets: `assess_and_trade`, `full_risk_scan`, `esg_audit`, `defi_opportunity`, `smart_trade`, `whale_alert`, `hedera_audit`, `system_checkup`, `full_intelligence`.

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

### Predictions and Analytics

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
| `/governance/*` | GET/POST | Model governance, bid validation, reward calculation |
| `/hedera/*` | GET | Hedera toolkit: topics, tokens, accounts, blocks |
| `/hedera-swarm/*` | GET | Specialist swarm: status, execution, alerts |
| `/swarm/*` | GET | VNX BitLattice swarm predictions and health |

### Prediction Markets

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/markets` | POST | Create a prediction market (binary, multi, HTS token, HBAR pool) |
| `/markets` | GET | List all markets with filtering |
| `/markets/{id}` | GET | Market details with pool, tokens, oracle, settlement |
| `/markets/{id}/order` | POST | Place a buy/sell order |
| `/markets/{id}/pool/stake` | POST | Stake HBAR into an outcome pool |
| `/markets/{id}/tokens/buy` | POST | Buy outcome tokens via AMM |
| `/markets/{id}/tokens/sell` | POST | Sell outcome tokens back to AMM |
| `/markets/{id}/oracle` | GET | Latest AI oracle signal and consensus probability |
| `/markets/{id}/oracle/history` | GET | Historical oracle signal time series |
| `/markets/{id}/resolve` | POST | Resolve market (manual) |
| `/markets/{id}/resolve/oracle` | POST | Auto-resolve via oracle consensus |
| `/markets/{id}/settle` | POST | Execute settlement payouts |
| `/markets/{id}/dispute` | POST | Open a dispute against resolution |
| `/markets/stats` | GET | Global market statistics |
| `/portfolio/{user}` | GET | User portfolio across all markets |
| `/leaderboard` | GET | Global trader rankings (profit, win rate, volume, ROI) |
| `/factory/check` | POST | Auto-create markets from swarm signals |
| `/factory/templates` | GET | List auto-market templates |
| `/mm/configure/{id}` | POST | Configure market maker bot |
| `/mm/refresh` | POST | Refresh market maker quotes |
| `/liquidity/{id}/add` | POST | Add LP liquidity |
| `/liquidity/{id}/tvl` | GET | Total value locked in LP pool |

### Workflow Agents

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/agents/defi` | GET | Run all 5 DeFi agents |
| `/agents/defi/{agent_id}` | GET | Run a specific DeFi agent |
| `/agents/carbon` | GET | Run all 5 Carbon/ESG agents |
| `/agents/carbon/{agent_id}` | GET | Run a specific Carbon agent |
| `/agents/risk` | GET | Run all 5 Risk Management agents |
| `/agents/risk/{agent_id}` | GET | Run a specific Risk agent |
| `/agents/hedera` | GET | Run all 5 Hedera Native agents |
| `/agents/hedera/{agent_id}` | GET | Run a specific Hedera agent |
| `/agents/intel` | GET | Run all 5 Intelligence agents |
| `/agents/intel/{agent_id}` | GET | Run a specific Intel agent |
| `/agents/ops` | GET | Run all 5 Autonomous Ops agents |
| `/agents/ops/{agent_id}` | GET | Run a specific Ops agent |
| `/agents/all` | GET | Run all 30 agents across all domains |
| `/agents/workflows/run` | POST | Run a multi-step agent pipeline |
| `/agents/workflows/presets` | GET | List 9 pre-built workflow presets |
| `/agents/workflows/presets/{name}` | POST | Run a preset pipeline |
| `/agents/workflows/history` | GET | Recent pipeline execution history |
| `/agents/stats` | GET | Global agent + trigger + scheduler statistics |
| `/agents/list` | GET | List all 30 registered agents |
| `/agents/triggers` | GET | List event-driven triggers |
| `/agents/triggers/history` | GET | Recent trigger firings |
| `/agents/schedules` | GET | List scheduled runs |
| `/agents/schedules/{id}/run` | POST | Manually fire a scheduled run |

---

## Python Facade

The public `vera_os` package gives developers stable import points without needing to understand the internal layout.

```python
from vera_os import (
    PredictionService,         # Token predictions with confidence scoring
    HederaSpecialistSwarm,     # 27-agent Hedera monitoring swarm
    PredictionMarketService,   # Polymarket-style markets on Hedera
    WorkflowAgentService,      # 15 DeFi/Carbon/Risk workflow agents
    HealthService,             # Deep health checks
    VisualAsset,               # Visual asset dataclass
    get_visual_assets,         # Get all 11 visual assets
    get_visual_asset_pairs,    # Get PNG/SVG pairs
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
  __init__.py               → Exports: PredictionService, PredictionMarketService, ...
  prediction.py             → PredictionService wrapper
  specialists.py            → HederaSpecialistSwarm wrapper
  markets.py                → PredictionMarketService wrapper
  workflows.py              → WorkflowAgentService wrapper
  health.py                 → HealthService wrapper
  visuals.py                → Visual asset catalog

src/agents/                 → Specialized workflow agents (30 agents, 6 domains)
  base_agent.py             → WorkflowAgent, WorkflowEngine, proof hashing, event emission
  advanced_workflows.py     → EventBus, EventTrigger, TriggerManager, AgentScheduler, branching
  defi_agents.py            → 5 DeFi agents + orchestrator
  carbon_agents.py          → 5 Carbon/ESG agents + orchestrator
  risk_agents.py            → 5 Risk Management agents + orchestrator
  hedera_native_agents.py   → 5 HCS/HTS native agents + orchestrator
  intel_agents.py           → 5 Intelligence & Analytics agents + orchestrator
  ops_agents.py             → 5 Autonomous Operations agents + orchestrator
  agent_api.py              → FastAPI router (23 endpoints + triggers + schedules)

src/markets/                → Prediction market infrastructure (Polymarket on Hedera)
  market_core.py            → State machine, order book, FIFO matching
  hbar_pools.py             → Winner-takes-pool HBAR markets
  hts_outcome_tokens.py     → AMM-based HTS outcome token markets
  oracle_feed.py            → BitLattice swarm → HCS oracle signals
  settlement.py             → Resolution, disputes, Merkle proof anchoring
  auto_market_factory.py    → Auto-create markets from swarm signals (9 templates)
  liquidity.py              → LP incentives, fee distribution, TVL
  portfolio.py              → Cross-market P&L, leaderboard
  market_maker.py           → Automated 2-sided quoting
  market_api.py             → 22 FastAPI market endpoints

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

prediction_server_v3.py            → FastAPI application (v3.5, 60+ endpoints)
prediction_server_production.py    → Production server with full middleware

monitoring/                 → Prometheus, Grafana, Loki, Promtail, alerts
infrastructure/postgres/    → SQL schema initialization
alembic/                    → Database migrations
docker-compose.yml          → Full 13-service stack
docker-compose.production.yml → Production variant
docker-compose.monitoring.yml → Monitoring-only stack

examples/                   → Ready-to-run Python examples
tests/                      → Validation suites + market tests (111 checks)
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
| `test_prediction_markets.py` | 111 checks: market lifecycle, HTS tokens, HBAR pools, oracle, settlement, factory, LP, portfolio, leaderboard, market maker |
| `test_workflow_agents.py` | 77 checks: DeFi agents, Carbon/ESG agents, Risk agents, workflow engine, pipelines, typing |
| `test_advanced_agents.py` | 99 checks: Hedera Native, Intel, Ops agents, conditional branching, event bus, triggers, scheduler, 6-domain engine |

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
