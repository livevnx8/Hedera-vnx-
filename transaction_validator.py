#!/usr/bin/env python3
"""
Transaction Validator Specialist for Hedera Prediction Market.

Validates bids off-chain, produces signed attestations for on-chain settlement.
"""

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Any, Optional


@dataclass
class ValidationResult:
    """Result of bid validation."""
    valid: bool
    reason: str
    market_id: int
    bidder: str
    direction: str
    amount: int
    attestation: Optional[str] = None
    timestamp: float = 0.0
    validator_id: str = "validator_001"


class TransactionValidator:
    """
    Specialist that validates prediction market bids before they reach the smart contract.

    Checks:
    - Minimum bet amount (1 HBAR = 100M tinybars)
    - Market is active (not expired, not resolved)
    - Bidder hasn't already bet on this market
    - Direction is valid (UP/DOWN)
    - Token is supported
    """

    def __init__(self, secret_key: Optional[str] = None):
        """
        Initialize validator with HMAC signing key.

        Args:
            secret_key: Secret key for HMAC attestations.
                       If None, generates a random key (for demo only).
        """
        if secret_key:
            self.secret_key = secret_key.encode()
        else:
            # Generate demo key - DO NOT USE IN PRODUCTION
            self.secret_key = hashlib.sha256(b"validator_demo_seed").digest()

        self.validator_id = f"validator_{self.secret_key[:4].hex()}"

        # In-memory market state (in production, query contract or DB)
        self.market_state = {}
        self.bid_registry = {}  # market_id -> set of bidder addresses

    def _hash_attestation(self, market_id: int, bidder: str, direction: str,
                          amount: int, timestamp: float) -> bytes:
        """Create deterministic hash for attestation."""
        data = f"{market_id}:{bidder}:{direction}:{amount}:{timestamp:.6f}:{self.validator_id}"
        return hashlib.sha256(data.encode()).digest()

    def _sign_attestation(self, data_hash: bytes) -> str:
        """Sign attestation with HMAC."""
        signature = hmac.new(self.secret_key, data_hash, hashlib.sha256).hexdigest()
        return signature

    def verify_attestation(self, market_id: int, bidder: str, direction: str,
                          amount: int, timestamp: float, signature_hex: str,
                          secret_key: str) -> bool:
        """Verify an attestation signature."""
        try:
            data_hash = self._hash_attestation(market_id, bidder, direction, amount, timestamp)
            key_bytes = bytes.fromhex(secret_key) if len(secret_key) == 64 else secret_key.encode()
            expected = hmac.new(key_bytes, data_hash, hashlib.sha256).hexdigest()
            return hmac.compare_digest(expected, signature_hex)
        except Exception:
            return False

    def validate_bid(self, market_id: int, bidder: str, direction: str,
                     amount: int, current_time: Optional[float] = None) -> ValidationResult:
        """
        Validate a bid and produce signed attestation.

        Args:
            market_id: Market identifier
            bidder: Bidder address (0.0.xxx format)
            direction: "UP" or "DOWN"
            amount: Bet amount in tinybars
            current_time: Unix timestamp (defaults to now)

        Returns:
            ValidationResult with attestation if valid
        """
        timestamp = current_time or time.time()

        # Check 1: Minimum bet
        MIN_BET = 100_000_000  # 1 HBAR
        if amount < MIN_BET:
            return ValidationResult(
                valid=False,
                reason=f"Bet too small: {amount} tinybars (min: {MIN_BET})",
                market_id=market_id, bidder=bidder, direction=direction, amount=amount,
                timestamp=timestamp, validator_id=self.validator_id
            )

        # Check 2: Valid direction
        if direction not in ("UP", "DOWN"):
            return ValidationResult(
                valid=False,
                reason=f"Invalid direction: {direction} (must be UP or DOWN)",
                market_id=market_id, bidder=bidder, direction=direction, amount=amount,
                timestamp=timestamp, validator_id=self.validator_id
            )

        # Check 3: Market exists and is active
        market = self.market_state.get(market_id)
        if not market:
            # For demo, auto-create market
            self.market_state[market_id] = {
                "token": "hbar",
                "end_time": timestamp + 86400,
                "resolved": False,
                "total_up": 0,
                "total_down": 0,
            }
            market = self.market_state[market_id]

        if market.get("resolved", False):
            return ValidationResult(
                valid=False,
                reason="Market already resolved",
                market_id=market_id, bidder=bidder, direction=direction, amount=amount,
                timestamp=timestamp, validator_id=self.validator_id
            )

        if timestamp > market.get("end_time", 0):
            return ValidationResult(
                valid=False,
                reason="Market expired",
                market_id=market_id, bidder=bidder, direction=direction, amount=amount,
                timestamp=timestamp, validator_id=self.validator_id
            )

        # Check 4: Bidder hasn't already bet
        if market_id not in self.bid_registry:
            self.bid_registry[market_id] = set()

        if bidder in self.bid_registry[market_id]:
            return ValidationResult(
                valid=False,
                reason="Bidder already placed bet on this market",
                market_id=market_id, bidder=bidder, direction=direction, amount=amount,
                timestamp=timestamp, validator_id=self.validator_id
            )

        # Check 5: Supported token
        supported_tokens = {"hbar", "sauce", "dovu"}
        if market.get("token", "hbar").lower() not in supported_tokens:
            return ValidationResult(
                valid=False,
                reason=f"Token not supported: {market.get('token')}",
                market_id=market_id, bidder=bidder, direction=direction, amount=amount,
                timestamp=timestamp, validator_id=self.validator_id
            )

        # All checks passed - register bid and sign attestation
        self.bid_registry[market_id].add(bidder)

        if direction == "UP":
            market["total_up"] = market.get("total_up", 0) + amount
        else:
            market["total_down"] = market.get("total_down", 0) + amount

        # Sign attestation
        data_hash = self._hash_attestation(market_id, bidder, direction, amount, timestamp)
        signature = self._sign_attestation(data_hash)

        return ValidationResult(
            valid=True,
            reason="Bid validated successfully",
            market_id=market_id,
            bidder=bidder,
            direction=direction,
            amount=amount,
            attestation=signature,
            timestamp=timestamp,
            validator_id=self.validator_id
        )

    def get_market_state(self, market_id: int) -> Dict[str, Any]:
        """Get current market state."""
        return self.market_state.get(market_id, {})

    def get_secret_key(self) -> str:
        """Get validator's secret key for attestation verification."""
        return self.secret_key.hex()

    def to_dict(self, result: ValidationResult) -> Dict[str, Any]:
        """Serialize validation result to dict."""
        return {
            "valid": result.valid,
            "reason": result.reason,
            "market_id": result.market_id,
            "bidder": result.bidder,
            "direction": result.direction,
            "amount": result.amount,
            "attestation": result.attestation,
            "timestamp": result.timestamp,
            "validator_id": result.validator_id,
            "validator_secret_hash": self.get_secret_key()[:16],
        }


