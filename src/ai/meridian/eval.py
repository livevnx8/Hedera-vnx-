"""
Meridian Evaluation Suite

Benchmarks the ternary model against Vera's core agent tasks:
1. Tool routing accuracy
2. HCS topic classification accuracy
3. Agent spawn decision accuracy
4. Block stream anomaly detection F1
5. Perplexity on held-out text

Usage:
    python src/ai/meridian/eval.py \
        --checkpoint models/meridian/checkpoints/best.pt \
        --data models/meridian/dataset.eval.jsonl \
        --vocab_size 32000
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Dict, List, Tuple

import torch
from torch import Tensor

from architecture import MeridianConfig, MeridianModel
from infrastructure import build_config, config_from_checkpoint_payload, write_json
from tokenizer import SimpleTokenizer, collate_batch


# ─── Task Evaluators ────────────────────────────────────────────────────────

class TaskEvaluator:
    """Base class for task-specific evaluation."""

    def __init__(self, model: MeridianModel, tokenizer: SimpleTokenizer, device: torch.device, max_length: int = 256):
        self.model = model
        self.tokenizer = tokenizer
        self.device = device
        self.max_length = max_length
        self.model.eval()

    @torch.no_grad()
    def generate(self, prompt: str, max_new_tokens: int = 128, temperature: float = 0.7) -> str:
        """Greedy / sampling generation for evaluation."""
        tokens = self.tokenizer.encode(prompt, max_length=self.max_length)
        input_ids = torch.tensor([tokens], dtype=torch.long, device=self.device)

        for _ in range(max_new_tokens):
            logits = self.model(input_ids)
            next_logits = logits[:, -1, :] / temperature
            probs = torch.softmax(next_logits, dim=-1)
            next_token = torch.multinomial(probs, num_samples=1)
            input_ids = torch.cat([input_ids, next_token], dim=1)
            if next_token.item() == self.tokenizer.eos_id:
                break
            if input_ids.shape[1] >= self.max_length:
                break

        output_ids = input_ids[0].tolist()
        # Decode only the new tokens
        new_ids = output_ids[len(tokens):]
        return self.tokenizer.decode(new_ids)

    def score(self, example: Dict[str, str]) -> Tuple[bool, str]:
        """Score a single example. Returns (correct: bool, prediction: str)."""
        raise NotImplementedError


class ToolRoutingEvaluator(TaskEvaluator):
    """Evaluate tool selection accuracy."""

    def score(self, example: Dict[str, str]) -> Tuple[bool, str]:
        prompt = self._build_prompt(example)
        prediction = self.generate(prompt, max_new_tokens=128)
        # Extract JSON array of tool names from prediction
        try:
            # Try to find JSON array
            match = re.search(r'\[.*?\]', prediction, re.DOTALL)
            if match:
                pred_tools = json.loads(match.group())
                pred_names = [t.get("tool", t) for t in pred_tools] if isinstance(pred_tools, list) else [pred_tools]
            else:
                # Fallback: extract tool names from raw text
                pred_names = self._extract_tool_names(prediction)
        except (json.JSONDecodeError, ValueError):
            pred_names = self._extract_tool_names(prediction)

        # Ground truth: extract from expected output
        expected = example.get("output", "")
        try:
            exp_tools = json.loads(expected)
            exp_names = [t.get("tool", t) for t in exp_tools] if isinstance(exp_tools, list) else [exp_tools]
        except json.JSONDecodeError:
            exp_names = self._extract_tool_names(expected)

        correct = set(pred_names) == set(exp_names)
        return correct, prediction

    def _build_prompt(self, example: Dict[str, str]) -> str:
        return example.get("instruction", "")

    def _extract_tool_names(self, text: str) -> List[str]:
        """Fallback: extract tool names mentioned in text."""
        tools = ["get_price_chart", "get_account_balance", "submit_topic_message",
                 "create_scheduled_transaction", "verify_block_proof",
                 "spawn_lattice_agent", "query_carbon_retirement", "get_defi_yield"]
        found = []
        for t in tools:
            if t in text.lower():
                found.append(t)
        return found if found else ["unknown"]


class TopicClassificationEvaluator(TaskEvaluator):
    """Evaluate HCS topic classification accuracy."""

    def score(self, example: Dict[str, str]) -> Tuple[bool, str]:
        prompt = example.get("instruction", "")
        prediction = self.generate(prompt, max_new_tokens=20)
        expected = example.get("output", "").strip()
        # Clean prediction: take first non-empty line
        pred_clean = prediction.strip().split()[0] if prediction.strip() else ""
        correct = pred_clean == expected
        return correct, prediction


class AgentSpawnEvaluator(TaskEvaluator):
    """Evaluate agent spawn decision accuracy."""

    def score(self, example: Dict[str, str]) -> Tuple[bool, str]:
        prompt = example.get("instruction", "")
        prediction = self.generate(prompt, max_new_tokens=10)
        expected = example.get("output", "").strip().lower()
        pred_clean = prediction.strip().split()[0].lower() if prediction.strip() else ""
        correct = pred_clean == expected
        return correct, prediction


class AnomalyDetectionEvaluator(TaskEvaluator):
    """Evaluate block stream anomaly detection."""

    def score(self, example: Dict[str, str]) -> Tuple[bool, str]:
        prompt = example.get("instruction", "")
        prediction = self.generate(prompt, max_new_tokens=30)
        expected = example.get("output", "").strip().lower()
        # Check if prediction starts with expected prefix
        pred_clean = prediction.strip().lower()
        correct = pred_clean.startswith(expected.split(":")[0]) if ":" in expected else pred_clean.startswith(expected)
        return correct, prediction


# ─── Perplexity Evaluator ─────────────────────────────────────────────────

@torch.no_grad()
def evaluate_perplexity(model: MeridianModel, dataloader, device: torch.device, pad_id: int = 0) -> float:
    """Standard language modeling perplexity."""
    import torch.nn.functional as F
    model.eval()
    total_loss = 0.0
    total_tokens = 0

    for inputs, labels in dataloader:
        inputs = inputs.to(device)
        labels = labels.to(device)

        logits = model(inputs)
        shift_logits = logits[:, :-1, :].contiguous()
        shift_labels = labels[:, 1:].contiguous()

        loss = F.cross_entropy(
            shift_logits.view(-1, shift_logits.size(-1)),
            shift_labels.view(-1),
            ignore_index=pad_id,
            reduction="sum",
        )
        valid = (shift_labels != pad_id).sum().item()
        total_loss += loss.item()
        total_tokens += valid

    return math.exp(total_loss / max(1, total_tokens))


# ─── Main Evaluation ──────────────────────────────────────────────────────

def evaluate_all(
    checkpoint_path: Path,
    data_path: Path,
    config: MeridianConfig,
    device: torch.device,
    max_length: int = 512,
) -> Dict[str, float]:
    """Run full evaluation suite."""
    print(f"Loading checkpoint: {checkpoint_path}")
    tokenizer = SimpleTokenizer(vocab_size=config.vocab_size)

    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    config = config_from_checkpoint_payload(ckpt, config)
    tokenizer = SimpleTokenizer(vocab_size=config.vocab_size)
    model = MeridianModel(config)
    model.load_state_dict(ckpt["model_state_dict"])
    model.to(device)
    model.eval()

    # Load eval data and route to correct evaluator
    evaluators = {
        "tool_routing": ToolRoutingEvaluator(model, tokenizer, device, max_length),
        "topic_classification": TopicClassificationEvaluator(model, tokenizer, device, max_length),
        "agent_spawn": AgentSpawnEvaluator(model, tokenizer, device, max_length),
        "anomaly_detection": AnomalyDetectionEvaluator(model, tokenizer, device, max_length),
    }

    # Categorize examples by task
    task_examples: Dict[str, List[Dict]] = {k: [] for k in evaluators}
    with open(data_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                ex = json.loads(line)
                instruction = ex.get("instruction", "")
                if "tool" in instruction.lower() and "route" in instruction.lower():
                    task_examples["tool_routing"].append(ex)
                elif "topic" in instruction.lower() and "classif" in instruction.lower():
                    task_examples["topic_classification"].append(ex)
                elif "spawn" in instruction.lower() or "agent" in instruction.lower():
                    task_examples["agent_spawn"].append(ex)
                elif "anomal" in instruction.lower() or "block stream" in instruction.lower():
                    task_examples["anomaly_detection"].append(ex)
                else:
                    # Default to tool routing
                    task_examples["tool_routing"].append(ex)
            except json.JSONDecodeError:
                continue

    results: Dict[str, float] = {}
    for task_name, examples in task_examples.items():
        if not examples:
            continue
        evaluator = evaluators[task_name]
        correct = 0
        print(f"\nEvaluating {task_name}: {len(examples)} examples")
        for i, ex in enumerate(examples[:100]):  # cap at 100 per task for speed
            is_correct, pred = evaluator.score(ex)
            if is_correct:
                correct += 1
            if i < 3:  # show first 3 examples
                print(f"  Ex {i + 1}: {'✓' if is_correct else '✗'} | pred={pred[:80]}...")
        acc = correct / len(examples[:100])
        results[f"{task_name}_accuracy"] = acc
        print(f"  {task_name} accuracy: {acc:.2%}")

    # Perplexity
    from torch.utils.data import DataLoader
    from train import InstructionDataset
    eval_ds = InstructionDataset(data_path, tokenizer, max_length)
    if len(eval_ds) > 0:
        eval_loader = DataLoader(eval_ds, batch_size=4, collate_fn=lambda b: collate_batch(b, pad_token_id=0))
        ppl = evaluate_perplexity(model, eval_loader, device)
        results["perplexity"] = ppl
        print(f"\nPerplexity: {ppl:.2f}")

    # Parameter stats
    total = sum(p.numel() for p in model.parameters())
    results["parameters_millions"] = total / 1e6
    print(f"\nModel parameters: {total / 1e6:.1f}M")

    # Summary
    print("\n" + "=" * 50)
    print("MERIDIAN EVALUATION SUMMARY")
    print("=" * 50)
    for k, v in results.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.4f}")
        else:
            print(f"  {k}: {v}")

    return results


# ─── CLI ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Evaluate Meridian model")
    parser.add_argument("--checkpoint", required=True, help="Path to checkpoint .pt file")
    parser.add_argument("--data", default="models/meridian/dataset.eval.jsonl", help="Eval data")
    parser.add_argument("--output", help="Optional JSON result path")
    parser.add_argument("--preset", choices=["smoke", "small", "base", "medium", "large", "xl", "xxl"], default="base")
    parser.add_argument("--vocab_size", type=int)
    parser.add_argument("--d_model", type=int)
    parser.add_argument("--n_layers", type=int)
    parser.add_argument("--n_heads", type=int)
    parser.add_argument("--max_seq_len", type=int, default=512)
    parser.add_argument("--cpu", action="store_true")
    args = parser.parse_args()

    device = torch.device("cpu" if args.cpu else ("cuda" if torch.cuda.is_available() else "cpu"))
    cfg = build_config(
        args.preset,
        vocab_size=args.vocab_size,
        d_model=args.d_model,
        n_layers=args.n_layers,
        n_heads=args.n_heads,
        max_seq_len=args.max_seq_len,
    )
    results = evaluate_all(Path(args.checkpoint), Path(args.data), cfg, device, args.max_seq_len)
    if args.output:
        write_json(Path(args.output), results)


if __name__ == "__main__":
    main()
