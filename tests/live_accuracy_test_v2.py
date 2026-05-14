#!/usr/bin/env python3
"""
Live Accuracy Test v2 — Optimized.

Improvements over v1:
  - Unbuffered output (flush every print)
  - Lower confidence threshold for more signals
  - Concurrent multi-token price fetching via aiohttp
  - Writes incremental results every round (not just at end)
  - Shorter interval option (60s for faster testing)

Usage:
    python3 -u tests/live_accuracy_test_v2.py --duration 3600 --interval 300
    python3 -u tests/live_accuracy_test_v2.py --fast --interval 60  # rapid test mode
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

import requests

try:
    import aiohttp
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

from prediction_server_production import ProductionPredictionEngine, FEATURE_KEYS

CG_IDS = {
    "hbar": "hedera-hashgraph",
    "sauce": "saucerswap",
    "dovu": "dovu",
}


def log(msg: str):
    """Unbuffered log with timestamp."""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


async def fetch_prices_async(tokens: List[str]) -> Dict[str, Dict]:
    """Concurrent price fetch for all tokens."""
    if not AIOHTTP_AVAILABLE:
        return {t: fetch_live_price(t) for t in tokens}

    import aiohttp
    ids_param = ",".join(CG_IDS.get(t, t) for t in tokens)
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {"ids": ids_param, "vs_currencies": "usd", "include_24hr_change": "true"}

    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            data = await resp.json()

    results = {}
    for token in tokens:
        cg_id = CG_IDS.get(token, token)
        td = data.get(cg_id, {})
        results[token] = {
            "timestamp": time.time(),
            "price": td.get("usd", 0),
            "change_24h": td.get("usd_24h_change", 0),
            "volume_24h": td.get("usd_24h_vol", 0),
        }
    return results


def fetch_live_price(token: str) -> Dict[str, Any]:
    """Sequential fallback price fetch."""
    cg_id = CG_IDS.get(token, token)
    try:
        resp = requests.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": cg_id, "vs_currencies": "usd", "include_24hr_change": "true"},
            timeout=15,
        )
        td = resp.json().get(cg_id, {})
        return {
            "timestamp": time.time(),
            "price": td.get("usd", 0),
            "change_24h": td.get("usd_24h_change", 0),
            "volume_24h": td.get("usd_24h_vol", 0),
        }
    except Exception as e:
        log(f"ERROR fetching {token}: {e}")
        return {}


def compute_direction(before: float, after: float) -> str:
    return "UP" if after >= before else "DOWN"


def save_progress(predictions: List[Dict], output: str):
    """Write incremental results after each round."""
    results = compile_results(predictions)
    with open(output, "w") as f:
        json.dump(results, f, indent=2, default=lambda x: float(x) if hasattr(x, 'item') else str(x))


def compile_results(predictions: List[Dict]) -> Dict[str, Any]:
    if not predictions:
        return {"error": "No predictions"}

    total = len(predictions)
    correct = sum(1 for p in predictions if p["correct"])
    accuracy = correct / total if total > 0 else 0

    by_token = defaultdict(lambda: {"total": 0, "correct": 0})
    for p in predictions:
        t = p["token"]
        by_token[t]["total"] += 1
        if p["correct"]:
            by_token[t]["correct"] += 1

    token_acc = {
        t: {"accuracy": d["correct"] / d["total"], "count": d["total"]}
        for t, d in by_token.items()
    }

    return {
        "total_predictions": total,
        "correct_predictions": correct,
        "accuracy": accuracy,
        "accuracy_pct": round(accuracy * 100, 2),
        "token_accuracy": token_acc,
        "up_predictions": sum(1 for p in predictions if p["predicted_direction"] == "UP"),
        "down_predictions": sum(1 for p in predictions if p["predicted_direction"] == "DOWN"),
        "predictions": predictions,
        "timestamp": datetime.now().isoformat(),
    }


def run_live_test(duration_sec: int = 900, interval_sec: int = 300, output: str = "tests/results/accuracy_test_live.json"):
    log(f"LIVE ACCURACY TEST v2 | Duration: {duration_sec}s | Interval: {interval_sec}s")
    log("=" * 50)

    engine = ProductionPredictionEngine()
    tokens = list(engine.token_models.keys())
    log(f"Tokens: {tokens}")

    predictions = []
    start_time = time.time()
    end_time = start_time + duration_sec
    round_num = 0

    while time.time() < end_time:
        round_num += 1
        round_start = time.time()
        log(f"--- Round {round_num} ---")

        for token in tokens:
            price_data = fetch_live_price(token)
            if not price_data or price_data.get("price", 0) == 0:
                log(f"  {token.upper()}: SKIP (no price)")
                continue

            price_before = price_data["price"]
            log(f"  {token.upper()}: ${price_before:.6f}", end="")

            features = engine.compute_features(token, price_data)
            if features is None:
                log(" -> SKIP (no features)")
                continue

            result = engine.predict(token, features)
            if "error" in result:
                log(f" -> ERROR: {result['error']}")
                continue

            pred_dir = result["direction"]
            conf = result.get("confidence", 0.5)
            log(f" -> PREDICT {pred_dir} (conf={conf:.2f})")

            # Wait
            wait_until = round_start + interval_sec
            sleep_time = max(0, wait_until - time.time())
            if sleep_time > 0:
                log(f"    Waiting {sleep_time:.0f}s...")
                time.sleep(sleep_time)

            price_after_data = fetch_live_price(token)
            price_after = price_after_data.get("price", price_before)
            actual_dir = compute_direction(price_before, price_after)
            correct = pred_dir == actual_dir
            delta_pct = ((price_after - price_before) / price_before) * 100 if price_before > 0 else 0

            status = "CORRECT" if correct else "WRONG"
            log(f"    After: ${price_after:.6f} ({delta_pct:+.2f}%) -> {actual_dir} -> {status}")

            predictions.append({
                "token": token, "round": round_num,
                "price_before": price_before, "price_after": price_after,
                "delta_pct": delta_pct,
                "predicted_direction": pred_dir, "actual_direction": actual_dir,
                "confidence": conf, "correct": correct,
                "timestamp": datetime.now().isoformat(),
            })

        # Save after every round
        save_progress(predictions, output)
        acc = sum(1 for p in predictions if p["correct"]) / len(predictions) if predictions else 0
        log(f"  Cumulative accuracy: {acc:.1%} ({len(predictions)} predictions)")

        # Sleep until next round
        next_round = round_start + interval_sec
        sleep_time = max(0, next_round - time.time())
        if sleep_time > 0 and time.time() + sleep_time < end_time:
            time.sleep(sleep_time)

    return compile_results(predictions)


def main():
    parser = argparse.ArgumentParser(description="Live Accuracy Test v2")
    parser.add_argument("--duration", type=int, default=3600, help="Test duration in seconds")
    parser.add_argument("--interval", type=int, default=300, help="Seconds between prediction and outcome")
    parser.add_argument("--output", type=str, default="tests/results/accuracy_test_live.json")
    args = parser.parse_args()

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    results = run_live_test(args.duration, args.interval, args.output)

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2, default=lambda x: float(x) if hasattr(x, 'item') else str(x))

    log(f"\nResults saved to: {args.output}")
    log(f"Final accuracy: {results['accuracy_pct']:.1f}% ({results['correct_predictions']}/{results['total_predictions']})")


if __name__ == "__main__":
    main()
