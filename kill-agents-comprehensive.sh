#!/bin/bash
# Comprehensive agent kill with verification

echo "=== COMPREHENSIVE AGENT KILL ==="
echo ""

# Find all node processes
echo "Finding all node processes..."
PIDS=$(ps aux | grep -E "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain|hcs" | grep -v grep | grep -v "ps aux" | awk '{print $2}')

if [ -n "$PIDS" ]; then
    echo "Found PIDs: $PIDS"
    for pid in $PIDS; do
        echo "Killing PID $pid"
        kill -9 $pid 2>/dev/null
    done
else
    echo "No matching processes found via ps"
fi

# Kill from PID files
echo ""
echo "Killing from PID files..."
for pidfile in /home/vera-live-0-1/hedera-llm-api/logs/*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]')
        if [ -n "$pid" ]; then
            echo "Killing PID $pid from $pidfile"
            kill -9 $pid 2>/dev/null
        fi
        rm -f "$pidfile"
    fi
done

# Aggressive pattern kills
echo ""
echo "Executing pattern kills..."
killall -9 node 2>/dev/null
pkill -9 node
pkill -9 npm
pkill -9 -f "mclaren"
pkill -9 -f "fedex"
pkill -9 -f "carbon"
pkill -9 -f "defi"
pkill -9 -f "energy"
pkill -9 -f "security"
pkill -9 -f "dovu"
pkill -9 -f "vera"
pkill -9 -f "retrain"
pkill -9 -f "hcs"

# Kill any remaining node processes
echo ""
echo "Killing remaining node processes..."
for pid in $(pgrep -f node 2>/dev/null); do
    kill -9 $pid 2>/dev/null
done

# Clean up
echo ""
echo "Cleaning up PID files..."
rm -f /home/vera-live-0-1/hedera-llm-api/logs/*.pid

echo ""
echo "=== KILL COMMANDS COMPLETE ==="
echo ""
echo "Wait 10 seconds and check if agents are still writing to logs..."
