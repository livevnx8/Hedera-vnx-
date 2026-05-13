"""
Live Pipeline — reactive agent execution triggered by marketplace events.

When marketplace events fire, this pipeline automatically runs relevant
intelligence agents and pushes results to the event stream.
"""

import time
from typing import Any, Callable, Dict, List, Optional


class LivePipelineRule:
    """A rule that maps an event pattern to an agent pipeline."""

    def __init__(
        self,
        name: str,
        event_pattern: str,
        pipeline_steps: List[Dict[str, str]],
        cooldown_seconds: float = 30.0,
        enabled: bool = True,
    ):
        self.name = name
        self.event_pattern = event_pattern
        self.pipeline_steps = pipeline_steps
        self.cooldown_seconds = cooldown_seconds
        self.enabled = enabled
        self.fire_count = 0
        self.last_fired = 0.0

    def matches(self, channel: str) -> bool:
        if self.event_pattern == "*":
            return True
        if self.event_pattern.endswith("*"):
            return channel.startswith(self.event_pattern[:-1])
        return channel == self.event_pattern

    def can_fire(self) -> bool:
        if not self.enabled:
            return False
        return (time.time() - self.last_fired) >= self.cooldown_seconds

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "event_pattern": self.event_pattern,
            "pipeline_steps": self.pipeline_steps,
            "cooldown_seconds": self.cooldown_seconds,
            "enabled": self.enabled,
            "fire_count": self.fire_count,
            "last_fired": self.last_fired,
        }


class LivePipeline:
    """
    Reactive pipeline manager.

    Listens to the event stream and fires agent pipelines when
    matching events arrive.
    """

    def __init__(
        self,
        run_pipeline_fn: Callable,
        emit_fn: Callable = None,
    ):
        self.run_pipeline = run_pipeline_fn
        self.emit = emit_fn
        self._rules: List[LivePipelineRule] = []
        self._results: List[Dict[str, Any]] = []

    def add_rule(self, rule: LivePipelineRule):
        self._rules.append(rule)

    def remove_rule(self, name: str):
        self._rules = [r for r in self._rules if r.name != name]

    def process_event(self, channel: str, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Process an incoming event against all rules.
        Returns list of pipeline results that fired.
        """
        fired = []
        for rule in self._rules:
            if not rule.matches(channel):
                continue
            if not rule.can_fire():
                continue

            rule.fire_count += 1
            rule.last_fired = time.time()

            try:
                result = self.run_pipeline(rule.pipeline_steps, data)
                record = {
                    "rule": rule.name,
                    "trigger_event": channel,
                    "timestamp": time.time(),
                    "status": "completed",
                    "result": result,
                }
            except Exception as e:
                record = {
                    "rule": rule.name,
                    "trigger_event": channel,
                    "timestamp": time.time(),
                    "status": "error",
                    "error": str(e),
                }

            fired.append(record)
            self._results.append(record)

            if self.emit:
                self.emit(
                    f"pipeline.reactive.{rule.name}",
                    record,
                    source="live_pipeline",
                )

        if len(self._results) > 500:
            self._results = self._results[-250:]

        return fired

    def list_rules(self) -> List[Dict[str, Any]]:
        return [r.to_dict() for r in self._rules]

    def history(self, limit: int = 20) -> List[Dict[str, Any]]:
        return list(reversed(self._results[-limit:]))

    def stats(self) -> Dict[str, Any]:
        return {
            "total_rules": len(self._rules),
            "active_rules": sum(1 for r in self._rules if r.enabled),
            "total_firings": sum(r.fire_count for r in self._rules),
            "recent_results": len(self._results),
        }


def create_default_rules() -> List[LivePipelineRule]:
    """Default reactive rules for the marketplace."""
    return [
        LivePipelineRule(
            name="task_posted_intel",
            event_pattern="marketplace.task.posted",
            pipeline_steps=[
                {"domain": "intel", "agent": "intel_signal_001"},
            ],
            cooldown_seconds=10.0,
        ),
        LivePipelineRule(
            name="high_value_risk_check",
            event_pattern="marketplace.task.awarded",
            pipeline_steps=[
                {"domain": "risk", "agent": "risk_exposure_001"},
                {"domain": "risk", "agent": "risk_size_001"},
            ],
            cooldown_seconds=5.0,
        ),
        LivePipelineRule(
            name="settlement_health_scan",
            event_pattern="marketplace.task.settled",
            pipeline_steps=[
                {"domain": "ops", "agent": "ops_health_001"},
            ],
            cooldown_seconds=30.0,
        ),
    ]
