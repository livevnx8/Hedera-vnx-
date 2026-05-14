---
description: Add a custom agent to Vera's lattice swarm
---

# Add Custom Agent

Create and register a custom agent in the lattice.

## Create Agent

```bash
// turbo
mkdir src/agents/custom
cat > src/agents/custom/myAgent.mjs << 'EOF'
import { LatticeNode } from '../../swarm/latticeNode.js';

export class MyCustomAgent {
  constructor(config) {
    this.node = new LatticeNode(config);
  }
  
  async handleTask(task) {
    // Your logic here
    return { success: true, result };
  }
}
EOF
```

## Register Agent

```bash
// turbo
node -e "
import { agentRegistry } from './src/vera/orchestrator/agentRegistry.js';
await agentRegistry.register({
  agentId: 'custom-agent-1',
  type: 'custom_analyzer',
  capabilities: ['analysis'],
  handler: './src/agents/custom/myAgent.mjs'
});
"
```

## Start Agent

```bash
// turbo
node src/agents/custom/myAgent.mjs
```

## Verify

```bash
// turbo
curl http://localhost:8088/api/vera/agents | grep custom-agent
```
