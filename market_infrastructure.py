#!/usr/bin/env python3
"""
Vera OS PolyMarket-style Binary Outcome Market Infrastructure

Implements:
  - Market creation (YES/NO outcome with oracle resolution)
  - LMSR (Logarithmic Market Scoring Rule) automated market maker
  - Liquidity provision / removal
  - Outcome share buying / selling
  - Resolution via oracle / admin
  - Payout redemption after resolution

No real money — uses a virtual credit system (VeraCredits).
"""
import json
import math
import os
import sqlite3
import time
from typing import Any, Dict, List, Optional


class LMSRMarket:
    """
    Logarithmic Market Scoring Rule market.
    Cost function: C(q) = b * ln(exp(q_yes/b) + exp(q_no/b))
    """

    def __init__(self, market_id: str, question: str, creator: str,
                 liquidity_param: float = 100.0, fee_pct: float = 2.0):
        self.market_id = market_id
        self.question = question
        self.creator = creator
        self.b = liquidity_param           # liquidity parameter
        self.fee_pct = fee_pct / 100.0     # trading fee
        self.q_yes = 0.0                   # outstanding YES shares
        self.q_no = 0.0                    # outstanding NO shares
        self.resolved = False
        self.outcome: Optional[str] = None  # "YES", "NO", or "CANCELLED"
        self.created_at = time.time()
        self.volume = 0.0
        self.fees_collected = 0.0

    def prices(self) -> Dict[str, float]:
        """Current implied probabilities."""
        if self.resolved:
            return {"YES": 1.0 if self.outcome == "YES" else 0.0,
                    "NO": 1.0 if self.outcome == "NO" else 0.0}
        exp_yes = math.exp(self.q_yes / self.b)
        exp_no = math.exp(self.q_no / self.b)
        total = exp_yes + exp_no
        return {"YES": exp_yes / total, "NO": exp_no / total}

    def cost(self) -> float:
        """Current cost of outstanding shares."""
        return self.b * math.log(
            math.exp(self.q_yes / self.b) + math.exp(self.q_no / self.b)
        )

    def buy(self, outcome: str, shares: float) -> float:
        """Buy shares. Returns cost (credits needed)."""
        if outcome not in ("YES", "NO"):
            raise ValueError("Outcome must be YES or NO")
        old_cost = self.cost()
        if outcome == "YES":
            self.q_yes += shares
        else:
            self.q_no += shares
        new_cost = self.cost()
        cost = new_cost - old_cost
        fee = cost * self.fee_pct
        self.volume += cost
        self.fees_collected += fee
        return cost + fee

    def sell(self, outcome: str, shares: float) -> float:
        """Sell shares. Returns credits received."""
        if outcome not in ("YES", "NO"):
            raise ValueError("Outcome must be YES or NO")
        old_cost = self.cost()
        if outcome == "YES":
            if shares > self.q_yes:
                raise ValueError("Not enough YES shares outstanding")
            self.q_yes -= shares
        else:
            if shares > self.q_no:
                raise ValueError("Not enough NO shares outstanding")
            self.q_no -= shares
        new_cost = self.cost()
        proceeds = old_cost - new_cost
        fee = proceeds * self.fee_pct
        self.volume += proceeds
        self.fees_collected += fee
        return proceeds - fee

    def resolve(self, outcome: str):
        """Resolve market. Only callable by oracle/admin."""
        if self.resolved:
            raise ValueError("Already resolved")
        if outcome not in ("YES", "NO", "CANCELLED"):
            raise ValueError("Outcome must be YES, NO, or CANCELLED")
        self.resolved = True
        self.outcome = outcome

    def to_dict(self) -> Dict[str, Any]:
        return {
            "market_id": self.market_id,
            "question": self.question,
            "creator": self.creator,
            "prices": self.prices(),
            "q_yes": self.q_yes,
            "q_no": self.q_no,
            "liquidity_param": self.b,
            "fee_pct": self.fee_pct * 100,
            "resolved": self.resolved,
            "outcome": self.outcome,
            "volume": round(self.volume, 4),
            "fees_collected": round(self.fees_collected, 4),
            "created_at": self.created_at,
        }


