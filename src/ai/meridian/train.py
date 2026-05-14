"""
Meridian Training Loop

Trains the ternary transformer from scratch on Vera agent task data.

Key features:
- Straight-through estimator for ternary weight gradients
- Mixed precision training (bf16 activations + ternary weights)
- Gradient checkpointing for 8GB VRAM
- Cosine LR schedule with warmup
- Checkpointing every N steps

Usage:
    python src/ai/meridian/train.py \
        --data models/meridian/dataset.train.jsonl \
        --eval models/meridian/dataset.eval.jsonl \
        --output models/meridian/checkpoints \
        --epochs 10 --batch_size 4 --max_seq_len 512
"""

from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

import torch
import torch.nn.functional as F
from torch import Tensor
from torch.optim import AdamW
from torch.utils.data import DataLoader, Dataset

from architecture import MeridianConfig, MeridianModel
from infrastructure import (
    build_config,
    checkpoint_metadata,
    config_to_dict,
    file_sha256,
    set_reproducible_seed,
    write_json,
)
from tokenizer import SimpleTokenizer, collate_batch, format_instruction


# ─── Dataset ──────────────────────────────────────────────────────────────

class InstructionDataset(Dataset):
    """Simple instruction-following dataset."""

    def __init__(self, path: Path, tokenizer: "SimpleTokenizer", max_length: int = 512):
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.examples: List[List[int]] = []

        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    text = format_instruction(obj)
                    tokens = tokenizer.encode(text, max_length=max_length)
                    if len(tokens) >= 2:  # need at least one input + one target token
                        self.examples.append(tokens)
                except (json.JSONDecodeError, KeyError):
                    continue

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, idx: int) -> Tensor:
        return torch.tensor(self.examples[idx], dtype=torch.long)




# ─── Training Utilities ─────────────────────────────────────────────────────

def get_lr(step: int, warmup_steps: int, max_steps: int, max_lr: float, min_lr: float = 1e-6) -> float:
    """Cosine LR schedule with linear warmup."""
    if step < warmup_steps:
        return max_lr * (step / warmup_steps)
    progress = (step - warmup_steps) / max(1, max_steps - warmup_steps)
    return min_lr + (max_lr - min_lr) * 0.5 * (1.0 + math.cos(math.pi * progress))


@torch.no_grad()
def evaluate(model: MeridianModel, dataloader: DataLoader, device: torch.device, pad_id: int = 0) -> Dict[str, float]:
    """Evaluate perplexity and loss on validation set."""
    model.eval()
    total_loss = 0.0
    total_tokens = 0

    for batch_idx, (inputs, labels) in enumerate(dataloader):
        inputs = inputs.to(device)
        labels = labels.to(device)

        with torch.autocast(device_type=str(device).split(":")[0], dtype=torch.bfloat16):
            logits = model(inputs)
            # Shift for causal LM: predict next token
            shift_logits = logits[:, :-1, :].contiguous()
            shift_labels = labels[:, 1:].contiguous()
            loss = F.cross_entropy(
                shift_logits.view(-1, shift_logits.size(-1)),
                shift_labels.view(-1),
                ignore_index=pad_id,
                reduction="sum",
            )

        valid_tokens = (shift_labels != pad_id).sum().item()
        total_loss += loss.item()
        total_tokens += valid_tokens

    avg_loss = total_loss / max(1, total_tokens)
    perplexity = math.exp(avg_loss)
    return {"loss": avg_loss, "perplexity": perplexity}


def save_checkpoint(
    model: MeridianModel,
    optimizer: AdamW,
    step: int,
    path: Path,
    config: MeridianConfig,
    extra: Dict[str, Any] | None = None,
) -> None:
    """Save model + optimizer state."""
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            **checkpoint_metadata(step=step, model_config=config, extra=extra),
            "step": step,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
        },
        path,
    )
    print(f"  → Checkpoint saved: {path}")


# ─── Main Training Loop ───────────────────────────────────────────────────

