"""Public wrapper for the specialized workflow agent engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class WorkflowAgentService:
    """Facade over the 15 specialized workflow agents.

    Provides a single entry point for running DeFi, Carbon/ESG, and Risk
    agents individually, by domain, or as multi-step pipelines.
    """

    _initialized: bool = field(default=False, repr=False)
    engine: Any = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if not self._initialized:
            self._lazy_init()

    def _lazy_init(self) -> None:
        from src.agents.base_agent import WorkflowEngine
        from src.agents.defi_agents import create_defi_orchestrator
        from src.agents.carbon_agents import create_carbon_orchestrator
        from src.agents.risk_agents import create_risk_orchestrator

        self.engine = self.engine or WorkflowEngine()
        self.engine.register(create_defi_orchestrator())
        self.engine.register(create_carbon_orchestrator())
        self.engine.register(create_risk_orchestrator())
        self._initialized = True

    def run_defi(self, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Run all 5 DeFi agents."""
        return self.engine.run_domain("defi", context)

    def run_carbon(self, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Run all 5 Carbon/ESG agents."""
        return self.engine.run_domain("carbon", context)

    def run_risk(self, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Run all 5 Risk Management agents."""
        return self.engine.run_domain("risk", context)

    def run_all(self, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Run all 15 agents across all domains."""
        return self.engine.run_all(context)

    def run_pipeline(
        self,
        steps: list[dict[str, str]],
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Run a multi-step agent pipeline across domains."""
        return self.engine.run_pipeline(steps, context)

    def stats(self) -> dict[str, Any]:
        """Global agent statistics."""
        return self.engine.stats()
