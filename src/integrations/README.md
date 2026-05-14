# VeraLattice Integrations

Production-ready adapters that extend the Flower of Life OS into external ecosystems.

## Quick Reference

| Integration | File | Status | One-liner |
|-------------|------|--------|-----------|
| OpenAPI/Swagger | `src/index.ts` + routes | ✅ Live | Interactive API docs at `/docs` |
| Python SDK | `sdk/vera-sdk-py/` | ✅ Ready | `pip install -e sdk/vera-sdk-py` |
| LangChain Bridge | `src/integrations/langchainBridge.ts` | ✅ Ready | Wrap Vera tools as LangChain tools |
| Webhook Engine | `src/integrations/webhookEngine.ts` | ✅ Ready | HMAC-signed webhooks with DLQ |
| Qdrant Vector Store | `src/integrations/qdrantVectorStore.ts` | ✅ Ready | Self-hosted Pinecone alternative |
| ClickHouse Metrics | `src/integrations/clickhouseMetrics.ts` | ✅ Ready | Time-series SQL analytics |
| Oracle Adapters | `src/integrations/oracleAdapters.ts` | ✅ Ready | Chainlink + Pyth consensus prices |
| Terraform (AWS) | `infrastructure/terraform/` | ✅ Ready | `terraform apply` for Fargate + ALB |
| Helm (K8s) | `infrastructure/helm/vera-lattice/` | ✅ Ready | `helm install vera-lattice ./infrastructure/helm/vera-lattice` |
| Edge Worker | `src/edge/worker.ts` | 🧪 Stub | Cloudflare Workers deployment template |
| Confidential Compute | `src/security/tee/attestationStub.ts` | 🧪 Stub | TDX/SEV attestation for zero-trust agents |

## Environment Variables

All new integrations are configured via `.env`. See `.env.example` for defaults.

```bash
# Qdrant Vector Store
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=vera-lattice

# ClickHouse Metrics
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_DATABASE=vera_metrics

# Oracle Feeds
CHAINLINK_HBAR_USD_FEED=0x...
PYTH_HBAR_PRICE_ID=0x...
HEDERA_EVM_RPC=https://mainnet.hashio.io/api

# Confidential Compute
VERA_ALLOWED_MRTDS=abc...,def...
VERA_ATTESTATION_TOPIC_ID=0.0.xxx
```

## API Endpoints

### Webhooks
- `POST /api/webhooks` — Register a subscription
- `GET /api/webhooks` — List active subscriptions
- `GET /api/webhooks/stats` — Delivery statistics
- `GET /api/webhooks/dlq` — Dead letter queue
- `POST /api/webhooks/dlq/:id/replay` — Replay failed delivery
- `POST /api/webhooks/dispatch` — Manually dispatch event

### Oracle Price Feeds
- `GET /api/oracle/price/HBAR/USD?source=consensus&pythId=...` — Consensus price
- `POST /api/oracle/attestation` — Publish on-chain attestation

### Documentation
- `GET /docs` — Swagger UI (auto-generated from route schemas)

## Usage Examples

### Python SDK
```python
from vera_sdk import VeraClient, TaskSubmission

async with VeraClient(api_key="...", base_url="https://api.veralattice.com") as client:
    health = await client.health()
    lattice = await client.lattice_state()
    task = await client.submit_task(TaskSubmission(
        description="Verify carbon offset",
        service_type="carbon-validation",
        budget=0.5,
    ))
```

### LangChain Bridge
```typescript
import { getLangChainTools } from './src/integrations/langchainBridge.js';
const tools = await getLangChainTools();
// tools[].invoke(JSON.stringify({to_account_id: '0.0.1234', amount_hbar: 10}))
```

### Qdrant Semantic Search
```typescript
import { indexDocument, semanticSearch } from './src/integrations/qdrantVectorStore.js';
await indexDocument('doc-1', 'Hedera consensus is fast and fair', { source: 'docs' });
const hits = await semanticSearch('fast consensus mechanism', 5);
```

### ClickHouse Analytics
```typescript
import { ensureClickHouseSchema, getAgentPerformance } from './src/integrations/clickhouseMetrics.js';
await ensureClickHouseSchema();
const stats = await getAgentPerformance(24); // last 24 hours
```

## Deployment

### AWS (Terraform)
```bash
cd infrastructure/terraform
terraform init
terraform apply -var="hedera_operator_account_id=0.0.xxx" -var="hedera_operator_private_key=..."
```

### Kubernetes (Helm)
```bash
helm dependency update infrastructure/helm/vera-lattice
helm install vera-lattice infrastructure/helm/vera-lattice \
  --set hederaOperatorAccountId=0.0.xxx \
  --set hederaOperatorPrivateKey=...
```

### Cloudflare Edge (Wrangler)
```bash
# src/edge/worker.ts is a stub — configure wrangler.toml and run:
wrangler deploy src/edge/worker.ts
```
