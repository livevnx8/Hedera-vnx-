# VNX — Hedera Sovereign AI Marketplace

![VNX](docs/visuals/vnx-performance-comparison-png.png)

**VNX** is a sovereign AI marketplace built on Hedera that makes AI workflows verifiable, auditable, and settlement-ready.

## 🎯 Tested & Verified Capabilities

Based on real test data from benchmark testing:

- **Verifiable AI**: Every decision backed by cryptographic proofs on Hedera HCS
- **54% Faster**: 0.55s response time vs 1.2s for ChatGPT (tested)
- **26x Scalability**: 4,304 ops/sec at 25 concurrent users (tested)
- **67% Overall Accuracy**: Pattern analysis 100%, network metrics 67%, prediction 33% (tested)
- **<5KB Models**: 60-vertex lattice artifact under 5KB vs GB-scale competitors (tested)
- **Live Hedera Data**: Real-time network integration

## 📊 Professional Documentation & Visual Assets

### Comprehensive Overview
- **[VNX Professional Overview](VNX_PROFESSIONAL_OVERVIEW.md)** - Complete documentation covering:
  - What VNX is and how it works
  - Competitive analysis vs ChatGPT, Claude, Gemini
  - Tested performance metrics and benchmarks
  - Why Hedera is the safest place to develop

### Visual Assets Gallery
All charts are available in both **PNG (300 DPI)** and **SVG** formats in `docs/visuals/`:

| Chart | Description | Data Source |
|-------|-------------|-------------|
| ![Performance Comparison](docs/visuals/vnx-performance-comparison-png.png) | VNX vs competitors response time | vera-vs-ai-benchmark-report.json |
| ![Scalability](docs/visuals/vnx-scalability-visualization-png.png) | 26x performance multiplier | vera-vs-ai-benchmark-report.json |
| ![Accuracy Metrics](docs/visuals/vnx-accuracy-metrics-png.png) | Real test accuracy breakdown | vera-vs-ai-benchmark-report.json |
| ![Model Size](docs/visuals/vnx-model-size-comparison-png.png) | <5KB vs GB-scale competitors | vnxLmCore.test.ts |
| ![Architecture](docs/visuals/vnx-architecture-diagram-png.png) | Verifiable marketplace loop | Architectural design |
| ![Verifiability](docs/visuals/vnx-verifiability-diagram-png.png) | Hedera-backed proof chains | Architectural design |
| ![Competitive Advantages](docs/visuals/vnx-competitive-advantage-grid-png.png) | 6 unique advantages | Architectural design |
| ![Research Timeline](docs/visuals/vnx-research-timeline-png.png) | Key achievement milestones | Project history |

**Note**: Sustainability and edge performance charts are design targets requiring testing to verify.

## 🔄 The Marketplace Loop

The flagship loop is:

```text
post task -> agents bid -> winner executes -> result verified -> payment settles -> reputation updates -> HCS proof emitted
```

The repository also contains research and prototype subsystems for model inference, confidential execution, swarm coordination, agent routing, dashboards, and advanced Hedera tooling. Treat those as supporting or experimental surfaces unless they are tied back to the marketplace loop with tests, runnable endpoints, and observable proof.

## Status

- The TypeScript build is expected to pass with `npm run build`.
- The focused marketplace/orchestrator suites cover pricing, reputation, escrow, settlement, task publishing, topic management, feature flags, event streaming, and scheduled execution governance.
- Production claims should follow the bar in `VNX_PRODUCT_PATH.md`: tests, runnable surface, observable proof, and operator rollback/failure instructions.
- Live Hedera operations require funded credentials and should be run deliberately against testnet before any mainnet promotion.
- Legacy Vera research and experimental documentation has been consolidated under `legacy/vera/`; this repo’s active public product narrative is VNX.

## Core Capabilities

- **Task marketplace**: task posting, bid intake, winner selection, execution state.
- **Verification**: result schema validation, proof hash, verifier outcome.
- **Settlement**: micropayment/HBAR payment, escrow/release, fee accounting.
- **Reputation**: outcome-based agent score updates.
- **Audit trail**: HCS event emission and lookup for marketplace events.
- **Governance**: scheduled execution for threshold-approved state changes.
- **Dashboards and realtime APIs**: proof, health, rig state, and marketplace visibility.

