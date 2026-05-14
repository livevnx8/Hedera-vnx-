# Hedera as Vera's Verifiable Memory Plane

Vera should use Hedera as a low-cost, immutable memory plane for compact proof records, not as a bulk file store or private database.

The useful framing is:

```text
Vera brain state -> compact proof packet -> HCS topic -> mirror node/indexer -> searchable memory -> proof-backed retrieval
```

Hedera gives Vera durable ordering, consensus timestamps, topic-based routing, public verification, and low-cost finality. Vera adds the application semantics: task lifecycle, agent reputation, settlement, lessons, model promotion evidence, and operator review.

The product claim is precise:

```text
Vera does not store its whole brain on Hedera.
Vera stores the proofs that make its brain trustworthy on Hedera.
```

## Executive Framing

Vera's brain has two parts:

- **Working intelligence**: models, vector stores, operational databases, dashboards, and private customer context.
- **Verifiable memory**: compact Hedera-backed proof packets that say what happened, when it happened, who approved it, what changed, and which hashes prove the larger artifacts.

Working intelligence can be fast, private, and upgradeable. Verifiable memory is durable, ordered, and auditable. Vera becomes more credible when every important claim made by working intelligence points back to verifiable memory.

For Hedera, this is a strong use case because Vera turns HCS from "logs on-chain" into an application memory substrate:

```text
consensus event history + mirror-node access + local indexes + AI retrieval = proof-backed agent memory
```

That is the leverage: Vera gets trustworthy memory at low cost, and Hedera gets a high-value AI proof workload that repeatedly uses consensus, mirror-node reads, and public verification.

## Core Principle

HCS is Vera's source of truth for compact, immutable evidence. Local databases, object storage, vector indexes, and model memory can be rebuilt or challenged by replaying Hedera receipts and mirror-node history.

Store on HCS:

- Hashes of task inputs, results, lessons, receipts, model evaluations, and settlement records.
- Compact lifecycle events: task posted, bid received, award made, result verified, payment settled, reputation updated.
- Topic IDs, transaction IDs, consensus timestamps, sequence numbers, and running hash references.
- Short operator-approved summaries and quality scores.
- Pointers to off-chain artifacts, such as object-store URLs, IPFS CIDs, database IDs, or vector index keys.
- Integrity metadata: schema version, payload hash, signer, verifier, confidence, and replay instructions.

Do not store on HCS:

- Raw prompts, raw private model traces, secrets, private keys, customer payloads, or unreviewed conversations.
- Large generated outputs, embeddings, full documents, raw datasets, or bulky logs.
- Anything that may need deletion, redaction, or privacy correction.

## Why This Matters

This gives Vera leverage in three ways:

1. Low-cost memory: Vera stores only compact evidence packets and hashes on Hedera, keeping permanent ledger cost low.
2. Immutable truth: each important memory has consensus ordering, timestamping, and public verification.
3. Useful access: mirror-node reads and Vera's own indexes make the ledger behave like a proof-backed data layer.

The result is not a traditional cloud data center. It is better for Vera's core trust problem: a verifiable event stream that other systems can read, replay, and audit.

## Architecture Layers

Use four layers:

1. **HCS ledger layer**
   Compact immutable events, one packet per meaningful transition or approved lesson.

2. **Mirror/index layer**
   Mirror-node reads, HashScan links, topic replay, and Vera-owned indexes keyed by topic, sequence, transaction ID, agent, task, and proof hash.

3. **Hot operational layer**
   SQLite/Postgres/Redis state for current tasks, queues, bids, settlements, and dashboards.

4. **Knowledge layer**
   Vector/RAG stores, git lattice, lesson catalogs, and upgrade packages. Every promoted item points back to HCS or block-stream evidence.

The replay rule:

```text
if hot state and HCS disagree, HCS plus settlement receipts win
```

## Lattice Ability Model

Vera's lattice becomes stronger when each ability is attached to a proof lane. The goal is not to make the lattice mystical or decorative; the goal is to make every reusable capability traceable to verified work.

Each lattice ability should include:

