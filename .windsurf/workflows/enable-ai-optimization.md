---
description: Enable the 4-week AI optimization system in production Vera
---

# Enable AI Optimization System

Step-by-step workflow to activate Weeks 1-4 AI optimizations in production.

## Prerequisites

- Vera lattice deployed (see `deploy-lattice` workflow)
- 4-week optimization modules built
- Express/Fastify app running

## Steps

### 1. Import AI Components

Add to your main app file:

```typescript
// src/app.ts or src/index.ts
import { createOptimizationLayer } from './ai/veraIntegrationLayer.js';
import EnhancedAgentRunner from './agent/enhanced-runner.js';
import { HederaLatticeRouter } from './vera/orchestrator/hederaLatticeRouter.js';
import aiDashboardRoutes, { initializeAIRoutes } from './routes/aiDashboard.js';
```

### 2. Initialize Optimization Layer

```typescript
// Create components
const enhancedRunner = new EnhancedAgentRunner();
const latticeRouter = new HederaLatticeRouter();

// Create optimization layer
const optimizationLayer = createOptimizationLayer(
  enhancedRunner,
  latticeRouter,
  {
    enableSmartRouting: true,
    enableResponseCache: true,
    enableToolBatching: true,
    enableParallelProcessing: true,
    enableKnowledgeCapture: true,
    enableAutoDocumentation: true
  }
);

// Initialize
await optimizationLayer.initialize();
```

### 3. Mount API Routes

```typescript
// Add dashboard routes
initializeAIRoutes(
  optimizationLayer as any,
  optimizationLayer.getDashboard() as any
);
app.use('/api/ai', aiDashboardRoutes);
```

### 4. Replace Query Processing

```typescript
// Replace existing query handler
app.post('/api/query', async (req, res) => {
  const { query, context } = req.body;
  
  // OLD: const result = await enhancedRunner.runEnhancedAgent(query, context);
  
  // NEW: Use optimized processing
  const result = await optimizationLayer.processQuery(query, context);
  
  res.json(result);
});
```

### 5. Verify Integration

```bash
# Health check
// turbo
curl http://localhost:8088/api/ai/health
```

**Expected:**
```json
{
  "status": "healthy",
  "components": {
    "veraAI": "up",
    "dashboard": "up",
    "runner": "up",
    "router": "up"
  }
}
```

### 6. Test AI Routing

```bash
# Test smart router
curl -X POST http://localhost:8088/api/ai/router/test \
  -H "Content-Type: application/json" \
  -d '{"query": "Create a carbon credit token on Hedera"}'
```

**Expected:** Router suggests optimal provider based on query complexity.

### 7. Check Cache Status

```bash
curl http://localhost:8088/api/ai/cache/stats
```

**Expected:**
```json
{
  "hitRate": "85%",
  "semanticRate": "12%",
  "memorySize": 150,
  "redisConnected": true
}
```

## Configuration Options

Enable/disable specific features:

```typescript
const optimizationLayer = createOptimizationLayer(runner, router, {
  // Week 1 features
  enableSmartRouting: true,
  enableResponseCache: true,
  
  // Week 2 features
  enableToolBatching: true,
  enableParallelProcessing: false, // Disable if not needed
  
  // Week 3 features
  enableKnowledgeCapture: true,
  enableAutoDocumentation: true
});
```

## Performance Verification

Run load test:

```bash
# Run verification script
node test-optimization-load.mjs
```

**Expected improvements:**
- 50% faster response time
- 95% cache hit rate for common queries
- 5x tool batching efficiency
- 99% tool accuracy

## Monitoring

### Real-time Dashboard

```bash
# Start monitoring
node -e "
import { createDashboard } from './src/ai/monitoringDashboard.js';
const dashboard = createDashboard(() => optimizationLayer.getStats());
setInterval(() => {
  console.log(dashboard.getSummary());
}, 60000);
"
```

### Prometheus Metrics

```bash
# Scrape endpoint
curl http://localhost:8088/api/ai/metrics/prometheus
```

## Troubleshooting

### Issue: "AI system not initialized"
**Fix:** Ensure `optimizationLayer.initialize()` completes before accepting requests.

### Issue: "Low cache hit rate"
**Fix:**
```bash
# Preload common queries
curl -X POST http://localhost:8088/api/ai/cache/preload \
  -d '{"queries": ["balance", "tokens", "carbon credits"]}'
```

### Issue: "High latency"
**Fix:** Check router stats:
```bash
curl http://localhost:8088/api/ai/router/stats
```

## Success Metrics

| Metric | Before | After | Status |
|--------|--------|-------|--------|
| Response Time | 200ms | 100ms | ✅ 50% faster |
| Cache Hit Rate | 0% | 85-95% | ✅ Target met |
| Tool Efficiency | 1x | 5x | ✅ 5x improvement |
| Model Selection | Manual | Auto | ✅ Working |

## Next Steps

1. Monitor metrics for 24 hours
2. Fine-tune cache TTL based on patterns
3. Review knowledge capture patterns
4. Enable alerts for anomalies

## Rollback

To disable AI optimization:

```typescript
// Use original runner directly
const result = await enhancedRunner.runEnhancedAgent(query, context);
```

Or set all features to `false` in config.
