---
description: Setup comprehensive observability with Prometheus, Grafana, and Jaeger
---

# Setup Observability

Full observability stack for Vera lattice.

## Quick Start

```bash
// turbo
# Start observability stack
docker-compose -f observability.yml up -d
```

## 1. Prometheus Setup

```bash
// turbo
cat > prometheus.yml << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'vera'
    static_configs:
      - targets: ['localhost:8088']
    metrics_path: /metrics
  
  - job_name: 'vera-gpu'
    static_configs:
      - targets: ['localhost:9091']
EOF

# Start Prometheus
docker run -d -p 9090:9090 -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml prom/prometheus
```

## 2. Grafana Setup

```bash
// turbo
# Start Grafana
docker run -d -p 3000:3000 -e GF_SECURITY_ADMIN_PASSWORD=admin grafana/grafana

# Import Vera dashboards
curl -X POST http://admin:admin@localhost:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @dashboards/vera-overview.json
```

## 3. Jaeger Tracing

```bash
// turbo
# Start Jaeger
docker run -d -p 16686:16686 -p 14268:14268 jaegertracing/all-in-one

# Configure Vera
export JAEGER_ENDPOINT=http://localhost:14268/api/traces
export VERA_TRACING_ENABLED=true
```

## 4. Loki Logging

```bash
// turbo
# Start Loki
docker run -d -p 3100:3100 -v $(pwd)/loki.yml:/etc/loki/local-config.yaml grafana/loki

# Configure promtail
cat > promtail.yml << 'EOF'
server:
  http_listen_port: 9080
positions:
  filename: /tmp/positions.yaml
clients:
  - url: http://localhost:3100/loki/api/v1/push
scrape_configs:
  - job_name: vera
    static_configs:
      - targets:
          - localhost
        labels:
          job: vera
          __path__: /var/log/vera/*.log
EOF
```

## 5. Alertmanager

```bash
// turbo
cat > alertmanager.yml << 'EOF'
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@vera.network'

route:
  receiver: 'default'

receivers:
  - name: 'default'
    slack_configs:
      - api_url: 'https://hooks.slack.com/...'
        channel: '#alerts'
EOF
```

## Access Dashboards

| Service | URL | Default Login |
|---------|-----|---------------|
| Prometheus | http://localhost:9090 | - |
| Grafana | http://localhost:3000 | admin/admin |
| Jaeger | http://localhost:16686 | - |

## Vera Metrics Available

- `vera_requests_total` - Request count
- `vera_request_duration_seconds` - Latency
- `vera_gpu_utilization` - GPU usage
- `vera_cache_hit_ratio` - Cache performance
- `vera_hcs_messages_sent` - HCS throughput
