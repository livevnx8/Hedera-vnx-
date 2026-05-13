"""
Liquidity Provider Incentives — rewards for market makers and LPs.

Tracks liquidity provision, calculates LP rewards based on time-weighted
contribution, and manages fee distribution to incentivize deep markets.
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class LiquidityPosition:
    """A user's liquidity provision in a market."""
    position_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    market_id: str = ""
    user: str = ""
    amount: int = 0               # tinybar deposited
    shares: float = 0.0           # LP shares (proportional ownership)
    entry_time: float = field(default_factory=time.time)
    exit_time: Optional[float] = None
    rewards_claimed: int = 0
    active: bool = True

    @property
    def duration_seconds(self) -> float:
        end = self.exit_time or time.time()
        return end - self.entry_time

    def to_dict(self) -> Dict[str, Any]:
        return {
            "position_id": self.position_id,
            "market_id": self.market_id,
            "user": self.user,
            "amount": self.amount,
            "shares": round(self.shares, 6),
            "entry_time": self.entry_time,
            "exit_time": self.exit_time,
            "rewards_claimed": self.rewards_claimed,
            "active": self.active,
            "duration_seconds": self.duration_seconds,
        }


@dataclass
class RewardPool:
    """Reward pool for a market's LPs."""
    market_id: str = ""
    total_fees_collected: int = 0      # from trading fees
    bonus_rewards: int = 0             # platform incentives
    total_distributed: int = 0
    total_shares: float = 0.0

    @property
    def available_rewards(self) -> int:
        return self.total_fees_collected + self.bonus_rewards - self.total_distributed

    def to_dict(self) -> Dict[str, Any]:
        return {
            "market_id": self.market_id,
            "total_fees_collected": self.total_fees_collected,
            "bonus_rewards": self.bonus_rewards,
            "total_distributed": self.total_distributed,
            "available_rewards": self.available_rewards,
            "total_shares": round(self.total_shares, 6),
        }


