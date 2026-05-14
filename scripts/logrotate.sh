#!/usr/bin/env bash
# Rotate Vera logs — keeps last 7 days, compresses old ones
set -euo pipefail

LOG_DIR="/home/vera-live-0-1/hedera-llm-api/logs"

rotate_log() {
  local log="$1"
  [ -f "$log" ] || return

  local size
  size=$(stat -c%s "$log" 2>/dev/null || echo 0)

  # Rotate if > 50MB
  if [ "$size" -gt 52428800 ]; then
    local ts
    ts=$(date +%Y%m%d-%H%M%S)
    mv "$log" "${log}.${ts}"
    gzip "${log}.${ts}" &
    echo "[$(date)] Rotated $log (${size} bytes)"
  fi
}

# Rotate all log files
for f in "$LOG_DIR"/*.log; do
  rotate_log "$f"
done

# Delete compressed logs older than 7 days
find "$LOG_DIR" -name "*.log.*.gz" -mtime +7 -delete 2>/dev/null || true

# Clean old evidence dirs older than 30 days
find "$LOG_DIR/../docs/evidence" -maxdepth 1 -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true
