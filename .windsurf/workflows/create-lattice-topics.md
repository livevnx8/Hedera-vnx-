---
description: Create HCS topics for Vera's Flower of Life lattice system
---

# Create Lattice HCS Topics

Create all HCS topics needed for Vera's Flower of Life lattice system.

## Prerequisites

- Hedera operator account (testnet or mainnet)
- `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY` env vars set
- HBAR balance for topic creation (~1 HBAR total)

## Steps

### 1. Verify Environment

```bash
// turbo
node -e "
console.log('Operator ID:', process.env.HEDERA_OPERATOR_ID ? '✅' : '❌');
console.log('Operator Key:', process.env.HEDERA_OPERATOR_KEY ? '✅' : '❌');
"
```

### 2. Create Core Topics

Run the topic creation script:

```bash
// turbo
node create-vera-payment-topics.mjs
```

**Expected output:**
```
✅ Agent Beacon Topic: 0.0.123456
✅ Carbon Retirement Topic: 0.0.123457
✅ Payment Orchestration Topic: 0.0.123458
✅ Compliance Audit Topic: 0.0.123459
✅ AI Optimization Topic: 0.0.123460
```

### 3. Save Topic IDs

Create `.env.topics` file:

```bash
// turbo
cat > .env.topics << 'EOF'
# Vera Lattice Topics
AGENT_BEACON_TOPIC=0.0.XXXXX
CARBON_RETIREMENT_TOPIC=0.0.XXXXX
PAYMENT_ORCHESTRATION_TOPIC=0.0.XXXXX
COMPLIANCE_AUDIT_TOPIC=0.0.XXXXX
AI_OPTIMIZATION_TOPIC=0.0.XXXXX
HOT_TOPICS_RADAR=0.0.XXXXX
AGENT_REGISTRY_TOPIC=0.0.XXXXX
VERIFICATION_TOPIC=0.0.XXXXX
EOF
```

### 4. Verify Topics

```bash
// turbo
node verify-lattice-topics.mjs
```

**Verify:**
- All 8+ topics created
- Topics are writable
- Submit key matches operator

### 5. Test Message Submission

```bash
// turbo
node -e "
import { hederaMaster } from './src/hedera/hederaMasterClass.js';
const result = await hederaMaster.submitMessage(
  process.env.AGENT_BEACON_TOPIC,
  JSON.stringify({ test: 'lattice initialization' })
);
console.log('✅ Test message submitted:', result.sequenceNumber);
"
```

## Topic Reference

| Topic | Purpose | Message Type |
|-------|---------|--------------|
| Agent Beacon | Agent heartbeat/liveness | BEACON |
| Carbon Retirement | Carbon credit operations | RETIREMENT |
| Payment Orchestration | X-402/settlement | PAYMENT |
| Compliance Audit | Audit trails | AUDIT_LOG |
| AI Optimization | AI metrics/knowledge | AI_INSIGHT |
| Hot Topics Radar | Trending topics | RADAR |
| Agent Registry | Agent registration | REGISTRY |
| Verification | Proof verification | VERIFICATION |

## Manual Topic Creation

If script fails, create manually:

```typescript
import { TopicCreateTransaction } from '@hashgraph/sdk';

const tx = await new TopicCreateTransaction()
  .setSubmitKey(operatorKey)
  .setTopicMemo('Vera Agent Beacon')
  .execute(client);

const receipt = await tx.getReceipt(client);
console.log('Topic ID:', receipt.topicId.toString());
```

## Funding Topics

Transfer HBAR to each topic for message fees:

```bash
# Each message costs ~$0.0001
# Budget 1 HBAR per topic for testing
node fund-topics.mjs --amount 1
```

## Topic Configuration

### For Production:

1. **Enable memo**: Add descriptive memos
2. **Set admin key**: For topic management
3. **Configure expiration**: Auto-renewal
4. **Set submit keys**: Multi-sig if needed

### For High-Volume:

1. **Shard by domain**: Separate topics per agent type
2. **Batch messages**: Use HIP-993 batching
3. **Monitor costs**: Track per-topic spend

## Troubleshooting

### "Insufficient payer balance"
**Fix:** Fund operator account:
```bash
# Testnet faucet
https://faucet.hedera.com/
```

### "Invalid topic ID"
**Fix:** Verify topic creation:
```bash
node verify-lattice-topics.mjs --verbose
```

### "Topic not found"
**Fix:** Topics may be on different network:
```bash
# Check network
node -e "console.log(process.env.HEDERA_NETWORK)"
```

## Backup Topic IDs

After creation, backup to secure location:

```bash
# Encrypt and store
gpg -c .env.topics
mv .env.topics.gpg /secure/backup/

# Also store in lattice
node -e "
import { flowerOfLifeOS } from './src/vera/orchestrator/flowerOfLifeOS.js';
await flowerOfLifeOS.store('topic-config', process.env);
"
```

## Next Steps

1. Deploy lattice (see `deploy-lattice` workflow)
2. Configure AI optimization (see `enable-ai-optimization`)
3. Join agent swarm (see `join-agent-swarm`)
