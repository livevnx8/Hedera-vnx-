"""Public facade for the Agent Marketplace."""

from typing import Any, Dict, List, Optional


class MarketplaceService:
    """
    High-level facade for the Vera OS Agent Marketplace.

    Provides task lifecycle management, reputation scoring, escrow,
    and result verification in one unified interface.
    """

    def __init__(self):
        from src.marketplace import (
            TaskEngine, ReputationEngine, EscrowEngine, ResultVerifier,
        )
        from src.agents.advanced_workflows import EventBus

        self._event_bus = EventBus()
        self.tasks = TaskEngine(event_bus=self._event_bus)
        self.reputation = ReputationEngine()
        self.escrow = EscrowEngine(event_bus=self._event_bus)
        self.verifier = ResultVerifier()

    def post_and_fund(
        self,
        title: str,
        budget_hbar: float,
        requester_id: str = "system",
        **kwargs,
    ) -> Dict[str, Any]:
        """Post a task and create escrow hold in one call."""
        task = self.tasks.post_task(title, budget_hbar=budget_hbar, requester_id=requester_id, **kwargs)
        escrow = self.escrow.hold(task.task_id, requester_id, "", budget_hbar)
        task.escrow_id = escrow.escrow_id
        return {"task_id": task.task_id, "escrow_id": escrow.escrow_id, "status": task.status.value}

    def stats(self) -> Dict[str, Any]:
        return {
            "tasks": self.tasks.stats(),
            "reputation": self.reputation.stats(),
            "escrow": self.escrow.stats(),
            "verifier": self.verifier.stats(),
        }
