# Vera OS

**Verifiable AI infrastructure for Hedera.**

Vera OS is seven layers of production infrastructure stacked into one importable Python package. Every action — predictions, agent executions, marketplace settlements — is cryptographically anchored to Hedera Consensus Service so outputs are independently verifiable on-chain.

```
pip install -e .
```

```python
import vera_os
print(vera_os.__version__)  # "2.0.0"
```

---

## How it works — layer by layer

Vera OS is built in clear layers. Each layer stands alone, and each one feeds the layer above it.

```
┌──────────────────────────────────────────────────────────────┐
│  7  LEARNING LANE          lessons → upgrade packages → HCS  │
├──────────────────────────────────────────────────────────────┤
│  6  VERIFIABLE AI          8 first-party agents + /run-now   │
├──────────────────────────────────────────────────────────────┤
│  5  LIVE PROOF LOOP        HCS emitter → mirror verifier     │
├──────────────────────────────────────────────────────────────┤
│  4  AGENT MARKETPLACE      post → bid → execute → settle     │
├──────────────────────────────────────────────────────────────┤
│  3  WORKFLOW AGENTS         30 agents across 6 domains        │
├──────────────────────────────────────────────────────────────┤
│  2  PREDICTION ENGINE       HBAR / SAUCE / DOVU models        │
├──────────────────────────────────────────────────────────────┤
│  1  HEDERA CORE             HCS topics, HTS tokens, swarm     │
└──────────────────────────────────────────────────────────────┘
```

---

### Layer 1 — Hedera Core

27 specialist agents monitoring the Hedera network across 5 domains: infrastructure, market intelligence, security, governance, and cross-chain.

```python
from vera_os import HederaSpecialistSwarm

swarm = HederaSpecialistSwarm()
result = swarm.run()
print(result["total_alerts"])
print(result["composite_confidence"])
```

Each specialist runs independently, produces typed alerts, and contributes to a composite confidence signal. The swarm covers HCS topics, HTS tokens, staking, bridges, whale detection, sentiment, and governance proposals.

---

### Layer 2 — Prediction Engine

Live token models that load from disk, compute 12+ engineered features, and return directional forecasts with confidence scores.

```python
from vera_os import PredictionService

svc = PredictionService()
features = svc.features_from_price("hbar", {"price": 0.09, "volume_24h": 75_000_000})
result = svc.predict("hbar", features)
# → { direction: "up", confidence: 0.82, features_used: 12 }
```

| Token | Accuracy | History |
| --- | --- | --- |
| HBAR | 80.0% | 60 points |
| SAUCE | 68.1% | 60 points |
| DOVU | 100.0% | 40 points |

Every prediction is hashed and can be anchored to HCS for auditability.

---

### Layer 3 — Workflow Agents

30 agents across 6 domains. Each produces typed action recommendations with proof hashes.

| Domain | Agents | Examples |
| --- | --- | --- |
| **DeFi** | 5 | Yield optimizer, swap router, LP manager |
| **Carbon/ESG** | 5 | Credit verifier, retirement tracker, ESG scorer |
| **Risk** | 5 | Position sizer, drawdown protector, stop-loss |
| **Hedera Native** | 5 | HCS orchestrator, HTS lifecycle, multi-sig |
| **Intelligence** | 5 | Signal aggregator, whale profiler, arb detector |
| **Operations** | 5 | Self-healer, cost optimizer, circuit breaker |

```python
from vera_os import WorkflowAgentService

was = WorkflowAgentService()
report = was.run_pipeline([
    {"domain": "intel", "agent": "intel_signal_001"},
    {"domain": "risk",  "agent": "risk_size_001"},
    {"domain": "defi",  "agent": "defi_swap_001"},
], context={"portfolio_value": 100_000})
```

Supports conditional branching, event-driven triggers, and scheduled runs.

---

### Layer 4 — Agent Marketplace

A full task lifecycle engine: post tasks, collect bids, award, execute, verify results, settle HBAR, and track reputation.

```python
from vera_os import MarketplaceService

mkt = MarketplaceService()
task = mkt.post_task("Analyze whale activity", budget_hbar=25.0, category="intel")
bid  = mkt.submit_bid(task["task_id"], agent_id="intel_whale_001", amount_hbar=20.0)
mkt.award_task(task["task_id"], bid["bid_id"])
```

Includes escrow holds, automated result verification, reputation scoring with tier promotion, and an event bus that bridges every lifecycle event to the proof layer.

---

### Layer 5 — Live Proof Loop

Every marketplace event gets a compact proof packet emitted to Hedera Consensus Service. The mirror verifier reads them back for independent validation.

