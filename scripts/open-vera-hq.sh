#!/usr/bin/env bash

set -euo pipefail

VERA_DIR="/home/vera-live-0-1/hedera-llm-api"
LOG_DIR="$VERA_DIR/logs"
HEALTH_URL="http://127.0.0.1:8088/health"
HQ_URL="http://127.0.0.1:8088/hq"
SELF_HEAL_SCRIPT="$VERA_DIR/vera-self-heal.sh"
LAUNCH_LOG="$LOG_DIR/vera-hq-launcher.log"

mkdir -p "$LOG_DIR"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LAUNCH_LOG"
}

ensure_vera_running() {
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    log "Vera already responding on 8088"
    return 0
  fi

  log "Vera not responding; invoking self-heal startup"
  if [ -x "$SELF_HEAL_SCRIPT" ]; then
    "$SELF_HEAL_SCRIPT" >> "$LAUNCH_LOG" 2>&1 || true
  else
    cd "$VERA_DIR"
    PORT=8088 nohup npm run dev >> "$LAUNCH_LOG" 2>&1 &
    log "Fallback start issued with PID $!"
  fi

  for _ in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      log "Vera became healthy after startup"
      return 0
    fi
    sleep 1
  done

  log "Vera did not become healthy within timeout"
  return 1
}

main() {
  ensure_vera_running || true
  log "Opening Vera Headquarters"
  xdg-open "$HQ_URL" >/dev/null 2>&1 &
}

main "$@"