def train(
    model: MeridianModel,
    train_loader: DataLoader,
    eval_loader: DataLoader,
    device: torch.device,
    config: MeridianConfig,
    epochs: int = 3,
    max_lr: float = 3e-4,
    warmup_ratio: float = 0.1,
    grad_clip: float = 1.0,
    checkpoint_every: int = 500,
    grad_accum_steps: int = 1,
    output_dir: Path = Path("models/meridian/checkpoints"),
    resume_from: Optional[Path] = None,
) -> None:
    """Full training loop with mixed precision, gradient accumulation, and gradient checkpointing."""
    model.to(device)
    model.train()

    optimizer = AdamW(model.parameters(), lr=max_lr, betas=(0.9, 0.95), weight_decay=0.1)

    step = 0
    best_eval_loss = float("inf")

    # Resume from checkpoint if provided
    if resume_from and resume_from.exists():
        ckpt = torch.load(resume_from, map_location=device, weights_only=False)
        model.load_state_dict(ckpt["model_state_dict"])
        optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        step = ckpt.get("step", 0)
        print(f"Resumed from {resume_from} at step {step}")

    total_steps = (len(train_loader) // grad_accum_steps) * epochs
    warmup_steps = int(total_steps * warmup_ratio)

    pad_id = 0

    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(
        output_dir / "run_config.json",
        {
            "model_config": config_to_dict(config),
            "epochs": epochs,
            "max_lr": max_lr,
            "warmup_ratio": warmup_ratio,
            "grad_clip": grad_clip,
            "checkpoint_every": checkpoint_every,
            "grad_accum_steps": grad_accum_steps,
        },
    )

    scaler = torch.amp.GradScaler('cuda') if device.type == "cuda" else None

    print(f"Training: {total_steps} steps, warmup={warmup_steps}, device={device}")
    print(f"Model parameters: {sum(p.numel() for p in model.parameters()) / 1e6:.1f}M")

    for epoch in range(epochs):
        epoch_start = time.time()
        for batch_idx, (inputs, labels) in enumerate(train_loader):
            inputs = inputs.to(device)
            labels = labels.to(device)

            # Mixed precision forward
            with torch.autocast(device_type=str(device).split(":")[0], dtype=torch.bfloat16):
                logits = model(inputs)
                shift_logits = logits[:, :-1, :].contiguous()
                shift_labels = labels[:, 1:].contiguous()
                loss = F.cross_entropy(
                    shift_logits.view(-1, shift_logits.size(-1)),
                    shift_labels.view(-1),
                    ignore_index=pad_id,
                )
                loss = loss / grad_accum_steps  # Normalize for accumulation

            if scaler:
                scaler.scale(loss).backward()
            else:
                loss.backward()

            # Only step after accumulating enough gradients
            if (batch_idx + 1) % grad_accum_steps == 0:
                step += 1
                lr = get_lr(step, warmup_steps, total_steps, max_lr)
                for param_group in optimizer.param_groups:
                    param_group["lr"] = lr

                if scaler:
                    scaler.unscale_(optimizer)
                    torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
                    optimizer.step()

                optimizer.zero_grad()

                if step % 10 == 0:
                    print(f"  step={step:>5}  loss={loss.item():.4f}  lr={lr:.2e}")

            if step % checkpoint_every == 0:
                save_checkpoint(model, optimizer, step, output_dir / f"checkpoint-{step}.pt", config)
                # Quick eval
                eval_metrics = evaluate(model, eval_loader, device, pad_id)
                print(f"  Eval: loss={eval_metrics['loss']:.4f}  ppl={eval_metrics['perplexity']:.2f}")
                if eval_metrics["loss"] < best_eval_loss:
                    best_eval_loss = eval_metrics["loss"]
                    save_checkpoint(
                        model,
                        optimizer,
                        step,
                        output_dir / "best.pt",
                        config,
                        {"eval": eval_metrics, "best_eval_loss": best_eval_loss},
                    )
                model.train()

        epoch_time = time.time() - epoch_start
        print(f"Epoch {epoch + 1}/{epochs} complete in {epoch_time:.1f}s")

    # Final save
    final_metrics = evaluate(model, eval_loader, device, pad_id)
    save_checkpoint(model, optimizer, step, output_dir / "final.pt", config, {"eval": final_metrics})
    write_json(
        output_dir / "training_summary.json",
        {
            "final_step": step,
            "best_eval_loss": best_eval_loss if best_eval_loss != float("inf") else None,
            "final_eval": final_metrics,
            "model_config": config_to_dict(config),
        },
    )
    print("Training complete.")


# ─── CLI ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train Meridian ternary transformer")
    parser.add_argument("--data", default="models/meridian/dataset.train.jsonl", help="Training data")
    parser.add_argument("--eval", default="models/meridian/dataset.eval.jsonl", help="Eval data")
    parser.add_argument("--output", default="models/meridian/checkpoints", help="Checkpoint directory")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--max_seq_len", type=int, default=512)
    parser.add_argument("--max_lr", type=float, default=3e-4)
    parser.add_argument("--preset", choices=["smoke", "small", "base", "medium", "large", "xl", "xxl"], default="base")
    parser.add_argument("--vocab_size", type=int)
    parser.add_argument("--d_model", type=int)
    parser.add_argument("--n_layers", type=int)
    parser.add_argument("--n_heads", type=int)
    parser.add_argument("--seed", type=int, default=137)
    parser.add_argument("--no_ternary", action="store_true", help="Use fp16 baseline (no ternary)")
    parser.add_argument("--grad_accum", type=int, default=1, help="Gradient accumulation steps (simulates larger batch)")
    parser.add_argument("--gradient_checkpointing", action="store_true", help="Enable gradient checkpointing for memory efficiency")
    parser.add_argument("--cpu", action="store_true", help="Force CPU training")
    parser.add_argument("--resume", type=str, help="Resume from a checkpoint .pt file")
    args = parser.parse_args()

    set_reproducible_seed(args.seed)

    device = torch.device("cpu" if args.cpu else ("cuda" if torch.cuda.is_available() else "cpu"))
    print(f"Device: {device}")

    # Config
    cfg = build_config(
        args.preset,
        vocab_size=args.vocab_size,
        d_model=args.d_model,
        n_layers=args.n_layers,
        n_heads=args.n_heads,
        max_seq_len=args.max_seq_len,
        use_ternary=not args.no_ternary,
        gradient_checkpointing=args.gradient_checkpointing,
    )
    model = MeridianModel(cfg)
    print(f"Model size: {sum(p.numel() for p in model.parameters()) / 1e6:.1f}M params")

    # Tokenizer (placeholder — replace with trained BPE when available)
    tokenizer = SimpleTokenizer(vocab_size=cfg.vocab_size)

    # Datasets
    train_ds = InstructionDataset(Path(args.data), tokenizer, max_length=args.max_seq_len)
    eval_ds = InstructionDataset(Path(args.eval), tokenizer, max_length=args.max_seq_len)
    print(f"Train examples: {len(train_ds)}, Eval examples: {len(eval_ds)}")
    if len(train_ds) == 0:
        raise SystemExit(f"No training examples found in {args.data}")
    if len(eval_ds) == 0:
        raise SystemExit(f"No eval examples found in {args.eval}")
    print(f"Data hashes: train={file_sha256(Path(args.data))[:12]} eval={file_sha256(Path(args.eval))[:12]}")

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, collate_fn=lambda b: collate_batch(b, pad_token_id=0))
    eval_loader = DataLoader(eval_ds, batch_size=args.batch_size, shuffle=False, collate_fn=lambda b: collate_batch(b, pad_token_id=0))

    train(
        model,
        train_loader,
        eval_loader,
        device,
        cfg,
        epochs=args.epochs,
        max_lr=args.max_lr,
        grad_accum_steps=args.grad_accum,
        output_dir=Path(args.output),
        resume_from=Path(args.resume) if args.resume else None,
    )


if __name__ == "__main__":
    main()
