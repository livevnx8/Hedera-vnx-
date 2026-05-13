"""
Prediction Market Core — state machine, order book, and market management.

Supports binary (YES/NO) and multi-outcome markets.  Each market tracks its
own order book and derives implied probabilities from matched orders or pool
ratios.
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class MarketStatus(str, Enum):
    """Lifecycle states for a prediction market."""
    DRAFT = "draft"
    OPEN = "open"
    TRADING = "trading"
    RESOLVING = "resolving"
    SETTLED = "settled"
    CANCELLED = "cancelled"


class MarketType(str, Enum):
    """Market mechanics."""
    BINARY = "binary"           # YES / NO
    MULTI = "multi"             # 3+ outcomes
    HBAR_POOL = "hbar_pool"     # simple winner-takes-pool
    HTS_TOKEN = "hts_token"     # AMM-based outcome tokens


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class Order:
    """A single order in a market order book."""
    order_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    market_id: str = ""
    user: str = ""
    outcome: str = ""
    side: OrderSide = OrderSide.BUY
    amount: int = 0               # tinybar (1 HBAR = 100_000_000 tinybar)
    price: float = 0.0            # 0.0–1.0 implied probability
    filled: int = 0
    status: str = "open"          # open | filled | partial | cancelled
    timestamp: float = field(default_factory=time.time)

    @property
    def remaining(self) -> int:
        return self.amount - self.filled

    def to_dict(self) -> Dict[str, Any]:
        return {
            "order_id": self.order_id,
            "market_id": self.market_id,
            "user": self.user,
            "outcome": self.outcome,
            "side": self.side.value,
            "amount": self.amount,
            "price": self.price,
            "filled": self.filled,
            "remaining": self.remaining,
            "status": self.status,
            "timestamp": self.timestamp,
        }


@dataclass
class PredictionMarket:
    """A single prediction market."""
    market_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    question: str = ""
    description: str = ""
    outcomes: List[str] = field(default_factory=lambda: ["YES", "NO"])
    market_type: MarketType = MarketType.BINARY
    status: MarketStatus = MarketStatus.DRAFT
    resolution_time: float = 0.0       # epoch when market can be resolved
    created_at: float = field(default_factory=time.time)
    resolved_at: Optional[float] = None
    winning_outcome: Optional[str] = None
    creator: str = ""
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    # Order-book state (in-memory)
    orders: List[Order] = field(default_factory=list, repr=False)

    # Running totals per outcome
    volume: Dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "market_id": self.market_id,
            "question": self.question,
            "description": self.description,
            "outcomes": self.outcomes,
            "market_type": self.market_type.value,
            "status": self.status.value,
            "resolution_time": self.resolution_time,
            "created_at": self.created_at,
            "resolved_at": self.resolved_at,
            "winning_outcome": self.winning_outcome,
            "creator": self.creator,
            "tags": self.tags,
            "volume": self.volume,
            "implied_probabilities": self.implied_probabilities(),
            "total_volume": sum(self.volume.values()),
            "order_count": len(self.orders),
        }

    # ------------------------------------------------------------------
    # Derived data
    # ------------------------------------------------------------------

    def implied_probabilities(self) -> Dict[str, float]:
        """Derive implied probability per outcome from volume weights."""
        total = sum(self.volume.values()) or 1
        return {o: round(self.volume.get(o, 0) / total, 6) for o in self.outcomes}

    def market_hash(self) -> str:
        """Deterministic hash of market state for proof anchoring."""
        payload = {
            "market_id": self.market_id,
            "question": self.question,
            "outcomes": self.outcomes,
            "status": self.status.value,
            "volume": self.volume,
            "winning_outcome": self.winning_outcome,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


# ---------------------------------------------------------------------------
# Market Manager
# ---------------------------------------------------------------------------

class MarketManager:
    """
    Central manager for all prediction markets.

    Responsibilities:
    - Create, open, resolve, cancel markets
    - Accept and match orders
    - Provide orderbook and probability views
    """

    def __init__(self):
        self.markets: Dict[str, PredictionMarket] = {}
        self._trade_log: List[Dict[str, Any]] = []

    # ------------------------------------------------------------------
    # Market lifecycle
    # ------------------------------------------------------------------

    def create_market(
        self,
        question: str,
        outcomes: List[str],
        resolution_time: float,
        market_type: MarketType = MarketType.BINARY,
        creator: str = "system",
        description: str = "",
        tags: Optional[List[str]] = None,
    ) -> PredictionMarket:
        """Create a new prediction market and open it for trading."""
        if market_type == MarketType.BINARY and len(outcomes) != 2:
            raise ValueError("Binary markets must have exactly 2 outcomes")
        if len(outcomes) < 2:
            raise ValueError("Markets must have at least 2 outcomes")
        if resolution_time < time.time():
            raise ValueError("Resolution time must be in the future")

        market = PredictionMarket(
            question=question,
            description=description,
            outcomes=outcomes,
            market_type=market_type,
            status=MarketStatus.OPEN,
            resolution_time=resolution_time,
            creator=creator,
            tags=tags or [],
            volume={o: 0 for o in outcomes},
        )
        self.markets[market.market_id] = market
        return market

    def get_market(self, market_id: str) -> Optional[PredictionMarket]:
        return self.markets.get(market_id)

    def list_markets(
        self,
        status: Optional[MarketStatus] = None,
        market_type: Optional[MarketType] = None,
    ) -> List[PredictionMarket]:
        """List markets, optionally filtered by status or type."""
        result = list(self.markets.values())
        if status:
            result = [m for m in result if m.status == status]
        if market_type:
            result = [m for m in result if m.market_type == market_type]
        return sorted(result, key=lambda m: m.created_at, reverse=True)

    # ------------------------------------------------------------------
    # Order placement and matching
    # ------------------------------------------------------------------

    def place_order(
        self,
        market_id: str,
        user: str,
        outcome: str,
        amount: int,
        price: float = 0.5,
        side: OrderSide = OrderSide.BUY,
    ) -> Order:
        """Place a buy/sell order on a market outcome."""
        market = self._require_market(market_id)
        if market.status not in (MarketStatus.OPEN, MarketStatus.TRADING):
            raise ValueError(f"Market {market_id} is not accepting orders (status={market.status.value})")
        if outcome not in market.outcomes:
            raise ValueError(f"Invalid outcome '{outcome}', expected one of {market.outcomes}")
        if amount <= 0:
            raise ValueError("Amount must be positive")
        if not 0.0 < price < 1.0:
            raise ValueError("Price must be between 0 and 1 (exclusive)")

        order = Order(
            market_id=market_id,
            user=user,
            outcome=outcome,
            side=side,
            amount=amount,
            price=price,
        )
        market.orders.append(order)

        # Update volume
        if side == OrderSide.BUY:
            market.volume[outcome] = market.volume.get(outcome, 0) + amount

        # Move market to trading on first order
        if market.status == MarketStatus.OPEN:
            market.status = MarketStatus.TRADING

        # Simple matching: match against opposite-side orders
        self._match_orders(market, order)

        return order

    def _match_orders(self, market: PredictionMarket, incoming: Order):
        """FIFO price-time matching against resting orders."""
        opposite_side = OrderSide.SELL if incoming.side == OrderSide.BUY else OrderSide.BUY
        resting = [
            o for o in market.orders
            if o.outcome == incoming.outcome
            and o.side == opposite_side
            and o.status in ("open", "partial")
            and o.order_id != incoming.order_id
        ]
        # Sort by best price first (lowest ask for buy, highest bid for sell)
        if incoming.side == OrderSide.BUY:
            resting.sort(key=lambda o: (o.price, o.timestamp))
        else:
            resting.sort(key=lambda o: (-o.price, o.timestamp))

        for resting_order in resting:
            if incoming.remaining <= 0:
                break
            if incoming.side == OrderSide.BUY and resting_order.price > incoming.price:
                continue
            if incoming.side == OrderSide.SELL and resting_order.price < incoming.price:
                continue

            fill_qty = min(incoming.remaining, resting_order.remaining)
            fill_price = resting_order.price  # price improvement goes to taker

            incoming.filled += fill_qty
            resting_order.filled += fill_qty

            # Update statuses
            for o in (incoming, resting_order):
                if o.filled >= o.amount:
                    o.status = "filled"
                else:
                    o.status = "partial"

            self._trade_log.append({
                "market_id": market.market_id,
                "outcome": incoming.outcome,
                "buyer": incoming.user if incoming.side == OrderSide.BUY else resting_order.user,
                "seller": resting_order.user if incoming.side == OrderSide.BUY else incoming.user,
                "quantity": fill_qty,
                "price": fill_price,
                "timestamp": time.time(),
            })

    # ------------------------------------------------------------------
    # Orderbook and probabilities
    # ------------------------------------------------------------------

    def get_orderbook(self, market_id: str) -> Dict[str, Any]:
        """Return bids and asks for each outcome."""
        market = self._require_market(market_id)
        book: Dict[str, Dict[str, List]] = {}
        for outcome in market.outcomes:
            bids = sorted(
                [o.to_dict() for o in market.orders
                 if o.outcome == outcome and o.side == OrderSide.BUY and o.status in ("open", "partial")],
                key=lambda x: -x["price"],
            )
            asks = sorted(
                [o.to_dict() for o in market.orders
                 if o.outcome == outcome and o.side == OrderSide.SELL and o.status in ("open", "partial")],
                key=lambda x: x["price"],
            )
            book[outcome] = {"bids": bids, "asks": asks}
        return {"market_id": market_id, "orderbook": book}

    def get_probability(self, market_id: str) -> Dict[str, float]:
        """Return implied probability per outcome."""
        market = self._require_market(market_id)
        return market.implied_probabilities()

    def get_trades(self, market_id: str) -> List[Dict[str, Any]]:
        """Return filled trades for a market."""
        return [t for t in self._trade_log if t["market_id"] == market_id]

    # ------------------------------------------------------------------
    # Resolution
    # ------------------------------------------------------------------

    def resolve_market(self, market_id: str, winning_outcome: str) -> PredictionMarket:
        """Resolve a market with the winning outcome."""
        market = self._require_market(market_id)
        if market.status == MarketStatus.SETTLED:
            raise ValueError("Market already settled")
        if market.status == MarketStatus.CANCELLED:
            raise ValueError("Cannot resolve a cancelled market")
        if winning_outcome not in market.outcomes:
            raise ValueError(f"Invalid outcome '{winning_outcome}'")

        market.status = MarketStatus.RESOLVING
        market.winning_outcome = winning_outcome
        market.resolved_at = time.time()

        # Cancel all open orders
        for order in market.orders:
            if order.status in ("open", "partial"):
                order.status = "cancelled"

        return market

    def settle_market(self, market_id: str) -> PredictionMarket:
        """Mark a resolved market as settled (after payouts complete)."""
        market = self._require_market(market_id)
        if market.status != MarketStatus.RESOLVING:
            raise ValueError("Market must be in RESOLVING state to settle")
        market.status = MarketStatus.SETTLED
        return market

    def cancel_market(self, market_id: str) -> PredictionMarket:
        """Cancel a market and mark all orders as cancelled."""
        market = self._require_market(market_id)
        if market.status == MarketStatus.SETTLED:
            raise ValueError("Cannot cancel a settled market")
        market.status = MarketStatus.CANCELLED
        for order in market.orders:
            if order.status in ("open", "partial"):
                order.status = "cancelled"
        return market

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def stats(self) -> Dict[str, Any]:
        """Global market stats."""
        markets = list(self.markets.values())
        return {
            "total_markets": len(markets),
            "open_markets": sum(1 for m in markets if m.status in (MarketStatus.OPEN, MarketStatus.TRADING)),
            "settled_markets": sum(1 for m in markets if m.status == MarketStatus.SETTLED),
            "total_volume": sum(sum(m.volume.values()) for m in markets),
            "total_orders": sum(len(m.orders) for m in markets),
            "total_trades": len(self._trade_log),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _require_market(self, market_id: str) -> PredictionMarket:
        market = self.markets.get(market_id)
        if not market:
            raise KeyError(f"Market {market_id} not found")
        return market
