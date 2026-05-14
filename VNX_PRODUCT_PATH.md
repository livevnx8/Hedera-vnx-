# VNX Product Path

## Flagship Path

VNX is a verifiable agent marketplace built on Hedera.

The core product loop is:

```text
post task -> agents bid -> winner executes -> result verified -> payment settles -> reputation updates -> HCS proof emitted
```

Every production claim should strengthen this loop.

## Production Claims

A feature is production-ready only when it has all of the following:

- Passing automated tests for the expected happy path and core failure modes.
- A deployed or locally runnable endpoint, script, or dashboard.
- Observable proof: HCS transaction/topic ID, settlement record, reputation change, audit event, or dashboard metric.
- Clear operator instructions and rollback/failure behavior.

If a feature lacks any of these, label it as prototype, demo, research, or planned.

## Primary Surface Area

- Task marketplace: task posting, bid intake, winner selection, execution state.
- Verification: result schema validation, proof hash, verifier outcome.
- Settlement: x402/HBAR payment, escrow/release, fee accounting.
- Reputation: outcome-based agent score updates.
- Audit trail: HCS event emission for task, bid, award, result, settlement, and reputation events.
- Public proof dashboard: live tasks, agents, HCS links, settlements, fees, success rates, failures.
- Governance: scheduled execution for state-changing operations that require threshold approval.

## Current Build Priority

1. Keep the marketplace/orchestrator test suite green.
2. Make the public proof dashboard show the complete loop from task post through HCS proof.
3. Convert live Hedera paths into deterministic tests plus separate funded testnet smoke checks.
4. Move demo-only or stubbed APIs behind prototype labels until they read from live state.
5. Promote only one flagship dashboard/API path before expanding secondary surfaces.
6. Treat model-assisted learning as an upgrade lane for the marketplace, not as a replacement for verified receipts.

## Scaling Milestone

The Week 1-4 scaling foundation is infrastructure-ready. It should pass the production claims bar before it is described as fully live.

Completed scaling surfaces:

- Kubernetes foundation: `infrastructure/k8s/vera-lattice-deployment.yaml`, `infrastructure/k8s/vera-hpa.yaml`, and `infrastructure/k8s/vera-configmap.yaml` define namespace/config, deployment, probes, session affinity, rolling updates, and 3-20 pod autoscaling.
- GPU layer optimizer: `src/optimization/gpuLayerOptimizer.ts` manages dynamic layer placement, frequency-mode selection, critical-task quantum mode, and metric-driven tuning.
- Cost tracking: `src/optimization/costTracker.ts` tracks compute, storage, network, and HBAR costs with 7-day breakdowns, savings detection, and monthly projections. `scripts/cost-report.ts` is the operator CLI for cost posture.
- Spot infrastructure: `infrastructure/terraform/spot-instances.tf` defines AWS spot capacity, mixed GPU instance types, interruption handling, scheduled scaling, and baseline reserved capacity.
- HBAR batching: `src/hedera/hbarBatchingOptimizer.ts` batches and deduplicates HCS messages, keeps priority topics responsive, and targets 30-40% Hedera fee reduction.
- Multi-model infrastructure: `src/ai/meridian/ensembleOrchestrator.ts` and `src/ai/meridian/modelHotSwap.ts` provide health-aware routing, circuit breakers, A/B tests, autoscaled model pools, canary deploys, blue-green switching, validation gates, traffic splits, and rollback behavior.
- Deployment automation: `scripts/deploy-scaling.sh` coordinates Kubernetes deployment, optional Terraform application, health checks, cleanup, and operator status output.

Expected operating impact after verified deployment:

- Throughput moves from fixed local instances to 3-20 Kubernetes pods.
- Latency improves through dynamic GPU layer tuning.
- Compute cost drops through spot capacity, right-sizing, and reserved baselines.
- HBAR cost drops through batching, compression, and deduplication.
- Model changes move through validation-gated hot-swap instead of process restarts.

