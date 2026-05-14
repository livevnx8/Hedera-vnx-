#!/usr/bin/env python3
"""
Hedera Prediction Market Server v3.
Integrates predictions + analytics + graph data for full dashboard support.
"""

import os
import sys
from typing import Dict, Any, List

from vera_os.paths import add_src_to_path

add_src_to_path()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from metrics.prometheus_metrics import metrics

from prediction_server_production import ProductionPredictionEngine
from analytics_engine import AnalyticsEngine
from graph_data_engine import GraphDataEngine
from feature_infrastructure import FeatureImportanceMonitor, AutoFeatureEngineer, FeatureDriftDetector
from transaction_validator import TransactionValidator
from reward_agent import RewardAgent
from auditor_specialist import AuditorSpecialist
from hedera_connector import HederaConnector
from hedera_agent_toolkit import (
    HederaAgentToolkit,
    HCSTopicAgent,
    HTSTokenAgent,
    ContractMonitorAgent,
    NetworkHealthAgent,
)
from vnx_swarm_engine import VNXSwarmEngine
from hedera_vnx_specialists import SwarmOrchestrator
from hedera_vnx_specialists_extended import ExtendedSwarmOrchestrator
from hedera_vnx_specialists_advanced import AdvancedSwarmOrchestrator

# Prediction Market Infrastructure
from src.markets.market_core import MarketManager, MarketType
from src.markets.hbar_pools import HBARPoolManager
from src.markets.hts_outcome_tokens import OutcomeTokenManager
from src.markets.oracle_feed import SwarmOracleFeed
from src.markets.settlement import SettlementEngine
from src.markets.auto_market_factory import AutoMarketFactory
from src.markets.liquidity import LiquidityManager
from src.markets.portfolio import PortfolioTracker
from src.markets.market_maker import MarketMakerBot, MMConfig
from src.markets.market_api import create_market_router

# Specialized Workflow Agents
from src.agents.base_agent import WorkflowEngine, WorkflowAgent
from src.agents.defi_agents import create_defi_orchestrator
from src.agents.carbon_agents import create_carbon_orchestrator
from src.agents.risk_agents import create_risk_orchestrator
from src.agents.hedera_native_agents import create_hedera_orchestrator
from src.agents.intel_agents import create_intel_orchestrator
from src.agents.ops_agents import create_ops_orchestrator
from src.agents.advanced_workflows import EventBus, TriggerManager, AgentScheduler, ScheduleEntry, EventTrigger
from src.agents.agent_api import create_agent_router

# Marketplace Infrastructure
from src.marketplace.task_engine import TaskEngine
from src.marketplace.reputation import ReputationEngine
from src.marketplace.escrow import EscrowEngine
from src.marketplace.verifier import ResultVerifier
from src.marketplace.marketplace_api import create_marketplace_router

# Real-Time Streaming
from src.streaming.event_stream import EventStream
from src.streaming.ws_manager import ConnectionManager
from src.streaming.live_pipeline import LivePipeline, create_default_rules
from src.streaming.stream_api import create_stream_router

# AI Backbone
from src.ai_backbone.llm_router import LLMRouter
from src.ai_backbone.task_decomposer import TaskDecomposer
from src.ai_backbone.summarizer import ResultSummarizer
from src.ai_backbone.rag_context import RAGContext
from src.ai_backbone.ai_api import create_ai_router

# v2: Hedera Proof Infrastructure
from src.hedera_proof.hcs_emitter import HCSProofEmitter
from src.hedera_proof.mirror_verifier import MirrorVerifier
from src.hedera_proof.proof_api import create_proof_router

# v2: Verifiable AI (First-Party Agents)
from src.verifiable_ai.first_party_agents import FirstPartyAgentRegistry
from src.verifiable_ai.verifiable_ai_api import create_verifiable_ai_router

# v2: Learning Lane (Elliptical Proof Workflows)
from src.learning_lane.proof_loop_tracker import ProofLoopTracker, LoopStage
from src.learning_lane.lesson_engine import LessonEngine
from src.learning_lane.upgrade_packages import UpgradePackageBuilder
from src.learning_lane.learning_api import create_learning_router

# Unified Health
from src.health.unified_health import UnifiedHealthCheck
from src.health.monitoring_dashboard import router as monitoring_router

# Persistence
from src.persistence.vera_db import VeraDB

# Initialize all specialist engines
prediction_engine = ProductionPredictionEngine()
analytics_engine = AnalyticsEngine()
graph_engine = GraphDataEngine()
feature_importance = FeatureImportanceMonitor()
feature_engineer = AutoFeatureEngineer()
feature_drift = FeatureDriftDetector()
validator = TransactionValidator()
reward_agent = RewardAgent()
auditor = AuditorSpecialist()
hedera = HederaConnector()

