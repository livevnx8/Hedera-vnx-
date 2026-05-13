"""
Lesson Extraction Engine — extracts reusable lessons from closed proof loops.

From a closed loop, produces:
  - What worked (agent action, quality, timing)
  - Quality metrics (verification score, settlement amount, reputation delta)
  - Domain applicability (which task types benefit)
  - Reproducibility score (how likely to generalize)

Lessons are stored and indexed for RAG retrieval.
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

from .proof_loop_tracker import ProofLoop, LoopStage


@dataclass
class Lesson:
    """A reusable lesson extracted from a closed proof loop."""
    lesson_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    source_task_id: str = ""
    source_loop_id: str = ""
    agent_id: str = ""
    domain: str = ""
    title: str = ""
    summary: str = ""
    what_worked: List[str] = field(default_factory=list)
    quality_metrics: Dict[str, float] = field(default_factory=dict)
    reproducibility_score: float = 0.0
    task_types_applicable: List[str] = field(default_factory=list)
    proof_hashes: List[str] = field(default_factory=list)
    operator_approved: bool = False
    approved_at: float = 0.0
    created_at: float = field(default_factory=time.time)
    lesson_hash: str = ""

    def __post_init__(self):
        if not self.lesson_hash:
            payload = json.dumps({
                "source_task_id": self.source_task_id,
                "agent_id": self.agent_id,
                "what_worked": self.what_worked,
                "quality_metrics": self.quality_metrics,
                "created_at": self.created_at,
            }, sort_keys=True, default=str)
            self.lesson_hash = hashlib.sha256(payload.encode()).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class LessonEngine:
    """Extracts and manages lessons from closed proof loops."""

    def __init__(self, llm_router=None):
        self._lessons: Dict[str, Lesson] = {}
        self._llm = llm_router

    def extract(self, loop: ProofLoop, context: Optional[Dict[str, Any]] = None) -> Lesson:
        """Extract a lesson from a closed proof loop."""
        if not loop.is_closed:
            raise ValueError(f"Loop {loop.loop_id} is not closed — cannot extract lesson")

        context = context or {}

        # Extract quality metrics from evidence
        quality_metrics = self._extract_metrics(loop)
        what_worked = self._extract_actions(loop, context)
        reproducibility = self._score_reproducibility(loop, quality_metrics)

        # Determine domain from agent or context
        domain = context.get("domain", "general")
        task_types = context.get("task_types", [])

        # Generate title and summary
        title = self._generate_title(loop, context)
        summary = self._generate_summary(loop, what_worked, quality_metrics)

        lesson = Lesson(
            source_task_id=loop.task_id,
            source_loop_id=loop.loop_id,
            agent_id=loop.agent_id,
            domain=domain,
            title=title,
            summary=summary,
            what_worked=what_worked,
            quality_metrics=quality_metrics,
            reproducibility_score=reproducibility,
            task_types_applicable=task_types,
            proof_hashes=[e.proof_hash for e in loop.evidence if e.proof_hash],
        )

        self._lessons[lesson.lesson_id] = lesson
        return lesson

    def approve(self, lesson_id: str) -> Lesson:
        """Operator approves a lesson for potential packaging."""
        lesson = self._lessons.get(lesson_id)
        if not lesson:
            raise KeyError(f"Lesson {lesson_id} not found")
        lesson.operator_approved = True
        lesson.approved_at = time.time()
        return lesson

    def get(self, lesson_id: str) -> Optional[Lesson]:
        return self._lessons.get(lesson_id)

    def list_lessons(
        self,
        domain: Optional[str] = None,
        approved_only: bool = False,
        limit: int = 50,
    ) -> List[Lesson]:
        lessons = list(self._lessons.values())
        if domain:
            lessons = [l for l in lessons if l.domain == domain]
        if approved_only:
            lessons = [l for l in lessons if l.operator_approved]
        lessons.sort(key=lambda l: l.created_at, reverse=True)
        return lessons[:limit]

    def search(self, query: str, limit: int = 10) -> List[Lesson]:
        """Simple keyword search over lessons."""
        query_lower = query.lower()
        scored = []
        for lesson in self._lessons.values():
            score = 0
            text = f"{lesson.title} {lesson.summary} {' '.join(lesson.what_worked)} {lesson.domain}"
            for word in query_lower.split():
                if word in text.lower():
                    score += 1
            if score > 0:
                scored.append((score, lesson))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [l for _, l in scored[:limit]]

    def stats(self) -> Dict[str, Any]:
        lessons = list(self._lessons.values())
        return {
            "total_lessons": len(lessons),
            "approved": sum(1 for l in lessons if l.operator_approved),
            "by_domain": self._count_by_domain(lessons),
            "avg_reproducibility": round(
                sum(l.reproducibility_score for l in lessons) / max(len(lessons), 1), 3
            ),
        }

    def _extract_metrics(self, loop: ProofLoop) -> Dict[str, float]:
        metrics: Dict[str, float] = {}
        for ev in loop.evidence:
            if ev.stage == LoopStage.VERIFICATION:
                metrics["verification_score"] = ev.data.get("score", 0)
                metrics["verified"] = 1.0 if ev.data.get("verified") else 0.0
            elif ev.stage == LoopStage.SETTLEMENT:
                metrics["settlement_hbar"] = ev.data.get("amount_hbar", 0)
            elif ev.stage == LoopStage.EXECUTION:
                metrics["execution_time_s"] = ev.data.get("execution_time_s", 0)
                metrics["confidence"] = ev.data.get("confidence", 0)
        return metrics

    def _extract_actions(self, loop: ProofLoop, context: Dict[str, Any]) -> List[str]:
        actions = []
        for ev in loop.evidence:
            if ev.stage == LoopStage.EXECUTION and ev.data:
                status = ev.data.get("status", "")
                if status:
                    actions.append(f"Agent produced status={status}")
            if ev.stage == LoopStage.VERIFICATION:
                if ev.data.get("verified"):
                    actions.append("Result passed automated verification")
                else:
                    actions.append("Result required manual review")
            if ev.stage == LoopStage.SETTLEMENT:
                amt = ev.data.get("amount_hbar", 0)
                if amt > 0:
                    actions.append(f"Settled at {amt} HBAR")
        if context.get("additional_actions"):
            actions.extend(context["additional_actions"])
        return actions or ["Completed standard proof loop"]

    def _score_reproducibility(self, loop: ProofLoop, metrics: Dict[str, float]) -> float:
        score = 0.5  # base
        if metrics.get("verified", 0) == 1.0:
            score += 0.2
        if metrics.get("confidence", 0) > 0.8:
            score += 0.15
        if metrics.get("verification_score", 0) > 0.9:
            score += 0.1
        if len(loop.evidence) >= 6:
            score += 0.05
        return min(round(score, 3), 1.0)

    def _generate_title(self, loop: ProofLoop, context: Dict[str, Any]) -> str:
        domain = context.get("domain", "general")
        return f"Proof loop success: {domain} task by {loop.agent_id}"

    def _generate_summary(
        self, loop: ProofLoop, actions: List[str], metrics: Dict[str, float]
    ) -> str:
        parts = [f"Loop {loop.loop_id} completed {len(loop.stages_completed)} stages."]
        if metrics.get("verified", 0) == 1.0:
            parts.append("Result verified successfully.")
        if metrics.get("settlement_hbar", 0) > 0:
            parts.append(f"Settled at {metrics['settlement_hbar']} HBAR.")
        return " ".join(parts)

    def _count_by_domain(self, lessons: List[Lesson]) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for l in lessons:
            counts[l.domain] = counts.get(l.domain, 0) + 1
        return counts
