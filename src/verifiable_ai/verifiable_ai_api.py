"""
Verifiable AI API — runs first-party agents through the full marketplace proof loop.

Endpoints:
  GET  /api/vera/verifiable-ai/agents      — list first-party agents
  POST /api/vera/verifiable-ai/tasks       — run a full proof loop
  GET  /api/vera/verifiable-ai/runs        — list proof runs
  GET  /api/vera/verifiable-ai/runs/{id}   — one proof run with full evidence
  POST /api/vera/verifiable-ai/run-now     — single-call: post → bid → execute → verify → settle → proof
"""

import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from .first_party_agents import FirstPartyAgentRegistry
from src.marketplace.task_engine import TaskEngine
from src.marketplace.reputation import ReputationEngine
from src.marketplace.escrow import EscrowEngine
from src.marketplace.verifier import ResultVerifier
from src.hedera_proof.hcs_emitter import HCSProofEmitter


def create_verifiable_ai_router(
    registry: FirstPartyAgentRegistry,
    task_engine: TaskEngine,
    reputation_engine: ReputationEngine,
    escrow_engine: EscrowEngine,
    verifier: ResultVerifier,
    proof_emitter: HCSProofEmitter,
) -> APIRouter:
    router = APIRouter(prefix="/api/vera/verifiable-ai", tags=["verifiable-ai"])

    # In-memory proof run storage
    proof_runs: Dict[str, Dict[str, Any]] = {}

    @router.get("/agents")
    async def list_agents():
        return {
            "agents": registry.list_agents(),
            "total": len(registry.list_agents()),
        }

    @router.post("/tasks")
    async def run_verifiable_task(body: dict):
        """
        Run a task through the full proof loop:
        post → bid → award → execute → verify → settle → emit HCS proof

        Body: {
          "title": "...",
          "task_type": "proof_publish",
          "data": { ... },
          "budget_hbar": 10.0
        }
        """
        title = body.get("title", "Verifiable AI task")
        task_type = body.get("task_type", "")
        task_data = body.get("data", {})
        budget = body.get("budget_hbar", 10.0)

        run = _execute_proof_loop(
            registry, task_engine, reputation_engine, escrow_engine,
            verifier, proof_emitter, title, task_type, task_data, budget,
        )

        proof_runs[run["run_id"]] = run
        if len(proof_runs) > 1000:
            oldest = sorted(proof_runs.keys(), key=lambda k: proof_runs[k].get("started_at", 0))
            for k in oldest[:500]:
                del proof_runs[k]

        return run

    @router.get("/runs")
    async def list_runs(limit: int = Query(20, ge=1, le=100)):
        runs = sorted(proof_runs.values(), key=lambda r: r.get("started_at", 0), reverse=True)
        return {
            "runs": runs[:limit],
            "total": len(proof_runs),
        }

    @router.get("/runs/{run_id}")
    async def get_run(run_id: str):
        run = proof_runs.get(run_id)
        if not run:
            raise HTTPException(status_code=404, detail=f"Proof run {run_id} not found")
        return run

    @router.post("/run-now")
    async def run_now(body: dict):
        """
        Single-call convenience: post, bid, execute, verify, settle, emit proof — all at once.

        Body: {
          "task_type": "health_check",
          "data": {},
          "budget_hbar": 5.0
        }
        """
        task_type = body.get("task_type", "health_check")
        task_data = body.get("data", {})
        budget = body.get("budget_hbar", 5.0)
        title = body.get("title", f"Quick run: {task_type}")

        run = _execute_proof_loop(
            registry, task_engine, reputation_engine, escrow_engine,
            verifier, proof_emitter, title, task_type, task_data, budget,
        )

        proof_runs[run["run_id"]] = run
        return run

    @router.get("/stats")
    async def verifiable_ai_stats():
        completed = [r for r in proof_runs.values() if r.get("status") == "settled"]
        return {
            "total_runs": len(proof_runs),
            "completed_runs": len(completed),
            "agents": registry.stats(),
            "proof_mode": proof_emitter.mode.value,
        }

    return router


