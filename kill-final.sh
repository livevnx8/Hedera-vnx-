#!/bin/bash
# Final kill all agents

echo "Finding all node processes..."
ps aux | grep -E "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain|hcs" | grep -v grep

echo ""
echo "Killing all found processes..."
for pid in $(ps aux | grep -E "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain|hcs" | grep -v grep | awk '{print $2}'); do
    echo "Killing PID: $pid"
    kill -9 $pid
done

# Also use killall and pkill
killall -9 node 2>/dev/null
pkill -9 -f "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain|hcs"

# Clean PID files
rm -f /home/vera-live-0-1/hedera-llm-api/logs/*.pid

echo ""
echo "Checking for remaining processes..."
count=$(ps aux | grep -E "node|npm|mclaren|fedex|carbon|defi|energy|security|dovu|vera|retrain|hcs" | grep -v grep | wc -l)
echo "Remaining processes: $count"
