#!/bin/bash
# Comprehensive agent verification and kill

OUTPUT_FILE="/tmp/agent-kill-report.txt"
echo "=== AGENT VERIFICATION REPORT $(date) ===" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Check for node processes
echo "--- Node Processes ---" >> "$OUTPUT_FILE"
ps aux | grep -E "node.*mjs|vera-|mclaren|fedex|energy|security|defi|carbon" | grep -v grep >> "$OUTPUT_FILE" 2>&1
if [ $? -ne 0 ]; then
    echo "No matching processes found via ps" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Check for node via pgrep
echo "--- pgrep Results ---" >> "$OUTPUT_FILE"
pgrep -a -f "node.*mjs|vera-|mclaren|fedex|energy|security|defi|carbon" >> "$OUTPUT_FILE" 2>&1
if [ $? -ne 0 ]; then
    echo "No matching processes found via pgrep" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# Kill processes
echo "--- Killing Processes ---" >> "$OUTPUT_FILE"
pkill -9 -f 'vera-\|mclaren' 2>/dev/null && echo "Killed vera/mclaren" >> "$OUTPUT_FILE"
pkill -9 -f "fedex|energy|security|defi|carbon" 2>/dev/null && echo "Killed agent types" >> "$OUTPUT_FILE"
killall -9 node 2>/dev/null && echo "Killed all node" >> "$OUTPUT_FILE"

# Kill from PID files
for pidfile in /home/vera-live-0-1/hedera-llm-api/logs/*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]')
        if [ -n "$pid" ]; then
            kill -9 "$pid" 2>/dev/null && echo "Killed PID $pid from $pidfile" >> "$OUTPUT_FILE"
        fi
    fi
done
rm -f /home/vera-live-0-1/hedera-llm-api/logs/*.pid
echo "PID files cleaned" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Final verification
echo "--- Final Process Count ---" >> "$OUTPUT_FILE"
count=$(ps aux | grep -E "node.*mjs|vera-|mclaren|fedex|energy|security|defi|carbon" | grep -v grep | wc -l)
echo "Remaining agent processes: $count" >> "$OUTPUT_FILE"

# Check log file timestamps
echo "" >> "$OUTPUT_FILE"
echo "--- Log File Timestamps ---" >> "$OUTPUT_FILE"
ls -lt /home/vera-live-0-1/hedera-llm-api/logs/*.log 2>/dev/null | head -5 >> "$OUTPUT_FILE"

echo "" >> "$OUTPUT_FILE"
echo "=== REPORT COMPLETE ===" >> "$OUTPUT_FILE"
cat "$OUTPUT_FILE"
