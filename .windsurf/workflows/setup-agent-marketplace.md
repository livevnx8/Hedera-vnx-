---
description: Agent marketplace with discovery, reputation, x402 payments
---

# Setup Agent Marketplace

Decentralized agent marketplace using HCS registry + x402 micropayments.

## Agent Registration

```bash
curl -X POST http://localhost:8088/api/marketplace/agents/register \
  -d '{
    "name": "Vera Carbon Verifier",
    "capabilities": ["carbon-audit", "hcs-logging"],
    "pricing": {"perQuery": 0.01, "currency": "HBAR"},
    "endpoint": "https://agent.vera.network",
    "x402Enabled": true
  }'
```

## Discover Agents

```bash
# Find agents by capability
curl 'http://localhost:8088/api/marketplace/agents?capability=carbon-audit' | jq .

# Top-rated agents
curl 'http://localhost:8088/api/marketplace/agents?sort=reputation&limit=10' | jq .
```

## Reputation System

```bash
# Rate agent after query
curl -X POST http://localhost:8088/api/marketplace/reputation \
  -d '{
    "agentId": "agent-001",
    "queryId": "q-123",
    "rating": 5,
    "feedback": "Excellent carbon verification"
  }'

# Get reputation score
curl http://localhost:8088/api/marketplace/reputation/agent-001 | jq '.{
  averageRating: .avgRating,
  totalQueries: .queryCount,
  successRate: .successRate
}'
```

## x402 Payment Flow

```bash
# Request with payment
curl http://localhost:8088/api/marketplace/query \
  -H "X-Payment: $(vera-x402 sign --amount=0.01 --recipient=agent-001)" \
  -d '{"agentId":"agent-001","query":"verify 100 tonnes carbon"}'
```

## Agent SLA Monitoring

```bash
// turbo
cat > scripts/agent-sla-monitor.mjs << 'EOF'
import fetch from 'node-fetch';

const agents = await fetch('http://localhost:8088/api/marketplace/agents').then(r => r.json());

for (const agent of agents) {
  const start = Date.now();
  try {
    await fetch(agent.endpoint + '/health', { timeout: 5000 });
    const latency = Date.now() - start;
    
    await fetch('http://localhost:8088/api/marketplace/metrics', {
      method: 'POST',
      body: JSON.stringify({ agentId: agent.id, latency, status: 'up' })
    });
  } catch (e) {
    await fetch('http://localhost:8088/api/marketplace/metrics', {
      method: 'POST',
      body: JSON.stringify({ agentId: agent.id, status: 'down', error: e.message })
    });
  }
}
EOF
```

## Escrow Payments

```bash
# Hold payment until service completed
curl -X POST http://localhost:8088/api/marketplace/escrow \
  -d '{
    "buyer": "0.0.XXXX",
    "agent": "agent-001",
    "amount": "0.1",
    "serviceHash": "sha256:..."
  }'

# Release on completion
curl -X POST http://localhost:8088/api/marketplace/escrow/release \
  -d '{"escrowId":"e-001","proof":"..."}'
```
