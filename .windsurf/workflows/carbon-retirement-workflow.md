---
description: Process carbon credit retirements on Hedera
---

# Carbon Retirement Workflow

End-to-end workflow for verifying and retiring carbon credits on Hedera.

## Prerequisites

- Carbon project registered
- HCS carbon retirement topic created
- Vera lattice deployed
- Agent with carbon verification capability

## Carbon Retirement Steps

### 1. Submit Retirement Request

```bash
// turbo
curl -X POST http://localhost:8088/api/carbon/retire \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "VCS-VCU-1529",
    "vintage": "2020",
    "tons": 1000,
    "beneficiary": {
      "name": "Acme Corporation",
      "location": "USA"
    },
    "reason": "Annual carbon neutrality commitment",
    "metadata": {
      "scope": "Scope 1 + 2 emissions",
      "period": "FY2024"
    }
  }'
```

**Returns:**
```json
{
  "retirementId": "CR-20240115-001",
  "status": "pending_verification",
  "estimatedTime": "5 minutes",
  "verificationQueue": 3
}
```

### 2. AI-Powered Verification

Vera automatically verifies:
- Project existence in registry
- Credit vintage validity
- Double-counting prevention
- Beneficiary authenticity

```bash
// turbo
# Check verification status
curl http://localhost:8088/api/carbon/retire/CR-20240115-001/status
```

**Verification stages:**
1. **Document Check** (30s) - Verify project documentation
2. **Registry Check** (60s) - Cross-reference Verra/VCS registry
3. **AI Analysis** (2min) - Pattern matching for fraud detection
4. **Consensus** (2min) - Multi-agent verification

### 3. HTS Token Retirement

Upon verification, Vera executes:

```typescript
import { hederaMaster } from './src/hedera/hederaMasterClass.js';

// 1. Transfer carbon tokens to retirement account
await hederaMaster.transferToken({
  tokenId: process.env.CARBON_TOKEN_ID,
  from: requesterAccount,
  to: process.env.RETIREMENT_ACCOUNT,
  amount: tons * 100000000 // 8 decimals
});

// 2. Mint retirement NFT as proof
await hederaMaster.mintNFT({
  tokenId: process.env.RETIREMENT_NFT_ID,
  metadata: JSON.stringify({
    projectId,
    vintage,
    tons,
    beneficiary,
    retirementId,
    timestamp: Date.now()
  })
});
```

### 4. HCS Audit Trail

Log retirement to Hedera Consensus Service:

```bash
// turbo
node -e "
import { wvCarbonRetirementLogger } from './src/carbon/wvCarbonRetirementLogger.js';

await wvCarbonRetirementLogger.logRetirement({
  retirementId: 'CR-20240115-001',
  projectId: 'VCS-VCU-1529',
  tons: 1000,
  beneficiary: 'Acme Corporation',
  verificationProof: 'multi-agent-consensus',
  nftSerial: 12345
});

console.log('✅ Retirement logged to HCS');
"
```

### 5. Generate Retirement Certificate

```bash
// turbo
curl http://localhost:8088/api/carbon/retire/CR-20240115-001/certificate \
  -o retirement-certificate-CR-20240115-001.pdf
```

**Certificate includes:**
- Retirement NFT serial number
- Transaction ID on Hedera
- Multi-agent verification signatures
- Carbon project details
- Timestamp and immutability proof

## Batch Retirement

### Process Multiple Credits

```bash
// turbo
curl -X POST http://localhost:8088/api/carbon/retire/batch \
  -H "Content-Type: application/json" \
  -d '{
    "retirements": [
      {
        "projectId": "VCS-VCU-1529",
        "vintage": "2020",
        "tons": 500
      },
      {
        "projectId": "VCS-VCU-1530",
        "vintage": "2021",
        "tons": 500
      }
    ],
    "beneficiary": {
      "name": "Acme Corporation",
      "location": "USA"
    },
    "batchId": "BATCH-20240115-001"
  }'
```

**AI Optimization:**
- Batches up to 5 retirements for gas efficiency
- Groups by project for better pricing
- Parallel verification of all credits

## Verification Methods

### Standard Verification

```bash
// turbo
# Single-agent verification (2-3 minutes)
curl -X POST http://localhost:8088/api/carbon/verify \
  -d '{"projectId": "VCS-VCU-1529", "method": "standard"}'
```

### Enhanced Verification

```bash
// turbo
# Multi-agent consensus (5-7 minutes)
curl -X POST http://localhost:8088/api/carbon/verify \
  -d '{"projectId": "VCS-VCU-1529", "method": "enhanced"}'
```

Uses `byzantineConsensus` for fault-tolerant verification:

```typescript
import { byzantineConsensus } from './src/lattice/byzantineConsensus.js';

const result = await byzantineConsensus.reachAgreement({
  task: {
    type: 'verify_carbon_project',
    projectId: 'VCS-VCU-1529'
  },
  requiredAgents: 3,
  threshold: 0.67 // 2/3 majority
});
```

