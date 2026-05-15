<!-- 
  VNX — Verifiable Neural Exchange
  Sustainable, verifiable AI agents built on Hedera Hashgraph.
  Every prediction, execution, and settlement is cryptographically anchored to 
  Hedera Consensus Service (HCS) for tamper-proof auditability.
  Carbon-negative infrastructure · 0.000003 kWh per transaction · MIT Licensed
-->

<div align="center">

# VNX — Verifiable Neural Exchange

### Sustainable, verifiable AI agents built on Hedera

*Carbon-negative infrastructure · Cryptographic proof of every prediction · Open source*

[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![Hedera](https://img.shields.io/badge/Hedera-HCS%20%7C%20HTS-8259EF?logo=hedera&logoColor=white)](https://hedera.com)
[![ONNX Runtime](https://img.shields.io/badge/ONNX-Runtime%20GPU-005CED?logo=onnx&logoColor=white)](https://onnxruntime.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-10B981.svg)](LICENSE)
[![Routes](https://img.shields.io/badge/API-163%20routes-06B6D4.svg)]()
[![Agents](https://img.shields.io/badge/Agents-38%20active-7C3AED.svg)]()

```bash
pip install -e .  &&  python prediction_server_v3.py
# → 163 routes live, 38 agents ready, proof loop active
```

</div>

---

<div align="center">

![VNX Prediction Swarm Dashboard](assets/vnx-visuals/vnx-edge-performance-dashboard-png.png?v=2)

*VNX Prediction Swarm — 7 agents, real-time HBAR/USD, sub-2ms inference, adaptive self-learning*

</div>

---

## What is VNX?

**VNX (Verifiable Neural Exchange)** is an AI agent framework where every output — predictions, executions, settlements — is cryptographically anchored to **Hedera Consensus Service**. No trust required. Every result is independently verifiable on-chain.

| | |
|---|---|
| **< 2ms** inference | **63 KB** quantized model |
| **7-agent** prediction swarm | **On-chain** HCS proofs |
| **38 agents** across 6 domains | **Self-learning** adaptive weights |
| **163 routes** production API | **98 tests** full coverage |

```python
from vnx import PredictionService, HCSProofEmitter

svc = PredictionService()
result = svc.predict("hbar", svc.features_from_price("hbar", {"price": 0.095}))
# → { direction: "up", confidence: 0.72, proof_hash: "a3f2..." }

emitter = HCSProofEmitter()
emitter.emit("pred_001", "prediction.verified", result["proof_hash"])
# → Anchored to Hedera — independently verifiable forever
```

---

## Why Hedera for AI?

AI outputs are only as trustworthy as the system that records them. VNX anchors every inference to **Hedera Consensus Service** — the most energy-efficient public ledger available — so predictions are independently verifiable *and* sustainable.

| Problem | How VNX + Hedera Solves It | Source |
|---------|--------------------------|--------|
| **AI black boxes** — no proof an output wasn't tampered with | Every prediction is hash-chained and timestamped on HCS | [Hedera HCS Docs](https://docs.hedera.com/hedera/core-concepts/hashgraph-consensus-algorithms) |
| **Energy waste** — GPU inference + PoW chains = massive carbon | Hedera uses **0.000003 kWh/tx** — lowest of any public DLT (UCL study) | [UCL Blockchain Energy Report](https://hedera.com/ucl-blockchain-energy) |
| **Sustainability claims without proof** — greenwashing | Hedera is **carbon-negative** via quarterly offsets verified by Terrapass | [Hedera Carbon Negative](https://hedera.com/blog/going-carbon-negative-at-hedera-hashgraph) |
| **Front-running & ordering manipulation** | Hashgraph consensus provides **fair ordering** via median consensus timestamps | [Hashgraph Consensus](https://docs.hedera.com/hedera/core-concepts/hashgraph-consensus-algorithms) |
| **Slow finality** — can't use predictions in real-time | Hedera achieves **3-5 second finality** with 10,000+ TPS | [Hedera Dashboard](https://hedera.com/dashboard) |
| **Centralized AI monopolies** — one company controls the model | VNX is MIT-licensed, runs locally (63KB model), zero API dependencies | [This repo — MIT License](LICENSE) |

### Sustainable AI by Design

VNX's BitLattice architecture is purpose-built for minimal compute:

- **63 KB model** vs 100GB+ for LLMs — runs on a Raspberry Pi
- **14 μs inference** — no GPU required, CPU L1 cache only
- **Zero cloud dependency** — all inference is local, no external API calls
- **Carbon-negative chain** — every HCS proof costs less energy than a single Google search

> *"Hedera uses less energy per transaction than a Visa payment."*
> — [hedera.com](https://hedera.com)

---

## Project Status

| Component | Status | Details |
|-----------|--------|--------|
| **Prediction Swarm** | ✅ Live | 7-agent ensemble, 5-min cycles, adaptive learning |
| **BitLattice ONNX** | ✅ Production | Quantized model, 14μs inference, 63KB |
| **HCS Proof Loop** | ✅ Active | Hash-chained proofs emitting to testnet |
| **Agent Marketplace** | ✅ Functional | Post → Bid → Execute → Settle → Proof |
| **Dashboard** | ✅ Live | Real-time chart + swarm signals at `/fast/dashboard` |
| **Mainnet Proofs** | 🔶 Ready | Gated behind `VNX_ENABLE_MAINNET=true` |
| **Multi-token Models** | 🔶 Beta | HBAR (80%), SAUCE (68%), DOVU (100%) |
| **Learning Lane** | 🔶 Beta | Proof loops → lessons → upgrade packages |
| **Edge Deployment** | 🟡 Planned | Browser/IoT targets via WASM export |
| **DAO Governance** | 🟡 Planned | On-chain proposal voting for agent upgrades |

**Legend:** ✅ Production &nbsp;|&nbsp; 🔶 Beta/Ready &nbsp;|&nbsp; 🟡 Planned

---

## BitLattice Architecture

<div align="center">

![BitLattice Architecture](assets/vnx-visuals/vnx-bitlattice-architecture-png.png?v=2)

*Ternary-weight lattice system: each connection is -1 (inhibitory), 0 (no connection), or +1 (excitatory)*

</div>

BitLattice is VNX's proprietary neural architecture — a ternary-weight system that packs **5 weights per byte** instead of 32 bits per weight.

| Metric | BitLattice | Traditional ML |
|--------|-----------|----------------|
| **Model size** | 63 KB | 208 KB+ (float32) |
| **Inference** | 14 μs | 85 μs |
| **Compression** | 200,000× vs GPT-class | 1× baseline |
| **Speedup** | 6.23× faster | baseline |
| **Deployment** | Edge / browser / IoT | Server-only |
| **Weights** | {-1, 0, +1} ternary | float32 continuous |

**How it works:**
1. Input features flow through a lattice of ternary connections
2. Each vertex routes signals via excitatory (+1) or inhibitory (-1) paths
3. Zero connections are pruned — no computation wasted
4. Output: directional probability with calibrated confidence
5. Entire model fits in L1 cache — zero memory bottleneck

---

## VNX Prediction Swarm

<div align="center">

![VNX Performance](assets/vnx-visuals/vnx-performance-comparison-png.png?v=2)

*Real-time 5-minute HBAR/USD directional predictions with 7-agent weighted consensus*

</div>

Seven specialized agents analyze price data from different angles and vote through weighted consensus:

| Agent | Strategy | What it detects |
|-------|----------|-----------------|
| **BitLattice-ONNX** | Quantized neural network | Non-linear patterns in 14 features |
| **RSI-Agent** | Mean-reversion on RSI(14) | Oversold/overbought reversals |
| **BB-Agent** | Bollinger Band edges | Volatility squeeze breakouts |
| **SMA-Cross** | 5/10 period crossover | Micro-trend direction |
| **Momentum** | 3-tick price velocity | Strong moves vs exhaustion |
| **Volume-Flow** | Volume-price divergence | Smart money accumulation |
| **Pattern-Recog** | Chart pattern detection | Double tops, triangles, flags, wedges |

### Consensus Mechanism

```
Consensus = Σ(agent_score × adaptive_weight) / Σ(weights)
Direction = UP if consensus > 0, else DOWN
Confidence = |consensus| × agreement_ratio
```

### Adaptive Self-Learning

After every 5-minute cycle, each agent is scored individually. Agents that prove accurate get **weight boosted**; weak agents get dampened. The swarm continuously evolves.

```
Weight formula: 0.5 + agent_accuracy  (range: 0.5× to 1.5×)
Adapts after 5+ scored predictions per agent
```

**Live dashboard:** `GET /fast/dashboard` — real-time chart, swarm signals, per-agent accuracy

---

## Quick Start

**Your verifiable AI agent is live in 30 seconds:**

```bash
# 1. Clone
git clone https://github.com/livevnx8/Hedera-vnx-.git
cd Hedera-vnx-

# 2. Install
pip install -e .

# 3. Run
python prediction_server_v3.py
```

That's it. Open `http://localhost:8080/fast/dashboard` to see the prediction swarm live.

### Optional: Enable Hedera proofs

```bash
# .env
HEDERA_OPERATOR_ACCOUNT_ID=0.0.XXXXX
HEDERA_OPERATOR_PRIVATE_KEY=302e...
HEDERA_NETWORK=testnet
VNX_DRY_RUN=false          # flip to emit real HCS proofs
```

---

## Verifiability — How Proofs Work

<div align="center">

![VNX Verifiability](assets/vnx-visuals/vnx-verifiability-diagram-png.png?v=2)

*Every AI output produces a hash-chained proof packet anchored to Hedera Consensus Service*

</div>

Each proof packet contains:

```
Model Hash → Prompt Hash → Output Hash → Trace Hash → Proof Hash → HCS Receipt
```

Proof packets are **chained** — each includes the hash of the previous, forming a tamper-evident sequence. Anyone can verify against the Hedera mirror node:

```python
from vnx import MirrorVerifier

verifier = MirrorVerifier()
result = verifier.verify_receipt("task_1", proof_hash, topic_id="0.0.12345")
# → { verified: True, consensus_timestamp, hashscan_url }
```

| Mode | Config | Cost |
|------|--------|------|
| **Dry run** | `VNX_DRY_RUN=true` (default) | Free — proofs logged locally |
| **Testnet** | `HEDERA_NETWORK=testnet` | Free — Hedera testnet |
| **Mainnet** | `VNX_ENABLE_MAINNET=true` | ~$0.0001/proof |

---

## Architecture

<div align="center">

![VNX Marketplace Loop](assets/vnx-visuals/vnx-architecture-diagram-png.png?v=2)

*Complete agent lifecycle: Post → Bid → Execute → Verify → Settle → Proof*

</div>

| Layer | Name | What it does |
|-------|------|-------------|
| 7 | **Learning Lane** | Closed proof loops → lessons → upgrade packages → HCS |
| 6 | **Verifiable AI** | 8 first-party agents with full proof lifecycle |
| 5 | **Live Proof Loop** | HCS emitter + mirror verifier |
| 4 | **Agent Marketplace** | Post → bid → execute → settle with escrow |
| 3 | **Workflow Agents** | 30 agents across 6 domains |
| 2 | **Prediction Engine** | BitLattice ONNX + 7-agent swarm |
| 1 | **Hedera Core** | HCS topics, HTS tokens, 27 network specialists |

### Run a verified agent task in 4 lines:

```python
from vnx import MarketplaceService

mkt = MarketplaceService()
task = mkt.post_task("Analyze whale activity", budget_hbar=25.0, category="intel")
mkt.award_task(task["task_id"], mkt.submit_bid(task["task_id"], "intel_whale_001", 20.0)["bid_id"])
# → Executes, verifies, settles HBAR, emits HCS proof — automatically
```

---

## API Surface

| Category | Key Routes | Count |
|----------|-----------|-------|
| **Predictions** | `GET /predict/{token}`, `GET /fast/dashboard`, `GET /fast/accuracy` | 8 |
| **Marketplace** | `POST /marketplace/tasks`, `GET /marketplace/agents` | 12 |
| **Proof** | `GET /proof/chain/{id}`, `POST /proof/verify` | 6 |
| **Verifiable AI** | `POST /api/vera/verifiable-ai/run-now` | 5 |
| **Learning** | `POST /api/vera/learning/extract`, `/packages/build` | 8 |
| **Agents** | Workflow pipelines, specialist swarm | 23 |
| **Markets** | Prediction markets (Polymarket-style on Hedera) | 22 |
| **Streaming** | WebSocket live events | 5 |
| **Health** | Deep checks, monitoring dashboard | 6 |

**Total: 163 routes** — Full reference: [docs/api-reference.md](docs/api-reference.md)

---

## Visual Assets

All diagrams ship as both PNG (for GitHub) and SVG (for docs/print):

| Visual | What it shows |
|--------|--------------|
| ![](assets/vnx-visuals/vnx-bitlattice-architecture-png.png?v=2) | **BitLattice Architecture** — Ternary lattice routing |
| ![](assets/vnx-visuals/vnx-architecture-diagram-png.png?v=2) | **Marketplace Loop** — Full agent lifecycle |
| ![](assets/vnx-visuals/vnx-verifiability-diagram-png.png?v=2) | **Proof Chains** — Hash-linked HCS verifiability |
| ![](assets/vnx-visuals/vnx-accuracy-metrics-png.png?v=2) | **Accuracy Metrics** — Real benchmark data |
| ![](assets/vnx-visuals/vnx-edge-performance-dashboard-png.png?v=2) | **Edge Performance** — Sub-millisecond targets |
| ![](assets/vnx-visuals/vnx-performance-comparison-png.png?v=2) | **Performance** — BitLattice vs alternatives |
| ![](assets/vnx-visuals/vnx-model-size-comparison-png.png?v=2) | **Model Size** — 63KB vs industry standard |
| ![](assets/vnx-visuals/vnx-scalability-visualization-png.png?v=2) | **Scalability** — Horizontal agent scaling |
| ![](assets/vnx-visuals/vnx-competitive-advantage-grid-png.png?v=2) | **Competitive Grid** — VNX vs market |
| ![](assets/vnx-visuals/vnx-sustainability-infographic-png.png?v=2) | **Sustainability** — Carbon-aware operations |
| ![](assets/vnx-visuals/vnx-research-timeline-png.png?v=2) | **Research Timeline** — Development milestones |

SVG versions available in [`docs/visuals/`](docs/visuals/) for high-resolution rendering.

---

## Hiero Integration

VNX builds on **Hiero** — the Linux Foundation open-source project governing Hedera's entire tech stack. Hiero makes every layer of the network auditable and interoperable.

| Hiero Component | How VNX Uses It | Benefit |
|-----------------|-----------------|---------|
| **hiero-mirror-node** | REST API verifies every HCS proof | Free, stateless, no auth — verify from anywhere |
| **hiero-consensus-node** | Hashgraph algorithm auditable (Apache-2.0) | Trust argument backed by inspectable code |
| **hiero-json-rpc-relay** | EVM-compatible settlement layer | Smart contract escrow, MetaMask-compatible |
| **hiero-sdk-js** | TypeScript bridge for HCS emission | Production SDK, actively maintained |
| **Solo** | Local Hiero network for CI/CD | Test proof pipeline without testnet rate limits |

### Mirror Node Verification

Every prediction produces a deterministic SHA-256 hash. Verify it on-chain via Hiero's open-source mirror nodes:

```bash
# Verify any prediction by ID — no SDK needed
curl http://localhost:8080/fast/verify/42

# Or query Hiero mirror node REST API directly
curl https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.xxx/messages?limit=25
```

The mirror node returns consensus timestamps, sequence numbers, and running hashes — all independently auditable.

---

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `VNX_DRY_RUN` | `true` | Skip live HCS emission |
| `HEDERA_NETWORK` | `testnet` | Network target |
| `VNX_ENABLE_MAINNET` | `false` | Mainnet safety gate |
| `VNX_TASK_TOPIC_ID` | — | HCS topic for proofs |
| `HEDERA_OPERATOR_ACCOUNT_ID` | — | Operator account |
| `HEDERA_OPERATOR_PRIVATE_KEY` | — | Operator key |

---

## Tests

```bash
python -m pytest tests/ -v    # 98 tests, < 3 seconds
```

---

## Repository Layout

```
vnx/                  Python package (stable public API)
src/prediction/           BitLattice ONNX + 7-agent swarm
src/hedera_proof/         HCS emitter, mirror verifier
src/verifiable_ai/        8 first-party verified agents
src/marketplace/          Task engine, escrow, reputation
src/agents/               30 workflow agents across 6 domains
src/learning_lane/        Proof loops → lessons → packages
scripts/fast_predictor.py 5-min prediction swarm (background)
prediction_server_v3.py   FastAPI server (163 routes)
assets/vnx-visuals/       11 PNG + 11 SVG visual assets
docs/                     Full documentation + API reference
tests/                    98 tests across all layers
```

---

## Contributing

PRs welcome. Run `python -m pytest tests/ -v` before submitting.

## License

MIT — See [LICENSE](LICENSE).

---

<div align="center">

**Built with VNX BitLattice v3 • Powered by Hedera • Verifiable by default**

[Live Dashboard](http://localhost:8080/fast/dashboard) · [API Docs](docs/api-reference.md) · [VNX Prediction Swarm](docs/VNX_PREDICTION_SWARM.md)

</div>
