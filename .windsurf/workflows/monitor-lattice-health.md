---
description: Monitor Vera's Flower of Life lattice health and performance
---

# Monitor Lattice Health

Comprehensive monitoring workflow for Vera's lattice swarm.

## Prerequisites

- Lattice deployed and running
- Monitoring dashboard enabled
- HCS topics active

## Quick Health Check

```bash
// turbo
./vera-status.sh
```

**Expected output:**
```
✅ Vera API: Running (PID: 1234)
✅ Redis: Connected
✅ Lattice Mirror: 64 nodes active
✅ HCS Connection: 8 topics ready
✅ Last Backup: 2024-01-15 10:00
```

## Detailed Monitoring

### 1. Check API Health

```bash
// turbo
curl -s http://localhost:8088/health | jq .
```

**Expected:**
```json
{
  "status": "healthy",
  "uptime": 86400,
  "services": {
    "api": "up",
    "redis": "up",
    "hcs": "up"
  }
}
```

### 2. Monitor Lattice Nodes

```bash
// turbo
curl -s http://localhost:8088/api/vera/lattice/status | jq .
```

**Key metrics:**
- `nodes`: Total nodes (target: 64)
- `activeAgents`: Connected agents
- `hcsConnected`: HCS topic health
- `lastSync`: Last synchronization time

### 3. Check Agent Beacons

```bash
// turbo
node -e "
import { flowerOfLifeOS } from './src/vera/orchestrator/flowerOfLifeOS.js';
const agents = await flowerOfLifeOS.getActiveAgents();
console.log('Active agents:', agents.length);
agents.forEach(a => {
  console.log('  -', a.agentId, '(last beacon:', a.lastBeaconAge, 's ago)');
});
"
```

### 4. Monitor HCS Topics

```bash
// turbo
curl -s http://localhost:8088/api/vera/hcs/topics/status | jq .
```

**Check:**
- All 8 topics have recent messages
- No topics are stale (>5 min)
- Message sequence numbers incrementing

### 5. AI Optimization Metrics

```bash
// turbo
curl -s http://localhost:8088/api/ai/metrics | jq .
```

**Key metrics:**
- `requests.total`: Total queries processed
- `cache.hitRate`: Should be >85%
- `latency.avg`: Should be <150ms
- `tools.accuracy`: Should be >95%

### 6. Carbon Retirement Monitoring

```bash
// turbo
curl -s http://localhost:8088/api/carbon/metrics | jq .
```

**Track:**
- Tons retired today
- Active retirement projects
- Verification queue depth
- Success/failure rates

## Real-Time Dashboard

### Start Monitoring Console

```bash
// turbo
node -e "
import { createDashboard } from './src/ai/monitoringDashboard.js';
const dashboard = createDashboard(() => ({}));

setInterval(() => {
  console.clear();
  console.log(dashboard.getSummary());
}, 5000);
"
```

### Prometheus Metrics

```bash
# Scrape metrics
curl -s http://localhost:8088/api/ai/metrics/prometheus

# Or use with Prometheus
curl -s http://localhost:8088/api/ai/metrics/prometheus > /tmp/vera_metrics.prom
```

## Alert Configuration

### Critical Alerts

Set up alerts for:

| Condition | Threshold | Action |
|-----------|-----------|--------|
| API down | 1 minute | PagerDuty |
| Cache hit rate | <70% | Slack notification |
| Latency | >500ms | Email alert |
| Agent offline | >2 minutes | Auto-restart |
| HCS lag | >100 messages | Investigation |

### Health Check Script

```bash
// turbo
cat > check-lattice-health.sh << 'EOF'
#!/bin/bash
HEALTH=$(curl -s http://localhost:8088/health)
if [[ $HEALTH != *"healthy"* ]]; then
  echo "❌ Vera lattice unhealthy"
  # Restart service
  sudo systemctl restart vera
  # Send alert
  curl -X POST $SLACK_WEBHOOK -d '{"text":"Vera lattice down"}'
fi
EOF
chmod +x check-lattice-health.sh

# Add to cron (every minute)
echo "* * * * * /home/vera/check-lattice-health.sh" | crontab -
```

## Log Analysis

### View Recent Logs

