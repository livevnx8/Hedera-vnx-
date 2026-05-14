---
description: 24/7 rig health monitoring with auto-alerts
---

# Setup Rig Monitor

Continuous rig monitoring with alerts for disk, GPU, memory, Vera health.

## Install Monitor Script

```bash
// turbo
cat > /home/vera-live-0-1/hedera-llm-api/rig-monitor.sh << 'EOF'
#!/bin/bash
# Vera Rig 24/7 Monitor

ALERT_LOG="/home/vera-live-0-1/hedera-llm-api/logs/alerts.log"
mkdir -p "$(dirname "$ALERT_LOG")"

alert() {
  echo "[$(date)] 🚨 $1" | tee -a "$ALERT_LOG"
}

# Check disk
DISK=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
[ "$DISK" -gt 90 ] && alert "Disk at ${DISK}% - running auto-archive" && \
  /home/vera-live-0-1/hedera-llm-api/auto-archive.sh

# Check memory
MEM=$(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}')
[ "$MEM" -gt 90 ] && alert "Memory at ${MEM}%"

# Check Vera
pgrep -f "node.*PORT=8088" > /dev/null || \
  alert "Vera down - restarting" && /home/vera-live-0-1/hedera-llm-api/vera-self-heal.sh

# Check GPU
if command -v nvidia-smi &> /dev/null; then
  GPU_TEMP=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits | head -1)
  GPU_UTIL=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits | head -1)
  [ -n "$GPU_TEMP" ] && [ "$GPU_TEMP" -gt 85 ] && alert "GPU hot: ${GPU_TEMP}°C"
fi

# Check HCS topics heartbeat
curl -s --max-time 5 http://localhost:8088/api/health > /dev/null 2>&1 || \
  alert "Health endpoint unresponsive"
EOF

chmod +x /home/vera-live-0-1/hedera-llm-api/rig-monitor.sh
```

## Schedule (every minute)

```bash
// turbo
(crontab -l 2>/dev/null | grep -v rig-monitor; \
 echo "* * * * * /home/vera-live-0-1/hedera-llm-api/rig-monitor.sh") | crontab -
```

## Dashboard View

```bash
// turbo
# Real-time dashboard
watch -n 5 '/home/vera-live-0-1/hedera-llm-api/vera-status.sh'
```

## Alert History

```bash
tail -f /home/vera-live-0-1/hedera-llm-api/logs/alerts.log
```

## Slack/Webhook Alerts

```bash
# Add to rig-monitor.sh:
# curl -X POST $SLACK_WEBHOOK -d "{\"text\": \"$1\"}"
```
