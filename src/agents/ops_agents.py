"""
Autonomous Operations Agents — 5 specialists for self-healing,
cost optimization, circuit breakers, scheduling, and system health.
"""

import time
from typing import Any, Dict, List

from .base_agent import (
    AgentAction,
    ActionType,
    AgentDomain,
    WorkflowAgent,
    WorkflowOrchestrator,
)


class SelfHealerAgent(WorkflowAgent):
    """
    Detect failed agents/services, auto-restart, escalation if retries exhausted.
    """

    def __init__(self):
        super().__init__("ops_heal_001", "Self-Healer", AgentDomain.OPS)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        services = context.get("services", self._default_services())
        max_retries = context.get("max_retries", 3)
        actions: List[AgentAction] = []

        healthy = 0
        degraded = 0
        down = 0
        analyzed = []

        for svc in services:
            name = svc.get("name", "unknown")
            status = svc.get("status", "unknown")
            error_count = svc.get("error_count_1h", 0)
            last_success = svc.get("last_success_age_s", 0)
            restart_count = svc.get("restart_count", 0)

            if status == "healthy":
                healthy += 1
            elif status == "degraded":
                degraded += 1
            else:
                down += 1

            entry = {
                "name": name,
                "status": status,
                "error_count_1h": error_count,
                "last_success_age_s": last_success,
                "restart_count": restart_count,
            }
            analyzed.append(entry)

            if status == "down" and restart_count < max_retries:
                actions.append(AgentAction(
                    action_type=ActionType.EXECUTE,
                    title=f"Auto-restart: {name} (attempt {restart_count + 1}/{max_retries})",
                    description=f"Service down — {error_count} errors in 1h. Last success {last_success}s ago.",
                    params={"service": name, "action": "restart", "attempt": restart_count + 1},
                    confidence=0.90,
                    urgency="critical",
                ))
            elif status == "down" and restart_count >= max_retries:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"ESCALATION: {name} — retries exhausted ({restart_count}x)",
                    description="Manual intervention required. All auto-restart attempts failed.",
                    params={"service": name, "action": "escalate", "restarts": restart_count},
                    confidence=0.95,
                    urgency="critical",
                ))
            elif status == "degraded":
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Degraded: {name} ({error_count} errors/h)",
                    description="Performance degraded — monitor closely",
                    params={"service": name, "error_count": error_count},
                    confidence=0.80,
                    urgency="high",
                ))

        return {
            "status": "completed",
            "services": analyzed,
            "healthy": healthy,
            "degraded": degraded,
            "down": down,
            "actions": actions,
        }

    def _default_services(self) -> List[Dict]:
        return [
            {"name": "prediction_engine", "status": "healthy", "error_count_1h": 0, "last_success_age_s": 5, "restart_count": 0},
            {"name": "oracle_feed", "status": "degraded", "error_count_1h": 12, "last_success_age_s": 45, "restart_count": 0},
            {"name": "market_maker_bot", "status": "down", "error_count_1h": 50, "last_success_age_s": 600, "restart_count": 1},
            {"name": "hcs_publisher", "status": "healthy", "error_count_1h": 1, "last_success_age_s": 10, "restart_count": 0},
        ]


class CostOptimizerAgent(WorkflowAgent):
    """
    Track HBAR spend per operation, recommend batching, fee scheduling.
    """

    def __init__(self):
        super().__init__("ops_cost_001", "Cost Optimizer", AgentDomain.OPS)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        operations = context.get("operations", self._default_operations())
        budget_hbar = context.get("daily_budget_hbar", 50.0)
        actions: List[AgentAction] = []

        total_cost = 0
        analyzed = []

        for op in operations:
            name = op.get("name", "unknown")
            count_24h = op.get("count_24h", 0)
            avg_cost_tinybar = op.get("avg_cost_tinybar", 0)
            batchable = op.get("batchable", False)
            batch_savings_pct = op.get("batch_savings_pct", 0)

            daily_cost = count_24h * avg_cost_tinybar
            total_cost += daily_cost
            potential_savings = daily_cost * (batch_savings_pct / 100) if batchable else 0

            entry = {
                "operation": name,
                "count_24h": count_24h,
                "avg_cost_tinybar": avg_cost_tinybar,
                "daily_cost_hbar": round(daily_cost / 100_000_000, 4),
                "batchable": batchable,
                "potential_savings_hbar": round(potential_savings / 100_000_000, 4),
            }
            analyzed.append(entry)

            if batchable and potential_savings > 100_000:  # >0.001 HBAR savings
                actions.append(AgentAction(
                    action_type=ActionType.RECOMMEND,
                    title=f"Batch {name}: save {potential_savings/100_000_000:.4f} HBAR/day",
                    description=f"{count_24h} ops/day × {avg_cost_tinybar} tinybar. Batch saves {batch_savings_pct}%",
                    params={"operation": name, "savings_tinybar": int(potential_savings)},
                    confidence=0.85,
                    urgency="medium",
                ))

        total_hbar = total_cost / 100_000_000
        over_budget = total_hbar > budget_hbar

        if over_budget:
            actions.append(AgentAction(
                action_type=ActionType.ALERT,
                title=f"Over budget: {total_hbar:.4f} / {budget_hbar:.1f} HBAR daily",
                description=f"Exceeding daily budget by {total_hbar - budget_hbar:.4f} HBAR",
                params={"daily_spend": total_hbar, "budget": budget_hbar},
                confidence=0.92,
                urgency="high",
            ))

        return {
            "status": "completed",
            "operations": analyzed,
            "daily_spend_hbar": round(total_hbar, 4),
            "budget_hbar": budget_hbar,
            "over_budget": over_budget,
            "total_potential_savings_hbar": round(sum(a["potential_savings_hbar"] for a in analyzed), 4),
            "actions": actions,
        }

    def _default_operations(self) -> List[Dict]:
        return [
            {"name": "hcs_submit_message", "count_24h": 500, "avg_cost_tinybar": 100_000, "batchable": True, "batch_savings_pct": 40},
            {"name": "hts_transfer", "count_24h": 200, "avg_cost_tinybar": 50_000, "batchable": True, "batch_savings_pct": 30},
            {"name": "oracle_publish", "count_24h": 100, "avg_cost_tinybar": 80_000, "batchable": False, "batch_savings_pct": 0},
            {"name": "market_settlement", "count_24h": 10, "avg_cost_tinybar": 200_000, "batchable": False, "batch_savings_pct": 0},
        ]


