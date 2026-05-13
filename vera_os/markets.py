"""Public wrapper for the Hedera prediction market infrastructure."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PredictionMarketService:
    """Facade over the full prediction market stack.

    Provides a single entry point for creating markets, trading, querying
    oracle signals, and checking the leaderboard — without needing to
    instantiate each manager individually.
    """

    _initialized: bool = field(default=False, repr=False)
    market_manager: Any = field(default=None, repr=False)
    pool_manager: Any = field(default=None, repr=False)
    token_manager: Any = field(default=None, repr=False)
    oracle_feed: Any = field(default=None, repr=False)
    settlement_engine: Any = field(default=None, repr=False)
    auto_factory: Any = field(default=None, repr=False)
    liquidity_manager: Any = field(default=None, repr=False)
    portfolio_tracker: Any = field(default=None, repr=False)
    market_maker: Any = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if not self._initialized:
            self._lazy_init()

    def _lazy_init(self) -> None:
        from src.markets.market_core import MarketManager, MarketType
        from src.markets.hbar_pools import HBARPoolManager
        from src.markets.hts_outcome_tokens import OutcomeTokenManager
        from src.markets.oracle_feed import SwarmOracleFeed
        from src.markets.settlement import SettlementEngine
        from src.markets.auto_market_factory import AutoMarketFactory
        from src.markets.liquidity import LiquidityManager
        from src.markets.portfolio import PortfolioTracker
        from src.markets.market_maker import MarketMakerBot

        self.market_manager = self.market_manager or MarketManager()
        self.pool_manager = self.pool_manager or HBARPoolManager()
        self.token_manager = self.token_manager or OutcomeTokenManager()
        self.oracle_feed = self.oracle_feed or SwarmOracleFeed()
        self.settlement_engine = self.settlement_engine or SettlementEngine(
            self.market_manager, self.pool_manager,
            self.token_manager, self.oracle_feed,
        )
        self.auto_factory = self.auto_factory or AutoMarketFactory(
            self.market_manager, self.pool_manager,
            self.token_manager, self.oracle_feed,
        )
        self.auto_factory.register_defaults()
        self.liquidity_manager = self.liquidity_manager or LiquidityManager()
        self.portfolio_tracker = self.portfolio_tracker or PortfolioTracker(
            self.market_manager, self.pool_manager, self.token_manager,
        )
        self.market_maker = self.market_maker or MarketMakerBot(
            self.market_manager, self.pool_manager,
            self.token_manager, self.oracle_feed,
        )
        self._initialized = True

    # ------------------------------------------------------------------
    # Convenience methods
    # ------------------------------------------------------------------

    def create_market(
        self,
        question: str,
        outcomes: list[str] | None = None,
        resolution_time: float = 0,
        market_type: str = "binary",
    ) -> dict[str, Any]:
        """Create a prediction market with optional pool and token backing."""
        import time as _time
        from src.markets.market_core import MarketType

        outcomes = outcomes or ["YES", "NO"]
        resolution_time = resolution_time or (_time.time() + 86400)
        mt = MarketType(market_type)

        market = self.market_manager.create_market(
            question=question,
            outcomes=outcomes,
            resolution_time=resolution_time,
            market_type=mt,
        )
        # Auto-create backing structures
        try:
            self.pool_manager.create_pool(market.market_id, outcomes)
        except ValueError:
            pass
        if market_type == "hts_token":
            try:
                self.token_manager.create_market_tokens(market.market_id, outcomes)
            except ValueError:
                pass
        return market.to_dict()

    def list_markets(self) -> list[dict[str, Any]]:
        return [m.to_dict() for m in self.market_manager.list_markets()]

    def portfolio(self, user: str) -> dict[str, Any]:
        return self.portfolio_tracker.get_portfolio(user)

    def leaderboard(self, sort_by: str = "profit", limit: int = 50) -> list[dict[str, Any]]:
        return self.portfolio_tracker.leaderboard(sort_by=sort_by, limit=limit)

    def stats(self) -> dict[str, Any]:
        return {
            "markets": self.market_manager.stats(),
            "pools": self.pool_manager.stats(),
            "tokens": self.token_manager.stats(),
            "oracle": self.oracle_feed.stats(),
            "settlement": self.settlement_engine.stats(),
            "factory": self.auto_factory.stats(),
            "liquidity": self.liquidity_manager.stats(),
            "market_maker": self.market_maker.stats(),
        }
