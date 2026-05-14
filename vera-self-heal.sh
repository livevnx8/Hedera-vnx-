#!/bin/bash
# Vera Self-Healing Script
# Auto-restarts Vera services if they crash, cleans disk if full
# Monitors: TS server (8088), Python API (8080), HCS bridge (8001)

VERA_DIR="/home/vera-live-0-1/hedera-llm-api"
LOG_DIR="$VERA_DIR/logs"
mkdir -p "$LOG_DIR"

# ── Helper: check a service by health URL, restart if down ──
check_and_heal() {
  local name="$1"
  local port="$2"
  local health_url="$3"
  local start_cmd="$4"

  if curl -fsS --max-time 5 "$health_url" >/dev/null 2>&1; then
    echo "[$(date)] $name healthy on $port"
    return
  fi

  # Check if port is bound (process exists but health failing)
  local pid
  pid=$(ss -ltnp 2>/dev/null | awk -v port=":${port}" '$4 ~ port {print; exit}' | sed -n 's/.*pid=\([0-9]\+\).*/\1/p')
  if [ -n "$pid" ]; then
    echo "[$(date)] $name process on $port (PID $pid) but health fail; skipping restart"
    return
  fi

  echo "[$(date)] $name DOWN on $port — restarting..."

  # Disk check before restart
  local disk_usage
  disk_usage=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
  if [ "$disk_usage" -gt 90 ]; then
    echo "[$(date)] Disk critical (${disk_usage}%). Running emergency archive..."
    "$VERA_DIR/auto-archive.sh" >> "$LOG_DIR/archive.log" 2>&1
  fi

  cd "$VERA_DIR"
  eval "$start_cmd"
  echo "[$(date)] $name restart issued"
}

# ── 1. TypeScript server (existing — npm run dev on 8088) ──
TS_PORT="${PORT:-8088}"
check_and_heal "TS-Server" "$TS_PORT" \
  "http://127.0.0.1:${TS_PORT}/health" \
  "PORT=$TS_PORT nohup npm run dev >> '$LOG_DIR/vera.log' 2>&1 &"

# ── 2. Python API server (prediction_server_v3.py on 8080) ──
check_and_heal "Vera-API" "8080" \
  "http://127.0.0.1:8080/health" \
  "nohup $VERA_DIR/scripts/start-vera-api.sh >> '$LOG_DIR/vera-api.log' 2>&1 &"

# ── 3. HCS Bridge (hcs-bridge.mjs on 8001) ──
check_and_heal "HCS-Bridge" "8001" \
  "http://127.0.0.1:8001/health" \
  "nohup $VERA_DIR/scripts/start-hcs-bridge.sh >> '$LOG_DIR/hcs-bridge.log' 2>&1 &"

# ── GPU temperature check ──
if command -v nvidia-smi &> /dev/null; then
  GPU_TEMP=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits | head -1)
  if [ -n "$GPU_TEMP" ] && [ "$GPU_TEMP" -gt 85 ]; then
    echo "[$(date)] WARNING: GPU hot: ${GPU_TEMP}C"
  fi
fi
