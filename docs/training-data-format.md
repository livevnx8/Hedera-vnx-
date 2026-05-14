# Training Data Format Guide

## JSONL Format (Recommended)

Each line is a complete JSON object representing one training example:

```json
{"role": "user", "content": "What is the current HBAR price?", "intent": "market_data", "domain": "defi", "timestamp": 1777690800000}
{"role": "assistant", "content": "Based on SaucerSwap feeds, HBAR is trading at $0.082 with strong volume indicators.", "memory_count": 3, "confidence": 0.92, "latency_ms": 145}
{"role": "user", "content": "Can you help me plan a carbon credit purchase?", "intent": "planning", "domain": "carbon", "timestamp": 1777690900000}
{"role": "assistant", "content": "I can help with that. Here's a structured approach:\n\n1. Verify wallet connection\n2. Check available credits\n3. Review pricing tiers\n4. Execute transaction\n\nWould you like me to start with step 1?", "memory_count": 2, "confidence": 0.88, "latency_ms": 198}
```

## Conversation Format

Multiple turns in a single conversation:

```json
{
  "session_id": "session-123",
  "domain": "defi",
  "timestamp": 1777690800000,
  "turns": [
    {
      "role": "user",
      "content": "What DeFi opportunities exist?",
      "intent": "market_data",
      "embedding": [0.1, 0.2, -0.15, ...],
      "metadata": {"source": "hcs_topic_0.0.10409351"}
    },
    {
      "role": "assistant",
      "content": "Currently active opportunities: SaucerSwap yield farming (12% APY), Hedera token staking (8% APY), carbon credit derivatives (variable). Which interests you?",
      "memory_recalls": 5,
      "confidence": 0.91,
      "latency_ms": 167,
      "metadata": {"reasoning_steps": 3, "intent": "market_data"}
    },
    {
      "role": "user",
      "content": "Tell me more about yield farming",
      "intent": "explanation"
    },
    {
      "role": "assistant",
      "content": "Yield farming on SaucerSwap involves...",
      "confidence": 0.89,
      "latency_ms": 142
    }
  ]
}
```

## Reasoning Trace Format

For training chain-of-thought reasoning:

```json
{
  "query": "What's the best carbon credit strategy?",
  "domain": "carbon",
  "intent": "planning",
  "reasoning_chain": [
    {
      "step": 1,
      "type": "goal_decomposition",
      "content": "Break down carbon strategy into: assessment, selection, execution"
    },
    {
      "step": 2,
      "type": "context_recall",
      "content": "Retrieved 3 relevant memories about carbon market trends",
      "memory_count": 3
    },
    {
      "step": 3,
      "type": "inference",
      "content": "Based on current trends, recommend mix of renewable and offset credits",
      "confidence": 0.87
    },
    {
      "step": 4,
      "type": "action_planning",
      "content": "Execute purchase at $15/ton average price",
      "estimated_cost": 1500
    }
  ],
  "final_response": "I recommend a diversified portfolio: 60% renewable credits, 40% offset credits...",
  "quality_score": 0.92
}
```

## Performance Metrics Format

Track inference performance during training:

```json
{
  "batch_id": "batch-001",
  "timestamp": 1777690800000,
  "metrics": {
    "perplexity": 12.4,
    "bleu_score": 0.78,
    "memory_recall_at_5": 0.87,
    "intent_accuracy": 0.94,
    "avg_latency_ms": 156,
    "p99_latency_ms": 289,
    "confidence_avg": 0.89,
    "memory_usage_mb": 342
  },
  "per_domain": {
    "defi": {"accuracy": 0.96, "latency_ms": 142},
    "carbon": {"accuracy": 0.92, "latency_ms": 168},
    "reasoning": {"accuracy": 0.90, "latency_ms": 195},
    "general": {"accuracy": 0.91, "latency_ms": 134}
  }
}
```

## Collection from HCS

Example of data collected from HCS topics:

```json
{
  "topic_id": "0.0.10409351",
  "message_sequence_number": 12345,
  "consensus_timestamp": "2026-05-02T10:30:45Z",
  "message": {
    "type": "conversation",
    "session_id": "session-abc123",
    "role": "user",
    "content": "Can you verify my carbon credit balance?",
    "embedding": [0.08, 0.12, -0.19, ...],
    "timestamp": 1777690800000,
    "metadata": {
      "source": "hcs_topic",
      "quality": 0.95
    }
  }
}
```

## Data Quality Checklist

Before including in training:

- [ ] No PII (personal identifiable information)
- [ ] Properly formatted JSON
- [ ] Content length between 10-2000 characters
- [ ] Intent correctly classified
- [ ] Domain assignment matches content
- [ ] Embedding vector dimension matches config (128)
- [ ] Timestamps in milliseconds since epoch
- [ ] No invalid characters or encoding issues
- [ ] Metadata complete and valid
- [ ] Response follows user query logically

## Splitting Training/Validation

Default: 90% training, 10% validation

```bash
# Automated split
npm run split:training-data --input training-data/raw.jsonl --ratio 0.9
```

## Sample Datasets

Pre-configured sample datasets available:

```bash
# Download samples
npm run download:sample-data

# Files created:
# - training-data/sample-conversations.jsonl (1000 examples)
# - training-data/sample-defi.jsonl (500 examples)
# - training-data/sample-carbon.jsonl (300 examples)
# - training-data/sample-reasoning.jsonl (200 examples)
```

## Validation

Validate data format before training:

```bash
npm run validate:training-data --input training-data/raw.jsonl
```

Output:
```
✓ Format validation passed
✓ 5000 examples loaded
✓ 18 PII instances detected and removed
✓ Quality score: 0.94
✓ Ready for training
```
