"""
Hedera Prediction Market Infrastructure.

Combines BitLattice swarm AI signals with Polymarket-style market mechanics
on Hedera — HTS outcome tokens, HBAR pools, HCS-anchored settlement.
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
]
