#!/usr/bin/env python3
"""Quick eval on real Vera data to test if accuracy improved."""

import argparse
import json
import torch
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))

from architecture import MeridianModel
from infrastructure import build_config, config_from_checkpoint_payload
from tokenizer import SimpleTokenizer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--checkpoint', required=True)
    parser.add_argument('--preset', default='medium')
    parser.add_argument('--data', default='models/meridian/vera-dataset.eval.jsonl')
    parser.add_argument('--limit', type=int, default=20)
    parser.add_argument('--cpu', action='store_true')
    args = parser.parse_args()

    device = torch.device('cpu' if args.cpu else ('cuda' if torch.cuda.is_available() else 'cpu'))
    print(f'Device: {device}')

    # Load model
    print(f'Loading: {args.checkpoint}')
    ckpt = torch.load(args.checkpoint, map_location=device, weights_only=False)
    cfg = build_config(args.preset)
    cfg = config_from_checkpoint_payload(ckpt, cfg)
    
    model = MeridianModel(cfg)
    model.load_state_dict(ckpt['model_state_dict'])
    model.to(device)
    model.eval()
    
    tokenizer = SimpleTokenizer(vocab_size=cfg.vocab_size)
    print(f'Model: {sum(p.numel() for p in model.parameters())/1e6:.1f}M params')

    # Load real Vera examples
    examples = []
    with open(args.data, 'r') as f:
        for line in f:
            if len(examples) >= args.limit:
                break
            try:
                examples.append(json.loads(line))
            except:
                continue

    print(f'Evaluating {len(examples)} real Vera examples...\n')

    correct = 0
    for i, ex in enumerate(examples):
        instruction = ex.get('instruction', '')
        expected = ex.get('output', '')
        
        tokens = tokenizer.encode(instruction, max_length=128)
        input_ids = torch.tensor([tokens], dtype=torch.long, device=device)
        
        with torch.no_grad():
            logits = model(input_ids)
            next_token = logits[:, -1, :].argmax(dim=-1).item()
            pred = tokenizer.decode([next_token])
            
            # Check match
            is_match = pred.strip().lower() in expected.strip().lower() or expected.strip().lower().startswith(pred.strip().lower())
            if is_match:
                correct += 1
                status = '✓'
            else:
                status = '✗'
            
            print(f'{i+1:2d}. {status} pred="{pred[:30]}" | expected="{expected[:40]}"')
    
    acc = correct / len(examples) if examples else 0
    print(f'\nAccuracy: {correct}/{len(examples)} = {acc:.1%}')
    print(f'\n*** {"SUCCESS" if acc > 0 else "FAILED"} - Real data accuracy: {acc:.1%} ***')


if __name__ == '__main__':
    main()
