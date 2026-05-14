---
description: Scale Vera's lattice swarm horizontally for high throughput
---

# Scale Lattice Horizontally

Scale Vera's Flower of Life lattice across multiple nodes for high availability and throughput.

## Prerequisites

- Primary lattice node deployed
- Load balancer configured (optional)
- Shared storage accessible (NFS/S3)
- Redis cluster or sentinel setup

## Horizontal Scaling Architecture

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    │   (nginx/ALB)   │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
   │ Lattice │◄────────►│ Lattice │◄────────►│ Lattice │
   │ Node 1  │  HCS     │ Node 2  │  HCS     │ Node 3  │
   │ (US-East)│ Sync     │ (US-West)│ Sync     │ (EU-West)│
   └────┬────┘          └────┬────┘          └────┬────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Shared State   │
                    │  (Redis/Postgres│
                    │   /NFS/S3)      │
                    └─────────────────┘
```

## Scaling Steps

### 1. Prepare Shared State

```bash
// turbo
# Configure Redis cluster for state sharing
node -e "
import { stateSync } from './src/lattice/stateSync.js';

await stateSync.initialize({
  redis: {
    cluster: [
      { host: 'redis-1.internal', port: 6379 },
      { host: 'redis-2.internal', port: 6379 },
      { host: 'redis-3.internal', port: 6379 }
    ]
  },
  mode: 'distributed'
});

console.log('✅ Shared state initialized');
"
```

### 2. Configure HCS Topic Sharding

```bash
// turbo
# Enable HCS topic sharding for load distribution
node -e "
import { hcsTopicSharding } from './src/vera/orchestrator/hcsTopicSharding.js';

await hcsTopicSharding.configure({
  agentBeacon: {
    shards: 3,  // 3 parallel topic streams
    strategy: 'round-robin'
  },
  carbonRetirement: {
    shards: 5,  // More shards for high volume
    strategy: 'load-based'
  },
  paymentOrchestration: {
    shards: 2,
    strategy: 'priority-based'
  }
});

console.log('✅ HCS sharding configured');
"
```

### 3. Add Lattice Nodes

```bash
// turbo
# Deploy additional node (on new server)
ssh node-2.internal << 'EOF'
# Clone repository
git clone https://github.com/vera/hedera-llm-api.git
cd hedera-llm-api

# Install dependencies
npm install

# Copy config from primary node
scp node-1.internal:/etc/vera/vera.conf /etc/vera/
scp node-1.internal:/etc/vera/topics.env /etc/vera/

# Update node-specific config
export VERA_NODE_ID="lattice-node-2"
export VERA_REGION="us-west"
export VERA_SHARED_REDIS="redis-cluster.internal:6379"

# Start node
npm start
EOF
```

### 4. Configure Node Discovery

```bash
// turbo
# Register new node in lattice
node -e "
import { latticeCoordinator } from './src/swarm/latticeCoordinator.js';

await latticeCoordinator.registerNode({
  nodeId: 'lattice-node-2',
  region: 'us-west',
  ip: '10.0.2.10',
  port: 8088,
  capabilities: ['carbon_verification', 'payment_processing'],
  capacity: {
    maxAgents: 100,
    maxTasksPerSecond: 50
  }
});

console.log('✅ Node registered in lattice');
"
```

### 5. Configure Load Balancer

```nginx
# /etc/nginx/conf.d/vera-lattice.conf
upstream vera_lattice {
    least_conn;  # Route to least busy node
    
    server 10.0.1.10:8088 weight=3;  # Primary
    server 10.0.2.10:8088 weight=3;  # Node 2
    server 10.0.3.10:8088 weight=3;  # Node 3
    
    keepalive 32;
}

server {
    listen 80;
    server_name lattice.vera.network;
    
    location / {
        proxy_pass http://vera_lattice;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        
        # Health checks
        health_check interval=5s fails=3 passes=2;
    }
}
```

### 6. Enable Cross-Node Consensus

```bash
// turbo
# Configure Byzantine consensus for multi-node
node -e "
import { byzantineConsensus } from './src/lattice/byzantineConsensus.js';

await byzantineConsensus.configure({
  clusterSize: 3,
  faultTolerance: 1,  // Tolerate 1 faulty node
  consensusTimeout: 10000,
  nodes: [
    'lattice-node-1',
    'lattice-node-2',
    'lattice-node-3'
  ]
});

console.log('✅ Cross-node consensus configured');
"
```

## Auto-Scaling Configuration

### Kubernetes HPA (Horizontal Pod Autoscaler)

```yaml
# vera-lattice-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: vera-lattice
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: vera-lattice
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
          name: vera_tasks_per_second
        target:
          type: AverageValue
          averageValue: "50"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
```

### AWS Auto Scaling Group

```bash
// turbo
# Terraform configuration
cat > lattice-asg.tf << 'EOF'
resource "aws_autoscaling_group" "vera_lattice" {
  name                = "vera-lattice-asg"
  vpc_zone_identifier = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  target_group_arns   = [aws_lb_target_group.vera.arn]
  health_check_type   = "ELB"
  
  min_size         = 3
  max_size         = 20
  desired_capacity = 3
  
  launch_template {
    id      = aws_launch_template.vera_lattice.id
    version = "$Latest"
  }
  
  tag {
    key                 = "Name"
    value               = "vera-lattice-node"
    propagate_at_launch = true
  }
}

