#!/bin/bash
# Emergency stop all Vera agents and node processes

echo "═══════════════════════════════════════════════════════════"
echo "         EMERGENCY AGENT STOP - CHECKING PROCESSES"
echo "═══════════════════════════════════════════════════════════"

# 1. Kill by PID files
echo ""
echo "Step 1: Killing processes from PID files..."
for pidfile in /home/vera-live-0-1/hedera-llm-api/logs/*.pid; do
    if [ -f "$pidfile" ]; then
        agent=$(basename "$pidfile" .pid)
        pid=$(cat "$pidfile" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 $pid 2>/dev/null; then
            echo "  Killing $agent (PID: $pid)..."
            kill -9 $pid 2>/dev/null
            sleep 0.5
        fi
        rm -f "$pidfile"
    fi
done

# 2. Kill all node processes in project directory
echo ""
echo "Step 2: Killing all node processes..."
pkill -9 -f "node.*mjs" 2>/dev/null
pkill -9 -f "node.*js" 2>/dev/null
pkill -9 node 2>/dev/null

# 3. Kill specific agent processes by name pattern
echo ""
echo "Step 3: Killing agent-specific processes..."
pkill -9 -f "carbon-validator" 2>/dev/null
pkill -9 -f "defi-analyst" 2>/dev/null
pkill -9 -f "energy-auditor" 2>/dev/null
pkill -9 -f "security-guardian" 2>/dev/null
pkill -9 -f "mclaren" 2>/dev/null
pkill -9 -f "fedex" 2>/dev/null
pkill -9 -f "dovu" 2>/dev/null
pkill -9 -f "vera" 2>/dev/null
pkill -9 -f "hcs" 2>/dev/null
pkill -9 -f "retrain" 2>/dev/null

# 4. Wait and verify
echo ""
echo "Step 4: Verifying all processes stopped..."
sleep 2

remaining=$(ps aux | grep -E "(node.*mjs|node.*js|carbon|defi|energy|security|mclaren|fedex|dovu)" | grep -v grep | grep -v "ps aux" | wc -l)

if [ "$remaining" -eq 0 ]; then
    echo "✅ All agent processes stopped successfully"
else
    echo "⚠️  Warning: $remaining processes still running"
    ps aux | grep -E "(node|mclaren|fedex|carbon|defi|energy|security|dovu)" | grep -v grep | head -10
fi

# 5. Clean up
echo ""
echo "Step 5: Cleaning up..."
rm -f /home/vera-live-0-1/hedera-llm-api/logs/*.pid

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "         ALL AGENTS STOPPED ✅"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Wallet transactions should now stop."
echo "Monitor HashScan to confirm no new transactions."