# Hedera Agent Toolkit - Specialized Agents
hcs_agent = HCSTopicAgent()
hts_agent = HTSTokenAgent()
contract_agent = ContractMonitorAgent()
network_health_agent = NetworkHealthAgent()
hedera_toolkit = HederaAgentToolkit()

# VNX Model Swarm Engine
vnx_swarm = VNXSwarmEngine()

# Hedera VNX Micro-Specialists Swarm (27 specialists)
hedera_swarm = AdvancedSwarmOrchestrator()

# Prediction Market Infrastructure
market_manager = MarketManager()
pool_manager = HBARPoolManager()
token_manager = OutcomeTokenManager(hedera_toolkit=hedera_toolkit)
oracle_feed = SwarmOracleFeed(hedera_connector=hedera)
settlement_engine = SettlementEngine(market_manager, pool_manager, token_manager, oracle_feed, hedera)
auto_factory = AutoMarketFactory(market_manager, pool_manager, token_manager, oracle_feed)
auto_factory.register_defaults()
liquidity_manager = LiquidityManager()
portfolio_tracker = PortfolioTracker(market_manager, pool_manager, token_manager)
market_maker = MarketMakerBot(market_manager, pool_manager, token_manager, oracle_feed)

# Specialized Workflow Agents (30 agents across 6 domains)
workflow_engine = WorkflowEngine()
workflow_engine.register(create_defi_orchestrator())
workflow_engine.register(create_carbon_orchestrator())
workflow_engine.register(create_risk_orchestrator())
workflow_engine.register(create_hedera_orchestrator())
workflow_engine.register(create_intel_orchestrator())
workflow_engine.register(create_ops_orchestrator())

# Event bus + trigger manager + scheduler
event_bus = EventBus()
WorkflowAgent._event_bus = event_bus
trigger_manager = TriggerManager(event_bus, workflow_engine.run_pipeline)
agent_scheduler = AgentScheduler(workflow_engine.run_pipeline, workflow_engine.run_domain)

# Register default scheduled tasks
agent_scheduler.register(ScheduleEntry(
    name="risk_scan_4h", interval_seconds=14400,
    pipeline_steps=[
        {"domain": "risk", "agent": "risk_exposure_001"},
        {"domain": "risk", "agent": "risk_drawdown_001"},
        {"domain": "risk", "agent": "risk_stop_001"},
    ],
))
agent_scheduler.register(ScheduleEntry(
    name="system_health_1h", interval_seconds=3600, domain="ops",
))
agent_scheduler.register(ScheduleEntry(
    name="intel_scan_2h", interval_seconds=7200, domain="intel",
))

# Register validator and agent with auditor
auditor.register_entity(validator.validator_id, "validator", validator.get_secret_key())
auditor.register_entity(reward_agent.agent_id, "agent", reward_agent.get_secret_key())

# ── Marketplace Infrastructure ──────────────────────────────
task_engine = TaskEngine(event_bus=event_bus)
reputation_engine = ReputationEngine()
escrow_engine = EscrowEngine(event_bus=event_bus)
result_verifier = ResultVerifier()

# Register all 30 workflow agents in the reputation system
for _domain, _orch in workflow_engine._orchestrators.items():
    for _agent in _orch.agents:
        reputation_engine.register_agent(
            _agent.agent_id, _agent.name, _agent.domain.value
        )

# ── Real-Time Streaming ─────────────────────────────────────
event_stream = EventStream(max_history=1000)
ws_manager = ConnectionManager()
live_pipeline = LivePipeline(
    run_pipeline_fn=workflow_engine.run_pipeline,
    emit_fn=event_stream.emit,
)
for _rule in create_default_rules():
    live_pipeline.add_rule(_rule)

# Bridge: event_bus → event_stream so marketplace events flow to WS clients
def _bridge_to_stream(event_type: str, data):
    event_stream.emit(event_type, data if isinstance(data, dict) else {"value": data}, source="event_bus")
event_bus.subscribe("marketplace.*", _bridge_to_stream)
event_bus.subscribe("escrow.*", _bridge_to_stream)

# ── AI Backbone ─────────────────────────────────────────────
llm_router = LLMRouter()
task_decomposer = TaskDecomposer(llm_router)
result_summarizer = ResultSummarizer(llm_router)
rag_context = RAGContext(llm_router)

app = FastAPI(
    title="Hedera Prediction Market Engine v3",
    version="3.0.0",
    description="Predictions + Analytics + Graph Data for Hedera tokens",
)

# CORS for web frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Mount Prediction Market Router
market_router = create_market_router(
    market_manager=market_manager,
    pool_manager=pool_manager,
    token_manager=token_manager,
    oracle_feed=oracle_feed,
    settlement_engine=settlement_engine,
)
app.include_router(market_router, prefix="/markets")

# Mount Workflow Agent Router
agent_router = create_agent_router(workflow_engine, trigger_manager, agent_scheduler)
app.include_router(agent_router, prefix="/agents")