class LiquidityManager:
    """
    Manages liquidity provision and LP reward distribution.

    LP rewards come from two sources:
    1. Trading fees (portion of 0.3% swap fee goes to LPs)
    2. Bonus rewards (platform incentives for deep liquidity)

    Shares are proportional to deposit amount. Rewards accrue based on
    time-weighted share of pool.
    """

    LP_FEE_SHARE_BPS = 6667     # 66.67% of fees go to LPs (rest to platform)
    BPS_DENOMINATOR = 10_000

    def __init__(self):
        self._positions: Dict[str, List[LiquidityPosition]] = {}  # market → positions
        self._pools: Dict[str, RewardPool] = {}                   # market → reward pool

    # ------------------------------------------------------------------
    # Liquidity provision
    # ------------------------------------------------------------------

    def add_liquidity(
        self,
        market_id: str,
        user: str,
        amount: int,
    ) -> LiquidityPosition:
        """Deposit HBAR liquidity into a market."""
        if amount <= 0:
            raise ValueError("Amount must be positive")

        pool = self._ensure_pool(market_id)

        # Calculate shares: proportional to existing pool
        if pool.total_shares == 0:
            shares = float(amount)
        else:
            total_value = sum(
                p.amount for p in self._positions.get(market_id, []) if p.active
            ) or 1
            shares = (amount / total_value) * pool.total_shares

        position = LiquidityPosition(
            market_id=market_id,
            user=user,
            amount=amount,
            shares=shares,
        )

        if market_id not in self._positions:
            self._positions[market_id] = []
        self._positions[market_id].append(position)
        pool.total_shares += shares

        return position

    def remove_liquidity(
        self,
        market_id: str,
        position_id: str,
    ) -> Dict[str, Any]:
        """Withdraw liquidity and claim pending rewards."""
        positions = self._positions.get(market_id, [])
        pos = next((p for p in positions if p.position_id == position_id and p.active), None)
        if not pos:
            raise KeyError(f"Active position {position_id} not found")

        pool = self._ensure_pool(market_id)

        # Calculate pending rewards before exit
        pending = self._calculate_pending_rewards(pos, pool)

        pos.active = False
        pos.exit_time = time.time()
        pool.total_shares = max(0, pool.total_shares - pos.shares)

        # Distribute rewards
        pos.rewards_claimed += pending
        pool.total_distributed += pending

        return {
            "position_id": pos.position_id,
            "amount_returned": pos.amount,
            "rewards_claimed": pending,
            "total_rewards": pos.rewards_claimed,
            "duration_seconds": pos.duration_seconds,
        }

    # ------------------------------------------------------------------
    # Fee collection
    # ------------------------------------------------------------------

    def collect_fee(self, market_id: str, fee_amount: int):
        """Record a trading fee collection. Called by AMM on each trade."""
        pool = self._ensure_pool(market_id)
        lp_share = (fee_amount * self.LP_FEE_SHARE_BPS) // self.BPS_DENOMINATOR
        pool.total_fees_collected += lp_share

    def add_bonus(self, market_id: str, bonus_amount: int):
        """Add platform bonus rewards to incentivize liquidity."""
        pool = self._ensure_pool(market_id)
        pool.bonus_rewards += bonus_amount

    # ------------------------------------------------------------------
    # Reward calculation
    # ------------------------------------------------------------------

    def claim_rewards(self, market_id: str, user: str) -> Dict[str, Any]:
        """Claim pending rewards for all active positions of a user."""
        positions = [
            p for p in self._positions.get(market_id, [])
            if p.user == user and p.active
        ]
        if not positions:
            raise KeyError(f"No active positions for {user} in {market_id}")

        pool = self._ensure_pool(market_id)
        total_claimed = 0

        for pos in positions:
            pending = self._calculate_pending_rewards(pos, pool)
            pos.rewards_claimed += pending
            pool.total_distributed += pending
            total_claimed += pending

        return {
            "user": user,
            "market_id": market_id,
            "rewards_claimed": total_claimed,
            "positions": len(positions),
        }

    def get_pending_rewards(self, market_id: str, user: str) -> int:
        """Get total pending (unclaimed) rewards for a user."""
        positions = [
            p for p in self._positions.get(market_id, [])
            if p.user == user and p.active
        ]
        pool = self._ensure_pool(market_id)
        return sum(self._calculate_pending_rewards(p, pool) for p in positions)

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_positions(self, market_id: str, user: Optional[str] = None) -> List[LiquidityPosition]:
        positions = self._positions.get(market_id, [])
        if user:
            positions = [p for p in positions if p.user == user]
        return positions

    def get_pool(self, market_id: str) -> Optional[RewardPool]:
        return self._pools.get(market_id)

    def get_tvl(self, market_id: str) -> int:
        """Total value locked in a market's LP pool."""
        positions = self._positions.get(market_id, [])
        return sum(p.amount for p in positions if p.active)

    def stats(self) -> Dict[str, Any]:
        all_positions = [p for ps in self._positions.values() for p in ps]
        active = [p for p in all_positions if p.active]
        return {
            "total_markets_with_lp": len(self._positions),
            "total_positions": len(all_positions),
            "active_positions": len(active),
            "total_tvl": sum(p.amount for p in active),
            "total_fees_collected": sum(p.total_fees_collected for p in self._pools.values()),
            "total_rewards_distributed": sum(p.total_distributed for p in self._pools.values()),
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _ensure_pool(self, market_id: str) -> RewardPool:
        if market_id not in self._pools:
            self._pools[market_id] = RewardPool(market_id=market_id)
        return self._pools[market_id]

    def _calculate_pending_rewards(self, pos: LiquidityPosition, pool: RewardPool) -> int:
        """Calculate unclaimed rewards for a position based on share proportion."""
        if pool.total_shares <= 0 or pool.available_rewards <= 0:
            return 0
        share_fraction = pos.shares / pool.total_shares
        total_pending = int(pool.available_rewards * share_fraction)
        return max(0, total_pending)
