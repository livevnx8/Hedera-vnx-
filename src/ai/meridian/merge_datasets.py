#!/usr/bin/env python3
"""
Merge multiple data sources into a comprehensive training set for medium model.
Sources: real Vera traces + augmented data + tool execution traces.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Dict, List, Any


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    """Load JSONL file."""
    examples = []
    if not path.exists():
        return examples
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                examples.append(json.loads(line.strip()))
            except json.JSONDecodeError:
                continue
    return examples


def deduplicate(examples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicates based on instruction+output hash."""
    seen = set()
    unique = []
    for ex in examples:
        key = hash(ex.get("instruction", "") + ex.get("output", ""))
        if key not in seen:
            seen.add(key)
            unique.append(ex)
    return unique


def split_train_eval(examples: List[Dict[str, Any]], eval_ratio: float = 0.1) -> tuple:
    """Split into train/eval."""
    random.shuffle(examples)
    eval_size = int(len(examples) * eval_ratio)
    return examples[eval_size:], examples[:eval_size]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--real-data", default="models/meridian/vera-dataset.jsonl")
    parser.add_argument("--augmented-train", default="models/meridian/augmented-dataset.train.jsonl")
    parser.add_argument("--augmented-eval", default="models/meridian/augmented-dataset.eval.jsonl")
    parser.add_argument("--tool-traces", default="models/meridian/vera-tool-traces.jsonl")
    parser.add_argument("--output-train", default="models/meridian/combined-dataset.train.jsonl")
    parser.add_argument("--output-eval", default="models/meridian/combined-dataset.eval.jsonl")
    parser.add_argument("--eval-ratio", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=137)
    args = parser.parse_args()
    
    random.seed(args.seed)
    
    # Load all sources
    print("Loading data sources...")
    real_data = load_jsonl(Path(args.real_data))
    print(f"  Real Vera data: {len(real_data)} examples")
    
    augmented_train = load_jsonl(Path(args.augmented_train))
    augmented_eval = load_jsonl(Path(args.augmented_eval))
    print(f"  Augmented train: {len(augmented_train)} examples")
    print(f"  Augmented eval: {len(augmented_eval)} examples")
    
    tool_traces = load_jsonl(Path(args.tool_traces))
    print(f"  Tool traces: {len(tool_traces)} examples")
    
    # Combine and deduplicate
    all_examples = real_data + augmented_train + tool_traces
    print(f"\nTotal before dedup: {len(all_examples)}")
    
    unique_examples = deduplicate(all_examples)
    print(f"Total after dedup: {len(unique_examples)}")
    
    # Split
    train_examples, eval_examples = split_train_eval(unique_examples, args.eval_ratio)
    
    # Save
    Path(args.output_train).parent.mkdir(parents=True, exist_ok=True)
    
    with open(args.output_train, "w", encoding="utf-8") as f:
        for ex in train_examples:
            f.write(json.dumps(ex) + "\n")
    
    with open(args.output_eval, "w", encoding="utf-8") as f:
        for ex in eval_examples:
            f.write(json.dumps(ex) + "\n")
    
    # Count task types
    task_counts = {}
    for ex in unique_examples:
        tt = ex.get("task_type", "unknown")
        task_counts[tt] = task_counts.get(tt, 0) + 1
    
    print(f"\nFinal dataset:")
    print(f"  Train: {len(train_examples)} examples")
    print(f"  Eval: {len(eval_examples)} examples")
    print(f"\nTask distribution:")
    for task, count in sorted(task_counts.items(), key=lambda x: -x[1])[:10]:
        print(f"  {task}: {count}")
    
    # Save manifest
    manifest = {
        "train_examples": len(train_examples),
        "eval_examples": len(eval_examples),
        "total_unique": len(unique_examples),
        "sources": {
            "real_vera": len(real_data),
            "augmented": len(augmented_train) + len(augmented_eval),
            "tool_traces": len(tool_traces),
        },
        "task_counts": task_counts,
    }
    manifest_path = Path(args.output_train).parent / "combined-dataset.manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nManifest saved to: {manifest_path}")


if __name__ == "__main__":
    main()
