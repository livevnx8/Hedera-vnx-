---
description: Connect a new agent to Vera's lattice swarm
---

# Join Agent Swarm

Connect a new agent to Vera's Flower of Life lattice swarm.

## Prerequisites

- Vera lattice deployed
- Agent beacon topic created
- Agent unique ID assigned

## Steps

### 1. Generate Agent Identity

```bash
// turbo
node -e "
import { generateKeyPair } from './src/crypto/keys.js';
const keys = await generateKeyPair();
console.log('Agent ID:', keys.publicKey.substring(0, 16));
console.log('Save private key securely!');
"
```

### 2. Register Agent

```bash
// turbo
node -e "
import { agentRegistry } from './src/vera/orchestrator/agentRegistry.js';
import { flowerOfLifeOS } from './src/vera/orchestrator/flowerOfLifeOS.js';

await agentRegistry.register({
  agentId: 'your-agent-id',
  name: 'CarbonVerifier-01',
  type: 'carbon_verifier',
  capabilities: ['hts', 'hcs', 'carbon_calculation'],
  topicId: process.env.AGENT_BEACON_TOPIC
});

console.log('✅ Agent registered in lattice');
"
```

### 3. Initialize Agent Node

```typescript
// src/agents/my-agent.mjs
import { LatticeNode } from './src/swarm/latticeNode.js';
import { agentHCSBeacon } from './src/vera/orchestrator/agentHCSBeacon.js';

const node = new LatticeNode({
  agentId: 'your-agent-id',
  layer: 2, // Carbon layer
  capabilities: ['carbon_retirement', 'verification']
});

await node.join(flowerOfLifeOS);
console.log('✅ Agent node active in lattice');
```

### 4. Start Beacon Publishing

```bash
// turbo
node -e "
import { agentHCSBeacon } from './src/vera/orchestrator/agentHCSBeacon.js';

await agentHCSBeacon.start({
  agentId: 'your-agent-id',
  agentBeaconTopic: process.env.AGENT_BEACON_TOPIC,
  publishInterval: 30000, // 30 seconds
  capabilities: ['carbon_verification', 'hts_expert']
});

console.log('✅ Beacon publishing every 30s');
"
```

### 5. Verify Swarm Membership

```bash
// turbo
curl http://localhost:8088/api/vera/agents
```

**Expected:**
```json
{
  "agents": [
    {
      "agentId": "your-agent-id",
      "status": "active",
      "layer": 2,
      "lastBeacon": "2024-01-15T10:30:00Z",
      "capabilities": ["carbon_verification"]
    }
  ]
}
```

## Agent Types

| Type | Layer | Capabilities | Use Case |
|------|-------|--------------|----------|
| `carbon_verifier` | 2 | carbon_calculation, hts | Verify carbon credits |
| `payment_agent` | 3 | x402, settlement | Handle payments |
| `compliance` | 2 | audit, hcs | Compliance monitoring |
| `orchestrator` | 0 | coordination | Task distribution |
| `ai_analyst` | 1 | ai_models, patterns | AI processing |

## Swarm Communication

### Send Message to Swarm

```typescript
import { swarmMessenger } from './src/swarm/hcsMessenger.js';

await swarmMessenger.broadcast({
  type: 'TASK_REQUEST',
  from: 'your-agent-id',
  task: {
    type: 'verify_carbon',
    params: { projectId: '123' }
  }
});
```

### Listen for Tasks

```typescript
import { latticeCoordinator } from './src/swarm/latticeCoordinator.js';

latticeCoordinator.on('task', async (task) => {
  if (task.type === 'verify_carbon') {
    const result = await verifyCarbon(task.params);
    await latticeCoordinator.complete(task.id, result);
  }
});
```

## Lattice Positioning

Agents position based on capabilities:

```
Layer 0 (Center): Orchestrators, consciousness
Layer 1: Token operations (HTS)
Layer 2: Carbon/compliance (HCS)
Layer 3: EVM/payments
Layer 4+: Specialized agents
```

## Health Monitoring

### Check Agent Health

```bash
// turbo
curl http://localhost:8088/api/vera/agents/your-agent-id/health
```

### Monitor Beacon Status

```bash
# Watch beacon stream
node watch-beacon.mjs --agent your-agent-id
```

## Troubleshooting

### "Agent not found in lattice"
**Fix:** Re-register agent:
```bash
node register-agent.mjs --id your-agent-id --force
```

### "Beacon not publishing"
**Fix:** Check HCS connection:
```bash
curl http://localhost:8088/api/vera/hcs/health
```

### "Cannot join swarm"
**Fix:** Verify lattice is initialized:
```bash
node -e "
import { flowerOfLifeOS } from './src/vera/orchestrator/flowerOfLifeOS.js';
console.log(await flowerOfLifeOS.getStatus());
"
```

## Leave Swarm

To gracefully exit:

```bash
// turbo
node -e "
import { agentRegistry } from './src/vera/orchestrator/agentRegistry.js';

await agentRegistry.unregister('your-agent-id');
console.log('✅ Agent removed from swarm');
"
```

## Next Steps

1. Process tasks (see `process-swarm-tasks` workflow)
2. Enable AI optimization (see `enable-ai-optimization`)
3. Set up monitoring alerts
4. Configure auto-scaling
