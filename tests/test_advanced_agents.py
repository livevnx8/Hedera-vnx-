#!/usr/bin/env python3
"""
Test suite for Wave 2 agents + advanced workflow engine.
Covers: Hedera Native (5), Intel (5), Ops (5), conditional branching,
event bus, triggers, scheduler, and new presets.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents.base_agent import (
    AgentDomain,
    WorkflowEngine,
    WorkflowAgent,
)
from src.agents.advanced_workflows import (
    EventBus,
    EventTrigger,
    TriggerManager,
    AgentScheduler,
    ScheduleEntry,
    evaluate_condition,
    resolve_pipeline_steps,
)
from src.agents.hedera_native_agents import (
    HCSTopicOrchestratorAgent,
    HTSTokenLifecycleAgent,
    ScheduledTxManagerAgent,
    MultiSigCoordinatorAgent,
    AccountActivityProfilerAgent,
    create_hedera_orchestrator,
)
from src.agents.intel_agents import (
    PredictionSignalAggregatorAgent,
    SentimentAggregatorAgent,
    WhaleBehaviorProfilerAgent,
    VolumeAnomalyScorerAgent,
    CrossChainArbDetectorAgent,
    create_intel_orchestrator,
)
from src.agents.ops_agents import (
    SelfHealerAgent,
    CostOptimizerAgent,
    CircuitBreakerOrchestratorAgent,
    TaskSchedulerAgent,
    SystemHealthAggregatorAgent,
    create_ops_orchestrator,
)
from src.agents.defi_agents import create_defi_orchestrator
from src.agents.carbon_agents import create_carbon_orchestrator
from src.agents.risk_agents import create_risk_orchestrator

PASS = 0
FAIL = 0


def check(name: str, condition: bool, detail: str = ""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        msg = f"  ✗ {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)


# ──────────────────────────────────────────────────────────────
# Hedera Native Agents
# ──────────────────────────────────────────────────────────────

def test_hedera_native_agents():
    print("\n═══ Hedera Native Agents ═══")

    agent = HCSTopicOrchestratorAgent()
    result = agent.execute()
    check("HCS orchestrator runs", result.get("status") == "completed")
    check("Topics analyzed", len(result.get("topics", [])) == 3)
    check("Gap detection", result.get("total_gaps", 0) > 0)
    check("Alerts on gaps/stale", len(result.get("actions", [])) > 0)

    agent = HTSTokenLifecycleAgent()
    result = agent.execute()
    check("HTS lifecycle runs", result.get("status") == "completed")
    check("Tokens analyzed", result.get("total_tokens", 0) == 3)
    check("Risk flags found", result.get("total_risk_flags", 0) > 0)

    agent = ScheduledTxManagerAgent()
    result = agent.execute()
    check("Scheduled tx runs", result.get("status") == "completed")
    check("Pending txs tracked", result.get("pending", 0) >= 1)
    check("At-risk tx detected", result.get("at_risk", 0) >= 1)

    agent = MultiSigCoordinatorAgent()
    result = agent.execute()
    check("Multi-sig runs", result.get("status") == "completed")
    check("Accounts analyzed", len(result.get("accounts", [])) == 2)
    check("Stale tx cleanup", result.get("total_stale", 0) > 0)

    agent = AccountActivityProfilerAgent()
    result = agent.execute()
    check("Account profiler runs", result.get("status") == "completed")
    profile = result.get("profile", {})
    check("Risk score computed", 0 <= profile.get("risk_score", -1) <= 100)
    check("Risk level set", profile.get("risk_level", "") in ("low", "medium", "high"))

    orch = create_hedera_orchestrator()
    result = orch.run_all()
    check("Hedera orchestrator runs", result.get("domain") == "hedera")
    check("All 5 Hedera agents ran", result.get("agents_succeeded", 0) == 5)


# ──────────────────────────────────────────────────────────────
# Intelligence Agents
# ──────────────────────────────────────────────────────────────

def test_intel_agents():
    print("\n═══ Intelligence & Analytics Agents ═══")

    agent = PredictionSignalAggregatorAgent()
    result = agent.execute()
    check("Signal aggregator runs", result.get("status") == "completed")
    check("Composite score", 0 < result.get("composite_score", 0) < 1)
    check("Direction set", result.get("direction", "") in ("BULLISH", "BEARISH", "NEUTRAL"))

    agent = SentimentAggregatorAgent()
    result = agent.execute()
    check("Sentiment runs", result.get("status") == "completed")
    check("Fear/greed index", 0 <= result.get("fear_greed_index", -1) <= 100)
    check("Label set", result.get("label", "") in ("Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"))

    agent = WhaleBehaviorProfilerAgent()
    result = agent.execute()
    check("Whale profiler runs", result.get("status") == "completed")
    check("Whales tracked", len(result.get("whales", [])) > 0)
    check("Net pressure", result.get("net_pressure", "") in ("accumulation", "distribution", "neutral"))

    agent = VolumeAnomalyScorerAgent()
    result = agent.execute()
    check("Volume scorer runs", result.get("status") == "completed")
    check("Markets analyzed", len(result.get("markets", [])) > 0)
    check("Anomalies detected", result.get("anomaly_count", 0) > 0)
    check("Wash suspects", result.get("wash_suspects", 0) > 0)

    agent = CrossChainArbDetectorAgent()
    result = agent.execute()
    check("Arb detector runs", result.get("status") == "completed")
    check("Opportunities found", len(result.get("opportunities", [])) > 0)
    check("Profitable arbs", result.get("profitable_count", 0) >= 1)

    orch = create_intel_orchestrator()
    result = orch.run_all()
    check("Intel orchestrator runs", result.get("domain") == "intel")
    check("All 5 Intel agents ran", result.get("agents_succeeded", 0) == 5)


# ──────────────────────────────────────────────────────────────
# Autonomous Ops Agents
# ──────────────────────────────────────────────────────────────

def test_ops_agents():
    print("\n═══ Autonomous Operations Agents ═══")

    agent = SelfHealerAgent()
    result = agent.execute()
    check("Self-healer runs", result.get("status") == "completed")
    check("Services tracked", len(result.get("services", [])) > 0)
    check("Down services found", result.get("down", 0) >= 1)
    check("Restart action", any(
        a.action_type.value == "execute" if hasattr(a, 'action_type') else a.get("action_type") == "execute"
        for a in result.get("actions", [])
    ))

    agent = CostOptimizerAgent()
    result = agent.execute()
    check("Cost optimizer runs", result.get("status") == "completed")
    check("Daily spend tracked", result.get("daily_spend_hbar", 0) > 0)
    check("Savings recommended", result.get("total_potential_savings_hbar", 0) > 0)

    agent = CircuitBreakerOrchestratorAgent()
    result = agent.execute()
    check("Circuit breaker runs", result.get("status") == "completed")
    check("Breakers tracked", len(result.get("breakers", [])) > 0)
    check("Trip recommendation", result.get("tripped_count", 0) >= 1)

    agent = TaskSchedulerAgent()
    result = agent.execute()
    check("Task scheduler runs", result.get("status") == "completed")
    check("Tasks tracked", result.get("total_tasks", 0) > 0)
    check("Overdue detected", result.get("overdue", 0) >= 1)

    agent = SystemHealthAggregatorAgent()
    result = agent.execute()
    check("System health runs", result.get("status") == "completed")
    check("Composite score", 0 < result.get("composite_score", 0) <= 100)
    check("System status", result.get("system_status", "") in ("healthy", "degraded", "critical"))

    orch = create_ops_orchestrator()
    result = orch.run_all()
    check("Ops orchestrator runs", result.get("domain") == "ops")
    check("All 5 Ops agents ran", result.get("agents_succeeded", 0) == 5)


# ──────────────────────────────────────────────────────────────
# Conditional Branching
# ──────────────────────────────────────────────────────────────

def test_conditional_branching():
    print("\n═══ Conditional Branching ═══")

    # evaluate_condition tests
    data = {"score": 85, "status": "critical", "name": "test", "nested": {"val": 42}}

    check("== match", evaluate_condition("status == 'critical'", data))
    check("== no match", not evaluate_condition("status == 'normal'", data))
    check("> match", evaluate_condition("score > 80", data))
    check("< no match", not evaluate_condition("score < 50", data))
    check(">= match", evaluate_condition("score >= 85", data))
    check("!= match", evaluate_condition("name != 'other'", data))

    # resolve_pipeline_steps
    steps = [
        {"domain": "risk", "agent": "risk_size_001"},
        {
            "type": "branch",
            "condition": "status == 'critical'",
            "if_true": [{"domain": "risk", "agent": "risk_stop_001"}],
            "if_false": [{"domain": "risk", "agent": "risk_rebal_001"}],
        },
    ]

    flat = resolve_pipeline_steps(steps, {"status": "critical"})
    check("Branch takes if_true", len(flat) == 2)
    check("Correct true branch", flat[1].get("agent") == "risk_stop_001")

    flat2 = resolve_pipeline_steps(steps, {"status": "normal"})
    check("Branch takes if_false", flat2[1].get("agent") == "risk_rebal_001")

    # Nested branches
    nested = [
        {
            "type": "branch",
            "condition": "level > 5",
            "if_true": [
                {
                    "type": "branch",
                    "condition": "level > 10",
                    "if_true": [{"domain": "ops", "agent": "ops_heal_001"}],
                    "if_false": [{"domain": "ops", "agent": "ops_cost_001"}],
                },
            ],
            "if_false": [{"domain": "defi", "agent": "defi_yield_001"}],
        },
    ]
    flat3 = resolve_pipeline_steps(nested, {"level": 8})
    check("Nested branch resolves", len(flat3) == 1)
    check("Nested picks inner false", flat3[0].get("agent") == "ops_cost_001")


# ──────────────────────────────────────────────────────────────
# Event Bus
# ──────────────────────────────────────────────────────────────

def test_event_bus():
    print("\n═══ Event Bus ═══")

    bus = EventBus()
    received = []

    def handler(event, data):
        received.append({"event": event, "data": data})

    bus.subscribe("risk.*", handler)
    bus.emit("risk.drawdown", {"drawdown_pct": 25})
    check("Event received", len(received) == 1)
    check("Event data correct", received[0]["data"]["drawdown_pct"] == 25)

    bus.emit("defi.yield", {"apy": 12})
    check("Non-matching event filtered", len(received) == 1)

    bus.subscribe("*", handler)
    bus.emit("intel.signal", {"composite": 0.8})
    check("Wildcard catches all", len(received) == 2)

    stats = bus.stats()
    check("Event bus stats", stats["total_events"] == 3)

    recent = bus.recent_events(5)
    check("Recent events", len(recent) == 3)


# ──────────────────────────────────────────────────────────────
# Event Triggers
# ──────────────────────────────────────────────────────────────

def test_event_triggers():
    print("\n═══ Event Triggers ═══")

    engine = WorkflowEngine()
    engine.register(create_defi_orchestrator())
    engine.register(create_risk_orchestrator())

    bus = EventBus()
    mgr = TriggerManager(bus, engine.run_pipeline)

    trigger = EventTrigger(
        name="drawdown_alert",
        event_pattern="risk.*",
        condition="drawdown_pct > 20",
        pipeline_steps=[
            {"domain": "risk", "agent": "risk_stop_001"},
        ],
        cooldown_seconds=0,  # no cooldown for test
    )
    mgr.register(trigger)

    check("Trigger registered", len(mgr.list_triggers()) == 1)

    # Emit matching event
    bus.emit("risk.risk_drawdown_001", {"drawdown_pct": 25, "status": "critical"})
    check("Trigger fired", trigger.fire_count == 1)
    check("Trigger history", len(mgr.history()) == 1)

    # Emit non-matching (below threshold)
    bus.emit("risk.risk_drawdown_001", {"drawdown_pct": 10, "status": "normal"})
    check("Trigger skipped (condition)", trigger.fire_count == 1)

    # Emit non-matching pattern
    bus.emit("defi.yield", {"drawdown_pct": 50})
    check("Trigger skipped (pattern)", trigger.fire_count == 1)

    check("Trigger stats", mgr.stats()["total_firings"] == 1)


# ──────────────────────────────────────────────────────────────
# Scheduler
# ──────────────────────────────────────────────────────────────

def test_scheduler():
    print("\n═══ Agent Scheduler ═══")

    engine = WorkflowEngine()
    engine.register(create_ops_orchestrator())
    engine.register(create_risk_orchestrator())

    sched = AgentScheduler(engine.run_pipeline, engine.run_domain)

    entry = ScheduleEntry(
        name="test_ops_run",
        interval_seconds=9999,
        domain="ops",
    )
    sched.register(entry)

    check("Schedule registered", len(sched.list_schedules()) == 1)

    # Manual run
    result = sched.run_now(entry.schedule_id)
    check("Manual run succeeds", result.get("status") == "completed")
    check("Run count incremented", entry.run_count == 1)

    check("Scheduler stats", sched.stats()["total_schedules"] == 1)
    check("Scheduler history", len(sched.history()) == 0)  # run_now doesn't go through _loop

    # Bad schedule
    result = sched.run_now("nonexistent")
    check("Bad schedule handled", "error" in result)


# ──────────────────────────────────────────────────────────────
# Full 6-domain engine
# ──────────────────────────────────────────────────────────────

def test_full_engine():
    print("\n═══ Full 6-Domain Engine ═══")

    engine = WorkflowEngine()
    engine.register(create_defi_orchestrator())
    engine.register(create_carbon_orchestrator())
    engine.register(create_risk_orchestrator())
    engine.register(create_hedera_orchestrator())
    engine.register(create_intel_orchestrator())
    engine.register(create_ops_orchestrator())

    stats = engine.stats()
    check("6 domains", len(stats["domains"]) == 6)
    check("30 total agents", stats["total_agents"] == 30)

    # Run all
    result = engine.run_all()
    check("All 6 domains ran", result.get("domains") == 6)
    for domain in ("defi", "carbon", "risk", "hedera", "intel", "ops"):
        d = result["results"].get(domain, {})
        check(f"{domain}: 5 agents", d.get("agents_succeeded") == 5)

    # Cross-domain pipeline (smart_trade preset)
    pipeline = engine.run_pipeline([
        {"domain": "intel", "agent": "intel_signal_001"},
        {"domain": "risk", "agent": "risk_size_001"},
        {"domain": "defi", "agent": "defi_swap_001"},
        {"domain": "risk", "agent": "risk_exposure_001"},
    ])
    check("Smart trade pipeline", pipeline.get("completed_steps") == 4)

    # Hedera audit preset
    pipeline2 = engine.run_pipeline([
        {"domain": "hedera", "agent": "hedera_account_001"},
        {"domain": "hedera", "agent": "hedera_hts_001"},
        {"domain": "hedera", "agent": "hedera_hcs_001"},
        {"domain": "carbon", "agent": "esg_score_001"},
    ])
    check("Hedera audit pipeline", pipeline2.get("completed_steps") == 4)

    # System checkup preset
    pipeline3 = engine.run_pipeline([
        {"domain": "ops", "agent": "ops_health_001"},
        {"domain": "ops", "agent": "ops_circuit_001"},
        {"domain": "ops", "agent": "ops_cost_001"},
        {"domain": "ops", "agent": "ops_heal_001"},
    ])
    check("System checkup pipeline", pipeline3.get("completed_steps") == 4)


# ──────────────────────────────────────────────────────────────
# Event emission from agents
# ──────────────────────────────────────────────────────────────

def test_event_emission():
    print("\n═══ Event Emission ═══")

    bus = EventBus()
    events_received = []
    bus.subscribe("*", lambda e, d: events_received.append(e))

    # Wire event bus
    old_bus = WorkflowAgent._event_bus
    WorkflowAgent._event_bus = bus

    agent = PredictionSignalAggregatorAgent()
    agent.execute()
    check("Agent emits event", len(events_received) == 1)
    check("Event name format", events_received[0] == "intel.intel_signal_001")

    agent2 = SelfHealerAgent()
    agent2.execute()
    check("Ops agent emits", len(events_received) == 2)
    check("Ops event name", events_received[1] == "ops.ops_heal_001")

    WorkflowAgent._event_bus = old_bus


# ---------------------------------------------------------------------------
# Run all tests
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("╔═══════════════════════════════════════════════════════════╗")
    print("║  Wave 2 Agents + Advanced Workflows — Test Suite         ║")
    print("╚═══════════════════════════════════════════════════════════╝")

    test_hedera_native_agents()
    test_intel_agents()
    test_ops_agents()
    test_conditional_branching()
    test_event_bus()
    test_event_triggers()
    test_scheduler()
    test_full_engine()
    test_event_emission()

    print(f"\n{'═' * 60}")
    total = PASS + FAIL
    print(f"Results: {PASS}/{total} passed, {FAIL} failed")
    if FAIL == 0:
        print("✅ All Wave 2 agent tests passed!")
    else:
        print(f"❌ {FAIL} test(s) failed")
    print(f"{'═' * 60}")

    sys.exit(0 if FAIL == 0 else 1)
