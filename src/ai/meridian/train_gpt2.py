"""Meridian training with the GPT-2 tokenizer.

This path is used for Vera-facing instruction data where byte-level bootstrap
tokenization is too lossy. Checkpoints intentionally follow the same metadata
contract as train.py so server.py can load them without one-off glue.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import torch
import torch.nn.functional as F
from torch.optim import AdamW
from torch.utils.data import DataLoader, Dataset

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
    def __init__(self, data_path: Path, tokenizer: GPT2TokenizerWrapper, max_length: int = 512):
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
        tokens = self.tokenizer.encode(self.examples[idx], self.max_length)
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


def tokenizer_metadata(tokenizer: GPT2TokenizerWrapper, tokenizer_path: Path) -> dict:
    return {
        'kind': 'gpt2',
        'path': str(tokenizer_path),
        'vocab_size': tokenizer.vocab_size,
        'pad_id': tokenizer.pad_id,
        'eos_id': tokenizer.eos_id,
    }


def save_checkpoint(
    model,
    optimizer,
    epoch: int,
    path: Path,
    cfg,
    tokenizer: GPT2TokenizerWrapper,
    tokenizer_path: Path,
    train_loss: float,
    eval_loss: float,
    best_eval_loss: float,
) -> None:
    payload = {
        **checkpoint_metadata(
            step=epoch,
            model_config=cfg,
            extra={
                'epoch': epoch,
                'model_name': 'meridian-gpt2',
                'tokenizer': tokenizer_metadata(tokenizer, tokenizer_path),
                'train_loss': train_loss,
                'eval_loss': eval_loss,
                'eval': {
                    'loss': eval_loss,
                    'perplexity': math.exp(eval_loss),
                },
                'best_eval_loss': best_eval_loss,
            },
        ),
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
    }
    torch.save(payload, path)
    print(f"  Checkpoint saved: {path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', required=True)
    parser.add_argument('--eval', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--preset', default='medium')
    parser.add_argument('--epochs', type=int, default=5)
    parser.add_argument('--batch_size', type=int, default=1)
    parser.add_argument('--max_seq_len', type=int, default=512)
    parser.add_argument('--max_lr', type=float, default=5e-5)
    parser.add_argument('--grad_accum', type=int, default=4)
    parser.add_argument('--gradient_checkpointing', action='store_true')
    parser.add_argument('--seed', type=int, default=137)
    parser.add_argument('--cpu', action='store_true')
    args = parser.parse_args()

    set_reproducible_seed(args.seed)

    device = torch.device('cpu' if args.cpu else ('cuda' if torch.cuda.is_available() else 'cpu'))
    print(f'Device: {device}')

    # GPT2 Tokenizer
    tokenizer = get_tokenizer()
    print(f'GPT2 Tokenizer: {tokenizer.vocab_size} tokens')

    # Model config
    cfg = build_config(
        args.preset,
        vocab_size=tokenizer.vocab_size,
        max_seq_len=args.max_seq_len,
        gradient_checkpointing=args.gradient_checkpointing,
    )

    model = MeridianModel(cfg)
    model.to(device)
    print(f'Model: {sum(p.numel() for p in model.parameters())/1e6:.1f}M params')

    # Data
    train_path = Path(args.data)
    eval_path = Path(args.eval)
    train_ds = InstructionDataset(train_path, tokenizer, args.max_seq_len)
    eval_ds = InstructionDataset(eval_path, tokenizer, args.max_seq_len)
    if len(train_ds) == 0:
        raise SystemExit(f'No training examples found in {train_path}')
    if len(eval_ds) == 0:
        raise SystemExit(f'No eval examples found in {eval_path}')

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                              collate_fn=lambda x: collate(x, tokenizer.pad_id))
    eval_loader = DataLoader(eval_ds, batch_size=args.batch_size,
                             collate_fn=lambda x: collate(x, tokenizer.pad_id))

    optimizer = AdamW(model.parameters(), lr=args.max_lr, betas=(0.9, 0.95), weight_decay=0.01)

    # Train
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    tokenizer_path = output_dir / 'tokenizer'
    tokenizer.save(str(tokenizer_path))
    write_json(
        output_dir / 'run_config.json',
        {
            'model_config': config_to_dict(cfg),
            'tokenizer': tokenizer_metadata(tokenizer, tokenizer_path),
            'data': {
                'train_path': str(train_path),
                'train_sha256': file_sha256(train_path),
                'eval_path': str(eval_path),
                'eval_sha256': file_sha256(eval_path),
            },
            'epochs': args.epochs,
            'batch_size': args.batch_size,
            'max_lr': args.max_lr,
            'grad_accum_steps': args.grad_accum,
            'seed': args.seed,
        },
    )

    best_eval = float('inf')

    for epoch in range(args.epochs):
        print(f'\nEpoch {epoch+1}/{args.epochs}')
        train_loss = train_epoch(model, train_loader, optimizer, device, args.grad_accum, tokenizer.pad_id)
        eval_loss = evaluate(model, eval_loader, device, tokenizer.pad_id)
        best_eval = min(best_eval, eval_loss)

        print(f'  Train: {train_loss:.4f}')
        print(f'  Eval: {eval_loss:.4f}  ppl={math.exp(eval_loss):.2f}')

        epoch_path = output_dir / f'epoch{epoch+1}.pt'
        save_checkpoint(
            model, optimizer, epoch + 1, epoch_path, cfg, tokenizer,
            tokenizer_path, train_loss, eval_loss, best_eval,
        )
        if eval_loss == best_eval:
            save_checkpoint(
                model, optimizer, epoch + 1, output_dir / 'best.pt', cfg, tokenizer,
                tokenizer_path, train_loss, eval_loss, best_eval,
            )
            print('  New best saved')

    final_eval = evaluate(model, eval_loader, device, tokenizer.pad_id)
    save_checkpoint(
        model, optimizer, args.epochs, output_dir / 'final.pt', cfg, tokenizer,
        tokenizer_path, train_loss, final_eval, best_eval,
    )
    write_json(
        output_dir / 'training_summary.json',
        {
            'final_step': args.epochs,
            'best_eval_loss': best_eval,
            'final_eval': {
                'loss': final_eval,
                'perplexity': math.exp(final_eval),
            },
            'model_config': config_to_dict(cfg),
            'tokenizer': tokenizer_metadata(tokenizer, tokenizer_path),
        },
    )
    print('\nTraining complete.')


if __name__ == '__main__':
    main()
