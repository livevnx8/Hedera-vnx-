---
description: Auto-restart Vera and prevent crashes with self-healing
---

# Setup Self-Healing

Vera automatically recovers from crashes and disk-full events.

## Install

```bash
// turbo
chmod +x /home/vera-live-0-1/hedera-llm-api/vera-self-heal.sh
chmod +x /home/vera-live-0-1/hedera-llm-api/auto-archive.sh
```

## Schedule (every 2 minutes)

```bash
// turbo
# Self-heal check every 2 minutes
(crontab -l 2>/dev/null | grep -v self-heal; \
 echo "*/2 * * * * /home/vera-live-0-1/hedera-llm-api/vera-self-heal.sh >> /home/vera-live-0-1/hedera-llm-api/logs/self-heal.log 2>&1") | crontab -

# Daily archival at 3 AM
(crontab -l 2>/dev/null | grep -v auto-archive; \
 echo "0 3 * * * /home/vera-live-0-1/hedera-llm-api/auto-archive.sh >> /home/vera-live-0-1/hedera-llm-api/logs/archive.log 2>&1") | crontab -

crontab -l
```

## Systemd Service (Better)

```bash
# Create service
sudo tee /etc/systemd/system/vera.service > /dev/null << 'EOF'
[Unit]
Description=Vera Lattice AI System
After=network.target

[Service]
Type=simple
User=vera-live-0-1
WorkingDirectory=/home/vera-live-0-1/hedera-llm-api
Environment="PORT=8088"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10
StandardOutput=append:/home/vera-live-0-1/hedera-llm-api/logs/vera.log
StandardError=append:/home/vera-live-0-1/hedera-llm-api/logs/vera-error.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable vera
sudo systemctl start vera
```

## Status Check

```bash
// turbo
# Check all health
tail /home/vera-live-0-1/hedera-llm-api/logs/self-heal.log
systemctl status vera 2>/dev/null || pgrep -af "node.*PORT=8088"
```

## Manual Trigger

```bash
// turbo
# Run self-heal now
/home/vera-live-0-1/hedera-llm-api/vera-self-heal.sh
```
