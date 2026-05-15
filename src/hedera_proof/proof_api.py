"""
Proof Chain API — FastAPI routes for HCS proof emission and mirror-node verification.

Endpoints:
  GET  /proof/stats            — emitter + verifier health
  GET  /proof/testnet-status   — testnet operator readiness
  GET  /proof/receipts         — recent HCS receipts
  GET  /proof/chain/{task_id}  — full proof chain for a task
  POST /proof/verify           — trigger mirror-node verification
  GET  /proof/verifications    — recent verification results
"""

from fastapi import APIRouter, Query
from typing import Optional

from .hcs_emitter import HCSProofEmitter
from .mirror_verifier import MirrorVerifier
from .testnet_config import TestnetConfig


def create_proof_router(
    emitter: HCSProofEmitter,
    verifier: MirrorVerifier,
) -> APIRouter:
    router = APIRouter(prefix="/proof", tags=["proof"])

    @router.get("/stats")
    async def proof_stats():
        return {
            "emitter": emitter.stats(),
            "verifier": verifier.stats(),
        }

    @router.get("/testnet-status")
    async def testnet_status():
        """Check whether the operator is configured for testnet HCS emission."""
        cfg = TestnetConfig.from_env()
        return cfg.summary()

    @router.get("/receipts")
    async def get_receipts(
        task_id: Optional[str] = Query(None),
        limit: int = Query(20, ge=1, le=200),
    ):
        receipts = emitter.get_receipts(task_id=task_id, limit=limit)
        return {
            "receipts": [r.to_dict() for r in receipts],
            "total": len(receipts),
            "mode": emitter.mode.value,
        }

    @router.get("/chain/{task_id}")
    async def get_proof_chain(task_id: str):
        return emitter.get_chain(task_id)

    @router.post("/verify")
    async def verify_proof(body: dict):
        """
        Verify a task's proof chain against mirror node.

        Body: { "task_id": "...", "topic_id": "0.0.xxx" }
        Or: { "task_id": "...", "proof_hash": "...", "topic_id": "0.0.xxx", "sequence_number": 42 }
        """
        task_id = body.get("task_id", "")
        topic_id = body.get("topic_id", "")

        if body.get("proof_hash"):
            result = verifier.verify_receipt(
                task_id=task_id,
                local_proof_hash=body["proof_hash"],
                topic_id=topic_id,
                sequence_number=body.get("sequence_number"),
            )
            return result.to_dict()

        # Verify full chain
        chain = emitter.get_chain(task_id)
        if not chain["receipts"]:
            return {"task_id": task_id, "error": "No receipts found for this task"}

        result = verifier.verify_task_chain(task_id, chain["receipts"])
        return result

    @router.get("/verifications")
    async def get_verifications(
        task_id: Optional[str] = Query(None),
        limit: int = Query(20, ge=1, le=200),
    ):
        vrs = verifier.get_verifications(task_id=task_id, limit=limit)
        return {
            "verifications": [v.to_dict() for v in vrs],
            "total": len(vrs),
        }

    @router.get("/verify-accuracy/{sequence_number}")
    async def verify_accuracy_immutability(
        sequence_number: int,
        topic_id: Optional[str] = Query("0.0.10416185"),
    ):
        """
        Verify an accuracy report on-chain was not edited.

        Fetches the HCS message from a mirror node, recomputes the SHA-256
        hash from the decoded payload, and compares with the stored proof_hash.
        Also cross-checks metrics against the local prediction DB.
        """
        import base64
        import hashlib
        import json
        import os
        import sqlite3

        # 1. Fetch from mirror node
        msgs = verifier.fetch_topic_messages(topic_id, sequence_exact=sequence_number)
        if not msgs:
            return {
                "error": "Message not found on mirror node",
                "sequence_number": sequence_number,
                "topic_id": topic_id,
            }

        msg = msgs[0]
        content = msg.message_content

        # 2. Extract stored proof_hash and metadata
        stored_hash = content.get("proof_hash", "")
        metadata = content.get("metadata", content)

        # 3. Reconstruct original Python payload
        # (TypeScript bridge may have converted 70.0 -> 70, so restore floats)
        original = {
            "report_type": metadata.get("report_type"),
            "version": metadata.get("version"),
            "timestamp": metadata.get("timestamp"),
            "iso_time": metadata.get("iso_time"),
            "metrics": {
                k: float(v) if k != "total_scored" else int(v)
                for k, v in metadata.get("metrics", {}).items()
            },
            "sample_size": {
                k: int(v) for k, v in metadata.get("sample_size", {}).items()
            },
            "token": metadata.get("token"),
            "model": metadata.get("model"),
            "source": metadata.get("source"),
        }
        canonical_json = json.dumps(original, sort_keys=True)
        recomputed_hash = hashlib.sha256(canonical_json.encode()).hexdigest()
        hash_match = stored_hash == recomputed_hash

        # 4. Cross-check with local DB
        db_path = os.environ.get("VNX_DB_PATH", "data/fast_predictions.db")
        db_metrics = {}
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            total = conn.execute(
                "SELECT COUNT(*) FROM fast_predictions WHERE correct IS NOT NULL"
            ).fetchone()[0]
            correct = conn.execute(
                "SELECT COUNT(*) FROM fast_predictions WHERE correct = 1"
            ).fetchone()[0]
            db_metrics["overall_accuracy_pct"] = round(correct / total * 100, 1) if total else 0.0
            conn.close()
        except Exception:
            db_metrics = {"error": "DB not available"}

        return {
            "sequence_number": sequence_number,
            "topic_id": topic_id,
            "consensus_timestamp": msg.consensus_timestamp,
            "verified": hash_match,
            "hash_match": hash_match,
            "stored_hash": stored_hash,
            "recomputed_hash": recomputed_hash,
            "on_chain_metrics": metadata.get("metrics", {}),
            "db_metrics": db_metrics,
            "hashscan_url": f"https://hashscan.io/{verifier._network}/topic/{topic_id}?seq={sequence_number}",
            "mirror_node_url": f"{verifier._mirror_urls[0]}/api/v1/topics/{topic_id}/messages/{sequence_number}",
        }

    return router
