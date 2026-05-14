---
description: Emergency recovery procedures for Vera lattice
---

# Emergency Recovery

Critical recovery procedures.

## System Down

```bash
// turbo
# 1. Check status
./vera-status.sh

# 2. Restart services
sudo systemctl restart vera

# 3. Verify
./vera-status.sh
```

## Data Corruption

```bash
// turbo
# 1. Stop services
sudo systemctl stop vera

# 2. Restore from backup
./restore-lattice.sh latest

# 3. Restart
sudo systemctl start vera
```

## HCS Connection Lost

```bash
// turbo
# 1. Check topics
node verify-lattice-topics.mjs

# 2. Test connection
node -e "
import { hederaMaster } from './src/hedera/hederaMasterClass.js';
await hederaMaster.healthCheck();
"

# 3. Restart beacon
node -e "
import { agentHCSBeacon } from './src/vera/orchestrator/agentHCSBeacon.js';
await agentHCSBeacon.restart();
"
```

## Contact

| Severity | Contact |
|----------|---------|
| Critical | On-call engineer |
| High | Dev team Slack |
| Medium | GitHub issues |
