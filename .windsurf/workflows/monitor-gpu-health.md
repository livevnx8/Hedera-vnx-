---
description: Monitor GPU health and performance in real-time
---

# Monitor GPU Health

Real-time monitoring of NVIDIA GPUs in Vera lattice.

## Quick Status

```bash
// turbo
# Current GPU status
curl http://localhost:8088/api/gpu/health | jq .

# Or CLI
./vera-status.sh --gpu
```

## 1. GPU Metrics Dashboard

```bash
// turbo
# Launch GPU dashboard
npm run gpu-dashboard

# Access at http://localhost:3001/gpu
```

## 2. Prometheus GPU Metrics

```bash
// turbo
# GPU exporter config
cat > gpu-metrics.yml << 'EOF'
metrics:
  - name: gpu_temperature
    query: nvidia_gpu_temperature
    threshold: 85
  - name: gpu_utilization
    query: nvidia_gpu_utilization
    threshold: 95
  - name: gpu_memory_used
    query: nvidia_gpu_memory_used_bytes
    threshold: 0.95
  - name: gpu_power_draw
    query: nvidia_gpu_power_draw
    threshold: 350
EOF

# Load in Prometheus
curl -X POST http://localhost:9090/-/reload
```

## 3. Critical Alerts

```bash
// turbo
# High temperature alert
curl -X POST http://localhost:8088/api/alerts/configure \
  -d '{
    "name": "gpu_high_temp",
    "condition": "gpu_temperature > 85",
    "severity": "critical",
    "channels": ["slack", "pagerduty"]
  }'

# Memory leak detection
curl -X POST http://localhost:8088/api/alerts/configure \
  -d '{
    "name": "gpu_memory_leak",
    "condition": "gpu_memory_growth_rate > 100MB/hour",
    "severity": "warning"
  }'

# ECC errors
curl -X POST http://localhost:8088/api/alerts/configure \
  -d '{
    "name": "gpu_ecc_error",
    "condition": "nvidia_ecc_error_count > 0",
    "severity": "critical"
  }'
```

## 4. Health Check Script

```bash
// turbo
# Automated health check
cat > check-gpu-health.sh << 'EOF'
#!/bin/bash
GPUS=$(nvidia-smi --query-gpu=index --format=csv,noheader)
FAILED=0

for GPU in $GPUS; do
  TEMP=$(nvidia-smi -i $GPU --query-gpu=temperature.gpu --format=csv,noheader)
  if [ $TEMP -gt 85 ]; then
    echo "WARNING: GPU $GPU temperature $TEMP°C"
    FAILED=1
  fi
  
  UTIL=$(nvidia-smi -i $GPU --query-gpu=utilization.gpu --format=csv,noheader)
  if [ $UTIL -lt 10 ]; then
    echo "INFO: GPU $GPU utilization low: $UTIL%"
  fi
done

if [ $FAILED -eq 1 ]; then
  curl -X POST http://localhost:8088/api/alerts/trigger \
    -d '{"type": "gpu_health", "severity": "warning"}'
fi
EOF
chmod +x check-gpu-health.sh

# Run every 5 minutes via cron
echo "*/5 * * * * /home/vera/check-gpu-health.sh" | crontab -
```

## 5. Historical Analysis

```bash
// turbo
# GPU performance trends
curl "http://localhost:8088/api/gpu/analytics?range=24h" | jq '.{
  avgTemperature: .temperature.mean,
  maxUtilization: .utilization.max,
  memoryEfficiency: .memory.efficiency,
  powerEfficiency: .power.joules_per_inference
}'

# Generate report
node generate-gpu-report.mjs --days 7 --output gpu-report.pdf
```

## 6. Predictive Maintenance

```bash
// turbo
# Predict GPU failures
node -e "
import { gpuPredictor } from './src/ai/gpuPredictor.js';
const predictions = await gpuPredictor.analyze({
  timeframe: '30d',
  metrics: ['temperature', 'power', 'ecc_errors', 'clocks']
});
console.log('Failure probability:', predictions.failureRisk);
console.log('Recommended action:', predictions.action);
"
```

## 7. Multi-GPU Health

```bash
// turbo
# Cluster-wide health
curl http://localhost:8088/api/gpu/cluster/health | jq '.{
  healthyNodes: .nodes | map(select(.status == "healthy")) | length,
  degradedNodes: .nodes | map(select(.status == "degraded")) | length,
  failedNodes: .nodes | map(select(.status == "failed")) | length
}'

# Individual GPU details
curl http://localhost:8088/api/gpu/0/health | jq .
```

## Automated Remediation

```bash
// turbo
# Enable auto-fix
export VERA_GPU_AUTOREMEDIATE=true

# Configure actions
cat > gpu-autoremediate.yml << 'EOF'
rules:
  - condition: gpu_temp > 90
    action: throttle_clocks
    params: { max_clock: 1200 }
  
  - condition: gpu_memory > 95%
    action: clear_cache
  
  - condition: gpu_ecc_error > 10
    action: evacuate_workload
    notify: admin
EOF
```

## Emergency Procedures

```bash
# GPU failure - immediate action
sudo nvidia-smi -i 0 -r  # Reset GPU 0

# Thermal emergency
sudo nvidia-smi -i 0 -pl 250  # Limit power to 250W

# Drain node for maintenance
curl -X POST http://localhost:8088/api/gpu/cluster/drain \
  -d '{"node": "gpu-node-2", "reason": "maintenance"}'
```

## Next Steps

- `/optimize-gpu-performance` - Fine-tune GPU settings
- `/setup-multi-gpu` - Scale across nodes