# Mount Marketplace Router
marketplace_router = create_marketplace_router(
    task_engine=task_engine,
    reputation_engine=reputation_engine,
    escrow_engine=escrow_engine,
    verifier=result_verifier,
)
app.include_router(marketplace_router)

# Mount Streaming Router (WebSocket + SSE)
stream_router = create_stream_router(
    event_stream=event_stream,
    ws_manager=ws_manager,
    live_pipeline=live_pipeline,
)
app.include_router(stream_router)

# Mount AI Backbone Router
ai_router = create_ai_router(
    llm_router=llm_router,
    decomposer=task_decomposer,
    summarizer=result_summarizer,
    rag=rag_context,
)
app.include_router(ai_router)

# ── v2: Hedera Proof Infrastructure ───────────────────────────
proof_emitter = HCSProofEmitter()
mirror_verifier = MirrorVerifier()

# Bridge marketplace events → HCS proof emission
def _proof_bridge(event_name: str, data):
    proof_emitter.emit_marketplace_event(event_name, data if isinstance(data, dict) else {"value": data})
event_bus.subscribe("marketplace.*", _proof_bridge)
event_bus.subscribe("escrow.*", _proof_bridge)

# Mount Proof API
proof_router = create_proof_router(emitter=proof_emitter, verifier=mirror_verifier)
app.include_router(proof_router)

# ── v2: Verifiable AI ─────────────────────────────────────────
first_party_registry = FirstPartyAgentRegistry()

# Register first-party agents in the reputation system
for _fp_agent in first_party_registry.list_agents():
    if not reputation_engine.get_agent(_fp_agent["agent_id"]):
        reputation_engine.register_agent(
            _fp_agent["agent_id"], _fp_agent["display_name"], _fp_agent["domain"]
        )

verifiable_ai_router = create_verifiable_ai_router(
    registry=first_party_registry,
    task_engine=task_engine,
    reputation_engine=reputation_engine,
    escrow_engine=escrow_engine,
    verifier=result_verifier,
    proof_emitter=proof_emitter,
)
app.include_router(verifiable_ai_router)

# ── v2: Learning Lane ─────────────────────────────────────────
proof_loop_tracker = ProofLoopTracker()
lesson_engine = LessonEngine(llm_router=llm_router)
package_builder = UpgradePackageBuilder(proof_emitter=proof_emitter)

# Bridge: marketplace events → proof loop tracker
def _loop_tracker_bridge(event_name: str, data):
    task_id = data.get("task_id", "") if isinstance(data, dict) else ""
    if not task_id:
        return
    stage_map = {
        "task.posted": LoopStage.TASK,
        "bid.submitted": LoopStage.BID,
        "task.awarded": LoopStage.AWARD,
        "task.executing": LoopStage.EXECUTION,
        "result.submitted": LoopStage.EXECUTION,
        "result.verified": LoopStage.VERIFICATION,
        "result.disputed": LoopStage.VERIFICATION,
        "task.settled": LoopStage.SETTLEMENT,
    }
    event_suffix = event_name.replace("marketplace.", "")
    stage = stage_map.get(event_suffix)
    if stage:
        proof_loop_tracker.record_stage(
            task_id=task_id,
            stage=stage,
            evidence_type="marketplace_event",
            data=data if isinstance(data, dict) else {},
            proof_hash=data.get("proof_hash", "") if isinstance(data, dict) else "",
        )
event_bus.subscribe("marketplace.*", _loop_tracker_bridge)

# Bridge: proof emission → loop tracker receipt stage
def _receipt_bridge(event_name: str, data):
    task_id = data.get("task_id", "") if isinstance(data, dict) else ""
    if task_id:
        proof_loop_tracker.record_stage(
            task_id=task_id,
            stage=LoopStage.RECEIPT,
            evidence_type="hcs_receipt",
            data=data if isinstance(data, dict) else {},
        )
event_bus.subscribe("proof.*", _receipt_bridge)

learning_router = create_learning_router(
    tracker=proof_loop_tracker,
    lesson_engine=lesson_engine,
    package_builder=package_builder,
)
app.include_router(learning_router)

# ── v2.1: Built-in Monitoring Dashboard ────────────────────────
app.include_router(monitoring_router)

# ── v2 Metrics Bridges ────────────────────────────────────────
def _metrics_bridge(event_name: str, data):
    if "proof" in event_name or event_name.startswith("marketplace."):
        mode = proof_emitter.mode.value if proof_emitter else "unknown"
        metrics.proofs_emitted.labels(mode=mode).inc()
    if "settled" in event_name:
        metrics.tasks_settled.inc()
event_bus.subscribe("marketplace.*", _metrics_bridge)
event_bus.subscribe("proof.*", _metrics_bridge)

