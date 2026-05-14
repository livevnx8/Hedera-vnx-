#!/bin/bash
# Final comprehensive agent stop

echo "═══════════════════════════════════════════════════"
echo "  FINAL AGENT STOP - EMERGENCY MODE"
echo "═══════════════════════════════════════════════════"

# Step 1: Kill from PID files
echo "Step 1: Killing from PID files..."
for pidfile in /home/vera-live-0-1/hedera-llm-api/logs/*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]')
        if [ -n "$pid" ] && [ "$pid" -gt 0 ] 2>/dev/null; then
            if kill -0 $pid 2>/dev/null; then
                echo "  Killing PID $pid from $(basename $pidfile)"
                kill -9 $pid 2>/dev/null
            fi
        fi
        rm -f "$pidfile"
    fi
done

# Step 2: Aggressive kill commands
echo "Step 2: Executing aggressive kill commands..."
killall -9 node 2>/dev/null
killall -9 npm 2>/dev/null
pkill -9 -f node
pkill -9 -f npm
pkill -9 -f "mclaren"
pkill -9 -f "fedex"
pkill -9 -f "carbon-validator"
pkill -9 -f "defi-analyst"
pkill -9 -f "energy-auditor"
pkill -9 -f "security-guardian"
pkill -9 -f "dovu"
pkill -9 -f "vera"
pkill -9 -f "retrain"
pkill -9 -f "hcs"

# Step 3: Kill any remaining matching processes
echo "Step 3: Killing any remaining processes..."
for pid in $(ps aux | grep -E "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain|hcs" | grep -v grep | grep -v "ps aux" | awk '{print $2}'); do
    echo "  Killing remaining PID: $pid"
    kill -9 $pid 2>/dev/null
done

# Step 4: Clean up
echo "Step 4: Cleaning up..."
rm -f /home/vera-live-0-1/hedera-llm-api/logs/*.pid

echo ""
echo "═══════════════════════════════════════════════════"
echo "  KILL COMMANDS COMPLETE"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Monitor HashScan to verify transactions have stopped."
echo "If transactions continue, check:"
echo "  - Other servers/systems running agents"
echo "  - Wallet compromised/compromised keys"
echo "  - Delayed transaction processing"
