"""Train Large Meridian with GPT-2 tokenizer for JSON generation."""
import sys
sys.path.insert(0, 'src/ai/meridian')

import argparse
import json
import math
from pathlib import Path

import torch
import torch.nn.functional as F
from torch.optim import SGD
from torch.utils.data import DataLoader, Dataset
from transformers import GPT2Tokenizer

from architecture import MeridianModel
from gpt2_tokenizer import GPT2TokenizerWrapper, get_tokenizer
from infrastructure import (
    build_config,
    checkpoint_metadata,
    config_to_dict,
    file_sha256,
    set_reproducible_seed,
    write_json,
)

class InstructionDataset(Dataset):
    def __init__(self, data_path: Path, tokenizer: GPT2TokenizerWrapper, max_length: int = 1024):
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.examples = []

        with open(data_path, encoding='utf-8') as f:
            for line in f:
                try:
                    ex = json.loads(line)
                    text = f"### Instruction:\n{ex['instruction']}\n\n### Response:\n{ex['output']}"
                    self.examples.append(text)
                except (json.JSONDecodeError, KeyError):
                    continue

        # Filter by length
        valid = []
        for text in self.examples:
            tokens = tokenizer.encode(text)
            if len(tokens) <= max_length:
                valid.append(text)
        self.examples = valid
        print(f"Loaded {len(self.examples)} examples")

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        tokens = self.tokenizer.encode(self.examples[idx], max_length=self.max_length)
        return torch.tensor(tokens)


def collate(batch, pad_id):
    max_len = max(x.size(0) for x in batch)
    padded = []
    for x in batch:
        if x.size(0) < max_len:
            pad = torch.full((max_len - x.size(0),), pad_id, dtype=torch.long)
            x = torch.cat([x, pad])
        padded.append(x)
    return torch.stack(padded)


def train_epoch(model, loader, optimizer, device, grad_accum, pad_id):
    model.train()
    total_loss, steps = 0, 0
    optimizer.zero_grad()

    for i, batch in enumerate(loader):
        batch = batch.to(device)
        logits = model(batch[:, :-1])
        targets = batch[:, 1:]

        loss = F.cross_entropy(
            logits.reshape(-1, logits.size(-1)),
            targets.reshape(-1),
            ignore_index=pad_id,
            reduction='mean'
        ) / grad_accum

        loss.backward()

        if (i + 1) % grad_accum == 0:
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            optimizer.zero_grad()

        total_loss += loss.item() * grad_accum
        steps += 1
        if i % 20 == 0:
            print(f"  step={i} loss={loss.item() * grad_accum:.4f}")

    return total_loss / max(steps, 1)