# ── Persistence ───────────────────────────────────────────────
vera_db = VeraDB(os.environ.get("VERA_DB_PATH", "data/vera.db"))

# Bridge: proof emission → DB
def _persist_receipt(event_name: str, data):
    if isinstance(data, dict) and "receipt_id" in data:
        vera_db.save_receipt(data)
event_bus.subscribe("proof.*", _persist_receipt)

# Periodic flush of emitter receipts to DB (on health check)
_last_persisted_seq = [0]

def _flush_receipts_to_db():
    receipts = proof_emitter.get_receipts(limit=500)
    if receipts:
        batch = [r.to_dict() for r in receipts if r.sequence_number > _last_persisted_seq[0]]
        if batch:
            vera_db.save_receipts_batch(batch)
            _last_persisted_seq[0] = max(r.sequence_number for r in receipts)

# ── Unified Health ────────────────────────────────────────────
unified_health = UnifiedHealthCheck(
    prediction_engine=prediction_engine,
    hedera_swarm=hedera_swarm,
    workflow_engine=workflow_engine,
    task_engine=task_engine,
    proof_emitter=proof_emitter,
    mirror_verifier=mirror_verifier,
    first_party_registry=first_party_registry,
    proof_loop_tracker=proof_loop_tracker,
    lesson_engine=lesson_engine,
    package_builder=package_builder,
)

# ============================================================
# PREDICTION ENDPOINTS (from v2)
# ============================================================

@app.get("/")
async def root():
    return {
        "service": "Hedera Prediction Market Engine v3",
        "version": "3.0.0",
        "features": ["predictions", "analytics", "graphs"],
        "tokens": prediction_engine.get_available_tokens(),
    }

@app.get("/predict/{token}")
async def predict_token(token: str):
    token = token.lower()
    if token not in prediction_engine.token_models:
        raise HTTPException(status_code=404, detail=f"Token '{token}' not available")

    # ... (same as v2)
    from prediction_server_production import CG_IDS
    import requests

    cg_id = CG_IDS.get(token, token)
    try:
        response = requests.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": cg_id, "vs_currencies": "usd", "include_24hr_change": "true", "include_24hr_vol": "true"},
            timeout=10
        )
        data = response.json()
        token_data = data.get(cg_id, {})
        price_data = {
            "timestamp": __import__('time').time(),
            "price": token_data.get("usd", 0),
            "change_24h": token_data.get("usd_24h_change", 0),
            "volume_24h": token_data.get("usd_24h_vol", 0),
        }
    except Exception:
        raise HTTPException(status_code=503, detail="Failed to fetch price data")

    features = prediction_engine.compute_features(token, price_data)
    result = prediction_engine.predict(token, features)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    # Record for graph history
    try:
        graph_engine.record_prediction(
            token=token,
            price=price_data.get("price", 0),
            up_probability=result["up_probability"],
            confidence=result["confidence"],
            direction=result["direction"],
            features=features if features else {},
        )
    except Exception:
        pass  # Don't fail if recording fails

    return result

@app.get("/predict")
async def predict_all():
    return {"message": "Use /predict/{token} for individual predictions or /analytics/market for overview"}

@app.get("/tokens")
async def list_tokens():
    return {
        token: {
            "accuracy": info["accuracy"],
            "status": "active",
        }
        for token, info in prediction_engine.token_models.items()
    }

@app.get("/health")
async def health():
    _flush_receipts_to_db()
    result = unified_health.check()
    result["persistence"] = vera_db.stats()
    return result

@app.get("/health/db")
async def health_db():
    return vera_db.stats()

@app.on_event("shutdown")
async def shutdown_event():
    _flush_receipts_to_db()
    vera_db.close()

@app.get("/metrics")
async def prometheus_metrics():
    """Prometheus metrics endpoint."""
    return PlainTextResponse(content=metrics.export(), media_type="text/plain")


# Request metrics middleware
@app.middleware("http")
async def metrics_middleware(request, call_next):
    from time import time
    start = time()
    method = request.method
    path = request.url.path
    metrics.request_count.labels(endpoint=path, method=method).inc()

    try:
        response = await call_next(request)
        metrics.response_status.labels(endpoint=path, status=str(response.status_code)).inc()
        return response
    except Exception:
        metrics.response_status.labels(endpoint=path, status="500").inc()
        raise
    finally:
        metrics.request_duration.labels(endpoint=path).observe(time() - start)

# ============================================================
# ANALYTICS ENDPOINTS (NEW)
# ============================================================

@app.get("/analytics/market")
async def market_analytics():
    """Market-wide analytics: correlations, volatility, sentiment."""
    return {
        "timestamp": __import__('datetime').datetime.now().isoformat(),
        "correlation_matrix": analytics_engine.get_correlation_matrix(),
        "volatility": analytics_engine.get_market_volatility(),
        "sentiment": analytics_engine.get_market_sentiment(),
        "ranking": analytics_engine.get_hot_cold_ranking(),
    }