```python
from vera_os import HCSProofEmitter, MirrorVerifier

emitter = HCSProofEmitter()                      # starts in dry_run mode
receipt = emitter.emit("task_1", "task.settled", proof_hash)
# receipt → { sequence_number, topic_id, hashscan_url, mode: "dry_run" }

verifier = MirrorVerifier()                      # reads from testnet mirror node
result = verifier.verify_receipt("task_1", proof_hash, topic_id="0.0.12345")
# result → { verified: True, consensus_timestamp, hashscan_url }
```

Three modes via environment variables:

| Mode | Env | What happens |
| --- | --- | --- |
| **dry_run** | `VERA_DRY_RUN=true` (default) | Proof packets logged locally, zero HCS cost |
| **testnet** | `HEDERA_NETWORK=testnet` | Live emission to Hedera testnet |
| **mainnet** | `VERA_ENABLE_MAINNET=true` | Production emission to mainnet |

Proof packets are chained — each one includes the hash of the previous, forming a tamper-evident sequence.

---

### Layer 6 — Verifiable AI

8 first-party VNX agents that run the complete marketplace proof loop end-to-end: post → bid → award → execute → verify → settle → emit HCS proof.

| Agent | Domain | Handles |
| --- | --- | --- |
| **Proof Publisher** | hedera | Publishes proof packets to HCS |
| **Hedera Tx Assistant** | hedera | Explains transactions, decodes receipts |
| **HCS Auditor** | hedera | Audits topic integrity, sequence gaps |
| **Carbon Verifier** | carbon | Validates carbon credit claims |
| **Compliance Reviewer** | compliance | Regulatory compliance review |
| **Agent Builder** | marketplace | Helps create new agents |
| **Quality Scorer** | marketplace | Scores agent quality from history |
| **Operator Harmony** | ops | System health and harmony checks |

Single-call convenience endpoint:

```python
from vera_os import FirstPartyAgentRegistry

registry = FirstPartyAgentRegistry()
agent = registry.best_agent("health_check")
result = agent.execute("task_1", {"scope": "full_system"})
# result → { confidence: 1.0, proof_hash: "f32a11...", data: { status: "healthy" } }
```

Or via the API:
```bash
curl -X POST /api/vera/verifiable-ai/run-now \
  -d '{"task_type": "health_check", "budget_hbar": 5.0}'
```

Returns the full evidence chain: task, bid, execution, verification score, settlement amount, and HCS proof receipts — in one call.

---

### Layer 7 — Learning Lane

Closed proof loops become lessons. Approved lessons become upgrade packages. Published packages get anchored to HCS.

```python
from vera_os import ProofLoopTracker, LessonEngine, UpgradePackageBuilder

tracker = ProofLoopTracker()
tracker.open_loop("task_1", "vnx_carbon_verifier")
# ... stages auto-record as marketplace events flow through ...
# loop auto-closes when: verification + settlement + reputation + HCS receipt

engine = LessonEngine()
lesson = engine.extract(loop, {"domain": "carbon", "task_types": ["carbon_verify"]})
engine.approve(lesson.lesson_id)

builder = UpgradePackageBuilder(proof_emitter=emitter)
package = builder.build("carbon-audit-v1", "carbon", [lesson])
builder.publish(package.package_id)  # → anchored to HCS
```

The loop tracker listens to the event bus. When all four required stages complete (verification, settlement, reputation, receipt), the loop auto-closes and becomes eligible for lesson extraction.

---

## Quick start

```bash
git clone https://github.com/livevnx8/Hedera-vnx-.git
cd Hedera-vnx-
pip install -e .
python -c "import vera_os; print(vera_os.__version__)"  # 2.0.0
```

Run the server:
```bash
python prediction_server_v3.py    # 163 routes, 38 agents, proof loop active
```

Run the tests:
```bash
python -m pytest tests/ -v        # 98 tests
```

---

## Using it as a library

Every layer is importable. Pick what you need:

```python
from vera_os import (
    # Layer 1: Hedera Core
    HederaSpecialistSwarm,

    # Layer 2: Predictions
    PredictionService,

    # Layer 3: Workflow Agents
    WorkflowAgentService,

    # Layer 4: Marketplace
    MarketplaceService,

    # Layer 5: Proof Loop
    HCSProofEmitter,
    MirrorVerifier,

    # Layer 6: Verifiable AI
    FirstPartyAgentRegistry,

    # Layer 7: Learning Lane
    ProofLoopTracker,
    LessonEngine,
    UpgradePackageBuilder,

    # Utilities
    PredictionMarketService,
    IntelligenceService,
    HealthService,
    get_visual_assets,
)
```

No need to understand the internal directory structure. The `vera_os` package is the stable public API.

---

## API surface (163 routes)

### Core

| Route | What it does |
| --- | --- |
| `GET /predict/{token}` | Token prediction with live features |
| `GET /tokens` | Loaded models with accuracy metadata |
| `GET /health` | Deep health check |

