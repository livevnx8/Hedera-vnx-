#!/usr/bin/env python3
"""VNX MCP Server
Model Context Protocol server for external LLM/agent integration.

Exposes VNX capabilities as standardized MCP tools:
  - predict(token)           → price direction prediction
  - get_price(token)       → live token price
  - get_token_balance(acct) → HBAR/HTS token balance
  - submit_hcs_message     → write to Hedera topic
  - get_hcs_messages       → read from Hedera topic
  - create_topic           → create new HCS topic
  - transfer_token         → HTS token transfer
  - memory_search          → semantic memory search
  - market_info(market_id) → PolyMarket info
  - buy_shares             → buy outcome shares
  - sell_shares            → sell outcome shares

Usage:
    python3 mcp_server.py          # stdio transport (for Claude Desktop)
    python3 mcp_server.py --http     # HTTP/SSE transport on :9000
"""
import asyncio
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional

# Add repo root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse, StreamingResponse
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False

# Hedera toolkit
try:
    from hedera_agent_toolkit import HederaAgentToolkit
    HEDERA_AVAILABLE = True
except ImportError:
    HEDERA_AVAILABLE = False

# Prediction engine
try:
    from src.prediction.super_engine import SuperPredictionEngine
    PREDICTION_AVAILABLE = True
except ImportError:
    PREDICTION_AVAILABLE = False

# Semantic memory
try:
    from semantic_memory import get_semantic_memory
    MEMORY_AVAILABLE = True
except ImportError:
    MEMORY_AVAILABLE = False

# Market infrastructure
try:
    from market_infrastructure import get_market_engine
    MARKET_AVAILABLE = True
except ImportError:
    MARKET_AVAILABLE = False


# ─── Tool Registry ──────────────────────────────────────────────────────────

TOOLS: List[Dict[str, Any]] = []
_handlers: Dict[str, Any] = {}


def tool(name: str, description: str, parameters: Dict[str, Any]):
    """Decorator to register an MCP tool."""
    def decorator(fn):
        TOOLS.append({
            "name": name,
            "description": description,
            "parameters": parameters,
        })
        _handlers[name] = fn
        return fn
    return decorator


# ─── Tool Implementations ─────────────────────────────────────────────────

@tool(
    name="predict",
    description="Predict price direction (UP/DOWN) for a token with confidence.",
    parameters={
        "token": {"type": "string", "description": "Token symbol (hbar, sauce, dovu)"},
    },
)
def _predict(args: Dict[str, Any]) -> Dict[str, Any]:
    token = args.get("token", "hbar").lower()
    if not PREDICTION_AVAILABLE:
        return {"error": "Prediction engine not available"}
    engine = SuperPredictionEngine()
    # Use dummy features for now — real integration would pass features
    features = {f"f{i}": 0.0 for i in range(14)}
    loop = asyncio.get_event_loop()
    result = loop.run_in_executor(None, engine._predict_sync, token, features)
    # Can't await in sync tool handler; return stub
    return {
        "token": token.upper(),
        "direction": "UP",
        "confidence": 0.72,
        "note": "stub — integrate with prediction_engine.predict_async for real inference",
    }


@tool(
    name="get_price",
    description="Get live USD price for a token.",
    parameters={
        "token": {"type": "string", "description": "Token symbol"},
    },
)
def _get_price(args: Dict[str, Any]) -> Dict[str, Any]:
    token = args.get("token", "hbar").lower()
    if not PREDICTION_AVAILABLE:
        return {"error": "Prediction engine not available"}
    engine = SuperPredictionEngine()
    try:
        price_data = engine.fetch_token_price(token)
        return {
            "token": token,
            "price_usd": price_data.get("price"),
            "change_24h_pct": price_data.get("change_24h"),
        }
    except Exception as e:
        return {"error": str(e)}


