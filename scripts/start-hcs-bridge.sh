#!/usr/bin/env bash
# Start Vera HCS Bridge (Node.js on port 8001)
set -euo pipefail

VERA_DIR="/home/vera-live-0-1/hedera-llm-api"
LOG_DIR="$VERA_DIR/logs"
mkdir -p "$LOG_DIR"

cd "$VERA_DIR"
set -a; source .env; set +a

echo "[$(date)] Starting HCS Bridge on port 8001..."
exec /usr/bin/node scripts/hcs-bridge.mjs >> "$LOG_DIR/hcs-bridge.log" 2>&1
