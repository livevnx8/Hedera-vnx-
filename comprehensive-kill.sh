#!/bin/bash
# Comprehensive agent kill script

echo "═══════════════════════════════════════════════════"
echo "  COMPREHENSIVE AGENT STOP"
echo "═══════════════════════════════════════════════════"

# Kill from PID files
echo "Step 1: Killing from PID files..."
for pidfile in /home/vera-live-0-1/hedera-llm-api/logs/*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile" 2>/dev/null)
        if [ -n "$pid" ]; then
            echo "  Killing PID $pid"
            kill -9 $pid 2>/dev/null
        fi
        rm -f "$pidfile"
    fi
done

# Kill all node processes
echo "Step 2: Killing all node processes..."
killall -9 node 2>/dev/null
pkill -9 node
pkill -9 npm

# Kill specific agents
echo "Step 3: Killing specific agents..."
for agent in carbon-validator defi-analyst energy-auditor security-guardian mclaren fedex dovu vera retrain; do
    pkill -9 -f "$agent"
done

# Kill any remaining processes matching patterns
echo "Step 4: Pattern matching kill..."
pkill -9 -f "hcs"
pkill -9 -f "launch-mclaren"
pkill -9 -f "launch-fedex"

# Clean up
rm -f /home/vera-live-0-1/hedera-llm-api/logs/*.pid

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ALL KILL COMMANDS EXECUTED"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Monitor HashScan to verify transactions stop."
echo "If transactions continue, there may be:"
echo "  - A cron job running agents"
echo "  - A systemd service"
echo "  - A detached screen/tmux session"
echo "  - A parent process respawning children"
