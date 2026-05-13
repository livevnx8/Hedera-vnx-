"""
Marketplace API — FastAPI routes for the agent marketplace.

Endpoints:
  /marketplace/tasks          — CRUD + lifecycle
  /marketplace/agents         — Agent roster + reputation
  /marketplace/stats          — Marketplace statistics
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException

from .task_engine import TaskEngine
from .reputation import ReputationEngine
from .escrow import EscrowEngine
from .verifier import ResultVerifier


def create_marketplace_router(
    task_engine: TaskEngine,
    reputation_engine: ReputationEngine,
    escrow_engine: EscrowEngine,
    verifier: ResultVerifier,
) -> APIRouter:
    router = APIRouter(prefix="/marketplace", tags=["marketplace"])

    # ─── Task CRUD ──────────────────────────────────────────

    @router.post("/tasks")
    async def post_task(body: Dict[str, Any]) -> Dict[str, Any]:
        try:
            task = task_engine.post_task(
                title=body.get("title", "Untitled Task"),
                description=body.get("description", ""),
                category=body.get("category", "general"),
                budget_hbar=body.get("budget_hbar", 0),
                deadline_seconds=body.get("deadline_seconds", 3600),
                required_capabilities=body.get("required_capabilities", []),
                requester_id=body.get("requester_id", "system"),
            )
            # Create escrow hold
            if task.budget_hbar > 0:
                escrow = escrow_engine.hold(
                    task_id=task.task_id,
                    payer_id=task.requester_id,
                    payee_id="",  # assigned on award
                    amount_hbar=task.budget_hbar,
                )
                task.escrow_id = escrow.escrow_id
            return {"status": "posted", "task": task.to_dict()}
        except Exception as e:
            raise HTTPException(400, str(e))

    @router.get("/tasks")
    async def list_tasks(
        status: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 50,
    ) -> Dict[str, Any]:
        tasks = task_engine.list_tasks(status=status, category=category, limit=limit)
        return {
            "count": len(tasks),
            "tasks": [t.to_dict() for t in tasks],
        }

    @router.get("/tasks/{task_id}")
    async def get_task(task_id: str) -> Dict[str, Any]:
        task = task_engine.get_task(task_id)
        if not task:
            raise HTTPException(404, f"Task {task_id} not found")
        return task.to_dict()

    # ─── Bidding ────────────────────────────────────────────

    @router.post("/tasks/{task_id}/bid")
    async def submit_bid(task_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
        try:
            bid = task_engine.submit_bid(
                task_id=task_id,
                agent_id=body.get("agent_id", ""),
                amount_hbar=body.get("amount_hbar", 0),
                estimated_time_s=body.get("estimated_time_s", 0),
                confidence=body.get("confidence", 0),
                message=body.get("message", ""),
            )
            return {"status": "bid_submitted", "bid": bid.to_dict()}
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    @router.post("/tasks/{task_id}/award")
    async def award_task(task_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
        try:
            bid_id = body.get("bid_id", "")
            task = task_engine.award_task(task_id, bid_id)
            # Update escrow payee
            if task.escrow_id:
                escrow = escrow_engine.get(task.escrow_id)
                if escrow:
                    escrow.payee_id = task.awarded_agent_id or ""
            # Auto-start execution
            task = task_engine.start_execution(task_id)
            return {"status": "awarded_and_executing", "task": task.to_dict()}
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    # ─── Execution + Verification ───────────────────────────

    @router.post("/tasks/{task_id}/submit")
    async def submit_result(task_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
        try:
            result = task_engine.submit_result(
                task_id=task_id,
                agent_id=body.get("agent_id", ""),
                data=body.get("data", {}),
            )
            # Auto-verify
            task = task_engine.get_task(task_id)
            vr = verifier.verify(
                task_id=task_id,
                result_data=result.data,
                claimed_proof_hash=result.proof_hash,
                budget_hbar=task.budget_hbar if task else 0,
                required_fields=task.required_capabilities if task else [],
            )
            return {
                "status": "submitted",
                "result": result.to_dict(),
                "verification": vr.to_dict(),
            }
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    @router.post("/tasks/{task_id}/verify")
    async def verify_result(task_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
        try:
            verified = body.get("verified", True)
            notes = body.get("notes", "")
            task = task_engine.verify_result(task_id, verified=verified, verifier_notes=notes)
            return {"status": "verified" if verified else "disputed", "task": task.to_dict()}
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    # ─── Settlement ─────────────────────────────────────────

    @router.post("/tasks/{task_id}/settle")
    async def settle_task(task_id: str, body: Dict[str, Any] = None) -> Dict[str, Any]:
        body = body or {}
        try:
            amount = body.get("amount_hbar")
            task = task_engine.settle_task(task_id, amount_hbar=amount)

            # Release escrow
            if task.escrow_id:
                escrow_engine.release(task.escrow_id, task.settlement_amount)

            # Update reputation
            bid = next((b for b in task.bids if b.bid_id == task.awarded_bid_id), None)
            reputation_engine.record_outcome(
                agent_id=task.awarded_agent_id or "",
                task_id=task_id,
                outcome="success" if task.result and task.result.verified else "partial",
                earned_hbar=task.settlement_amount,
                estimated_time_s=bid.estimated_time_s if bid else 0,
                actual_time_s=(task.settled_at - task.created_at) if task.settled_at else 0,
                bid_amount=bid.amount_hbar if bid else 0,
                settlement_amount=task.settlement_amount,
            )

            return {"status": "settled", "task": task.to_dict()}
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    @router.post("/tasks/{task_id}/cancel")
    async def cancel_task(task_id: str, body: Dict[str, Any] = None) -> Dict[str, Any]:
        body = body or {}
        try:
            task = task_engine.cancel_task(task_id, reason=body.get("reason", ""))
            # Refund escrow
            if task.escrow_id:
                try:
                    escrow_engine.refund(task.escrow_id)
                except (KeyError, ValueError):
                    pass
            return {"status": "cancelled", "task": task.to_dict()}
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    # ─── Agents + Reputation ────────────────────────────────

    @router.get("/agents")
    async def list_agents(domain: Optional[str] = None, limit: int = 50) -> Dict[str, Any]:
        lb = reputation_engine.leaderboard(limit=limit, domain=domain)
        return {"count": len(lb), "agents": lb}

    @router.get("/agents/{agent_id}")
    async def get_agent(agent_id: str) -> Dict[str, Any]:
        rep = reputation_engine.get_agent(agent_id)
        if not rep:
            raise HTTPException(404, f"Agent {agent_id} not found")
        return rep.to_dict()

    @router.get("/agents/{agent_id}/history")
    async def agent_history(agent_id: str, limit: int = 20) -> Dict[str, Any]:
        rep = reputation_engine.get_agent(agent_id)
        if not rep:
            raise HTTPException(404, f"Agent {agent_id} not found")
        return {
            "agent_id": agent_id,
            "history": [r.to_dict() for r in rep.history[-limit:]],
        }

    # ─── Stats ──────────────────────────────────────────────

    @router.get("/stats")
    async def marketplace_stats() -> Dict[str, Any]:
        return {
            "tasks": task_engine.stats(),
            "reputation": reputation_engine.stats(),
            "escrow": escrow_engine.stats(),
            "verifier": verifier.stats(),
        }

    @router.get("/events")
    async def marketplace_events(limit: int = 50) -> Dict[str, Any]:
        events = task_engine.event_log(limit=limit)
        return {"count": len(events), "events": events}

    return router
