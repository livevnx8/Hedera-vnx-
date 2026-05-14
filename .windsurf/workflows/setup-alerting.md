---
description: Slack/Discord webhook alerts for critical rig events
---

# Setup Alerting

Real-time webhook alerts for crashes, disk full, GPU overheating.

## Configure Webhooks

```bash
// turbo
cat >> /home/vera-live-0-1/hedera-llm-api/.env << 'EOF'

# Alert webhooks
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
DISCORD_WEBHOOK=https://discord.com/api/webhooks/YOUR/WEBHOOK
ALERT_EMAIL=ops@vera.network
EOF
```

## Alert Script

```bash
// turbo
cat > /home/vera-live-0-1/hedera-llm-api/send-alert.sh << 'EOF'
#!/bin/bash
# Usage: ./send-alert.sh "CRITICAL" "Disk at 98%"

SEVERITY="$1"
MESSAGE="$2"
HOSTNAME=$(hostname)

source /home/vera-live-0-1/hedera-llm-api/.env

PAYLOAD="{\"text\":\"🚨 [${SEVERITY}] ${HOSTNAME}: ${MESSAGE}\"}"

if [ -n "$SLACK_WEBHOOK" ]; then
  curl -s -X POST -H 'Content-type: application/json' \
    --data "$PAYLOAD" "$SLACK_WEBHOOK" > /dev/null
fi

if [ -n "$DISCORD_WEBHOOK" ]; then
  curl -s -X POST -H 'Content-type: application/json' \
    --data "$PAYLOAD" "$DISCORD_WEBHOOK" > /dev/null
fi

echo "[$(date)] [${SEVERITY}] ${MESSAGE}" >> /home/vera-live-0-1/hedera-llm-api/logs/alerts.log
EOF

chmod +x /home/vera-live-0-1/hedera-llm-api/send-alert.sh
```

## Wire to Monitor

```bash
# Update rig-monitor.sh to call send-alert.sh on issues
sed -i 's|tee -a "$ALERT_LOG"|tee -a "$ALERT_LOG"; /home/vera-live-0-1/hedera-llm-api/send-alert.sh "WARNING"|' \
  /home/vera-live-0-1/hedera-llm-api/rig-monitor.sh
```

## Test

```bash
// turbo
/home/vera-live-0-1/hedera-llm-api/send-alert.sh "TEST" "Alerting system online 🌸"
```

## Alert Rules

| Condition | Severity | Channel |
|-----------|----------|---------|
| Disk > 90% | WARNING | Slack |
| Disk > 95% | CRITICAL | Slack + Discord |
| Vera crashed | CRITICAL | All |
| GPU > 85°C | WARNING | Slack |
| HCS topic silent > 10min | WARNING | Discord |