- `abilityId`: stable name such as `proof-backed-recall` or `workflow-recovery`.
- `hcsEvents`: event types that feed the ability.
- `latticeNodes`: node types that can use the event, such as `proof`, `capability`, `lesson`, or `upgrade_package`.
- `promotionEvidence`: the evidence required before the ability can influence production behavior.
- `retrievalPolicy`: whether the ability can be used automatically, only as assistant context, or only after operator review.

Initial abilities:

| Ability | Role | HCS events | Promotion bar |
| --- | --- | --- | --- |
| `proof-backed-recall` | Retrieve context only when packet hashes and HCS references verify. | `task.proof_complete`, `result.verified`, `settlement.released`, `reputation.updated` | HCS receipt, replay index, deterministic test |
| `agent-reputation-memory` | Rank agents from verified outcomes and settled work. | `bid.submitted`, `result.verified`, `settlement.released`, `reputation.updated` | settlement proof, reputation proof, dashboard metric |
| `workflow-recovery` | Rebuild useful local state from mirror-node replay. | `task.posted`, `task.awarded`, `result.verified`, `lesson.approved` | recovery test, hash verification, gap report |
| `upgrade-package-provenance` | Promote repeated lessons into reusable marketplace packages. | `lesson.approved`, `lesson.superseded`, `upgrade_package.published` | operator approval, source receipts, package tests |
| `policy-corrective-memory` | Keep immutable history while marking corrected packets out of active recall. | `policy.reviewed`, `memory.corrected`, `lesson.superseded` | correction packet, operator reason, dashboard state |

This gives Vera an ability graph:

```text
HCS packet -> mirror replay -> local index -> lattice node -> retrieval policy -> agent behavior
```

No ability should affect production behavior merely because it exists in a vector store. It must pass the proof lane that matches its risk.

## Topic Model

Start with a small topic set and shard only when volume proves the need.

| Topic | Purpose | Example events |
| --- | --- | --- |
| `VERA_TASK_TOPIC_ID` | Marketplace task intents | `task_posted`, `task_cancelled`, `task_expired` |
| `VERA_RESULT_TOPIC_ID` | Bids and agent outputs | `bid_submitted`, `result_submitted`, `result_hash_attached` |
| `VERA_AUDIT_TOPIC_ID` | State transitions | `award_made`, `verification_passed`, `settlement_released`, `reputation_updated` |
| `VERA_AGENT_LEARNING_TOPIC_ID` | Approved lessons | `lesson_candidate`, `lesson_approved`, `upgrade_package_published` |
| `VERA_COMPLIANCE_AUDIT_TOPIC_ID` | Compliance-grade evidence | `operator_review`, `policy_gate`, `risk_exception` |

Use domain topics only when they improve access patterns or cost:

- Carbon verification.
- DeFi intelligence.
- Hedera transaction assistance.
- Agent marketplace quality.
- Operator harmony and infrastructure evidence.

## Memory Packet

Every HCS memory packet should be compact, typed, hash-addressable, and replayable.

```json
{
  "_vera": {
    "schema": "vera.memory.packet.v1",
    "eventType": "task.verified",
    "eventId": "evt_01H...",
    "network": "testnet",
    "source": "vera-orchestrator",
    "createdAt": "2026-04-28T00:00:00.000Z",
    "taskId": "task_123",
    "agentId": "agent_456",
    "correlationId": "run_789"
  },
  "_hip993": {
    "type": "VERA_MEMORY_PACKET",
    "version": "1.0.0",
    "max_chunk_size": 4096,
    "features": ["chunking", "sequence_tracking", "integrity_hash"]
  },
  "proof": {
    "payloadHash": "sha256:...",
    "resultHash": "sha256:...",
    "settlementHash": "sha256:...",
    "reputationHash": "sha256:...",
    "packetHash": "sha256:..."
  },
  "summary": {
    "status": "verified",
    "confidence": 0.92,
    "shortText": "Carbon audit task verified and settlement released."
  },
  "refs": {
    "localRecordId": "run_789",
    "dashboardPath": "/proof/runs/run_789",
    "artifactUri": "ipfs://...",
    "blockStreamRef": null
  }
}
```

