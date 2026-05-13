"""
Proof Loop Tracker — tracks open vs closed elliptical proof loops.

A proof loop follows the path:
  brief → task → bid → award → execution → verification → settlement → reputation → receipt → lesson → upgrade_package

A loop is "closed" when it has evidence for: verification + settlement + reputation + HCS receipt.
"""

import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional


class LoopStage(str, Enum):
    BRIEF = "brief"
    TASK = "task"
    BID = "bid"
    AWARD = "award"
    EXECUTION = "execution"
    VERIFICATION = "verification"
    SETTLEMENT = "settlement"
    REPUTATION = "reputation"
    RECEIPT = "receipt"
    LESSON = "lesson"
    UPGRADE_PACKAGE = "upgrade_package"


REQUIRED_FOR_CLOSURE = {
    LoopStage.VERIFICATION,
    LoopStage.SETTLEMENT,
    LoopStage.REPUTATION,
    LoopStage.RECEIPT,
}


@dataclass
class LoopEvidence:
    """Evidence attached to a specific stage of the proof loop."""
    stage: LoopStage
    evidence_type: str  # hcs, test, settlement, reputation, operator_review, etc.
    data: Dict[str, Any] = field(default_factory=dict)
    proof_hash: str = ""
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["stage"] = self.stage.value
        return d


@dataclass
class ProofLoop:
    """An elliptical proof loop instance tracking a marketplace task lifecycle."""
    loop_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    task_id: str = ""
    agent_id: str = ""
    status: str = "open"  # open, closed, failed, stale
    stages_completed: List[str] = field(default_factory=list)
    evidence: List[LoopEvidence] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    closed_at: float = 0.0
    lesson_id: Optional[str] = None
    package_id: Optional[str] = None

    @property
    def is_closed(self) -> bool:
        completed_stages = set(self.stages_completed)
        return all(s.value in completed_stages for s in REQUIRED_FOR_CLOSURE)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "loop_id": self.loop_id,
            "task_id": self.task_id,
            "agent_id": self.agent_id,
            "status": self.status,
            "stages_completed": self.stages_completed,
            "stages_remaining": [s.value for s in LoopStage if s.value not in self.stages_completed],
            "evidence_count": len(self.evidence),
            "is_closed": self.is_closed,
            "created_at": self.created_at,
            "closed_at": self.closed_at,
            "lesson_id": self.lesson_id,
            "package_id": self.package_id,
        }


class ProofLoopTracker:
    """Tracks all proof loops and their closure status."""

    def __init__(self):
        self._loops: Dict[str, ProofLoop] = {}
        self._task_to_loop: Dict[str, str] = {}

    def open_loop(self, task_id: str, agent_id: str = "") -> ProofLoop:
        """Open a new proof loop for a task."""
        loop = ProofLoop(task_id=task_id, agent_id=agent_id)
        self._loops[loop.loop_id] = loop
        self._task_to_loop[task_id] = loop.loop_id
        return loop

    def record_stage(
        self,
        task_id: str,
        stage: LoopStage,
        evidence_type: str = "system",
        data: Optional[Dict[str, Any]] = None,
        proof_hash: str = "",
    ) -> Optional[ProofLoop]:
        """Record that a stage has been completed for a task's proof loop."""
        loop_id = self._task_to_loop.get(task_id)
        if not loop_id:
            # Auto-open loop if task stage arrives without one
            loop = self.open_loop(task_id)
            loop_id = loop.loop_id

        loop = self._loops[loop_id]
        if stage.value not in loop.stages_completed:
            loop.stages_completed.append(stage.value)

        loop.evidence.append(LoopEvidence(
            stage=stage,
            evidence_type=evidence_type,
            data=data or {},
            proof_hash=proof_hash,
        ))

        # Check for closure
        if loop.is_closed and loop.status == "open":
            loop.status = "closed"
            loop.closed_at = time.time()

        return loop

    def get_loop(self, task_id: str) -> Optional[ProofLoop]:
        loop_id = self._task_to_loop.get(task_id)
        return self._loops.get(loop_id) if loop_id else None

    def get_loop_by_id(self, loop_id: str) -> Optional[ProofLoop]:
        return self._loops.get(loop_id)

    def list_loops(
        self,
        status: Optional[str] = None,
        limit: int = 50,
    ) -> List[ProofLoop]:
        loops = list(self._loops.values())
        if status:
            loops = [l for l in loops if l.status == status]
        loops.sort(key=lambda l: l.created_at, reverse=True)
        return loops[:limit]

    def closed_loops(self, limit: int = 50) -> List[ProofLoop]:
        return self.list_loops(status="closed", limit=limit)

    def open_loops(self, limit: int = 50) -> List[ProofLoop]:
        return self.list_loops(status="open", limit=limit)

    def mark_lesson(self, task_id: str, lesson_id: str):
        loop = self.get_loop(task_id)
        if loop:
            loop.lesson_id = lesson_id
            if LoopStage.LESSON.value not in loop.stages_completed:
                loop.stages_completed.append(LoopStage.LESSON.value)

    def mark_package(self, task_id: str, package_id: str):
        loop = self.get_loop(task_id)
        if loop:
            loop.package_id = package_id
            if LoopStage.UPGRADE_PACKAGE.value not in loop.stages_completed:
                loop.stages_completed.append(LoopStage.UPGRADE_PACKAGE.value)

    def stats(self) -> Dict[str, Any]:
        loops = list(self._loops.values())
        by_status = {}
        for l in loops:
            by_status[l.status] = by_status.get(l.status, 0) + 1
        return {
            "total_loops": len(loops),
            "by_status": by_status,
            "with_lessons": sum(1 for l in loops if l.lesson_id),
            "with_packages": sum(1 for l in loops if l.package_id),
        }
