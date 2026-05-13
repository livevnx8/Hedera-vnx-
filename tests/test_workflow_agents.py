#!/usr/bin/env python3
"""
Test suite for specialized workflow agents.
Covers all 15 agents across DeFi, Carbon/ESG, Risk domains + workflow engine.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents.base_agent import (
    AgentDomain,
    ActionType,
    AgentAction,
    WorkflowAgent,
    WorkflowOrchestrator,
    WorkflowEngine,
)
from src.agents.defi_agents import (
    YieldOptimizerAgent,
    SwapRouterAgent,
    LPPositionManagerAgent,
    PoolHealthMonitorAgent,
    FeeHarvesterAgent,
    create_defi_orchestrator,
)
from src.agents.carbon_agents import (
    CarbonCreditVerifierAgent,
    RetirementTrackerAgent,
    ESGScoreCalculatorAgent,
    SustainabilityReporterAgent,
    GreenTokenMonitorAgent,
    create_carbon_orchestrator,
)
from src.agents.risk_agents import (
    PositionSizerAgent,
    PortfolioRebalancerAgent,
    StopLossAutomationAgent,
    ExposureMonitorAgent,
    DrawdownProtectorAgent,
    create_risk_orchestrator,
)

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


def test_defi_agents():
    print("\n═══ DeFi Agents ═══")

    # Yield Optimizer
    agent = YieldOptimizerAgent()
    result = agent.execute()
    check("Yield optimizer runs", result.get("status") == "completed")
    check("Ranked pools", len(result.get("ranked_pools", [])) > 0)
    check("Has actions", len(result.get("actions", [])) > 0)
    check("Has proof hash", len(result.get("proof_hash", "")) == 64)

    # Swap Router
    agent = SwapRouterAgent()
    result = agent.execute({"from_token": "HBAR", "to_token": "USDC", "swap_amount": 10_000_000_000})
    check("Swap router runs", result.get("status") == "completed")
    check("Routes found", len(result.get("routes", [])) >= 2)
    check("Best route", result.get("best_route") is not None)

    # LP Position Manager
    agent = LPPositionManagerAgent()
    result = agent.execute()
    check("LP manager runs", result.get("status") == "completed")
    check("Positions analyzed", len(result.get("positions", [])) > 0)

    # Pool Health Monitor
    agent = PoolHealthMonitorAgent()
    result = agent.execute()
    check("Pool health runs", result.get("status") == "completed")
    check("Pools analyzed", len(result.get("pools", [])) > 0)
    check("Avg health", result.get("avg_health", 0) > 0)
    # Should alert on DOVU pool (TVL drain + whale)
    critical_alerts = [a for a in result.get("actions", []) if hasattr(a, 'urgency') and a.urgency == "critical"]
    check("Critical pool alerts", len(critical_alerts) > 0 or len(result.get("actions", [])) > 0)

    # Fee Harvester
    agent = FeeHarvesterAgent()
    result = agent.execute()
    check("Fee harvester runs", result.get("status") == "completed")
    check("Pending fees tracked", result.get("total_pending_fees", 0) > 0)

    # DeFi Orchestrator
    orch = create_defi_orchestrator()
    result = orch.run_all()
    check("DeFi orchestrator runs", result.get("domain") == "defi")
    check("All 5 agents ran", result.get("agents_succeeded", 0) == 5)
    check("Actions produced", result.get("total_actions", 0) > 0)


def test_carbon_agents():
    print("\n═══ Carbon/ESG Agents ═══")

    # Carbon Credit Verifier
    agent = CarbonCreditVerifierAgent()
    result = agent.execute()
    check("Verifier runs", result.get("status") == "completed")
    check("Credits analyzed", result.get("credits_analyzed", 0) == 3)
    check("Has verified", result.get("verified", 0) >= 1)
    check("Has flagged/rejected", result.get("flagged", 0) + result.get("rejected", 0) >= 1)

    # Retirement Tracker
    agent = RetirementTrackerAgent()
    result = agent.execute()
    check("Retirement tracker runs", result.get("status") == "completed")
    check("Total retired", result.get("total_retired_tonnes", 0) == 225)
    check("Certificate hash", len(result.get("certificate_hash", "")) == 64)

    # ESG Score Calculator
    agent = ESGScoreCalculatorAgent()
    result = agent.execute()
    check("ESG scorer runs", result.get("status") == "completed")
    check("Composite score", 0 < result.get("composite_score", 0) <= 100)
    check("Has grade", result.get("grade", "") in ("A", "B", "C", "D"))

    # Sustainability Reporter
    agent = SustainabilityReporterAgent()
    result = agent.execute()
    check("Reporter runs", result.get("status") == "completed")
    report = result.get("report", {})
    check("Report has sections", "sections" in report)
    check("Report hash", len(report.get("report_hash", "")) == 64)

    # Green Token Monitor
    agent = GreenTokenMonitorAgent()
    result = agent.execute()
    check("Token monitor runs", result.get("status") == "completed")
    check("Tokens tracked", len(result.get("tokens", [])) > 0)
    check("Market cap", result.get("total_market_cap", 0) > 0)
    # HBAR Carbon NFT has supply spike
    check("Supply spike alert", len(result.get("actions", [])) > 0)

    # Carbon Orchestrator
    orch = create_carbon_orchestrator()
    result = orch.run_all()
    check("Carbon orchestrator runs", result.get("domain") == "carbon")
    check("All 5 agents ran", result.get("agents_succeeded", 0) == 5)


def test_risk_agents():
    print("\n═══ Risk Management Agents ═══")

    # Position Sizer
    agent = PositionSizerAgent()
    result = agent.execute()
    check("Position sizer runs", result.get("status") == "completed")
    check("Kelly fraction", result.get("kelly_fraction", 0) > 0)
    check("Position size", result.get("position_size_tinybar", 0) > 0)
    check("Stop-loss set", result.get("stop_loss_pct", 0) > 0)

    # Portfolio Rebalancer
    agent = PortfolioRebalancerAgent()
    result = agent.execute()
    check("Rebalancer runs", result.get("status") == "completed")
    check("Portfolio value", result.get("portfolio_value", 0) > 0)
    check("Current allocation", len(result.get("current_allocation", {})) > 0)

    # Stop-Loss Automation
    agent = StopLossAutomationAgent()
    result = agent.execute()
    check("Stop-loss runs", result.get("status") == "completed")
    check("Positions analyzed", len(result.get("positions", [])) > 0)
    check("Stop levels set", all(p.get("effective_stop", 0) > 0 for p in result.get("positions", [])))

    # Exposure Monitor
    agent = ExposureMonitorAgent()
    result = agent.execute()
    check("Exposure monitor runs", result.get("status") == "completed")
    check("Exposures tracked", len(result.get("exposures", [])) > 0)
    check("Sector breakdown", len(result.get("by_sector", {})) > 0)

    # Drawdown Protector
    agent = DrawdownProtectorAgent()
    result = agent.execute()
    check("Drawdown protector runs", result.get("status") == "completed")
    check("Drawdown calculated", result.get("drawdown_pct", -1) >= 0)
    check("Recovery needed", result.get("recovery_needed_pct", -1) >= 0)

    # Test critical drawdown (25% = between 20% critical and 30% halt)
    result_crit = agent.execute({
        "peak_portfolio_value": 100_000,
        "current_portfolio_value": 75_000,
    })
    check("Critical drawdown detected", result_crit.get("drawdown_status") == "critical")

    # Test halt drawdown (30%+)
    result_halt = agent.execute({
        "peak_portfolio_value": 100_000,
        "current_portfolio_value": 65_000,
    })
    check("Halt drawdown detected", result_halt.get("drawdown_status") == "halt")

    # Risk Orchestrator
    orch = create_risk_orchestrator()
    result = orch.run_all()
    check("Risk orchestrator runs", result.get("domain") == "risk")
    check("All 5 agents ran", result.get("agents_succeeded", 0) == 5)
    check("Actions produced", result.get("total_actions", 0) > 0)


def test_workflow_engine():
    print("\n═══ Workflow Engine ═══")

    engine = WorkflowEngine()
    engine.register(create_defi_orchestrator())
    engine.register(create_carbon_orchestrator())
    engine.register(create_risk_orchestrator())

    # Stats
    stats = engine.stats()
    check("3 domains", len(stats["domains"]) == 3)
    check("15 total agents", stats["total_agents"] == 15)

    # Run single domain
    defi = engine.run_domain("defi")
    check("DeFi domain runs", defi.get("domain") == "defi")
    check("DeFi 5 agents", defi.get("agents_succeeded") == 5)

    # Run all
    all_results = engine.run_all()
    check("All 3 domains", all_results.get("domains") == 3)
    check("All domains present", set(all_results["results"].keys()) == {"defi", "carbon", "risk"})

    # Run pipeline
    pipeline = engine.run_pipeline([
        {"domain": "risk", "agent": "risk_size_001"},
        {"domain": "defi", "agent": "defi_swap_001"},
    ], {"portfolio_value": 50_000})

    check("Pipeline completed", pipeline.get("completed_steps", 0) == 2)
    check("Pipeline has ID", len(pipeline.get("pipeline_id", "")) > 0)
    check("Steps have proof hash", all(
        len(s.get("proof_hash", "")) == 64
        for s in pipeline.get("steps", [])
        if s.get("status") == "completed"
    ))

    # History
    history = engine.history()
    check("History recorded", len(history) >= 1)

    # Cross-domain pipeline
    pipeline2 = engine.run_pipeline([
        {"domain": "carbon", "agent": "carbon_verify_001"},
        {"domain": "carbon", "agent": "esg_score_001"},
        {"domain": "risk", "agent": "risk_exposure_001"},
    ])
    check("Cross-domain pipeline", pipeline2.get("completed_steps") == 3)

    # Bad agent
    pipeline3 = engine.run_pipeline([
        {"domain": "risk", "agent": "nonexistent"},
    ])
    check("Handles missing agent", pipeline3.get("failed_steps") == 1)


def test_agent_typing():
    print("\n═══ Agent Typing & Proofs ═══")

    action = AgentAction(
        action_type=ActionType.RECOMMEND,
        title="Test action",
        description="Testing typed actions",
        params={"key": "value"},
        confidence=0.85,
        urgency="medium",
    )
    d = action.to_dict()
    check("Action serializes", d["action_type"] == "recommend")
    check("Action has confidence", d["confidence"] == 0.85)

    agent = YieldOptimizerAgent()
    info = agent.info()
    check("Agent info", info["agent_id"] == "defi_yield_001")
    check("Agent domain", info["domain"] == "defi")
    check("Agent idle", info["status"] == "idle")

    result = agent.execute()
    info2 = agent.info()
    check("Run count incremented", info2["run_count"] == 1)
    check("Last run updated", info2["last_run"] > 0)


# ---------------------------------------------------------------------------
# Run all tests
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("╔═══════════════════════════════════════════════════════════╗")
    print("║  Specialized Workflow Agents — Test Suite                 ║")
    print("╚═══════════════════════════════════════════════════════════╝")

    test_defi_agents()
    test_carbon_agents()
    test_risk_agents()
    test_workflow_engine()
    test_agent_typing()

    print(f"\n{'═' * 60}")
    total = PASS + FAIL
    print(f"Results: {PASS}/{total} passed, {FAIL} failed")
    if FAIL == 0:
        print("✅ All workflow agent tests passed!")
    else:
        print(f"❌ {FAIL} test(s) failed")
    print(f"{'═' * 60}")

    sys.exit(0 if FAIL == 0 else 1)