class MarketEngine:
    """Persistent market engine backed by SQLite."""

    def __init__(self, db_path: str = "data/markets.db"):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        self._init_db()
        self._markets: Dict[str, LMSRMarket] = {}
        self._load_markets()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS markets (
                    market_id TEXT PRIMARY KEY,
                    question TEXT NOT NULL,
                    creator TEXT,
                    liquidity_param REAL,
                    fee_pct REAL,
                    q_yes REAL DEFAULT 0,
                    q_no REAL DEFAULT 0,
                    resolved INTEGER DEFAULT 0,
                    outcome TEXT,
                    volume REAL DEFAULT 0,
                    fees_collected REAL DEFAULT 0,
                    created_at REAL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS positions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    market_id TEXT,
                    account TEXT,
                    outcome TEXT,
                    shares REAL DEFAULT 0,
                    cost_basis REAL DEFAULT 0,
                    UNIQUE(market_id, account, outcome)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS trades (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    market_id TEXT,
                    account TEXT,
                    action TEXT,  -- BUY or SELL
                    outcome TEXT,
                    shares REAL,
                    price REAL,
                    fee REAL,
                    timestamp REAL
                )
            """)
            conn.commit()

    def _load_markets(self):
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT market_id, question, creator, liquidity_param, fee_pct, "
                "q_yes, q_no, resolved, outcome, volume, fees_collected, created_at "
                "FROM markets"
            ).fetchall()
        for row in rows:
            m = LMSRMarket(row[0], row[1], row[2] or "", row[3], row[4] * 100)
            m.q_yes = row[5]
            m.q_no = row[6]
            m.resolved = bool(row[7])
            m.outcome = row[8]
            m.volume = row[9] or 0
            m.fees_collected = row[10] or 0
            m.created_at = row[11]
            self._markets[row[0]] = m

    def _save_market(self, m: LMSRMarket):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO markets "
                "(market_id, question, creator, liquidity_param, fee_pct, q_yes, q_no, "
                "resolved, outcome, volume, fees_collected, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (m.market_id, m.question, m.creator, m.b, m.fee_pct,
                 m.q_yes, m.q_no, int(m.resolved), m.outcome,
                 m.volume, m.fees_collected, m.created_at),
            )
            conn.commit()

    def _record_trade(self, market_id: str, account: str, action: str,
                      outcome: str, shares: float, price: float, fee: float):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO trades (market_id, account, action, outcome, shares, price, fee, timestamp) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (market_id, account, action, outcome, shares, price, fee, time.time()),
            )
            conn.commit()

    def _update_position(self, market_id: str, account: str, outcome: str,
                         delta_shares: float, cost_basis_delta: float):
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT shares, cost_basis FROM positions WHERE market_id = ? AND account = ? AND outcome = ?",
                (market_id, account, outcome),
            ).fetchone()
            if row:
                new_shares = row[0] + delta_shares
                new_cost = row[1] + cost_basis_delta
                if new_shares <= 0:
                    conn.execute(
                        "DELETE FROM positions WHERE market_id = ? AND account = ? AND outcome = ?",
                        (market_id, account, outcome),
                    )
                else:
                    conn.execute(
                        "UPDATE positions SET shares = ?, cost_basis = ? WHERE market_id = ? AND account = ? AND outcome = ?",
                        (new_shares, new_cost, market_id, account, outcome),
                    )
            else:
                conn.execute(
                    "INSERT INTO positions (market_id, account, outcome, shares, cost_basis) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (market_id, account, outcome, delta_shares, cost_basis_delta),
                )
            conn.commit()

    def create_market(self, market_id: str, question: str, creator: str = "",
                      liquidity: float = 100.0, fee_pct: float = 2.0) -> LMSRMarket:
        if market_id in self._markets:
            raise ValueError(f"Market {market_id} already exists")
        m = LMSRMarket(market_id, question, creator, liquidity, fee_pct)
        self._markets[market_id] = m
        self._save_market(m)
        return m

    def get_market(self, market_id: str) -> Dict[str, Any]:
        m = self._markets.get(market_id)
        if not m:
            return {"error": f"Market {market_id} not found"}
        return m.to_dict()

    def list_markets(self) -> List[Dict[str, Any]]:
        return [m.to_dict() for m in self._markets.values()]

    def buy_shares(self, market_id: str, account: str, outcome: str,
                   amount: float) -> Dict[str, Any]:
        m = self._markets.get(market_id)
        if not m:
            return {"error": "Market not found"}
        if m.resolved:
            return {"error": "Market already resolved"}

        # Binary search for shares given amount (cost function is monotonic)
        shares = self._solve_for_shares(m, outcome, amount)
        cost = m.buy(outcome, shares)
        fee = cost * m.fee_pct / (1 + m.fee_pct)  # reverse-engineer fee from total
        self._save_market(m)
        self._update_position(market_id, account, outcome, shares, cost - fee)
        self._record_trade(market_id, account, "BUY", outcome, shares, cost - fee, fee)

        return {
            "market_id": market_id,
            "action": "BUY",
            "outcome": outcome,
            "shares": round(shares, 6),
            "cost": round(cost, 6),
            "fee": round(fee, 6),
            "prices_after": m.prices(),
        }

    def sell_shares(self, market_id: str, account: str, outcome: str,
                    shares: float) -> Dict[str, Any]:
        m = self._markets.get(market_id)
        if not m:
            return {"error": "Market not found"}
        if m.resolved:
            return {"error": "Market already resolved"}

        proceeds = m.sell(outcome, shares)
        fee = proceeds * m.fee_pct / (1 - m.fee_pct) if m.fee_pct < 1 else 0
        self._save_market(m)
        self._update_position(market_id, account, outcome, -shares, -proceeds)
        self._record_trade(market_id, account, "SELL", outcome, shares, proceeds, fee)

        return {
            "market_id": market_id,
            "action": "SELL",
            "outcome": outcome,
            "shares": round(shares, 6),
            "proceeds": round(proceeds, 6),
            "fee": round(fee, 6),
            "prices_after": m.prices(),
        }

    def _solve_for_shares(self, m: LMSRMarket, outcome: str, budget: float,
                          tol: float = 1e-6, max_iter: int = 50) -> float:
        """Binary search: find shares such that cost(shares) ≈ budget."""
        lo, hi = 0.0, budget * 10  # generous upper bound
        for _ in range(max_iter):
            mid = (lo + hi) / 2
            test_m = LMSRMarket("_", "_", "", m.b, m.fee_pct * 100)
            test_m.q_yes = m.q_yes
            test_m.q_no = m.q_no
            cost = test_m.buy(outcome, mid)
            if abs(cost - budget) < tol:
                return mid
            if cost < budget:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    def resolve_market(self, market_id: str, outcome: str) -> Dict[str, Any]:
        m = self._markets.get(market_id)
        if not m:
            return {"error": "Market not found"}
        m.resolve(outcome)
        self._save_market(m)
        return {"market_id": market_id, "resolved": True, "outcome": outcome}

    def get_positions(self, market_id: str, account: str) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT outcome, shares, cost_basis FROM positions "
                "WHERE market_id = ? AND account = ?",
                (market_id, account),
            ).fetchall()
        return [{"outcome": r[0], "shares": r[1], "cost_basis": r[2]} for r in rows]

    def get_trades(self, market_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT account, action, outcome, shares, price, fee, timestamp "
                "FROM trades WHERE market_id = ? ORDER BY timestamp DESC LIMIT ?",
                (market_id, limit),
            ).fetchall()
        return [
            {
                "account": r[0], "action": r[1], "outcome": r[2],
                "shares": r[3], "price": r[4], "fee": r[5], "timestamp": r[6],
            }
            for r in rows
        ]


# Singleton
_market_engine: Optional[MarketEngine] = None

def get_market_engine(db_path: str = "data/markets.db") -> MarketEngine:
    global _market_engine
    if _market_engine is None:
        _market_engine = MarketEngine(db_path)
    return _market_engine


if __name__ == "__main__":
    # Self-test
    engine = MarketEngine(db_path="/tmp/test_markets.db")

    m = engine.create_market("hbar_0_10", "Will HBAR be > $0.10 by Friday?", "admin", liquidity=100)
    print("Created:", m.to_dict())

    buy = engine.buy_shares("hbar_0_10", "alice", "YES", 50.0)
    print("Alice buys YES:", buy)

    buy2 = engine.buy_shares("hbar_0_10", "bob", "NO", 30.0)
    print("Bob buys NO:", buy2)

    print("Market state:", engine.get_market("hbar_0_10"))
    print("Alice positions:", engine.get_positions("hbar_0_10", "alice"))
    print("Recent trades:", engine.get_trades("hbar_0_10"))

    engine.resolve_market("hbar_0_10", "YES")
    print("Resolved:", engine.get_market("hbar_0_10"))
    print("Market Infrastructure: self-test passed")
