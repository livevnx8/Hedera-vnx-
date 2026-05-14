---
description: How to deploy Vera's Flower of Life lattice system to production
---

# Deploy Vera Lattice to Production

Complete workflow for deploying the Flower of Life lattice knowledge system.

## Prerequisites

- Hedera testnet/mainnet account
- HCS topics created (see `create-lattice-topics` workflow)
- Environment variables configured
- Redis running (optional but recommended)

## Steps

### 1. Verify System Status

```bash
// turbo
./vera-status.sh
```

**Expected output:**
- ✅ API running
- ✅ Redis connected
- ✅ Lattice mirror accessible
- ✅ 109 tools documented

### 2. Check Topic Configuration

```bash
node verify-lattice-topics.mjs
```

**Verify:**
- Agent beacon topic: `0.0.xxxxx`
- Carbon retirement topic: `0.0.xxxxx`
- Payment orchestration topic: `0.0.xxxxx`
- Audit logging topic: `0.0.xxxxx`

### 3. Initialize Lattice State

```bash
node -e "
import { flowerOfLifeOS } from './src/vera/orchestrator/flowerOfLifeOS.js';
await flowerOfLifeOS.initialize();
console.log('✅ Lattice initialized');
"
```

### 4. Start HCS Beacon

```bash
node -e "
import { agentHCSBeacon } from './src/vera/orchestrator/agentHCSBeacon.js';
await agentHCSBeacon.start({
  agentBeaconTopic: process.env.AGENT_BEACON_TOPIC,
  publishInterval: 30000
});
console.log('✅ Beacon publishing every 30s');
"
```

### 5. Verify Lattice Connectivity

```bash
curl http://localhost:8088/api/vera/lattice/status
```

**Expected response:**
```json
{
  "status": "active",
  "nodes": 64,
  "activeAgents": 5,
  "hcsConnected": true,
  "lastSync": "2024-01-15T10:30:00Z"
}
```

### 6. Run Health Check

```bash
./final-polish.sh
```

## Verification Commands

| Check | Command | Expected |
|-------|---------|----------|
| API Health | `curl /health` | `{"status":"healthy"}` |
| Lattice Status | `curl /api/vera/lattice/status` | Active nodes |
| HCS Connection | `curl /api/vera/hcs/health` | Connected |
| Agent Registry | `curl /api/agents` | Agent list |

## Troubleshooting

### Issue: "Cannot connect to HCS"
**Fix:**
```bash
# Check operator key
node -e "console.log(process.env.HEDERA_OPERATOR_KEY ? '✅ Key set' : '❌ Missing')"

# Verify topic IDs
./verify-lattice-topics.mjs
```

### Issue: "Redis connection failed"
**Fix:**
```bash
# Start Redis
redis-server --daemonize yes

# Or disable Redis fallback
export VERA_REDIS_ENABLED=false
```

### Issue: "Lattice nodes not found"
**Fix:**
```bash
# Rebuild lattice index
node rebuild-lattice.mjs

# Verify mirror shard path
ls -la /mnt/vera-mirror-shards/vera-lattice/
```

## Production Checklist

- [ ] HCS topics funded with HBAR
- [ ] Redis persistent storage configured
- [ ] Backup cron job enabled (`./setup-cron.sh`)
- [ ] Log rotation configured (`./logrotate-vera`)
- [ ] systemd service active (`systemctl status vera`)
- [ ] Monitoring dashboard accessible
- [ ] SSL/TLS configured
- [ ] Rate limiting enabled

## Rollback

If issues occur:

```bash
# Stop services
systemctl stop vera

# Restore from backup
./restore-lattice.sh $(date +%Y%m%d)

# Restart
systemctl start vera
```

## Next Steps

1. Configure AI optimization (see `enable-ai-optimization` workflow)
2. Set up monitoring alerts
3. Join agent swarm (see `join-agent-swarm` workflow)
