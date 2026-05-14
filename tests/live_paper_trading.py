#!/usr/bin/env python3
"""
Live Paper Trading Simulation for Vera OS.

Runs alongside live_accuracy_test.py. Simulates portfolio based on real
live predictions and actual price movements.

Usage:
    python3 tests/live_paper_trading.py --duration 3600 --interval 300
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any

import requests

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

from prediction_server_production import ProductionPredictionEngine


CG_IDS = {
    "hbar": "hedera-hashgraph",
    "sauce": "saucerswap",
    "dovu": "dovu",
}

FEE_RATE = 0.001
INITIAL_CAPITAL = 10000.0


def fetch_price(token: str) -> float:
    cg_id = CG_IDS.get(token, token)
    try:
        resp = requests.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": cg_id, "vs_currencies": "usd"},
            timeout=15,
        )
        return resp.json().get(cg_id, {}).get("usd", 0)
    except Exception:
        return 0


class PaperPortfolio:
    def __init__(self, capital: float = INITIAL_CAPITAL):
        self.initial_capital = capital
        self.cash = capital
        self.positions: Dict[str, Dict] = {}
        self.trades: List[Dict] = []
        self.value_history: List[Dict] = []

    def buy(self, token: str, price: float, amount: float) -> bool:
        if amount > self.cash:
            return False
        fee = amount * FEE_RATE
        invest = amount - fee
        shares = invest / price if price > 0 else 0
        self.cash -= amount

        if token in self.positions:
            old = self.positions[token]
            total = old["shares"] + shares
            avg = (old["shares"] * old["entry_price"] + shares * price) / total
            self.positions[token] = {"shares": total, "entry_price": avg}
        else:
            self.positions[token] = {"shares": shares, "entry_price": price}

        self.trades.append({
            "type": "BUY", "token": token, "price": price,
            "shares": shares, "amount": amount, "fee": fee,
            "timestamp": datetime.now().isoformat(),
        })
        return True

    def sell(self, token: str, price: float) -> float:
        if token not in self.positions:
            return 0
        pos = self.positions[token]
        shares = pos["shares"]
        gross = shares * price
        fee = gross * FEE_RATE
        net = gross - fee
        pl = net - (shares * pos["entry_price"])
        self.cash += net
        del self.positions[token]

        self.trades.append({
            "type": "SELL", "token": token, "price": price,
            "shares": shares, "gross": gross, "fee": fee,
            "net": net, "pnl": pl,
            "timestamp": datetime.now().isoformat(),
        })
        return pl

    def current_value(self, prices: Dict[str, float]) -> float:
        pos_val = sum(self.positions[t]["shares"] * prices.get(t, 0) for t in self.positions)
        return self.cash + pos_val

    def record(self, prices: Dict[str, float]):
        self.value_history.append({
            "timestamp": datetime.now().isoformat(),
            "cash": self.cash,
            "position_value": sum(self.positions[t]["shares"] * prices.get(t, 0) for t in self.positions),
            "total": self.current_value(prices),
        })


def run_live_paper_trade(duration_sec: int = 3600, interval_sec: int = 300) -> Dict[str, Any]:
    print(f"\n{'='*60}")
    print(f"LIVE PAPER TRADING")
    print(f"Capital: ${INITIAL_CAPITAL:,.2f} | Duration: {duration_sec}s | Interval: {interval_sec}s")
    print(f"{'='*60}\n")

    engine = ProductionPredictionEngine()
    tokens = list(engine.token_models.keys())
    print(f"Trading: {tokens}")

    vera_portfolio = PaperPortfolio(INITIAL_CAPITAL)

    start_time = time.time()
    end_time = start_time + duration_sec
    round_num = 0

    while time.time() < end_time:
        round_num += 1
        print(f"\n--- Round {round_num} ---")
        current_prices = {}

        for token in tokens:
            price = fetch_price(token)
            if price == 0:
                continue
            current_prices[token] = price

            price_data = {
                "timestamp": time.time(),
                "price": price,
                "change_24h": 0,
                "volume_24h": 0,
            }

            features = engine.compute_features(token, price_data)
            if features is None:
                continue

            result = engine.predict(token, features)
            if "error" in result:
                continue

            direction = result["direction"]
            confidence = result.get("confidence", 0.5)
            has_pos = token in vera_portfolio.positions

            print(f"  {token.upper()}: ${price:.6f} -> {direction} (conf={confidence:.2f})")

            if direction == "UP" and confidence > 0.6 and not has_pos:
                amount = vera_portfolio.cash * 0.3
                if amount > 50:
                    vera_portfolio.buy(token, price, amount)
                    print(f"    -> BUY ${amount:.2f}")

            elif direction == "DOWN" and confidence > 0.6 and has_pos:
                pl = vera_portfolio.sell(token, price)
                print(f"    -> SELL P&L: ${pl:+.2f}")

        vera_portfolio.record(current_prices)
        total = vera_portfolio.current_value(current_prices)
        print(f"  Portfolio: ${total:,.2f} ({(total/INITIAL_CAPITAL-1)*100:+.2f}%)")

        # Save progress
        progress = {
            "round": round_num,
            "portfolio_value": total,
            "cash": vera_portfolio.cash,
            "positions": {t: {"shares": p["shares"], "entry": p["entry_price"]} for t, p in vera_portfolio.positions.items()},
            "trades_count": len(vera_portfolio.trades),
            "timestamp": datetime.now().isoformat(),
        }
        with open("/home/vera-live-0-1/hedera-llm-api/tests/results/paper_trading_live.json", "w") as f:
            json.dump(progress, f, indent=2)

        # Wait
        sleep_time = interval_sec
        if time.time() + sleep_time < end_time:
            print(f"    Waiting {sleep_time}s...")
            time.sleep(sleep_time)

    # Final
    final_prices = {t: fetch_price(t) for t in tokens}
    final_value = vera_portfolio.current_value(final_prices)
    total_return = (final_value - INITIAL_CAPITAL) / INITIAL_CAPITAL

    realized = [t for t in vera_portfolio.trades if t["type"] == "SELL"]
    wins = sum(1 for t in realized if t["pnl"] > 0)
    win_rate = wins / len(realized) if realized else 0

    import statistics
    returns = []
    for i in range(1, len(vera_portfolio.value_history)):
        prev = vera_portfolio.value_history[i - 1]["total"]
        curr = vera_portfolio.value_history[i]["total"]
        if prev > 0:
            returns.append((curr - prev) / prev)

    sharpe = 0
    if len(returns) > 1 and statistics.stdev(returns) > 0:
        sharpe = (statistics.mean(returns) / statistics.stdev(returns)) * (252 ** 0.5)

    peak = INITIAL_CAPITAL
    max_dd = 0
    for r in vera_portfolio.value_history:
        val = r["total"]
        if val > peak:
            peak = val
        dd = (peak - val) / peak if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd

    result = {
        "initial_capital": INITIAL_CAPITAL,
        "final_value": final_value,
        "return_pct": round(total_return * 100, 2),
        "sharpe_ratio": round(sharpe, 3),
        "max_drawdown_pct": round(max_dd * 100, 2),
        "total_trades": len(realized),
        "win_rate_pct": round(win_rate * 100, 2),
        "trades": vera_portfolio.trades,
        "value_history": vera_portfolio.value_history,
        "timestamp": datetime.now().isoformat(),
    }

    return result


def main():
    parser = argparse.ArgumentParser(description="Live Paper Trading")
    parser.add_argument("--duration", type=int, default=3600)
    parser.add_argument("--interval", type=int, default=300)
    parser.add_argument("--output", type=str, default="tests/results/paper_trading.json")
    args = parser.parse_args()

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    results = run_live_paper_trade(args.duration, args.interval)

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2, default=lambda x: float(x) if hasattr(x, 'item') else str(x))

    print(f"\n{'='*60}")
    print(f"LIVE PAPER TRADING COMPLETE")
    print(f"{'='*60}")
    print(f"Final value: ${results['final_value']:,.2f} ({results['return_pct']:+.2f}%)")
    print(f"Sharpe: {results['sharpe_ratio']}")
    print(f"Win rate: {results['win_rate_pct']:.1f}%")
    print(f"Trades: {results['total_trades']}")
    print(f"Results: {args.output}")


if __name__ == "__main__":
    main()
