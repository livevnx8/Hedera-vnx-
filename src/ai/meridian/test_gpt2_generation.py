"""Quick test of GPT-2 trained Meridian model."""
import torch
import sys
sys.path.insert(0, 'src/ai/meridian')

from transformers import GPT2Tokenizer
from architecture import MeridianModel
from infrastructure import build_config, config_from_checkpoint_payload

# Load GPT2 tokenizer
print("Loading GPT-2 tokenizer...")
tokenizer = GPT2Tokenizer.from_pretrained('gpt2')
tokenizer.pad_token = '<pad>'
tokenizer.add_special_tokens({'pad_token': '<pad>'})

def encode(text, max_length=512):
    tokens = tokenizer.encode(text, add_special_tokens=False)
    tokens.append(tokenizer.eos_token_id)
    if len(tokens) < max_length:
        tokens.extend([tokenizer.pad_token_id] * (max_length - len(tokens)))
    return tokens[:max_length]

def decode(ids):
    ids = [i for i in ids if i not in [tokenizer.pad_token_id, tokenizer.eos_token_id]]
    return tokenizer.decode(ids, skip_special_tokens=True)

# Load model
print("Loading model...")
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
ckpt = torch.load('models/meridian/checkpoints/medium-gpt2-v1/best.pt', map_location=device)

cfg = build_config('medium')
cfg.vocab_size = len(tokenizer)
cfg.max_seq_len = 512

cfg = config_from_checkpoint_payload(ckpt, cfg)
model = MeridianModel(cfg)
model.load_state_dict(ckpt['model_state_dict'])
model.to(device)
model.eval()

print(f"Model: {sum(p.numel() for p in model.parameters())/1e6:.1f}M params")
print(f"Epoch: {ckpt.get('epoch', 'N/A')}, Eval loss: {ckpt.get('eval_loss', 'N/A'):.4f}")
print("="*50)

# Test prompts
tests = [
    "### Instruction:\nCheck my account balance\n\n### Response:\n[",
    "### Instruction:\nRecall memory about Hedera\n\n### Response:\n[",
    "### Instruction:\nGet latest DeFi yield\n\n### Response:\n[",
]

for prompt in tests:
    print(f"\nPrompt: {prompt[:50]}...")
    input_ids = encode(prompt)
    generated = input_ids[:]
    max_new_tokens = min(60, 511 - len(input_ids))  # Stay within 512 limit
    
    with torch.no_grad():
        for i in range(max_new_tokens):
            # Trim to max_seq_len-1 to leave room for generation
            input_seq = generated[-511:] if len(generated) > 511 else generated
            
            logits = model(torch.tensor([input_seq], dtype=torch.long, device=device))
            next_token = logits[:, -1, :].argmax(dim=-1).item()
            generated.append(next_token)
            if next_token == tokenizer.eos_token_id:
                break
    
    output = tokenizer.decode(generated[len(input_ids):])
    print(f"Generated: {output[:100]}")
    
    # Check if valid JSON starts
    is_valid_start = output.strip().startswith('[{') or output.strip().startswith('"tool"')
    print(f"Valid JSON start: {is_valid_start}")
    
    # Check for tool name
    has_tool = '"tool"' in output or 'tool' in output.lower()
    print(f"Has tool reference: {has_tool}")

print("\n" + "="*50)
print("Test complete")