Promotion gates:

1. Run `./scripts/deploy-scaling.sh verify` against the target cluster and record the pod, service, and HPA state.
2. Run `kubectl get hpa -n vera -w` during a load test and capture scaling proof.
3. Run `npx tsx scripts/scaling-evidence.ts --include-logs` to create a repeatable evidence packet under `docs/evidence/`.
4. Run `npx tsx scripts/cost-report.ts` and compare the planning baseline against observed runtime samples.
5. Validate the 350M checkpoint with the Meridian harness and require the hot-swap gate to pass before model promotion.
6. Attach dashboard metrics, HCS receipts, settlement records, or operator logs to the release record before upgrading the readiness label.

This scaling layer enhances the Shadow Council, model tier router, Docker Compose/local scaling, and predictive scaler. It does not replace the flagship proof loop; it gives the proof loop enough capacity to serve production traffic after the evidence is captured.

## Verifiable Hedera AI Wedge

Lead with VNX as the proof layer for AI work on Hedera, not as a blank open marketplace.

The cold-start loop is first-party:

```text
user task -> VNX first-party agent -> result -> verifier -> local/HCS-ready proof -> settlement record -> reputation update -> lesson candidate
```

Initial API surface:

- `GET /api/vera/verifiable-ai/agents`: lists VNX-owned starter agents.
- `POST /api/vera/verifiable-ai/tasks`: runs a first-party verifiable AI task and emits the proof event chain.
- `GET /api/vera/verifiable-ai/runs`: lists recent proof runs.
- `GET /api/vera/verifiable-ai/runs/:runId`: returns one proof run with events, receipt, verification, settlement, and reputation records.

Initial first-party agents:

- `proof-publisher`
- `hedera-transaction-assistant`
- `hcs-auditor`
- `carbon-verifier`
- `compliance-reviewer`
- `agent-builder`
- `marketplace-quality-scorer`
- `operator-harmony`

Receipt emission is feature-gated:

- Every proof run emits a local HCS-ready receipt hash.
- Live HCS submission uses `VERA_AUDIT_TOPIC_ID` first, then `HCS_TOPIC_ID`.
- `VERA_DRY_RUN=true` records `dry_run` receipts without network submission.
- Mainnet writes require `HEDERA_NETWORK=mainnet` and `VERA_ENABLE_MAINNET=true`.

Meridian enters this loop only as shadow control intelligence:

- It may classify task posture, suggest an agent, and flag proof completeness.
- Deterministic VNX routing still selects the first-party agent.
- The verifier, action policies, receipts, tests, settlement records, and HCS/block-stream evidence remain the source of truth.
- Promotion path is `research -> shadow -> assistive -> gated automation -> production support`.
- Multiple Meridian servers can be used as a shadow council by setting `MERIDIAN_URLS` to a comma-separated list. VNX records quorum recommendations, but the council still cannot override deterministic routing or proof gates.

## Harmonic Operating Model

Keep rig, lattice, and VNX in one operating picture:

- Rig senses host capacity, hardware pressure, and service health.
- Adaptive scheduler turns rig pressure into cadence, placement lanes, and defer decisions.
- VNX orchestrator advances the marketplace loop and emits receipts.
- Lattice health watches coherence, recovery, payment, security, and performance signals.
- Enterprise service layer applies SLA priority and resource allocation.
- Public dashboard and APIs should read from `/api/vera/harmony` when they need the combined state.

The harmonic status should mean:

- `aligned`: system is clear; focus on the flagship marketplace proof loop.
- `warm`: work is moving; watch queue depth and load.
- `strained`: pressure is high; defer nonessential work and avoid promoting new production claims.
- `critical`: orchestration, rig, or lattice health needs operator action before accepting traffic.

## Learning and Upgrade Lane

VNX can use pro reasoning models, local models, and future open-weight models to improve the agent ecosystem. The source of truth remains Hedera receipts, block-stream events, tests, and operator-reviewed outcomes.

