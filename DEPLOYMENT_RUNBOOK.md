# VeraLattice Deployment Runbook

## Overview
Production deployment guide for VeraLattice with safety procedures for testnet → mainnet migration.

## Quick Start

```bash
# 1. Pre-deployment checks
npm run test:integration
npm run test:load
npm run security:audit

# 2. Create backup
./scripts/deployment/mainnet-migration.sh backup

# 3. Dry run
./scripts/deployment/mainnet-migration.sh dry-run

# 4. Canary deployment (1%)
./scripts/deployment/mainnet-migration.sh canary

# 5. Full migration
./scripts/deployment/mainnet-migration.sh migrate
```

## Pre-Deployment Checklist

### Environment Setup
- [ ] `HEDERA_OPERATOR_ACCOUNT_ID` set
- [ ] `HEDERA_OPERATOR_KEY` configured
- [ ] `MAINNET_OPERATOR_KEY` configured (separate from testnet)
- [ ] `VERA_AUDIT_TOPIC_ID` verified on mainnet
- [ ] `X402_BASE_URL` and `X402_API_KEY` configured
- [ ] Database backup location configured

### Validation Steps
```bash
# 1. Verify operator balance (min 100 HBAR)
node -e "const { getClient } = require('./dist/src/hedera/tools/client');
const { AccountBalanceQuery } = require('@hashgraph/sdk');
const client = getClient();
new AccountBalanceQuery()
  .setAccountId(process.env.HEDERA_OPERATOR_ACCOUNT_ID)
  .execute(client)
  .then(b => console.log('Balance:', b.hbars.toString()));"

# 2. Verify all topics exist
npm run verify:topics

# 3. Run integration tests
npm run test:integration

# 4. Run load test (validate 50 msg/s)
npm run test:load -- --target 50 --duration 300

# 5. Security audit
npm run security:audit
```

## Deployment Phases

### Phase 1: Validation (Week 6, Day 1)
**Duration**: 2-4 hours
**Risk**: None (read-only)

```bash
./scripts/deployment/mainnet-migration.sh validate
```

**Outputs**:
- Environment validation report
- Balance verification
- Topic existence check
- Feature flag review

**Rollback**: Not needed (no changes made)

### Phase 2: Backup (Week 6, Day 2)
**Duration**: 30 minutes
**Risk**: None

```bash
./scripts/deployment/mainnet-migration.sh backup
```

**Creates**:
- SQLite database backup
- HCS state snapshot
- Environment configuration backup
- Agent state exports

**Verify**:
```bash
ls -la ./backups/migration-*/
# Should contain: data.sqlite, snapshot-*.json, .env.testnet
```

### Phase 3: Dry Run (Week 6, Day 3)
**Duration**: 4-8 hours
**Risk**: Low (no real transactions)

```bash
# Enable dry run mode
export VERA_DRY_RUN=true
export VERA_SHADOW_MODE=true
export HEDERA_NETWORK=mainnet

# Start services
npm run start:dry-run

# Run tests
npm run test:integration -- --mainnet-dry-run
```

**Validates**:
- All HCS messages logged but not submitted
- Settlements processed but not executed
- Feature flags respected
- Circuit breakers functional

**Monitoring**:
```bash
# Watch logs
tail -f logs/dry-run.log | grep -E "(ERROR|WARN|DRY_RUN)"

# Check metrics
curl http://localhost:8080/metrics
```

### Phase 4: Canary (Week 6, Day 4-5)
**Duration**: 24-48 hours
**Risk**: Low (1% traffic)

```bash
./scripts/deployment/mainnet-migration.sh canary
```

**Configuration**:
```bash
export CANARY_PERCENTAGE=1
```

**Monitoring** (check every 30 minutes):
```bash
# Error rate should be < 1%
curl http://localhost:8080/metrics | grep error_rate

# Latency should be < 1s
curl http://localhost:8080/metrics | grep latency_p95

# Settlement success rate should be > 95%
curl http://localhost:8080/metrics | grep settlement_success_rate
```

**Auto-rollback triggers**:
- Error rate > 5% for 5 minutes
- Latency > 2s for 10 minutes
- Settlement failure rate > 10%

### Phase 5: Gradual Rollout (Week 7)

#### Stage 1: 10% Traffic (Day 1)
```bash
kubectl patch service vera-gateway -n production \
  -p '{"spec":{"trafficPolicy":{"canary":{"percentage":10}}}}'
```

**Duration**: 24 hours
**Watch**: Error rates, settlement times

#### Stage 2: 50% Traffic (Day 2-3)
```bash
kubectl patch service vera-gateway -n production \
  -p '{"spec":{"trafficPolicy":{"canary":{"percentage":50}}}}'
```

**Duration**: 48 hours
**Watch**: All metrics, compare testnet vs mainnet performance

#### Stage 3: 100% Traffic (Day 4-5)
```bash
kubectl patch service vera-gateway -n production \
  -p '{"spec":{"trafficPolicy":{"canary":{"percentage":100}}}}'
```

**Duration**: 48 hours
**Watch**: Full system health

### Phase 6: Full Migration (Week 8)
**Duration**: 2-4 hours
**Risk**: Medium (all traffic on mainnet)

