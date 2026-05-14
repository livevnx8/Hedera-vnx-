# Vera Fine-Tuning Dataset

Training data for fine-tuning the QVX/Vera model on Hedera-specific tool use and domain knowledge.

## Files

| File | Examples | Description |
|------|----------|-------------|
| `vera-ft-train.jsonl` | 622 | Training split (95%) |
| `vera-ft-eval.jsonl` | 33 | Evaluation split (5%) |

## Dataset Stats

| Metric | Value |
|--------|-------|
| Total examples | 655 |
| Avg turns/example | 4.8 |
| Total turns | 3,173 |
| Tool-use examples | 655 (100%) |
| Unique token symbols | 15 |
| Unique accounts | 9 |

## Coverage

| Category | Examples | Tools Used |
|----------|----------|------------|
| Token search | ~120 | `hedera_search_tokens` |
| Price queries | ~130 | `saucerswap_get_token_price` |
| Balance checks | ~90 | `hedera_get_balance` |
| Account info | ~45 | `hedera_get_account_info` |
| Token holdings | ~45 | `hedera_get_tokens` |
| Transaction lookup | ~80 | `hedera_get_transaction` |
| HCS messages | ~16 | `hedera_hcs_get_messages`, `hedera_hcs_send_message` |
| HBAR transfers | ~40 | `hedera_transfer_hbar` |
| SaucerSwap swaps | ~50 | `saucerswap_swap_hbar_for_token`, `saucerswap_swap_token_for_hbar` |
| Multi-step chains | ~38 | multiple tools |
| Hedera knowledge | ~15 | none |
| Identity / refusals | ~9 | none |

## Data Format

Each line in the JSONL files is:

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "what is the price of SAUCE?" },
    { "role": "assistant", "content": "{\"name\": \"saucerswap_get_token_price\", \"arguments\": {\"token_id\": \"0.0.731861\"}}" },
    { "role": "user", "content": "<tool_response>\n{...}\n</tool_response>" },
    { "role": "assistant", "content": "**SAUCE** is currently trading at **$0.02122 USD**..." }
  ]
}
```

**Tool call format** (what the model learns to output):
```json
{"name": "tool_name", "arguments": {"param": "value"}}
```

**Tool response format** (injected by the inference loop):
```
<tool_response>
{ ...result JSON... }
</tool_response>
```

## Regenerating the Dataset

```bash
npx tsx scripts/generate-training-data.ts
```

## Fine-Tuning with QLoRA (Recommended)

### Requirements
- Base model: same Qwen checkpoint used by the QVX node
- GPU: 24GB+ VRAM (A100/H100 recommended for full quality)
- Library: `transformers`, `peft`, `trl`

### Convert JSONL to training format

The JSONL is already in OpenAI chat format, compatible with `trl`'s `SFTTrainer`:

```python
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig
import torch

model_id = "YOUR_BASE_MODEL_CHECKPOINT"

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)

model = AutoModelForCausalLM.from_pretrained(
    model_id,
    quantization_config=bnb_config,
    device_map="auto",
)
tokenizer = AutoTokenizer.from_pretrained(model_id)

dataset = load_dataset("json", data_files={
    "train": "training/vera-ft-train.jsonl",
    "test":  "training/vera-ft-eval.jsonl",
})

lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

trainer = SFTTrainer(
    model=model,
    args=SFTConfig(
        output_dir="./vera-lora",
        num_train_epochs=3,
        per_device_train_batch_size=4,
        gradient_accumulation_steps=4,
        warmup_ratio=0.05,
        learning_rate=2e-4,
        fp16=True,
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
    ),
    train_dataset=dataset["train"],
    eval_dataset=dataset["test"],
    peft_config=lora_config,
)

trainer.train()
trainer.save_model("./vera-lora-final")
```

### What the fine-tune teaches

1. **Tool call JSON format**: output bare JSON `{"name":"...","arguments":{...}}` instead of describing what it would do
2. **When to call tools**: always call `hedera_search_tokens` before price/swap operations on unknown tokens
3. **Multi-step reasoning**: chain search → price → swap in correct order
4. **Approval language**: phrase write operations as "submitting for approval" before the JSON
5. **Hedera domain facts**: token IDs, protocol mechanics, fee structure

### Expected improvements after fine-tuning

- Model stops saying "I'll call the tool..." and just outputs the JSON directly
- Reliable tool chaining (search → price → action)
- Correct token IDs for all 15+ registry tokens
- Better approval flow phrasing for write operations
