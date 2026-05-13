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

    return router
