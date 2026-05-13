#!/usr/bin/env python3
"""
Reward Agent Specialist for Hedera Prediction Market.

Calculates rewards after market resolution, produces signed payout attestations.
"""

import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional


@dataclass
class PayoutEntry:
    """Single winner payout."""
    address: str
    bet_amount: int
    payout_amount: int
    share_percent: float


@dataclass
class RewardResult:
    """Result of reward calculation."""
    market_id: int
    outcome: str
    total_pool: int
    winning_pool: int
    platform_fee: int
    total_distributed: int
    payouts: List[PayoutEntry] = field(default_factory=list)
    attestation: Optional[str] = None
    timestamp: float = 0.0
    agent_id: str = ""
    valid: bool = True
    reason: str = ""


class RewardAgent:
    """
    Specialist that calculates and distributes rewards after market resolution.

    Reward calculation:
    1. Identify winning pool (all bets on correct direction)
    2. Calculate total pool = winning + losing
    3. Platform fee = 0.5% of total pool
    4. Distribute remaining proportionally to winners based on bet size
    5. Sign payout attestation
    """

    PLATFORM_FEE_BPS = 50  # 0.5% = 50 basis points
    BPS_DENOMINATOR = 10000

    def __init__(self, secret_key: Optional[str] = None):
        """Initialize reward agent with HMAC signing key."""
        if secret_key:
            self.secret_key = secret_key.encode()
        else:
            self.secret_key = hashlib.sha256(b"reward_demo_seed").digest()

        self.agent_id = f"reward_{self.secret_key[:4].hex()}"

    def _hash_payout(self, market_id: int, outcome: str, total_pool: int,
                     fee: int, payouts: List[Dict], timestamp: float) -> bytes:
        """Create deterministic hash for payout attestation."""
        data = {
            "market_id": market_id,
            "outcome": outcome,
            "total_pool": total_pool,
            "fee": fee,
            "payouts": payouts,
            "timestamp": f"{timestamp:.6f}",
            "agent_id": self.agent_id,
        }
        return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).digest()

    def _sign_payout(self, data_hash: bytes) -> str:
        """Sign payout attestation with HMAC."""
        signature = hmac.new(self.secret_key, data_hash, hashlib.sha256).hexdigest()
        return signature

    def verify_payout_attestation(self, market_id: int, outcome: str, total_pool: int,
                                   fee: int, payouts: List[Dict], timestamp: float,
                                   signature_hex: str, secret_key: str) -> bool:
        """Verify a payout attestation signature."""
        try:
            data_hash = self._hash_payout(market_id, outcome, total_pool, fee, payouts, timestamp)
            key_bytes = bytes.fromhex(secret_key) if len(secret_key) == 64 else secret_key.encode()
            expected = hmac.new(key_bytes, data_hash, hashlib.sha256).hexdigest()
            return hmac.compare_digest(expected, signature_hex)
        except Exception:
            return False

    def calculate_rewards(self, market_id: int, outcome: str,
                          bids: List[Dict[str, Any]]) -> RewardResult:
        """
        Calculate rewards for a resolved market.

        Args:
            market_id: Market identifier
            outcome: "UP" or "DOWN" (winning direction)
            bids: List of {bidder, direction, amount} dicts

        Returns:
            RewardResult with payouts and attestation
        """
        timestamp = time.time()

        # Separate winning and losing bets
        winning_bets = [b for b in bids if b["direction"] == outcome]
        losing_bets = [b for b in bids if b["direction"] != outcome]

        if not winning_bets:
            return RewardResult(
                market_id=market_id,
                outcome=outcome,
                total_pool=0,
                winning_pool=0,
                platform_fee=0,
                total_distributed=0,
                valid=False,
                reason="No winning bets - no payouts",
                timestamp=timestamp,
                agent_id=self.agent_id
            )

        winning_pool = sum(b["amount"] for b in winning_bets)
        losing_pool = sum(b["amount"] for b in losing_bets)
        total_pool = winning_pool + losing_pool

        # Platform fee
        platform_fee = (total_pool * self.PLATFORM_FEE_BPS) // self.BPS_DENOMINATOR
        distributable = total_pool - platform_fee

        # Distribute proportionally to winners
        payouts = []
        total_distributed = 0

        for bet in winning_bets:
            if winning_pool > 0:
                share = bet["amount"] / winning_pool
                payout = int(distributable * share)
            else:
                payout = 0

            payouts.append(PayoutEntry(
                address=bet["bidder"],
                bet_amount=bet["amount"],
                payout_amount=payout,
                share_percent=round(share * 100, 2) if winning_pool > 0 else 0
            ))
            total_distributed += payout

        # Sign attestation
        payout_dicts = [
            {"address": p.address, "bet": p.bet_amount, "payout": p.payout_amount}
            for p in payouts
        ]
        data_hash = self._hash_payout(market_id, outcome, total_pool, platform_fee, payout_dicts, timestamp)
        attestation = self._sign_payout(data_hash)

        return RewardResult(
            market_id=market_id,
            outcome=outcome,
            total_pool=total_pool,
            winning_pool=winning_pool,
            platform_fee=platform_fee,
            total_distributed=total_distributed,
            payouts=payouts,
            attestation=attestation,
            timestamp=timestamp,
            agent_id=self.agent_id,
            valid=True,
            reason="Rewards calculated successfully"
        )

    def to_dict(self, result: RewardResult) -> Dict[str, Any]:
        """Serialize reward result to dict."""
        return {
            "valid": result.valid,
            "reason": result.reason,
            "market_id": result.market_id,
            "outcome": result.outcome,
            "total_pool": result.total_pool,
            "winning_pool": result.winning_pool,
            "platform_fee": result.platform_fee,
            "fee_percent": f"{self.PLATFORM_FEE_BPS / self.BPS_DENOMINATOR * 100}%",
            "total_distributed": result.total_distributed,
            "payouts": [
                {
                    "address": p.address,
                    "bet_amount": p.bet_amount,
                    "payout_amount": p.payout_amount,
                    "share_percent": p.share_percent,
                }
                for p in result.payouts
            ],
            "attestation": result.attestation,
            "timestamp": result.timestamp,
            "agent_id": result.agent_id,
            "agent_secret_hash": self.secret_key[:16].hex(),
        }

    def get_secret_key(self) -> str:
        """Get agent's secret key for attestation verification."""
        return self.secret_key.hex()


