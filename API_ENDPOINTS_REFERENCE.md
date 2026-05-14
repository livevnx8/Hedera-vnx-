# Vera API Endpoints Reference
## Complete REST API Documentation

**Last Updated:** April 2026  
**Total Endpoints:** 30+

---

## 🤖 AI Intelligence Endpoints

### Chain-of-Thought Reasoning
```
POST /api/vera/ai/reason
```
Multi-step reasoning with tool use.

**Request:**
```json
{
  "problem": "Should I stake HBAR or provide liquidity?",
  "context": { "risk_tolerance": "medium" }
}
```

**Response:**
```json
{
  "success": true,
  "answer": "...detailed analysis...",
  "confidence": 0.87,
  "steps": 7,
  "duration": 2340,
  "reasoningPath": "Step 1 → Step 2 → ..."
}
```

### Self-Consistency Reasoning
```
POST /api/vera/ai/reason/consistency
```
Multiple samples with majority vote.

**Request:**
```json
{
  "problem": "What is 2+2?",
  "samples": 5,
  "context": {}
}
```

**Response:**
```json
{
  "success": true,
  "answer": "4",
  "confidence": 0.98,
  "votes": 5,
  "totalSamples": 5
}
```

### Get Training Dataset
```
GET /api/vera/ai/dataset
```
Returns Hedera-specific training examples.

**Response:**
```json
{
  "success": true,
  "count": 25,
  "categories": ["token", "defi", "general"],
  "preview": ["Create a Hedera token...", "..."]
}
```

---

## 🔮 Predictive Analytics Endpoints

### HBAR Price Forecast
```
GET /api/vera/predict/hbar?hours=24
```
Hybrid ARIMA + LSTM price prediction.

**Response:**
```json
{
  "success": true,
  "symbol": "HBAR/USD",
  "horizon": "24h",
  "predictions": [
    {
      "timestamp": 1713304800000,
      "value": 0.0523,
      "confidenceLower": 0.0480,
      "confidenceUpper": 0.0566
    }
  ],
  "confidence": 0.82,
  "metrics": {
    "mae": 0.0012,
    "rmse": 0.0015,
    "mape": 0.024
  }
}
```

### Detect Price Anomalies
```
GET /api/vera/predict/hbar/anomalies
```
Statistical anomaly detection (Z-score > 2.5).

**Response:**
```json
{
  "success": true,
  "totalAnalyzed": 50,
  "anomaliesFound": 2,
  "anomalies": [
    {
      "timestamp": 1713304800000,
      "value": 0.0650,
      "expectedValue": 0.0520,
      "deviation": 3.2,
      "isAnomaly": true,
      "severity": "high"
    }
  ]
}
```

### DeFi Yield Prediction
```
POST /api/vera/predict/yield
```
Forecast yields for multiple pools.

**Request:**
```json
{
  "poolIds": ["sauce-hbar", "heliswap-hbar", "tangent-hbar"],
  "days": 7
}
```

**Response:**
```json
{
  "success": true,
  "opportunities": [
    {
      "poolId": "sauce-hbar",
      "currentApy": 24.5,
      "trend": "up",
      "confidence": 0.78
    }
  ],
  "forecasts": [
    {
      "poolId": "sauce-hbar",
      "forecast": {
        "confidence": 0.72,
        "predictions": [...]
      }
    }
  ]
}
```

---

## 👁️ Vision / Multi-Modal Endpoints

### Analyze Image
```
POST /api/vera/vision/analyze
```
General image analysis (charts, documents, etc.).

**Request:**
```json
{
  "imageUrl": "https://example.com/chart.png",
  "mimeType": "image/png"
}
```

**Response:**
```json
{
  "success": true,
  "description": "HBAR/USD price chart showing 4-hour candlesticks",
  "objects": [
    { "label": "price_chart", "confidence": 0.95 },
    { "label": "candlesticks", "confidence": 0.92 }
  ],
  "text": ["HBAR/USD", "$0.0523", "+2.4%"],
  "isHederaRelated": true,
  "confidence": 0.93
}
```

### Analyze Trading Chart
```
POST /api/vera/vision/chart
```
Technical analysis of price charts.

**Request:**
```json
{
  "imageUrl": "https://example.com/hbar-chart.png"
}
```

**Response:**
```json
{
  "success": true,
  "symbol": "HBAR/USD",
  "timeframe": "4H",
  "trend": "bullish",
  "supportLevels": [0.048, 0.045, 0.042],
  "resistanceLevels": [0.055, 0.060, 0.065],
  "volatility": "medium",
  "recommendation": "Consider taking profits at resistance..."
}
```

### Scan Contract Document
```
POST /api/vera/vision/contract
```
Extract and analyze smart contract from image.

**Request:**
```json
{
  "imageUrl": "https://example.com/contract-code.png"
}
```

**Response:**
```json
{
  "success": true,
  "contractType": "ERC-20 / HTS Token",
  "functions": ["function transfer", "event Transfer"],
  "risks": ["Centralized admin key", "No timelock"],
  "recommendations": ["Add multi-sig", "Implement timelock"]
}
```

---

## 💰 Revenue & Payment Endpoints

### List Payment Streams
```
GET /api/vera/payments/streams
```

