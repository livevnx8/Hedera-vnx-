#!/usr/bin/env bash
# Vera Watchdog — checks API and HCS bridge health, restarts if needed.
set -euo pipefail

API_URL="http://localhost:8080/health"
BRIDGE_URL="http://localhost:8001/health"
MAX_FAILURES=3
FAIL_FILE_API="/tmp/vera-watchdog-api-failures"
FAIL_FILE_BRIDGE="/tmp/vera-watchdog-bridge-failures"

check_service() {
  local url="$1"
  local fail_file="$2"
  local service="$3"

  if curl -sf --max-time 10 "$url" > /dev/null 2>&1; then
    # Healthy — reset counter
    echo 0 > "$fail_file"
    echo "[watchdog] $service OK"
  else
    # Increment failure counter
    local count
    count=$(cat "$fail_file" 2>/dev/null || echo 0)
    count=$((count + 1))
    echo "$count" > "$fail_file"
    echo "[watchdog] $service FAIL ($count/$MAX_FAILURES)"

    if [ "$count" -ge "$MAX_FAILURES" ]; then
      echo "[watchdog] Restarting $service after $MAX_FAILURES consecutive failures"
      systemctl --user restart "$service"
      echo 0 > "$fail_file"
    fi
  fi
}

check_service "$API_URL"    "$FAIL_FILE_API"    "vera-api.service"
check_service "$BRIDGE_URL" "$FAIL_FILE_BRIDGE" "vera-hcs-bridge.service"
