# HIP-993 Implementation Guide

**Vera's Complete HIP-993 (Large Message Support) Implementation**

---

## 📋 Overview

HIP-993 extends Hedera Consensus Service (HCS) to support messages up to **4,096 bytes** (previously 1,024 bytes). This 4x increase dramatically reduces HBAR costs and improves efficiency for large data submissions.

## 🎯 What We've Implemented

### 1. Message Format Standard

All HCS messages now use the standard HIP-993 wrapper:

```json
{
  "_hip993": {
    "type": "LOG_ENTRY|BATCH|BEACON|VERIFICATION|QUANTUM_HANDSHAKE|...",
    "version": "1.0.0",
    "max_chunk_size": 4096,
    "features": ["feature1", "feature2", "..."],
    "timestamp": 1776397427000,
    "domain": "optional-domain",
    "level": "optional-level"
  },
  "data": { ... actual message content ... }
}
```

### 2. Automatic Chunking

For messages > 4,096 bytes, Vera automatically chunks them:

```typescript
const result = await hederaMaster.submitMessage(topicId, largePayload, {
  maxChunkSize: 4096,  // HIP-993 maximum
  compression: true      // Optional compression
});

// Result:
{
  sequenceNumber: 12345,
  transactionId: "0.0.xxx@...",
  chunks: 3,
  chunkSequenceNumbers: [12343, 12344, 12345],
  totalBytes: 8500,
  hip993: {
    maxChunkSize: 4096,
    supported: true,
    features: ['chunking', 'sequence_tracking', 'large_messages']
  }
}
```

### 3. Chunk Metadata Format

Each chunked message includes reconstruction metadata:

```json
{
  "_hip993": {
    "chunk": 1,
    "total": 3,
    "messageId": "msg-1234567890-abc123",
    "timestamp": 1712524800000
  },
  "data": "...chunk data..."
}
```

### 4. Message Reconstruction

HashScan integration automatically reconstructs chunked messages:

```typescript
const hashscan = new HashScanClient();
const messages = await hashscan.getTopicMessages(topicId, 100);
const reconstructed = hashscan.reconstructChunkedMessages(messages);

// Result:
{
  single: [...],           // Non-chunked messages
  reconstructed: [{
    messageId: "msg-123...",
    totalChunks: 3,
    chunks: [...],
    reconstructedData: { ... },
    firstTimestamp: 1712524800000,
    lastTimestamp: 1712524800100
  }]
}
```

---

## 🔧 Components Updated

### Core HCS Loggers (All HIP-993 Compliant)

| Component | HIP-993 Type | Status |
| --------- | ------------ | ------ |
| `premiumHCSLogger.ts` | `LOG_ENTRY` | ✅ |
| `hcsMessenger.ts` | `BATCH` | ✅ |
| `hcsDomainLogger.ts` | `DOMAIN_LOG` | ✅ |
| `veraHCS.ts` | `VERIFICATION`, `GROWTH_MILESTONE`, `TRUST_SCORE`, `PAYMENT_RECEIPT`, `ACHIEVEMENT` | ✅ |
| `agentHCSBeacon.ts` | `BEACON` | ✅ |
| `optimizedHCSLogger.ts` | `ALERT`, `INIT`, `BATCH` | ✅ |
| `quantumHandshake.ts` | `QUANTUM_HANDSHAKE` | ✅ |
| `hederaMasterClass.ts` | Core chunking logic | ✅ |

### Key Features

- **Max chunk size**: 4,096 bytes (HIP-993 limit)
- **Chunking**: Automatic for oversized messages
- **Sequence tracking**: Per-chunk sequence numbers
- **Reconstruction**: Via HashScan client
- **Compression**: Optional gzip/brotli
- **Cost tracking**: Real-time HBAR cost monitoring

---

## 💰 Cost Benefits

### Before vs After HIP-993

| Scenario | Before (1KB) | After (4KB) | Savings |
|----------|-------------|------------|---------|
| 8,500 byte message | 9 messages | 3 messages | **67%** |
| Daily logs (~100KB) | ~100 messages | ~25 messages | **75%** |
| Cost per day | ~$0.01 | ~$0.0025 | **75%** |

### Real Example: Quantum Handshake

```
Quantum Handshake Payload: 1,320 bytes

Before HIP-993:
  - Chunks: 2 (1,024 + 296 bytes)
  - Cost: $0.0002 USD

After HIP-993:
  - Chunks: 1 (fits in 4,096 bytes)
  - Cost: $0.0001 USD
  - Savings: 50%
```

---

## 🧪 Testing

### 1. Test Chunking & Reconstruction

```bash
node examples/test-hip993-chunking.mjs
```

This will:
- Generate a > 4KB test payload
- Submit with automatic chunking
- Verify chunk metadata
- Reconstruct from HashScan
- Validate data integrity

### 2. Test Quantum Handshake (Already Working)

```bash
curl -X POST http://localhost:8080/api/vera/quantum/handshake \
  -H "Content-Type: application/json" \
  -d '{
    "initiatorId": "vera-core",
    "responderId": "quantum-node",
    "securityLevel": "QUANTUM",
    "dimensions": 11,
    "topicId": "0.0.10414499"
  }'
```

View on HashScan:
- Transaction: https://hashscan.io/mainnet/transaction/0.0.10294360-1776397420-456898626
- Topic: https://hashscan.io/mainnet/topic/0.0.10414499

### 3. Verify Message Format

