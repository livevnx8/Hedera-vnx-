"""Generation script for Meridian with BPE tokenizer."""

import argparse
import json
import torch
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))

from architecture import MeridianModel
from infrastructure import build_config, config_from_checkpoint_payload
from bpe_tokenizer import BPETokenizer


def generate(model, tokenizer, prompt: str, max_new_tokens: int = 200, temperature: float = 0.7, device='cuda'):
    """Generate text autoregressively."""
    model.eval()
    
    # Encode prompt
    input_ids = tokenizer.encode(prompt, max_length=None)
    input_tensor = torch.tensor([input_ids], dtype=torch.long, device=device)
    
    generated = input_ids[:]
    
    with torch.no_grad():
        for _ in range(max_new_tokens):
            # Forward pass
            logits = model(input_tensor)
            
            # Get next token logits
            next_logits = logits[:, -1, :] / temperature
            
            # Sample
            probs = torch.softmax(next_logits, dim=-1)
            next_token = torch.multinomial(probs, num_samples=1).item()
            
            generated.append(next_token)
            input_tensor = torch.tensor([generated], dtype=torch.long, device=device)
            
            # Stop conditions
            if next_token == tokenizer.eos_id:
                break
            
            # Stop if we see complete JSON array
            decoded = tokenizer.decode(generated[len(input_ids):])
            if ']' in decoded and len(decoded) > 20:
                # Check if JSON is valid
                try:
                    if decoded.strip().endswith(']'):
                        json.loads(decoded.strip())
                        break
                except:
                    pass
    
    output = tokenizer.decode(generated[len(input_ids):])
    return output.strip()


def is_valid_tool_call(text):
    """Check if text is valid JSON tool call."""
    text = text.strip()
    if not text.startswith('['):
        return False
    try:
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            return False
        for item in parsed:
            if not isinstance(item, dict) or 'tool' not in item:
                return False
        return True
    except:
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--checkpoint', required=True)
    parser.add_argument('--preset', default='medium')
    parser.add_argument('--prompt', type=str, help='Single prompt to generate from')
    parser.add_argument('--data', type=str, help='Eval data file')
    parser.add_argument('--limit', type=int, default=10)
    parser.add_argument('--max_tokens', type=int, default=200)
    parser.add_argument('--temperature', type=float, default=0.7)
    parser.add_argument('--cpu', action='store_true')
    args = parser.parse_args()
    
    device = torch.device('cpu' if args.cpu else ('cuda' if torch.cuda.is_available() else 'cpu'))
    print(f'Device: {device}')
    
    # Load checkpoint
    print(f'Loading: {args.checkpoint}')
    ckpt = torch.load(args.checkpoint, map_location=device, weights_only=False)
    
    # Load tokenizer
    vocab_size = ckpt.get('vocab_size', 5000)
    tok_path = Path('models/meridian/bpe_tokenizer_5000.pkl')
    if tok_path.exists():
        tokenizer = BPETokenizer.load(str(tok_path))
        print(f'Loaded BPE tokenizer: {len(tokenizer.vocab)} tokens')
    else:
        print('Tokenizer not found!')
        return
    
    # Build model
    cfg = build_config(args.preset)
    cfg.vocab_size = vocab_size
    cfg = config_from_checkpoint_payload(ckpt, cfg)
    
    model = MeridianModel(cfg)
    model.load_state_dict(ckpt['model_state_dict'])
    model.to(device)
    model.eval()
    
    print(f'Model: {sum(p.numel() for p in model.parameters())/1e6:.1f}M params\n')
    
    # Single prompt mode
    if args.prompt:
        print(f'Prompt: {args.prompt}')
        output = generate(model, tokenizer, args.prompt, args.max_tokens, args.temperature, device)
        print(f'\nGenerated:\n{output}')
        print(f'\nValid JSON: {is_valid_tool_call(output)}')
        return
    
    # Eval mode
    if args.data:
        print(f'Evaluating on {args.data}...\n')
        
        examples = []
        with open(args.data, 'r') as f:
            for line in f:
                if len(examples) >= args.limit:
                    break
                try:
                    examples.append(json.loads(line))
                except:
                    continue
        
        valid_count = 0
        correct_tool = 0
        
        for i, ex in enumerate(examples):
            instruction = ex.get('instruction', '')
            expected = ex.get('output', '').strip()
            
            prompt = f"### Instruction:\n{instruction}\n\n### Response:\n"
            pred = generate(model, tokenizer, prompt, args.max_tokens, args.temperature, device)
            
            is_valid = is_valid_tool_call(pred)
            
            # Check tool match
            pred_tool = 'NONE'
            expected_tool = 'NONE'
            try:
                if is_valid:
                    pred_parsed = json.loads(pred)
                    if pred_parsed:
                        pred_tool = pred_parsed[0].get('tool', 'NONE')
                expected_parsed = json.loads(expected)
                if expected_parsed:
                    expected_tool = expected_parsed[0].get('tool', 'NONE')
            except:
                pass
            
            tool_match = pred_tool == expected_tool and is_valid
            
            if is_valid:
                valid_count += 1
            if tool_match:
                correct_tool += 1
            
            status = '✓' if tool_match else ('~' if is_valid else '✗')
            print(f'{i+1:2d}. {status} pred={pred[:50]}... | tool={pred_tool} | expected={expected_tool}')
        
        total = len(examples)
        print(f'\n{"="*50}')
        print(f'Results:')
        print(f'  Valid JSON: {valid_count}/{total} = {valid_count/total:.1%}')
        print(f'  Correct tool: {correct_tool}/{total} = {correct_tool/total:.1%}')
        print(f'{"="*50}')


if __name__ == '__main__':
    main()
