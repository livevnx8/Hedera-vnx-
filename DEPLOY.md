# VeraLattice Deployment Guide

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/veralattice/veralattice.git
cd veralattice
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings

# 3. Build and test
npm run build
npm test

# 4. Start the server
npm start
```

## Environment Configuration

Required variables in `.env`:

```
# Hedera
HEDERA_NETWORK=mainnet
HEDERA_OPERATOR_ACCOUNT_ID=0.0.xxx
HEDERA_OPERATOR_PRIVATE_KEY=xxx

# Topics (auto-created if not set)
VERA_REGISTRY_TOPIC_ID=
VERA_TASK_TOPIC_ID=
VERA_RESULT_TOPIC_ID=
VERA_AUDIT_TOPIC_ID=

# x402 Payments (optional)
X402_BASE_URL=
X402_API_KEY=
X402_FACILITATOR_ACCOUNT=0.0.xxx

# LLM Provider
MODEL_PROVIDER=openai
OPENAI_API_KEY=sk-xxx

# Optional: Redis
REDIS_URL=redis://localhost:6379
```

## Docker Deployment

```bash
# Build image
docker build -t veralattice .

# Run container
docker run -d \
  --name veralattice \
  -p 8080:8080 \
  --env-file .env \
  veralattice
```

## Docker Compose (Full Stack)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f vera-app
```

Services included:
- `vera-app` - Main API server
- `qvx-server` - LLM inference
- `redis` - Caching & rate limiting
- `nginx` - Load balancer
- `prometheus` - Metrics
- `grafana` - Dashboards

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure strong API key rate limits
- [ ] Enable audit logging
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure backup for SQLite database
- [ ] Set up SSL/TLS certificates
- [ ] Configure firewall rules
- [ ] Test disaster recovery

## Monitoring

Health check endpoint:
```bash
curl https://api.veralattice.com/api/vera/health
```

Prometheus metrics:
```bash
curl http://localhost:9090/metrics
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Run `npm run build` and check errors |
| HCS connection | Verify topic IDs and operator keys |
| Redis errors | Check `REDIS_URL` or disable Redis |
| Rate limiting | Increase limits in admin panel |

## Support

- Docs: https://docs.veralattice.com
- GitHub: https://github.com/veralattice/veralattice
- Email: support@veralattice.com