@tool(
    name="get_token_balance",
    description="Get HBAR balance for an account ID.",
    parameters={
        "account_id": {"type": "string", "description": "Hedera account ID (e.g. 0.0.12345)"},
    },
)
def _get_balance(args: Dict[str, Any]) -> Dict[str, Any]:
    acct = args.get("account_id", "")
    if not HEDERA_AVAILABLE:
        return {"error": "Hedera toolkit not available"}
    kit = HederaAgentToolkit()
    try:
        info = kit.get_account_info(acct)
        return {"account_id": acct, "balance_hbar": info.get("balance_hbars"), "tokens": info.get("tokens", [])}
    except Exception as e:
        return {"error": str(e)}


@tool(
    name="submit_hcs_message",
    description="Submit a message to a Hedera Consensus Service (HCS) topic.",
    parameters={
        "topic_id": {"type": "string", "description": "Topic ID (e.g. 0.0.12345)"},
        "message": {"type": "string", "description": "Message content (JSON or plain text)"},
    },
)
def _submit_hcs(args: Dict[str, Any]) -> Dict[str, Any]:
    topic_id = args.get("topic_id", "")
    message = args.get("message", "")
    if not HEDERA_AVAILABLE:
        return {"error": "Hedera toolkit not available"}
    kit = HederaAgentToolkit()
    try:
        result = kit.submit_hcs_message(topic_id, message)
        return {"success": True, "topic_id": topic_id, "sequence_number": result.get("sequence_number")}
    except Exception as e:
        return {"error": str(e)}


@tool(
    name="get_hcs_messages",
    description="Read messages from a Hedera Consensus Service (HCS) topic.",
    parameters={
        "topic_id": {"type": "string", "description": "Topic ID"},
        "limit": {"type": "integer", "description": "Max messages to return", "default": 10},
    },
)
def _get_hcs(args: Dict[str, Any]) -> Dict[str, Any]:
    topic_id = args.get("topic_id", "")
    limit = args.get("limit", 10)
    if not HEDERA_AVAILABLE:
        return {"error": "Hedera toolkit not available"}
    kit = HederaAgentToolkit()
    try:
        msgs = kit.get_topic_messages(topic_id, limit=limit)
        return {"topic_id": topic_id, "messages": msgs}
    except Exception as e:
        return {"error": str(e)}


@tool(
    name="memory_search",
    description="Search semantic memory for similar past trading decisions.",
    parameters={
        "token": {"type": "string", "description": "Token symbol"},
        "features_json": {"type": "string", "description": "JSON features dict"},
        "top_k": {"type": "integer", "description": "Number of results", "default": 5},
    },
)
def _memory_search(args: Dict[str, Any]) -> Dict[str, Any]:
    token = args.get("token", "hbar")
    features_json = args.get("features_json", "{}")
    top_k = args.get("top_k", 5)
    if not MEMORY_AVAILABLE:
        return {"error": "Semantic memory not available"}
    try:
        features = json.loads(features_json)
        mem = get_semantic_memory()
        results = mem.search_similar(token, features, top_k=top_k)
        return {"token": token, "results": results}
    except Exception as e:
        return {"error": str(e)}


@tool(
    name="market_info",
    description="Get information about a binary outcome market.",
    parameters={
        "market_id": {"type": "string", "description": "Market identifier"},
    },
)
def _market_info(args: Dict[str, Any]) -> Dict[str, Any]:
    market_id = args.get("market_id", "")
    if not MARKET_AVAILABLE:
        return {"error": "Market infrastructure not available"}
    engine = get_market_engine()
    try:
        info = engine.get_market(market_id)
        return info
    except Exception as e:
        return {"error": str(e)}


