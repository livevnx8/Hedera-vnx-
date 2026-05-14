#!/bin/bash
# Simple direct kill script

echo "Killing all node processes..."

# Get all node PIDs and kill them
ps aux | grep node | grep -v grep | awk '{print $2}' | while read pid; do
    echo "Killing PID: $pid"
    kill -9 $pid 2>/dev/null
done

# Also use pkill
pkill -9 node
pkill -9 npm

# Kill agent-specific processes
for pattern in mclaren fedex carbon defi energy security dovu vera retrain hcs; do
    pkill -9 -f "$pattern"
done

# Wait
sleep 2

# Check if any remain
count=$(ps aux | grep -E "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain" | grep -v grep | wc -l)

echo ""
echo "═══════════════════════════════════"
if [ "$count" -eq 0 ]; then
    echo "✅ ALL AGENTS STOPPED"
else
    echo "⚠️ $count processes still running"
fi
echo "═══════════════════════════════════"
