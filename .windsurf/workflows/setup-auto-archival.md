---
description: Prevent disk-full crashes with automatic data archival
---

# Setup Auto-Archival

Never crash from disk full again. Automatically archives old data from main drive to 4TB SSD.

## Quick Install

```bash
// turbo
# Create archival script
cat > /home/vera-live-0-1/hedera-llm-api/auto-archive.sh << 'EOF'
#!/bin/bash
# Auto-archive script - runs daily to keep main disk healthy

MAIN_DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
THRESHOLD=80

echo "[$(date)] Main disk at ${MAIN_DISK_USAGE}%"

if [ "$MAIN_DISK_USAGE" -gt "$THRESHOLD" ]; then
  echo "[$(date)] Archiving QVX data to 4TB SSD..."
  
  # Archive bot captures older than 7 days
  find /home/vera-live-0-1/QVX/data/bot-captures -type f -mtime +7 \
    -exec rsync -a --remove-source-files {} /mnt/vera-ssd/qvx-archive/bot-captures/ \;
  
  # Archive bot features older than 7 days
  find /home/vera-live-0-1/QVX/data/bot-features -type f -mtime +7 \
    -exec rsync -a --remove-source-files {} /mnt/vera-ssd/qvx-archive/bot-features/ \;
  
  # Clean HF cache weekly
  find ~/.cache/huggingface -type f -atime +30 -delete 2>/dev/null
  
  # Clean old logs
  sudo journalctl --vacuum-time=3d
  
  # Remove empty dirs
  find /home/vera-live-0-1/QVX/data -type d -empty -delete 2>/dev/null
  
  NEW_USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
  echo "[$(date)] Disk now at ${NEW_USAGE}%"
fi
EOF

chmod +x /home/vera-live-0-1/hedera-llm-api/auto-archive.sh
```

## Schedule Daily Cron

```bash
// turbo
# Add to crontab (runs daily at 3 AM)
(crontab -l 2>/dev/null; echo "0 3 * * * /home/vera-live-0-1/hedera-llm-api/auto-archive.sh >> /home/vera-live-0-1/hedera-llm-api/logs/archive.log 2>&1") | crontab -

# Verify
crontab -l | grep archive
```

## Emergency Disk Cleanup

```bash
// turbo
# Run immediately if disk gets critical
/home/vera-live-0-1/hedera-llm-api/auto-archive.sh
```

## Configure Thresholds

```bash
# Edit script to change thresholds
vi /home/vera-live-0-1/hedera-llm-api/auto-archive.sh

# THRESHOLD=80   # Start archiving at 80%
# THRESHOLD=70   # More aggressive
```

## Monitoring

```bash
// turbo
# Check archive log
tail -f /home/vera-live-0-1/hedera-llm-api/logs/archive.log

# Current disk status
df -h / /mnt/vera-ssd
```

## Verify

```bash
// turbo
# Test run
bash -x /home/vera-live-0-1/hedera-llm-api/auto-archive.sh
```