## VNX Product Summary

VNX is the production-facing sovereign AI marketplace on Hedera. The focus is on a clean, verifiable marketplace loop that delivers:

- clear marketplace outcomes for tasks, bids, awards, execution results, and settlements
- verifiable proof backed by Hedera HCS and mirror-node evidence
- operator-visible reputation and payment reconciliation
- a stable, product-ready route surface for the marketplace/orchestrator

Note: the current codebase still retains legacy internal route and config names such as `/api/vera` and `VERA_*`. These are implementation details; public-facing documentation and branding should use VNX.

Legacy research and historical design work has been archived under `legacy/vera/`. The active product documentation for VNX is:
- `docs/vnx-product-overview.md`
- `VNX_PRODUCT_PATH.md`
- `docs/github-branching-labels.md`
- `docs/vnx-legacy-archive.md`

Read the product overview for the current product boundary and route surface:
- `docs/vnx-product-overview.md`

## 🏗️ Architecture

```
┌─────────────────┐    ┌───────────────────────────┐    ┌─────────────────┐
│   Nginx         │    │   Marketplace API Server   │    │   Inference     │
│   (Load Balancer)│────│   (Fastify / Node.js)      │────│   Service       │
│   Port: 80/443  │    │   Port: 8080              │    │   (GPU-backed)  │
└─────────────────┘    └───────────────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SSL/TLS       │    │   Redis Cache   │    │   GPU Memory    │
│   Rate Limiting │    │   Port: 6379    │    │   Model Storage  │
│   Compression   │    │   Session Store │    │   CUDA Support  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Docker** & **Docker Compose**
- **Node.js** 18+ (for development)
- **Hedera Operator Account** with HBAR

### 1. Use this checkout
```bash
cd hedera-llm-api
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env.production

# Edit configuration
nano .env.production
```

### 3. Deploy
```bash
# Production-style deployment
./scripts/deploy.sh production

# Development deployment
./scripts/deploy.sh development
```

### 4. Verify Deployment
```bash
# Check service status
docker-compose ps

# View logs (internal compose service retains its current name)
docker-compose logs -f vera-app

# Health check (public VNX API surface)
curl http://localhost:8080/api/vnx/health

# Legacy Vera API surface (still available for compatibility)
curl http://localhost:8080/api/vera/health
```

## 🔧 Configuration

### Environment Variables

| Category | Variable | Description | Required |
|----------|----------|-------------|----------|
| **AI Model** | `MODEL_PROVIDER` | Model provider configuration | ✅ |
| | `MODEL_URL` | Model server URL | ✅ |
| | `MODEL_API_KEY` | Model API key | ✅ |
| **Hedera** | `HEDERA_NETWORK` | `mainnet`/`testnet` | ✅ |
| | `HEDERA_OPERATOR_ACCOUNT_ID` | Operator account | ✅ |
| | `HEDERA_OPERATOR_PRIVATE_KEY` | Private key | ✅ |
| **Database** | `DATABASE_PATH` | SQLite path | ✅ |
| **Monitoring** | `PROMETHEUS_ENABLED` | Enable metrics | ❌ |
| | `GRAFANA_PASSWORD` | Grafana admin password | ❌ |

### Rate Limiting

| Endpoint | Limit | Burst |
|----------|-------|-------|
| General API | 10 req/s | 20 |
| Chat API | 2 req/s | 5 |
| Wallet Ops | 0.17 req/s | 1 |
| Heavy Ops | 0.03 req/s | 1 |

## 📊 Monitoring

### Grafana Dashboards

- **System Overview**: CPU, Memory, GPU usage
- **API Metrics**: Request rates, error rates, latency
- **Hedera Operations**: Transaction success rates, tool usage
- **User Analytics**: Active sessions, feature usage

Access: `http://localhost:3000` (admin/GRAFANA_PASSWORD)

### Prometheus Metrics

Key metrics:
- `http_requests_total` - API request count
- `tool_executions_total` - Tool usage count
- `wallet_operations_total` - Wallet operation count
- `active_sessions` - Active user sessions
- `gpu_memory_usage` - GPU memory utilization

Access: `http://localhost:9090`

