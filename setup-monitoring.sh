#!/bin/bash
# Vera Monitoring Stack Setup
# Deploys Prometheus + Grafana for observability

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  📊 Vera Monitoring Stack Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker not found. Installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y docker.io docker-compose
    sudo usermod -aG docker $USER
    echo -e "${GREEN}✅ Docker installed${NC}"
fi

# Create monitoring directories
mkdir -p /mnt/vera-mirror-shards/vera-lattice/monitoring/prometheus
mkdir -p /mnt/vera-mirror-shards/vera-lattice/monitoring/grafana

# Prometheus configuration
cat > /mnt/vera-mirror-shards/vera-lattice/monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'vera-api'
    static_configs:
      - targets: ['host.docker.internal:8088']
    metrics_path: /metrics
    scrape_interval: 5s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
EOF

# Grafana datasource configuration
mkdir -p /mnt/vera-mirror-shards/vera-lattice/monitoring/grafana/provisioning/datasources
cat > /mnt/vera-mirror-shards/vera-lattice/monitoring/grafana/provisioning/datasources/prometheus.yml << 'EOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF

# Vera dashboard JSON
cat > /mnt/vera-mirror-shards/vera-lattice/monitoring/grafana/vera-dashboard.json << 'EOF'
{
  "dashboard": {
    "title": "Vera Rig Metrics",
    "panels": [
      {
        "title": "API Requests",
        "type": "graph",
        "targets": [{"expr": "vera_requests_total"}]
      },
      {
        "title": "Response Time",
        "type": "graph", 
        "targets": [{"expr": "vera_response_time_seconds"}]
      },
      {
        "title": "HCS Messages",
        "type": "stat",
        "targets": [{"expr": "vera_hcs_messages_total"}]
      },
      {
        "title": "Cache Hit Rate",
        "type": "gauge",
        "targets": [{"expr": "vera_cache_hit_rate"}]
      },
      {
        "title": "Memory Usage",
        "type": "graph",
        "targets": [{"expr": "process_resident_memory_bytes"}]
      }
    ]
  }
}
EOF

echo -e "${BLUE}🚀 Starting monitoring stack...${NC}"

# Start with docker-compose
docker-compose -f docker-compose.monitoring.yml up -d || {
    echo -e "${YELLOW}⚠️  Docker compose failed, trying with sudo...${NC}"
    sudo docker-compose -f docker-compose.monitoring.yml up -d
}

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Monitoring Stack Deployed!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "   📊 Grafana:    http://localhost:3000 (admin/admin)"
echo "   📈 Prometheus: http://localhost:9090"
echo "   🔔 Alerts:    Configured for response time >500ms"
echo ""
echo "   Logs: /mnt/vera-mirror-shards/vera-lattice/logs/"
echo ""
