"""
Hedera Prediction Market Infrastructure.

Combines BitLattice swarm AI signals with Polymarket-style market mechanics
on Hedera — HTS outcome tokens, HBAR pools, HCS-anchored settlement,
automated market making, liquidity incentives, and portfolio tracking.
"""

from .market_core import (
    MarketStatus,
    MarketType,
    PredictionMarket,
    Order,
    OrderSide,
    MarketManager,
)
from .hbar_pools import HBARPoolManager
from .hts_outcome_tokens import OutcomeTokenManager
from .oracle_feed import SwarmOracleFeed
from .settlement import SettlementEngine
from .auto_market_factory import AutoMarketFactory, MarketTemplate
from .liquidity import LiquidityManager
from .portfolio import PortfolioTracker
from .market_maker import MarketMakerBot, MMConfig

__all__ = [
    "MarketStatus",
    "MarketType",
    "PredictionMarket",
    "Order",
    "OrderSide",
    "MarketManager",
    "HBARPoolManager",
    "OutcomeTokenManager",
    "SwarmOracleFeed",
    "SettlementEngine",
    "AutoMarketFactory",
    "MarketTemplate",
    "LiquidityManager",
    "PortfolioTracker",
    "MarketMakerBot",
    "MMConfig",
]
