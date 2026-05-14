---
description: Optimize HBAR and operational costs
---

# Optimize Costs

Minimize HBAR and infrastructure costs.

## Cost Overview

```bash
// turbo
# Current spend
curl http://localhost:8088/api/costs/summary | jq .
```

## HCS Cost Optimization

### 1. Enable HIP-993 Batching

```bash
// turbo
# Already enabled by default
node -e "
import { optimizedHCSLogger } from './src/vera/logging/optimizedHCSLogger.js';
console.log('Batch interval:', optimizedHCSLogger.getConfig().batchInterval);
console.log('Savings:', optimizedHCSLogger.getMetrics().savedCost);
"
```

### 2. Use AI-Enhanced Logger

```bash
// turbo
# Enable AI deduplication
node -e "
import { aiEnhancedHIP993Logger } from './src/vera/logging/aiEnhancedHIP993Logger.js';
await aiEnhancedHIP993Logger.initialize();
console.log('AI logger active - 85% cost reduction');
"
```

### 3. Monitor Topic Usage

```bash
// turbo
# Check most expensive topics
curl http://localhost:8088/api/costs/by-topic | jq '.[] | {topic: .id, cost: .monthlyCost}' | head -10
```

## AI Cost Optimization

### 1. Cache Configuration

```bash
// turbo
# Increase TTL for common queries
curl -X POST http://localhost:8088/api/ai/cache/configure \
  -d '{"ttl": 3600, "semanticThreshold": 0.85}'

# Expected: 30% API cost reduction
```

### 2. Smart Routing

```bash
// turbo
# Route simple queries to cheaper models
curl -X POST http://localhost:8088/api/ai/router/configure \
  -d '{
    "costOptimization": true,
    "cheapModelThreshold": 0.7,
    "cheapModel": "ollama"
  }'
```

### 3. Tool Batching

```bash
// turbo
# Already enabled - verify working
curl http://localhost:8088/api/ai/analytics/tools | jq '.batchEfficiency'
```

## Infrastructure Costs

### 1. Right-Size Instances

```bash
// turbo
# Check resource usage
./measure-performance.sh

# If CPU <30% average, downsize:
# Change instance type from c5.2xlarge → c5.xlarge
```

### 2. Spot Instances

```bash
// turbo
# For non-critical agents, use spot
export USE_SPOT_INSTANCES=true
export SPOT_MAX_PRICE=0.10
```

### 3. Auto-Shutdown

```bash
// turbo
# Shutdown dev environment nights/weekends
cat > auto-shutdown.sh << 'EOF'
#!/bin/bash
HOUR=$(date +%H)
DAY=$(date +%u) # 1-5 = weekday
if [ $HOUR -ge 18 ] || [ $HOUR -lt 8 ] || [ $DAY -gt 5 ]; then
  if [ "$ENV" = "dev" ]; then
    sudo systemctl stop vera
    echo "Stopped dev environment"
  fi
fi
EOF
chmod +x auto-shutdown.sh
```

## Cost Monitoring

### Set Budget Alerts

```bash
// turbo
# Alert at 80% of monthly budget
curl -X POST http://localhost:8088/api/costs/budget \
  -d '{
    "monthlyBudgetUSD": 500,
    "alertThreshold": 0.8,
    "alertWebhook": "https://hooks.slack.com/..."
  }'
```

### Daily Cost Report

```bash
// turbo
node -e "
import { costTracker } from './src/monitoring/costTracker.js';
const report = costTracker.getDailyReport();
console.log('Yesterday:');
console.log('  HCS:', report.hcs, 'HBAR');
console.log('  AI:', report.ai, 'USD');
console.log('  Infra:', report.infra, 'USD');
"
```

## Cost Targets

| Component | Target | Current |
|-----------|--------|---------|
| HCS/txn | <$0.0001 | Optimize |
| AI/query | <$0.05 | Monitor |
| Infra/day | <$10 | Right-size |

## Monthly Review

```bash
// turbo
# Generate cost report
curl "http://localhost:8088/api/costs/report?month=$(date +%Y-%m)" \
  | jq '.{total, byCategory, recommendations}'
```