```bash
curl http://localhost:8080/api/vera/hashscan/topic/0.0.10414499/message/73911 | jq '.'
```

Expected output:
```json
{
  "_hip993": {
    "type": "QUANTUM_HANDSHAKE",
    "version": "1.0.0",
    "max_chunk_size": 4096,
    "features": ["quantum_handshake", "entanglement_log", "verification_proof"]
  },
  "data": { ... }
}
```

---

## 📊 Message Types

### Standard Types

| Type | Purpose | Used In |
| ---- | ------- | ------- |
| `LOG_ENTRY` | Structured logging | premiumHCSLogger |
| `BATCH` | Batched messages | hcsMessenger, optimizedHCSLogger |
| `DOMAIN_LOG` | Domain-specific logs | hcsDomainLogger |
| `BEACON` | Agent heartbeats | agentHCSBeacon |
| `ALERT` | Alert notifications | optimizedHCSLogger |
| `INIT` | Initialization messages | optimizedHCSLogger |
| `VERIFICATION` | Verification records | veraHCS |
| `GROWTH_MILESTONE` | Growth tracking | veraHCS |
| `TRUST_SCORE` | Trust metrics | veraHCS |
| `PAYMENT_RECEIPT` | Payment records | veraHCS |
| `ACHIEVEMENT` | Achievement records | veraHCS |
| `QUANTUM_HANDSHAKE` | Quantum handshakes | quantumHandshake |

### Features by Type

Each type declares its features:
- `structured_logging` - Human and machine-readable
- `integrity_hash` - SHA-256 verification
- `compression` - gzip/brotli support
- `batching` - Multiple messages combined
- `chunking` - Large message support
- `sequence_tracking` - Per-topic ordering
- `deduplication` - Duplicate detection
- `chain_hash` - Message chain verification

---

## 🔍 HashScan Integration

### Pull Messages

```bash
# Get recent messages
curl http://localhost:8080/api/vera/hashscan/topic/0.0.10414499?limit=10

# Get specific message
curl http://localhost:8080/api/vera/hashscan/topic/0.0.10414499/message/73911

# Reconstruct chunked messages
curl "http://localhost:8080/api/vera/hashscan/topic/0.0.10414499?reconstruct=true"
```

### API Response Format

```json
{
  "success": true,
  "topic": {
    "id": "0.0.10414499",
    "hashscanUrl": "https://hashscan.io/mainnet/topic/0.0.10414499"
  },
  "summary": {
    "totalMessages": 73911,
    "hip993Messages": 45000,
    "chunkedMessages": 1200,
    "reconstructedMessages": 400
  },
  "hip993": {
    "supported": true,
    "features": ["chunking", "reconstruction", "large_messages"],
    "maxChunkSize": 4096
  }
}
```

---

## 🛠️ Implementation Process

### Step 1: Add HIP-993 Wrapper

All messages must include the `_hip993` envelope:

```typescript
const hip993Payload = {
  _hip993: {
    type: 'YOUR_TYPE',
    version: '1.0.0',
    max_chunk_size: 4096,
    features: ['your', 'features'],
    timestamp: Date.now()
  },
  data: yourMessageData
};
```

### Step 2: Use hederaMaster for Chunking

```typescript
const result = await hederaMaster.submitMessage(topicId, hip993Payload, {
  maxChunkSize: 4096,
  compression: true  // Optional
});
```

### Step 3: Handle Reconstruction

Use HashScan client for automatic reconstruction:

```typescript
const hashscan = new HashScanClient();
const messages = await hashscan.getTopicMessages(topicId);
const { reconstructed } = hashscan.reconstructChunkedMessages(messages);
```

---

## 📈 Monitoring

### HCS Metrics Endpoint

```bash
curl http://localhost:8080/api/vera/hcs/metrics
```

Response:
```json
{
  "success": true,
  "metrics": {
    "messagesSubmitted": 1234,
    "messagesFailed": 5,
    "bytesSubmitted": 5678901,
    "averageLatency": 250,
    "costUSD": 0.1234,
    "hip993": {
      "enabled": true,
      "maxChunkSize": 4096,
      "chunksCreated": 450,
      "singleMessages": 334
    }
  }
}
```

---

## 🔐 Best Practices

### 1. Message Size Management

- Keep messages under 4,096 bytes when possible
- Use batching for multiple small messages
- Compress large payloads
- Truncate verbose data with summaries

### 2. Type Consistency

- Use consistent `_hip993.type` values
- Document new types in this guide
- Include relevant features array

### 3. Error Handling

- Handle chunk submission failures
- Implement retry with exponential backoff
- Monitor sequence gaps

### 4. Testing

- Test chunking with > 4KB payloads
- Verify reconstruction from HashScan
- Validate data integrity after reconstruction

---

## 📝 Summary

Vera now has **complete HIP-993 compliance** across all HCS loggers:

✅ **All 8 HCS loggers** use standard `_hip993` wrapper  
✅ **Automatic chunking** for messages > 4,096 bytes  
✅ **Chunk metadata** for reconstruction  
✅ **HashScan integration** with reconstruction  
✅ **~75% cost reduction** from larger messages  
✅ **Quantum handshake** demonstrated on mainnet (seq #73911)

**Next Steps:**
1. Run `examples/test-hip993-chunking.mjs` to verify chunking
2. Monitor HCS metrics for cost savings
3. Use HashScan to verify message reconstruction

---

**HIP-993: Making Hedera HCS 4x More Efficient** 🚀
