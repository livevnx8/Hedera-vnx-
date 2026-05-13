# Vera OS Overview

Vera OS is **Verifiable prediction infrastructure for Hedera-native AI agents**.

It brings the existing Hedera token prediction engine, VNX swarm work, 27 Hedera micro-specialists, health checks, cache, resilience layer, metrics, monitoring, and production Docker stack under one professional public surface.

## Public Shape

Vera OS has four main entry points:

- `vera_os.PredictionService` for local Python prediction workflows.
- `vera_os.HederaSpecialistSwarm` for Hedera agent status, execution, and alerts.
- `vera_os.HealthService` for deep health reports across API, database, Redis, Hedera, cache, and swarms.
- `vera_os.get_visual_assets()` for the professional PNG/SVG visual inventory.

## Who It Serves

Developers can import the package and run examples without learning every legacy module. Operators can use Docker Compose, Prometheus, Grafana, Loki, Jaeger, Alertmanager, and validators to run production-style infrastructure. Reviewers can verify docs, visuals, examples, migrations, alerts, and service wiring with repeatable scripts.

## Readiness Model

Vera OS separates checked capabilities from future claims:

- Working code is exposed through the FastAPI app and `vera_os` facade.
- Production wiring is validated through `tests/validate_infrastructure.py`.
- Public release quality is validated through `tests/validate_vera_os_release.py`.
- Visual assets are checked for PNG/SVG presence, readability, and README link integrity.