### Marketplace

| Route | What it does |
| --- | --- |
| `GET /marketplace/tasks` | List tasks with status filter |
| `POST /marketplace/tasks` | Post a new task |
| `POST /marketplace/tasks/{id}/bid` | Submit a bid |
| `POST /marketplace/tasks/{id}/award` | Award to a bidder |
| `GET /marketplace/agents` | Registered agents and reputation |
| `GET /marketplace/stats` | Volume, settlement, escrow stats |

### Proof

| Route | What it does |
| --- | --- |
| `GET /proof/stats` | Emitter + verifier health |
| `GET /proof/receipts` | Recent HCS proof receipts |
| `GET /proof/chain/{task_id}` | Full proof chain for a task |
| `POST /proof/verify` | Verify against mirror node |

### Verifiable AI

| Route | What it does |
| --- | --- |
| `GET /api/vera/verifiable-ai/agents` | List 8 first-party agents |
| `POST /api/vera/verifiable-ai/run-now` | Single-call full proof loop |
| `GET /api/vera/verifiable-ai/runs` | Recent proof runs |

### Learning Lane

| Route | What it does |
| --- | --- |
| `GET /api/vera/learning/loops` | Open and closed proof loops |
| `POST /api/vera/learning/extract` | Extract lesson from closed loop |
| `GET /api/vera/learning/lessons` | Lesson catalog |
| `POST /api/vera/learning/packages/build` | Build upgrade package |
| `POST /api/vera/learning/packages/{id}/publish` | Publish to HCS |

### Agents, Markets, Streaming, AI

Full endpoint lists for workflow agents (23 routes), prediction markets (22 routes), streaming (5 routes), and AI backbone (5 routes) are documented in [docs/api-reference.md](docs/api-reference.md).

---

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VERA_DRY_RUN` | `true` | Skip live HCS emission |
| `HEDERA_NETWORK` | `testnet` | `testnet` or `mainnet` |
| `VERA_ENABLE_MAINNET` | `false` | Safety gate for mainnet |
| `VERA_TASK_TOPIC_ID` | — | HCS topic for task proofs |
| `VERA_AUDIT_TOPIC_ID` | — | HCS topic for audit proofs |
| `HEDERA_OPERATOR_ACCOUNT_ID` | — | Hedera operator account |
| `HEDERA_OPERATOR_PRIVATE_KEY` | — | Hedera operator key |

---

## Dashboard

A React + Tailwind dashboard ships in `dashboard/`. Six pages:

- **Overview** — system stats, proof loop health, quick actions
- **Marketplace** — task list with proof badges, status filters
- **Agents** — all 38 agents with tier, score, domain, earnings
- **Live Feed** — real-time events + HCS proof receipt column
- **Intelligence** — Q&A, task decomposition, verifiable task runner
- **System** — AI models, streaming health, configuration

---

## Repository layout

```
vera_os/                       Public Python facade (stable imports)
src/hedera_proof/              Layer 5: HCS emitter, mirror verifier, proof API
src/verifiable_ai/             Layer 6: First-party agents, verifiable AI API
src/learning_lane/             Layer 7: Proof loops, lessons, upgrade packages
src/marketplace/               Layer 4: Task engine, escrow, reputation, verifier
src/agents/                    Layer 3: 30 workflow agents, event bus, scheduler
src/ai_backbone/               AI routing, decomposition, summarization, RAG
src/streaming/                 WebSocket streaming, live pipeline
src/markets/                   Prediction markets (Polymarket on Hedera)
src/starlit/                   BitLattice ternary model system
src/cache/                     Tiered caching (L1 memory + L2 Redis)
src/health/                    Deep health checks
src/resilience/                Circuit breaker, retry, backoff
dashboard/                     React + Tailwind dashboard
monitoring/                    Prometheus, Grafana, Loki, alerts
tests/                         98 tests across all layers
docs/visuals/                  11 PNG + 11 SVG visual assets
prediction_server_v3.py        FastAPI server (163 routes)
```

---

## Tests

```bash
python -m pytest tests/ -v    # 98 tests, < 3 seconds
```

| Suite | Coverage |
| --- | --- |
| `test_vera_os_v1.py` | Marketplace, streaming, AI backbone, integration |
| `test_vera_os_v2.py` | Proof emitter, mirror verifier, first-party agents, proof loop, lessons, packages, full end-to-end |
| `test_workflow_agents.py` | DeFi, carbon, risk agents, workflow engine |

---

## Security

- Zero secrets in the repository — all credentials via environment variables
- HCS anchoring provides a tamper-evident audit trail
- Circuit breaker prevents cascade failures
- Proof packets are hash-chained — any tamper breaks the chain
- Operator approval gate on lessons before packaging

---

## License

MIT License. See [LICENSE](LICENSE).