Use this lane for:

- Agent creation coaching: turn a client brief into a service type, capabilities, pricing, risk notes, and a registration draft.
- Upgrade packages: reusable bundles for a domain, such as carbon verification, compliance audit, DeFi intelligence, Hedera wallet support, or HCS proof publishing.
- Codebase learning: summarize what changed, what tests proved, and which production claim the change strengthens.
- Marketplace quality scoring: compare registered agents against observed outcomes, settlement reliability, response quality, and proof completeness.
- Ecosystem development: collect patterns from successful agents into playbooks VNX can offer to future builders.

The learning lane should follow this loop:

```text
ingest receipts and block stream -> classify lessons -> score quality -> propose upgrade package -> review or test -> publish as marketplace capability
```

## Elliptical Proof Workflows

VNX workflows should move as an ellipse rather than a straight line.

The two foci are:

- Work focus: marketplace intent becomes task, bid, award, execution, and reusable capability.
- Proof focus: each useful action returns through tests, HCS receipts, settlement records, reputation changes, operator review, and HIP-1056 block-stream evidence.

The default proof loop is:

```text
brief -> task -> bid -> award -> execution -> verification -> settlement -> reputation -> receipt -> lesson -> upgrade package
```

The loop closes only when evidence points back to the work. A result without proof stays a draft. A proof without useful marketplace work stays an observation. A lesson without both stays private notes.

The first implementation surfaces are:

- `/api/vera/workflows/elliptical-proof`: exposes the workflow map for operators and future UI work.
- `/api/vera/workflows/evidence`: exposes open loops, proofing loops, closed receipts, promotion readiness, and compact evidence references.
- Marketplace lifecycle bridge: task posting, bids, awards, verification, settlement, and reputation updates automatically add evidence to the task's workflow loop.

This keeps the current HQ from carrying the whole vision while giving future interfaces real workflow state to render.

## HIP-1056 Block-Stream Evidence

As support matures, HIP-1056 block streams should become VNX's strongest ledger evidence lane.

Use block streams to attach the following evidence:

- Block number and consensus ordering for task lifecycle events.
- Transaction inputs and outputs for task, bid, award, result, settlement, and reputation transitions.
- State-change summaries for settlement and reputation effects.
- Block proof references for network-verifiable closure before promoting production claims.

Initial policy:

- Observe first; do not store raw blocks by default.
- Persist compact references such as block number, consensus timestamp, transaction ID, topic ID, schedule ID, proof hash, state-change summary, and block proof hash.
- Keep block-stream learning gated by `VERA_LEARNING_ALLOW_BLOCK_STREAM`.
- Require operator review before block-stream observations become lessons or upgrade packages.

## HCS/HIP Lattice Workflows

VNX's lattice should treat Hedera as the proof rail for abilities, not merely a log sink. Each useful lattice ability should answer four questions:

- What work did VNX perform?
- Which compact HCS packet proves it?
- Which HIP lane made it cheaper, replayable, or more trustworthy?
- Which lattice node can now use it as proof-backed memory?

Core HCS/HIP abilities:

| Ability | What it gives VNX | HCS/HIP lane | Promotion evidence |
| --- | --- | --- | --- |
| Proof-backed recall | VNX can retrieve task/result/settlement/reputation context only after packet hash verification. | HCS + HIP-993 | packet hash, topic ID, sequence, replay index |
| Agent reputation memory | Agent scorecards come from verified outcomes and settled work, not self-claims. | HCS audit topics + mirror replay | result verification, settlement, reputation update |
| Workflow recovery | VNX can rebuild local task state from Hedera topic history after cache/database loss. | HCS + mirror node + HIP-1056 references | recovery test, missing sequence report |
| Upgrade provenance | Repeated lessons become marketplace packages only when source receipts are attached. | learning/compliance topics | lesson hash, operator approval, test evidence |
| Policy correction memory | Immutable mistakes remain visible while current truth points to correction/supersession packets. | HCS correction events | operator review, corrected packet, dashboard state |