def _execute_proof_loop(
    registry: FirstPartyAgentRegistry,
    task_engine: TaskEngine,
    reputation_engine: ReputationEngine,
    escrow_engine: EscrowEngine,
    verifier: ResultVerifier,
    proof_emitter: HCSProofEmitter,
    title: str,
    task_type: str,
    task_data: Dict[str, Any],
    budget_hbar: float,
) -> Dict[str, Any]:
    """Execute the complete marketplace proof loop and return the full evidence chain."""

    run_id = uuid.uuid4().hex[:16]
    started_at = time.time()
    events: List[Dict[str, Any]] = []
    receipts: List[Dict[str, Any]] = []

    def _event(stage: str, detail: Any = None):
        events.append({"stage": stage, "timestamp": time.time(), "detail": detail})

    try:
        # 1. Find best agent
        agent = registry.best_agent(task_type, budget_hbar)
        if not agent:
            # Fallback: try operator-harmony for general tasks
            agent = registry.get("vnx_operator_harmony")
        if not agent:
            return {
                "run_id": run_id,
                "status": "failed",
                "error": f"No agent capable of task_type={task_type}",
                "events": events,
                "started_at": started_at,
            }
        _event("agent_selected", {"agent_id": agent.agent_id})

        # 2. Post task
        task = task_engine.post_task(
            title=title,
            description=f"Verifiable AI run: {task_type}",
            budget_hbar=budget_hbar,
            category="general",
        )
        _event("task_posted", {"task_id": task.task_id})

        # 3. Create escrow
        escrow = escrow_engine.hold(task.task_id, "system", agent.agent_id, budget_hbar)
        task.escrow_id = escrow.escrow_id
        _event("escrow_held", {"escrow_id": escrow.escrow_id, "amount": budget_hbar})

        # 4. Agent bids
        bid_data = agent.bid(task.task_id, budget_hbar)
        bid = task_engine.submit_bid(
            task.task_id,
            agent_id=bid_data["agent_id"],
            amount_hbar=bid_data["amount_hbar"],
            confidence=bid_data["confidence"],
            estimated_time_s=bid_data["estimated_time_s"],
            message=bid_data["message"],
        )
        _event("bid_submitted", {"bid_id": bid.bid_id, "amount": bid_data["amount_hbar"]})

        # 5. Award
        task_engine.award_task(task.task_id, bid.bid_id)
        _event("task_awarded", {"agent_id": agent.agent_id})

        # 6. Execute
        task_engine.start_execution(task.task_id)
        result = agent.execute(task.task_id, task_data)
        _event("executed", {
            "confidence": result.confidence,
            "execution_time_s": result.execution_time_s,
            "proof_hash": result.proof_hash,
        })

        # 7. Submit result
        task_result = task_engine.submit_result(
            task.task_id,
            agent_id=agent.agent_id,
            data=result.data,
        )
        _event("result_submitted", {"result_id": task_result.result_id})

        # 8. Verify
        vr = verifier.verify(
            task_id=task.task_id,
            result_data=result.data,
            claimed_proof_hash=result.proof_hash,
        )
        task_engine.verify_result(task.task_id, verified=vr.verified, verifier_notes=str(vr.issues))
        _event("verified", {"verified": vr.verified, "score": vr.score})

        # 9. Settle
        if vr.verified or vr.score >= 0.6:
            task_engine.settle_task(task.task_id, amount_hbar=bid_data["amount_hbar"])
            escrow_engine.release(escrow.escrow_id, bid_data["amount_hbar"])
            _event("settled", {"amount": bid_data["amount_hbar"]})
        else:
            task_engine.settle_task(task.task_id, amount_hbar=0)
            escrow_engine.refund(escrow.escrow_id)
            _event("refunded", {"reason": "verification_failed"})

        # 10. Update reputation
        outcome = "success" if vr.verified else "failure"
        earned = bid_data["amount_hbar"] if vr.verified else 0
        if reputation_engine.get_agent(agent.agent_id):
            reputation_engine.record_outcome(agent.agent_id, task.task_id, outcome, earned_hbar=earned)
        _event("reputation_updated", {"outcome": outcome})

        # 11. Emit HCS proof for each lifecycle event
        for evt in task.events:
            receipt = proof_emitter.emit_marketplace_event(
                f"marketplace.{evt.get('event_type', 'unknown')}",
                evt,
            )
            receipts.append(receipt.to_dict())
        _event("proof_emitted", {"receipt_count": len(receipts), "mode": proof_emitter.mode.value})

        return {
            "run_id": run_id,
            "status": "settled",
            "task_id": task.task_id,
            "agent_id": agent.agent_id,
            "agent_name": agent.display_name,
            "task_type": task_type,
            "result": result.to_dict(),
            "verification": {
                "verified": vr.verified,
                "score": vr.score,
                "issues": vr.issues,
            },
            "settlement": {
                "amount_hbar": task.settlement_amount,
                "escrow_id": escrow.escrow_id,
            },
            "proof": {
                "mode": proof_emitter.mode.value,
                "receipts": receipts,
                "chain": proof_emitter.get_chain(task.task_id),
            },
            "events": events,
            "started_at": started_at,
            "completed_at": time.time(),
            "duration_s": round(time.time() - started_at, 4),
        }

    except Exception as e:
        _event("error", {"error": str(e)})
        return {
            "run_id": run_id,
            "status": "failed",
            "error": str(e),
            "events": events,
            "started_at": started_at,
            "completed_at": time.time(),
        }