**Response:**
```json
{
  "success": true,
  "activeStreams": 3,
  "stats": {
    "totalRevenue": 0.125,
    "activeStreams": 3,
    "averageStreamDuration": 450
  },
  "streams": [
    {
      "id": "stream-1713301234567",
      "client": "0.0.123456",
      "resource": "premium-api",
      "rate": 0.001,
      "status": "active",
      "totalPaid": 0.045
    }
  ]
}
```

### Create Payment Stream
```
POST /api/vera/payments/streams
```

**Request:**
```json
{
  "clientAddress": "0.0.123456",
  "resource": "premium-api",
  "ratePerSecond": 0.001,
  "maxDurationSeconds": 300,
  "currency": "USD"
}
```

**Response:**
```json
{
  "success": true,
  "streamId": "stream-1713301234567-abc123",
  "status": "active",
  "startTime": 1713301234567
}
```

### Get User Usage
```
GET /api/vera/payments/usage/:userId?apiKey=key123
```

**Response:**
```json
{
  "success": true,
  "userId": "user-123",
  "tier": "pro",
  "callsToday": 45,
  "callsThisMonth": 1234,
  "totalSpend": 12.34,
  "lastCall": 1713304800000
}
```

### Revenue Statistics
```
GET /api/vera/payments/revenue
```

**Response:**
```json
{
  "success": true,
  "x402Revenue": {
    "totalRevenue": 0.125,
    "activeStreams": 3,
    "terminatedStreams": 1,
    "completedStreams": 12
  },
  "timestamp": 1713304800000
}
```

---

## 🛡️ Security Endpoints

### TEE Status
```
GET /api/vera/security/tee
```

**Response:**
```json
{
  "success": true,
  "initialized": true,
  "id": "enclave-1713301234567",
  "teeType": "intel_sgx",
  "status": "running",
  "operationsCount": 156,
  "memoryUsed": 245760,
  "uptime": 3600000
}
```

### Initialize TEE
```
POST /api/vera/security/tee/init
```

**Request:**
```json
{
  "teeType": "intel_sgx"
}
```

**Response:**
```json
{
  "success": true,
  "teeType": "intel_sgx",
  "message": "intel_sgx initialized successfully"
}
```

### Get Attestation
```
GET /api/vera/security/tee/attestation
```

**Response:**
```json
{
  "success": true,
  "attestation": {
    "teeType": "intel_sgx",
    "measurement": "a1b2c3d4e5f6...",
    "timestamp": 1713304800000,
    "isValid": true,
    "quote": "AQAAAA..."
  }
}
```

### Execute in TEE
```
POST /api/vera/security/tee/execute
```

**Request:**
```json
{
  "operation": "generate_key",
  "input": { "type": "ed25519" }
}
```

**Response:**
```json
{
  "success": true,
  "operation": "generate_key",
  "result": {
    "publicKey": "0x1234...",
    "privateKeyHandle": "sealed_private_123"
  }
}
```

---

## 📊 Hedera Assistant Endpoints

### Developer Guide
```
POST /api/vera/hedera/dev-guide
```

**Request:**
```json
{
  "topic": "token creation",
  "experience": "intermediate"
}
```

### Token Analysis
```
GET /api/vera/hedera/token/:tokenId
```

### Smart Contract Generator
```
POST /api/vera/hedera/contract
```

**Request:**
```json
{
  "name": "MyToken",
  "purpose": "governance",
  "features": ["mintable", "burnable"]
}
```

### Transaction Optimization
```
POST /api/vera/hedera/optimize-tx
```

### Network Insights
```
GET /api/vera/hedera/network-insights
```

### Compliance Report
```
GET /api/vera/hedera/compliance/:entityId?entityType=account
```

---

## 🔗 NVIDIA & GPU Endpoints

### GPU Configuration
```
GET /api/vera/nvidia/config
```

### GPU Benchmark
```
POST /api/vera/nvidia/benchmark
```

### Knowledge Graph Query
```
POST /api/vera/nvidia/knowledge/query
```

---

## 📈 Response Codes

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| 200 | Success | Request processed successfully |
| 400 | Bad Request | Missing required parameters |
| 404 | Not Found | Resource doesn't exist |
| 429 | Rate Limited | Too many requests |
| 500 | Server Error | Internal processing failure |
| 503 | Service Unavailable | TEE not initialized, service down |

---

## 🔐 Authentication

Most endpoints support optional authentication via:
- `X-API-Key` header
- `apiKey` query parameter
- JWT Bearer token (enterprise tier)

---

## 📦 SDK Examples

### TypeScript/JavaScript
```typescript
import { VeraClient } from '@vera/sdk';

const client = new VeraClient({ apiKey: 'your-key' });

// Reasoning
const result = await client.ai.reason({
  problem: "Analyze HBAR staking options"
});

// Price forecast
const forecast = await client.predict.hbar({ hours: 24 });

// Create payment stream
const stream = await client.payments.createStream({
  clientAddress: "0.0.123456",
  ratePerSecond: 0.001,
  maxDurationSeconds: 300
});
```

### cURL
```bash
# Reasoning
curl -X POST http://localhost:8080/api/vera/ai/reason \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"problem": "Should I stake HBAR?"}'

# Price forecast
curl "http://localhost:8080/api/vera/predict/hbar?hours=24"

# TEE status
curl http://localhost:8080/api/vera/security/tee
```

---

**Total Endpoints:** 30+  
**Categories:** AI, Predictive, Vision, Revenue, Security, Hedera, NVIDIA  
**Status:** Production Ready ✅
