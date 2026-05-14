#!/usr/bin/env python3
"""
Watch checkpoint dir and auto-run evaluation on real Vera data
when new checkpoints appear (after each epoch).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path


def run_eval(checkpoint: Path, preset: str, data: Path, log: Path) -> dict:
    """Run eval.py on a checkpoint, return parsed results."""
    cmd = [
        sys.executable, "src/ai/meridian/eval.py",
        "--checkpoint", str(checkpoint),
        "--preset", preset,
        "--data", str(data),
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=600, cwd=Path(__file__).parent.parent.parent.parent
        )
    except subprocess.TimeoutExpired:
        return {"error": "timeout"}

    output = result.stdout + "\n" + result.stderr
    # Append to log
    with open(log, "a", encoding="utf-8") as f:
        f.write(f"\n{'='*60}\nCheckpoint: {checkpoint.name}\n{'='*60}\n")
        f.write(output)
        f.write("\n")

    # Parse accuracy lines
    parsed: dict = {"checkpoint": checkpoint.name}
    for line in output.splitlines():
        if "accuracy:" in line:
            parts = line.strip().split()
            if len(parts) >= 2:
                try:
                    parsed["accuracy"] = float(parts[-1].replace("%", ""))
                except ValueError:
                    pass
        if "perplexity:" in line:
            parts = line.strip().split()
            if len(parts) >= 2:
                try:
                    parsed["perplexity"] = float(parts[-1])
                except ValueError:
                    pass
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint-dir", default="models/meridian/checkpoints/small-v1-finetuned")
    parser.add_argument("--preset", default="base")
    parser.add_argument("--data", default="models/meridian/vera-dataset.eval.jsonl")
    parser.add_argument("--log", default="/tmp/auto_eval_realdata.log")
    parser.add_argument("--poll", type=int, default=60)
    args = parser.parse_args()

    checkpoint_dir = Path(args.checkpoint_dir)
    seen: set = set()
    print(f"Watching {checkpoint_dir} for new checkpoints...")
    print(f"Evaluating on {args.data}")
    print(f"Logging to {args.log}")

    while True:
        checkpoints = sorted(
            checkpoint_dir.glob("*.pt"),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )
        for ckpt in checkpoints:
            if ckpt.name in seen:
                continue
            seen.add(ckpt.name)
            print(f"\n[+] New checkpoint: {ckpt.name}")
            result = run_eval(ckpt, args.preset, Path(args.data), Path(args.log))
            print(f"    Result: {json.dumps(result, indent=2)}")
        time.sleep(args.poll)


if __name__ == "__main__":
    main()