## 🛠️ Development

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Code Structure
```
src/
├── agent/           # AI agent logic
├── cache/           # Caching system
├── hedera/          # Hedera integrations
├── middleware/      # Rate limiting, auth
├── monitoring/      # Metrics, logging
├── routes/          # API routes
└── tests/           # Test suites
```

### Adding New Tools

1. **Define Tool** in `src/agent/definitions.ts`
2. **Implement Logic** in `src/agent/executor.ts`
3. **Add Tests** in `src/tests/`
4. **Update Categories** in `src/agent/toolManager.ts`

## 🔒 Security

### Production Security
- **SSL/TLS**: Automatic HTTPS with Let's Encrypt
- **Rate Limiting**: Multi-tier rate limiting
- **CORS**: Configurable origin restrictions
- **Headers**: Security headers (HSTS, XSS protection)
- **Authentication**: JWT-based auth (optional)

### API Security
- **Input Validation**: All inputs sanitized
- **SQL Injection**: Parameterized queries
- **XSS Protection**: Output encoding
- **CSRF Protection**: Token validation

## 📈 Performance

### Optimization Features
- **Caching**: Multi-layer caching (Redis, memory)
- **Compression**: Gzip compression
- **Connection Pooling**: Database connection reuse
- **GPU Memory Management**: Dynamic memory allocation
- **Tool Streaming**: Load tools on-demand

### Benchmarks
- **Response Time**: <2s for chat responses
- **Throughput**: 100+ concurrent users
- **Memory Usage**: <8GB GPU memory
- **Uptime**: 99.9% availability target

## 🚨 Troubleshooting

### Common Issues

#### Model Memory Issues
```bash
# Check GPU memory
nvidia-smi

# Reduce context size
MODEL_MAX_TOKENS=256
NATIVE_CONTEXT_SIZE=1024
```

#### Service Health
```bash
# Check all services
docker-compose ps

# Restart specific service
docker-compose restart vera-app

# View detailed logs
docker-compose logs -f vera-app
```

#### Performance Issues
```bash
# Check cache hit rates
curl http://localhost:8080/metrics | grep cache

# Monitor GPU usage
nvidia-smi -l 1

# Check rate limits
curl http://localhost:8080/admin/rate-limits
```

## 📚 API Documentation

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/chat/agent` | Chat with AI assistant |
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |
| POST | `/v1/wallet/connect` | Connect wallet |
| GET | `/wallet/overview` | Wallet overview |

### Tool Examples

```bash
# Create account
curl -X POST http://localhost:8080/v1/chat/agent \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Create a new Hedera account"}],"enable_tools":true}'

# Verify account
curl -X POST http://localhost:8080/v1/chat/agent \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Verify account 0.0.123456"}],"enable_tools":true}'
```

## 🤝 Contributing

1. Create a focused branch for the change.
2. Keep new production claims tied to the flagship marketplace loop.
3. Run `npm run build` and `npm test` before promotion.
4. Update `VNX_PRODUCT_PATH.md` when a change alters the product path or readiness bar.

### Development Guidelines
- **Code Style**: TypeScript-first, following local Fastify and module patterns.
- **Tests**: Vitest coverage for happy paths and important failure modes.
- **Documentation**: Label features as production, prototype, demo, research, or planned.
- **Security**: Keep mainnet operations gated and auditable.

### GitHub Branching and Label Policy
- `main` — production-ready code only.
- `feature/vnx-marketplace/*` — core marketplace/orchestrator product work.
- `feature/experimental-research/*` — research, prototype, or model experimentation work.
- `chore/branding/*`, `chore/docs/*`, `chore/cleanup/*` — non-feature maintenance work.

Labels:
- `core/product` — stable product work aligned to the flagship VNX marketplace loop.
- `research/experimental` — prototype or research subsystems that support but do not define the core product.
- `branding` — identity, public-facing naming, and documentation updates.
- `docs` — documentation or runbook changes.
- `cleanup` — refactor, technical debt, or code hygiene updates.

Keep new product claims tied to `VNX_PRODUCT_PATH.md` and the `/api/vera` marketplace/orchestrator surface. Research routes and experimental models should be treated as separate, lower-stability work until they are explicitly promoted to the core product path.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

Use the local docs in `docs/`, the deployment runbooks, and `VNX_PRODUCT_PATH.md` as the current source of truth.