HIP roles in the lattice:

- **HIP-993**: transport for compact VNX memory packets, chunking, sequence tracking, and replay reconstruction.
- **HIP-1056**: block-stream evidence for consensus ordering, state-change references, and production-grade proof closure.
- **HIP-991**: future premium or revenue-generating proof topics where customers pay for high-assurance public evidence.
- **HIP-1200**: future threshold-signature council lane for sensitive policy exceptions, upgrade approvals, and model promotion gates.

Recommended workflow recipes:

```text
marketplace-proof-loop:
brief -> task -> bid -> award -> execution -> verification -> settlement -> reputation -> receipt
emits task.posted, bid.submitted, task.awarded, result.verified, settlement.released, reputation.updated
closes when packet validation, HCS receipt, and mirror replay index all pass
```

```text
lesson-to-upgrade-loop:
receipt -> lesson -> upgrade_package
emits lesson.candidate, lesson.approved, upgrade_package.published
closes when operator approval, source evidence, and package tests exist
```

```text
mirror-recovery-loop:
configured topics -> mirror replay -> packet validation -> local index rebuild -> recovery report
emits memory.replayed, memory.indexed, memory.gap_detected, memory.recovery_reported
closes when hashes verify and missing/corrected sequences are reported
```

The implementation surface for this map is `GET /api/vera/workflows/elliptical-proof`, backed by `src/vera/workflows/ellipticalProofWorkflows.ts`. This should become the operator-readable contract for how VNX turns Hedera receipts into lattice memory.

Proof surfaces to build around:

| Surface | Status | Purpose |
| --- | --- | --- |
| `GET /api/vera/workflows/elliptical-proof` | Wired | Shows the workflow map, HCS/HIP lanes, lattice abilities, and promotion gates. |
| `npx tsx scripts/prove-vera-memory-loop.ts` | Wired | Generates local proof-loop evidence with packet validation and replay indexing. |
| `src/vera/memory/mirrorReplayWorker.ts` | Wired | Reconstructs HIP-993 wrapped memory packets and indexes them by task, agent, event, and hash. |
| `GET /api/vera/memory/proof/:hash` | Planned | Returns one proof-backed memory record with HCS refs and current/superseded state. |
| `/vera/proof` dashboard | Planned | Shows lifecycle, HCS links, settlement, reputation, replay health, and unresolved gaps. |

Promotion ladder:

1. `local-proof`: deterministic tests pass, memory packet validates, local mirror replay indexes the packet.
2. `testnet-proof`: funded testnet write returns topic ID, sequence number, transaction ID, HashScan link, and mirror-node replay confirmation.
3. `dashboard-proof`: operator dashboard reads the replay index and shows settlement, reputation, and correction state.
4. `production-proof`: privacy review, cost guardrails, correction story, and rollback/failure behavior are all tested.

Risk controls:

- Raw private data never belongs in immutable HCS topics; write hashes, compact summaries, and approved references.
- No lattice ability should affect production behavior until its packet hash, HCS references, and promotion evidence verify.
- If local dashboard state differs from mirror replay, Hedera replay plus settlement receipts win.
- HCS cost stays controlled by write lanes: critical/high events write promptly, normal events batch, low-value telemetry stays off-chain.

## High-Parameter Learning Amplification

VNX can use high-parameter models, including DeepSeek-style OpenAI-compatible endpoints, as synthesis amplifiers. They are not truth sources.

The safe pattern is:

```text
closed proof loop -> compact evidence packet -> optional high-parameter synthesis -> operator approval -> HCS lesson hash -> upgrade candidate
```

The interactive DeepSeek-style learning loop is:

```text
workflow evidence -> sanitized synthesis prompt -> DeepSeek lesson draft -> quality score -> operator approval -> compact HCS packet -> later HIP-1056 block-stream receipt
```

