# VNX BitLattice Engineering Standard

VNX BitLattice is Vera's sovereign edge-model lane: BitNet-inspired ternary weights, lattice-routed execution, QVX observability, and portable artifacts that can run without a vendor API.

Status: `prototype`.

## Source Of Inspiration

Microsoft `bitnet.cpp` proves that native 1.58-bit models deserve their own inference stack instead of being treated as ordinary quantized transformers. Its useful lessons for Vera are:

- Ternary weights are a runtime primitive, not a compression afterthought.
- Kernels should exploit {-1, 0, +1} arithmetic directly.
- Edge inference needs CPU-first operation, with GPU/NPU lanes as accelerators.
- Model format, quantization type, context size, and kernel strategy must be explicit.

Primary references:

- https://github.com/microsoft/BitNet
- https://www.microsoft.com/en-us/research/publication/1-bit-ai-infra-part-1-1-fast-and-lossless-bitnet-b1-58-inference-on-cpus/
- https://huggingface.co/papers/2402.17764

## VNX Difference

VNX should not clone `bitnet.cpp`. It should add a topology that frontier stacks do not expose.

```text
corpus -> tokenizer -> ternary train/quantize -> lattice router -> vertex-local distributions
       -> traceable sampler -> .vnx artifact -> QVX metrics/proofs
```

The current browser Forge implements the smallest honest version:

- Character-level vocabulary.
- Context window `K=4` by default.
- 60 scalable lattice vertices by default, with the original 20-vertex dodecahedron retained as the tiny inspection preset.
- Mean-absolute-value ternarization into {-1, 0, +1}.
- Five ternary weights packed per byte.
- Hover-level provenance for every emitted character.
- Corpus SHA-256 embedded in the `.vnx` artifact.
- Local proof packet export with model hash, prompt hash, output hash, trace hash, and HCS-ready summary.
- Hybrid swarm routing that selects up to four `.vnx` specialists by prompt keywords instead of running every specialist.

## Runtime Tiers

| Tier | Runtime | Purpose | Readiness |
| --- | --- | --- | --- |
| `forge-browser` | Browser JS + Web Worker | Sovereign MVP, export/import, trace UI | wired |
| `vnx-browser-swarm` | 12 tiny `.vnx` specialists | Keyword-routed local context signals for Forge and Vera chat | wired |
| `forge-wasm` | WASM SIMD kernels | Browser-scale corpora and faster inference | planned |
| `vnx-cpu` | Node/native CPU kernels | `bitnet.cpp`-class local service lane | planned |
| `vnx-qvx` | QVX router + Vera observability | lattice metrics, proof packets, marketplace upgrade lane | planned |
| `vnx-gpu` | WebGPU/CUDA/NVIDIA lane | accelerated training/inference when local hardware is visible | research |

## Artifact Contract

`.vnx` is the sovereign artifact.

Header:

```text
0..2   magic bytes: VNX
3      format version
5      context size
6      vertex count
8..11  metadata JSON byte length, little-endian
12..   metadata JSON, then packed ternary weights
```

Packing:

```text
-1 -> 0
 0 -> 1
+1 -> 2
5 weights per byte because 3^5 = 243
```

Metadata must include:

- architecture
- topology
- tokenizer family
- context size
- vertex count
- vocabulary
- trained token count
- fired vertex count
- weight histogram
- packed weight count
- corpus SHA-256
- creation timestamp

## Proof Packet Contract

Every meaningful inference run should be exportable as local evidence.

`VNX-LM-PROOF-1` contains:

- `proofHash`: canonical hash of the proof packet.
- `model.hash`: SHA-256 of the exported `.vnx` bytes.
- `model.corpusHash`: SHA-256 of the training corpus.
- `inference.promptHash`: SHA-256 of the prompt, without storing the raw prompt in the HCS-ready summary.
- `inference.outputHash`: SHA-256 of the generated text, without storing raw output in the HCS-ready summary.
- `inference.traceHash`: SHA-256 of the normalized token trace.
- `trace`: local full trace entries with token, vertex, probability, and top candidates.
- `hcsReadySummary`: compact hash-only packet for later Hedera publication.

