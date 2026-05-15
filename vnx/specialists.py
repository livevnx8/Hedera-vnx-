"""Public wrapper for the Hedera specialist swarm."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class HederaSpecialistSwarm:
    """Facade over the advanced Hedera VNX micro-specialist orchestrator."""

    orchestrator: Any | None = field(default=None)

    def __post_init__(self) -> None:
        if self.orchestrator is None:
            from hedera_vnx_specialists_advanced import AdvancedSwarmOrchestrator

            self.orchestrator = AdvancedSwarmOrchestrator()

    def specialist_types(self) -> list[dict[str, str]]:
        """Return specialist identifiers and specialization labels."""
        return self.orchestrator.get_specialist_types()

    def status(self) -> dict[str, Any]:
        """Return a lightweight status report without running the swarm."""
        types = self.specialist_types()
        return {
            "status": "ready" if types else "empty",
            "total_specialists": len(types),
            "swarm_runs": self.orchestrator.swarm_runs,
            "total_alerts": self.orchestrator.total_alerts,
            "specialists": types,
        }

    def run_all(self) -> dict[str, Any]:
        """Execute all specialists and return the aggregated swarm result."""
        return self.orchestrator.run_all()

    def alerts(self, limit: int = 10) -> dict[str, Any]:
        """Run the swarm and return a compact alert-focused view."""
        result = self.run_all()
        alerts = result.get("alerts", [])
        return {
            "status": result.get("status"),
            "specialists_active": result.get("specialists_active"),
            "specialists_total": result.get("specialists_total"),
            "total_alerts": result.get("total_alerts", len(alerts)),
            "critical_alerts": result.get("critical_alerts", 0),
            "warning_alerts": result.get("warning_alerts", 0),
            "alerts": alerts[:limit],
        }
