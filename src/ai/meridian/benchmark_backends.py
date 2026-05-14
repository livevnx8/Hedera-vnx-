"""
Compare Meridian backends over Vera-native eval examples.

Run PyTorch and bitnet.cpp servers on different ports, then compare latency and
rough task accuracy through the shared /v1/infer contract.
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

from infrastructure import write_json


def load_examples(path: Path, limit: int) -> List[Dict[str, Any]]:
    examples: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            if len(examples) >= limit:
                break
            line = line.strip()
            if not line:
                continue
            try:
                examples.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return examples


def post_infer(url: str, prompt: str, max_tokens: int, temperature: float) -> Dict[str, Any]:
    payload = json.dumps({
        "prompt": prompt,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{url.rstrip('/')}/v1/infer",
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    started = time.time()
    with urllib.request.urlopen(request, timeout=120) as response:
        body = response.read().decode("utf-8")
    elapsed_ms = int((time.time() - started) * 1000)
    result = json.loads(body)
    result.setdefault("latency_ms", elapsed_ms)
    return result


def normalize(text: str) -> str:
    return " ".join(text.strip().lower().split())


def score_prediction(expected: str, prediction: str) -> bool:
    exp = normalize(expected)
    pred = normalize(prediction)
    if not exp:
        return False
    if exp == pred:
        return True
    if exp in pred:
        return True
    if exp.startswith("[") and "]" in exp:
        # Tool-routing examples can be verbose; substring match catches exact tool names.
        try:
            expected_tools = [item.get("tool", "") for item in json.loads(expected)]
            return all(tool and tool.lower() in pred for tool in expected_tools)
        except Exception:
            return False
    return False


def benchmark_backend(name: str, url: str, examples: List[Dict[str, Any]], max_tokens: int, temperature: float) -> Dict[str, Any]:
    latencies: List[int] = []
    correct = 0
    failures = 0
    samples: List[Dict[str, Any]] = []

    for idx, example in enumerate(examples):
        prompt = example.get("instruction", "")
        if example.get("input"):
            prompt = f"{prompt}\n\nInput:\n{example['input']}"
        expected = str(example.get("output", ""))

        try:
            result = post_infer(url, prompt, max_tokens, temperature)
            content = str(result.get("content", ""))
            latency = int(result.get("latency_ms", 0))
            latencies.append(latency)
            is_correct = score_prediction(expected, content)
            correct += 1 if is_correct else 0
            if idx < 5:
                samples.append({
                    "index": idx,
                    "task_type": example.get("task_type"),
                    "expected": expected[:240],
                    "prediction": content[:240],
                    "correct": is_correct,
                    "latency_ms": latency,
                })
        except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
            failures += 1
            if idx < 5:
                samples.append({
                    "index": idx,
                    "task_type": example.get("task_type"),
                    "error": str(exc),
                })

    completed = len(examples) - failures
    return {
        "name": name,
        "url": url,
        "examples": len(examples),
        "completed": completed,
        "failures": failures,
        "accuracy": correct / completed if completed else 0,
        "latency_ms": {
            "mean": statistics.mean(latencies) if latencies else None,
            "median": statistics.median(latencies) if latencies else None,
            "min": min(latencies) if latencies else None,
            "max": max(latencies) if latencies else None,
        },
        "samples": samples,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Meridian PyTorch and bitnet.cpp backends")
    parser.add_argument("--data", default="models/meridian/dataset.eval.jsonl")
    parser.add_argument("--pytorch-url", default="http://127.0.0.1:8123")
    parser.add_argument("--bitnetcpp-url", default="http://127.0.0.1:8124")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--max-tokens", type=int, default=64)
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--output", default="models/meridian/backend-benchmark.json")
    args = parser.parse_args()

    examples = load_examples(Path(args.data), args.limit)
    if not examples:
        raise SystemExit(f"No examples found in {args.data}")

    report = {
        "data": args.data,
        "limit": args.limit,
        "backends": [
            benchmark_backend("pytorch", args.pytorch_url, examples, args.max_tokens, args.temperature),
            benchmark_backend("bitnetcpp", args.bitnetcpp_url, examples, args.max_tokens, args.temperature),
        ],
    }
    write_json(Path(args.output), report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