resource "aws_autoscaling_policy" "vera_scaling" {
  name                   = "vera-cpu-target"
  autoscaling_group_name = aws_autoscaling_group.vera_lattice.name
  policy_type            = "TargetTrackingScaling"
  
  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 70.0
  }
}
EOF
```

## Scaling Metrics

### Monitor Cluster Health

```bash
// turbo
# View all nodes
curl http://localhost:8088/api/vera/lattice/nodes | jq .
```

**Expected output:**
```json
{
  "nodes": [
    {
      "nodeId": "lattice-node-1",
      "region": "us-east",
      "status": "active",
      "load": 45,
      "agents": 23,
      "tasksPerSecond": 12
    },
    {
      "nodeId": "lattice-node-2",
      "region": "us-west",
      "status": "active",
      "load": 38,
      "agents": 21,
      "tasksPerSecond": 10
    }
  ],
  "totalCapacity": 200,
  "usedCapacity": 89,
  "averageLoad": 42
}
```

### View Load Distribution

```bash
// turbo
curl http://localhost:8088/api/vera/lattice/load-distribution | jq .
```

## Scaling Triggers

### Automatic Scale-Out

Scale when ANY of these occur:
- CPU > 70% for 2 minutes
- Memory > 80% for 2 minutes
- Tasks/second > 50 per node
- Agent queue depth > 100
- P95 latency > 500ms

### Automatic Scale-In

Scale down when ALL of these are true:
- CPU < 30% for 10 minutes
- Memory < 40% for 10 minutes
- Tasks/second < 10 per node
- Agent queue depth < 10
- Minimum 3 nodes maintained

## Multi-Region Deployment

### Geo-Distributed Lattice

```
┌─────────────────────────────────────────────────────────────┐
│                      Global Lattice                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   us-east    │  │   us-west    │  │   eu-west    │     │
│  │  (Primary)   │◄─┼─►│  (Secondary)│◄─┼─►│  (Secondary)│     │
│  │   Node 1-3   │  │   Node 4-6   │  │   Node 7-9   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         ▲                ▲                ▲                 │
│         └────────────────┴────────────────┘                 │
│                    Global HCS                             │
│              (Consensus across regions)                   │
└─────────────────────────────────────────────────────────────┘
```

### Region-Aware Routing

```typescript
// Route to nearest region
const routing = {
  'user-us-east': 'lattice-us-east',
  'user-us-west': 'lattice-us-west',
  'user-eu': 'lattice-eu-west'
};

// Or based on carbon project location
const projectRegion = getProjectRegion(projectId);
const targetNode = routing[projectRegion] || 'lattice-us-east';
```

## Capacity Planning

### Node Capacity Guidelines

| Metric | Per Node | Cluster of 3 |
|--------|----------|--------------|
| Agents | 100 | 300 |
| Tasks/sec | 50 | 150 |
| Carbon retirements/day | 10,000 | 30,000 |
| Concurrent queries | 200 | 600 |
| Memory | 4GB | 12GB |
| CPU cores | 2 | 6 |

### Growth Projections

| Month | Nodes | Capacity | Retirements/Day |
|-------|-------|----------|-----------------|
| 1 | 3 | 300 agents | 30,000 |
| 3 | 5 | 500 agents | 50,000 |
| 6 | 8 | 800 agents | 80,000 |
| 12 | 15 | 1500 agents | 150,000 |

## Troubleshooting

### Issue: "Nodes out of sync"

**Fix:** Force state resync
```bash
// turbo
node -e "
import { stateSync } from './src/lattice/stateSync.js';
await stateSync.forceResync();
"
```

### Issue: "Uneven load distribution"

**Fix:** Rebalance agents
```bash
// turbo
node -e "
import { latticeCoordinator } from './src/swarm/latticeCoordinator.js';
await latticeCoordinator.rebalanceLoad();
"
```

### Issue: "HCS message duplication"

**Fix:** Check shard configuration
```bash
// turbo
node -e "
import { hcsTopicSharding } from './src/vera/orchestrator/hcsTopicSharding.js';
console.log(await hcsTopicSharding.getStatus());
"
```

## Cost Optimization

### Spot Instance Integration

```yaml
# Use AWS Spot for 70% cost savings
nodeSelector:
  node-type: spot

tolerations:
  - key: "spot"
    operator: "Equal"
    value: "true"
    effect: "NoSchedule"
```

### Right-Sizing Nodes

Start with smaller nodes, scale vertically before horizontally:
1. 2 vCPU → 4 vCPU (same node)
2. 4GB RAM → 8GB RAM (same node)
3. Then add new nodes

## Next Steps

1. Deploy first additional node
2. Configure auto-scaling rules
3. Set up multi-region if needed
4. Monitor cost per transaction
5. Optimize spot/preemptible usage