```bash
// turbo
# API logs
tail -f /var/log/vera/api.log

# HCS messages
node view-hcs-stream.mjs --topic $AGENT_BEACON_TOPIC --last 50

# Error logs
grep ERROR /var/log/vera/*.log | tail -20
```

### Analyze Patterns

```bash
// turbo
# Count errors by type
grep ERROR /var/log/vera/api.log | \
  awk '{print $5}' | sort | uniq -c | sort -rn

# Latency distribution
grep "latency" /var/log/vera/api.log | \
  awk '{print $NF}' | sort -n | uniq -c
```

## Performance Tuning

### Check Resource Usage

```bash
// turbo
# CPU/Memory
ps aux | grep vera | head -5

# Disk usage
df -h /mnt/vera-mirror-shards/

# Network connections
netstat -an | grep :8088 | wc -l
```

### Optimize Based on Metrics

**If cache hit rate <70%:**
```bash
# Increase cache TTL
curl -X POST http://localhost:8088/api/ai/cache/configure \
  -d '{"ttl": 600}'

# Preload common queries
curl -X POST http://localhost:8088/api/ai/cache/preload \
  -d '{"queries": ["balance", "tokens", "carbon"]}'
```

**If latency >500ms:**
```bash
# Check router decisions
curl http://localhost:8088/api/ai/router/stats

# Enable parallel processing for complex queries
# (Already enabled in default config)
```

## Troubleshooting

### Issue: "High agent disconnect rate"

**Diagnose:**
```bash
// turbo
# Check beacon interval
curl http://localhost:8088/api/vera/agents/disconnect-reasons

# Verify HCS topic health
node verify-hcs-topics.mjs
```

**Fix:**
- Increase beacon interval to 30s
- Check network stability
- Verify topic funding

### Issue: "Cache hit rate declining"

**Diagnose:**
```bash
// turbo
curl http://localhost:8088/api/ai/cache/stats | jq .
```

**Fix:**
```bash
# Clear and rebuild cache
curl -X POST http://localhost:8088/api/ai/cache/clear

# Analyze query patterns
node analyze-query-patterns.mjs
```

### Issue: "HCS message lag"

**Diagnose:**
```bash
// turbo
# Check mirror node sync
node check-mirror-sync.mjs

# Verify topic sequence numbers
curl http://localhost:8088/api/vera/hcs/topics/sequences
```

**Fix:**
- Restart HCS listener
- Check mirror node connectivity
- Verify topic IDs are correct

## Reporting

### Daily Health Report

```bash
// turbo
cat > daily-report.sh << 'EOF'
#!/bin/bash
echo "=== Vera Lattice Daily Report ==="
echo "Date: $(date)"
echo ""
echo "Health: $(curl -s http://localhost:8088/health | jq -r .status)"
echo "Active Agents: $(curl -s http://localhost:8088/api/vera/agents | jq length)"
echo "Cache Hit Rate: $(curl -s http://localhost:8088/api/ai/metrics | jq -r .cache.hitRate)"
echo "Avg Latency: $(curl -s http://localhost:8088/api/ai/metrics | jq -r .latency.avg)ms"
echo "Carbon Retired Today: $(curl -s http://localhost:8088/api/carbon/metrics | jq -r .tonsRetiredToday)"
EOF
chmod +x daily-report.sh
./daily-report.sh
```

### Export Metrics

```bash
// turbo
# Export to CSV
curl http://localhost:8088/api/ai/metrics > metrics_$(date +%Y%m%d).json

# Generate graph data
node export-metrics-for-graphs.mjs --output metrics.csv
```

## Next Steps

1. Set up automated alerts (PagerDuty/Slack)
2. Configure log rotation
3. Enable long-term metrics storage
4. Set up Grafana dashboard

## Emergency Procedures

### Complete Lattice Restart

```bash
// turbo
# 1. Stop services
sudo systemctl stop vera

# 2. Clear cache
redis-cli FLUSHDB

# 3. Restart
sudo systemctl start vera

# 4. Verify
./vera-status.sh
```

### Contact Escalation

| Issue | Contact | Response Time |
|-------|---------|---------------|
| API down | On-call engineer | 5 min |
| HCS issues | Hedera support | 1 hour |
| Security breach | Security team | Immediate |
| Data loss | DBA team | 30 min |