class CircuitBreakerOrchestratorAgent(WorkflowAgent):
    """
    Monitor all upstream dependencies, open/close circuit breakers, recovery.
    """

    def __init__(self):
        super().__init__("ops_circuit_001", "Circuit Breaker Orchestrator", AgentDomain.OPS)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        breakers = context.get("circuit_breakers", self._default_breakers())
        actions: List[AgentAction] = []

        analyzed = []
        for cb in breakers:
            name = cb.get("name", "unknown")
            state = cb.get("state", "closed")      # closed | open | half_open
            failure_count = cb.get("failure_count", 0)
            failure_threshold = cb.get("failure_threshold", 5)
            last_failure_age_s = cb.get("last_failure_age_s", 0)
            success_rate = cb.get("success_rate_pct", 100)

            # Should trip?
            should_open = state == "closed" and failure_count >= failure_threshold
            # Should attempt recovery?
            should_half_open = state == "open" and last_failure_age_s > 60

            entry = {
                "name": name,
                "state": state,
                "failure_count": failure_count,
                "threshold": failure_threshold,
                "success_rate_pct": success_rate,
                "recommendation": "open" if should_open else "half_open" if should_half_open else "maintain",
            }
            analyzed.append(entry)

            if should_open:
                actions.append(AgentAction(
                    action_type=ActionType.EXECUTE,
                    title=f"Trip breaker: {name} ({failure_count} failures)",
                    description=f"Threshold {failure_threshold} exceeded. Halting requests to prevent cascade.",
                    params={"breaker": name, "action": "open"},
                    confidence=0.92,
                    urgency="critical",
                ))
            elif should_half_open:
                actions.append(AgentAction(
                    action_type=ActionType.RECOMMEND,
                    title=f"Test recovery: {name}",
                    description=f"Breaker open for {last_failure_age_s}s. Attempting half-open probe.",
                    params={"breaker": name, "action": "half_open"},
                    confidence=0.78,
                    urgency="medium",
                ))
            elif state == "open":
                actions.append(AgentAction(
                    action_type=ActionType.INFORM,
                    title=f"Breaker open: {name} — waiting for cooldown",
                    description=f"Last failure {last_failure_age_s}s ago. Will retry at 60s.",
                    params={"breaker": name, "state": "open"},
                    confidence=0.85,
                    urgency="high",
                ))

        return {
            "status": "completed",
            "breakers": analyzed,
            "open_count": sum(1 for b in analyzed if b["state"] == "open"),
            "tripped_count": sum(1 for b in analyzed if b["recommendation"] == "open"),
            "actions": actions,
        }

    def _default_breakers(self) -> List[Dict]:
        return [
            {"name": "mirror_node_api", "state": "closed", "failure_count": 2, "failure_threshold": 5, "last_failure_age_s": 300, "success_rate_pct": 96},
            {"name": "saucerswap_api", "state": "closed", "failure_count": 7, "failure_threshold": 5, "last_failure_age_s": 10, "success_rate_pct": 60},
            {"name": "coingecko_api", "state": "open", "failure_count": 10, "failure_threshold": 5, "last_failure_age_s": 120, "success_rate_pct": 0},
        ]


