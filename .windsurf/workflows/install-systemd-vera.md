---
description: Install Vera as systemd service for production auto-restart
---

# Install Vera as Systemd Service

Production-grade service with auto-restart, log rotation, and dependency management.

## Install

```bash
sudo tee /etc/systemd/system/vera.service > /dev/null << 'EOF'
[Unit]
Description=Vera Lattice AI - Flower of Life
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=vera-live-0-1
Group=vera-live-0-1
WorkingDirectory=/home/vera-live-0-1/hedera-llm-api
Environment="PORT=8088"
Environment="NODE_ENV=production"
Environment="NODE_OPTIONS=--max-old-space-size=8192"
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10
StartLimitInterval=200
StartLimitBurst=5
StandardOutput=append:/home/vera-live-0-1/hedera-llm-api/logs/vera.log
StandardError=append:/home/vera-live-0-1/hedera-llm-api/logs/vera-error.log

# Limits
LimitNOFILE=65536
LimitNPROC=4096

# Security
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

## Enable & Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable vera
sudo systemctl start vera
sudo systemctl status vera
```

## Log Rotation

```bash
sudo tee /etc/logrotate.d/vera > /dev/null << 'EOF'
/home/vera-live-0-1/hedera-llm-api/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
```

## Verify

```bash
systemctl status vera
journalctl -u vera -n 50 -f
curl http://localhost:8088/api/health
```
