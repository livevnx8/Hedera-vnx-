#!/usr/bin/env python3
"""
Live Prediction Accuracy Test for Vera OS.

Validates whether predictions align with actual price movements.
Two modes:
  --fast    Use existing test corpus for quick backtest (~30s)
  --live    Fetch live prices, predict, wait, compare (~15 min)

Usage:
    python3 tests/live_accuracy_test.py --fast
    python3 tests/live_accuracy_test.py --live --duration 900 --interval 300
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

from prediction_server_production import ProductionPredictionEngine, FEATURE_KEYS


# CoinGecko IDs for live price fetching
CG_IDS = {
    "hbar": "hedera-hashgraph",
    "sauce": "saucerswap",
    "dovu": "dovu",
}


def fetch_live_price(token: str) -> Dict[str, Any]:
    """Fetch current price from CoinGecko."""
    cg_id = CG_IDS.get(token, token)
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": cg_id,
        "vs_currencies": "usd",
        "include_24hr_change": "true",
        "include_24hr_vol": "true",
    }
    try:
        resp = requests.get(url, params=params, timeout=15)
        data = resp.json()
        token_data = data.get(cg_id, {})
        return {
            "timestamp": time.time(),
            "price": token_data.get("usd", 0),
            "change_24h": token_data.get("usd_24h_change", 0),
            "volume_24h": token_data.get("usd_24h_vol", 0),
        }
    except Exception as e:
        print(f"ERROR fetching price for {token}: {e}")
        return {}


def compute_direction(price_before: float, price_after: float) -> str:
    """Return UP or DOWN based on price delta."""
    return "UP" if price_after >= price_before else "DOWN"


def run_live_test(duration_sec: int = 900, interval_sec: int = 300) -> Dict[str, Any]:
    """
    Run live accuracy test by polling prices, predicting, waiting, then comparing.
    duration_sec: total test duration
    interval_sec: seconds between prediction and outcome check
    """
    print(f"\n{'='*60}")
    print(f"LIVE ACCURACY TEST")
    print(f"Duration: {duration_sec}s | Interval: {interval_sec}s")
    print(f"{'='*60}\n")

    engine = ProductionPredictionEngine()
    tokens = list(engine.token_models.keys())
    print(f"Tokens with loaded models: {tokens}")

    predictions = []
    start_time = time.time()
    end_time = start_time + duration_sec
    round_num = 0

    while time.time() < end_time:
        round_num += 1
        print(f"\n--- Round {round_num} ---")
        round_start = time.time()

        for token in tokens:
            # Fetch current price
            price_data = fetch_live_price(token)
            if not price_data or price_data.get("price", 0) == 0:
                print(f"  {token.upper()}: SKIP (no price data)")
                continue

            price_before = price_data["price"]
            print(f"  {token.upper()}: ${price_before:.6f}", end="")

            # Compute features and predict
            features = engine.compute_features(token, price_data)
            if features is None:
                print(" -> SKIP (no features)")
                continue

            result = engine.predict(token, features)
            if "error" in result:
                print(f" -> ERROR: {result['error']}")
                continue

            predicted_dir = result["direction"]
            confidence = result.get("confidence", 0.5)
            print(f" -> PREDICT {predicted_dir} (conf={confidence:.2f})")

            # Wait for interval
            wait_until = round_start + interval_sec
            sleep_time = max(0, wait_until - time.time())
            if sleep_time > 0:
                print(f"    Waiting {sleep_time:.0f}s for outcome...")
                time.sleep(sleep_time)

            # Fetch price after interval
            price_after_data = fetch_live_price(token)
            price_after = price_after_data.get("price", price_before)
            actual_dir = compute_direction(price_before, price_after)
            correct = predicted_dir == actual_dir
            delta_pct = ((price_after - price_before) / price_before) * 100 if price_before > 0 else 0

            print(f"    After: ${price_after:.6f} ({delta_pct:+.2f}%) -> ACTUAL {actual_dir} -> {'CORRECT' if correct else 'WRONG'}")

            predictions.append({
                "token": token,
                "round": round_num,
                "price_before": price_before,
                "price_after": price_after,
                "delta_pct": delta_pct,
                "predicted_direction": predicted_dir,
                "actual_direction": actual_dir,
                "confidence": confidence,
                "correct": correct,
                "timestamp": datetime.now().isoformat(),
            })

        # Sleep until next round
        next_round = round_start + interval_sec
        sleep_time = max(0, next_round - time.time())
        if sleep_time > 0 and time.time() + sleep_time < end_time:
            time.sleep(sleep_time)

    return compile_results(predictions)


def run_fast_backtest(corpus_path: str = None) -> Dict[str, Any]:
    """
    Fast backtest using existing test corpus data.
    Uses the real_hedera_classification_corpus_test.json if available.
    """
    print(f"\n{'='*60}")
    print(f"FAST BACKTEST (using existing corpus)")
    print(f"{'='*60}\n")

    engine = ProductionPredictionEngine()
    tokens = list(engine.token_models.keys())
    print(f"Tokens with loaded models: {tokens}")

    # Find corpus file
    if corpus_path is None:
        candidates = [
            "/home/vera-live-0-1/hedera-llm-api/data/real_hedera_classification_corpus_test.json",
            "/home/vera-live-0-1/hedera-llm-api/data/real_5k_newfeatures_corpus.json",
            "/home/vera-live-0-1/hedera-llm-api/data/mainnet_real_corpus.json",
        ]
        for c in candidates:
            if Path(c).exists():
                corpus_path = c
                break

    if not corpus_path or not Path(corpus_path).exists():
        print("ERROR: No corpus file found for fast backtest.")
        print("Run with --live for real price testing.")
        return {"error": "No corpus data available"}

    print(f"Using corpus: {corpus_path}")

    with open(corpus_path) as f:
        corpus = json.load(f)

    # Try to extract samples
    samples = []
    if isinstance(corpus, list):
        samples = corpus
    elif isinstance(corpus, dict):
        # Try common keys
        for key in ["test", "samples", "data", "entries"]:
            if key in corpus and isinstance(corpus[key], list):
                samples = corpus[key]
                break
        if not samples and "train" in corpus:
            samples = corpus.get("train", [])

    if not samples:
        print("ERROR: Could not extract samples from corpus.")
        return {"error": "Corpus format unrecognized"}

    print(f"Total samples in corpus: {len(samples)}")

    predictions = []
    token_map = {
        "hbar": "hbar", "hedera": "hbar", "hedera-hashgraph": "hbar",
        "sauce": "sauce", "saucerswap": "sauce",
        "dovu": "dovu",
    }

    # Limit to a reasonable number for speed
    max_samples = min(100, len(samples))
    correct_count = 0

    for i, sample in enumerate(samples[:max_samples]):
        # Extract features and label from corpus
        features = None
        label = None

        if isinstance(sample, dict):
            # Try to find features
            if "features" in sample:
                features = sample["features"]
            elif "input" in sample:
                features = sample["input"]

            # Try to find label
            if "label" in sample:
                label = sample["label"]
            elif "direction" in sample:
                label = sample["direction"]
            elif "target" in sample:
                label = sample["target"]

        if features is None or label is None:
            continue

        # Normalize label
        if isinstance(label, (int, float)):
            actual_dir = "UP" if label > 0.5 else "DOWN"
        else:
            actual_dir = str(label).upper()

        # Try to determine token from sample
        token = "hbar"  # default
        for key in ["token", "symbol", "asset"]:
            if key in sample:
                raw_token = str(sample[key]).lower()
                token = token_map.get(raw_token, raw_token)
                break

        if token not in engine.token_models:
            token = "hbar"  # fallback
            if token not in engine.token_models:
                continue

        # Ensure features has all required keys
        feature_dict = {}
        if isinstance(features, list):
            for j, k in enumerate(FEATURE_KEYS):
                if j < len(features):
                    feature_dict[k] = float(features[j])
        elif isinstance(features, dict):
            feature_dict = {k: float(features.get(k, 0)) for k in FEATURE_KEYS}

        # Predict
        try:
            result = engine.predict(token, feature_dict)
        except Exception as e:
            continue

        if "error" in result:
            continue

        predicted_dir = result["direction"]
        confidence = result.get("confidence", 0.5)
        correct = predicted_dir == actual_dir

        if correct:
            correct_count += 1

        predictions.append({
            "token": token,
            "sample_index": i,
            "predicted_direction": predicted_dir,
            "actual_direction": actual_dir,
            "confidence": confidence,
            "correct": correct,
        })

        if (i + 1) % 20 == 0:
            acc = correct_count / len(predictions) if predictions else 0
            print(f"  Processed {i+1}/{max_samples}... accuracy so far: {acc:.1%}")

    print(f"\nProcessed {len(predictions)} valid predictions.")
    return compile_results(predictions)


def compile_results(predictions: List[Dict]) -> Dict[str, Any]:
    """Compile raw predictions into summary statistics."""
    if not predictions:
        return {"error": "No predictions recorded"}

    total = len(predictions)
    correct = sum(1 for p in predictions if p["correct"])
    accuracy = correct / total if total > 0 else 0

    # Per-token accuracy
    by_token = defaultdict(lambda: {"total": 0, "correct": 0})
    for p in predictions:
        t = p["token"]
        by_token[t]["total"] += 1
        if p["correct"]:
            by_token[t]["correct"] += 1

    token_accuracy = {
        t: {"accuracy": data["correct"] / data["total"], "count": data["total"]}
        for t, data in by_token.items()
    }

    # Confidence calibration: bin by confidence, check accuracy per bin
    confidence_bins = defaultdict(lambda: {"total": 0, "correct": 0})
    for p in predictions:
        conf = p.get("confidence", 0.5)
        bin_key = f"{int(conf * 10) / 10:.1f}-{int(conf * 10 + 1) / 10:.1f}"
        confidence_bins[bin_key]["total"] += 1
        if p["correct"]:
            confidence_bins[bin_key]["correct"] += 1

    calibration = {
        b: {"accuracy": d["correct"] / d["total"] if d["total"] > 0 else 0, "count": d["total"]}
        for b, d in sorted(confidence_bins.items())
    }

    # Direction bias
    up_predictions = sum(1 for p in predictions if p["predicted_direction"] == "UP")
    down_predictions = total - up_predictions

    result = {
        "total_predictions": total,
        "correct_predictions": correct,
        "accuracy": accuracy,
        "accuracy_pct": round(accuracy * 100, 2),
        "token_accuracy": token_accuracy,
        "calibration": calibration,
        "up_predictions": up_predictions,
        "down_predictions": down_predictions,
        "direction_bias": "UP" if up_predictions > down_predictions else "DOWN",
        "predictions": predictions,
        "timestamp": datetime.now().isoformat(),
    }

    return result


def print_summary(results: Dict[str, Any]) -> None:
    """Print human-readable summary."""
    if "error" in results:
        print(f"\nERROR: {results['error']}")
        return

    print(f"\n{'='*60}")
    print(f"ACCURACY TEST RESULTS")
    print(f"{'='*60}")
    print(f"Total predictions: {results['total_predictions']}")
    print(f"Correct:           {results['correct_predictions']}")
    print(f"Accuracy:          {results['accuracy_pct']:.1f}%")
    print(f"Direction bias:    {results['direction_bias']} ({results['up_predictions']} UP, {results['down_predictions']} DOWN)")

    print(f"\nPer-token accuracy:")
    for token, data in results["token_accuracy"].items():
        print(f"  {token.upper():6s}: {data['accuracy']*100:5.1f}% ({data['count']} samples)")

    print(f"\nConfidence calibration:")
    for bin_key, data in results["calibration"].items():
        if data["count"] > 0:
            print(f"  conf {bin_key}: {data['accuracy']*100:5.1f}% ({data['count']} samples)")

    # Grade
    acc = results["accuracy"]
    if acc >= 0.65:
        grade = "A"
    elif acc >= 0.60:
        grade = "B"
    elif acc >= 0.55:
        grade = "C"
    else:
        grade = "D"

    baseline = 0.50
    improvement = (acc - baseline) / baseline * 100 if baseline > 0 else 0

    print(f"\n{'='*60}")
    print(f"Grade: {grade} | vs coin-flip: {improvement:+.1f}%")
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="Vera OS Prediction Accuracy Test")
    parser.add_argument("--fast", action="store_true", help="Fast backtest using corpus data")
    parser.add_argument("--live", action="store_true", help="Live test with real prices")
    parser.add_argument("--duration", type=int, default=900, help="Live test duration in seconds (default: 900 = 15 min)")
    parser.add_argument("--interval", type=int, default=300, help="Seconds between prediction and outcome (default: 300 = 5 min)")
    parser.add_argument("--corpus", type=str, default=None, help="Path to corpus JSON for fast mode")
    parser.add_argument("--output", type=str, default="tests/results/accuracy_test.json", help="Output JSON path")
    args = parser.parse_args()

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    if args.live:
        results = run_live_test(args.duration, args.interval)
    else:
        # Default to fast mode
        results = run_fast_backtest(args.corpus)

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to: {args.output}")
    print_summary(results)


if __name__ == "__main__":
    main()
