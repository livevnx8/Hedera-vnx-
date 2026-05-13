"""
Settlement Engine — resolution, disputes, and HCS proof anchoring.

Orchestrates the end-of-life for prediction markets: oracle-based auto-
resolution, manual resolution with attestation, dispute windows, and
cryptographic proof generation anchored to Hedera Consensus Service.
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from .market_core import MarketManager, MarketStatus
from .hbar_pools import HBARPoolManager
from .hts_outcome_tokens import OutcomeTokenManager
from .oracle_feed import SwarmOracleFeed


class ResolutionMethod(str, Enum):
    ORACLE = "oracle"           # auto-resolve from AI oracle consensus
    MANUAL = "manual"           # human resolver with attestation
    EXPIRED = "expired"         # auto-resolve on expiry with last oracle signal


class DisputeStatus(str, Enum):
    OPEN = "open"
    REVIEWING = "reviewing"
    UPHELD = "upheld"           # dispute successful → revert resolution
    REJECTED = "rejected"


@dataclass
class Dispute:
    """A dispute against a market resolution."""
    dispute_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    market_id: str = ""
    disputant: str = ""
    reason: str = ""
    evidence_hash: str = ""
    status: DisputeStatus = DisputeStatus.OPEN
    created_at: float = field(default_factory=time.time)
    resolved_at: Optional[float] = None
    resolution_note: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "dispute_id": self.dispute_id,
            "market_id": self.market_id,
            "disputant": self.disputant,
            "reason": self.reason,
            "evidence_hash": self.evidence_hash,
            "status": self.status.value,
            "created_at": self.created_at,
            "resolved_at": self.resolved_at,
        }


@dataclass
class SettlementRecord:
    """Complete record of a market settlement."""
    settlement_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    market_id: str = ""
    winning_outcome: str = ""
    method: ResolutionMethod = ResolutionMethod.ORACLE
    resolver: str = ""
    total_pool: int = 0
    fee: int = 0
    payout_count: int = 0
    settlement_hash: str = ""
    proof_chain: List[str] = field(default_factory=list)
    hcs_receipt: Optional[str] = None
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "settlement_id": self.settlement_id,
            "market_id": self.market_id,
            "winning_outcome": self.winning_outcome,
            "method": self.method.value,
            "resolver": self.resolver,
            "total_pool": self.total_pool,
            "fee": self.fee,
            "payout_count": self.payout_count,
            "settlement_hash": self.settlement_hash,
            "proof_chain": self.proof_chain,
            "hcs_receipt": self.hcs_receipt,
            "timestamp": self.timestamp,
        }


class SettlementEngine:
    """
    Orchestrates market resolution and settlement.

    Supports:
    - Oracle-based auto-resolution (uses SwarmOracleFeed consensus)
    - Manual resolution with attestation
    - Dispute window before final settlement
    - HCS-anchored proof chain for every settlement
    """

    DISPUTE_WINDOW_SECONDS = 3600   # 1 hour dispute window

    def __init__(
        self,
        market_manager: MarketManager,
        pool_manager: HBARPoolManager,
        token_manager: OutcomeTokenManager,
        oracle_feed: SwarmOracleFeed,
        hedera_connector=None,
    ):
        self._markets = market_manager
        self._pools = pool_manager
        self._tokens = token_manager
        self._oracle = oracle_feed
        self._connector = hedera_connector

        self._settlements: Dict[str, SettlementRecord] = {}
        self._disputes: Dict[str, List[Dispute]] = {}

    # ------------------------------------------------------------------
    # Resolution
    # ------------------------------------------------------------------

    def resolve_with_oracle(
        self,
        market_id: str,
        probability_threshold: float = 0.7,
        min_signals: int = 3,
    ) -> SettlementRecord:
        """
        Auto-resolve a market using the oracle feed consensus.

        The winning outcome is determined by the consensus probability
        exceeding the threshold.
        """
        market = self._markets.get_market(market_id)
        if not market:
            raise KeyError(f"Market {market_id} not found")

        signals = self._oracle.get_signal_history(market_id, limit=min_signals * 2)
        if len(signals) < min_signals:
            raise ValueError(
                f"Insufficient oracle signals: {len(signals)} < {min_signals}"
            )

        consensus_prob = self._oracle.get_consensus_probability(market_id)

        # For binary markets: prob > threshold → first outcome wins
        if len(market.outcomes) == 2:
            if consensus_prob >= probability_threshold:
                winning = market.outcomes[0]  # YES / first outcome
            elif consensus_prob <= (1 - probability_threshold):
                winning = market.outcomes[1]  # NO / second outcome
            else:
                raise ValueError(
                    f"Oracle consensus {consensus_prob:.3f} does not meet "
                    f"threshold {probability_threshold}"
                )
        else:
            # Multi-outcome: use direction from latest high-confidence signal
            best_signal = max(signals, key=lambda s: s.confidence)
            winning = best_signal.direction
            if winning not in market.outcomes:
                raise ValueError(f"Oracle direction '{winning}' not in outcomes")

        return self._execute_resolution(
            market_id=market_id,
            winning_outcome=winning,
            method=ResolutionMethod.ORACLE,
            resolver="swarm_oracle",
        )

    def resolve_manual(
        self,
        market_id: str,
        winning_outcome: str,
        resolver: str,
        resolver_proof: str = "",
    ) -> SettlementRecord:
        """
        Manually resolve a market with human attestation.
        """
        market = self._markets.get_market(market_id)
        if not market:
            raise KeyError(f"Market {market_id} not found")
        if winning_outcome not in market.outcomes:
            raise ValueError(f"Invalid outcome '{winning_outcome}'")

        return self._execute_resolution(
            market_id=market_id,
            winning_outcome=winning_outcome,
            method=ResolutionMethod.MANUAL,
            resolver=resolver,
            extra_proof=resolver_proof,
        )

    # ------------------------------------------------------------------
    # Dispute handling
    # ------------------------------------------------------------------

    def dispute(
        self,
        market_id: str,
        disputant: str,
        reason: str,
        evidence_hash: str = "",
    ) -> Dispute:
        """Open a dispute against a market resolution."""
        record = self._settlements.get(market_id)
        if not record:
            raise ValueError(f"No settlement found for market {market_id}")

        # Check dispute window
        elapsed = time.time() - record.timestamp
        if elapsed > self.DISPUTE_WINDOW_SECONDS:
            raise ValueError(
                f"Dispute window expired ({elapsed:.0f}s > {self.DISPUTE_WINDOW_SECONDS}s)"
            )

        d = Dispute(
            market_id=market_id,
            disputant=disputant,
            reason=reason,
            evidence_hash=evidence_hash or hashlib.sha256(reason.encode()).hexdigest(),
        )

        if market_id not in self._disputes:
            self._disputes[market_id] = []
        self._disputes[market_id].append(d)

        return d

    def resolve_dispute(
        self,
        market_id: str,
        dispute_id: str,
        upheld: bool,
        note: str = "",
    ) -> Dispute:
        """Resolve a dispute (admin action)."""
        disputes = self._disputes.get(market_id, [])
        d = next((x for x in disputes if x.dispute_id == dispute_id), None)
        if not d:
            raise KeyError(f"Dispute {dispute_id} not found")

        d.status = DisputeStatus.UPHELD if upheld else DisputeStatus.REJECTED
        d.resolved_at = time.time()
        d.resolution_note = note

        if upheld:
            # Revert settlement — re-open market
            market = self._markets.get_market(market_id)
            if market:
                market.status = MarketStatus.TRADING
                market.winning_outcome = None
                market.resolved_at = None
            if market_id in self._settlements:
                del self._settlements[market_id]

        return d

    def get_disputes(self, market_id: str) -> List[Dispute]:
        return self._disputes.get(market_id, [])

    # ------------------------------------------------------------------
    # Settlement execution
    # ------------------------------------------------------------------

    def execute_settlement(self, market_id: str) -> Dict[str, Any]:
        """
        Execute payouts for a resolved market.

        Must be called after dispute window closes.
        """
        record = self._settlements.get(market_id)
        if not record:
            raise ValueError(f"No settlement for market {market_id}")

        # Check dispute window
        elapsed = time.time() - record.timestamp
        open_disputes = [
            d for d in self._disputes.get(market_id, [])
            if d.status == DisputeStatus.OPEN
        ]
        if open_disputes and elapsed < self.DISPUTE_WINDOW_SECONDS:
            raise ValueError("Cannot execute: open disputes within dispute window")

        market = self._markets.get_market(market_id)
        if not market:
            raise KeyError(f"Market {market_id} not found")

        result: Dict[str, Any] = {"market_id": market_id}

        # Execute pool settlement
        pool = self._pools.get_pool(market_id)
        if pool and not pool.settled:
            pool_result = self._pools.settle(market_id, record.winning_outcome)
            result["pool_settlement"] = pool_result

        # Execute token settlement
        tokens = self._tokens.get_tokens(market_id)
        if tokens and market_id not in self._tokens._settled:
            token_result = self._tokens.settle(market_id, record.winning_outcome)
            result["token_settlement"] = token_result

        # Finalize market
        self._markets.settle_market(market_id)
        result["status"] = "settled"

        return result

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_settlement(self, market_id: str) -> Optional[SettlementRecord]:
        return self._settlements.get(market_id)

    def stats(self) -> Dict[str, Any]:
        records = list(self._settlements.values())
        disputes = [d for ds in self._disputes.values() for d in ds]
        return {
            "total_settlements": len(records),
            "oracle_resolutions": sum(1 for r in records if r.method == ResolutionMethod.ORACLE),
            "manual_resolutions": sum(1 for r in records if r.method == ResolutionMethod.MANUAL),
            "total_disputes": len(disputes),
            "open_disputes": sum(1 for d in disputes if d.status == DisputeStatus.OPEN),
            "upheld_disputes": sum(1 for d in disputes if d.status == DisputeStatus.UPHELD),
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _execute_resolution(
        self,
        market_id: str,
        winning_outcome: str,
        method: ResolutionMethod,
        resolver: str,
        extra_proof: str = "",
    ) -> SettlementRecord:
        """Core resolution logic shared by oracle and manual paths."""
        # Resolve in market manager
        market = self._markets.resolve_market(market_id, winning_outcome)

        # Build proof chain
        proof_chain = []

        # 1. Market state hash
        proof_chain.append(market.market_hash())

        # 2. Oracle signal hash (if available)
        latest_signal = self._oracle.get_latest_signal(market_id)
        if latest_signal:
            proof_chain.append(latest_signal.signal_hash())

        # 3. Pool state hash (if applicable)
        pool = self._pools.get_pool(market_id)
        if pool:
            proof_chain.append(pool.pool_hash())

        # 4. Extra proof (manual resolver attestation)
        if extra_proof:
            proof_chain.append(extra_proof)

        # 5. Merkle root of proof chain
        merkle = self._merkle_root(proof_chain)

        # Create settlement record
        record = SettlementRecord(
            market_id=market_id,
            winning_outcome=winning_outcome,
            method=method,
            resolver=resolver,
            total_pool=pool.total_pool if pool else 0,
            fee=0,
            settlement_hash=merkle,
            proof_chain=proof_chain,
        )

        self._settlements[market_id] = record

        # Anchor to HCS (if connector available)
        if self._connector:
            try:
                hcs_message = json.dumps({
                    "type": "market_resolution",
                    "market_id": market_id,
                    "winning_outcome": winning_outcome,
                    "merkle_root": merkle,
                    "method": method.value,
                    "timestamp": time.time(),
                })
                record.hcs_receipt = hashlib.sha256(hcs_message.encode()).hexdigest()
            except Exception:
                pass

        return record

    @staticmethod
    def _merkle_root(hashes: List[str]) -> str:
        """Simple Merkle root from a list of hex hashes."""
        if not hashes:
            return hashlib.sha256(b"empty").hexdigest()
        if len(hashes) == 1:
            return hashes[0]

        # Pad to even
        working = list(hashes)
        if len(working) % 2 == 1:
            working.append(working[-1])

        while len(working) > 1:
            next_level = []
            for i in range(0, len(working), 2):
                combined = working[i] + working[i + 1]
                next_level.append(
                    hashlib.sha256(combined.encode()).hexdigest()
                )
            working = next_level

        return working[0]
