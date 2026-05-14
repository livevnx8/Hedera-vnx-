---
description: Security hardening for Vera lattice
---

# Harden Security

Secure Vera's lattice for production.

## Quick Security Check

```bash
// turbo
./security-audit.sh
```

## 1. Enable Authentication

```bash
// turbo
# Configure JWT
export JWT_SECRET=$(openssl rand -hex 32)
export JWT_EXPIRY=3600

# Enable auth middleware
curl -X POST http://localhost:8088/api/auth/configure \
  -d '{"enabled": true, "requireAuth": true}'
```

## 2. Configure Rate Limiting

```bash
// turbo
# Set limits
curl -X POST http://localhost:8088/api/config/ratelimit \
  -d '{
    "requestsPerMinute": 100,
    "burst": 20,
    "perIP": true
  }'
```

## 3. Enable Audit Logging

```bash
// turbo
# All actions logged to HCS
node -e "
import { auditLogger } from './src/vera/security/auditLogger.js';
auditLogger.enable({
  hcsTopic: process.env.COMPLIANCE_AUDIT_TOPIC,
  logLevel: 'all'
});
"
```

## 4. Secure HCS Topics

```bash
// turbo
# Add submit keys
node secure-topics.mjs --add-submit-keys

# Verify
curl http://localhost:8088/api/vera/hcs/topics/security
```

## 5. API Key Management

```bash
// turbo
# Generate API key
curl -X POST http://localhost:8088/api/admin/apikeys \
  -d '{"name": "production", "scopes": ["read", "write"]}'

# List keys
curl http://localhost:8088/api/admin/apikeys
```

## 6. SSL/TLS Configuration

```bash
// turbo
# Enable HTTPS
export SSL_CERT=/etc/ssl/certs/vera.crt
export SSL_KEY=/etc/ssl/private/vera.key
export HTTPS_PORT=8443

# Restart
sudo systemctl restart vera
```

## 7. IP Whitelisting

```bash
// turbo
curl -X POST http://localhost:8088/api/config/whitelist \
  -d '{"ips": ["10.0.0.0/8", "192.168.1.0/24"]}'
```

## Security Checklist

- [ ] JWT authentication enabled
- [ ] Rate limiting active
- [ ] Audit logging on
- [ ] HTTPS only
- [ ] API keys rotated
- [ ] IP whitelist configured
- [ ] HCS topics secured
- [ ] Secrets in environment (not code)

## Penetration Testing

```bash
// turbo
# Run security scan
npm run security:scan

# Check dependencies
npm audit

# Static analysis
npm run lint:security
```
