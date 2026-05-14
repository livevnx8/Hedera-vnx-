"""Meridian Training with BPE Tokenizer - 1024 context."""

import argparse
import json
import math
import time
from pathlib import Path
from typing import Any, Dict, List

import torch
import torch.nn.functional as F
from torch.optim import AdamW
from torch.utils.data import DataLoader, Dataset

from architecture import MeridianConfig, MeridianModel
from infrastructure import build_config, checkpoint_metadata, config_to_dict, file_sha256, set_reproducible_seed, write_json
from bpe_tokenizer import BPETokenizer, train_tokenizer_on_vera_data


class InstructionDataset(Dataset):
    def __init__(self, data_path: str, tokenizer: BPETokenizer, max_length: int = 1024):
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.examples = []
        
        with open(data_path, 'r') as f:
            for line in f:
                try:
                    ex = json.loads(line)
                    self.examples.append(ex)
                except:
                    continue
        
        # Filter examples that fit in context
        valid = []
        for ex in self.examples:
            text = self._format(ex)
            tokens = tokenizer.encode(text)
            if len(tokens) <= max_length:
                valid.append(ex)
        
        self.examples = valid
        print(f"Loaded {len(self.examples)} valid examples (filtered by max_length={max_length})")
    
    def _format(self, ex: dict) -> str:
        # Simpler format for better tokenization
        instruction = ex.get('instruction', '').strip()
        output = ex.get('output', '').strip()
        return f"### Instruction:\n{instruction}\n\n### Response:\n{output}"
    
    def __len__(self):
        return len(self.examples)
    
    def __getitem__(self, idx):
        ex = self.examples[idx]
        text = self._format(ex)
        tokens = self.tokenizer.encode(text, max_length=self.max_length)
        return torch.tensor(tokens, dtype=torch.long)


def collate_batch(batch: List[torch.Tensor], pad_id: int) -> torch.Tensor:
    max_len = max(x.size(0) for x in batch)
    padded = []
    for x in batch:
        if x.size(0) < max_len:
            padding = torch.full((max_len - x.size(0),), pad_id, dtype=torch.long)
            x = torch.cat([x, padding])
        padded.append(x)
    return torch.stack(padded)


def train_epoch(model, loader, optimizer, device, grad_accum, epoch, pad_id):
    model.train()
    total_loss = 0
    steps = 0
    
    optimizer.zero_grad()
    
    for i, batch in enumerate(loader):
        batch = batch.to(device)
        
        # Forward
        logits = model(batch[:, :-1])
        targets = batch[:, 1:]
        
        # Loss (only on non-pad tokens)
        loss = F.cross_entropy(
            logits.reshape(-1, logits.size(-1)),
            targets.reshape(-1),
            ignore_index=pad_id,
            reduction='mean'
        )
        
        # Scale for grad accum
        loss = loss / grad_accum
        loss.backward()
        
        if (i + 1) % grad_accum == 0:
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            optimizer.zero_grad()
        
        total_loss += loss.item() * grad_accum
        steps += 1
        
        if i % 10 == 0:
            print(f"  step={epoch * len(loader) + i}  loss={loss.item() * grad_accum:.4f}")
    
    return total_loss / max(steps, 1)


def evaluate(model, loader, device, pad_id):
    model.eval()
    total_loss = 0
    steps = 0
    
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


def tokenizer_metadata(tokenizer: BPETokenizer, tokenizer_path: Path) -> Dict[str, Any]:
    return {
        'kind': 'bpe',
        'path': str(tokenizer_path),
        'vocab_size': len(tokenizer.vocab),
        'pad_id': tokenizer.pad_id,
        'eos_id': tokenizer.eos_id,
    }


