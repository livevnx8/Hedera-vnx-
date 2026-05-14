---
description: How to receive and process tasks from the Vera lattice swarm
---

# Process Swarm Tasks

Handle task distribution and execution within Vera's lattice swarm.

## Prerequisites

- Agent registered in swarm (see `join-agent-swarm`)
- Lattice node active
- Capabilities declared

## Steps

### 1. Subscribe to Task Queue

```typescript
// src/agents/task-processor.mjs
import { latticeCoordinator } from '../swarm/latticeCoordinator.js';
import { taskPublisher } from '../vera/orchestrator/taskPublisher.js';

// Subscribe to tasks for this agent
await latticeCoordinator.subscribe({
  agentId: 'your-agent-id',
  capabilities: ['carbon_verification', 'hts_transfer']
});

console.log('✅ Listening for tasks...');
```

### 2. Handle Task Types

```typescript
// Handle carbon verification tasks
latticeCoordinator.on('carbon_verification', async (task) => {
  console.log(`Processing carbon verification: ${task.projectId}`);
  
  try {
    // Execute verification logic
    const result = await verifyCarbonCredit({
      projectId: task.projectId,
      tons: task.tons,
      standard: task.standard
    });
    
    // Publish result back to lattice
    await taskPublisher.publishResult({
      taskId: task.id,
      status: 'completed',
      result,
      verifiedBy: 'your-agent-id'
    });
    
    console.log('✅ Task completed');
    
  } catch (error) {
    // Report failure
    await taskPublisher.publishResult({
      taskId: task.id,
      status: 'failed',
      error: error.message
    });
  }
});
```

### 3. Execute with AI Optimization

```typescript
import { createOptimizationLayer } from '../ai/veraIntegrationLayer.js';

const optimizationLayer = createOptimizationLayer(runner, router);

latticeCoordinator.on('complex_analysis', async (task) => {
  // Use AI-optimized processing for complex queries
  const result = await optimizationLayer.processQuery(
    `Analyze carbon project ${task.projectId} for compliance`,
    {
      tools: ['get_project_data', 'verify_compliance'],
      requireAccuracy: true
    }
  );
  
  return result;
});
```

### 4. Batch Process Tasks

```typescript
import { ToolOptimizer } from '../ai/toolOptimizer.js';

const toolOptimizer = new ToolOptimizer(executeHederaTool);

// Batch multiple HTS operations
latticeCoordinator.on('batch_transfer', async (task) => {
  const transfers = task.transfers;
  
  // Batch up to 5 transfers
  const results = await Promise.all(
    transfers.map(t => 
      toolOptimizer.call('hts_transfer', t, 'normal')
    )
  );
  
  return { batched: true, results };
});
```

## Task Types Reference

| Task Type | Required Capability | Description |
|-----------|---------------------|-------------|
| `carbon_verification` | carbon_calculation | Verify carbon credit |
| `hts_transfer` | hts | Transfer tokens via HTS |
| `hcs_audit` | hcs | Submit audit message |
| `payment_settlement` | x402 | Process X-402 payment |
| `compliance_check` | audit | Check compliance |
| `data_analysis` | ai_models | AI analysis task |
| `contract_deploy` | evm | Deploy smart contract |

## Priority Handling

```typescript
// Handle high-priority tasks first
latticeCoordinator.on('urgent:*', async (task) => {
  // Process immediately, bypass queue
  await processUrgent(task);
});

// Handle normal tasks
latticeCoordinator.on('task', async (task) => {
  if (task.priority === 'critical') {
    await processCritical(task);
  } else {
    await queueForProcessing(task);
  }
});
```

## Consensus Tasks

For tasks requiring multi-agent consensus:

```typescript
import { byzantineConsensus } from '../lattice/byzantineConsensus.js';

latticeCoordinator.on('consensus_required', async (task) => {
  // Run Byzantine fault-tolerant consensus
  const result = await byzantineConsensus.reachAgreement({
    task,
    requiredAgents: 3,
    threshold: 0.67 // 2/3 majority
  });
  
  return result;
});
```

## Task Monitoring

### View Active Tasks

```bash
// turbo
curl http://localhost:8088/api/vera/tasks/active
```

### View Task History

```bash
// turbo
curl http://localhost:8088/api/vera/tasks/history?agent=your-agent-id
```

### Task Metrics

```bash
// turbo
curl http://localhost:8088/api/vera/agents/your-agent-id/metrics
```

**Expected:**
```json
{
  "tasksCompleted": 150,
  "tasksFailed": 3,
  "avgProcessingTime": 2500,
  "successRate": "98%"
}
```

## Error Handling

### Retry Logic

```typescript
import { taskPublisher } from '../vera/orchestrator/taskPublisher.js';

async function processWithRetry(task, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await processTask(task);
    } catch (error) {
      if (attempt === maxRetries) {
        await taskPublisher.publishFailure(task.id, error);
        throw error;
      }
      
      // Exponential backoff
      await delay(1000 * Math.pow(2, attempt));
    }
  }
}
```

### Dead Letter Queue

Failed tasks go to DLQ for analysis:

```typescript
latticeCoordinator.on('task:failed', async (task) => {
  await taskPublisher.moveToDLQ({
    task,
    reason: task.error,
    timestamp: Date.now()
  });
});
```

## Optimization

### Parallel Processing

```typescript
import { ParallelProcessor } from '../ai/parallelProcessor.js';

const parallelProcessor = new ParallelProcessor(runModel);

// Execute multiple sub-tasks in parallel
latticeCoordinator.on('multi_analysis', async (task) => {
  const subTasks = [
    { type: 'carbon_analysis', data: task.carbon },
    { type: 'compliance_check', data: task.compliance },
    { type: 'financial_audit', data: task.financial }
  ];
  
  // Run all in parallel
  const results = await Promise.all(
    subTasks.map(st => processSubTask(st))
  );
  
  return mergeResults(results);
});
```

### Caching Results

```typescript
import { responseCache } from '../ai/responseCache.js';

latticeCoordinator.on('frequent_task', async (task) => {
  // Check cache first
  const cacheKey = `task:${task.type}:${hash(task.params)}`;
  const cached = await responseCache.get(cacheKey);
  
  if (cached.response) {
    return cached.response;
  }
  
  // Process and cache
  const result = await processTask(task);
  await responseCache.set(cacheKey, result);
  
  return result;
});
```

## Troubleshooting

### "No tasks received"
**Fix:** Check capabilities match:
```bash
node -e "
import { latticeCoordinator } from './src/swarm/latticeCoordinator.js';
console.log('Subscribed:', latticeCoordinator.getSubscriptions());
"
```

### "Task processing timeout"
**Fix:** Increase timeout or optimize:
```typescript
// Use AI optimization for slow tasks
const result = await optimizationLayer.processQuery(task.data);
```

### "Consensus failure"
**Fix:** Check agent availability:
```bash
curl http://localhost:8088/api/vera/agents/active
```

## Next Steps

1. Set up monitoring (see `enable-ai-optimization`)
2. Configure auto-scaling
3. Implement custom task types
4. Join payment orchestration
