"""
Prediction Market API — FastAPI router for market operations.

Mount this router in the main application:
    from src.markets.market_api import create_market_router
    app.include_router(create_market_router(), prefix="/markets")
"""

import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .market_core import MarketManager, MarketType, MarketStatus, OrderSide
from .hbar_pools import HBARPoolManager
from .hts_outcome_tokens import OutcomeTokenManager
from .oracle_feed import SwarmOracleFeed
from .settlement import SettlementEngine


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class CreateMarketRequest(BaseModel):
    question: str = Field(..., min_length=5, max_length=500)
    outcomes: List[str] = Field(..., min_length=2, max_length=10)
    resolution_time: float = Field(..., description="Unix epoch when market can resolve")
    market_type: str = Field("binary", description="binary | multi | hbar_pool | hts_token")
    description: str = ""
    creator: str = "anonymous"
    tags: List[str] = []


class PlaceOrderRequest(BaseModel):
    user: str
    outcome: str
    amount: int = Field(..., gt=0, description="Amount in tinybar")
    price: float = Field(0.5, gt=0, lt=1, description="Implied probability 0-1")
    side: str = Field("buy", description="buy | sell")


class StakeRequest(BaseModel):
    user: str
    outcome: str
    amount: int = Field(..., gt=0, description="HBAR amount in tinybar")


class BuyTokenRequest(BaseModel):
    user: str
    outcome: str
    amount: int = Field(..., gt=0, description="HBAR amount in tinybar")


class SellTokenRequest(BaseModel):
    user: str
    outcome: str
    token_amount: int = Field(..., gt=0)


class ResolveRequest(BaseModel):
    winning_outcome: str
    resolver: str = "admin"
    proof: str = ""


class DisputeRequest(BaseModel):
    disputant: str
    reason: str
    evidence_hash: str = ""


# ---------------------------------------------------------------------------
# Router factory
# ---------------------------------------------------------------------------

