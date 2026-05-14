#!/bin/bash
# Final nuclear option - find and kill ALL processes

echo "Finding ALL processes..."

# Get list of all PIDs that match
ALL_PIDS=$(ps aux | grep -E "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain|hcs" | grep -v grep | grep -v "ps aux" | awk '{print $2}')

echo "Found PIDs: $ALL_PIDS"

# Kill each PID
for pid in $ALL_PIDS; do
    echo "Killing PID: $pid"
    kill -9 $pid 2>/dev/null || echo "Failed to kill $pid"
done

# Use killall
killall -9 node 2>/dev/null
killall -9 npm 2>/dev/null

# Use pkill
pkill -9 -f node
pkill -9 -f npm
pkill -9 -f "mclaren"
pkill -9 -f "fedex"
pkill -9 -f "carbon"
pkill -9 -f "defi"
pkill -9 -f "energy"
pkill -9 -f "security"
pkill -9 -f "dovu"
pkill -9 -f "vera"
pkill -9 -f "retrain"

# Clean up
rm -f /home/vera-live-0-1/hedera-llm-api/logs/*.pid

sleep 2

# Check if any remain
REMAINING=$(ps aux | grep -E "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain|hcs" | grep -v grep | grep -v "ps aux" | wc -l)

echo ""
echo "═══════════════════════════════════════════"
if [ "$REMAINING" -eq 0 ]; then
    echo "✅ ALL AGENTS STOPPED SUCCESSFULLY"
else
    echo "⚠️ $REMAINING processes still running:"
    ps aux | grep -E "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain|hcs" | grep -v grep | head -5
fi
echo "═══════════════════════════════════════════"