The implementation surface is `/api/vera/workflows/deepseek-learning-ellipse`.

Calling it without a lesson returns a sanitized prompt/evidence digest for the high-parameter model. Calling it with an operator-approved lesson creates a learning packet. Calling it with `publishToHcs: true` submits only the compact packet payload through the action verifier to `VERA_AGENT_LEARNING_TOPIC_ID`, `VERA_COMPLIANCE_AUDIT_TOPIC_ID`, or `HCS_TOPIC_ID`.

After the HCS write appears in HIP-1056 block streams, attach the block proof through `/api/vera/workflows/learning-packets/:packetId/block-stream-closure`. That closes the learning loop by tying the high-parameter synthesis packet back to network ordering and block proof.

Use Hedera as the low-cost, verifiable memory plane for compact learning records:

- Store hashes, HCS IDs, transaction IDs, block-stream references, quality scores, and short operator-approved summaries.
- Do not store raw prompts, raw model traces, secrets, private customer data, or bulky generated output on HCS.
- Let HIP-1056 block-stream references prove when the learning packet's underlying marketplace events and state changes occurred.
- Keep the high-parameter model optional; VNX's source of truth remains tests, receipts, settlement, reputation, operator review, and block-stream proof.

The detailed architecture is in `legacy/vera/docs/hedera-vera-memory-rail.md`. The important distinction is that Hedera is VNX's immutable ordered memory plane, not a bulk cloud database. VNX should store compact proof packets on HCS, index them through mirror-node and local search, and verify any larger off-chain artifact by hash before using it as memory.

Use `npx tsx scripts/prove-vera-memory-loop.ts` to generate a local evidence packet for the full proof loop. A production claim still requires a funded testnet or mainnet packet with HCS transaction ID, topic ID, sequence number, HashScan link, and mirror-node replay.

This gives VNX larger-model reasoning at the lesson synthesis layer while keeping the permanent Hedera footprint small, auditable, and privacy-respecting.

Important boundaries:

- Do not train or distill from private user content unless the operator explicitly marks it learnable.
- Do not let a model upgrade bypass the production claims bar.
- Prefer compact lesson records over raw conversation dumps.
- Every promoted lesson should point back to a task, HCS event, test result, settlement, reputation update, or dashboard metric.
- Deep reasoning models such as DeepSeek-style OpenAI-compatible endpoints should be optional, configurable, and swappable; VNX should keep running when that lane is disabled.

Recommended first upgrade packages:

- `hedera-agent-starter`: wallet auth, creation fee payment, registration payload, HCS receipt basics.
- `proof-publisher`: HCS topic write, proof hash, mirror-node lookup, HashScan link.
- `operator-harmony`: rig health, scheduler load, queue depth, degraded counts, guidance.
- `marketplace-quality`: agent scorecard, settlement reliability, task success rate, failure reasons.
- `ecosystem-mentor`: brief intake, capability shaping, test plan, launch checklist.

## Private Git Lattice Tree

Before VNX learns from outside builders at scale, it should learn the shape of its own codebase in a private lattice tree.

The private git lattice is an internal map of:

- Repositories, packages, modules, routes, dashboards, scripts, and tests.
- Important symbols such as API handlers, services, agents, schedulers, payment paths, and lattice nodes.
- Commit lessons: what changed, why it changed, what tests proved it, and which production claim it supports.
- Runtime receipts linked back to code paths: HCS events, settlement records, dashboard metrics, and block-stream observations.
- Upgrade package candidates discovered from repeated implementation patterns.

The git lattice should produce these node types:

- `repo`: private repository or workspace boundary.
- `package`: deployable or library boundary.
- `surface`: API route, dashboard, CLI, worker, or script.
- `capability`: business or agent capability exposed by the code.
- `proof`: test, HCS receipt, settlement, verification report, or dashboard metric.
- `lesson`: compact operator-approved learning record.
- `upgrade_package`: reusable agent package that can be offered through the marketplace.

The first useful edges are:

