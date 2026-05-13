"""
Specialized Workflow Agents for Hedera.

Six agent domains (30 specialists) with a unified workflow engine:
- DeFi Operations: yield, swaps, LP management, pool health, fees
- Carbon/ESG Compliance: credit verification, retirement, ESG scoring, reporting
- Risk Management: position sizing, rebalancing, stop-loss, exposure, drawdown
- Hedera Native: HCS topics, HTS lifecycle, scheduled txs, multi-sig, profiling
- Intelligence: signal aggregation, sentiment, whale profiling, volume, arb
- Autonomous Ops: self-healing, cost optimizer, circuit breakers, scheduler, health
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
from .advanced_workflows import (
    EventBus,
    EventTrigger,
    TriggerManager,
    AgentScheduler,
    ScheduleEntry,
    evaluate_condition,
    resolve_pipeline_steps,
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
from .hedera_native_agents import (
    HCSTopicOrchestratorAgent,
    HTSTokenLifecycleAgent,
    ScheduledTxManagerAgent,
    MultiSigCoordinatorAgent,
    AccountActivityProfilerAgent,
    create_hedera_orchestrator,
)
from .intel_agents import (
    PredictionSignalAggregatorAgent,
    SentimentAggregatorAgent,
    WhaleBehaviorProfilerAgent,
    VolumeAnomalyScorerAgent,
    CrossChainArbDetectorAgent,
    create_intel_orchestrator,
)
from .ops_agents import (
    SelfHealerAgent,
    CostOptimizerAgent,
    CircuitBreakerOrchestratorAgent,
    TaskSchedulerAgent,
    SystemHealthAggregatorAgent,
    create_ops_orchestrator,
)

__all__ = [
    "AgentDomain",
    "ActionType",
    "AgentAction",
    "WorkflowAgent",
    "WorkflowOrchestrator",
    "WorkflowEngine",
    "WorkflowStep",
    "EventBus",
    "EventTrigger",
    "TriggerManager",
    "AgentScheduler",
    "ScheduleEntry",
    "evaluate_condition",
    "resolve_pipeline_steps",
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
    "HCSTopicOrchestratorAgent",
    "HTSTokenLifecycleAgent",
    "ScheduledTxManagerAgent",
    "MultiSigCoordinatorAgent",
    "AccountActivityProfilerAgent",
    "create_hedera_orchestrator",
    "PredictionSignalAggregatorAgent",
    "SentimentAggregatorAgent",
    "WhaleBehaviorProfilerAgent",
    "VolumeAnomalyScorerAgent",
    "CrossChainArbDetectorAgent",
    "create_intel_orchestrator",
    "SelfHealerAgent",
    "CostOptimizerAgent",
    "CircuitBreakerOrchestratorAgent",
    "TaskSchedulerAgent",
    "SystemHealthAggregatorAgent",
    "create_ops_orchestrator",
]