def evaluate(model, loader, device, pad_id):
    model.eval()
    total_loss, steps = 0, 0
    with torch.no_grad():
        for batch in loader:
            batch = batch.to(device)
            logits = model(batch[:, :-1])
            targets = batch[:, 1:]
            loss = F.cross_entropy(
                logits.reshape(-1, logits.size(-1)),
                targets.reshape(-1),
                ignore_index=pad_id,
                reduction='mean'
            )
            total_loss += loss.item()
            steps += 1
    return total_loss / max(steps, 1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--preset', default='medium-plus', help='Model preset')
    parser.add_argument('--epochs', type=int, default=5, help='Training epochs')
    parser.add_argument('--batch_size', type=int, default=1, help='Batch size')
    parser.add_argument('--max_seq_len', type=int, default=512, help='Max sequence length')
    parser.add_argument('--max_lr', type=float, default=5e-5, help='Max learning rate')
    parser.add_argument('--grad_accum', type=int, default=4, help='Gradient accumulation')
    parser.add_argument('--gradient_checkpointing', action='store_true', help='Enable gradient checkpointing')
    parser.add_argument('--cpu', action='store_true', help='Use CPU')
    parser.add_argument('--output', default='models/meridian/checkpoints/medium-plus-gpt2-v1', help='Output dir')
    parser.add_argument('--resume', help='Resume from checkpoint')
    parser.add_argument('--data', default='models/meridian/augmented-dataset.train.jsonl', help='Training data')
    parser.add_argument('--eval', default='models/meridian/augmented-dataset.eval.jsonl', help='Eval data')
    args = parser.parse_args()

    set_reproducible_seed(42)
    device = torch.device('cuda' if torch.cuda.is_available() and not args.cpu else 'cpu')
    print(f"Device: {device}")
    print(f"Preset: {args.preset}")

    # Load tokenizer
    tokenizer = get_tokenizer()
    print(f"Vocab size: {tokenizer.vocab_size}")

    # Build config
    cfg = build_config(args.preset)
    cfg.vocab_size = tokenizer.vocab_size
    cfg.max_seq_len = args.max_seq_len
    cfg.gradient_checkpointing = args.gradient_checkpointing
    print(f"Config: d_model={cfg.d_model}, n_layers={cfg.n_layers}, n_heads={cfg.n_heads}")
    print(f"Gradient checkpointing: {args.gradient_checkpointing}")

    # Create model
    model = MeridianModel(cfg)
    params = sum(p.numel() for p in model.parameters())
    print(f"Model: {params/1e6:.1f}M params")
    model.to(device)

    # Resume
    start_epoch = 0
    if args.resume:
        print(f"Resuming from {args.resume}")
        ckpt = torch.load(args.resume, map_location=device)
        cfg = config_from_checkpoint_payload(ckpt, cfg)
        model.load_state_dict(ckpt['model_state_dict'])
        start_epoch = ckpt.get('epoch', 0) + 1

    # Load data
    train_dataset = InstructionDataset(Path(args.data), tokenizer, args.max_seq_len)
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, collate_fn=lambda b: collate(b, tokenizer.pad_id))

    eval_dataset = InstructionDataset(Path(args.eval), tokenizer, args.max_seq_len)
    eval_loader = DataLoader(eval_dataset, batch_size=args.batch_size, shuffle=False, collate_fn=lambda b: collate(b, tokenizer.pad_id))

    # Optimizer (SGD uses less memory than AdamW)
    optimizer = SGD(model.parameters(), lr=args.max_lr, momentum=0.9, weight_decay=0.01)

    # Training loop
    for epoch in range(start_epoch, args.epochs):
        print(f"\nEpoch {epoch+1}/{args.epochs}")
        train_loss = train_epoch(model, train_loader, optimizer, device, args.grad_accum, tokenizer.pad_id)
        print(f"Train loss: {train_loss:.4f}")

        eval_loss = evaluate(model, eval_loader, device, tokenizer.pad_id)
        print(f"Eval loss: {eval_loss:.4f}")

        # Save
        output_path = Path(args.output)
        output_path.mkdir(parents=True, exist_ok=True)

        ckpt = checkpoint_metadata(
            step=epoch,
            model_config=cfg,
            extra={
                'epoch': epoch,
                'model_name': 'meridian-large-gpt2',
                'tokenizer': {'kind': 'gpt2', 'vocab_size': tokenizer.vocab_size},
                'train_loss': train_loss,
                'eval_loss': eval_loss,
                'eval': {'loss': eval_loss, 'perplexity': math.exp(eval_loss)},
            },
        )
        ckpt['model_state_dict'] = model.state_dict()
        ckpt['optimizer_state_dict'] = optimizer.state_dict()
        torch.save(ckpt, output_path / f'epoch_{epoch}.pt')
        torch.save(ckpt, output_path / 'best.pt')
        print(f"Saved checkpoint")

    # Final
    ckpt['epoch'] = args.epochs - 1
    torch.save(ckpt, output_path / 'final.pt')
    print(f"Training complete. Final: {output_path / 'final.pt'}")


if __name__ == '__main__':
    main()