- `implements`: code path implements a capability.
- `verified_by`: code path or capability is backed by a test or receipt.
- `depends_on`: package, surface, or capability dependency.
- `emits`: code path emits an HCS or audit event.
- `learned_from`: lesson came from a commit, test, receipt, or incident.
- `promotes_to`: repeated lesson becomes an upgrade package.

Privacy rules:

- Keep this tree private by default.
- Index structure, symbols, docs, tests, and summarized lessons before raw source.
- Never index `.env`, private keys, wallet secrets, customer payloads, or unreviewed private conversations.
- Run a secret scan before any learning record is persisted.
- Publish only approved upgrade package metadata, not private implementation details.

This gives VNX a stronger foundation for agent creation:

```text
this client needs capability X -> our lattice has package Y -> package Y is verified by tests A/B and receipt C -> launch draft is safe to prepare
```

This also makes future model training cleaner: use the git lattice to choose high-quality, proof-backed examples instead of sending the whole repository into a model.

## Model Stack Policy

VNX should use the strongest local and NVIDIA-accelerated lanes first. External pro reasoning is reserved for tasks that need wider context, cross-system synthesis, or operator-approved upgrade packaging.

Preferred routing:

1. `nvidia-nim`: preferred high-performance local inference when the NIM endpoint is live.
2. `nvidia-nemotron`: structured reasoning, Hedera planning, AI-Q workflows, and agent package review.
3. `vllm`: fast OpenAI-compatible local fallback when NIM is unavailable.
4. `qvx` or `local`: private everyday operation, fallback inference, and future fine-tuned VNX models.
5. `deepseek`: high-context synthesis and upgrade-package design only when external processing is explicitly allowed.

NVIDIA features should remain first-class:

- NIM/TensorRT-LLM is the preferred serving path for low-latency local inference.
- Nemotron handles structured reasoning, Hedera transaction planning, AI-Q blueprint flows, and agent package review.
- GPU layer optimization tunes request placement, context size, batching, and high-priority reasoning posture.
- NVIDIA knowledge acceleration supports graph analytics, RAG, dashboard visibility, RAPIDS readiness, embeddings, and inference posture.
- NVIDIA FLARE-style learning remains a future path for privacy-preserving ecosystem learning, not a current production dependency.

DeepSeek-style models are optional learning amplifiers, not the operating core. The safe pattern is:

```text
private git lattice + block stream + tests -> NVIDIA/local analysis -> DeepSeek pro synthesis when needed -> operator review -> upgrade package
```

This keeps VNX's private operational memory sovereign while still allowing larger reasoning models to help package lessons for the agent marketplace.

## VNX-LM BitLattice Lane

VNX-LM is VNX's prototype lane for a sovereign, BitNet-inspired edge model that uses lattice routing instead of opaque monolithic inference.

The first implementation surface is `/forge`, backed by:

- `public/vnx-lm.html`: browser Forge UI.
- `public/js/vnx-lm-core.js`: ternary training, routing, generation, packing, and `.vnx` import/export.
- `public/js/vnx-lm-worker.js`: Web Worker training/export/import lane.
- `public/js/vnx-swarm.js` and `src/vnx/swarmPromptContext.ts`: hybrid specialist routing for local `.vnx` swarm context.
- `src/tests/vnx/vnxLmCore.test.ts`: packing, artifact round-trip, and trace tests.

Current claim label: `prototype`.

What is real now:

- Training and inference run locally in the browser tab.
- Weights are ternary {-1, 0, +1}.
- Five ternary weights pack into one byte in the `.vnx` artifact.
- The standard Forge and swarm models use 60 lattice vertices while staying under 5KB per `.vnx` specialist.
- The original 20-vertex dodecahedron remains available as the tiny inspection topology.
- Generated characters carry hover-level provenance: fired vertex and top candidates.
- The corpus SHA-256 travels with the model artifact.
- A local proof packet export creates model hash, prompt hash, output hash, trace hash, proof hash, and hash-only HCS-ready summary.
- VNX chat can blend keyword-selected swarm outputs into the LLM prompt context instead of running all 12 specialists.