def create_market_router(
    market_manager: Optional[MarketManager] = None,
    pool_manager: Optional[HBARPoolManager] = None,
    token_manager: Optional[OutcomeTokenManager] = None,
    oracle_feed: Optional[SwarmOracleFeed] = None,
    settlement_engine: Optional[SettlementEngine] = None,
) -> APIRouter:
    """
    Create a FastAPI router for prediction market operations.

    If no managers are provided, fresh instances are created.
    """
    mm = market_manager or MarketManager()
    pm = pool_manager or HBARPoolManager()
    tm = token_manager or OutcomeTokenManager()
    of = oracle_feed or SwarmOracleFeed()
    se = settlement_engine or SettlementEngine(mm, pm, tm, of)

    router = APIRouter(tags=["Prediction Markets"])

    # ------------------------------------------------------------------
    # Market CRUD
    # ------------------------------------------------------------------

    @router.post("", summary="Create a prediction market")
    async def create_market(req: CreateMarketRequest):
        try:
            mt = MarketType(req.market_type)
        except ValueError:
            raise HTTPException(400, f"Invalid market_type: {req.market_type}")

        try:
            market = mm.create_market(
                question=req.question,
                outcomes=req.outcomes,
                resolution_time=req.resolution_time,
                market_type=mt,
                creator=req.creator,
                description=req.description,
                tags=req.tags,
            )
        except ValueError as e:
            raise HTTPException(400, str(e))

        # Auto-create backing structures
        if mt in (MarketType.HBAR_POOL, MarketType.BINARY):
            try:
                pm.create_pool(market.market_id, req.outcomes)
            except ValueError:
                pass

        if mt == MarketType.HTS_TOKEN:
            try:
                tm.create_market_tokens(market.market_id, req.outcomes)
            except ValueError:
                pass

        return market.to_dict()

    @router.get("", summary="List markets")
    async def list_markets(
        status: Optional[str] = Query(None),
        market_type: Optional[str] = Query(None),
    ):
        s = MarketStatus(status) if status else None
        mt = MarketType(market_type) if market_type else None
        markets = mm.list_markets(status=s, market_type=mt)
        return {"markets": [m.to_dict() for m in markets], "count": len(markets)}

    @router.get("/stats", summary="Global market statistics")
    async def market_stats():
        return {
            "markets": mm.stats(),
            "pools": pm.stats(),
            "tokens": tm.stats(),
            "oracle": of.stats(),
            "settlement": se.stats(),
        }

    @router.get("/{market_id}", summary="Get market details")
    async def get_market(market_id: str):
        market = mm.get_market(market_id)
        if not market:
            raise HTTPException(404, "Market not found")

        result = market.to_dict()

        # Enrich with pool/token/oracle data
        pool = pm.get_pool(market_id)
        if pool:
            result["pool"] = pool.to_dict()

        tokens = tm.get_tokens(market_id)
        if tokens:
            result["tokens"] = {o: t.to_dict() for o, t in tokens.items()}
            result["amm"] = tm.get_amm_state(market_id).to_dict()

        latest_signal = of.get_latest_signal(market_id)
        if latest_signal:
            result["oracle_signal"] = latest_signal.to_dict()

        settlement = se.get_settlement(market_id)
        if settlement:
            result["settlement"] = settlement.to_dict()

        return result

    # ------------------------------------------------------------------
    # Order book trading
    # ------------------------------------------------------------------

    @router.post("/{market_id}/order", summary="Place an order")
    async def place_order(market_id: str, req: PlaceOrderRequest):
        try:
            side = OrderSide(req.side)
        except ValueError:
            raise HTTPException(400, f"Invalid side: {req.side}")
        try:
            order = mm.place_order(
                market_id=market_id,
                user=req.user,
                outcome=req.outcome,
                amount=req.amount,
                price=req.price,
                side=side,
            )
            return order.to_dict()
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    @router.get("/{market_id}/orderbook", summary="Get order book")
    async def get_orderbook(market_id: str):
        try:
            return mm.get_orderbook(market_id)
        except KeyError:
            raise HTTPException(404, "Market not found")

    @router.get("/{market_id}/probability", summary="Implied probabilities")
    async def get_probability(market_id: str):
        try:
            return {
                "market_id": market_id,
                "probabilities": mm.get_probability(market_id),
            }
        except KeyError:
            raise HTTPException(404, "Market not found")

    @router.get("/{market_id}/trades", summary="Trade history")
    async def get_trades(market_id: str):
        return {"market_id": market_id, "trades": mm.get_trades(market_id)}

    # ------------------------------------------------------------------
    # HBAR pool operations
    # ------------------------------------------------------------------

    @router.post("/{market_id}/pool/stake", summary="Stake HBAR in outcome pool")
    async def pool_stake(market_id: str, req: StakeRequest):
        try:
            entry = pm.stake(market_id, req.outcome, req.amount, req.user)
            return {
                "stake": entry.to_dict(),
                "pool": pm.get_pool(market_id).to_dict(),
            }
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    @router.get("/{market_id}/pool", summary="Get pool state")
    async def get_pool(market_id: str):
        pool = pm.get_pool(market_id)
        if not pool:
            raise HTTPException(404, "No pool for this market")
        return pool.to_dict()

    # ------------------------------------------------------------------
    # HTS token operations
    # ------------------------------------------------------------------

    @router.post("/{market_id}/tokens/buy", summary="Buy outcome tokens")
    async def buy_tokens(market_id: str, req: BuyTokenRequest):
        try:
            return tm.buy_outcome(market_id, req.outcome, req.amount, req.user)
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    @router.post("/{market_id}/tokens/sell", summary="Sell outcome tokens")
    async def sell_tokens(market_id: str, req: SellTokenRequest):
        try:
            return tm.sell_outcome(market_id, req.outcome, req.token_amount, req.user)
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    @router.get("/{market_id}/tokens", summary="Get token info and prices")
    async def get_tokens(market_id: str):
        tokens = tm.get_tokens(market_id)
        if not tokens:
            raise HTTPException(404, "No tokens for this market")
        return {
            "tokens": {o: t.to_dict() for o, t in tokens.items()},
            "prices": tm.get_prices(market_id),
            "amm": tm.get_amm_state(market_id).to_dict(),
        }

    @router.get("/{market_id}/tokens/positions/{user}", summary="User positions")
    async def get_positions(market_id: str, user: str):
        return {
            "user": user,
            "market_id": market_id,
            "positions": tm.get_user_positions(market_id, user),
        }

    # ------------------------------------------------------------------
    # Oracle feed
    # ------------------------------------------------------------------

    @router.get("/{market_id}/oracle", summary="Latest oracle signal")
    async def get_oracle(market_id: str):
        signal = of.get_latest_signal(market_id)
        if not signal:
            raise HTTPException(404, "No oracle signals for this market")
        return {
            "signal": signal.to_dict(),
            "consensus_probability": of.get_consensus_probability(market_id),
        }

    @router.get("/{market_id}/oracle/history", summary="Oracle signal history")
    async def get_oracle_history(market_id: str, limit: int = Query(50, le=500)):
        signals = of.get_signal_history(market_id, limit=limit)
        return {
            "market_id": market_id,
            "signals": [s.to_dict() for s in signals],
            "count": len(signals),
        }

    @router.get("/{market_id}/oracle/series", summary="Probability time series")
    async def get_oracle_series(market_id: str):
        return {
            "market_id": market_id,
            "series": of.get_probability_series(market_id),
        }

    # ------------------------------------------------------------------
    # Resolution and settlement
    # ------------------------------------------------------------------

    @router.post("/{market_id}/resolve", summary="Resolve market")
    async def resolve_market(market_id: str, req: ResolveRequest):
        try:
            record = se.resolve_manual(
                market_id=market_id,
                winning_outcome=req.winning_outcome,
                resolver=req.resolver,
                resolver_proof=req.proof,
            )
            return record.to_dict()
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    @router.post("/{market_id}/resolve/oracle", summary="Auto-resolve via oracle")
    async def resolve_oracle(market_id: str):
        try:
            record = se.resolve_with_oracle(market_id)
            return record.to_dict()
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    @router.post("/{market_id}/settle", summary="Execute settlement payouts")
    async def settle_market(market_id: str):
        try:
            return se.execute_settlement(market_id)
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    @router.get("/{market_id}/settlement", summary="Settlement details")
    async def get_settlement(market_id: str):
        record = se.get_settlement(market_id)
        if not record:
            raise HTTPException(404, "No settlement for this market")
        return record.to_dict()

    # ------------------------------------------------------------------
    # Disputes
    # ------------------------------------------------------------------

    @router.post("/{market_id}/dispute", summary="Open a dispute")
    async def open_dispute(market_id: str, req: DisputeRequest):
        try:
            d = se.dispute(
                market_id=market_id,
                disputant=req.disputant,
                reason=req.reason,
                evidence_hash=req.evidence_hash,
            )
            return d.to_dict()
        except (KeyError, ValueError) as e:
            raise HTTPException(400, str(e))

    @router.get("/{market_id}/disputes", summary="List disputes")
    async def list_disputes(market_id: str):
        disputes = se.get_disputes(market_id)
        return {"disputes": [d.to_dict() for d in disputes]}

    return router
