"""Public health report facade."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class HealthService:
    """Run and format deep VNX health checks."""

    hedera_swarm: Any | None = None
    vnx_swarm: Any | None = None
    db_pool: Any | None = None
    redis_client: Any | None = None

    def report(self) -> dict[str, Any]:
        """Run the deep health checker with the configured dependencies."""
        from src.health.deep_health import DeepHealthChecker

        checker = DeepHealthChecker(
            hedera_swarm=self.hedera_swarm,
            vnx_swarm=self.vnx_swarm,
            db_pool=self.db_pool,
            redis_client=self.redis_client,
        )
        return checker.check_all()

    def format(self, report: dict[str, Any]) -> str:
        """Format a health report for terminal output."""
        from src.health.deep_health import format_health_report

        return format_health_report(report)