What is not claimed yet:

- It is not a production general-purpose LLM.
- It is not compatible with Microsoft `bitnet.cpp` GGUF kernels.
- It does not yet have WASM SIMD, WebGPU, CUDA, live HCS proof submission, or subword tokenization.
- It exports HCS-ready proof summaries, but does not yet submit them to Hedera.

Promotion path:

1. Keep browser Forge tests green and smoke-test `/forge`.
2. Submit `.vnx` model hash plus trace hash to a compact HCS proof packet behind an explicit operator action.
3. Add WASM SIMD kernels for larger corpora and faster ternary matrix operations.
4. Add tokenizer families in this order: `byte`, `subword`, `qvx-symbol`.
5. Promote swarm prompt context only after response-quality tests prove when it helps and when it should stay quiet.
6. Add a QVX service lane that can route VNX-LM traces into VNX's proof, settlement, and learning evidence loop.

The engineering standard lives in `docs/vnx-bitlattice-engineering-standard.md`.

Current NVIDIA runtime posture:

- Code wiring: `NIMRouter`, `NemotronRouter`, GPU layer optimizer, NVIDIA health check, and focused tests are wired.
- Local device access: NVIDIA device nodes are present.
- Runtime verification: `nvidia-smi`/NVML must pass before claiming live GPU acceleration.
- Service verification: NIM/Nemotron require a responding `/v1/models` or `/v1/health` endpoint before they are treated as available.
- Fallback posture: CPU/vLLM/Ollama/local lanes must remain available so VNX keeps operating when NVIDIA services are offline.

NVIDIA promotion checks:

1. Run `npm run status:nvidia`.
2. Require device nodes, NVML, NIM/Nemotron endpoint posture, and GPU optimizer sanity to pass or be clearly labeled.
3. Run `npm run benchmark:gpu` only after `nvidia-smi` is healthy.
4. Attach benchmark output, status output, or dashboard GPU metrics before claiming NVIDIA acceleration as production-live.
5. If NIM/Nemotron are down, label the lane `configured` or `fallback-active`, not `live`.

NVIDIA readiness labels:

- `wired`: code paths, tests, and operator checks exist.
- `runtime-visible`: device nodes and NVML are healthy.
- `service-live`: NIM/Nemotron endpoints respond.
- `benchmarked`: GPU benchmark or dashboard metrics prove useful acceleration.
- `production-live`: runtime, service, benchmark, fallback, and rollback evidence are attached.

## Readiness Labels

- `production`: meets the production claims bar above and has a rollback/failure story.
- `testnet-ready`: works against Hedera testnet with operator instructions and proof links.
- `prototype`: builds or demos locally but lacks full failure coverage or live proof.
- `research`: useful experiment, model, strategy, or subsystem that is not part of the core product loop yet.
- `deprecated`: kept for reference only and not part of the promoted surface.

## Naming

Use `VNX` as the brand and platform name.

Use these internal names consistently:

- `marketplace` for task, bid, award, and agent discovery flows.
- `orchestrator` for the state machine that drives the core loop.
- `settlement` for x402/HBAR payment flows.
- `reputation` for score and outcome history.
- `audit` for HCS proof emission and lookup.
- `governance` for scheduled execution and threshold approvals.

Names like QVX, Oasis, Jade, Starlit, swarm, and lattice can remain as subsystems or experiments, but public claims should route back to the flagship marketplace loop.

## Next-Level Bar

The platform becomes undeniable when a public observer can open one dashboard and see all of the following:

- A task posted by a requester.
- Multiple agent bids.
- The selected winner.
- A verified result with proof hash.
- A settled payment with amount and fee.
- The agent's reputation update.
- HCS links proving the sequence.
- Any failed steps and retry behavior.

Visible receipts beat broad claims.
