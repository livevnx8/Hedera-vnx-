"""Test GPT-2 Meridian model generation."""
import torch
import sys
import json
sys.path.insert(0, 'src/ai/meridian')

from transformers import GPT2Tokenizer
from architecture import MeridianModel
from infrastructure import build_config, config_from_checkpoint_payload

print("Loading GPT-2 tokenizer...")
tokenizer = GPT2Tokenizer.from_pretrained('gpt2')
tokenizer.pad_token = '<pad>'
tokenizer.add_special_tokens({'pad_token': '<pad>'})
print(f"Vocab size: {len(tokenizer)}")

# Test tokenizer encode/decode
test = '[{"tool": "test"}]'
tokens = tokenizer.encode(test, add_special_tokens=False)
decoded = tokenizer.decode(tokens)
print(f"Tokenizer test: {test == decoded}")

print("\nLoading GPT-2 checkpoint...")
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
ckpt = torch.load('models/meridian/checkpoints/medium-gpt2-v1/best.pt', map_location=device)
print(f"Epoch: {ckpt.get('epoch', 'N/A')}, Eval loss: {ckpt.get('eval_loss', 0):.4f}")

cfg = build_config('medium')
cfg.vocab_size = len(tokenizer)
cfg.max_seq_len = 512
cfg = config_from_checkpoint_payload(ckpt, cfg)

model = MeridianModel(cfg)
model.load_state_dict(ckpt['model_state_dict'])
model.to(device)
model.eval()
print(f"Model: {sum(p.numel() for p in model.parameters())/1e6:.1f}M params")

# Test generation
prompt = "### Instruction:\nCheck my account balance\n\n### Response:\n["
input_ids = tokenizer.encode(prompt, add_special_tokens=False)
input_ids.append(tokenizer.eos_token_id)
print(f"\nPrompt: {prompt[:50]}...")
print(f"Input tokens: {len(input_ids)}")

generated = input_ids[:]
max_new_tokens = min(50, 510 - len(input_ids))

print(f"Generating up to {max_new_tokens} tokens...")

with torch.no_grad():
    for i in range(max_new_tokens):
        # CRITICAL: Trim to max_seq_len before passing to model
        input_seq = generated[-511:] if len(generated) > 511 else generated
        
        logits = model(torch.tensor([input_seq], dtype=torch.long, device=device))
        next_token = logits[:, -1, :].argmax(dim=-1).item()
        generated.append(next_token)
        
        if next_token == tokenizer.eos_token_id:
            print(f"EOS at step {i}")
            break

output = tokenizer.decode(generated[len(input_ids):])
print(f"\nGenerated ({len(generated) - len(input_ids)} tokens):")
print(f"'{output}'")

# Check JSON validity
print("\n=== JSON VALIDATION ===")
try:
    full_output = "[" + output  # Complete the array started in prompt
    parsed = json.loads(full_output)
    print("✓ VALID JSON!")
    print(f"  Type: {type(parsed).__name__}")
    if isinstance(parsed, list) and len(parsed) > 0:
        print(f"  Items: {len(parsed)}")
        if isinstance(parsed[0], dict):
            print(f"  Keys: {list(parsed[0].keys())}")
except json.JSONDecodeError as e:
    print(f"✗ Invalid JSON: {e}")
    if output.strip().startswith('{'):
        print("  (Starts with '{', close to valid)")
    elif '"tool"' in output:
        print("  (Contains 'tool' reference)")
    elif output.strip():
        print(f"  First 50 chars: '{output[:50]}'")

print("\nTest complete.")
