"""
Portfolio Tracker & Leaderboard — aggregates user positions across all markets.

Tracks P&L, win rate, and total volume for every user.  Provides a global
leaderboard ranked by profit, accuracy, or volume.
"""

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from .market_core import MarketManager, MarketStatus
from .hbar_pools import HBARPoolManager
from .hts_outcome_tokens import OutcomeTokenManager


@dataclass
class UserStats:
    """Aggregated stats for a single user."""
    user: str = ""
    total_markets: int = 0
    wins: int = 0
    losses: int = 0
    total_wagered: int = 0      # tinybar
    total_won: int = 0          # tinybar
    total_profit: int = 0       # tinybar (can be negative)
    best_trade_profit: int = 0
    worst_trade_profit: int = 0

    @property
    def win_rate(self) -> float:
        total = self.wins + self.losses
        return round(self.wins / total, 4) if total > 0 else 0.0

    @property
    def roi(self) -> float:
        return round(self.total_profit / max(self.total_wagered, 1), 4)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user": self.user,
            "total_markets": self.total_markets,
            "wins": self.wins,
            "losses": self.losses,
            "win_rate": self.win_rate,
            "total_wagered": self.total_wagered,
            "total_won": self.total_won,
            "total_profit": self.total_profit,
            "roi": self.roi,
            "best_trade_profit": self.best_trade_profit,
            "worst_trade_profit": self.worst_trade_profit,
        }


@dataclass
class MarketPosition:
    """A user's net position in a single market."""
    market_id: str = ""
    question: str = ""
    user: str = ""
    outcome_positions: Dict[str, int] = field(default_factory=dict)  # outcome → net tokens/stake
    total_cost: int = 0          # total HBAR spent
    current_value: int = 0       # estimated current value
    unrealized_pnl: int = 0
    realized_pnl: int = 0
    settled: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "market_id": self.market_id,
            "question": self.question,
            "user": self.user,
            "outcome_positions": self.outcome_positions,
            "total_cost": self.total_cost,
            "current_value": self.current_value,
            "unrealized_pnl": self.unrealized_pnl,
            "realized_pnl": self.realized_pnl,
            "settled": self.settled,
        }