@app.get("/analytics/{token}")
async def token_analytics(token: str):
    """Deep per-token analytics: trend, divergence, volume, momentum."""
    result = analytics_engine.get_token_analytics(token)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

# ============================================================
# GRAPH DATA ENDPOINTS (NEW)
# ============================================================

@app.get("/graph/{token}")
async def graph_probability(token: str):
    """Time-series prediction probability for charting."""
    result = graph_engine.get_probability_time_series(token.lower())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.get("/graph/{token}/accuracy")
async def graph_accuracy(token: str):
    """Rolling accuracy over time for charting."""
    result = graph_engine.get_accuracy_over_time(token.lower())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.get("/graph/{token}/features")
async def graph_features(token: str):
    """Feature importance for charting."""
    result = graph_engine.get_feature_importance(token.lower())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.get("/graph/{token}/dashboard")
async def graph_dashboard(token: str):
    """All graph data for a token dashboard."""
    return graph_engine.get_dashboard_data(token.lower())

# ============================================================
# FEATURE INFRASTRUCTURE ENDPOINTS (NEW v3.1)
# ============================================================

@app.get("/features/importance/{token}")
async def features_importance(token: str):
    """Feature importance ranking with stale detection."""
    result = feature_importance.get_feature_importance(token.lower())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.get("/features/importance/{token}/trend")
async def features_importance_trend(token: str, feature: str):
    """Track how a specific feature's importance changes over time."""
    result = feature_importance.get_importance_trend(token.lower(), feature)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.get("/features/engineer/{token}")
async def features_engineer(token: str):
    """Auto-generate and evaluate new feature candidates."""
    return feature_engineer.discover_features(token.lower())

@app.get("/features/evaluate/{token}")
async def features_evaluate(token: str, feature: str):
    """Evaluate predictive power of a specific feature."""
    result = feature_engineer.evaluate_feature(token.lower(), feature)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.get("/features/drift/{token}")
async def features_drift(token: str):
    """Detect drift in all features."""
    result = feature_drift.detect_all_drift(token.lower())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.get("/features/drift/{token}/{feature}")
async def features_drift_feature(token: str, feature: str):
    """Detect drift in a specific feature."""
    result = feature_drift.detect_drift(token.lower(), feature)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.get("/features/regime/{token}")
async def features_regime(token: str):
    """Detect market regime shifts."""
    result = feature_drift.get_regime_shift(token.lower())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.get("/features/report/{token}")
async def features_report(token: str):
    """Combined feature health dashboard."""
    token = token.lower()
    return {
        "token": token.upper(),
        "timestamp": __import__('datetime').datetime.now().isoformat(),
        "importance": feature_importance.get_feature_importance(token),
        "drift": feature_drift.detect_all_drift(token),
        "regime": feature_drift.get_regime_shift(token),
        "new_candidates": feature_engineer.discover_features(token),
    }

# ============================================================
# GOVERNANCE ENDPOINTS (NEW v3.2)
# ============================================================

@app.post("/governance/validate")
async def validate_bid(market_id: int, bidder: str, direction: str, amount: int):
    """Validate a bid and produce attestation."""
    result = validator.validate_bid(market_id, bidder, direction, amount)
    if result.valid:
        auditor.record_bid(market_id, bidder, direction, amount,
                          result.attestation or "", validator.validator_id)
    return validator.to_dict(result)

@app.post("/governance/reward")
async def calculate_reward(market_id: int, outcome: str, bids: List[Dict[str, Any]]):
    """Calculate rewards and produce payout attestation."""
    result = reward_agent.calculate_rewards(market_id, outcome, bids)
    if result.valid:
        for payout in result.payouts:
            auditor.record_payout(market_id, payout.address, payout.bet_amount,
                                 payout.payout_amount, result.attestation or "",
                                 reward_agent.agent_id)
    return reward_agent.to_dict(result)

@app.get("/governance/audit/{market_id}")
async def audit_market(market_id: int):
    """Reconstruct market lifecycle from audit trail."""
    return auditor.get_market_lifecycle(market_id)

@app.get("/governance/audit")
async def audit_summary():
    """Get audit summary."""
    return auditor.get_audit_summary()

@app.get("/governance/integrity")
async def audit_integrity():
    """Verify chain integrity."""
    return auditor.verify_chain_integrity()

# ============================================================
# HEDERA NATIVE ENDPOINTS (NEW v3.3)
# ============================================================

@app.get("/hedera/stats")
async def hedera_stats():
    """Hedera network statistics from Mirror Node."""
    stats = hedera.get_network_stats()
    if "error" in stats:
        raise HTTPException(status_code=503, detail=stats["error"])
    return {
        "source": "Hedera Mirror Node",
        "hbar_usd_price": stats["hbar_usd_price"],
        "network_nodes": hedera._get(f"{hedera.MIRROR_NODE}/network/nodes", {}).get("nodes", []).__len__(),
        "timestamp": stats["timestamp"],
    }

