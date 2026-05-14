---
description: Use both SSDs as unified distributed lattice storage
---

# Setup Distributed Storage

Combine main disk + 4TB SSD as unified lattice storage for 4.3TB total capacity.

## Storage Map

| Location | Size | Role |
|----------|------|------|
| `/` (nvme0n1) | 937G | Hot: active lattice, code, recent data |
| `/mnt/vera-ssd` (nvme1n1) | 914G | Warm: archived QVX, models |
| `/mnt/vera-mirror-shards` | 4TB | Cold: lattice knowledge, shards |

## Tiered Storage Strategy

```bash
// turbo
cat > /home/vera-live-0-1/hedera-llm-api/scripts/tier-manager.mjs << 'EOF'
import fs from 'fs';
import { execSync } from 'child_process';

const TIERS = {
  hot: { path: '/home/vera-live-0-1/hedera-llm-api', maxDays: 7 },
  warm: { path: '/mnt/vera-ssd', maxDays: 30 },
  cold: { path: '/mnt/vera-mirror-shards', maxDays: Infinity }
};

function getDiskUsage(path) {
  const out = execSync(`df -h ${path} | awk 'NR==2 {print $5}'`).toString().trim();
  return parseInt(out);
}

async function rebalance() {
  const hotUsage = getDiskUsage('/');
  const warmUsage = getDiskUsage('/mnt/vera-ssd');
  const coldUsage = getDiskUsage('/mnt/vera-mirror-shards');
  
  console.log(`Hot: ${hotUsage}% | Warm: ${warmUsage}% | Cold: ${coldUsage}%`);
  
  if (hotUsage > 80) {
    console.log('🔥 Hot tier full. Migrating to warm...');
    execSync(`find ${TIERS.hot.path}/logs -mtime +${TIERS.hot.maxDays} -exec mv {} ${TIERS.warm.path}/archive/ \\;`);
  }
  
  if (warmUsage > 80) {
    console.log('🌡️ Warm tier full. Migrating to cold...');
    execSync(`find ${TIERS.warm.path}/archive -mtime +${TIERS.warm.maxDays} -exec mv {} ${TIERS.cold.path}/archive/ \\;`);
  }
}

rebalance();
EOF
```

## Symlink Large Dirs to 4TB

```bash
// turbo
# Move Hugging Face models to 4TB (keep symlink)
if [ -d ~/.cache/huggingface ] && [ ! -L ~/.cache/huggingface ]; then
  sudo mv ~/.cache/huggingface /mnt/vera-ssd/huggingface-cache
  ln -s /mnt/vera-ssd/huggingface-cache ~/.cache/huggingface
fi

# Verify
ls -la ~/.cache/huggingface
```

## Schedule Rebalancing

```bash
// turbo
(crontab -l 2>/dev/null | grep -v tier-manager; \
 echo "*/30 * * * * node /home/vera-live-0-1/hedera-llm-api/scripts/tier-manager.mjs >> /home/vera-live-0-1/hedera-llm-api/logs/tier.log 2>&1") | crontab -
```

## Total Capacity Report

```bash
// turbo
echo "=== Vera Distributed Storage ==="
df -h / /mnt/vera-ssd /mnt/vera-mirror-shards 2>/dev/null
echo ""
echo "Total: $(df -h / /mnt/vera-ssd /mnt/vera-mirror-shards 2>/dev/null | tail -n+2 | awk '{sum+=$2} END {print sum"G"}')"
```
