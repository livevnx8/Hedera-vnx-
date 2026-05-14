# Starlit Tech Stack Status

**Date**: 2026-05-10

## Honest Answer: NO - The Prediction Market Does NOT Run on Starlit

The prediction market engine and the Starlit tech stack are **two separate systems** living in the same workspace. They are NOT integrated.

---

## What Starlit IS

**Architecture**: Nano swarm AI with hierarchical micro-specialists

| Layer | Specialists | Size | Lattice |
|-------|-------------|------|---------|
| Domain | 40-50 | ~500 bytes | 120 vertices |
| Concept | 200-400 | ~300 bytes | 30 vertices |
| Pattern | 500-1000 | ~100 bytes | 15 vertices |

**Key Technologies**:
- **BitLattice**: Ternary weights (-1, 0, +1) with lattice routing
- **Ternary QAT**: Quantization-aware training
- **.vnx artifacts**: Custom binary format (16-byte header + metadata + packed weights)
- **Transfer learning**: Parent → child weight downsampling
- **GPU acceleration**: PyTorch CUDA with mixed precision

**Files**:
```
src/starlit/
├── bitlattice_model.py          # NumPy BitLattice
├── bitlattice_model_pytorch.py  # GPU PyTorch version
├── training_pipeline.py         # Specialist training
├── pipeline_orchestrator.py     # Micro-specialist generation
├── domain_layer.py              # Hierarchical classification
├── ternary_qat.py               # Quantization
├── lattice_routing_cuda.py      # CUDA routing
└── distributed_training.py      # Multi-GPU training
```

---

## What the Prediction Market ACTUALLY Uses

**Architecture**: Standard PyTorch neural networks (NOT BitLattice)

| Component | Technology | Starlit? |
|-----------|-----------|----------|
| Model | `nn.Linear` + residual connections | ❌ No |
| Weights | Full precision float32 | ❌ No (Starlit uses ternary) |
| Format | `.pt` PyTorch checkpoints | ❌ No (Starlit uses `.vnx`) |
| Size | ~500KB per model | ❌ No (Starlit: ~100-500 bytes) |
| Training | Standard backprop + Adam | ❌ No (Starlit: ternary QAT) |
| Routing | Standard feedforward | ❌ No (Starlit: lattice routing) |

**The prediction models are standard neural networks trained on price data.**

---

## What's in the SAME Workspace

```
/home/vera-live-0-1/hedera-llm-api/
│
├── Prediction Market (this project)
│   ├── prediction_server_v3.py      ← FastAPI server (40+ endpoints)
│   ├── prediction_engine_fast.py    ← Standard PyTorch models
│   ├── analytics_engine.py          ← Market analytics
│   ├── hedera_connector.py          ← Hedera Mirror Node
│   ├── hedera_agent_toolkit.py      ← Hedera agents
│   └── ...
│
└── Starlit Research (separate project)
    ├── src/starlit/
    │   ├── bitlattice_model.py
    │   ├── bitlattice_model_pytorch.py
    │   └── ...
    └── research/starlit/
        ├── phase2-core-architecture-design.md
        └── phase2-tech-stack-integration.md
```

---

## Integration Possibility

**Could they be connected?** Yes, but requires significant work:

| Task | Effort | Description |
|------|--------|-------------|
| BitLattice for price prediction | 2-3 weeks | Adapt lattice routing for time-series |
| Ternary quantization for models | 1-2 weeks | Convert .pt → .vnx format |
| Specialist swarm for tokens | 2-3 weeks | Domain=token, Concept=indicator, Pattern=signal |
| HCS for model proofs | 1 week | Publish hash-only summaries |

**Current state**: They share a workspace but share NO code.

---

## Bottom Line

| Question | Answer |
|----------|--------|
| Does the prediction market use BitLattice? | **No** - Standard PyTorch |
| Does it use ternary weights? | **No** - Full float32 |
| Does it use .vnx artifacts? | **No** - .pt checkpoints |
| Does it use lattice routing? | **No** - Standard feedforward |
| Are they in the same repo? | **Yes** - Same workspace |
| Can they be integrated? | **Yes** - But requires work |

The prediction market is a **standalone FastAPI application** with standard ML models. Starlit is a **research project** for nano swarm AI. They coexist but do not connect.
