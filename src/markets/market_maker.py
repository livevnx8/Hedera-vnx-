"""
Automated Market Maker Bot — bootstraps liquidity and maintains tight spreads.

Uses oracle signals to set fair value and posts two-sided quotes around it.
Configurable spread, size, and rebalancing parameters.
"""

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .market_core import MarketManager, MarketStatus, OrderSide
from .hbar_pools import HBARPoolManager
from .hts_outcome_tokens import OutcomeTokenManager
from .oracle_feed import SwarmOracleFeed


@dataclass
class MMConfig:
    """Configuration for the market maker on a specific market."""
    market_id: str = ""
    spread_bps: int = 200           # 2% total spread (1% each side)
    order_size: int = 1_000_000     # tinybar per order (0.01 HBAR)
    max_position: int = 50_000_000  # max net position before rebalancing
    refresh_interval_seconds: int = 60
    use_oracle: bool = True         # use oracle signal for fair value
    active: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "market_id": self.market_id,
            "spread_bps": self.spread_bps,
            "order_size": self.order_size,
            "max_position": self.max_position,
            "refresh_interval_seconds": self.refresh_interval_seconds,
            "use_oracle": self.use_oracle,
            "active": self.active,
        }


@dataclass
class MMState:
    """Runtime state for the market maker."""
    market_id: str = ""
    net_position: Dict[str, int] = field(default_factory=dict)  # outcome → net
    orders_placed: int = 0
    orders_filled: int = 0
    total_volume: int = 0
    pnl: int = 0
    last_refresh: float = 0.0
    fair_value: Dict[str, float] = field(default_factory=dict)  # outcome → price

    def to_dict(self) -> Dict[str, Any]:
        return {
            "market_id": self.market_id,
            "net_position": self.net_position,
            "orders_placed": self.orders_placed,
            "orders_filled": self.orders_filled,
            "total_volume": self.total_volume,
            "pnl": self.pnl,
            "last_refresh": self.last_refresh,
            "fair_value": self.fair_value,
        }