class TaskSchedulerAgent(WorkflowAgent):
    """
    Reports on scheduled tasks: what's running, due, overdue, idle.
    """

    def __init__(self):
        super().__init__("ops_scheduler_001", "Task Scheduler", AgentDomain.OPS)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        tasks = context.get("scheduled_tasks", self._default_tasks())
        now = time.time()
        actions: List[AgentAction] = []

        analyzed = []
        for task in tasks:
            name = task.get("name", "unknown")
            interval = task.get("interval_seconds", 0)
            last_run = task.get("last_run", 0)
            enabled = task.get("enabled", True)
            last_status = task.get("last_status", "unknown")

            elapsed = now - last_run if last_run > 0 else float("inf")
            overdue = enabled and interval > 0 and elapsed > interval * 1.5
            due_in = max(0, interval - elapsed) if interval > 0 else 0

            entry = {
                "name": name,
                "interval_seconds": interval,
                "enabled": enabled,
                "last_run_age_s": round(elapsed) if last_run > 0 else None,
                "overdue": overdue,
                "due_in_s": round(due_in),
                "last_status": last_status,
            }
            analyzed.append(entry)

            if overdue:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Overdue task: {name} ({elapsed:.0f}s since last run)",
                    description=f"Expected every {interval}s. Status: {last_status}",
                    params={"task": name, "overdue_by": round(elapsed - interval)},
                    confidence=0.88,
                    urgency="high",
                ))

        return {
            "status": "completed",
            "tasks": analyzed,
            "total_tasks": len(analyzed),
            "overdue": sum(1 for t in analyzed if t["overdue"]),
            "enabled": sum(1 for t in analyzed if t["enabled"]),
            "actions": actions,
        }

    def _default_tasks(self) -> List[Dict]:
        now = time.time()
        return [
            {"name": "risk_scan", "interval_seconds": 14400, "last_run": now - 14000, "enabled": True, "last_status": "completed"},
            {"name": "esg_report", "interval_seconds": 604800, "last_run": now - 700000, "enabled": True, "last_status": "completed"},
            {"name": "pool_health_check", "interval_seconds": 3600, "last_run": now - 7000, "enabled": True, "last_status": "error"},
            {"name": "backup", "interval_seconds": 86400, "last_run": now - 80000, "enabled": True, "last_status": "completed"},
        ]


class SystemHealthAggregatorAgent(WorkflowAgent):
    """
    Aggregate health from all agents + infra into composite system score.
    """

    def __init__(self):
        super().__init__("ops_health_001", "System Health Aggregator", AgentDomain.OPS)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        components = context.get("health_components", self._default_components())
        actions: List[AgentAction] = []

        total_score = 0
        total_weight = 0
        analyzed = []

        for comp in components:
            name = comp.get("name", "unknown")
            health = comp.get("health_score", 100)
            weight = comp.get("weight", 1.0)
            status = comp.get("status", "healthy")

            total_score += health * weight
            total_weight += weight

            entry = {
                "component": name,
                "health_score": health,
                "status": status,
                "weight": weight,
            }
            analyzed.append(entry)

            if health < 50:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Unhealthy: {name} (score {health}/100)",
                    description=f"Component below threshold — status: {status}",
                    params={"component": name, "health": health},
                    confidence=0.88,
                    urgency="critical" if health < 25 else "high",
                ))

        composite = round(total_score / max(total_weight, 1), 1)
        system_status = (
            "healthy" if composite >= 80 else
            "degraded" if composite >= 50 else
            "critical"
        )

        actions.append(AgentAction(
            action_type=ActionType.INFORM,
            title=f"System health: {system_status} ({composite}/100)",
            description=f"{len(components)} components | {sum(1 for c in analyzed if c['health_score'] >= 80)} healthy",
            params={"composite": composite, "system_status": system_status},
            confidence=0.90,
            urgency="low" if system_status == "healthy" else "medium" if system_status == "degraded" else "critical",
        ))

        return {
            "status": "completed",
            "system_status": system_status,
            "composite_score": composite,
            "components": analyzed,
            "healthy_count": sum(1 for c in analyzed if c["health_score"] >= 80),
            "degraded_count": sum(1 for c in analyzed if 50 <= c["health_score"] < 80),
            "critical_count": sum(1 for c in analyzed if c["health_score"] < 50),
            "actions": actions,
        }

    def _default_components(self) -> List[Dict]:
        return [
            {"name": "prediction_engine", "health_score": 98, "status": "healthy", "weight": 3.0},
            {"name": "oracle_feed", "health_score": 72, "status": "degraded", "weight": 2.5},
            {"name": "market_maker", "health_score": 45, "status": "error", "weight": 2.0},
            {"name": "hcs_publisher", "health_score": 95, "status": "healthy", "weight": 2.0},
            {"name": "mirror_node_api", "health_score": 88, "status": "healthy", "weight": 1.5},
            {"name": "redis_cache", "health_score": 100, "status": "healthy", "weight": 1.0},
        ]


def create_ops_orchestrator() -> WorkflowOrchestrator:
    """Create the Autonomous Operations orchestrator with all 5 agents."""
    return WorkflowOrchestrator(
        domain=AgentDomain.OPS,
        agents=[
            SelfHealerAgent(),
            CostOptimizerAgent(),
            CircuitBreakerOrchestratorAgent(),
            TaskSchedulerAgent(),
            SystemHealthAggregatorAgent(),
        ],
    )