Keep summaries short. If a packet grows beyond the HIP-993 limit, chunk it through the HCS submit path and preserve the `messageId`, chunk count, and sequence numbers.

Required packet fields:

- `_vera.schema`
- `_vera.eventType`
- `_vera.eventId`
- `_vera.network`
- `_vera.source`
- `_vera.createdAt`
- `proof.packetHash`
- at least one domain identifier such as `taskId`, `agentId`, `runId`, `learningPackageId`, or `modelId`
- at least one retrieval reference under `refs`

Compute `packetHash` over the canonical packet with `proof.packetHash` omitted or set to `null`. This gives Vera a stable integrity check even when HCS transport metadata wraps the payload.

## Packet Lifecycle

Every memory packet should move through this lifecycle:

```text
draft -> policy_checked -> submitted -> mirrored -> indexed -> usable
```

Lifecycle states:

- `draft`: packet assembled locally but not yet eligible for HCS.
- `policy_checked`: privacy, size, schema, and learning rules passed.
- `submitted`: HCS transaction submitted and local pending receipt created.
- `mirrored`: mirror node or HashScan confirms the packet is visible.
- `indexed`: Vera local indexes include the packet by task, agent, hash, event type, and topic sequence.
- `usable`: packet can be used in dashboards, retrieval, or approved learning context.

If submission succeeds but mirror confirmation is delayed, keep the packet in `submitted` and retry mirror lookup. If mirror confirmation never appears, mark the packet `unresolved` and require operator review before using it as memory.

## HIP-993 Role

HIP-993 gives Vera a practical transport envelope for HCS memory:

- Larger messages up to 4096 bytes.
- Fewer chunks for normal proof packets.
- Lower HBAR cost for summaries, receipts, and signed evidence.
- Cleaner reconstruction for packets that exceed one message.

Treat HIP-993 as the transport envelope and the Vera memory schema as the semantic envelope.

Recommended convention:

```text
outer _hip993 = transport metadata for chunking and reconstruction
inner _vera = Vera event semantics and replay rules
```

Avoid ambiguous double-wrapping. If a logger adds semantic `_hip993` metadata before calling `hederaMaster.submitMessage()`, document that it is legacy metadata or migrate it to `_vera`.

## HIP Capability Map

Vera should keep HIP usage explicit so product claims stay honest.

| HIP | Vera role | Current posture | Product value |
| --- | --- | --- | --- |
| HIP-993 | HCS large-message transport, chunking, and reconstruction. | Wired for memory packets and replay worker. | Lower cost and cleaner replay for compact proof memory. |
| HIP-1056 | Block-stream evidence and network-verifiable closure. | Observe-first until production smoke tests attach block proof references. | Stronger production claims and third-party auditability. |
| HIP-991 | Revenue-generating topic IDs. | Planned. | Premium customer proof streams and partner-funded evidence lanes. |
| HIP-1200 | Threshold-signature council approvals. | Shimmed until SDK/network support is mature. | Safer multi-operator approvals for sensitive upgrades and policy exceptions. |

The implementation rule is simple: a HIP can be mentioned as a production feature only when Vera has a passing test, an operator path, and an evidence packet that proves the behavior. Until then it stays `planned`, `shimmed`, or `observe-first`.

## Access Pattern

Vera should access Hedera memory through this path:

1. Write compact packet to HCS.
2. Store local pending receipt with task/run ID.
3. Confirm transaction ID, topic ID, sequence number, and consensus timestamp.
4. Mirror-node poll or HashScan lookup confirms availability.
5. Index compact metadata locally for fast dashboard and agent retrieval.
6. Retrieve off-chain artifact only when needed.
7. Verify artifact hash against the HCS packet before using it as memory.

This keeps Vera memory fast for the application while preserving Hedera as the trust anchor.

## Event Taxonomy

Every packet should use a stable event type. This keeps Vera memory searchable and lets third parties understand the stream without private code.

Recommended event families:

