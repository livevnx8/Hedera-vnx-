"""
Specialized Workflow Agents for Hedera.

Three agent domains (15 specialists) with a unified workflow engine:
- DeFi Operations: yield, swaps, LP management, pool health, fees
- Carbon/ESG Compliance: credit verification, retirement, ESG scoring, reporting
- Risk Management: position sizing, rebalancing, stop-loss, exposure, drawdown
"""

from .base_agent import (
    AgentDomain,
    ActionType,
    AgentAction,
    WorkflowAgent,
    WorkflowOrchestrator,
    WorkflowEngine,
    WorkflowStep,
)
from .defi_agents import (
    YieldOptimizerAgent,
    SwapRouterAgent,
    LPPositionManagerAgent,
    PoolHealthMonitorAgent,
    FeeHarvesterAgent,
    create_defi_orchestrator,
)
from .carbon_agents import (
    CarbonCreditVerifierAgent,
    RetirementTrackerAgent,
    ESGScoreCalculatorAgent,
    SustainabilityReporterAgent,
    GreenTokenMonitorAgent,
    create_carbon_orchestrator,
)
from .risk_agents import (
    PositionSizerAgent,
    PortfolioRebalancerAgent,
    StopLossAutomationAgent,
    ExposureMonitorAgent,
    DrawdownProtectorAgent,
    create_risk_orchestrator,
)

__all__ = [
    "AgentDomain",
    "ActionType",
    "AgentAction",
    "WorkflowAgent",
    "WorkflowOrchestrator",
    "WorkflowEngine",
    "WorkflowStep",
    "YieldOptimizerAgent",
    "SwapRouterAgent",
    "LPPositionManagerAgent",
    "PoolHealthMonitorAgent",
    "FeeHarvesterAgent",
    "create_defi_orchestrator",
    "CarbonCreditVerifierAgent",
    "RetirementTrackerAgent",
    "ESGScoreCalculatorAgent",
    "SustainabilityReporterAgent",
    "GreenTokenMonitorAgent",
    "create_carbon_orchestrator",
    "PositionSizerAgent",
    "PortfolioRebalancerAgent",
    "StopLossAutomationAgent",
    "ExposureMonitorAgent",
    "DrawdownProtectorAgent",
    "create_risk_orchestrator",
]
