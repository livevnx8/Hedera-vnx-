"""
HTS Outcome Token Markets — AMM-based prediction markets using Hedera Token Service.

Each market mints fungible outcome tokens (e.g. YES-HBAR-UP, NO-HBAR-UP).
Users buy/sell outcome tokens through a constant-product AMM.  At settlement,
winning tokens redeem at 1 unit of collateral; losing tokens expire worthless.
"""

import hashlib
import json
import math
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class OutcomeToken:
    """Represents one HTS outcome token for a market."""
    token_id: str = field(default_factory=lambda: f"0.0.{uuid.uuid4().int % 10_000_000}")
    market_id: str = ""
    outcome: str = ""
    name: str = ""
    symbol: str = ""
    total_supply: int = 0
    reserve: int = 0              # AMM reserve for this outcome
    decimals: int = 8

    def to_dict(self) -> Dict[str, Any]:
        return {
            "token_id": self.token_id,
            "market_id": self.market_id,
            "outcome": self.outcome,
            "name": self.name,
            "symbol": self.symbol,
            "total_supply": self.total_supply,
            "reserve": self.reserve,
        }


@dataclass
class TokenPosition:
    """A user's position in outcome tokens."""
    user: str = ""
    market_id: str = ""
    outcome: str = ""
    balance: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user": self.user,
            "market_id": self.market_id,
            "outcome": self.outcome,
            "balance": self.balance,
        }


@dataclass
class AMMState:
    """Constant-product AMM state for a market."""
    market_id: str = ""
    collateral_reserve: int = 0   # HBAR collateral in tinybar
    outcome_reserves: Dict[str, int] = field(default_factory=dict)  # outcome → reserve
    k: int = 0                    # product invariant (for binary: reserve_yes * reserve_no)
    fee_bps: int = 30             # 0.3% swap fee
    total_fees_collected: int = 0

    def price(self, outcome: str) -> float:
        """Current price of an outcome token (0.0–1.0)."""
        if outcome not in self.outcome_reserves:
            return 0.0
        total_reserve = sum(self.outcome_reserves.values()) or 1
        # Price = complement reserves / total reserves
        other_reserves = total_reserve - self.outcome_reserves[outcome]
        return round(other_reserves / total_reserve, 6)

    def prices(self) -> Dict[str, float]:
        """All outcome prices (should sum to ~1.0)."""
        return {o: self.price(o) for o in self.outcome_reserves}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "market_id": self.market_id,
            "collateral_reserve": self.collateral_reserve,
            "outcome_reserves": self.outcome_reserves,
            "prices": self.prices(),
            "k": self.k,
            "fee_bps": self.fee_bps,
            "total_fees_collected": self.total_fees_collected,
        }