@app.get("/hedera/features")
async def hedera_features():
    """Hedera-native features for ML prediction model (14+ features)."""
    features = hedera.get_hedera_features()
    return {
        "source": "Hedera Mirror Node",
        "features": features,
        "feature_count": len(features),
        "integrated_into_model": True,
    }

@app.get("/hedera/supply")
async def hedera_supply():
    """HBAR supply info."""
    supply = hedera.get_network_supply()
    if "error" in supply:
        raise HTTPException(status_code=503, detail=supply["error"])
    return supply

@app.get("/hedera/staking/{account}")
async def hedera_staking(account: str):
    """Staking info for an account."""
    staking = hedera.get_staking_info(account)
    if "error" in staking:
        raise HTTPException(status_code=404, detail=staking["error"])
    return staking

@app.get("/hedera/blocks")
async def hedera_blocks(limit: int = 5):
    """Recent consensus blocks."""
    blocks = hedera.get_blocks(limit=limit)
    if not blocks:
        raise HTTPException(status_code=503, detail="Failed to fetch blocks")
    return blocks

@app.get("/hedera/token/{token_id}")
async def hedera_token(token_id: str):
    """HTS token metadata."""
    token = hedera.get_token_info(token_id)
    if "error" in token:
        raise HTTPException(status_code=404, detail=token["error"])
    return token

@app.get("/hedera/topic/{topic_id}")
async def hedera_topic(topic_id: str, limit: int = 10):
    """HCS topic messages."""
    messages = hedera.get_topic_messages(topic_id, limit=limit)
    if not messages:
        raise HTTPException(status_code=404, detail="Topic not found or empty")
    return messages

# ============================================================
# HEDERA AGENT TOOLKIT - SPECIALIZED AGENTS (NEW v3.4)
# ============================================================

@app.get("/agents/network/health")
async def agent_network_health():
    """Network Health Agent - Full network status."""
    return network_health_agent.full_health_check()

@app.get("/agents/hcs/topic/{topic_id}")
async def agent_hcs_topic(topic_id: str):
    """HCS Topic Agent - Monitor consensus messages."""
    return hcs_agent.monitor_topic(topic_id)

@app.get("/agents/hcs/topic/{topic_id}/analysis")
async def agent_hcs_analysis(topic_id: str):
    """HCS Topic Agent - Message flow analysis."""
    return hcs_agent.analyze_message_flow(topic_id)

@app.get("/agents/hts/token/{token_id}")
async def agent_hts_token(token_id: str):
    """HTS Token Agent - Token analysis."""
    return hts_agent.analyze_token(token_id)

@app.get("/agents/hts/token/{token_id}/whales")
async def agent_hts_whales(token_id: str):
    """HTS Token Agent - Whale detection."""
    return hts_agent.detect_whale_activity(token_id)

@app.get("/agents/contract/{contract_id}")
async def agent_contract_monitor(contract_id: str):
    """Contract Monitor Agent - Smart contract activity."""
    return contract_agent.monitor_contract(contract_id)

@app.get("/agents/toolkit/{tool}/{resource_id}")
async def agent_toolkit_direct(tool: str, resource_id: str):
    """
    Direct toolkit access for any Hedera resource.

    Tools: topic, token, account, contract, file, block
    """
    toolkit = HederaAgentToolkit()

    if tool == "topic":
        return toolkit.hcs_query_topic(resource_id)
    elif tool == "token":
        return toolkit.hts_query_token(resource_id)
    elif tool == "account":
        return toolkit.account_query(resource_id)
    elif tool == "contract":
        return toolkit.contract_query(resource_id)
    elif tool == "file":
        return toolkit.file_query(resource_id)
    elif tool == "block":
        return toolkit.get_blocks(limit=int(resource_id))
    else:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {tool}")

# ============================================================
# VNX SWARM ENGINE ENDPOINTS (NEW v3.5)
# ============================================================

@app.get("/swarm/health")
async def swarm_health():
    """VNX Swarm Engine health status."""
    return vnx_swarm.get_swarm_health()

@app.get("/swarm/predict/{token}")
async def swarm_predict(token: str):
    """
    Predict using VNX BitLattice swarm (domain → concept → pattern).

    Uses confidence-weighted voting across 20+ micro-specialists.
    """
    # Get features from prediction engine
    token_lower = token.lower()
    prediction = prediction_engine.predict(token_lower)

    if "error" in prediction:
        raise HTTPException(status_code=404, detail=prediction["error"])

    # Run swarm inference
    swarm_result = vnx_swarm.swarm_predict(prediction.get("features", {}))

    return {
        "token": token.upper(),
        "swarm_prediction": swarm_result,
        "single_model_prediction": {
            "direction": prediction.get("direction", "UNKNOWN"),
            "probability": prediction.get("probability", 0),
        },
        "comparison": {
            "agreement": swarm_result["direction"] == prediction.get("direction", ""),
            "swarm_confidence": swarm_result["confidence"],
            "model_confidence": prediction.get("confidence", 0),
        }
    }

