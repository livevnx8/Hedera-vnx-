"""
Benchmark PyTorch inference latency directly (no HTTP server needed).
Compares standard model loading vs checkpoint loading, and measures
forward-pass latency for different sequence lengths.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict, List

import torch

from architecture import MeridianConfig, MeridianModel
from infrastructure import build_config, config_from_checkpoint_payload
from tokenizer import SimpleTokenizer


def benchmark_forward(
    model: MeridianModel,
    tokenizer: SimpleTokenizer,
    prompts: List[str],
    max_tokens: int,
    device: torch.device,
) -> Dict[str, Any]:
    model.eval()
    model.to(device)

    latencies_ms: List[float] = []
    token_counts: List[int] = []

    for prompt in prompts:
        tokens = tokenizer.encode(prompt, max_length=512)
        input_ids = torch.tensor([tokens], dtype=torch.long, device=device)

        with torch.no_grad():
            # Warmup
            _ = model(input_ids)
            if device.type == "cuda":
                torch.cuda.synchronize()

            # Timed run
            start = time.perf_counter()
            for _ in range(max_tokens):
                logits = model(input_ids)
                next_token = logits[:, -1, :].argmax(dim=-1, keepdim=True)
                input_ids = torch.cat([input_ids, next_token], dim=1)
            if device.type == "cuda":
                torch.cuda.synchronize()
            elapsed_ms = (time.perf_counter() - start) * 1000

        latencies_ms.append(elapsed_ms)
        token_counts.append(len(tokens))

    return {
        "device": str(device),
        "prompts": len(prompts),
        "max_tokens_per_prompt": max_tokens,
        "latency_ms": {
            "mean": sum(latencies_ms) / len(latencies_ms),
            "median": sorted(latencies_ms)[len(latencies_ms) // 2],
            "min": min(latencies_ms),
            "max": max(latencies_ms),
        },
        "tokens_per_sec": {
            "mean": (sum(token_counts) + len(prompts) * max_tokens) / (sum(latencies_ms) / 1000),
        },
        "details": [
            {"prompt_len": tc, "latency_ms": lat}
            for tc, lat in zip(token_counts, latencies_ms)
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--preset", default="base")
    parser.add_argument("--prompts", default="models/meridian/vera-dataset.eval.jsonl")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--max-tokens", type=int, default=16)
    parser.add_argument("--cpu", action="store_true")
    args = parser.parse_args()

    device = torch.device("cpu" if args.cpu else ("cuda" if torch.cuda.is_available() else "cpu"))

    # Load checkpoint
    ckpt = torch.load(args.checkpoint, map_location=device, weights_only=False)
    cfg = build_config(args.preset)
    cfg = config_from_checkpoint_payload(ckpt, cfg)

    model = MeridianModel(cfg)
    model.load_state_dict(ckpt["model_state_dict"])
    tokenizer = SimpleTokenizer(vocab_size=cfg.vocab_size)

    # Load prompts
    prompts: List[str] = []
    with open(args.prompts, "r", encoding="utf-8") as f:
        for line in f:
            if len(prompts) >= args.limit:
                break
            try:
                obj = json.loads(line.strip())
                prompt = obj.get("instruction", "")
                if obj.get("input"):
                    prompt += f"\n\nInput:\n{obj['input']}"
                prompts.append(prompt)
            except json.JSONDecodeError:
                continue

    if not prompts:
        prompts = [
            "What's the HBAR price?",
            "Check my account balance for 0.0.1234",
            "Send message to audit topic",
        ]

    result = benchmark_forward(model, tokenizer, prompts, args.max_tokens, device)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