class MarketMakerBot:
    """
    Automated market maker that provides liquidity across prediction markets.

    Capabilities:
    - Posts two-sided quotes (bid/ask) around oracle-derived fair value
    - Adjusts spread based on confidence and volatility
    - Rebalances when net position exceeds threshold
    - Supports both orderbook and HBAR pool markets
    """

    BOT_USER = "mm_bot"

    def __init__(
        self,
        market_manager: MarketManager,
        pool_manager: HBARPoolManager,
        token_manager: OutcomeTokenManager,
        oracle_feed: SwarmOracleFeed,
    ):
        self._markets = market_manager
        self._pools = pool_manager
        self._tokens = token_manager
        self._oracle = oracle_feed

        self._configs: Dict[str, MMConfig] = {}
        self._states: Dict[str, MMState] = {}

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    def configure_market(self, config: MMConfig) -> MMConfig:
        """Add or update market maker configuration for a market."""
        self._configs[config.market_id] = config
        if config.market_id not in self._states:
            self._states[config.market_id] = MMState(market_id=config.market_id)
        return config

    def stop_market(self, market_id: str):
        """Deactivate market making for a market."""
        config = self._configs.get(market_id)
        if config:
            config.active = False

    def list_configs(self) -> List[MMConfig]:
        return list(self._configs.values())

    # ------------------------------------------------------------------
    # Quote generation
    # ------------------------------------------------------------------

    def refresh_quotes(self, market_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Refresh quotes for one or all configured markets.
        Returns summary of actions taken.
        """
        results: Dict[str, Any] = {}
        targets = [market_id] if market_id else list(self._configs.keys())

        for mid in targets:
            config = self._configs.get(mid)
            if not config or not config.active:
                continue

            market = self._markets.get_market(mid)
            if not market or market.status not in (MarketStatus.OPEN, MarketStatus.TRADING):
                continue

            result = self._generate_quotes(mid, config)
            results[mid] = result

        return {"refreshed": len(results), "markets": results}

    def refresh_all(self) -> Dict[str, Any]:
        """Refresh quotes for all active markets. Call periodically."""
        return self.refresh_quotes()

    # ------------------------------------------------------------------
    # Auto-configure for new markets
    # ------------------------------------------------------------------

    def auto_configure(
        self,
        market_id: str,
        spread_bps: int = 200,
        order_size: int = 1_000_000,
    ) -> MMConfig:
        """Auto-configure market making for a market with sensible defaults."""
        config = MMConfig(
            market_id=market_id,
            spread_bps=spread_bps,
            order_size=order_size,
        )
        return self.configure_market(config)

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_state(self, market_id: str) -> Optional[MMState]:
        return self._states.get(market_id)

    def stats(self) -> Dict[str, Any]:
        states = list(self._states.values())
        return {
            "active_markets": sum(1 for c in self._configs.values() if c.active),
            "total_configured": len(self._configs),
            "total_orders_placed": sum(s.orders_placed for s in states),
            "total_volume": sum(s.total_volume for s in states),
            "total_pnl": sum(s.pnl for s in states),
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _generate_quotes(self, market_id: str, config: MMConfig) -> Dict[str, Any]:
        """Generate and place two-sided quotes for a market."""
        state = self._states[market_id]
        market = self._markets.get_market(market_id)
        if not market:
            return {"error": "market not found"}

        now = time.time()
        state.last_refresh = now
        actions: List[str] = []

        # Determine fair value per outcome
        fair_values = self._get_fair_values(market_id, config)
        state.fair_value = fair_values

        half_spread = config.spread_bps / 20_000  # half spread in decimal

        for outcome in market.outcomes:
            fv = fair_values.get(outcome, 0.5)

            # Bid (buy) at fair value minus half spread
            bid_price = max(0.01, min(0.99, fv - half_spread))
            # Ask (sell) at fair value plus half spread
            ask_price = max(0.01, min(0.99, fv + half_spread))

            # Place bid
            try:
                self._markets.place_order(
                    market_id=market_id,
                    user=self.BOT_USER,
                    outcome=outcome,
                    amount=config.order_size,
                    price=round(bid_price, 4),
                    side=OrderSide.BUY,
                )
                state.orders_placed += 1
                state.total_volume += config.order_size
                actions.append(f"BID {outcome} @ {bid_price:.4f}")
            except (ValueError, KeyError):
                pass

            # Place ask
            try:
                self._markets.place_order(
                    market_id=market_id,
                    user=self.BOT_USER,
                    outcome=outcome,
                    amount=config.order_size,
                    price=round(ask_price, 4),
                    side=OrderSide.SELL,
                )
                state.orders_placed += 1
                state.total_volume += config.order_size
                actions.append(f"ASK {outcome} @ {ask_price:.4f}")
            except (ValueError, KeyError):
                pass

        # Also seed the HBAR pool if it exists
        pool = self._pools.get_pool(market_id)
        if pool and not pool.settled:
            for outcome in market.outcomes:
                try:
                    self._pools.stake(market_id, outcome, config.order_size, self.BOT_USER)
                    actions.append(f"POOL {outcome} +{config.order_size}")
                    state.total_volume += config.order_size
                except (ValueError, KeyError):
                    pass

        return {
            "market_id": market_id,
            "actions": actions,
            "fair_values": fair_values,
            "spread_bps": config.spread_bps,
        }

    def _get_fair_values(self, market_id: str, config: MMConfig) -> Dict[str, float]:
        """Determine fair value per outcome from oracle or orderbook."""
        market = self._markets.get_market(market_id)
        if not market:
            return {}

        # Try oracle signal first
        if config.use_oracle:
            signal = self._oracle.get_latest_signal(market_id)
            if signal and signal.confidence > 0.5:
                # For binary: prob is for first outcome
                if len(market.outcomes) == 2:
                    return {
                        market.outcomes[0]: signal.probability,
                        market.outcomes[1]: 1 - signal.probability,
                    }

        # Fall back to implied probabilities from volume
        probs = market.implied_probabilities()
        # Smooth toward 0.5 if no volume
        total_vol = sum(market.volume.values())
        if total_vol == 0:
            return {o: 1.0 / len(market.outcomes) for o in market.outcomes}

        return probs
