# Prediction Infrastructure

The Vera OS prediction layer serves Hedera token direction forecasts through both FastAPI and the public Python `PredictionService` facade.

## Python Usage

```python
from vera_os import PredictionService

service = PredictionService()
print(service.available_tokens())
print(service.health())
```

`PredictionService` wraps the production prediction engine and keeps the public import path stable while preserving the existing model-loading behavior.

## API Usage

The FastAPI surface lives in `prediction_server_v3.py`.

| Endpoint | Purpose |
| --- | --- |
| `/predict/{token}` | Fetch live token features and return a direction prediction |
| `/tokens` | List loaded token models |
| `/health` | Return prediction engine health |
| `/metrics` | Export Prometheus metrics |
| `/analytics/*` | Market and token analytics |
| `/features/*` | Feature importance, drift, and engineering data |

## Production Support

The infrastructure stack provides PostgreSQL, Redis, Redis exporter, Prometheus, Grafana, Loki, Promtail, Jaeger, Alertmanager, Traefik, Node Exporter, and backups. Prometheus scrapes API metrics, Redis exporter metrics, infrastructure metrics, and alert state.

Run:

```bash
python3 tests/validate_infrastructure.py
docker compose -f docker-compose.production.yml config
```

before launching or publishing a production release.