| Family | Purpose | Examples |
| --- | --- | --- |
| `task.*` | Marketplace intent and lifecycle | `task.posted`, `task.awarded`, `task.expired` |
| `bid.*` | Agent bid activity | `bid.submitted`, `bid.withdrawn`, `bid.rejected` |
| `result.*` | Agent output and verifier state | `result.submitted`, `result.verified`, `result.rejected` |
| `settlement.*` | Payment evidence | `settlement.locked`, `settlement.released`, `settlement.reclaimed` |
| `reputation.*` | Agent score changes | `reputation.updated`, `reputation.penalized` |
| `lesson.*` | Approved learning records | `lesson.candidate`, `lesson.approved`, `lesson.superseded` |
| `model.*` | Model validation and deployment | `model.validated`, `model.canary_started`, `model.rollback` |
| `infra.*` | Scaling and operator evidence | `infra.scaling_run`, `infra.hpa_scaled`, `infra.health_check` |
| `policy.*` | Governance and operator gates | `policy.reviewed`, `policy.exception`, `policy.blocked` |

Event names should be append-only. If semantics change, create a new schema version rather than changing the meaning of an existing event.

## Query Model

Vera should make Hedera memory useful through local indexes built from mirror-node replay.

Minimum indexes:

- By `taskId`: reconstruct the full marketplace lifecycle.
- By `agentId`: build reputation, reliability, and proof completeness history.
- By `eventType`: answer operational and audit questions.
- By `payloadHash` or `resultHash`: prove a specific artifact existed at a consensus time.
- By `transactionId` and `sequenceNumber`: deep-link to HashScan and mirror-node proof.
- By `learningPackageId`: connect lessons to their source tasks, receipts, and approvals.

Useful API shape:

```text
GET /api/vera/memory/events?taskId=...
GET /api/vera/memory/events?agentId=...
GET /api/vera/memory/proof/:hash
GET /api/vera/memory/replay/:taskId
GET /api/vera/memory/lessons/:packageId
```

The API should return fast local index results plus the underlying HCS references. A dashboard can be fast, but each important row needs a path back to topic ID, sequence number, transaction ID, and consensus timestamp.

Recommended response shape:

```json
{
  "eventId": "evt_01H...",
  "eventType": "task.verified",
  "summary": "Task verified and settlement released.",
  "proof": {
    "packetHash": "sha256:...",
    "topicId": "0.0.x",
    "sequenceNumber": 123,
    "transactionId": "0.0.x@...",
    "consensusTimestamp": "..."
  },
  "links": {
    "hashscan": "https://hashscan.io/testnet/topic/0.0.x",
    "dashboard": "/proof/runs/run_789"
  },
  "current": true,
  "supersededBy": null
}
```

Dashboard rule: show fast local state, but expose Hedera proof behind every promoted claim.

## Correction and Supersession

HCS is immutable, so Vera should not edit memory. Corrections are new events.

Use this pattern:

```text
bad or incomplete packet -> correction packet -> supersedes reference -> dashboard marks current truth
```

A correction packet should include:

- `correctsEventId`
- `correctsTransactionId`
- `reason`
- `newPayloadHash`
- `operatorId` or policy gate
- `createdAt`

The original event remains visible as history. The index marks the correction as the current interpretation.

This is a strength. Vera gets auditability without pretending mistakes vanish.

Corrections should never erase learning history. If a lesson was derived from a corrected packet, Vera should emit `lesson.superseded` and point to the replacement lesson or mark the package unsafe for reuse.

## Recovery Model

Recovery is one of the strongest reasons to use Hedera.

If Vera loses local state, it should be able to:

1. Read configured topic IDs.
2. Replay mirror-node messages from the last known sequence or from genesis.
3. Reconstruct task, bid, result, settlement, reputation, and lesson state.
4. Rehydrate local indexes.
5. Verify off-chain artifacts by hash only when needed.
6. Produce a recovery report listing missing artifacts, corrections, and unresolved gaps.

This makes Hedera the canonical event history and local databases rebuildable caches.

The practical test:

```text
delete local proof index -> replay HCS topics -> dashboard returns the same closed proof loops
```

## Cloud Data Center Analogy

It is fair to describe the system as cloud-like if the language stays precise.

Hedera is not Vera's storage bucket, GPU cluster, or vector database. Hedera is Vera's consensus memory plane.

Cloud-like properties Vera gets from Hedera:

