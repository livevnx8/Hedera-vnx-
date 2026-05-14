#!/bin/bash
# Vera Auto-Archive Script
# Runs daily to keep main disk healthy by moving old data to 4TB SSD

set -e

MAIN_DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
THRESHOLD=80
LOG_DIR="/home/vera-live-0-1/hedera-llm-api/logs"
mkdir -p "$LOG_DIR"

echo "[$(date)] Main disk at ${MAIN_DISK_USAGE}%"

if [ "$MAIN_DISK_USAGE" -gt "$THRESHOLD" ]; then
  echo "[$(date)] Threshold exceeded. Starting archival..."
  
  # Ensure archive dirs exist on 4TB
  mkdir -p /mnt/vera-ssd/qvx-archive/bot-captures 2>/dev/null || true
  mkdir -p /mnt/vera-ssd/qvx-archive/bot-features 2>/dev/null || true
  
  # Archive bot captures older than 7 days
  if [ -d "/home/vera-live-0-1/QVX/data/bot-captures" ]; then
    echo "[$(date)] Archiving bot-captures..."
    find /home/vera-live-0-1/QVX/data/bot-captures -type f -mtime +7 \
      -exec rsync -a --remove-source-files {} /mnt/vera-ssd/qvx-archive/bot-captures/ \; 2>/dev/null || true
  fi
  
  # Archive bot features older than 7 days
  if [ -d "/home/vera-live-0-1/QVX/data/bot-features" ]; then
    echo "[$(date)] Archiving bot-features..."
    find /home/vera-live-0-1/QVX/data/bot-features -type f -mtime +7 \
      -exec rsync -a --remove-source-files {} /mnt/vera-ssd/qvx-archive/bot-features/ \; 2>/dev/null || true
  fi
  
  # Clean HF cache (unused >30 days)
  find ~/.cache/huggingface -type f -atime +30 -delete 2>/dev/null || true
  
  # Clean npm cache
  npm cache clean --force 2>/dev/null || true
  
  # Clean old logs
  sudo journalctl --vacuum-time=3d 2>/dev/null || true
  
  # Remove empty dirs
  find /home/vera-live-0-1/QVX/data -type d -empty -delete 2>/dev/null || true
  
  NEW_USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
  echo "[$(date)] Archive complete. Disk now at ${NEW_USAGE}%"
else
  echo "[$(date)] Disk usage OK. No archival needed."
fi
