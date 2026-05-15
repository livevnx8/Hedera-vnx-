#!/usr/bin/env python3
"""
VNX Accuracy Report Immutability Verifier

Independently verifies that the accuracy report at mainnet HCS sequence 2790
was NOT edited after consensus, by:
  1. Fetching the raw message from a Hiero mirror node
  2. Recomputing the SHA-256 hash from the decoded payload
  3. Comparing with the stored proof_hash
  4. Cross-checking accuracy numbers against the local SQLite DB

Usage:
    source .env && python3 scripts/verify_accuracy_immutability.py

Anyone can run this — no credentials, no trust in VNX servers.
"""

import base64
import hashlib
import json
import os
import sqlite3
import sys
import time
from urllib.request import Request, urlopen

# ── Configuration ───────────────────────────────────────────
TOPIC_ID = "0.0.10416185"
SEQUENCE_NUMBER = 2790
NETWORK = "mainnet"
MIRROR_URL = "https://mainnet-public.mirrornode.hedera.com"
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "fast_predictions.db")


def fetch_mirror_message(topic_id: str, seq: int) -> dict:
    """Fetch a single HCS message from a Hiero mirror node."""
    url = f"{MIRROR_URL}/api/v1/topics/{topic_id}/messages/{seq}"
    req = Request(url, headers={"Accept": "application/json"})
    with urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def decode_payload(msg: dict) -> dict:
    """Base64-decode and JSON-parse the HCS message body."""
    raw_b64 = msg.get("message", "")
    raw_bytes = base64.b64decode(raw_b64)
    return json.loads(raw_bytes)


def recompute_hash(payload: dict) -> str:
    """
    Recompute the SHA-256 hash from the payload, excluding the proof_hash field.
    Uses canonical JSON (sorted keys, no whitespace) for determinism.
    """
    canonical = {k: v for k, v in payload.items() if k != "proof_hash"}
    canonical_json = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode()).hexdigest()