@app.get("/swarm/compare/{token}")
async def swarm_compare(token: str):
    """Compare swarm vs single-model prediction side-by-side."""
    token_lower = token.lower()

    # Single model
    single = prediction_engine.predict(token_lower)

    # Swarm
    swarm = vnx_swarm.swarm_predict(single.get("features", {}))

    return {
        "token": token.upper(),
        "single_model": {
            "direction": single.get("direction", "UNKNOWN"),
            "probability": single.get("probability", 0),
            "latency_ms": single.get("latency_ms", 0),
        },
        "swarm": {
            "direction": swarm["direction"],
            "probability": swarm["up_probability"],
            "confidence": swarm["confidence"],
            "latency_ms": swarm["latency_ms"],
            "swarm_size": swarm["swarm_size"],
        },
        "winner": "AGREE" if single.get("direction") == swarm["direction"] else "DISAGREE",
    }

# ============================================================
# HEDERA VNX MICRO-SPECIALISTS SWARM (NEW v3.6)
# ============================================================

@app.get("/hedera-swarm/status")
async def hedera_swarm_status():
    """Hedera VNX micro-specialists swarm status and types."""
    return {
        "specialist_types": hedera_swarm.get_specialist_types(),
        "total_specialists": len(hedera_swarm.specialists),
        "swarm_runs": hedera_swarm.swarm_runs,
        "status": "READY",
    }

@app.get("/hedera-swarm/run")
async def hedera_swarm_run():
    """
    Execute all Hedera VNX micro-specialists in parallel.

    Monitors: HCS, HTS, Network, Staking, Contracts, TX Volume
    """
    result = hedera_swarm.run_all()
    return result

@app.get("/hedera-swarm/alerts")
async def hedera_swarm_alerts():
    """Get current alerts from all Hedera specialists."""
    result = hedera_swarm.run_all()
    return {
        "status": result["status"],
        "total_alerts": result["total_alerts"],
        "critical": result["critical_alerts"],
        "warning": result["warning_alerts"],
        "alerts": result["alerts"],
        "specialists_active": result["specialists_active"],
        "avg_confidence": result["avg_confidence"],
    }

@app.get("/hedera-swarm/network")
async def hedera_swarm_network():
    """Network health from Hedera swarm perspective."""
    result = hedera_swarm.run_all()
    # Extract network-related results
    network_results = [
        r for r in result["specialist_results"]
        if "network" in r.get("specialization", "").lower()
        or "volume" in r.get("specialization", "").lower()
    ]
    return {
        "network_status": result["status"],
        "specialists": network_results,
        "hbar_price": next((r.get("hbar_price") for r in network_results if "hbar_price" in r), None),
        "nodes_online": next((r.get("nodes_online") for r in network_results if "nodes_online" in r), None),
    }

# ============================================================
# PREDICTION MARKET ADVANCED ENDPOINTS (v3.5)
# ============================================================

@app.get("/factory/templates")
async def factory_templates():
    """List auto-market factory templates."""
    return {
        "templates": [t.to_dict() for t in auto_factory.list_templates()],
        "stats": auto_factory.stats(),
    }

@app.post("/factory/check")
async def factory_check():
    """Check signals and auto-create markets if thresholds met."""
    created = auto_factory.check_and_create()
    return {
        "created_count": len(created),
        "markets": [m.to_dict() for m in created],
    }

@app.get("/factory/events")
async def factory_events():
    """Get auto-creation event history."""
    return {"events": [e.to_dict() for e in auto_factory.get_events()]}

@app.post("/liquidity/{market_id}/add")
async def add_liquidity(market_id: str, user: str, amount: int):
    """Add HBAR liquidity to earn LP rewards."""
    try:
        pos = liquidity_manager.add_liquidity(market_id, user, amount)
        return pos.to_dict()
    except (ValueError, KeyError) as e:
        raise HTTPException(400, str(e))

@app.post("/liquidity/{market_id}/remove/{position_id}")
async def remove_liquidity(market_id: str, position_id: str):
    """Remove liquidity and claim rewards."""
    try:
        return liquidity_manager.remove_liquidity(market_id, position_id)
    except (ValueError, KeyError) as e:
        raise HTTPException(400, str(e))

@app.get("/liquidity/{market_id}/rewards/{user}")
async def lp_rewards(market_id: str, user: str):
    """Get pending LP rewards for a user."""
    return {
        "market_id": market_id,
        "user": user,
        "pending_rewards": liquidity_manager.get_pending_rewards(market_id, user),
    }

