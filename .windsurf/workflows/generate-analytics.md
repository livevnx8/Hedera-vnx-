---
description: Generate analytics and reports from Vera lattice
---

# Generate Analytics

Create insights from lattice operations.

## Daily Dashboard

```bash
// turbo
node -e "
import { analytics } from './src/vera/analytics/dashboard.js';
const report = await analytics.generateDaily();
console.log('Daily Report:', JSON.stringify(report, null, 2));
"
```

## Carbon Analytics

```bash
// turbo
# Monthly carbon report
curl "http://localhost:8088/api/carbon/reports/monthly?month=2024-01" \
  | jq '.{totalTons, projectCount, avgTime}'

# Top projects
curl http://localhost:8088/api/carbon/analytics/top-projects \
  | jq '.[] | {id: .projectId, tons: .totalRetired}'
```

## AI Performance Analytics

```bash
// turbo
# Router effectiveness
curl http://localhost:8088/api/ai/analytics/routing \
  | jq '.{accuracy, avgLatency, costSavings}'

# Cache analytics
curl http://localhost:8088/api/ai/analytics/cache \
  | jq '.{hitRate, semanticHits, costAvoided}'

# Tool usage
curl http://localhost:8088/api/ai/analytics/tools \
  | jq '.[] | select(.count > 100) | {tool: .name, count: .calls}'
```

## Lattice Activity

```bash
// turbo
# Agent activity heatmap
curl http://localhost:8088/api/vera/analytics/agent-activity \
  | jq '.heatmap'

# Task distribution
curl http://localhost:8088/api/vera/analytics/task-flow \
  | jq '.flows'

# Energy flow visualization
curl http://localhost:8088/api/vera/lattice/energy-flow
```

## Export Reports

```bash
// turbo
# CSV export
curl "http://localhost:8088/api/reports/export?format=csv&from=2024-01-01" \
  -o report-$(date +%Y%m%d).csv

# PDF report
curl "http://localhost:8088/api/reports/export?format=pdf&type=monthly" \
  -o monthly-report.pdf

# JSON for BI tools
curl "http://localhost:8088/api/reports/export?format=json" \
  | jq '.' > bi-data.json
```

## Scheduled Reports

```bash
// turbo
# Setup daily email
cat > daily-report.sh << 'EOF'
#!/bin/bash
REPORT=$(curl -s http://localhost:8088/api/reports/daily)
echo "$REPORT" | mail -s "Vera Daily Report" admin@vera.network
EOF
chmod +x daily-report.sh

# Add to cron (8 AM daily)
echo "0 8 * * * /home/vera/daily-report.sh" | crontab -
```

## Custom Analytics

```bash
// turbo
# Query custom metrics
node -e "
import { flowerOfLifeOS } from './src/vera/orchestrator/flowerOfLifeOS.js';

const custom = await flowerOfLifeOS.query({
  type: 'custom_analytics',
  metrics: ['agentUptime', 'taskSuccess', 'carbonVolume'],
  timeframe: '7d'
});

console.log(custom);
"
```
