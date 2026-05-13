"""
FastAPI router for specialized workflow agents.

Endpoints:
  /agents/defi/*       — DeFi operations
  /agents/carbon/*     — Carbon/ESG compliance
  /agents/risk/*       — Risk management
  /agents/workflows/*  — Multi-step pipelines
  /agents/stats        — Global agent statistics
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException

from .base_agent import WorkflowEngine


def create_agent_router(engine: WorkflowEngine) -> APIRouter:
    """Create the agent API router wired to a WorkflowEngine."""

    router = APIRouter(tags=["Workflow Agents"])

    # ------------------------------------------------------------------
    # Domain endpoints
    # ------------------------------------------------------------------

    @router.get("/defi")
    async def run_defi(from_token: str = "HBAR", to_token: str = "USDC", swap_amount: int = 0):
        """Run all DeFi agents."""
        context = {"from_token": from_token, "to_token": to_token}
        if swap_amount > 0:
            context["swap_amount"] = swap_amount
        try:
            return engine.run_domain("defi", context)
        except KeyError:
            raise HTTPException(404, "DeFi domain not registered")

    @router.get("/defi/{agent_id}")
    async def run_defi_agent(agent_id: str):
        """Run a specific DeFi agent."""
        return _run_single_agent(engine, "defi", agent_id)

    @router.get("/carbon")
    async def run_carbon(entity_id: str = "0.0.12345"):
        """Run all Carbon/ESG agents."""
        try:
            return engine.run_domain("carbon", {"entity_id": entity_id})
        except KeyError:
            raise HTTPException(404, "Carbon domain not registered")

    @router.get("/carbon/{agent_id}")
    async def run_carbon_agent(agent_id: str):
        """Run a specific Carbon/ESG agent."""
        return _run_single_agent(engine, "carbon", agent_id)

    @router.get("/risk")
    async def run_risk(portfolio_value: int = 100_000):
        """Run all Risk Management agents."""
        try:
            return engine.run_domain("risk", {"portfolio_value": portfolio_value})
        except KeyError:
            raise HTTPException(404, "Risk domain not registered")

    @router.get("/risk/{agent_id}")
    async def run_risk_agent(agent_id: str):
        """Run a specific Risk agent."""
        return _run_single_agent(engine, "risk", agent_id)

    # ------------------------------------------------------------------
    # Workflow pipeline endpoints
    # ------------------------------------------------------------------

    @router.post("/workflows/run")
    async def run_pipeline(steps: List[Dict[str, str]], context: Dict[str, Any] = None):
        """
        Run a multi-step agent pipeline.

        Example body:
        {
            "steps": [
                {"domain": "risk", "agent": "risk_size_001"},
                {"domain": "defi", "agent": "defi_swap_001"}
            ],
            "context": {"portfolio_value": 100000}
        }
        """
        return engine.run_pipeline(steps, context)

    @router.get("/workflows/history")
    async def workflow_history(limit: int = 20):
        """Get recent workflow pipeline history."""
        return {"pipelines": engine.history(limit)}

    @router.get("/workflows/presets")
    async def workflow_presets():
        """List pre-built workflow pipelines."""
        return {
            "presets": [
                {
                    "name": "Assess & Trade",
                    "description": "Size position → route swap",
                    "steps": [
                        {"domain": "risk", "agent": "risk_size_001"},
                        {"domain": "defi", "agent": "defi_swap_001"},
                    ],
                },
                {
                    "name": "Full Risk Scan",
                    "description": "Exposure → drawdown → stop levels → rebalance",
                    "steps": [
                        {"domain": "risk", "agent": "risk_exposure_001"},
                        {"domain": "risk", "agent": "risk_drawdown_001"},
                        {"domain": "risk", "agent": "risk_stop_001"},
                        {"domain": "risk", "agent": "risk_rebal_001"},
                    ],
                },
                {
                    "name": "ESG Audit",
                    "description": "Verify credits → score → report",
                    "steps": [
                        {"domain": "carbon", "agent": "carbon_verify_001"},
                        {"domain": "carbon", "agent": "esg_score_001"},
                        {"domain": "carbon", "agent": "esg_report_001"},
                    ],
                },
                {
                    "name": "DeFi Opportunity",
                    "description": "Pool health → yield ranking → fee harvest",
                    "steps": [
                        {"domain": "defi", "agent": "defi_pool_001"},
                        {"domain": "defi", "agent": "defi_yield_001"},
                        {"domain": "defi", "agent": "defi_fees_001"},
                    ],
                },
            ],
        }

    @router.post("/workflows/presets/{preset_name}")
    async def run_preset(preset_name: str, context: Dict[str, Any] = None):
        """Run a pre-built workflow preset by name."""
        presets = {
            "assess_and_trade": [
                {"domain": "risk", "agent": "risk_size_001"},
                {"domain": "defi", "agent": "defi_swap_001"},
            ],
            "full_risk_scan": [
                {"domain": "risk", "agent": "risk_exposure_001"},
                {"domain": "risk", "agent": "risk_drawdown_001"},
                {"domain": "risk", "agent": "risk_stop_001"},
                {"domain": "risk", "agent": "risk_rebal_001"},
            ],
            "esg_audit": [
                {"domain": "carbon", "agent": "carbon_verify_001"},
                {"domain": "carbon", "agent": "esg_score_001"},
                {"domain": "carbon", "agent": "esg_report_001"},
            ],
            "defi_opportunity": [
                {"domain": "defi", "agent": "defi_pool_001"},
                {"domain": "defi", "agent": "defi_yield_001"},
                {"domain": "defi", "agent": "defi_fees_001"},
            ],
        }
        steps = presets.get(preset_name)
        if not steps:
            raise HTTPException(404, f"Preset '{preset_name}' not found. Available: {list(presets.keys())}")
        return engine.run_pipeline(steps, context)

    # ------------------------------------------------------------------
    # Global
    # ------------------------------------------------------------------

    @router.get("/all")
    async def run_all_agents():
        """Run all 15 agents across all domains."""
        return engine.run_all()

    @router.get("/stats")
    async def agent_stats():
        """Global agent statistics."""
        return engine.stats()

    @router.get("/list")
    async def list_all_agents():
        """List all registered agents."""
        agents = []
        for domain, orch in engine._orchestrators.items():
            agents.extend(orch.list_agents())
        return {"total_agents": len(agents), "agents": agents}

    return router


def _run_single_agent(engine: WorkflowEngine, domain: str, agent_id: str) -> Dict[str, Any]:
    """Run a single agent by ID within a domain."""
    orch = engine._orchestrators.get(domain)
    if not orch:
        raise HTTPException(404, f"Domain '{domain}' not registered")
    agent = orch.get_agent(agent_id)
    if not agent:
        raise HTTPException(404, f"Agent '{agent_id}' not found in {domain}")
    return agent.execute()
