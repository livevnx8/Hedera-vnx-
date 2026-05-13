"""
Task Engine — state machine for the agent marketplace.

Lifecycle:
  POSTED → BIDDING → AWARDED → EXECUTING → VERIFYING → SETTLED
                                               ↓
                                            DISPUTED → RESOLVED
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional


class TaskStatus(str, Enum):
    POSTED = "posted"
    BIDDING = "bidding"
    AWARDED = "awarded"
    EXECUTING = "executing"
    VERIFYING = "verifying"
    SETTLED = "settled"
    DISPUTED = "disputed"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"


class TaskCategory(str, Enum):
    PREDICTION = "prediction"
    DEFI = "defi"
    CARBON = "carbon"
    RISK = "risk"
    HEDERA = "hedera"
    INTEL = "intel"
    OPS = "ops"
    GENERAL = "general"


VALID_TRANSITIONS = {
    TaskStatus.POSTED: {TaskStatus.BIDDING, TaskStatus.CANCELLED},
    TaskStatus.BIDDING: {TaskStatus.AWARDED, TaskStatus.CANCELLED},
    TaskStatus.AWARDED: {TaskStatus.EXECUTING, TaskStatus.CANCELLED},
    TaskStatus.EXECUTING: {TaskStatus.VERIFYING},
    TaskStatus.VERIFYING: {TaskStatus.SETTLED, TaskStatus.DISPUTED},
    TaskStatus.DISPUTED: {TaskStatus.RESOLVED, TaskStatus.SETTLED},
    TaskStatus.SETTLED: set(),
    TaskStatus.RESOLVED: set(),
    TaskStatus.CANCELLED: set(),
}


@dataclass
class Bid:
    bid_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    agent_id: str = ""
    amount_hbar: float = 0.0
    estimated_time_s: float = 0.0
    confidence: float = 0.0
    message: str = ""
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "bid_id": self.bid_id,
            "agent_id": self.agent_id,
            "amount_hbar": self.amount_hbar,
            "estimated_time_s": self.estimated_time_s,
            "confidence": self.confidence,
            "message": self.message,
            "timestamp": self.timestamp,
        }


@dataclass
class TaskResult:
    result_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    agent_id: str = ""
    data: Dict[str, Any] = field(default_factory=dict)
    proof_hash: str = ""
    submitted_at: float = field(default_factory=time.time)
    verified: Optional[bool] = None
    verified_at: float = 0.0
    verifier_notes: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "result_id": self.result_id,
            "agent_id": self.agent_id,
            "data": self.data,
            "proof_hash": self.proof_hash,
            "submitted_at": self.submitted_at,
            "verified": self.verified,
            "verified_at": self.verified_at,
            "verifier_notes": self.verifier_notes,
        }


@dataclass
class Task:
    task_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    title: str = ""
    description: str = ""
    category: TaskCategory = TaskCategory.GENERAL
    status: TaskStatus = TaskStatus.POSTED
    requester_id: str = "system"
    budget_hbar: float = 0.0
    deadline_seconds: float = 3600.0
    required_capabilities: List[str] = field(default_factory=list)
    bids: List[Bid] = field(default_factory=list)
    awarded_bid_id: Optional[str] = None
    awarded_agent_id: Optional[str] = None
    result: Optional[TaskResult] = None
    escrow_id: Optional[str] = None
    settlement_amount: float = 0.0
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    settled_at: float = 0.0
    proof_chain: List[str] = field(default_factory=list)
    events: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "title": self.title,
            "description": self.description,
            "category": self.category.value,
            "status": self.status.value,
            "requester_id": self.requester_id,
            "budget_hbar": self.budget_hbar,
            "deadline_seconds": self.deadline_seconds,
            "required_capabilities": self.required_capabilities,
            "bids": [b.to_dict() for b in self.bids],
            "awarded_bid_id": self.awarded_bid_id,
            "awarded_agent_id": self.awarded_agent_id,
            "result": self.result.to_dict() if self.result else None,
            "escrow_id": self.escrow_id,
            "settlement_amount": self.settlement_amount,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "settled_at": self.settled_at,
            "proof_chain": self.proof_chain,
            "event_count": len(self.events),
        }

    def proof_hash(self) -> str:
        payload = json.dumps({
            "task_id": self.task_id,
            "status": self.status.value,
            "timestamp": self.updated_at,
            "bids": len(self.bids),
            "awarded_agent": self.awarded_agent_id,
            "result_hash": self.result.proof_hash if self.result else None,
        }, sort_keys=True, default=str)
        return hashlib.sha256(payload.encode()).hexdigest()


class TaskEngine:
    """
    Manages the full task lifecycle for the agent marketplace.

    Enforces valid state transitions, records events, emits to event bus,
    and maintains proof chain for HCS anchoring.
    """

    def __init__(self, event_bus=None):
        self._tasks: Dict[str, Task] = {}
        self._event_bus = event_bus
        self._event_log: List[Dict[str, Any]] = []

    def post_task(
        self,
        title: str,
        description: str = "",
        category: str = "general",
        budget_hbar: float = 0.0,
        deadline_seconds: float = 3600.0,
        required_capabilities: List[str] = None,
        requester_id: str = "system",
    ) -> Task:
        task = Task(
            title=title,
            description=description,
            category=TaskCategory(category) if category in TaskCategory.__members__.values() else TaskCategory.GENERAL,
            budget_hbar=budget_hbar,
            deadline_seconds=deadline_seconds,
            required_capabilities=required_capabilities or [],
            requester_id=requester_id,
        )
        self._tasks[task.task_id] = task
        self._transition(task, TaskStatus.BIDDING)
        self._emit_event("task.posted", task)
        return task

    def submit_bid(
        self,
        task_id: str,
        agent_id: str,
        amount_hbar: float = 0.0,
        estimated_time_s: float = 0.0,
        confidence: float = 0.0,
        message: str = "",
    ) -> Bid:
        task = self._get_task(task_id)
        if task.status != TaskStatus.BIDDING:
            raise ValueError(f"Task {task_id} is not accepting bids (status: {task.status.value})")
        if any(b.agent_id == agent_id for b in task.bids):
            raise ValueError(f"Agent {agent_id} already bid on task {task_id}")

        bid = Bid(
            agent_id=agent_id,
            amount_hbar=amount_hbar,
            estimated_time_s=estimated_time_s,
            confidence=confidence,
            message=message,
        )
        task.bids.append(bid)
        task.updated_at = time.time()
        self._emit_event("bid.submitted", task, {"bid": bid.to_dict()})
        return bid

    def award_task(self, task_id: str, bid_id: str) -> Task:
        task = self._get_task(task_id)
        bid = next((b for b in task.bids if b.bid_id == bid_id), None)
        if not bid:
            raise ValueError(f"Bid {bid_id} not found on task {task_id}")

        task.awarded_bid_id = bid_id
        task.awarded_agent_id = bid.agent_id
        self._transition(task, TaskStatus.AWARDED)
        self._emit_event("task.awarded", task, {"bid": bid.to_dict()})
        return task

    def start_execution(self, task_id: str) -> Task:
        task = self._get_task(task_id)
        self._transition(task, TaskStatus.EXECUTING)
        self._emit_event("task.executing", task)
        return task

    def submit_result(
        self,
        task_id: str,
        agent_id: str,
        data: Dict[str, Any],
    ) -> TaskResult:
        task = self._get_task(task_id)
        if task.status != TaskStatus.EXECUTING:
            raise ValueError(f"Task {task_id} is not executing (status: {task.status.value})")
        if task.awarded_agent_id != agent_id:
            raise ValueError(f"Agent {agent_id} is not the awarded agent")

        proof = hashlib.sha256(
            json.dumps(data, sort_keys=True, default=str).encode()
        ).hexdigest()

        result = TaskResult(
            agent_id=agent_id,
            data=data,
            proof_hash=proof,
        )
        task.result = result
        self._transition(task, TaskStatus.VERIFYING)
        self._emit_event("result.submitted", task, {"result": result.to_dict()})
        return result

    def verify_result(
        self,
        task_id: str,
        verified: bool,
        verifier_notes: str = "",
    ) -> Task:
        task = self._get_task(task_id)
        if task.status != TaskStatus.VERIFYING:
            raise ValueError(f"Task {task_id} is not in verifying (status: {task.status.value})")
        if not task.result:
            raise ValueError(f"Task {task_id} has no result to verify")

        task.result.verified = verified
        task.result.verified_at = time.time()
        task.result.verifier_notes = verifier_notes

        if verified:
            self._emit_event("result.verified", task)
        else:
            self._transition(task, TaskStatus.DISPUTED)
            self._emit_event("result.disputed", task, {"notes": verifier_notes})

        return task

    def settle_task(self, task_id: str, amount_hbar: float = None) -> Task:
        task = self._get_task(task_id)
        if task.status not in (TaskStatus.VERIFYING, TaskStatus.DISPUTED):
            raise ValueError(f"Task {task_id} cannot be settled (status: {task.status.value})")

        bid = next((b for b in task.bids if b.bid_id == task.awarded_bid_id), None)
        task.settlement_amount = amount_hbar if amount_hbar is not None else (bid.amount_hbar if bid else 0)
        task.settled_at = time.time()
        self._transition(task, TaskStatus.SETTLED)
        self._emit_event("task.settled", task, {
            "amount_hbar": task.settlement_amount,
            "agent_id": task.awarded_agent_id,
        })
        return task

    def cancel_task(self, task_id: str, reason: str = "") -> Task:
        task = self._get_task(task_id)
        self._transition(task, TaskStatus.CANCELLED)
        self._emit_event("task.cancelled", task, {"reason": reason})
        return task

    def get_task(self, task_id: str) -> Optional[Task]:
        return self._tasks.get(task_id)

    def list_tasks(
        self,
        status: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 50,
    ) -> List[Task]:
        tasks = list(self._tasks.values())
        if status:
            tasks = [t for t in tasks if t.status.value == status]
        if category:
            tasks = [t for t in tasks if t.category.value == category]
        tasks.sort(key=lambda t: t.updated_at, reverse=True)
        return tasks[:limit]

    def stats(self) -> Dict[str, Any]:
        tasks = list(self._tasks.values())
        by_status = {}
        for t in tasks:
            by_status[t.status.value] = by_status.get(t.status.value, 0) + 1
        total_settled = sum(t.settlement_amount for t in tasks if t.status == TaskStatus.SETTLED)
        return {
            "total_tasks": len(tasks),
            "by_status": by_status,
            "total_bids": sum(len(t.bids) for t in tasks),
            "total_settled_hbar": round(total_settled, 4),
            "total_events": len(self._event_log),
        }

    def event_log(self, limit: int = 50) -> List[Dict[str, Any]]:
        return list(reversed(self._event_log[-limit:]))

    def _get_task(self, task_id: str) -> Task:
        task = self._tasks.get(task_id)
        if not task:
            raise KeyError(f"Task {task_id} not found")
        return task

    def _transition(self, task: Task, new_status: TaskStatus):
        if new_status not in VALID_TRANSITIONS.get(task.status, set()):
            raise ValueError(
                f"Invalid transition: {task.status.value} → {new_status.value}"
            )
        task.status = new_status
        task.updated_at = time.time()
        proof = task.proof_hash()
        task.proof_chain.append(proof)

    def _emit_event(self, event_type: str, task: Task, extra: Dict[str, Any] = None):
        event = {
            "event_type": event_type,
            "task_id": task.task_id,
            "status": task.status.value,
            "timestamp": time.time(),
            "proof_hash": task.proof_chain[-1] if task.proof_chain else "",
            **(extra or {}),
        }
        task.events.append(event)
        self._event_log.append(event)

        if len(self._event_log) > 2000:
            self._event_log = self._event_log[-1000:]

        if self._event_bus:
            self._event_bus.emit(f"marketplace.{event_type}", event)