class PortfolioTracker:
    """
    Aggregates user positions and P&L across all markets.
    """

    def __init__(
        self,
        market_manager: MarketManager,
        pool_manager: HBARPoolManager,
        token_manager: OutcomeTokenManager,
    ):
        self._markets = market_manager
        self._pools = pool_manager
        self._tokens = token_manager

        # Manual P&L tracking for settled markets
        self._settled_pnl: Dict[str, Dict[str, int]] = {}   # user → {market → pnl}

    # ------------------------------------------------------------------
    # Portfolio view
    # ------------------------------------------------------------------

    def get_portfolio(self, user: str) -> Dict[str, Any]:
        """Get a user's full portfolio across all markets."""
        positions: List[MarketPosition] = []
        total_value = 0
        total_cost = 0
        total_unrealized = 0
        total_realized = 0

        for market_id, market in self._markets.markets.items():
            pos = self._get_market_position(market_id, user)
            if pos and (pos.total_cost > 0 or any(v > 0 for v in pos.outcome_positions.values())):
                positions.append(pos)
                total_value += pos.current_value
                total_cost += pos.total_cost
                total_unrealized += pos.unrealized_pnl
                total_realized += pos.realized_pnl

        # Add settled P&L
        for market_id, pnl in self._settled_pnl.get(user, {}).items():
            total_realized += pnl

        return {
            "user": user,
            "positions": [p.to_dict() for p in positions],
            "active_positions": sum(1 for p in positions if not p.settled),
            "total_positions": len(positions),
            "total_cost": total_cost,
            "total_value": total_value,
            "unrealized_pnl": total_unrealized,
            "realized_pnl": total_realized,
            "net_pnl": total_unrealized + total_realized,
        }

    def record_settlement_pnl(self, user: str, market_id: str, pnl: int):
        """Record realized P&L from a settled market."""
        if user not in self._settled_pnl:
            self._settled_pnl[user] = {}
        self._settled_pnl[user][market_id] = pnl

    # ------------------------------------------------------------------
    # Leaderboard
    # ------------------------------------------------------------------

    def leaderboard(
        self,
        sort_by: str = "profit",
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Global leaderboard across all markets.

        sort_by: profit | win_rate | volume | roi
        """
        users = self._discover_all_users()
        stats_list: List[UserStats] = []

        for user in users:
            stats = self._compute_user_stats(user)
            if stats.total_markets > 0:
                stats_list.append(stats)

        # Sort
        key_map = {
            "profit": lambda s: s.total_profit,
            "win_rate": lambda s: s.win_rate,
            "volume": lambda s: s.total_wagered,
            "roi": lambda s: s.roi,
        }
        sort_fn = key_map.get(sort_by, key_map["profit"])
        stats_list.sort(key=sort_fn, reverse=True)

        result = []
        for rank, stats in enumerate(stats_list[:limit], 1):
            d = stats.to_dict()
            d["rank"] = rank
            result.append(d)

        return result

    # ------------------------------------------------------------------
    # User stats
    # ------------------------------------------------------------------

    def get_user_stats(self, user: str) -> UserStats:
        """Compute aggregated stats for a user."""
        return self._compute_user_stats(user)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _get_market_position(self, market_id: str, user: str) -> Optional[MarketPosition]:
        """Build a MarketPosition for a user in a specific market."""
        market = self._markets.get_market(market_id)
        if not market:
            return None

        pos = MarketPosition(
            market_id=market_id,
            question=market.question,
            user=user,
            settled=market.status == MarketStatus.SETTLED,
        )

        # Pool stakes
        pool = self._pools.get_pool(market_id)
        if pool:
            user_stakes = [s for s in pool.stakes if s.user == user]
            for s in user_stakes:
                pos.outcome_positions[s.outcome] = pos.outcome_positions.get(s.outcome, 0) + s.amount
                pos.total_cost += s.amount

        # Token positions
        token_positions = self._tokens.get_user_positions(market_id, user)
        if token_positions:
            for outcome, balance in token_positions.items():
                pos.outcome_positions[outcome] = pos.outcome_positions.get(outcome, 0) + balance

        # Estimate current value from implied probabilities
        if not pos.settled:
            probs = market.implied_probabilities()
            for outcome, qty in pos.outcome_positions.items():
                prob = probs.get(outcome, 0.5)
                pos.current_value += int(qty * prob)
            pos.unrealized_pnl = pos.current_value - pos.total_cost

        # Settled value
        if pos.settled and market.winning_outcome:
            winning_qty = pos.outcome_positions.get(market.winning_outcome, 0)
            pos.current_value = winning_qty
            pos.realized_pnl = pos.current_value - pos.total_cost

        return pos

    def _compute_user_stats(self, user: str) -> UserStats:
        """Compute aggregated stats across all markets for a user."""
        stats = UserStats(user=user)

        for market_id, market in self._markets.markets.items():
            pos = self._get_market_position(market_id, user)
            if not pos or pos.total_cost == 0:
                continue

            stats.total_markets += 1
            stats.total_wagered += pos.total_cost

            if pos.settled:
                pnl = pos.realized_pnl
                stats.total_profit += pnl
                if pnl > 0:
                    stats.wins += 1
                    stats.total_won += pos.current_value
                else:
                    stats.losses += 1
                stats.best_trade_profit = max(stats.best_trade_profit, pnl)
                stats.worst_trade_profit = min(stats.worst_trade_profit, pnl)

        # Add externally recorded settlement P&L
        for market_id, pnl in self._settled_pnl.get(user, {}).items():
            stats.total_profit += pnl

        return stats

    def _discover_all_users(self) -> set:
        """Find all unique users across all markets."""
        users = set()
        for market_id, market in self._markets.markets.items():
            # From orders
            for order in market.orders:
                users.add(order.user)
            # From pool stakes
            pool = self._pools.get_pool(market_id)
            if pool:
                for s in pool.stakes:
                    users.add(s.user)
            # From token positions
            positions = self._tokens._positions.get(market_id, {})
            users.update(positions.keys())
        return users
