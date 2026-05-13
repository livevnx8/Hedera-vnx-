"""Public wrapper for the specialized workflow agent engine."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class WorkflowAgentService:
    """Facade over 30 specialized workflow agents across 6 domains.

    Provides a single entry point for running agents individually,
    by domain, as multi-step pipelines, or via event-driven triggers.
    """

    _initialized: bool = field(default=False, repr=False)
    engine: Any = field(default=None, repr=False)
    event_bus: Any = field(default=None, repr=False)
    trigger_manager: Any = field(default=None, repr=False)
    scheduler: Any = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if not self._initialized:
            self._lazy_init()

    def _lazy_init(self) -> None:
        from src.agents.base_agent import WorkflowEngine, WorkflowAgent
        from src.agents.defi_agents import create_defi_orchestrator
        from src.agents.carbon_agents import create_carbon_orchestrator
        from src.agents.risk_agents import create_risk_orchestrator
        from src.agents.hedera_native_agents import create_hedera_orchestrator
        from src.agents.intel_agents import create_intel_orchestrator
        from src.agents.ops_agents import create_ops_orchestrator
        from src.agents.advanced_workflows import EventBus, TriggerManager, AgentScheduler

        self.engine = self.engine or WorkflowEngine()
        self.engine.register(create_defi_orchestrator())
        self.engine.register(create_carbon_orchestrator())
        self.engine.register(create_risk_orchestrator())
        self.engine.register(create_hedera_orchestrator())
        self.engine.register(create_intel_orchestrator())
        self.engine.register(create_ops_orchestrator())

        self.event_bus = EventBus()
        WorkflowAgent._event_bus = self.event_bus
        self.trigger_manager = TriggerManager(self.event_bus, self.engine.run_pipeline)
        self.scheduler = AgentScheduler(self.engine.run_pipeline, self.engine.run_domain)
        self._initialized = True

    def run_defi(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Run all 5 DeFi agents."""
        return self.engine.run_domain("defi", context)

    def run_carbon(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Run all 5 Carbon/ESG agents."""
        return self.engine.run_domain("carbon", context)

    def run_risk(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Run all 5 Risk Management agents."""
        return self.engine.run_domain("risk", context)

    def run_hedera(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Run all 5 Hedera Native agents."""
        return self.engine.run_domain("hedera", context)

    def run_intel(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Run all 5 Intelligence & Analytics agents."""
        return self.engine.run_domain("intel", context)

    def run_ops(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Run all 5 Autonomous Operations agents."""
        return self.engine.run_domain("ops", context)

    def run_all(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Run all 30 agents across all 6 domains."""
        return self.engine.run_all(context)

    def run_pipeline(
        self,
        steps: List[Dict[str, str]],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Run a multi-step agent pipeline across domains."""
        return self.engine.run_pipeline(steps, context)

    def stats(self) -> Dict[str, Any]:
        """Global agent statistics."""
        return self.engine.stats()