if __name__ == "__main__":
    print("=" * 60)
    print("TRANSACTION VALIDATOR SPECIALIST")
    print("=" * 60)

    validator = TransactionValidator()
    print(f"Validator ID: {validator.validator_id}")
    print(f"Public Key: {validator.get_public_key()[:32]}...")

    # Test valid bid
    print("\n[1] Testing valid bid...")
    result = validator.validate_bid(
        market_id=0,
        bidder="0.0.1234",
        direction="UP",
        amount=500_000_000  # 5 HBAR
    )
    print(f"  Valid: {result.valid}")
    print(f"  Reason: {result.reason}")
    print(f"  Attestation: {result.attestation[:64]}..." if result.attestation else "  None")

    # Test duplicate bid
    print("\n[2] Testing duplicate bid...")
    result2 = validator.validate_bid(
        market_id=0,
        bidder="0.0.1234",
        direction="DOWN",
        amount=500_000_000
    )
    print(f"  Valid: {result2.valid}")
    print(f"  Reason: {result2.reason}")

    # Test invalid direction
    print("\n[3] Testing invalid direction...")
    result3 = validator.validate_bid(
        market_id=0,
        bidder="0.0.5678",
        direction="SIDEWAYS",
        amount=500_000_000
    )
    print(f"  Valid: {result3.valid}")
    print(f"  Reason: {result3.reason}")

    # Test minimum bet
    print("\n[4] Testing minimum bet...")
    result4 = validator.validate_bid(
        market_id=0,
        bidder="0.0.9999",
        direction="UP",
        amount=50_000_000  # 0.5 HBAR
    )
    print(f"  Valid: {result4.valid}")
    print(f"  Reason: {result4.reason}")

    # Verify attestation
    print("\n[5] Verifying attestation...")
    if result.attestation:
        is_valid = validator.verify_attestation(
            result.market_id, result.bidder, result.direction,
            result.amount, result.timestamp, result.attestation,
            validator.get_secret_key()
        )
        print(f"  Attestation valid: {is_valid}")

    print("\n" + "=" * 60)
    print("VALIDATOR TESTS COMPLETE")
    print("=" * 60)
