#!/usr/bin/env python3
"""Run an HBAR prediction from caller-supplied market features."""

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vera_os import PredictionService


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a Vera OS HBAR prediction.")
    parser.add_argument("--predict", action="store_true", help="Load models and run the sample prediction.")
    args = parser.parse_args()

    if not args.predict:
        print("Use --predict to load local models and run the sample HBAR prediction.")
        return

    service = PredictionService()
    price_snapshot = {
        "timestamp": time.time(),
        "price": 0.09,
        "change_24h": 0.8,
        "volume_24h": 75_000_000,
    }
    features = service.features_from_price("hbar", price_snapshot)
    result = service.predict("hbar", features)
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
