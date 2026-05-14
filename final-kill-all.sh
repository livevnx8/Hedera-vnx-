#!/bin/bash
# Final comprehensive kill

echo "Finding and killing all agent processes..."

# Find all matching PIDs
PIDS=$(ps aux | grep -E "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain|hcs" | grep -v grep | grep -v "ps aux" | awk '{print $2}')

if [ -n "$PIDS" ]; then
    echo "Found PIDs: $PIDS"
    for pid in $PIDS; do
        echo "Killing PID $pid"
        kill -9 $pid 2>/dev/null
    done
else
    echo "No matching processes found"
fi

# Aggressive kill commands
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

# Clear PID files
rm -f /home/vera-live-0-1/hedera-llm-api/logs/*.pid

sleep 2

# Check remaining
count=$(ps aux | grep -E "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain|hcs" | grep -v grep | grep -v "ps aux" | wc -l)
echo ""
echo "═══════════════════════════════════"
echo "Processes remaining: $count"
echo "═══════════════════════════════════"
