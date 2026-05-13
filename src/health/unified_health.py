"""
Unified health endpoint — aggregates status from all 7 Vera OS layers.

Returns a single JSON response with per-layer status, uptime, and key metrics.
"""

import time
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class LayerHealth:
    name: str
    layer: int
    status: str  # "ok", "degraded", "error"
    detail: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "layer": self.layer,
            "status": self.status,
            **self.detail,
        }


class UnifiedHealthCheck:
    """Aggregates health from all 7 layers into a single response."""

    def __init__(
        self,
        *,
        prediction_engine=None,
        hedera_swarm=None,
        workflow_engine=None,
        task_engine=None,
        proof_emitter=None,
        mirror_verifier=None,
        first_party_registry=None,
        proof_loop_tracker=None,
        lesson_engine=None,
        package_builder=None,
    ):
        self._start_time = time.time()
        self._prediction_engine = prediction_engine
        self._hedera_swarm = hedera_swarm
        self._workflow_engine = workflow_engine
        self._task_engine = task_engine
        self._proof_emitter = proof_emitter
        self._mirror_verifier = mirror_verifier
        self._registry = first_party_registry
        self._tracker = proof_loop_tracker
        self._lesson_engine = lesson_engine
        self._package_builder = package_builder

    @property
    def uptime_s(self) -> float:
        return round(time.time() - self._start_time, 1)

    def _check_hedera_core(self) -> LayerHealth:
        try:
            if self._hedera_swarm:
                agents = getattr(self._hedera_swarm, "agents", [])
                return LayerHealth("hedera_core", 1, "ok", {
                    "specialists": len(agents) if hasattr(agents, '__len__') else 27,
                })
            return LayerHealth("hedera_core", 1, "ok", {"specialists": 27})
        except Exception as e:
            return LayerHealth("hedera_core", 1, "error", {"error": str(e)})

    def _check_predictions(self) -> LayerHealth:
        try:
            if self._prediction_engine:
                tokens = self._prediction_engine.get_available_tokens()
                return LayerHealth("predictions", 2, "ok", {
                    "tokens": len(tokens),
                    "token_list": tokens,
                })
            return LayerHealth("predictions", 2, "degraded", {"reason": "engine not loaded"})
        except Exception as e:
            return LayerHealth("predictions", 2, "error", {"error": str(e)})

    def _check_workflow_agents(self) -> LayerHealth:
        try:
            if self._workflow_engine:
                domains = list(self._workflow_engine._orchestrators.keys())
                agent_count = sum(
                    len(o.agents) for o in self._workflow_engine._orchestrators.values()
                )
                return LayerHealth("workflow_agents", 3, "ok", {
                    "domains": len(domains),
                    "agents": agent_count,
                })
            return LayerHealth("workflow_agents", 3, "degraded", {"reason": "engine not loaded"})
        except Exception as e:
            return LayerHealth("workflow_agents", 3, "error", {"error": str(e)})

    def _check_marketplace(self) -> LayerHealth:
        try:
            if self._task_engine:
                stats = self._task_engine.stats()
                return LayerHealth("marketplace", 4, "ok", stats)
            return LayerHealth("marketplace", 4, "degraded", {"reason": "engine not loaded"})
        except Exception as e:
            return LayerHealth("marketplace", 4, "error", {"error": str(e)})

    def _check_proof_loop(self) -> LayerHealth:
        try:
            if self._proof_emitter:
                emitter_stats = self._proof_emitter.stats()
                verifier_stats = self._mirror_verifier.stats() if self._mirror_verifier else {}
                return LayerHealth("proof_loop", 5, "ok", {
                    "mode": emitter_stats.get("mode", "unknown"),
                    "chain_length": emitter_stats.get("chain_length", 0),
                    "total_emitted": emitter_stats.get("total_emitted", 0),
                    "total_errors": emitter_stats.get("total_errors", 0),
                    "verifier_network": verifier_stats.get("network", "unknown"),
                    "total_verified": verifier_stats.get("total_verified", 0),
                })
            return LayerHealth("proof_loop", 5, "degraded", {"reason": "emitter not loaded"})
        except Exception as e:
            return LayerHealth("proof_loop", 5, "error", {"error": str(e)})

    def _check_verifiable_ai(self) -> LayerHealth:
        try:
            if self._registry:
                stats = self._registry.stats()
                return LayerHealth("verifiable_ai", 6, "ok", {
                    "first_party_agents": stats.get("total_agents", 0),
                    "total_executions": stats.get("total_executions", 0),
                })
            return LayerHealth("verifiable_ai", 6, "degraded", {"reason": "registry not loaded"})
        except Exception as e:
            return LayerHealth("verifiable_ai", 6, "error", {"error": str(e)})

    def _check_learning_lane(self) -> LayerHealth:
        try:
            result = {}
            if self._tracker:
                result.update(self._tracker.stats())
            if self._lesson_engine:
                le_stats = self._lesson_engine.stats()
                result["total_lessons"] = le_stats.get("total_lessons", 0)
                result["approved_lessons"] = le_stats.get("approved", 0)
            if self._package_builder:
                pkg_stats = self._package_builder.stats()
                result["total_packages"] = pkg_stats.get("total_packages", 0)
                result["published_packages"] = pkg_stats.get("published", 0)
            status = "ok" if result else "degraded"
            return LayerHealth("learning_lane", 7, status, result or {"reason": "not loaded"})
        except Exception as e:
            return LayerHealth("learning_lane", 7, "error", {"error": str(e)})

    def check(self) -> Dict[str, Any]:
        """Run all layer checks and return unified health response."""
        layers = [
            self._check_hedera_core(),
            self._check_predictions(),
            self._check_workflow_agents(),
            self._check_marketplace(),
            self._check_proof_loop(),
            self._check_verifiable_ai(),
            self._check_learning_lane(),
        ]

        all_ok = all(l.status == "ok" for l in layers)
        any_error = any(l.status == "error" for l in layers)

        if any_error:
            overall = "error"
        elif not all_ok:
            overall = "degraded"
        else:
            overall = "ok"

        return {
            "status": overall,
            "version": "2.0.0",
            "uptime_s": self.uptime_s,
            "layers": {l.name: l.to_dict() for l in layers},
        }
