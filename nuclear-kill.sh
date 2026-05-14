#!/bin/bash
# Nuclear option - kill ALL agent processes

echo "═══════════════════════════════════════════════════════════"
echo "         NUCLEAR KILL - ALL AGENTS"
echo "═══════════════════════════════════════════════════════════"

# Find and kill ALL node processes
for pid in $(ps aux | grep -E "node|npm" | grep -v grep | grep -v "ps aux" | awk '{print $2}'); do
    echo "Killing node process PID: $pid"
    kill -9 $pid 2>/dev/null
done

# Kill by pattern matching
for pattern in "carbon-validator" "defi-analyst" "energy-auditor" "security-guardian" "mclaren" "fedex" "dovu" "vera" "retrain" "hcs"; do
    for pid in $(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}'); do
        echo "Killing $pattern process PID: $pid"
        kill -9 $pid 2>/dev/null
    done
done

# Kill all node processes by pgrep
for pid in $(pgrep -f "node" 2>/dev/null); do
    echo "Killing node PID (pgrep): $pid"
    kill -9 $pid 2>/dev/null
done

# Remove all PID files
rm -f /home/vera-live-0-1/hedera-llm-api/logs/*.pid

# Wait and verify
sleep 2
remaining=$(ps aux | grep -E "node|carbon|defi|energy|security|mclaren|fedex|dovu|vera" | grep -v grep | grep -v "ps aux" | wc -l)

echo ""
if [ "$remaining" -eq 0 ]; then
    echo "✅ ALL AGENTS STOPPED"
else
    echo "⚠️  Still running: $remaining processes"
    ps aux | grep -E "node|carbon|defi|energy|security|mclaren|fedex|dovu|vera" | grep -v grep | head -5
fi
echo "═══════════════════════════════════════════════════════════"
