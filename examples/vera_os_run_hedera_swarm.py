#!/usr/bin/env python3
"""Inspect or run the Vera OS Hedera specialist swarm."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vera_os import HederaSpecialistSwarm


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect or run the Hedera specialist swarm.")
    parser.add_argument("--run", action="store_true", help="Execute all specialists.")
    args = parser.parse_args()

    swarm = HederaSpecialistSwarm()
    payload = swarm.run_all() if args.run else swarm.status()
    print(json.dumps(payload, indent=2, default=str))


if __name__ == "__main__":
    main()
