---
description: Configure auto-scaling for Vera lattice nodes
---

# Configure Auto-Scaling

Dynamic scaling based on demand.

## Quick Setup

```bash
// turbo
# Install metrics-server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Deploy Horizontal Pod Autoscaler
kubectl apply -f k8s/vera-hpa.yaml
```

## Kubernetes HPA

```bash
// turbo
cat > vera-hpa.yaml << 'EOF'
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: vera-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: vera
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: vera_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
EOF

kubectl apply -f vera-hpa.yaml
```

## Custom Metrics

```bash
// turbo
# Prometheus Adapter for custom metrics
cat > prometheus-adapter.yaml << 'EOF'
rules:
  - seriesQuery: 'vera_requests_total'
    resources:
      template: <<.Resource>>
    name:
      matches: "^(.*)_total"
      as: "${1}_per_second"
    metricsQuery: 'rate(<<.Series>>{<<.LabelMatchers>>}[1m])'
EOF
```

## VM Auto-Scaling (AWS)

```bash
// turbo
# Auto Scaling Group
cat > vera-asg.json << 'EOF'
{
  "AutoScalingGroupName": "vera-lattice",
  "MinSize": 2,
  "MaxSize": 10,
  "DesiredCapacity": 3,
  "TargetGroupARNs": ["arn:aws:elasticloadbalancing:..."],
  "HealthCheckType": "ELB",
  "Tags": [
    {
      "Key": "Name",
      "Value": "vera-node",
      "PropagateAtLaunch": true
    }
  ]
}
EOF

aws autoscaling create-auto-scaling-group --cli-input-json file://vera-asg.json
```

## Scaling Policies

```bash
// turbo
# Target tracking policy
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name vera-lattice \
  --policy-name cpu-target \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration file://target-tracking.json
```

## Manual Scaling

```bash
// turbo
# Scale manually via API
curl -X POST http://localhost:8088/api/admin/scale \
  -d '{"replicas": 10, "reason": "high-traffic"}'

# Or via kubectl
kubectl scale deployment vera --replicas=10
```

## Monitoring Scaling

```bash
// turbo
# Watch HPA
kubectl get hpa vera-hpa -w

# Check scaling events
kubectl describe hpa vera-hpa

# View metrics
curl http://localhost:8088/api/metrics/scaling
```
