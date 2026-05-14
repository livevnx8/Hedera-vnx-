#!/usr/bin/env python3
"""Monitor the live accuracy test progress."""

import json
import sys
import time
from pathlib import Path

LOG_FILE = "/tmp/vera_live_test.log"
RESULTS_FILE = "/home/vera-live-0-1/hedera-llm-api/tests/results/accuracy_test_live.json"


def tail_log(lines=20):
    if not Path(LOG_FILE).exists():
        return "No log file yet"
    with open(LOG_FILE) as f:
        content = f.read().splitlines()
        return "\n".join(content[-lines:])


def check_results():
    if not Path(RESULTS_FILE).exists():
        return None
    try:
        with open(RESULTS_FILE) as f:
            data = json.load(f)
        return data
    except Exception:
        return None


def main():
    print("=" * 60)
    print("Vera OS Live Test Monitor")
    print("=" * 60)
    print(f"Log:   {LOG_FILE}")
    print(f"Data:  {RESULTS_FILE}")
    print()

    results = check_results()
    if results:
        print(f"Current results: {results.get('total_predictions', 0)} predictions")
        print(f"Accuracy so far: {results.get('accuracy_pct', 0):.1f}%")
        print(f"Correct: {results.get('correct_predictions', 0)} / {results.get('total_predictions', 0)}")
    else:
        print("Results file not created yet (test still running first round)")

    print("\n" + "=" * 60)
    print("Latest log output:")
    print("=" * 60)
    print(tail_log(30))


if __name__ == "__main__":
    main()
