#!/usr/bin/env python3
"""
VNX — Testnet HCS Proof Benchmark

Exercises the full proof pipeline against Hedera testnet:
  1. Validates testnet config
  2. Emits N proof packets (measures latency per emission)
  3. Verifies receipts against mirror node
  4. Collects evidence artifacts
  5. Prints a benchmark summary table

Usage:
    source .env && python3 scripts/testnet_benchmark.py
"""

import os
import sys
import time
import statistics

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env if dotenv available, otherwise rely on exported vars
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
except ImportError:
    pass

from src.hedera_proof.testnet_config import TestnetConfig
from src.hedera_proof.hcs_emitter import HCSProofEmitter, ProofMode
from src.hedera_proof.mirror_verifier import MirrorVerifier
from src.hedera_proof.evidence_collector import EvidenceCollector


def banner(msg: str):
    print(f"\n{'─' * 60}")
    print(f"  {msg}")
    print(f"{'─' * 60}")


def main():
    print("=" * 60)
    print("  VNX v2.1 — Testnet HCS Proof Benchmark")
    print("=" * 60)

    # ── Step 1: Validate config ──────────────────────────────────
    banner("Step 1: Validate Testnet Configuration")
    cfg = TestnetConfig.from_env()
    summary = cfg.summary()
    print(f"  Network:       {summary['network']}")
    print(f"  Operator:      {summary['operator']}")
    print(f"  Key present:   {summary['key_present']}")
    print(f"  Task topic:    {summary['task_topic']}")
    print(f"  Audit topic:   {summary['audit_topic']}")
    print(f"  Learning topic:{summary['learning_topic']}")
    print(f"  Dry run:       {summary['dry_run']}")
    print(f"  Ready:         {summary['ready']}")

    if summary['issues']:
        print(f"\n  ⚠ Issues:")
        for issue in summary['issues']:
            print(f"    - {issue}")

    # Determine mode from env
    network = os.environ.get("HEDERA_NETWORK", "testnet")
    dry_run = os.environ.get("VNX_DRY_RUN", "true").lower() == "true"
    has_creds = bool(os.environ.get("HEDERA_OPERATOR_ACCOUNT_ID")) and bool(os.environ.get("HEDERA_OPERATOR_PRIVATE_KEY"))
    has_topics = bool(os.environ.get("VNX_TASK_TOPIC_ID"))

    if dry_run or not has_creds or not has_topics:
        print(f"\n  ❌ Not ready for live. Running in DRY_RUN mode.")
        mode = ProofMode.DRY_RUN
    elif network == "mainnet":
        print(f"\n  ✓ MAINNET READY — will emit live proofs (real HBAR).")
        mode = ProofMode.MAINNET
    else:
        print(f"\n  ✓ TESTNET READY — will emit live proofs.")
        mode = ProofMode.TESTNET

    # ── Step 2: Initialize components ────────────────────────────
    banner("Step 2: Initialize Proof Infrastructure")
    emitter = HCSProofEmitter(mode=mode)
    verifier = MirrorVerifier()
    collector = EvidenceCollector(
        f"benchmark-{time.strftime('%Y%m%d-%H%M%S')}",
        base_dir=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "evidence"),
    )
    print(f"  Emitter:    mode={emitter.mode.value}")
    print(f"  Verifier:   network={verifier._network}")
    print(f"  Evidence:   {collector.session_dir}")

    # ── Step 3: Emit proof packets ───────────────────────────────
    N = 10
    banner(f"Step 3: Emit {N} Proof Packets")
    latencies = []
    receipts = []
    errors = []

    event_types = [
        "marketplace.task.posted",
        "marketplace.bid.submitted",
        "marketplace.task.awarded",
        "marketplace.execution.started",
        "marketplace.result.submitted",
        "marketplace.verification.passed",
        "marketplace.settlement.complete",
        "marketplace.reputation.updated",
        "proof.chain.anchored",
        "learning.lesson.extracted",
    ]

    for i in range(N):
        task_id = f"bench-{int(time.time())}-{i:03d}"
        event_type = event_types[i % len(event_types)]
        proof_hash = f"sha256:bench_{i:04d}_{int(time.time())}"

        t0 = time.perf_counter()
        receipt = emitter.emit(
            task_id=task_id,
            event_type=event_type,
            proof_hash=proof_hash,
            metadata={"benchmark": True, "seq": i},
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000
        latencies.append(elapsed_ms)

        if receipt.error:
            errors.append(receipt.error)
            print(f"  [{i+1:2d}/{N}] ❌ {event_type:<40} {elapsed_ms:7.1f}ms  err={receipt.error[:50]}")
        else:
            receipts.append(receipt)
            collector.record_receipt(receipt.to_dict())
            seq = receipt.sequence_number or "—"
            tx = receipt.transaction_id or "local"
            print(f"  [{i+1:2d}/{N}] ✓  {event_type:<40} {elapsed_ms:7.1f}ms  seq={seq}  tx={tx}")

        # Small delay between emissions to avoid rate limiting
        if mode != ProofMode.DRY_RUN and i < N - 1:
            time.sleep(0.5)

    # ── Step 4: Latency Statistics ───────────────────────────────
    banner("Step 4: Latency Statistics")
    if latencies:
        print(f"  Total emissions:  {N}")
        print(f"  Successful:       {len(receipts)}")
        print(f"  Failed:           {len(errors)}")
        print(f"  Min latency:      {min(latencies):.1f} ms")
        print(f"  Max latency:      {max(latencies):.1f} ms")
        print(f"  Mean latency:     {statistics.mean(latencies):.1f} ms")
        print(f"  Median latency:   {statistics.median(latencies):.1f} ms")
        if len(latencies) > 1:
            print(f"  Std dev:          {statistics.stdev(latencies):.1f} ms")
        print(f"  P95 latency:      {sorted(latencies)[int(len(latencies)*0.95)]:.1f} ms")
        print(f"  Total time:       {sum(latencies):.1f} ms")
        print(f"  Throughput:       {len(receipts) / (sum(latencies)/1000):.1f} proofs/sec (emit only)")

    # ── Step 5: Mirror Node Verification ─────────────────────────
    banner("Step 5: Mirror Node Verification")
    if mode == ProofMode.DRY_RUN:
        print("  Skipping mirror verification in DRY_RUN mode.")
        print("  (Set VNX_DRY_RUN=false with valid credentials to test live)")
    elif receipts:
        # Wait for mirror node propagation (mainnet ~10-20s, testnet ~5-10s)
        wait = 15 if network == "mainnet" else 8
        print(f"  Waiting {wait}s for mirror node propagation...")
        time.sleep(wait)

        verified_count = 0
        verify_n = min(5, len(receipts))
        for receipt in receipts[:verify_n]:
            if receipt.topic_id and receipt.sequence_number:
                result = verifier.verify_receipt(
                    task_id=receipt.task_id,
                    local_proof_hash=receipt.proof_hash,
                    topic_id=receipt.topic_id,
                    sequence_number=receipt.sequence_number,
                    retries=3,
                    retry_delay=5.0,
                )
                collector.record_verification(result.to_dict())
                status = "✓" if result.verified else "✗"
                print(f"  {status} task={receipt.task_id[:20]}  seq={receipt.sequence_number}  verified={result.verified}")
                if result.verified:
                    verified_count += 1
            else:
                print(f"  — task={receipt.task_id[:20]}  (no sequence — skipping)")

        print(f"\n  Verified: {verified_count}/{verify_n}")

    # ── Step 6: Emitter Stats ────────────────────────────────────
    banner("Step 6: Final Emitter Stats")
    stats = emitter.stats()
    for k, v in stats.items():
        print(f"  {k:<20} {v}")

    # ── Step 7: Write Evidence ───────────────────────────────────
    banner("Step 7: Write Evidence Summary")
    evidence_path = collector.write_summary()
    print(f"  Evidence written: {evidence_path}")

    # ── Summary Table ────────────────────────────────────────────
    banner("BENCHMARK COMPLETE")
    print(f"""
  ┌─────────────────────────────────────────────────────┐
  │  VNX v2.1 Testnet Proof Benchmark               │
  ├──────────────────────┬──────────────────────────────┤
  │  Mode                │  {mode.value:<28} │
  │  Emissions           │  {len(receipts)}/{N} successful{' '*(17-len(f'{len(receipts)}/{N} successful'))}│
  │  Errors              │  {len(errors):<28} │
  │  Mean latency        │  {statistics.mean(latencies):.1f} ms{' '*(24-len(f'{statistics.mean(latencies):.1f} ms'))}│
  │  P95 latency         │  {sorted(latencies)[int(len(latencies)*0.95)]:.1f} ms{' '*(24-len(f'{sorted(latencies)[int(len(latencies)*0.95)]:.1f} ms'))}│
  │  Throughput          │  {len(receipts)/(sum(latencies)/1000):.0f} proofs/sec{' '*(18-len(f'{len(receipts)/(sum(latencies)/1000):.0f} proofs/sec'))}│
  │  Chain length        │  {stats['chain_length']:<28} │
  │  Evidence            │  {os.path.basename(collector.session_dir):<28} │
  └──────────────────────┴──────────────────────────────┘
""")


if __name__ == "__main__":
    main()