### AI-Powered Fraud Detection

```bash
// turbo
# Deep analysis with AI models
curl -X POST http://localhost:8088/api/carbon/verify \
  -d '{
    "projectId": "VCS-VCU-1529",
    "method": "ai_analysis",
    "deepCheck": true
  }'
```

**AI checks:**
- Historical project performance
- Satellite imagery analysis
- Social media sentiment
- Regulatory compliance history
- Similar project comparisons

## Monitoring Retirements

### View Active Retirements

```bash
// turbo
curl http://localhost:8088/api/carbon/retirements/active | jq .
```

### View Retirement History

```bash
// turbo
curl "http://localhost:8088/api/carbon/retirements?from=2024-01-01&to=2024-01-31" | jq .
```

### Retirement Metrics

```bash
// turbo
curl http://localhost:8088/api/carbon/metrics | jq .
```

**Output:**
```json
{
  "tonsRetiredToday": 5000,
  "tonsRetiredThisMonth": 45000,
  "tonsRetiredThisYear": 520000,
  "activeProjects": 23,
  "avgVerificationTime": 240,
  "successRate": "99.7%",
  "fraudDetected": 3
}
```

## Retirement NFTs

### Query Retirement NFT

```bash
// turbo
# Get NFT metadata
node -e "
import { hederaMaster } from './src/hedera/hederaMasterClass.js';

const nft = await hederaMaster.getNFT(
  process.env.RETIREMENT_NFT_ID,
  12345
);

console.log('Retirement NFT:', {
  serial: nft.serial,
  metadata: JSON.parse(nft.metadata),
  owner: nft.owner
});
"
```

### Verify NFT Authenticity

```bash
// turbo
# Cross-check with HCS log
curl http://localhost:8088/api/carbon/nft/12345/verify
```

## Pricing and Costs

### Retirement Fee Structure

| Component | Cost |
|-----------|------|
| HTS token transfer | ~$0.001 |
| NFT mint | ~$0.05 |
| HCS audit log | ~$0.0001 |
| AI verification | ~$0.10 |
| **Total** | **~$0.16** |

### Volume Discounts

| Monthly Volume | Discount |
|----------------|----------|
| 1,000+ tons | 10% |
| 10,000+ tons | 20% |
| 100,000+ tons | 30% |

## Troubleshooting

### Issue: "Project not found in registry"

**Fix:** Verify project ID format
```bash
// turbo
# Search project registry
curl "http://localhost:8088/api/carbon/projects/search?q=VCS-1529"
```

### Issue: "Insufficient credits"

**Fix:** Check available balance
```bash
// turbo
curl http://localhost:8088/api/carbon/projects/VCS-VCU-1529/balance
```

### Issue: "Verification timeout"

**Fix:** Check agent swarm status
```bash
// turbo
# Verify agents are online
curl http://localhost:8088/api/vera/agents/active

# If needed, trigger manual verification
curl -X POST http://localhost:8088/api/carbon/retire/CR-001/retry
```

### Issue: "Double retirement detected"

**Prevented by:**
- Unique retirement ID generation
- HCS audit trail check
- AI pattern recognition
- HTS token tracking

## Integration with AI Optimization

### Smart Routing for Retirements

```typescript
import { smartRouter } from './src/ai/smartRouter.js';

// Route based on urgency and complexity
const routing = smartRouter.route(
  'Retire 10000 tons carbon credits from VCS-VCU-1529'
);

// High volume → Parallel verification
// Low volume → Standard verification
// Urgent → Immediate processing
```

### Caching Verification Results

```typescript
import { responseCache } from './src/ai/responseCache.js';

// Cache project verification for 1 hour
const cacheKey = `carbon:project:${projectId}:verified`;
const cached = await responseCache.get(cacheKey);

if (cached.response) {
  return cached.response; // Instant response
}

// Verify and cache
const result = await verifyProject(projectId);
await responseCache.set(cacheKey, result, 3600);
```

## Compliance and Reporting

### Generate Compliance Report

```bash
// turbo
# Annual report
curl "http://localhost:8088/api/carbon/reports/annual?year=2024" \
  -o carbon-retirements-2024.pdf

# Audit trail
curl "http://localhost:8088/api/carbon/audit-trail?from=2024-01-01&to=2024-12-31" \
  -o audit-trail-2024.json
```

### Regulatory Standards Supported

- Verra VCS
- Gold Standard
- CDM (Clean Development Mechanism)
- CAR (Climate Action Reserve)
- Australian ERF
- UK Woodland Carbon Code

## Next Steps

1. Configure carbon token IDs
2. Set up beneficiary registry
3. Enable automated reporting
4. Integrate with corporate ERP systems