- Durable globally readable event history.
- Consensus timestamps and ordering.
- Topic-based data partitioning.
- Public auditability.
- Low-cost proof of existence.
- Multi-party trust without Vera hosting the trust layer alone.

Cloud-like properties Vera still owns off-chain:

- Fast search.
- Heavy storage.
- Embeddings and semantic retrieval.
- Private customer data.
- Model inference and training.
- Dashboards, APIs, and operational caches.

The right phrase is:

```text
Hedera-backed memory plane with off-chain compute and indexing
```

That is stronger and more accurate than calling HCS a cloud database.

A useful analogy:

```text
Hedera is the notarized control plane.
Vera's databases are the working memory.
Vera's vector stores are associative recall.
Vera's models are reasoning engines.
```

The control plane decides what can be trusted. Working memory makes it fast. The model layer makes it useful.

## Cost Discipline

Use Hedera for what Hedera is best at:

- Consensus ordering.
- Immutable audit events.
- Public proof of existence.
- Cross-party verification.
- Compact high-value memory.

Keep costs low by:

- Batching low-priority logs.
- Emitting only lifecycle transitions and approved lessons.
- Storing hashes and summaries instead of raw data.
- Using domain topics only where access or governance benefits justify them.
- Compressing and chunking only when the summary cannot fit.
- Separating operational telemetry from proof evidence.

Operational telemetry can stay in Prometheus/log files. Proof evidence belongs on HCS.

Suggested write policy:

| Priority | Write behavior | Examples |
| --- | --- | --- |
| Critical | Immediate HCS write | settlement release, verifier failure, policy exception |
| High | HCS write within seconds | task award, result verification, reputation update |
| Normal | Batch through HIP-993 | routine lifecycle events, approved summaries |
| Low | Off-chain only unless promoted | debug logs, raw metrics, transient health signals |

This reserves HCS for durable memory rather than noisy telemetry.

## Vera Brain Policy

Vera can learn from Hedera-backed memory only when a packet is approved for learning.

Learning-safe packets should include:

- `learnable: true`
- operator or policy approval
- source task/run ID
- proof hash
- privacy classification
- short lesson text
- quality score
- rollback or correction reference when applicable

Learning-unsafe packets should remain audit evidence only.

Never train on private customer data just because a hash or event exists on HCS.

Vera retrieval should prefer proof-backed context in this order:

1. Closed proof loops with settlement and reputation evidence.
2. Operator-approved lessons with HCS receipts.
3. Test-proven codebase lessons linked to commits or evidence packets.
4. Unclosed observations, clearly labeled as draft context.

The model can reason over draft context, but it cannot promote draft context into product claims.

## Privacy and Redaction

Immutability makes privacy discipline non-negotiable.

Before writing to HCS, Vera should run a policy check for:

- secrets and private keys
- raw prompts and private model traces
- personal data
- customer payloads
- confidential business data
- unapproved training examples
- large text blocks that should be hashed instead

If a sensitive payload was accidentally referenced, the correction flow should mark the old event unsafe and point to a sanitized replacement. The original cannot be removed from HCS, so prevention matters more than cleanup.

## Data Product

The public-facing product is not "we log to HCS." The product is proof-backed intelligence.

Vera should expose:

- Proof replay: show the whole task lifecycle from Hedera-backed events.
- Agent scorecards: reputation backed by settlement and verification receipts.
- Learning provenance: each upgrade package points to approved evidence.
- Cost ledger: HCS cost per proof run, per task, and per lesson.
- Recovery confidence: last replay time, missing sequences, correction count, and unresolved gaps.

This is how Hedera becomes leverage for Vera: every useful claim has a low-cost, immutable receipt.

## Operator Proof Surfaces

The memory plane needs surfaces that operators, customers, and auditors can understand.

| Surface | Readiness | Must show |
| --- | --- | --- |
| `GET /api/vera/workflows/elliptical-proof` | Wired | Workflow stages, HCS memory plane, HIP roles, lattice abilities, and promotion gates. |
| `npx tsx scripts/prove-vera-memory-loop.ts` | Wired | Run ID, task ID, packet hash, validation issues, and replay index count. |
| `src/vera/memory/mirrorReplayWorker.ts` | Wired | Sequence number, consensus timestamp, packet hash, invalid packet count, and pending chunks. |
| `GET /api/vera/memory/proof/:hash` | Planned | Packet hash, topic ID, sequence number, transaction ID, HashScan URL, correction state. |
| `/vera/proof` dashboard | Planned | Task lifecycle, HCS links, settlement state, reputation delta, and replay health. |

