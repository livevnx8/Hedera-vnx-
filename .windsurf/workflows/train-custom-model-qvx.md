---
description: Train custom Vera model using QVX bot-capture data
---

# Train Custom Model on QVX Data

Fine-tune `veda-qvx-v6-merged` using archived QVX bot-captures.

## Prerequisites

- NVIDIA GPU with CUDA
- QVX data archived on `/mnt/vera-ssd/qvx-archive/`
- Model at `/home/vera-live-0-1/QVX/models/veda-qvx-v6-merged` (15G)

## Quick Start

```bash
// turbo
cd /home/vera-live-0-1/QVX
python -m venv .venv
source .venv/bin/activate
pip install torch transformers accelerate peft bitsandbytes datasets
```

## Prepare QVX Dataset

```bash
// turbo
cat > /home/vera-live-0-1/hedera-llm-api/scripts/prepare-qvx-dataset.py << 'EOF'
import json, os, glob
from pathlib import Path

CAPTURES = "/mnt/vera-ssd/qvx-archive/bot-captures"
OUTPUT = "/mnt/vera-ssd/qvx-archive/training-dataset.jsonl"

with open(OUTPUT, 'w') as out:
    for path in glob.glob(f"{CAPTURES}/*.json")[:10000]:
        try:
            with open(path) as f:
                data = json.load(f)
            if 'input' in data and 'output' in data:
                out.write(json.dumps({
                    "messages": [
                        {"role": "user", "content": data['input']},
                        {"role": "assistant", "content": data['output']}
                    ]
                }) + "\n")
        except: continue

print(f"Dataset ready: {OUTPUT}")
EOF

python scripts/prepare-qvx-dataset.py
```

## LoRA Fine-Tuning

```bash
// turbo
cat > scripts/train-qvx.py << 'EOF'
from transformers import AutoTokenizer, AutoModelForCausalLM, TrainingArguments, Trainer
from peft import LoraConfig, get_peft_model
from datasets import load_dataset

MODEL = "/home/vera-live-0-1/QVX/models/veda-qvx-v6-merged"
DATASET = "/mnt/vera-ssd/qvx-archive/training-dataset.jsonl"
OUTPUT = "/mnt/vera-ssd/qvx-archive/vera-qvx-v7-lora"

tokenizer = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForCausalLM.from_pretrained(MODEL, load_in_4bit=True, device_map="auto")

lora_config = LoraConfig(
    r=16, lora_alpha=32, target_modules=["q_proj","v_proj"],
    lora_dropout=0.05, bias="none", task_type="CAUSAL_LM"
)
model = get_peft_model(model, lora_config)

dataset = load_dataset("json", data_files=DATASET, split="train")

args = TrainingArguments(
    output_dir=OUTPUT,
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    fp16=True,
    save_strategy="epoch",
    logging_steps=10
)

trainer = Trainer(model=model, args=args, train_dataset=dataset)
trainer.train()
model.save_pretrained(OUTPUT)
EOF

python scripts/train-qvx.py
```

## Merge & Deploy

```bash
// turbo
# Merge LoRA into base model
python -c "
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer
base = AutoModelForCausalLM.from_pretrained('/home/vera-live-0-1/QVX/models/veda-qvx-v6-merged')
model = PeftModel.from_pretrained(base, '/mnt/vera-ssd/qvx-archive/vera-qvx-v7-lora')
merged = model.merge_and_unload()
merged.save_pretrained('/mnt/vera-ssd/vera-qvx-v7-merged')
"

# Register with Vera
curl -X POST http://localhost:8088/api/models/register \
  -d '{"name":"vera-qvx-v7","path":"/mnt/vera-ssd/vera-qvx-v7-merged","default":true}'
```