def checkpoint_payload(
    model,
    optimizer,
    epoch: int,
    cfg: MeridianConfig,
    tokenizer: BPETokenizer,
    tokenizer_path: Path,
    train_loss: float | None = None,
    eval_loss: float | None = None,
) -> Dict[str, Any]:
    eval_metrics = None
    if eval_loss is not None:
        eval_metrics = {
            'loss': eval_loss,
            'perplexity': math.exp(eval_loss),
        }
    payload = {
        **checkpoint_metadata(
            step=epoch,
            model_config=cfg,
            extra={
                'epoch': epoch,
                'model_name': 'meridian-bpe',
                'tokenizer': tokenizer_metadata(tokenizer, tokenizer_path),
                'train_loss': train_loss,
                'eval_loss': eval_loss,
                'eval': eval_metrics,
            },
        ),
        'model_state_dict': model.state_dict(),
    }
    if optimizer is not None:
        payload['optimizer_state_dict'] = optimizer.state_dict()
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', required=True)
    parser.add_argument('--eval', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--preset', default='medium')
    parser.add_argument('--epochs', type=int, default=10)
    parser.add_argument('--batch_size', type=int, default=1)
    parser.add_argument('--max_seq_len', type=int, default=1024)
    parser.add_argument('--max_lr', type=float, default=1e-4)
    parser.add_argument('--grad_accum', type=int, default=4)
    parser.add_argument('--gradient_checkpointing', action='store_true')
    parser.add_argument('--cpu', action='store_true')
    parser.add_argument('--seed', type=int, default=137)
    args = parser.parse_args()

    set_reproducible_seed(args.seed)
    
    device = torch.device('cpu' if args.cpu else ('cuda' if torch.cuda.is_available() else 'cpu'))
    print(f'Device: {device}')
    
    # Train or load BPE tokenizer
    tok_path = Path('models/meridian/bpe_tokenizer_5000.pkl')
    if tok_path.exists():
        print(f'Loading tokenizer: {tok_path}')
        tokenizer = BPETokenizer.load(str(tok_path))
    else:
        tokenizer = train_tokenizer_on_vera_data(args.data, 5000)
        tokenizer.save(str(tok_path))
    
    vocab_size = len(tokenizer.vocab)
    print(f'Vocab size: {vocab_size}')
    
    # Build config with BPE vocab
    cfg = build_config(
        args.preset,
        vocab_size=vocab_size,
        max_seq_len=args.max_seq_len,
        gradient_checkpointing=args.gradient_checkpointing,
    )
    
    model = MeridianModel(cfg)
    
    model.to(device)
    print(f'Model: {sum(p.numel() for p in model.parameters())/1e6:.1f}M params')
    
    # Datasets
    train_ds = InstructionDataset(args.data, tokenizer, args.max_seq_len)
    eval_ds = InstructionDataset(args.eval, tokenizer, args.max_seq_len)
    if len(train_ds) == 0:
        raise SystemExit(f'No training examples found in {args.data}')
    if len(eval_ds) == 0:
        raise SystemExit(f'No eval examples found in {args.eval}')
    
    train_loader = DataLoader(
        train_ds, 
        batch_size=args.batch_size, 
        shuffle=True,
        collate_fn=lambda x: collate_batch(x, tokenizer.pad_id)
    )
    eval_loader = DataLoader(
        eval_ds,
        batch_size=args.batch_size,
        collate_fn=lambda x: collate_batch(x, tokenizer.pad_id)
    )
    
    # Optimizer
    optimizer = AdamW(model.parameters(), lr=args.max_lr, betas=(0.9, 0.95), weight_decay=0.01)
    
    # Training loop
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    tokenizer_path = output_dir / 'tokenizer.pkl'
    tokenizer.save(str(tokenizer_path))
    write_json(
        output_dir / 'run_config.json',
        {
            'model_config': config_to_dict(cfg),
            'tokenizer': tokenizer_metadata(tokenizer, tokenizer_path),
            'data': {
                'train_path': args.data,
                'train_sha256': file_sha256(Path(args.data)),
                'eval_path': args.eval,
                'eval_sha256': file_sha256(Path(args.eval)),
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
        print(f'\nEpoch {epoch + 1}/{args.epochs}')
        
        train_loss = train_epoch(model, train_loader, optimizer, device, args.grad_accum, epoch, tokenizer.pad_id)
        eval_loss = evaluate(model, eval_loader, device, tokenizer.pad_id)
        
        print(f'  Train loss: {train_loss:.4f}')
        print(f'  Eval loss: {eval_loss:.4f}  ppl={math.exp(eval_loss):.2f}')
        
        # Save checkpoint
        ckpt_path = output_dir / f'checkpoint-epoch{epoch+1}.pt'
        torch.save(
            checkpoint_payload(
                model, optimizer, epoch + 1, cfg, tokenizer, tokenizer_path, train_loss, eval_loss,
            ),
            ckpt_path,
        )
        print(f'  → Saved: {ckpt_path}')
        
        if eval_loss < best_eval:
            best_eval = eval_loss
            best_path = output_dir / 'best.pt'
            torch.save(
                checkpoint_payload(
                    model, optimizer, epoch + 1, cfg, tokenizer, tokenizer_path, train_loss, eval_loss,
                ),
                best_path,
            )
            print(f'  → New best: {best_path}')
    
    # Save final
    final_eval = evaluate(model, eval_loader, device, tokenizer.pad_id)
    torch.save(
        checkpoint_payload(
            model, optimizer, args.epochs, cfg, tokenizer, tokenizer_path, train_loss, final_eval,
        ),
        output_dir / 'final.pt',
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