These surfaces give Vera a clean way to answer: "show me the proof, show me where Hedera recorded it, and show me whether Vera can replay it."

## Promotion Ladder

Use a staged ladder so Vera can claim progress without overstating readiness.

1. **Local proof**
   Deterministic tests pass, the memory packet validates, and local mirror replay indexes one packet by task, agent, event, and hash.

2. **Testnet proof**
   A funded Hedera testnet write produces a topic ID, sequence number, transaction ID, HashScan link, and mirror-node replay confirmation.

3. **Dashboard proof**
   The operator dashboard reads from the replay index and shows settlement, reputation, corrections, supersession, and unresolved gaps.

4. **Production proof**
   Mainnet or production topic policy is approved, cost guardrails are active, privacy review is complete, and rollback/correction behavior has been tested.

## Risk Controls

The main risks are known and manageable:

| Risk | Control |
| --- | --- |
| Private data lands on immutable HCS topics. | Write only compact hashes, summaries, and approved references; run policy checks before emission. |
| Models treat unverified memory as truth. | Require packet hash validation and replay indexing before memory influences production behavior. |
| Local state diverges from Hedera history. | Replay configured topics and report missing sequences, invalid packets, and unresolved corrections. |
| HCS cost grows from noisy telemetry. | Apply write lanes: critical/high write promptly, normal batches, low-value telemetry stays off-chain. |
| Mistakes become permanent confusion. | Emit correction/supersession packets; dashboard marks current truth without hiding history. |

## Implementation Roadmap

Phase 1: Packet discipline

- Create a shared Vera memory packet builder.
- Move semantic metadata into `_vera`.
- Keep `_hip993` reserved for transport and chunk reconstruction.
- Add unit tests for packet size, required fields, hash generation, and privacy checks.
- Add a migration note for existing loggers that currently use semantic `_hip993` metadata.

Phase 2: HCS proof writes

- Route task, bid, result, settlement, reputation, and lesson events through the packet builder.
- Use `hederaMaster.submitMessage()` with `maxChunkSize: 4096`.
- Store transaction ID, topic ID, sequence number, and consensus timestamp in local receipts.

Phase 3: Mirror replay

- Build a mirror-node replay worker for Vera topics.
- Reconstruct packet indexes by task, agent, event type, hash, and learning package.
- Add a recovery test that rebuilds local proof state from HCS history.

Phase 4: Dashboard and API

- Expose proof replay APIs.
- Add HashScan links for every important lifecycle step.
- Show correction/supersession state clearly.
- Separate operational telemetry from HCS-backed proof evidence.

Phase 5: Brain integration

- Allow only learning-approved packets into Vera's knowledge layer.
- Attach every lesson and upgrade package to HCS proof.
- Use retrieved memory as context, not as unverified training data.

Phase 6: External proof surface

- Publish a compact proof API for customers and auditors.
- Provide HashScan links and mirror-node references.
- Export a signed proof bundle for each closed task.
- Document how third parties can verify Vera without trusting Vera's database.

## Readiness Bar

This architecture becomes production-grade when Vera can show:

- A task lifecycle fully replayed from HCS topics.
- A proof dashboard that links task, bid, award, result, settlement, reputation, and HCS receipts.
- HIP-993 chunking evidence with transaction IDs and reconstruction success.
- Cost report showing HCS spend per request or per proof run.
- A recovery test where local state is rebuilt from HCS/mirror-node history.
- A privacy review showing raw private content is not written to HCS.

Until then, the honest label is:

```text
architecture: strong
implementation: partially wired
production proof: pending evidence packets
```

## Positioning

Vera uses Hedera as a low-cost immutable memory plane: compact proof packets on HCS, fast indexes off-chain, and every important agent action replayable from public consensus history.
