---
description: Multi-agent collaboration with HCS message passing
---

# Setup Agent Collaboration

Agents communicate through Flower of Life lattice edges via HCS topics.

## Collaboration Protocol

```
Agent A → HCS Topic (swarm-meet 0.0.10417507) → Agent B
                ↓
          Lattice Router
                ↓
        Consensus & Execution
```

## Define Agent Roles

```bash
cat > src/agents/roles.ts << 'EOF'
export const AGENT_ROLES = {
  researcher: { capabilities: ['web-search', 'summarize'], layer: 3 },
  analyst: { capabilities: ['price-analysis', 'forecast'], layer: 2 },
  executor: { capabilities: ['tx-sign', 'tx-submit'], layer: 1 },
  guardian: { capabilities: ['audit', 'verify'], layer: 2 },
  coordinator: { capabilities: ['route', 'delegate'], layer: 0 }
};
EOF
```

## Collaboration Workflow

```bash
# Example: Coordinated carbon audit
curl -X POST http://localhost:8088/api/swarm/task \
  -d '{
    "task": "audit 1000 carbon credits",
    "pipeline": [
      {"role": "researcher", "action": "fetch-project-data"},
      {"role": "analyst", "action": "verify-methodology"},
      {"role": "guardian", "action": "validate-signatures"},
      {"role": "executor", "action": "submit-to-hcs"}
    ]
  }'
```

## Consensus Mechanism

```bash
# Byzantine fault-tolerant consensus for critical decisions
curl -X POST http://localhost:8088/api/swarm/consensus \
  -d '{
    "proposal": "release funds to contract 0.0.XXXX",
    "validators": ["guardian-1", "guardian-2", "guardian-3"],
    "threshold": 2
  }'
```

## Conversation Threads

```bash
# Start multi-agent conversation
curl -X POST http://localhost:8088/api/swarm/conversation/start \
  -d '{
    "topic": "Best DEX for HBAR→USDC swap",
    "participants": ["analyst-1", "analyst-2", "executor"]
  }'

# Check conversation
curl http://localhost:8088/api/swarm/conversation/conv-001 | jq '.messages'
```

## Emergence Tracking

```bash
# Track collaborative insights
curl http://localhost:8088/api/swarm/emergence | jq '.{
  newPatterns: .detected,
  consensusStrength: .avgConfidence,
  collectiveIQ: .score
}'
```
