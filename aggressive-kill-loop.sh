#!/bin/bash
# Aggressive continuous kill until all agents are stopped

echo "Starting aggressive kill loop..."

count=0
max_attempts=10

while [ $count -lt $max_attempts ]; do
    # Find and kill all node processes
    PIDS=$(ps aux | grep -E "node|npm|carbon|defi|energy|security|mclaren|fedex|dovu|vera|retrain|hcs" | grep -v grep | grep -v "ps aux" | awk '{print $2}')
    
    if [ -z "$PIDS" ]; then
        echo "No matching processes found - agents stopped!"
        break
    fi
    
    echo "Attempt $((count+1))/$max_attempts: Killing PIDs: $PIDS"
    for pid in $PIDS; do
        kill -9 $pid 2>/dev/null
    done
    
    # Also use killall and pkill
    killall -9 node 2>/dev/null
    pkill -9 -f "node|npm|carbon|defi|energy|security|mclaren|fedex|dovu|vera|retrain|hcs"
    
    # Clear PID files
    rm -f /home/vera-live-0-1/hedera-llm-api/logs/*.pid
    
    count=$((count+1))
    sleep 1
done

# Final check
remaining=$(ps aux | grep -E "node|npm|carbon|defi|energy|security|mclaren|fedex|dovu|vera|retrain|hcs" | grep -v grep | grep -v "ps aux" | wc -l)
echo ""
echo "═══════════════════════════════════"
echo "Agents remaining: $remaining"
echo "═══════════════════════════════════"