if __name__ == "__main__":
    print("=" * 60)
    print("REWARD AGENT SPECIALIST")
    print("=" * 60)

    agent = RewardAgent()
    print(f"Agent ID: {agent.agent_id}")
    print(f"Secret Key Hash: {agent.get_secret_key()[:16]}...")

    # Test market with mixed bets
    print("\n[1] Calculating rewards for resolved market...")
    bids = [
        {"bidder": "0.0.1001", "direction": "UP", "amount": 1_000_000_000},   # 10 HBAR
        {"bidder": "0.0.1002", "direction": "DOWN", "amount": 500_000_000},  # 5 HBAR
        {"bidder": "0.0.1003", "direction": "UP", "amount": 2_000_000_000},   # 20 HBAR
        {"bidder": "0.0.1004", "direction": "UP", "amount": 500_000_000},   # 5 HBAR
        {"bidder": "0.0.1005", "direction": "DOWN", "amount": 1_000_000_000}, # 10 HBAR
    ]

    result = agent.calculate_rewards(
        market_id=0,
        outcome="UP",
        bids=bids
    )

    print(f"  Valid: {result.valid}")
    print(f"  Total Pool: {result.total_pool:,} tinybars ({result.total_pool / 1e8:.1f} HBAR)")
    print(f"  Winning Pool: {result.winning_pool:,} tinybars")
    print(f"  Platform Fee: {result.platform_fee:,} tinybars ({result.platform_fee / result.total_pool * 100:.2f}%)")
    print(f"  Distributed: {result.total_distributed:,} tinybars")
    print(f"  Winners: {len(result.payouts)}")

    for p in result.payouts:
        print(f"    {p.address}: bet {p.bet_amount / 1e8:.1f} HBAR → payout {p.payout_amount / 1e8:.1f} HBAR ({p.share_percent}%)")

    print(f"  Attestation: {result.attestation[:64]}..." if result.attestation else "  None")

    # Verify attestation
    print("\n[2] Verifying payout attestation...")
    payout_dicts = [
        {"address": p.address, "bet": p.bet_amount, "payout": p.payout_amount}
        for p in result.payouts
    ]
    is_valid = agent.verify_payout_attestation(
        result.market_id, result.outcome, result.total_pool,
        result.platform_fee, payout_dicts, result.timestamp,
        result.attestation, agent.get_secret_key()
    )
    print(f"  Attestation valid: {is_valid}")

    # Test edge case: no winners
    print("\n[3] Testing no winners scenario...")
    result2 = agent.calculate_rewards(
        market_id=1,
        outcome="DOWN",
        bids=[b for b in bids if b["direction"] == "UP"]  # All bets are UP, outcome is DOWN
    )
    print(f"  Valid: {result2.valid}")
    print(f"  Reason: {result2.reason}")

    print("\n" + "=" * 60)
    print("REWARD AGENT TESTS COMPLETE")
    print("=" * 60)
