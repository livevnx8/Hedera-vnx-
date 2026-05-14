# VNX Model Training Guide

## Overview
VNX uses a lattice-based reasoning system trained on Hedera network data, DeFi operations, and carbon credit intelligence. This guide covers training specialized VNX models for production deployment.

## Quick Start

```bash
# 1. Prepare training data from HCS
npm run collect:hcs-training-data

# 2. Process and format for training
npm run process:training-data

# 3. Train base VNX model
npm run train:vnx-base

# 4. Fine-tune for specific domains
npm run train:vnx-defi      # DeFi market analysis
npm run train:vnx-carbon    # Carbon credit intelligence
npm run train:vnx-reasoning # Chain-of-thought reasoning

# 5. Validate model performance
npm run validate:model

# 6. Deploy to inference
npm run deploy:model
```

## Training Data Sources

### 1. HCS Memories (Conversations)
- Location: Topic `0.0.10409351` (CONVERSATIONS)
- Format: JSON with embeddings
- Size: 10,000+ stored conversations
- Refresh: Real-time from network

### 2. Knowledge Graph
- Location: Topic `0.0.10409352` (KNOWLEDGE)
- Contains: Facts, relationships, reasoning chains
- Update frequency: Every 24 hours

### 3. Task Execution Traces
- Location: Topic `0.0.10409353` (TASKS)
- Contains: Planning steps, execution logs, outcomes
- Valuable for: Behavior cloning

### 4. Reasoning Chains
- Location: Topic `0.0.10409354` (REASONING)
- Contains: Multi-step reasoning examples
- Use case: Improving chain-of-thought

## Model Architecture

### Lattice Embedding Engine
```typescript
// 128-dimensional geometric embeddings
// Character n-gram based representation
// Cosine similarity for memory retrieval
```

**Configuration:**
- Embedding dimension: 128
- Cache size: 10,000 vectors
- Similarity threshold: 0.6

### Reasoning Engine
- Intent classification (planning, explanation, transaction, market_data)
- Memory recall with confidence scoring
- Multi-step reasoning with premises and inferences

### Training Recipe

**Phase 1: Supervised Learning**
- Dataset: 10,000 conversation pairs
- Task: Next-response prediction
- Optimizer: Adam (lr=2e-4)
- Batch size: 32
- Epochs: 10

**Phase 2: Fine-tuning**
```bash
# Domain-specific fine-tuning
# Each domain gets 2,000 specialized examples

domain=defi
epochs=5
batch_size=32

python train.py \
  --model vnx-base \
  --domain $domain \
  --data training-data/$domain.jsonl \
  --epochs $epochs \
  --batch_size $batch_size \
  --output models/vnx-$domain.bin
```

**Phase 3: Reinforcement Learning (Optional)**
- Reward signal: User satisfaction + response accuracy
- PPO with KL penalty to prevent drift
- 1,000 interaction rollouts

## Configuration Files

### `training-config.json`
```json
{
  "model": "vnx-v1",
  "embedding_dim": 128,
  "cache_size": 10000,
  "max_context": 50,
  "domains": ["defi", "carbon", "reasoning", "general"],
  "hcs_topics": {
    "conversations": "0.0.10409351",
    "knowledge": "0.0.10409352",
    "tasks": "0.0.10409353",
    "reasoning": "0.0.10409354"
  },
  "training": {
    "batch_size": 32,
    "learning_rate": 0.0002,
    "epochs": 10,
    "validation_split": 0.1
  }
}
```

## Data Collection Pipeline

### Automatic Collection
1. Connect to HCS topics
2. Stream messages in real-time
3. Parse and format with metadata
4. Store in `training-data/` with versioning

```javascript
// Runs as background job
npm run collect:hcs-training-data --watch
```

### Manual Collection
```bash
# Export specific date range
npm run export:training-data -- \
  --from 2026-05-01 \
  --to 2026-05-02 \
  --topics CONVERSATIONS,KNOWLEDGE \
  --output training-data/may-export.jsonl
```

## Model Validation

### Metrics Tracked
- **Perplexity**: Lower is better (target: <15)
- **BLEU Score**: Response similarity to reference (target: >0.7)
- **Memory Recall**: Relevant memories at top-5 (target: >85%)
- **Intent Accuracy**: Correct intent classification (target: >92%)
- **Response Time**: Sub-second generation (target: <300ms)

### Validation Script
```bash
npm run validate:model --model models/vnx-defi.bin
```

Output:
```
Model: vnx-defi
Perplexity: 12.4
BLEU Score: 0.78
Memory Recall @5: 87%
Intent Accuracy: 94%
Avg Response Time: 245ms

Status: ✅ PASS - Ready for production
```

## Deployment

### Export Model
```bash
npm run export:model -- \
  --model models/vnx-defi.bin \
  --format onnx \
  --output dist/models/vnx-defi.onnx
```

### Load in Production
```typescript
import { VNXModel } from './src/inference/vnx-model';

const model = await VNXModel.load('dist/models/vnx-defi.onnx', {
  embeddingDim: 128,
  cacheSize: 10000,
  maxContextMessages: 50
});

const response = await model.chat({
  messages: userMessages,
  sessionId: 'session-123',
  domain: 'defi'
});
```

## Production Checklist

- [ ] Training data collected (>10,000 examples)
- [ ] Data quality validated (no PII, properly formatted)
- [ ] Model trained on 90% of data
- [ ] Validation metrics pass thresholds
- [ ] Response time <300ms at 50 concurrent users
- [ ] Memory consumption <500MB
- [ ] Model exported to ONNX format
- [ ] A/B test with 10% traffic for 24 hours
- [ ] Full rollout to 100% traffic
- [ ] Monitor for drift (daily comparisons)

## Continuous Training

Models are re-trained weekly with new HCS data:

```bash
# Weekly retraining job (runs Sundays 02:00 UTC)
0 2 * * 0 /usr/local/bin/node /app/scripts/retrain-weekly.mjs
```

New model is validated against current production model. If metrics improve, automatically promoted to production with 5% traffic first.

## Troubleshooting

**Q: Training is slow**
- Check GPU availability: `nvidia-smi`
- Reduce batch size: `--batch_size 16`
- Use mixed precision: `--precision fp16`

**Q: Low intent accuracy**
- Collect more examples for underrepresented intents
- Increase training epochs
- Verify label quality in `training-data/`

**Q: High response latency in production**
- Profile with: `npm run profile:inference`
- Consider quantization: `--quantize int8`
- Cache more common queries

## Resources

- HCS Integration: [docs/hcs-integration.md](docs/hcs-integration.md)
- Vera Lattice Architecture: [docs/vera-lattice-architecture.md](docs/vera-lattice-architecture.md)
- Hedera SDK: https://docs.hedera.com/
- Training Data Format: [docs/training-data-format.md](docs/training-data-format.md)
