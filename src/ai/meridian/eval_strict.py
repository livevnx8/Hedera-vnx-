#!/usr/bin/env python3
"""Strict eval — check for valid JSON tool calls."""

import argparse
import json
import re
import torch
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))

from architecture import MeridianModel
from infrastructure import build_config, config_from_checkpoint_payload
from tokenizer import SimpleTokenizer


def is_valid_tool_call(text):
    """Check if text is a valid JSON array with tool calls."""
    text = text.strip()
    if not text.startswith('['):
        return False
    try:
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            return False
        for item in parsed:
            if not isinstance(item, dict):
                return False
            if 'tool' not in item:
                return False
        return True
    except:
        return False


def extract_first_tool(text):
    """Extract first tool name from prediction."""
    try:
        parsed = json.loads(text.strip())
        if isinstance(parsed, list) and len(parsed) > 0:
            return parsed[0].get('tool', 'NONE')
    except:
        pass
    return 'INVALID'


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

    print(f'Loading: {args.checkpoint}')
    ckpt = torch.load(args.checkpoint, map_location=device, weights_only=False)
    cfg = build_config(args.preset)
    cfg = config_from_checkpoint_payload(ckpt, cfg)
    
    model = MeridianModel(cfg)
    model.load_state_dict(ckpt['model_state_dict'])
    model.to(device)
    model.eval()
    
    tokenizer = SimpleTokenizer(vocab_size=cfg.vocab_size)
    print(f'Model: {sum(p.numel() for p in model.parameters())/1e6:.1f}M params\n')

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

    valid_count = 0
    correct_tool = 0
    total = len(examples)

    for i, ex in enumerate(examples):
        instruction = ex.get('instruction', '')
        expected = ex.get('output', '').strip()
        
        tokens = tokenizer.encode(instruction, max_length=128)
        input_ids = torch.tensor([tokens], dtype=torch.long, device=device)
        
        # Greedy decode up to 200 tokens
        generated = tokens[:]
        max_new = 200
        
        with torch.no_grad():
            for _ in range(max_new):
                input_tensor = torch.tensor([generated], dtype=torch.long, device=device)
                logits = model(input_tensor)
                next_token = logits[:, -1, :].argmax(dim=-1).item()
                generated.append(next_token)
                
                # Stop if we see ] (end of JSON array)
                decoded = tokenizer.decode([next_token])
                if ']' in decoded and len(generated) > 10:
                    break
                # Also stop at EOS or max length
                if next_token == tokenizer.eos_id or len(generated) > 250:
                    break
        
        pred = tokenizer.decode(generated[len(tokens):])
        pred = pred.strip()
        
        # Strict checks
        is_valid = is_valid_tool_call(pred)
        expected_tool = extract_first_tool(expected)
        pred_tool = extract_first_tool(pred)
        tool_match = pred_tool == expected_tool and is_valid
        
        if is_valid:
            valid_count += 1
        if tool_match:
            correct_tool += 1
        
        status = '✓' if tool_match else ('~' if is_valid else '✗')
        preview = pred[:50].replace('\n', ' ')
        
        print(f'{i+1:2d}. {status} pred="{preview}..." -> {pred_tool} | expected: {expected_tool}')
        if not is_valid:
            print(f'    INVALID JSON: {pred[:80]}...')
    
    print(f'\n{"="*50}')
    print(f'Strict Evaluation Results:')
    print(f'  Valid JSON tool calls: {valid_count}/{total} = {valid_count/total:.1%}')
    print(f'  Correct tool match:    {correct_tool}/{total} = {correct_tool/total:.1%}')
    print(f'{"="*50}')
    
    if correct_tool > 0:
        print(f'\n*** SUCCESS - Model produces valid tool calls! ***')
    else:
        print(f'\n*** FAILED - Model not producing valid JSON tool calls ***')


if __name__ == '__main__':
    main()
