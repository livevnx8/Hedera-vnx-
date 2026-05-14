---
description: Debug and troubleshoot issues in Vera's lattice system
---

# Debug and Troubleshoot

Systematic debugging for Vera lattice issues.

## Quick Diagnostics

```bash
// turbo
# Run full diagnostic
./diagnose-lattice.sh

# Or specific component
curl http://localhost:8088/api/debug/status | jq .
```

## 1. System Health Check

```bash
// turbo
# Check all components
node -e "
import { latticeDiagnostics } from './src/debug/latticeDiagnostics.js';
const report = await latticeDiagnostics.runFullCheck();
console.log('Components:', report.components);
console.log('Issues:', report.issues);
console.log('Recommendations:', report.recommendations);
"
```

## 2. Common Issues

### Lattice Not Responding

```bash
// turbo
# Check if running
ps aux | grep vera
systemctl status vera

# Check logs
journalctl -u vera -f --since "1 hour ago"
tail -f /var/log/vera/error.log

# Restart if needed
sudo systemctl restart vera
```

### GPU Not Detected

```bash
// turbo
# Verify GPU
nvidia-smi

# Check driver
modprobe nvidia
lsmod | grep nvidia

# Reinstall if needed
sudo apt reinstall nvidia-driver-535
```

### HCS Connection Failed

```bash
// turbo
# Test Hedera connection
curl -X POST http://localhost:8088/api/hedera/test \
  -d '{"network": "mainnet"}'

# Check operator balance
node check-balance.mjs

# Verify topic exists
node verify-lattice-topics.mjs
```

### AI Model Errors

```bash
// turbo
# Check model status
curl http://localhost:8088/api/ai/models/status | jq '.failed'

# Reload model
curl -X POST http://localhost:8088/api/ai/models/reload \
  -d '{"model": "vera-base"}'

# Check GPU memory
nvidia-smi --query-gpu=memory.used,memory.total --format=csv
```

### Cache Issues

```bash
// turbo
# Clear Redis cache
redis-cli FLUSHDB

# Restart cache service
sudo systemctl restart redis

# Check cache hit rate
curl http://localhost:8088/api/cache/stats | jq '.hitRate'
```

## 3. Log Analysis

```bash
// turbo
# Search for errors
./search-logs.sh --level ERROR --since "2 hours ago"

# Pattern analysis
node analyze-logs.mjs \
  --file /var/log/vera/app.log \
  --patterns "error,fail,timeout" \
  --output report.html

# Real-time monitoring
tail -f /var/log/vera/app.log | grep ERROR
```

## 4. Performance Profiling

```bash
// turbo
# CPU profiling
node --prof src/server.js
node --prof-process isolate-*.log > profile.txt

# Memory profiling
node --inspect src/server.js
# Open Chrome DevTools chrome://inspect

# GPU profiling
nvidia-nsight-sys-cli profile -t cuda python inference.py
```

## 5. Network Debugging

```bash
// turbo
# Check connections
ss -tuln | grep 8088
netstat -tuln | grep vera

# Test endpoints
curl -w "@curl-format.txt" http://localhost:8088/api/health

# Check firewall
sudo iptables -L | grep 8088
ufw status
```

## 6. Database Issues

```bash
// turbo
# Check SQLite
sqlite3 vera.db "PRAGMA integrity_check;"
sqlite3 vera.db ".tables"

# Repair if corrupted
cp vera.db vera.db.backup
sqlite3 vera.db ".recover" | sqlite3 vera-recovered.db
mv vera-recovered.db vera.db
```

## 7. Tracing

```bash
// turbo
# Enable distributed tracing
export VERA_TRACING_ENABLED=true
export JAEGER_ENDPOINT=http://localhost:14268/api/traces

# View traces
open http://localhost:16686

# Search for specific request
curl "http://localhost:16686/api/traces?service=vera&operation=generateResponse"
```

## 8. Recovery Procedures

### Full System Reset

```bash
// turbo
# Emergency reset
./emergency-reset.sh

# Steps:
# 1. Stop all services
# 2. Backup current state
# 3. Clear temporary files
# 4. Reset to last known good config
# 5. Restart services
```

### Partial Reset

```bash
// turbo
# Reset specific component
# AI only
curl -X POST http://localhost:8088/api/ai/reset

# Lattice only
curl -X POST http://localhost:8088/api/lattice/reset

# Cache only
curl -X POST http://localhost:8088/api/cache/clear
```

## 9. Debug Mode

```bash
// turbo
# Enable debug logging
export VERA_LOG_LEVEL=debug
export DEBUG=vera:*

# Verbose AI logging
export VERA_AI_DEBUG=true

# Restart with debug
npm run dev:debug
```

## 10. Interactive Debugging

```bash
// turbo
# REPL with loaded modules
node --experimental-repl-await
> const lattice = require('./src/vera/orchestrator/flowerOfLifeOS.js')
> await lattice.getStatus()

# Or use inspect
node inspect src/server.js
```

## Troubleshooting Matrix

| Symptom | Check | Action |
|---------|-------|--------|
| 500 errors | Logs | Check stack trace |
| Slow responses | Profiling | Optimize hot paths |
| High memory | Heap dump | Find leaks |
| GPU errors | nvidia-smi | Reset GPU |
| HCS timeout | Balance | Fund operator |
| Cache misses | Redis | Tune TTL |

## Get Help

```bash
// turbo
# Generate support bundle
./generate-support-bundle.sh
# Creates: support-bundle-20240115.tar.gz

# Upload to support
curl -X POST https://support.vera.network/upload \
  -F "bundle=@support-bundle-20240115.tar.gz"
```

## Next Steps

- `/emergency-recovery` - Full system recovery
- `/monitor-lattice-health` - Prevent issues
