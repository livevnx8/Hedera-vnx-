#!/usr/bin/env python3
"""
Vera OS Super Server — Full Optimization Stack.

Features:
  - ONNX Runtime inference (6x faster)
  - Redis L2 cache (shared across workers)
  - In-process L1 cache (fastest)
  - ThreadPoolExecutor (non-blocking async)
  - Batch prediction endpoint
  - Cache stats and management endpoints
  - All v3 endpoints preserved

Run single worker:
    python3 super_server.py

Run with uvicorn (multi-process):
    uvicorn super_server:app --host 0.0.0.0 --port 8000 --workers 4 --loop uvloop

Run with gunicorn (multi-process + multi-thread):
    gunicorn super_server:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
"""

import sys
from typing import Dict, Any, List

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from metrics.prometheus_metrics import metrics
from prediction_server_production import ProductionPredictionEngine

# Import Super Engine
from prediction.super_engine import SuperPredictionEngine

# Import other engines
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
from hedera_vnx_specialists_advanced import AdvancedSwarmOrchestrator

# Semantic Memory
try:
    from semantic_memory import get_semantic_memory
    SEMANTIC_MEMORY_AVAILABLE = True
except ImportError:
    SEMANTIC_MEMORY_AVAILABLE = False

# Market Infrastructure
try:
    from market_infrastructure import get_market_engine
    MARKET_AVAILABLE = True
except ImportError:
    MARKET_AVAILABLE = False

# ============================================================
# SUPER ENGINE (ONNX + Redis + ThreadPool)
# ============================================================
prediction_engine = SuperPredictionEngine(
    max_workers=8,
    l1_ttl=30,
    use_onnx=True,
    redis_host="localhost",
    redis_port=6379,
)

analytics_engine = AnalyticsEngine()
graph_engine = GraphDataEngine()
feature_importance = FeatureImportanceMonitor()
feature_engineer = AutoFeatureEngineer()
feature_drift = FeatureDriftDetector()
validator = TransactionValidator()
reward_agent = RewardAgent()
auditor = AuditorSpecialist()
hedera = HederaConnector()

hcs_agent = HCSTopicAgent()
hts_agent = HTSTokenAgent()
contract_agent = ContractMonitorAgent()
network_health_agent = NetworkHealthAgent()
hedera_toolkit = HederaAgentToolkit()

vnx_swarm = VNXSwarmEngine()
hedera_swarm = AdvancedSwarmOrchestrator()

semantic_memory = get_semantic_memory() if SEMANTIC_MEMORY_AVAILABLE else None
market_engine = get_market_engine() if MARKET_AVAILABLE else None

auditor.register_entity(validator.validator_id, "validator", validator.get_secret_key())
auditor.register_entity(reward_agent.agent_id, "agent", reward_agent.get_secret_key())

app = FastAPI(
    title="Vera OS Super Server",
    version="3.2.3-super",
    description="ONNX + Redis + ThreadPool + MicroBatching + ZeroCopy + CircuitBreaker optimized inference",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ============================================================
# CORE PREDICTION ENDPOINTS
# ============================================================

@app.get("/predict/{token}")
async def predict_token(token: str):
    token = token.lower()
    if token not in prediction_engine.token_models:
        raise HTTPException(status_code=404, detail=f"Token '{token}' not available")

    price_data = prediction_engine.fetch_token_price(token)
    if not price_data:
        raise HTTPException(status_code=503, detail="Price data unavailable")

    features = prediction_engine.compute_features(token, price_data)
    if features is None:
        raise HTTPException(status_code=503, detail="Insufficient price history")

    result = await prediction_engine.predict_async(token, features)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    graph_engine.record_prediction(token, result)
    return result


@app.post("/predict/batch")
async def predict_batch(tokens: List[str]):
    tokens = [t.lower() for t in tokens]
    invalid = [t for t in tokens if t not in prediction_engine.token_models]
    if invalid:
        raise HTTPException(status_code=404, detail=f"Tokens not available: {invalid}")

    features_list = []
    valid_tokens = []
    for token in tokens:
        price_data = prediction_engine.fetch_token_price(token)
        if not price_data:
            continue
        features = prediction_engine.compute_features(token, price_data)
        if features is not None:
            features_list.append(features)
            valid_tokens.append(token)

    if not valid_tokens:
        raise HTTPException(status_code=503, detail="No valid price data")

    results = await prediction_engine.predict_batch_async(valid_tokens, features_list)
    return {"predictions": results, "count": len(results)}


@app.post("/predict/batch/fast")
async def predict_batch_fast(tokens: List[str]):
    """Fast batch predict with async concurrent price fetching + coalescing."""
    tokens = [t.lower() for t in tokens]
    invalid = [t for t in tokens if t not in prediction_engine.token_models]
    if invalid:
        raise HTTPException(status_code=404, detail=f"Tokens not available: {invalid}")

    # Fetch all prices concurrently
    prices = await prediction_engine.fetch_prices_async(tokens)

    features_list = []
    valid_tokens = []
    for token in tokens:
        price_data = prices.get(token)
        if not price_data or price_data.get("price", 0) == 0:
            continue
        features = prediction_engine.compute_features(token, price_data)
        if features is not None:
            features_list.append(features)
            valid_tokens.append(token)

    if not valid_tokens:
        raise HTTPException(status_code=503, detail="No valid price data")

    results = await prediction_engine.predict_batch_async(valid_tokens, features_list)
    # Convert numpy types to native Python for JSON serialization
    clean_results = []
    for r in results:
        clean = {}
        for k, v in r.items():
            if hasattr(v, 'item'):
                clean[k] = float(v)
            else:
                clean[k] = v
        clean_results.append(clean)

    return {
        "predictions": clean_results,
        "count": len(clean_results),
        "prices_fetched": len(prices),
    }


@app.get("/swarm/predict/{token}")
async def predict_swarm(token: str):
    price_data = prediction_engine.fetch_token_price(token)
    if not price_data or not price_data.get("price"):
        raise HTTPException(status_code=503, detail="Price data unavailable")

    features = prediction_engine.compute_features(token, price_data)
    if features is None:
        raise HTTPException(status_code=503, detail="Insufficient price history")

    result = await prediction_engine.predict_async(token, features)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "single_model": result,
        "swarm": vnx_swarm.predict(token) if hasattr(vnx_swarm, 'predict') else {"note": "Swarm not loaded"},
        "token": token.upper(),
    }


