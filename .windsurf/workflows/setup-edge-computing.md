---
description: Deploy Vera lattice to edge locations
---

# Setup Edge Computing

Deploy Vera to edge locations for low-latency inference.

## Quick Setup

```bash
// turbo
# Deploy edge nodes with K3s
curl -sfL https://get.k3s.io | sh -

# Or use microk8s
sudo snap install microk8s --classic
microk8s enable dns storage ingress
```

## Edge Architecture

```bash
// turbo
# Edge location config
cat > edge-config.yaml << 'EOF'
edge_locations:
  - name: us-west-edge
    region: us-west-1
    lat: 37.7749
    lon: -122.4194
    capacity: 10
    gpu: false
    
  - name: eu-central-edge
    region: eu-central-1
    lat: 50.1109
    lon: 8.6821
    capacity: 15
    gpu: true
    
  - name: ap-southeast-edge
    region: ap-southeast-1
    lat: 1.3521
    lon: 103.8198
    capacity: 8
    gpu: false
EOF

# Deploy edge coordinator
kubectl apply -f edge-coordinator.yaml
```

## Lightweight Edge Node

```bash
// turbo
# Minimal Vera edge deployment
cat > vera-edge.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vera-edge
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vera-edge
  template:
    spec:
      nodeSelector:
        node-type: edge
      containers:
        - name: vera
          image: vera/edge:latest
          resources:
            limits:
              cpu: "2"
              memory: "4Gi"
          env:
            - name: VERA_MODE
              value: "edge"
            - name: CENTRAL_COORDINATOR
              value: "https://api.vera.network"
          volumeMounts:
            - name: model-cache
              mountPath: /models
      volumes:
        - name: model-cache
          hostPath:
            path: /var/cache/vera/models
EOF

kubectl apply -f vera-edge.yaml
```

## Model Sync

```bash
// turbo
# Sync models to edge
node -e "
import { modelSync } from './src/edge/modelSync.js';
await modelSync.syncToEdge({
  models: ['vera-base', 'vera-fast'],
  locations: ['us-west-edge', 'eu-central-edge'],
  compression: true
});
"

# Verify sync
curl http://us-west-edge.local:8088/api/models/available | jq '.models'
```

## Geo-Routing

```bash
// turbo
# Route users to nearest edge
const getNearestEdge = (userLat, userLon) => {
  const edges = [
    { name: 'us-west', lat: 37.77, lon: -122.41 },
    { name: 'eu-central', lat: 50.11, lon: 8.68 },
    { name: 'ap-southeast', lat: 1.35, lon: 103.82 }
  ];
  
  return edges.reduce((closest, edge) => {
    const dist = haversine(userLat, userLon, edge.lat, edge.lon);
    return dist < closest.dist ? { ...edge, dist } : closest;
  });
};

// Cloudflare Workers or Lambda@Edge
export default {
  async fetch(request) {
    const country = request.headers.get('CF-IPCountry');
    const edge = getEdgeForCountry(country);
    return fetch(`https://${edge}.vera.network${request.url.pathname}`);
  }
};
```

## Offline Operation

```bash
// turbo
# Enable offline mode
export VERA_OFFLINE_MODE=true
export VERA_OFFLINE_CACHE_SIZE=10GB
export VERA_OFFLINE_MAX_DAYS=7

# Cache management
node -e "
import { offlineCache } from './src/edge/offlineCache.js';
await offlineCache.warmup([
  'common-queries',
  'agent-profiles',
  'lattice-topology'
]);
"
```

## Edge-to-Cloud Sync

```bash
// turbo
# Sync edge data back to central
cat > edge-sync.yaml << 'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: edge-data-sync
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: sync
              image: vera/edge-sync:latest
              command:
                - /bin/sh
                - -c
                - |
                  rsync -avz /var/lib/vera/data/ \
                    central@api.vera.network:/data/edge/$(hostname)/
          restartPolicy: OnFailure
EOF
```

## Edge Monitoring

```bash
// turbo
# Edge-specific metrics
curl http://edge-node:8088/api/edge/metrics | jq '.{
  latency: .avgResponseTime,
  cacheHitRate: .cache.efficiency,
  syncStatus: .lastSync.success,
  bandwidth: .network.usage
}'

# Alert on edge issues
curl -X POST http://localhost:8088/api/alerts/configure \
  -d '{
    "name": "edge_offline",
    "condition": "edge.heartbeat > 60s",
    "severity": "critical"
  }'
```
