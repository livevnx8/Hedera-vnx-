# Vera OS Release Notes

## 0.2.0 - Hedera Infrastructure Release Candidate

Vera OS 0.2.0 presents the working Hedera prediction infrastructure as a
professional public release.

### Highlights

- Public `vera_os` Python facade with prediction, health, specialist swarm, and visual asset helpers.
- FastAPI prediction server with Prometheus metrics.
- 27-specialist Hedera swarm wrapper.
- 13-service production Docker Compose stack.
- PostgreSQL schema and Alembic migration parity.
- Redis, circuit breaker, deep health, and zero-dependency Prometheus metrics modules.
- Grafana, Prometheus, Loki, Promtail, Jaeger, Alertmanager, Redis exporter, and Node Exporter configs.
- GitHub-ready README, supporting docs, and professional PNG/SVG visual gallery.
- Release validator, infrastructure validator, and smoke test suite.

### Release Discipline

- Heavy model artifacts are not committed by default.
- `.env` and `.env.production` remain ignored.
- `.env.example` is safe to publish as a template.
- The release branch should stage only the curated Vera OS allowlist.