# ============================================================
# SWARM CONSENSUS & DISCOVERY
# ============================================================

@app.get("/swarm/discovery")
async def swarm_discovery():
    """List all available specialists in the swarm."""
    specialists = []
    if hasattr(hedera_swarm, 'specialists'):
        specs = hedera_swarm.specialists
        if isinstance(specs, dict):
            for name, spec in specs.items():
                specialists.append({
                    "name": name,
                    "type": getattr(spec, 'specialist_type', 'unknown'),
                    "active": getattr(spec, 'active', True),
                })
        elif isinstance(specs, list):
            for i, spec in enumerate(specs):
                specialists.append({
                    "name": getattr(spec, 'name', f"specialist_{i}"),
                    "type": getattr(spec, 'specialist_type', 'unknown'),
                    "active": getattr(spec, 'active', True),
                })
    return {
        "swarm_id": getattr(hedera_swarm, 'swarm_id', 'unknown'),
        "specialist_count": len(specialists),
        "specialists": specialists,
    }


@app.post("/swarm/consensus")
async def swarm_consensus(token: str):
    """Run swarm specialists and compute consensus vote."""
    if not hasattr(hedera_swarm, 'specialists') or not hedera_swarm.specialists:
        raise HTTPException(status_code=503, detail="Swarm not initialized")

    votes = []
    specs = hedera_swarm.specialists
    items = specs.items() if isinstance(specs, dict) else enumerate(specs)
    for key, spec in items:
        try:
            name = key if isinstance(specs, dict) else getattr(spec, 'name', f"spec_{key}")
            if hasattr(spec, 'analyze_token'):
                result = spec.analyze_token(token)
                votes.append({
                    "specialist": name,
                    "recommendation": result.get("recommendation", "NEUTRAL"),
                    "confidence": result.get("confidence", 0.0),
                })
        except Exception:
            pass

    # Simple majority consensus
    up_votes = sum(1 for v in votes if v["recommendation"] == "BUY")
    down_votes = sum(1 for v in votes if v["recommendation"] == "SELL")
    total = len(votes)

    consensus = "NEUTRAL"
    if up_votes > down_votes and up_votes > total / 3:
        consensus = "UP"
    elif down_votes > up_votes and down_votes > total / 3:
        consensus = "DOWN"

    return {
        "token": token.upper(),
        "total_specialists": total,
        "votes": votes,
        "consensus": consensus,
        "up_votes": up_votes,
        "down_votes": down_votes,
        "agreement": max(up_votes, down_votes) / total if total else 0,
    }


@app.get("/swarm/audit")
async def swarm_audit():
    """Get audit trail of validator and reward agent."""
    return {
        "validator_id": getattr(validator, 'validator_id', 'unknown'),
        "reward_agent_id": getattr(reward_agent, 'agent_id', 'unknown'),
        "auditor_entities": list(getattr(auditor, 'entity_registry', {}).keys()) if hasattr(auditor, 'entity_registry') else [],
        "note": "Lattice audit trail active",
    }


# ============================================================
# HEDERA INTEGRATION
# ============================================================

