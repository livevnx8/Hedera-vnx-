#!/usr/bin/env python3
"""Quick eval on limited examples to test accuracy."""

import argparse
import json
import torch
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))

from architecture import MeridianModel
from infrastructure import build_config, config_from_checkpoint_payload
from tokenizer import SimpleTokenizer


def load_examples(data_path: Path, limit: int = 10):
    examples = []
    with open(data_path, 'r', encoding='utf-8') as f:
        for line in f:
            if len(examples) >= limit:
                break
            try:
                obj = json.loads(line.strip())
                examples.append(obj)
            except json.JSONDecodeError:
                continue
    return examples


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--checkpoint', required=True)
    parser.add_argument('--preset', default='base')
    parser.add_argument('--data', required=True)
    parser.add_argument('--limit', type=int, default=10)
    parser.add_argument('--cpu', action='store_true')
    args = parser.parse_args()

    device = torch.device('cpu' if args.cpu else ('cuda' if torch.cuda.is_available() else 'cpu'))
    print(f'Device: {device}')

    # Load model
    print(f'Loading checkpoint: {args.checkpoint}')
    ckpt = torch.load(args.checkpoint, map_location=device, weights_only=False)
    cfg = build_config(args.preset)
    cfg = config_from_checkpoint_payload(ckpt, cfg)
    
    model = MeridianModel(cfg)
    model.load_state_dict(ckpt['model_state_dict'])
    model.to(device)
    model.eval()
    
    tokenizer = SimpleTokenizer(vocab_size=cfg.vocab_size)
    print(f'Model: {sum(p.numel() for p in model.parameters())/1e6:.1f}M params')

    # Load examples
    examples = load_examples(Path(args.data), args.limit)
    print(f'Loaded {len(examples)} examples from {args.data}')

    # Eval
    correct = 0
    for i, ex in enumerate(examples):
        instruction = ex.get('instruction', '')
        input_text = ex.get('input', '')
        expected = ex.get('output', '')
        
        prompt = instruction
        if input_text:
            prompt += f'\n\nInput:\n{input_text}'
        
        # Encode and generate
        tokens = tokenizer.encode(prompt, max_length=cfg.max_seq_len)
        input_ids = torch.tensor([tokens], dtype=torch.long, device=device)
        
        with torch.no_grad():
            logits = model(input_ids)
            # Get next token prediction
            next_token_logits = logits[:, -1, :]
            next_token = next_token_logits.argmax(dim=-1).item()
            
            # Simple match: check if expected output starts with the predicted token's string
            pred_str = tokenizer.decode([next_token])
            
            # Check if prediction matches start of expected
            is_correct = expected.strip().lower().startswith(pred_str.strip().lower()) or pred_str.strip().lower() in expected.strip().lower()
            
            if is_correct:
                correct += 1
                status = '✓'
            else:
                status = '✗'
            
            print(f'{i+1}. {status} | pred="{pred_str[:30]}" | expected="{expected[:40]}"')
    
    acc = correct / len(examples) if examples else 0
    print(f'\nAccuracy: {correct}/{len(examples)} = {acc:.1%}')


if __name__ == '__main__':
    main()