```bash
./scripts/deployment/mainnet-migration.sh migrate
```

**Final verification**:
```bash
# 1. Health check
curl -f https://api.veralattice.com/health

# 2. Settlement test
node scripts/test-settlement.js

# 3. HCS message test
node scripts/test-hcs.js

# 4. Load test (10% of capacity)
npm run test:load -- --target 5 --duration 60
```

## Monitoring & Alerting

### Key Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| HCS Messages/sec | 50 | < 40 for 5min |
| Settlement Latency (p95) | < 1s | > 2s for 5min |
| Settlement Success Rate | > 99% | < 95% for 5min |
| Error Rate | < 1% | > 5% for 2min |
| Agent Response Time | < 500ms | > 1s for 5min |

### Dashboards
- **Grafana**: https://grafana.veralattice.com/d/vera-main
- **Health**: https://api.veralattice.com/health
- **Metrics**: https://api.veralattice.com/metrics

### Alert Channels
- PagerDuty: `+1-555-VERA-OPS`
- Slack: `#vera-alerts`
- Email: `ops@veralattice.com`

## Rollback Procedures

### Automated Rollback
Triggered automatically on:
- Error rate > 5% for 5 minutes
- Settlement failure rate > 10% for 5 minutes
- Latency > 5s for 5 minutes
- Circuit breaker opens on critical services

```bash
# Check if auto-rollback triggered
kubectl get events -n production | grep Rollback
```

### Manual Rollback

```bash
# 1. Immediate traffic cutover
kubectl patch service vera-gateway -n production \
  -p '{"spec":{"trafficPolicy":{"canary":{"percentage":0}}}}'

# 2. Restore previous deployment
kubectl rollout undo deployment/vera-primary -n production

# 3. Restore environment
./scripts/deployment/mainnet-migration.sh rollback

# 4. Verify testnet is serving traffic
curl -f https://testnet.veralattice.com/health
```

### Data Recovery

```bash
# Restore from backup
cp ./backups/migration-*/data.sqlite data.sqlite

# Restore HCS state snapshot
node -e "
  const { backupManager } = require('./dist/src/vera/disaster-recovery/stateBackup');
  backupManager.restore('backup-<ID>');
"
```

## Emergency Contacts

| Role | Name | Contact | Escalation |
|------|------|---------|------------|
| On-Call Engineer | Rotation | +1-555-VERA-OPS | 15 min |
| Engineering Lead | TBD | slack: @eng-lead | 30 min |
| CTO | TBD | +1-555-CTO | 1 hour |
| Hedera Support | - | support@hedera.com | - |

## Post-Deployment

### Week 8 Tasks
- [ ] SOC2 compliance audit
- [ ] Performance benchmark report
- [ ] Chaos engineering validation
- [ ] Documentation updates
- [ ] Team post-mortem

### Success Criteria
- [ ] 99.9% uptime for 7 consecutive days
- [ ] < 1s average settlement latency
- [ ] 50 HCS messages/second sustained
- [ ] Zero data loss incidents
- [ ] All SOC2 controls passing

## Troubleshooting

### Common Issues

**Issue**: Settlement failures on mainnet
```bash
# Check circuit breaker status
curl http://localhost:8080/metrics | grep circuit_breaker

# Check x402 API health
curl -f ${X402_BASE_URL}/health

# Check operator balance
node -e "const { getClient } = require('./dist/src/hedera/tools/client');..."
```

**Issue**: High latency on settlements
```bash
# Check HCS batching queue depth
curl http://localhost:8080/metrics | grep hcs_queue_depth

# Check connection pool status
curl http://localhost:8080/metrics | grep connection_pool

# Review rate limiting
curl http://localhost:8080/metrics | grep rate_limit
```

**Issue**: Agent crashes
```bash
# Check agent logs
tail -f logs/agent-*.log | grep ERROR

# Check feature flags
curl http://localhost:8080/api/config | grep enable

# Restart agent
./scripts/restart-agent.sh <agent-id>
```

## Appendix

### Environment Variables

```bash
# Required
HEDERA_OPERATOR_ACCOUNT_ID=0.0.xxxxx
HEDERA_OPERATOR_KEY=302e...
MAINNET_OPERATOR_KEY=302e...
HEDERA_NETWORK=mainnet

# Safety
VERA_ENABLE_MAINNET=true
VERA_MAX_HBAR_SETTLEMENT=1000
VERA_DRY_RUN=false
VERA_SHADOW_MODE=false

# Features
VERA_ENABLE_LATTICE=true
VERA_ENABLE_X402=true
VERA_X402_PERCENTAGE=100

# Monitoring
PROMETHEUS_PORT=9090
GRAFANA_URL=https://grafana.veralattice.com
```

### Useful Commands

```bash
# Check system status
npm run status

# View all logs
npm run logs:all

# Reset circuit breaker
npm run reset:circuit-breaker

# Force state backup
npm run backup:force

# View metrics
npm run metrics

# Emergency stop (all agents)
npm run emergency:stop
```

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-01 | 3.0.0 | Initial mainnet deployment |

---

**Last Updated**: 2026-04-01
**Owner**: Vera Engineering Team
**Review Schedule**: Monthly
