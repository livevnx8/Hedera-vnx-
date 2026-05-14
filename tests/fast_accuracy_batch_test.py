#!/usr/bin/env python3
"""
Fast Batch Accuracy Test for Vera OS.

Uses all available corpus data (train + val + test) for statistical significance.
Batch predicts via thread pool for speed.
Processes ~2,600 samples in under 60 seconds.

Usage:
    python3 tests/fast_accuracy_batch_test.py --all
    python3 tests/fast_accuracy_batch_test.py --limit 500
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Tuple

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

from prediction_server_production import FEATURE_KEYS
from prediction.super_engine import SuperPredictionEngine


CORPUS_FILES = [
    "/home/vera-live-0-1/hedera-llm-api/data/real_hedera_classification_corpus_train.json",
    "/home/vera-live-0-1/hedera-llm-api/data/real_hedera_classification_corpus_val.json",
    "/home/vera-live-0-1/hedera-llm-api/data/real_hedera_classification_corpus_test.json",
    "/home/vera-live-0-1/hedera-llm-api/data/real_hedera_classification_corpus.json",
]


def load_all_samples() -> List[Dict]:
    """Load and deduplicate all corpus samples."""
    all_samples = []
    seen = set()

    for path in CORPUS_FILES:
        if not Path(path).exists():
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            samples = data if isinstance(data, list) else data.get("train", [])
            for s in samples:
                key = json.dumps(s, sort_keys=True)
                if key not in seen:
                    seen.add(key)
                    all_samples.append(s)
        except Exception as e:
            print(f"  Skip {path}: {e}")

    return all_samples


def extract_sample(sample: Dict) -> Tuple[str, Dict[str, float], str]:
    """Extract (token, features, label) from a corpus sample."""
    # Extract features
    features = None
    if "features" in sample:
        features = sample["features"]
    elif "input" in sample:
        features = sample["input"]

    # Extract label
    label = None
    for key in ["label", "direction", "target"]:
        if key in sample:
            label = sample[key]
            break

    # Determine token
    token = "hbar"
    for key in ["token", "symbol", "asset"]:
        if key in sample:
            raw = str(sample[key]).lower()
            if raw in ["hbar", "hedera", "hedera-hashgraph"]:
                token = "hbar"
            elif raw in ["sauce", "saucerswap"]:
                token = "sauce"
            elif raw in ["dovu"]:
                token = "dovu"
            else:
                token = raw
            break

    # Normalize label
    if isinstance(label, (int, float)):
        actual = "UP" if label > 0.5 else "DOWN"
    else:
        actual = str(label).upper()

    # Build feature dict
    feature_dict = {}
    if isinstance(features, list):
        for j, k in enumerate(FEATURE_KEYS):
            if j < len(features):
                feature_dict[k] = float(features[j])
    elif isinstance(features, dict):
        feature_dict = {k: float(features.get(k, 0)) for k in FEATURE_KEYS}

    return token, feature_dict, actual


def run_fast_batch_test(limit: int = None, workers: int = 16) -> Dict[str, Any]:
    """Run fast batch accuracy test using all corpus data."""
    print(f"\n{'='*60}")
    print(f"FAST BATCH ACCURACY TEST")
    print(f"Workers: {workers} | Limit: {limit or 'unlimited'}")
    print(f"{'='*60}\n")

    engine = SuperPredictionEngine()
    tokens = list(engine.token_models.keys())
    print(f"Tokens with loaded models: {tokens}")

    # Load all samples
    print("\nLoading corpus samples...")
    samples = load_all_samples()
    print(f"Total unique samples: {len(samples)}")

    if limit and limit < len(samples):
        samples = samples[:limit]
        print(f"Limited to: {limit}")

    # Extract features/labels
    print("\nExtracting features...")
    extracted = []
    for i, s in enumerate(samples):
        token, features, actual = extract_sample(s)
        if token in tokens and features and actual:
            extracted.append((token, features, actual))
        if (i + 1) % 500 == 0:
            print(f"  Extracted {i+1}/{len(samples)}...")

    print(f"Valid samples: {len(extracted)}")

    # Batch predict using thread pool
    print(f"\nPredicting with {workers} workers...")
    predictions = []
    correct_count = 0
    start_time = time.time()

    def predict_one(args):
        token, features, actual = args
        try:
            result = engine.predict(token, features)
            if "error" in result:
                return None
            pred_dir = result["direction"]
            conf = result.get("confidence", 0.5)
            correct = pred_dir == actual
            return {
                "token": token,
                "predicted_direction": pred_dir,
                "actual_direction": actual,
                "confidence": conf,
                "correct": correct,
            }
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = list(executor.map(predict_one, extracted))

    for p in futures:
        if p:
            predictions.append(p)
            if p["correct"]:
                correct_count += 1

    elapsed = time.time() - start_time
    total = len(predictions)
    accuracy = correct_count / total if total > 0 else 0

    print(f"\nProcessed {total} predictions in {elapsed:.1f}s")
    print(f"Speed: {total/elapsed:.0f} predictions/sec")

    return compile_results(predictions, elapsed)


def compile_results(predictions: List[Dict], elapsed: float) -> Dict[str, Any]:
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

    # Confidence calibration
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

    # Direction stats
    up_predictions = sum(1 for p in predictions if p["predicted_direction"] == "UP")
    up_correct = sum(1 for p in predictions if p["predicted_direction"] == "UP" and p["correct"])
    down_correct = sum(1 for p in predictions if p["predicted_direction"] == "DOWN" and p["correct"])

    return {
        "total_predictions": total,
        "correct_predictions": correct,
        "accuracy": accuracy,
        "accuracy_pct": round(accuracy * 100, 2),
        "token_accuracy": token_accuracy,
        "calibration": calibration,
        "up_predictions": up_predictions,
        "down_predictions": total - up_predictions,
        "up_accuracy": round(up_correct / up_predictions * 100, 1) if up_predictions > 0 else 0,
        "down_accuracy": round(down_correct / (total - up_predictions) * 100, 1) if (total - up_predictions) > 0 else 0,
        "predictions": predictions[:100],  # limit output size
        "elapsed_seconds": round(elapsed, 2),
        "predictions_per_second": round(total / elapsed, 1) if elapsed > 0 else 0,
        "timestamp": datetime.now().isoformat(),
    }


def print_summary(results: Dict[str, Any]) -> None:
    if "error" in results:
        print(f"\nERROR: {results['error']}")
        return

    print(f"\n{'='*60}")
    print(f"FAST BATCH ACCURACY RESULTS")
    print(f"{'='*60}")
    print(f"Total predictions:    {results['total_predictions']:,}")
    print(f"Correct:              {results['correct_predictions']:,}")
    print(f"Accuracy:             {results['accuracy_pct']:.1f}%")
    print(f"Speed:                {results['predictions_per_second']:.0f} pred/sec")
    print(f"Time:                 {results['elapsed_seconds']:.1f}s")
    print(f"UP accuracy:          {results['up_accuracy']:.1f}% ({results['up_predictions']} UP)")
    print(f"DOWN accuracy:        {results['down_accuracy']:.1f}% ({results['down_predictions']} DOWN)")

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
    improvement = (acc - baseline) / baseline * 100

    print(f"\n{'='*60}")
    print(f"Grade: {grade} | vs coin-flip: {improvement:+.1f}%")
    print(f"Statistical confidence: {results['total_predictions']} samples")
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="Vera OS Fast Batch Accuracy Test")
    parser.add_argument("--limit", type=int, default=None, help="Max samples to test")
    parser.add_argument("--workers", type=int, default=16, help="Thread pool workers")
    parser.add_argument("--output", type=str, default="tests/results/accuracy_test_fast.json")
    args = parser.parse_args()

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    results = run_fast_batch_test(limit=args.limit, workers=args.workers)

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2, default=lambda x: float(x) if hasattr(x, 'item') else str(x))

    print(f"\nResults saved to: {args.output}")
    print_summary(results)


if __name__ == "__main__":
    main()
