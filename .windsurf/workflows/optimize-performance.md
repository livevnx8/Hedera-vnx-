---
description: Optimize Vera lattice performance
---

# Optimize Performance

Tune Vera for maximum throughput.

## Check Current Performance

```bash
// turbo
./measure-performance.sh
```

## Enable AI Optimization

```bash
// turbo
/enable-ai-optimization
```

## Tune Cache Settings

```bash
// turbo
curl -X POST http://localhost:8088/api/ai/cache/configure \
  -d '{"ttl": 600, "maxSize": 10000}'
```

## Optimize Tool Batching

```bash
// turbo
node -e "
import { ToolOptimizer } from './src/ai/toolOptimizer.js';
const optimizer = new ToolOptimizer(executeTool);
optimizer.setBatchSize(10);
"
```

## Verify Improvements

```bash
// turbo
curl http://localhost:8088/api/ai/metrics
```

## Target Metrics

- Latency: <100ms
- Cache hit: >85%
- Tool batch: 5x efficiency