@app.get("/liquidity/{market_id}/tvl")
async def lp_tvl(market_id: str):
    """Get total value locked in market LP pool."""
    return {
        "market_id": market_id,
        "tvl": liquidity_manager.get_tvl(market_id),
        "pool": (liquidity_manager.get_pool(market_id) or {}).to_dict() if liquidity_manager.get_pool(market_id) else None,
    }

@app.get("/liquidity/stats")
async def lp_stats():
    """Global LP statistics."""
    return liquidity_manager.stats()

@app.get("/portfolio/{user}")
async def user_portfolio(user: str):
    """Get a user's full portfolio across all markets."""
    return portfolio_tracker.get_portfolio(user)

@app.get("/portfolio/{user}/stats")
async def user_stats(user: str):
    """Get aggregated stats for a user."""
    return portfolio_tracker.get_user_stats(user).to_dict()

@app.get("/leaderboard")
async def leaderboard(sort_by: str = "profit", limit: int = 50):
    """Global trader leaderboard."""
    return {
        "leaderboard": portfolio_tracker.leaderboard(sort_by=sort_by, limit=limit),
        "sort_by": sort_by,
    }

@app.post("/mm/configure/{market_id}")
async def mm_configure(market_id: str, spread_bps: int = 200, order_size: int = 1_000_000):
    """Configure automated market maker for a market."""
    config = market_maker.auto_configure(market_id, spread_bps, order_size)
    return config.to_dict()

@app.post("/mm/refresh")
async def mm_refresh(market_id: str = None):
    """Refresh market maker quotes."""
    return market_maker.refresh_quotes(market_id)

@app.get("/mm/stats")
async def mm_stats():
    """Market maker bot statistics."""
    return market_maker.stats()

@app.get("/mm/state/{market_id}")
async def mm_state(market_id: str):
    """Market maker state for a specific market."""
    state = market_maker.get_state(market_id)
    if not state:
        raise HTTPException(404, "No MM state for this market")
    return state.to_dict()

# ── Dashboard static files (production build) ────────────────
_dashboard_dist = os.path.join(os.path.dirname(__file__), "dashboard", "dist")
if os.path.isdir(_dashboard_dist):
    from fastapi.staticfiles import StaticFiles
    from starlette.responses import FileResponse

    @app.get("/dashboard/{full_path:path}")
    async def serve_dashboard(full_path: str):
        file = os.path.join(_dashboard_dist, full_path)
        if os.path.isfile(file):
            return FileResponse(file)
        return FileResponse(os.path.join(_dashboard_dist, "index.html"))

    app.mount("/dashboard-assets", StaticFiles(directory=os.path.join(_dashboard_dist, "assets")), name="dashboard-assets")

if __name__ == "__main__":
    import uvicorn
    from src.hedera_proof.testnet_config import TestnetConfig as _TC
    _cfg = _TC.from_env()
    print("=" * 70)
    print("  VERA OS v2.1 — Verifiable AI on Hedera")
    print("  Hedera Prediction Market Engine + Proof Infrastructure")
    print("=" * 70)
    print()
    print("  Layer 1  Hedera Core         27 micro-specialists (5 domains)")
    print(f"  Layer 2  Predictions          {len(prediction_engine.token_models)} tokens (HBAR, SAUCE, DOVU)")
    print("  Layer 3  Workflow Agents      4 domain orchestrators")
    print(f"  Layer 4  Marketplace          Task engine + escrow + reputation")
    print(f"  Layer 5  Proof Loop           mode={proof_emitter.mode.value}, testnet_ready={_cfg.is_testnet_ready}")
    print(f"  Layer 6  Verifiable AI        {len(first_party_registry.list_agents())} first-party agents")
    print(f"  Layer 7  Learning Lane        Loops → Lessons → Upgrade packages")
    print()
    print(f"  Persistence:  {vera_db}")
    print(f"  Metrics:      /metrics (Prometheus)")
    print(f"  Health:       /health (7-layer unified)")
    print(f"  Dashboard:    /dashboard/ (static build)")
    print()
    print("  Key API Endpoints:")
    print("    GET  /health                           7-layer health check")
    print("    GET  /metrics                          Prometheus counters")
    print("    GET  /proof/stats                      Proof emitter + verifier")
    print("    GET  /proof/testnet-status             Testnet readiness")
    print("    POST /api/vera/verifiable-ai/run-now   Run full proof loop")
    print("    GET  /api/vera/learning/stats          Learning lane stats")
    print("    POST /markets                          Create market")
    print("    GET  /markets                          List markets")
    print()
    print(f"  Swagger UI: http://localhost:8080/docs")
    print("=" * 70)
    uvicorn.run(app, host="0.0.0.0", port=8080)
