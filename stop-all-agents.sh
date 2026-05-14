#!/bin/bash
# Stop all Vera agents

echo "Stopping Vera agents..."

# Stop each agent by PID
for pidfile in /home/vera-live-0-1/hedera-llm-api/logs/*.pid; do
    if [ -f "$pidfile" ]; then
        agent=$(basename "$pidfile" .pid)
        pid=$(cat "$pidfile" 2>/dev/null)
        if [ -n "$pid" ]; then
            echo "Stopping $agent (PID: $pid)..."
            kill $pid 2>/dev/null
            sleep 1
            # Force kill if still running
            kill -9 $pid 2>/dev/null
        fi
        rm -f "$pidfile"
        echo "✅ $agent stopped"
    fi
done

# Also kill any node processes related to agents
pkill -f "launch-mclaren" 2>/dev/null
pkill -f "launch-fedex" 2>/dev/null
pkill -f "vera-retrain" 2>/dev/null
pkill -f "carbon-validator" 2>/dev/null
pkill -f "defi-analyst" 2>/dev/null
pkill -f "energy-auditor" 2>/dev/null
pkill -f "security-guardian" 2>/dev/null

echo ""
echo "═══════════════════════════════════════"
echo "  ALL VERA AGENTS STOPPED ✅"
echo "═══════════════════════════════════════"
