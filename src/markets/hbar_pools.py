"""
HBAR Pool Markets — simple winner-takes-pool prediction markets.

Users stake HBAR directly into outcome pools.  When the market resolves,
winners split the total pool proportionally to their stakes.  Uses the
existing RewardAgent for payout calculation and attestation signing.
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class PoolStake:
    """A single stake in an HBAR pool."""
    stake_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    market_id: str = ""
    user: str = ""
    outcome: str = ""
    amount: int = 0          # tinybar
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stake_id": self.stake_id,
            "market_id": self.market_id,
            "user": self.user,
            "outcome": self.outcome,
            "amount": self.amount,
            "timestamp": self.timestamp,
        }


@dataclass
class PoolState:
    """Aggregate pool state for one market."""
    market_id: str = ""
    pools: Dict[str, int] = field(default_factory=dict)       # outcome → total tinybar
    stakes: List[PoolStake] = field(default_factory=list)
    settled: bool = False
    winning_outcome: Optional[str] = None
    payouts: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def total_pool(self) -> int:
        return sum(self.pools.values())

    def odds(self) -> Dict[str, float]:
        """Implied odds per outcome from pool sizes."""
        total = self.total_pool or 1
        return {o: round(v / total, 6) for o, v in self.pools.items()}

    def pool_hash(self) -> str:
        payload = {
            "market_id": self.market_id,
            "pools": self.pools,
            "stake_count": len(self.stakes),
            "total_pool": self.total_pool,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "market_id": self.market_id,
            "pools": self.pools,
            "total_pool": self.total_pool,
            "odds": self.odds(),
            "stake_count": len(self.stakes),
            "settled": self.settled,
            "winning_outcome": self.winning_outcome,
        }


class HBARPoolManager:
    """
    Manages simple HBAR-staked prediction pools.

    Flow:
    1. create_pool(market_id, outcomes)
    2. stake(market_id, outcome, amount, user) — repeatable
    3. settle(market_id, winning_outcome) → payouts
    """

    PLATFORM_FEE_BPS = 50       # 0.5 %
    BPS_DENOMINATOR = 10_000

    def __init__(self):
        self._pools: Dict[str, PoolState] = {}

    # ------------------------------------------------------------------
    # Pool lifecycle
    # ------------------------------------------------------------------

    def create_pool(self, market_id: str, outcomes: List[str]) -> PoolState:
        """Initialize empty outcome pools for a market."""
        if market_id in self._pools:
            raise ValueError(f"Pool already exists for market {market_id}")
        if len(outcomes) < 2:
            raise ValueError("Need at least 2 outcomes")

        state = PoolState(
            market_id=market_id,
            pools={o: 0 for o in outcomes},
        )
        self._pools[market_id] = state
        return state

    def stake(
        self,
        market_id: str,
        outcome: str,
        amount: int,
        user: str,
    ) -> PoolStake:
        """Stake HBAR into an outcome pool."""
        state = self._require_pool(market_id)
        if state.settled:
            raise ValueError("Pool is already settled")
        if outcome not in state.pools:
            raise ValueError(f"Invalid outcome '{outcome}'")
        if amount <= 0:
            raise ValueError("Stake amount must be positive")

        entry = PoolStake(
            market_id=market_id,
            user=user,
            outcome=outcome,
            amount=amount,
        )
        state.stakes.append(entry)
        state.pools[outcome] += amount
        return entry

    def get_pool(self, market_id: str) -> Optional[PoolState]:
        return self._pools.get(market_id)

    def get_odds(self, market_id: str) -> Dict[str, float]:
        """Current implied odds from pool sizes."""
        return self._require_pool(market_id).odds()

    def get_user_stakes(self, market_id: str, user: str) -> List[PoolStake]:
        state = self._require_pool(market_id)
        return [s for s in state.stakes if s.user == user]

    # ------------------------------------------------------------------
    # Settlement
    # ------------------------------------------------------------------

    def settle(self, market_id: str, winning_outcome: str) -> Dict[str, Any]:
        """
        Settle the pool: calculate payouts to winners proportional to stake.

        Returns settlement summary with per-user payouts and proof hash.
        """
        state = self._require_pool(market_id)
        if state.settled:
            raise ValueError("Pool already settled")
        if winning_outcome not in state.pools:
            raise ValueError(f"Invalid winning outcome '{winning_outcome}'")

        total = state.total_pool
        if total == 0:
            state.settled = True
            state.winning_outcome = winning_outcome
            return {"market_id": market_id, "payouts": [], "fee": 0, "total_pool": 0}

        # Platform fee
        fee = (total * self.PLATFORM_FEE_BPS) // self.BPS_DENOMINATOR
        distributable = total - fee

        # Winning stakes
        winners = [s for s in state.stakes if s.outcome == winning_outcome]
        winning_pool = state.pools.get(winning_outcome, 0)

        payouts: List[Dict[str, Any]] = []
        if winning_pool > 0 and winners:
            for s in winners:
                share = s.amount / winning_pool
                payout_amount = int(distributable * share)
                payouts.append({
                    "user": s.user,
                    "stake": s.amount,
                    "payout": payout_amount,
                    "profit": payout_amount - s.amount,
                    "share": round(share, 6),
                })
        else:
            # No winners — refund all stakes minus fee
            for s in state.stakes:
                refund = int(s.amount * (distributable / total))
                payouts.append({
                    "user": s.user,
                    "stake": s.amount,
                    "payout": refund,
                    "profit": refund - s.amount,
                    "share": 0.0,
                })

        state.settled = True
        state.winning_outcome = winning_outcome
        state.payouts = payouts

        # Settlement proof
        settlement_hash = hashlib.sha256(json.dumps({
            "market_id": market_id,
            "winning_outcome": winning_outcome,
            "total_pool": total,
            "fee": fee,
            "payouts": payouts,
            "timestamp": time.time(),
        }, sort_keys=True).encode()).hexdigest()

        return {
            "market_id": market_id,
            "winning_outcome": winning_outcome,
            "total_pool": total,
            "fee": fee,
            "distributable": distributable,
            "payouts": payouts,
            "winner_count": len(winners),
            "settlement_hash": settlement_hash,
        }

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def stats(self) -> Dict[str, Any]:
        pools = list(self._pools.values())
        return {
            "total_pools": len(pools),
            "active_pools": sum(1 for p in pools if not p.settled),
            "settled_pools": sum(1 for p in pools if p.settled),
            "total_staked": sum(p.total_pool for p in pools),
            "total_stakes": sum(len(p.stakes) for p in pools),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _require_pool(self, market_id: str) -> PoolState:
        pool = self._pools.get(market_id)
        if not pool:
            raise KeyError(f"No pool for market {market_id}")
        return pool
