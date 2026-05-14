---
description: Run chaos engineering experiments on Vera lattice
---

# Run Chaos Engineering

Test lattice resilience with controlled failures.

## Quick Experiment

```bash
// turbo
# Kill random pod
kubectl delete pod -l app=vera --grace-period=0 --force

# Verify recovery
curl http://localhost:8088/api/health
```

## Chaos Mesh Setup

```bash
// turbo
# Install Chaos Mesh
kubectl apply -f https://mirrors.chaos-mesh.org/latest/install.yaml

# Port forward dashboard
kubectl port-forward -n chaos-mesh svc/chaos-dashboard 2333:2333
```

## Network Chaos

```bash
// turbo
cat > network-delay.yaml << 'EOF'
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: vera-network-delay
spec:
  action: delay
  mode: all
  selector:
    namespaces:
      - default
    labelSelectors:
      app: vera
  duration: 5m
  delay:
    latency: 100ms
    jitter: 10ms
EOF

kubectl apply -f network-delay.yaml
```

## Pod Failure

```bash
// turbo
cat > pod-failure.yaml << 'EOF'
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: vera-pod-failure
spec:
  action: pod-failure
  mode: one
  duration: 10m
  selector:
    namespaces:
      - default
    labelSelectors:
      app: vera
EOF

kubectl apply -f pod-failure.yaml
```

## CPU/Memory Stress

```bash
// turbo
cat > stress.yaml << 'EOF'
apiVersion: chaos-mesh.org/v1alpha1
kind: StressChaos
metadata:
  name: vera-cpu-stress
spec:
  mode: all
  selector:
    namespaces:
      - default
    labelSelectors:
      app: vera
  stressors:
    cpu:
      workers: 4
      load: 80
  duration: 5m
EOF

kubectl apply -f stress.yaml
```

## Custom Chaos Script

```bash
// turbo
# Vera-specific chaos
node chaos-lattice.mjs \
  --scenario agent-disconnect \
  --duration 300 \
  --affected 20%

# Kill HCS connection temporarily
node chaos-lattice.mjs --scenario hcs-blackout --duration 60

# AI model failure
node chaos-lattice.mjs --scenario ai-model-failure --model vera-base
```

## Automated Chaos

```bash
// turbo
# Schedule weekly chaos
apiVersion: chaos-mesh.org/v1alpha1
kind: Schedule
metadata:
  name: weekly-chaos
spec:
  schedule: "0 2 * * 0"  # Sundays at 2 AM
  type: NetworkChaos
  networkChaos:
    action: delay
    mode: all
    duration: 5m
```

## Monitoring During Chaos

```bash
// turbo
# Watch metrics
curl http://localhost:8088/api/metrics/resilience | jq '.{
  availability: .uptimePercent,
  recoveryTime: .mttr,
  errorRate: .errorsPerMinute
}'

# Real-time status
curl http://localhost:8088/api/vera/lattice/state | jq '.nodes | map(select(.status == "degraded")) | length'
```

## Cleanup

```bash
// turbo
# Remove all chaos experiments
kubectl delete networkchaos --all
kubectl delete podchaos --all
kubectl delete stresschaos --all
```