class OutcomeTokenManager:
    """
    Manages HTS-based outcome token markets with constant-product AMM.

    Flow:
    1. create_market_tokens(market_id, outcomes) → initialize AMM
    2. buy_outcome(market_id, outcome, amount) → mint tokens via AMM
    3. sell_outcome(market_id, outcome, amount) → burn tokens, return HBAR
    4. settle(market_id, winning_outcome) → winning=1, losing=0
    """

    INITIAL_LIQUIDITY = 1_000_000_000   # 10 HBAR per outcome as seed liquidity

    def __init__(self, hedera_toolkit=None):
        """
        Args:
            hedera_toolkit: Optional HederaAgentToolkit for actual HTS operations.
        """
        self._toolkit = hedera_toolkit
        self._tokens: Dict[str, Dict[str, OutcomeToken]] = {}   # market → {outcome → token}
        self._amm: Dict[str, AMMState] = {}                     # market → AMM state
        self._positions: Dict[str, Dict[str, Dict[str, int]]] = {}  # market → user → outcome → balance
        self._settled: Dict[str, str] = {}                       # market → winning outcome

    # ------------------------------------------------------------------
    # Token creation
    # ------------------------------------------------------------------

    def create_market_tokens(
        self,
        market_id: str,
        outcomes: List[str],
        initial_liquidity: int = 0,
    ) -> Dict[str, OutcomeToken]:
        """
        Create HTS fungible tokens for each outcome and initialize the AMM.

        Args:
            market_id: Market identifier.
            outcomes: List of outcome labels (e.g. ["YES", "NO"]).
            initial_liquidity: Seed HBAR per outcome in tinybar.
                               Defaults to INITIAL_LIQUIDITY.
        """
        if market_id in self._tokens:
            raise ValueError(f"Tokens already exist for market {market_id}")

        liquidity = initial_liquidity or self.INITIAL_LIQUIDITY
        tokens: Dict[str, OutcomeToken] = {}

        for outcome in outcomes:
            symbol = f"{outcome[:3].upper()}-{market_id[:6]}".replace(" ", "")
            token = OutcomeToken(
                market_id=market_id,
                outcome=outcome,
                name=f"{outcome} Token ({market_id[:8]})",
                symbol=symbol,
                total_supply=liquidity,
                reserve=liquidity,
            )
            tokens[outcome] = token

        self._tokens[market_id] = tokens
        self._positions[market_id] = {}

        # Initialize AMM
        reserves = {o: liquidity for o in outcomes}
        k = math.prod(reserves.values())
        self._amm[market_id] = AMMState(
            market_id=market_id,
            collateral_reserve=liquidity * len(outcomes),
            outcome_reserves=reserves,
            k=k,
        )

        return tokens

    # ------------------------------------------------------------------
    # Trading
    # ------------------------------------------------------------------

    def buy_outcome(
        self,
        market_id: str,
        outcome: str,
        hbar_amount: int,
        user: str,
    ) -> Dict[str, Any]:
        """
        Buy outcome tokens by depositing HBAR into the AMM.

        Uses constant-product formula: tokens_out = reserve - (k / (reserve + amount_in))
        """
        amm = self._require_amm(market_id)
        if market_id in self._settled:
            raise ValueError("Market is settled")
        if outcome not in amm.outcome_reserves:
            raise ValueError(f"Invalid outcome '{outcome}'")
        if hbar_amount <= 0:
            raise ValueError("Amount must be positive")

        # Apply fee
        fee = (hbar_amount * amm.fee_bps) // 10_000
        amount_after_fee = hbar_amount - fee
        amm.total_fees_collected += fee

        # Constant product: buy outcome = add to other reserves, remove from this
        # For binary: depositing for YES means adding to NO reserve
        # For multi: depositing means adding to ALL OTHER reserves
        other_outcomes = [o for o in amm.outcome_reserves if o != outcome]
        if not other_outcomes:
            raise ValueError("Cannot trade with single outcome")

        # Add liquidity to other outcome reserves proportionally
        per_other = amount_after_fee // len(other_outcomes)
        for o in other_outcomes:
            amm.outcome_reserves[o] += per_other

        # Calculate tokens out from this outcome's reserve
        old_reserve = amm.outcome_reserves[outcome]
        new_k = math.prod(amm.outcome_reserves[o] for o in amm.outcome_reserves if o != outcome)
        new_reserve = max(1, amm.k // (new_k or 1))
        tokens_out = max(0, old_reserve - new_reserve)
        amm.outcome_reserves[outcome] = new_reserve

        # Update invariant
        amm.k = math.prod(amm.outcome_reserves.values())
        amm.collateral_reserve += hbar_amount

        # Credit user
        self._credit_position(market_id, user, outcome, tokens_out)

        # Update token supply
        if market_id in self._tokens and outcome in self._tokens[market_id]:
            self._tokens[market_id][outcome].total_supply += tokens_out

        return {
            "market_id": market_id,
            "outcome": outcome,
            "hbar_in": hbar_amount,
            "fee": fee,
            "tokens_received": tokens_out,
            "new_price": amm.price(outcome),
            "prices": amm.prices(),
            "user": user,
        }

    def sell_outcome(
        self,
        market_id: str,
        outcome: str,
        token_amount: int,
        user: str,
    ) -> Dict[str, Any]:
        """
        Sell outcome tokens back to the AMM for HBAR.
        """
        amm = self._require_amm(market_id)
        if market_id in self._settled:
            raise ValueError("Market is settled")
        if outcome not in amm.outcome_reserves:
            raise ValueError(f"Invalid outcome '{outcome}'")

        # Check user balance
        balance = self._get_balance(market_id, user, outcome)
        if token_amount > balance:
            raise ValueError(f"Insufficient balance: have {balance}, selling {token_amount}")

        # Add tokens back to reserve
        amm.outcome_reserves[outcome] += token_amount

        # Calculate HBAR out from other reserves
        other_outcomes = [o for o in amm.outcome_reserves if o != outcome]
        old_product = math.prod(amm.outcome_reserves[o] for o in other_outcomes)
        target_product = amm.k // amm.outcome_reserves[outcome]
        hbar_out_total = 0

        for o in other_outcomes:
            old_val = amm.outcome_reserves[o]
            # Proportional reduction
            new_val = max(1, int(old_val * target_product / (old_product or 1)))
            removed = old_val - new_val
            if removed > 0:
                amm.outcome_reserves[o] = new_val
                hbar_out_total += removed

        # Apply fee
        fee = (hbar_out_total * amm.fee_bps) // 10_000
        hbar_out = hbar_out_total - fee
        amm.total_fees_collected += fee

        amm.k = math.prod(amm.outcome_reserves.values())
        amm.collateral_reserve = max(0, amm.collateral_reserve - hbar_out)

        # Debit user
        self._debit_position(market_id, user, outcome, token_amount)

        return {
            "market_id": market_id,
            "outcome": outcome,
            "tokens_sold": token_amount,
            "hbar_out": hbar_out,
            "fee": fee,
            "new_price": amm.price(outcome),
            "prices": amm.prices(),
            "user": user,
        }

    # ------------------------------------------------------------------
    # Settlement
    # ------------------------------------------------------------------

    def settle(
        self,
        market_id: str,
        winning_outcome: str,
    ) -> Dict[str, Any]:
        """
        Settle market: winning tokens redeem at 1 unit, losers at 0.

        Returns per-user payout summary.
        """
        if market_id in self._settled:
            raise ValueError("Already settled")
        amm = self._require_amm(market_id)
        if winning_outcome not in amm.outcome_reserves:
            raise ValueError(f"Invalid outcome '{winning_outcome}'")

        positions = self._positions.get(market_id, {})
        payouts: List[Dict[str, Any]] = []

        for user, user_positions in positions.items():
            winning_balance = user_positions.get(winning_outcome, 0)
            total_balance = sum(user_positions.values())
            if winning_balance > 0:
                payouts.append({
                    "user": user,
                    "winning_tokens": winning_balance,
                    "total_tokens": total_balance,
                    "payout": winning_balance,  # 1:1 redemption
                })

        self._settled[market_id] = winning_outcome

        settlement_hash = hashlib.sha256(json.dumps({
            "market_id": market_id,
            "winning_outcome": winning_outcome,
            "payouts": payouts,
            "collateral_reserve": amm.collateral_reserve,
            "timestamp": time.time(),
        }, sort_keys=True).encode()).hexdigest()

        return {
            "market_id": market_id,
            "winning_outcome": winning_outcome,
            "payouts": payouts,
            "total_redeemed": sum(p["payout"] for p in payouts),
            "settlement_hash": settlement_hash,
        }

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_prices(self, market_id: str) -> Dict[str, float]:
        return self._require_amm(market_id).prices()

    def get_amm_state(self, market_id: str) -> AMMState:
        return self._require_amm(market_id)

    def get_user_positions(self, market_id: str, user: str) -> Dict[str, int]:
        return self._positions.get(market_id, {}).get(user, {})

    def get_tokens(self, market_id: str) -> Dict[str, OutcomeToken]:
        return self._tokens.get(market_id, {})

    def stats(self) -> Dict[str, Any]:
        return {
            "total_markets": len(self._tokens),
            "settled_markets": len(self._settled),
            "total_collateral": sum(a.collateral_reserve for a in self._amm.values()),
            "total_fees": sum(a.total_fees_collected for a in self._amm.values()),
        }

    # ------------------------------------------------------------------
    # Internal position tracking
    # ------------------------------------------------------------------

    def _credit_position(self, market_id: str, user: str, outcome: str, amount: int):
        if market_id not in self._positions:
            self._positions[market_id] = {}
        if user not in self._positions[market_id]:
            self._positions[market_id][user] = {}
        current = self._positions[market_id][user].get(outcome, 0)
        self._positions[market_id][user][outcome] = current + amount

    def _debit_position(self, market_id: str, user: str, outcome: str, amount: int):
        current = self._get_balance(market_id, user, outcome)
        self._positions[market_id][user][outcome] = max(0, current - amount)

    def _get_balance(self, market_id: str, user: str, outcome: str) -> int:
        return self._positions.get(market_id, {}).get(user, {}).get(outcome, 0)

    def _require_amm(self, market_id: str) -> AMMState:
        amm = self._amm.get(market_id)
        if not amm:
            raise KeyError(f"No AMM for market {market_id}")
        return amm
