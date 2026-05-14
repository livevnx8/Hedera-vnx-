---
description: Setup and manage SSL/TLS certificates
---

# Setup SSL Certificates

Secure HTTPS for Vera lattice.

## Quick Let's Encrypt

```bash
// turbo
# Install certbot
sudo apt install -y certbot

# Obtain certificate
sudo certbot certonly --standalone -d api.vera.network -d www.vera.network

# Auto-renewal test
sudo certbot renew --dry-run
```

## Wildcard Certificate

```bash
// turbo
# Wildcard for all subdomains
sudo certbot certonly \
  --dns-route53 \
  -d vera.network \
  -d *.vera.network
```

## Certificate Renewal

```bash
// turbo
# Setup cron for auto-renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -

# Or systemd timer
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

## Self-Signed (Dev)

```bash
// turbo
# Development certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout dev.vera.network.key \
  -out dev.vera.network.crt \
  -subj "/CN=dev.vera.network"

# Trust on local machine
sudo cp dev.vera.network.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

## Certificate Monitoring

```bash
// turbo
# Check expiration
curl http://localhost:8088/api/ssl/check | jq '.{
  domain: .domain,
  daysUntilExpiry: .daysRemaining,
  issuer: .issuer
}'

# Alert on <30 days
node -e "
import { sslMonitor } from './src/monitoring/sslMonitor.js';
await sslMonitor.configure({
  alertDays: 30,
  webhook: 'https://hooks.slack.com/...'
});
"
```

## HSTS & Security Headers

```bash
// turbo
# Nginx security headers
cat > /etc/nginx/conf.d/security-headers.conf << 'EOF'
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
EOF
```