Privacy rule: raw prompt and raw generated output can exist in local operator exports, but the HCS-ready summary stays hash-only.

## QVX Integration Path

VNX becomes useful to the full stack when it emits the same kind of compact evidence Vera already trusts.

Required QVX signals:

- `vnx.train.started`
- `vnx.train.progress`
- `vnx.train.completed`
- `vnx.model.exported`
- `vnx.model.imported`
- `vnx.inference.completed`
- `vnx.vertex.fired`
- `vnx.trace.generated`
- `vnx.swarm.selected`
- `vnx.swarm.context_injected`

Promotion evidence:

- Deterministic unit tests for packing and import/export.
- Local browser smoke with Web Worker training.
- Corpus hash visible in the UI and artifact.
- Trace sample showing token, vertex, top candidates, and probability.
- HCS-ready proof packet containing model hash, corpus hash, runtime tier, prompt hash, output hash, and trace hash.
- `npm run eval:vnx-swarm` passes the `VNX-SWARM-EVAL-1` routing and context benchmark before swarm behavior is promoted.

## Swarm Evaluation Standard

VNX swarm behavior should improve Vera by measurable routing quality, not by adding noise.

`VNX-SWARM-EVAL-1` checks:

- Prompt domains: code, Hedera, QVX, security, memory, topology, data, creative, and dialogue.
- Expected specialist routing: each case defines required or acceptable specialists.
- Negative routing: simple prompts should avoid unrelated specialists.
- Context usefulness: prompt context must include specialist names and guidance terms.
- Bounded execution: no more than four specialist outputs are used per prompt.
- Adaptive route weights: evaluation reports recommend bounded specialist boosts or penalties while preserving keyword routing.

Promotion gate:

```text
pass rate >= 90%
score ratio >= 85%
all required VNX tests pass
```

If the evaluator fails, the swarm can still run as a prototype, but it should not be described as improving Vera until the failing routes are fixed.

The evaluator writes `docs/evidence/vnx-swarm-eval-latest.json` as a local promotion packet. That packet includes per-specialist stats and `recommendedRouteWeights`, which can be reviewed before being applied to the live router.

## Lattice Workflow Standard

`VNX-LATTICE-WORKFLOW-1` expands VNX from prompt context into Vera's work fabric.

Workflow modes:

1. `assistive`: selected specialists advise one response.
2. `parallel`: selected specialists run as separate lanes and merge only at synthesis.
3. `proofed`: parallel lanes must pass verification and receipt stages.
4. `learning`: proofed workflow output can become a lesson or route-weight candidate.

The planner emits:

- selected specialists and route reasons
- parallel lane IDs and expected outputs
- proof gates for each lane
- learning hooks for verified outcomes
- adaptive route weights as explicit lane metadata

API surface:

- `POST /api/vera/workflows/vnx-lattice-plan`

Architecture rule: parallel VNX work must stay separated by specialist lane until synthesis. Vera can merge the answer, but the route, proof requirement, and learning hook remain inspectable.

## Scaling Lane

Keep the MVP char-level until the artifact and trace contract are stable. Then add tokenizer families without breaking `.vnx`:

1. `char`: current MVP and inspection mode.
2. `byte`: UTF-8 byte-level route for arbitrary data and binary-safe corpora.
3. `subword`: BPE or Unigram tokenizer with lattice-router embeddings.
4. `qvx-symbol`: domain symbols from receipts, tools, prices, HCS events, and agent outcomes.

The extreme edge intelligence target is not merely a smaller chatbot. It is a local reasoning fabric where each token has a route, each route can be inspected, each model can be moved as a file, and each promoted learning event can point back to proof.
