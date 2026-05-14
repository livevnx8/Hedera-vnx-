---
description: Train custom AI models on GPU for Vera lattice
---

# Train Model on GPU

Train custom AI models using Vera's GPU infrastructure.

## Quick Start

```bash
// turbo
# Start training with defaults
./train-model.sh --dataset vera-chat-v2 --gpus 4
```

## 1. Prepare Dataset

```bash
// turbo
# Upload training data
curl -X POST http://localhost:8088/api/ai/training/datasets \
  -F "file=@training-data.jsonl" \
  -F "name=vera-custom-v1" \
  -F "format=jsonl"

# Validate dataset
node -e "
import { datasetValidator } from './src/ai/datasetValidator.js';
const stats = await datasetValidator.validate('vera-custom-v1');
console.log('Samples:', stats.count);
console.log('Quality:', stats.qualityScore);
console.log('Warnings:', stats.warnings);
"
```

## 2. Configure Training

```bash
// turbo
# Training configuration
cat > training-config.yml << 'EOF'
model:
  base: meta-llama/Llama-2-7b-chat-hf
  output: vera-custom-v1

training:
  epochs: 3
  batch_size: 4
  gradient_accumulation: 4
  learning_rate: 2e-5
  warmup_steps: 100
  max_seq_length: 2048

gpu:
  devices: [0, 1, 2, 3]
  precision: bf16
  gradient_checkpointing: true
  deepspeed: true

optimization:
  optimizer: adamw_torch
  scheduler: cosine
  weight_decay: 0.01
  max_grad_norm: 1.0
EOF
```

## 3. Launch Training

```bash
// turbo
# Single node multi-GPU
torchrun \
  --nproc_per_node=4 \
  src/ai/train.py \
  --config training-config.yml \
  --dataset vera-custom-v1 \
  --output-dir models/vera-custom-v1

# Or use Vera API
curl -X POST http://localhost:8088/api/ai/training/jobs \
  -d '{
    "name": "vera-custom-v1",
    "config": "training-config.yml",
    "gpus": 4,
    "priority": "high"
  }'
```

## 4. Monitor Training

```bash
// turbo
# Real-time metrics
curl http://localhost:8088/api/ai/training/jobs/vera-custom-v1/metrics | jq .

# TensorBoard
tensorboard --logdir models/vera-custom-v1/logs

# Watch GPU usage
watch -n 1 nvidia-smi
```

## 5. Distributed Training (Multi-Node)

```bash
# Node 1 (master)
torchrun \
  --nnodes=2 \
  --nproc_per_node=8 \
  --master_addr=192.168.1.10 \
  --master_port=29500 \
  --node_rank=0 \
  src/ai/train.py --config training-config.yml

# Node 2 (worker)
torchrun \
  --nnodes=2 \
  --nproc_per_node=8 \
  --master_addr=192.168.1.10 \
  --master_port=29500 \
  --node_rank=1 \
  src/ai/train.py --config training-config.yml
```

## 6. Fine-Tuning Techniques

### LoRA (Memory Efficient)

```bash
// turbo
# LoRA config
cat >> training-config.yml << 'EOF'
lora:
  enabled: true
  r: 64
  alpha: 128
  dropout: 0.05
  target_modules: [q_proj, v_proj, k_proj, o_proj]
EOF

# Train with LoRA
./train-model.sh --lora --gpus 2
```

### QLoRA (4-bit Quantization)

```bash
// turbo
# For 24GB GPUs training 70B models
export VERA_QLORA_ENABLED=true
export VERA_QLORA_BITS=4
export VERA_QLORA_GROUP_SIZE=128

./train-model.sh --qlora --gpus 1 --model Llama-2-70b
```

## 7. Evaluation

```bash
// turbo
# Run evaluation
node -e "
import { modelEvaluator } from './src/ai/modelEvaluator.js';
const results = await modelEvaluator.evaluate({
  model: 'vera-custom-v1',
  benchmarks: ['mmlu', 'truthfulqa', 'vera-chat'],
  gpus: 2
});
console.log('MMLU:', results.mmlu);
console.log('TruthfulQA:', results.truthfulqa);
console.log('Vera-Chat:', results.veraChat);
"

# Compare with baseline
curl http://localhost:8088/api/ai/models/compare?baseline=vera-v2&new=vera-custom-v1
```

## 8. Deploy Trained Model

```bash
// turbo
# Convert to deployment format
node convert-model.mjs \
  --input models/vera-custom-v1 \
  --output models/vera-custom-v1-deploy \
  --format tensorrt

# Deploy to lattice
curl -X POST http://localhost:8088/api/ai/models/deploy \
  -d '{
    "model": "vera-custom-v1",
    "version": "v1.0.0",
    "gpu_memory": "24GB",
    "traffic_split": 10
  }'

# Gradually increase traffic
curl -X POST http://localhost:8088/api/ai/models/canary \
  -d '{"model": "vera-custom-v1", "percentage": 50}'
```

## 9. Training Pipeline

```bash
// turbo
# Automated retraining pipeline
cat > retrain-pipeline.yml << 'EOF'
trigger:
  schedule: weekly
  condition: data_quality_score > 0.8

steps:
  - fetch_new_data
  - validate_dataset
  - train_model
  - evaluate_model
  - deploy_if_better

resources:
  gpus: 8
  time_limit: 24h
EOF

# Schedule
kubectl apply -f retrain-pipeline.yml
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| OOM during training | Reduce batch size, enable gradient checkpointing |
| NaN loss | Lower learning rate, check data quality |
| Slow training | Enable DeepSpeed, use bf16 |
| NCCL errors | Check network, set NCCL_TIMEOUT |

## Next Steps

- `/optimize-gpu-performance` - Optimize inference
- `/monitor-gpu-health` - Monitor training GPUs