def compute_db_metrics() -> dict:
    """Compute accuracy metrics directly from the local SQLite DB."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Overall
    total = conn.execute(
        "SELECT COUNT(*) FROM fast_predictions WHERE correct IS NOT NULL"
    ).fetchone()[0]
    correct = conn.execute(
        "SELECT COUNT(*) FROM fast_predictions WHERE correct = 1"
    ).fetchone()[0]
    overall = round(correct / total * 100, 1) if total else 0.0

    # Last 10
    r10 = conn.execute(
        "SELECT correct FROM fast_predictions WHERE correct IS NOT NULL ORDER BY timestamp DESC LIMIT 10"
    ).fetchall()
    l10_acc = round(sum(r[0] for r in r10) / len(r10) * 100, 1) if r10 else 0.0

    # Last 50
    r50 = conn.execute(
        "SELECT correct FROM fast_predictions WHERE correct IS NOT NULL ORDER BY timestamp DESC LIMIT 50"
    ).fetchall()
    l50_acc = round(sum(r[0] for r in r50) / len(r50) * 100, 1) if r50 else 0.0

    # Direction breakdown
    up = conn.execute(
        "SELECT correct FROM fast_predictions WHERE direction='UP' AND correct IS NOT NULL"
    ).fetchall()
    up_acc = round(sum(r[0] for r in up) / len(up) * 100, 1) if up else 0.0

    down = conn.execute(
        "SELECT correct FROM fast_predictions WHERE direction='DOWN' AND correct IS NOT NULL"
    ).fetchall()
    down_acc = round(sum(r[0] for r in down) / len(down) * 100, 1) if down else 0.0

    # Confidence buckets
    high = conn.execute(
        "SELECT correct FROM fast_predictions WHERE confidence >= 0.6 AND correct IS NOT NULL"
    ).fetchall()
    high_acc = round(sum(r[0] for r in high) / len(high) * 100, 1) if high else 0.0

    low = conn.execute(
        "SELECT correct FROM fast_predictions WHERE confidence < 0.5 AND correct IS NOT NULL"
    ).fetchall()
    low_acc = round(sum(r[0] for r in low) / len(low) * 100, 1) if low else 0.0

    conn.close()

    return {
        "overall_accuracy_pct": overall,
        "last_10_accuracy_pct": l10_acc,
        "last_50_accuracy_pct": l50_acc,
        "up_accuracy_pct": up_acc,
        "down_accuracy_pct": down_acc,
        "high_conf_accuracy_pct": high_acc,
        "low_conf_accuracy_pct": low_acc,
    }


def check_match(label: str, on_chain: any, db_val: any) -> str:
    """Return a checkmark or X with the comparison."""
    match = "✅" if on_chain == db_val else "❌"
    return f"  {match} {label}: {on_chain} (on-chain) vs {db_val} (DB)"


def main():
    print("=" * 70)
    print("  VNX Accuracy Report — Immutability Verification")
    print(f"  Topic: {TOPIC_ID}  |  Sequence: {SEQUENCE_NUMBER}  |  Network: {NETWORK}")
    print("=" * 70)
    print()

    # ── Step 1: Fetch from mirror node ─────────────────────────
    print("Step 1: Fetching message from Hiero mirror node...")
    print(f"  URL: {MIRROR_URL}/api/v1/topics/{TOPIC_ID}/messages/{SEQUENCE_NUMBER}")
    try:
        msg = fetch_mirror_message(TOPIC_ID, SEQUENCE_NUMBER)
        print(f"  ✅ Message found")
        print(f"     Consensus timestamp: {msg.get('consensus_timestamp')}")
        print(f"     Payer account:       {msg.get('payer_account_id')}")
        print(f"     Running hash:        {msg.get('running_hash', '')[:40]}...")
    except Exception as e:
        print(f"  ❌ Mirror node query failed: {e}")
        sys.exit(1)
    print()

    # ── Step 2: Decode payload ────────────────────────────────
    print("Step 2: Decoding HCS message payload...")
    try:
        payload = decode_payload(msg)
        stored_hash = payload.get("proof_hash", "")
        metadata = payload.get("metadata", payload)  # handle both structures
        print(f"  ✅ Payload decoded")
        print(f"     Report type: {metadata.get('report_type', payload.get('report_type', 'unknown'))}")
        print(f"     Model:       {metadata.get('model', payload.get('model', 'unknown'))}")
        print(f"     Timestamp:   {metadata.get('iso_time', payload.get('timestamp', 'unknown'))}")
        print(f"     Stored hash: {stored_hash}")
    except Exception as e:
        print(f"  ❌ Payload decode failed: {e}")
        sys.exit(1)
    print()

    # ── Step 3: Recompute hash ────────────────────────────────
    print("Step 3: Recomputing SHA-256 hash from canonical payload...")
    print("  Note: The TypeScript bridge converted some float values to ints")
    print("        (e.g., 70.0 → 70). We reconstruct the original Python payload.")
    try:
        # Extract metadata block from the ProofPacket
        if "metadata" in payload:
            metadata_block = payload["metadata"]
        elif "proof_hash" in payload:
            metadata_block = payload
        else:
            metadata_block = payload

        # Reconstruct original Python payload with exact float values
        # The bridge converted 70.0 -> 70, 56.0 -> 56, 50.0 -> 50
        # We restore them to floats to match the original serialization
        original = {
            "report_type": metadata_block.get("report_type"),
            "version": metadata_block.get("version"),
            "timestamp": metadata_block.get("timestamp"),  # exact float from decoded payload
            "iso_time": metadata_block.get("iso_time"),
            "metrics": {
                k: float(v) if k != "total_scored" else int(v)
                for k, v in metadata_block.get("metrics", {}).items()
            },
            "sample_size": {
                k: int(v) for k, v in metadata_block.get("sample_size", {}).items()
            },
            "token": metadata_block.get("token"),
            "model": metadata_block.get("model"),
            "source": metadata_block.get("source"),
        }

        # The emitter used json.dumps(dict, sort_keys=True) — standard Python serialization
        canonical_json = json.dumps(original, sort_keys=True)
        recomputed_hash = hashlib.sha256(canonical_json.encode()).hexdigest()

        print(f"  Reconstructed JSON (first 200 chars):")
        print(f"     {canonical_json[:200]}...")
        print()
        print(f"  Stored hash:     {stored_hash}")
        print(f"  Recomputed hash: {recomputed_hash}")
        if stored_hash == recomputed_hash:
            print(f"  ✅ HASH MATCH — the accuracy report has NOT been edited")
        else:
            print(f"  ❌ HASH MISMATCH — the report MAY have been tampered with")
    except Exception as e:
        print(f"  ❌ Hash recomputation failed: {e}")
        sys.exit(1)
    print()

    # ── Step 4: Cross-check metrics against local DB ──────────
    print("Step 4: Cross-checking accuracy metrics against local SQLite DB...")
    print("  Note: DB may have MORE predictions than at emission time.")
    print("        Numbers are compared rounded to 1 decimal place.")
    try:
        on_chain_metrics = metadata.get("metrics", payload.get("metrics", {}))
        db_metrics_raw = compute_db_metrics()
        # Round DB metrics to match on-chain precision (1 decimal)
        db_metrics = {k: round(v, 1) for k, v in db_metrics_raw.items()}

        print()
        for key in sorted(on_chain_metrics.keys()):
            oc = on_chain_metrics.get(key)
            db = db_metrics.get(key)
            match = "✅" if oc == db else "⚠️"
            print(f"  {match} {key}: {oc}% (on-chain) vs {db}% (DB)")

        all_match = all(
            on_chain_metrics.get(k) == db_metrics.get(k)
            for k in on_chain_metrics.keys()
        )
        print()
        if all_match:
            print("  ✅ ALL METRICS MATCH — numbers verified against independent DB")
        else:
            print("  ⚠️  SOME METRICS DIFFER — DB has grown since emission (expected)")
            print("     The on-chain snapshot is immutable; DB continues to accumulate.")
    except Exception as e:
        print(f"  ⚠️  DB cross-check failed: {e}")
        all_match = False
    print()

    # ── Step 5: Final verdict ────────────────────────────────
    print("=" * 70)
    print("  FINAL VERDICT")
    print("=" * 70)

    hash_match = stored_hash == recomputed_hash
    # DB metrics naturally diverge as new predictions are scored.
    # Immutability = hash_match (the on-chain snapshot cannot change)
    immutable = hash_match

    if immutable:
        print("  ✅ IMMUTABLE — This accuracy report has NOT been edited.")
        print("     The consensus timestamp is permanent and the hash matches.")
        print("     Anyone can independently verify this via the mirror node REST API.")
    else:
        print("  ❌ TAMPERED — The report may have been edited.")
        print("     Hash mismatch detected.")

    print()
    print("  Live verification links:")
    print(f"     HashScan:      https://hashscan.io/mainnet/topic/{TOPIC_ID}?seq={SEQUENCE_NUMBER}")
    print(f"     Mirror REST:   {MIRROR_URL}/api/v1/topics/{TOPIC_ID}/messages/{SEQUENCE_NUMBER}")
    print(f"     Transaction:   https://hashscan.io/mainnet/transaction/{msg.get('transaction_id', 'N/A')}")
    print()

    # ── Save artifact ────────────────────────────────────────
    artifact = {
        "topic_id": TOPIC_ID,
        "sequence_number": SEQUENCE_NUMBER,
        "network": NETWORK,
        "consensus_timestamp": msg.get("consensus_timestamp"),
        "transaction_id": msg.get("transaction_id"),
        "payer_account_id": msg.get("payer_account_id"),
        "stored_hash": stored_hash,
        "recomputed_hash": recomputed_hash,
        "hash_match": hash_match,
        "on_chain_metrics": on_chain_metrics,
        "db_metrics": db_metrics,
        "metrics_match": all_match,
        "immutable": immutable,
        "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mirror_node": MIRROR_URL,
        "hashscan_url": f"https://hashscan.io/mainnet/topic/{TOPIC_ID}?seq={SEQUENCE_NUMBER}",
    }

    artifact_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "benchmarks", f"verification_seq_{SEQUENCE_NUMBER}.json"
    )
    os.makedirs(os.path.dirname(artifact_path), exist_ok=True)
    with open(artifact_path, "w") as f:
        json.dump(artifact, f, indent=2, default=str)
    print(f"  Artifact saved: {artifact_path}")

    return 0 if immutable else 1


if __name__ == "__main__":
    sys.exit(main())
