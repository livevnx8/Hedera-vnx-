# Vera OS v2.1 — Mainnet HCS Proof Benchmark

**Date:** May 13, 2026  
**Operator:** `0.0.10294360`  
**Network:** Hedera Mainnet  
**Task Topic:** `0.0.10409351`  
**Learning Topic:** `0.0.10416182`  

## What Was Proven

10 cryptographic proof packets were permanently anchored on Hedera mainnet, creating an immutable, verifiable audit trail of a complete AI marketplace execution lifecycle.

Each proof packet contains:
- **task_id** — unique marketplace task identifier
- **event_type** — lifecycle stage (task posted → settlement complete)
- **proof_hash** — SHA-256 hash of the event payload
- **previous_hash** — chain link to the prior proof (tamper-evident)
- **operator_id** — submitting account
- **timestamp** — execution time

## Benchmark Results

| Metric | Value |
|---|---|
| Mode | **mainnet** |
| Emissions | **10/10 successful** |
| Sequences | 94974–94982 (task) + 1580 (learning) |
| Mean latency | 4,747 ms |
| P95 latency | 5,990 ms |
| Min latency | 3,740 ms |
| Error rate | 0% |
| Chain length | 10 linked proofs |
| Total bytes | 3,110 |

## Proof Chain (full lifecycle)

| # | Event | Seq | Transaction ID |
|---|---|---|---|
| 1 | `marketplace.task.posted` | 94974 | `0.0.10294360@1778720490.615091217` |
| 2 | `marketplace.bid.submitted` | 94975 | `0.0.10294360@1778720498.064144774` |
| 3 | `marketplace.task.awarded` | 94976 | `0.0.10294360@1778720504.186557341` |
| 4 | `marketplace.execution.started` | 94977 | `0.0.10294360@1778720505.205099774` |
| 5 | `marketplace.result.submitted` | 94978 | `0.0.10294360@1778720511.060564395` |
| 6 | `marketplace.verification.passed` | 94979 | `0.0.10294360@1778720520.734402364` |
| 7 | `marketplace.settlement.complete` | 94980 | `0.0.10294360@1778720525.899416940` |
| 8 | `marketplace.reputation.updated` | 94981 | `0.0.10294360@1778720530.062366144` |
| 9 | `proof.chain.anchored` | 94982 | `0.0.10294360@1778720536.347253801` |
| 10 | `learning.lesson.extracted` | 1580 | `0.0.10294360@1778720538.057858035` |

## Verify On-Chain

Every proof can be independently verified on HashScan:

- [Proof 1 — Task Posted](https://hashscan.io/mainnet/transaction/0.0.10294360@1778720490.615091217)
- [Proof 2 — Bid Submitted](https://hashscan.io/mainnet/transaction/0.0.10294360@1778720498.064144774)
- [Proof 3 — Task Awarded](https://hashscan.io/mainnet/transaction/0.0.10294360@1778720504.186557341)
- [Proof 4 — Execution Started](https://hashscan.io/mainnet/transaction/0.0.10294360@1778720505.205099774)
- [Proof 5 — Result Submitted](https://hashscan.io/mainnet/transaction/0.0.10294360@1778720511.060564395)
- [Proof 6 — Verification Passed](https://hashscan.io/mainnet/transaction/0.0.10294360@1778720520.734402364)
- [Proof 7 — Settlement Complete](https://hashscan.io/mainnet/transaction/0.0.10294360@1778720525.899416940)
- [Proof 8 — Reputation Updated](https://hashscan.io/mainnet/transaction/0.0.10294360@1778720530.062366144)
- [Proof 9 — Chain Anchored](https://hashscan.io/mainnet/transaction/0.0.10294360@1778720536.347253801)
- [Proof 10 — Lesson Extracted](https://hashscan.io/mainnet/transaction/0.0.10294360@1778720538.057858035)

Or query the topic directly:
```
https://mainnet.mirrornode.hedera.com/api/v1/topics/0.0.10409351/messages?sequencenumber=94974
```

## What This Demonstrates

1. **Immutability** — All 10 messages are permanently on Hedera's hashgraph. Cannot be altered or deleted.

2. **Proof Chaining** — Each proof references the hash of the previous one, forming a tamper-evident linked chain. Modifying any proof breaks the chain.

3. **Verifiable AI Execution** — The complete marketplace lifecycle is cryptographically attested on-chain: task → bid → award → execute → verify → settle → learn.

4. **Multi-Topic Routing** — Events auto-route to the correct HCS topic (task topic for marketplace, learning topic for lessons).

5. **Production Viability** — Real mainnet, real HBAR, real consensus finality (~4.7s avg including receipt confirmation).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Python (Vera OS v2.1)                                      │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │ HCSProof    │──▶│ HCS Bridge   │──▶│ Hedera Mainnet  │  │
│  │ Emitter     │   │ (Node.js SDK)│   │ Consensus Nodes │  │
│  └─────────────┘   └──────────────┘   └────────┬────────┘  │
│  ┌─────────────┐                                │           │
│  │ Mirror      │◀───────────────────────────────┘           │
│  │ Verifier    │   (Mirror Node API)                        │
│  └─────────────┘                                            │
│  ┌─────────────┐                                            │
│  │ Evidence    │   writes JSONL + EVIDENCE.md                │
│  │ Collector   │                                            │
│  └─────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

## Run the Benchmark

```bash
# Start the HCS bridge
set -a && source .env && set +a
node scripts/hcs-bridge.mjs &

# Run benchmark
python3 scripts/testnet_benchmark.py
```

## Evidence Artifacts

- [`docs/evidence/benchmark-20260513-210138/EVIDENCE.md`](evidence/benchmark-20260513-210138/EVIDENCE.md)
- [`docs/evidence/benchmark-20260513-210138/receipts.jsonl`](evidence/benchmark-20260513-210138/receipts.jsonl)
- [`docs/evidence/benchmark-20260513-210138/verifications.jsonl`](evidence/benchmark-20260513-210138/verifications.jsonl)
