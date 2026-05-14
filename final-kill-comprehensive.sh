#!/bin/bash
# Final comprehensive agent kill

echo "=== FINAL COMPREHENSIVE AGENT KILL ==="
echo ""

# Get current timestamp
START_TIME=$(date +%s)

# Kill from PID files
echo "Step 1: Killing from PID files..."
for pidfile in /home/vera-live-0-1/hedera-llm-api/logs/*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]')
        if [ -n "$pid" ] && [ "$pid" -gt 0 ] 2>/dev/null; then
            if ps -p "$pid" > /dev/null 2>&1; then
                echo "  Killing PID $pid from $(basename $pidfile)"
                kill -9 "$pid" 2>/dev/null
            fi
        fi
        rm -f "$pidfile"
    fi
done

# Kill all node processes
echo ""
echo "Step 2: Killing all node processes..."
killall -9 node 2>/dev/null
pkill -9 node
pkill -9 npm

# Kill specific agents
echo ""
echo "Step 3: Killing specific agents..."
for pattern in "carbon-validator" "defi-analyst" "energy-auditor" "security-guardian" "mclaren" "fedex" "dovu" "vera" "retrain" "hcs"; do
    pkill -9 -f "$pattern"
done

# Kill any remaining matching processes
echo ""
echo "Step 4: Killing remaining processes..."
for pid in $(ps aux | grep -E "node|npm|carbon|defi|energy|security|mclaren|fedex|dovu|vera|retrain|hcs" | grep -v grep | grep -v "ps aux" | awk '{print $2}'); do
    kill -9 "$pid" 2>/dev/null
done

# Clean up
echo ""
echo "Step 5: Cleaning up..."
rm -f /home/vera-live-0-1/hedera-llm-api/logs/*.pid

# Wait and verify
sleep 3

# Check remaining
echo ""
echo "=== VERIFICATION ==="
remaining=$(ps aux | grep -E "node|npm|carbon|defi|energy|security|mclaren|fedex|dovu|vera|retrain|hcs" | grep -v grep | grep -v "ps aux" | wc -l)
echo "Remaining processes: $remaining"

if [ "$remaining" -eq 0 ]; then
    echo "✅ ALL AGENTS STOPPED"
else
    echo "⚠️ $remaining processes still running"
    ps aux | grep -E "node|npm|carbon|defi|energy|security|mclaren|fedex|dovu|vera|retrain|hcs" | grep -v grep | grep -v "ps aux" | head -5
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo ""
echo "Kill operation completed in ${DURATION} seconds"