@app.get("/hedera/account/{account_id}/balance")
async def hedera_account_balance(account_id: str):
    try:
        info = hedera_toolkit.get_account_info(account_id)
        return {
            "account_id": account_id,
            "balance_hbar": info.get("balance_hbars"),
            "tokens": info.get("tokens", []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/hedera/hcs/{topic_id}/messages")
async def hedera_hcs_messages(topic_id: str, limit: int = 10):
    try:
        msgs = hedera_toolkit.get_topic_messages(topic_id, limit=limit)
        return {"topic_id": topic_id, "messages": msgs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/hedera/hcs/{topic_id}/message")
async def hedera_hcs_submit(topic_id: str, message: str):
    try:
        result = hedera_toolkit.submit_hcs_message(topic_id, message)
        return {"success": True, "topic_id": topic_id, "sequence_number": result.get("sequence_number")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/hedera/topic/create")
async def hedera_topic_create(topic_name: str = "VeraTopic"):
    try:
        result = hedera_toolkit.create_topic(topic_name)
        return {"success": True, "topic_id": result.get("topic_id"), "memo": topic_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/hedera/transfer")
async def hedera_transfer(recipient: str, amount: float, token_id: str = ""):
    try:
        if token_id:
            result = hedera_toolkit.transfer_hts_token(token_id, recipient, int(amount * 100))
        else:
            result = hedera_toolkit.transfer_hbar(recipient, amount)
        return {"success": True, "transaction_id": result.get("transaction_id")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# SEMANTIC MEMORY
# ============================================================

@app.post("/memory/record")
async def memory_record(token: str, prediction: str, confidence: float, features_json: str = "{}", context: str = ""):
    if not semantic_memory:
        raise HTTPException(status_code=503, detail="Semantic memory not available")
    try:
        import json
        features = json.loads(features_json)
        decision_id = semantic_memory.record(token, prediction, features, confidence, context)
        return {"decision_id": decision_id, "token": token, "status": "recorded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/memory/search")
async def memory_search(token: str, features_json: str = "{}", top_k: int = 5):
    if not semantic_memory:
        raise HTTPException(status_code=503, detail="Semantic memory not available")
    try:
        import json
        features = json.loads(features_json)
        results = semantic_memory.search_similar(token, features, top_k=top_k)
        return {"token": token, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memory/stats/{token}")
async def memory_stats(token: str):
    if not semantic_memory:
        raise HTTPException(status_code=503, detail="Semantic memory not available")
    return semantic_memory.get_stats(token)


@app.get("/memory/recent/{token}")
async def memory_recent(token: str, n: int = 10):
    if not semantic_memory:
        raise HTTPException(status_code=503, detail="Semantic memory not available")
    return {"token": token, "decisions": semantic_memory.get_recent(token, n)}


# ============================================================
# POLYMARKET-STYLE MARKETS
# ============================================================

@app.post("/markets/create")
async def market_create(market_id: str, question: str, creator: str = "", liquidity: float = 100.0, fee_pct: float = 2.0):
    if not market_engine:
        raise HTTPException(status_code=503, detail="Market infrastructure not available")
    try:
        m = market_engine.create_market(market_id, question, creator, liquidity, fee_pct)
        return {"market_id": market_id, "status": "created", "prices": m.prices()}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/markets/list")
async def market_list():
    if not market_engine:
        raise HTTPException(status_code=503, detail="Market infrastructure not available")
    return {"markets": market_engine.list_markets()}


@app.get("/markets/{market_id}")
async def market_info(market_id: str):
    if not market_engine:
        raise HTTPException(status_code=503, detail="Market infrastructure not available")
    info = market_engine.get_market(market_id)
    if "error" in info:
        raise HTTPException(status_code=404, detail=info["error"])
    return info


@app.post("/markets/{market_id}/buy")
async def market_buy(market_id: str, account: str, outcome: str, amount: float):
    if not market_engine:
        raise HTTPException(status_code=503, detail="Market infrastructure not available")
    result = market_engine.buy_shares(market_id, account, outcome, amount)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/markets/{market_id}/sell")
async def market_sell(market_id: str, account: str, outcome: str, shares: float):
    if not market_engine:
        raise HTTPException(status_code=503, detail="Market infrastructure not available")
    result = market_engine.sell_shares(market_id, account, outcome, shares)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/markets/{market_id}/resolve")
async def market_resolve(market_id: str, outcome: str):
    if not market_engine:
        raise HTTPException(status_code=503, detail="Market infrastructure not available")
    result = market_engine.resolve_market(market_id, outcome)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/markets/{market_id}/positions/{account}")
async def market_positions(market_id: str, account: str):
    if not market_engine:
        raise HTTPException(status_code=503, detail="Market infrastructure not available")
    return {"market_id": market_id, "account": account, "positions": market_engine.get_positions(market_id, account)}


@app.get("/markets/{market_id}/trades")
async def market_trades(market_id: str, limit: int = 50):
    if not market_engine:
        raise HTTPException(status_code=503, detail="Market infrastructure not available")
    return {"market_id": market_id, "trades": market_engine.get_trades(market_id, limit)}


# ============================================================
# MCP TOOLS (for external LLM/agent integration)
# ============================================================

@app.get("/mcp/tools")
async def mcp_tools():
    """List available MCP tools."""
    try:
        from mcp_server import TOOLS
        return {"tools": TOOLS}
    except ImportError:
        raise HTTPException(status_code=503, detail="MCP server not available")


@app.post("/mcp/tools/{tool_name}")
async def mcp_tool_call(tool_name: str, arguments: Dict[str, Any]):
    """Call an MCP tool by name."""
    try:
        from mcp_server import _handlers
        if tool_name not in _handlers:
            raise HTTPException(status_code=404, detail=f"Tool {tool_name} not found")
        result = _handlers[tool_name](arguments)
        return {"tool": tool_name, "result": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# OPTIMIZATION METRICS
# ============================================================

@app.get("/optimization/stats")
async def optimization_stats():
    return {
        "engine": "SuperPredictionEngine",
        "version": "3.2.3-super",
        "cache": prediction_engine.get_cache_stats(),
        "health": prediction_engine.get_health(),
        "requests": prediction_engine.request_count,
        "errors": prediction_engine.error_count,
    }


@app.post("/optimization/cache/clear")
async def clear_cache():
    prediction_engine._l1_cache.clear()
    prediction_engine._feature_cache.clear()
    prediction_engine._price_buffer.clear()
    prediction_engine._price_buffer_ts.clear()
    if prediction_engine._l2_cache:
        try:
            prediction_engine._l2_cache.redis_client.delete("*pred:*")
            prediction_engine._l2_cache.redis_client.delete("*feat:*")
        except Exception:
            pass
    return {"status": "cache cleared"}


@app.post("/optimization/warmup")
async def warmup():
    """Warm up all models with dummy inference to prime CPU caches."""
    import numpy as np
    dummy = {k: 0.0 for k in prediction_engine._predict_sync.__code__.co_varnames if k == 'features'}
    # Actually just run predict on all tokens
    results = []
    for token in prediction_engine.token_models:
        try:
            # Get a real price first to have valid features
            pd = prediction_engine.fetch_token_price(token)
            if pd and pd.get("price"):
                feats = prediction_engine.compute_features(token, pd)
                if feats:
                    prediction_engine.predict(token, feats)
                    results.append(token)
        except Exception:
            pass
    return {"status": "warmup complete", "tokens_warmed": results}


# ============================================================
# HEALTH & METRICS
# ============================================================

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "3.2.3-super",
        "engine": prediction_engine.get_health(),
    }


@app.get("/metrics", response_class=PlainTextResponse)
async def prometheus_metrics():
    return metrics.export()


# ============================================================
# ROOT
# ============================================================

@app.get("/")
async def root():
    return {
        "name": "Vera OS Super Server",
        "version": "3.2.3-super",
        "optimizations": [
            "onnx_quantized_inference",
            "redis_l2_cache",
            "l1_lru_cache",
            "in_memory_price_ring_buffer",
            "feature_computation_cache",
            "persistent_http_session",
            "request_coalescing",
            "adaptive_micro_batching",
            "zero_copy_onnx_buffers",
            "coin_gecko_circuit_breaker",
            "thread_pool_executor",
            "batch_prediction",
            "async_concurrent_price_fetch",
        ],
        "endpoints": [
            "/predict/{token}",
            "/predict/batch",
            "/swarm/predict/{token}",
            "/swarm/discovery",
            "/swarm/consensus",
            "/swarm/audit",
            "/hedera/account/{id}/balance",
            "/hedera/hcs/{topic_id}/messages",
            "/hedera/hcs/{topic_id}/message",
            "/hedera/topic/create",
            "/hedera/transfer",
            "/memory/record",
            "/memory/search",
            "/memory/stats/{token}",
            "/memory/recent/{token}",
            "/markets/create",
            "/markets/list",
            "/markets/{market_id}",
            "/markets/{market_id}/buy",
            "/markets/{market_id}/sell",
            "/markets/{market_id}/resolve",
            "/markets/{market_id}/positions/{account}",
            "/markets/{market_id}/trades",
            "/mcp/tools",
            "/mcp/tools/{tool_name}",
            "/optimization/stats",
            "/optimization/cache/clear",
            "/optimization/warmup",
            "/health",
            "/metrics",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, loop="uvloop")