@tool(
    name="buy_shares",
    description="Buy outcome shares in a binary market.",
    parameters={
        "market_id": {"type": "string"},
        "outcome": {"type": "string", "description": "'YES' or 'NO'"},
        "amount": {"type": "number", "description": "Amount to spend"},
    },
)
def _buy_shares(args: Dict[str, Any]) -> Dict[str, Any]:
    market_id = args.get("market_id", "")
    outcome = args.get("outcome", "YES")
    amount = float(args.get("amount", 0))
    if not MARKET_AVAILABLE:
        return {"error": "Market infrastructure not available"}
    engine = get_market_engine()
    try:
        result = engine.buy_shares(market_id, outcome, amount)
        return result
    except Exception as e:
        return {"error": str(e)}


@tool(
    name="sell_shares",
    description="Sell outcome shares in a binary market.",
    parameters={
        "market_id": {"type": "string"},
        "outcome": {"type": "string", "description": "'YES' or 'NO'"},
        "shares": {"type": "number", "description": "Number of shares to sell"},
    },
)
def _sell_shares(args: Dict[str, Any]) -> Dict[str, Any]:
    market_id = args.get("market_id", "")
    outcome = args.get("outcome", "YES")
    shares = float(args.get("shares", 0))
    if not MARKET_AVAILABLE:
        return {"error": "Market infrastructure not available"}
    engine = get_market_engine()
    try:
        result = engine.sell_shares(market_id, outcome, shares)
        return result
    except Exception as e:
        return {"error": str(e)}


# ─── MCP Protocol Handlers ────────────────────────────────────────────────

def handle_initialize(params: Dict) -> Dict:
    return {
        "protocolVersion": "2024-11-05",
        "serverInfo": {
            "name": "vnx-mcp",
            "version": "1.0.0",
        },
        "capabilities": {
            "tools": {},
            "logging": {},
        },
    }


def handle_tools_list(params: Dict) -> Dict:
    return {"tools": TOOLS}


def handle_tools_call(params: Dict) -> Dict:
    name = params.get("name", "")
    args = params.get("arguments", {})
    if name not in _handlers:
        return {"error": f"Unknown tool: {name}"}
    result = _handlers[name](args)
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


METHODS = {
    "initialize": handle_initialize,
    "tools/list": handle_tools_list,
    "tools/call": handle_tools_call,
}


# ─── stdio Transport (Claude Desktop) ─────────────────────────────────────

def run_stdio():
    """Read JSON-RPC from stdin, write results to stdout."""
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            req = json.loads(line)
            method = req.get("method", "")
            params = req.get("params", {})
            handler = METHODS.get(method)
            if handler:
                result = handler(params)
            else:
                result = {"error": f"Unknown method: {method}"}
            resp = {"jsonrpc": "2.0", "id": req.get("id"), "result": result}
            print(json.dumps(resp), flush=True)
        except Exception as e:
            print(json.dumps({"jsonrpc": "2.0", "error": str(e)}), flush=True)


# ─── HTTP/SSE Transport ───────────────────────────────────────────────────

if FASTAPI_AVAILABLE:
    app = FastAPI(title="VNX MCP Server", version="1.0.0")

    @app.post("/mcp/v1/initialize")
    async def mcp_initialize():
        return handle_initialize({})

    @app.get("/mcp/v1/tools")
    async def mcp_tools():
        return handle_tools_list({})

    @app.post("/mcp/v1/tools/{tool_name}")
    async def mcp_call(tool_name: str, request: Request):
        body = await request.json()
        return handle_tools_call({"name": tool_name, "arguments": body})

    @app.get("/health")
    async def mcp_health():
        return {
            "status": "healthy",
            "tools": len(TOOLS),
            "hedera": HEDERA_AVAILABLE,
            "prediction": PREDICTION_AVAILABLE,
            "memory": MEMORY_AVAILABLE,
            "market": MARKET_AVAILABLE,
        }


# ─── Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--http", action="store_true", help="Run HTTP server on :9000")
    args = parser.parse_args()

    if args.http and FASTAPI_AVAILABLE:
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=9000)
    else:
        print("VNX MCP Server (stdio mode) — ready", file=sys.stderr, flush=True)
        run_stdio()
