#!/usr/bin/env bash
# Start Vera OS prediction server (Python/Uvicorn on port 8080)
set -euo pipefail

VERA_DIR="/home/vera-live-0-1/hedera-llm-api"
LOG_DIR="$VERA_DIR/logs"
mkdir -p "$LOG_DIR"

cd "$VERA_DIR"
set -a; source .env; set +a

echo "[$(date)] Starting Vera API on port 8080..."
exec /usr/bin/python3 prediction_server_v3.py >> "$LOG_DIR/vera-api.log" 2>&1
