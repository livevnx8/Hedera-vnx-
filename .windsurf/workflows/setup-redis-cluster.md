---
description: Setup Redis cluster for distributed caching
---

# Setup Redis Cluster

High-availability caching for Vera lattice.

## Quick Setup

```bash
// turbo
# Start 6 Redis instances for 3-master/3-slave cluster
for i in 7000 7001 7002 7003 7004 7005; do
  redis-server --port $i --cluster-enabled yes --cluster-config-file nodes-$i.conf --daemonize yes
done

# Create cluster
redis-cli --cluster create 127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002 \
  127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 --cluster-replicas 1
```

## Docker Compose Setup

```bash
// turbo
cat > redis-cluster.yml << 'EOF'
version: '3.8'
services:
  redis-0:
    image: redis:7-alpine
    ports:
      - "7000:7000"
    command: redis-server --port 7000 --cluster-enabled yes
  redis-1:
    image: redis:7-alpine
    ports:
      - "7001:7001"
    command: redis-server --port 7001 --cluster-enabled yes
  redis-2:
    image: redis:7-alpine
    ports:
      - "7002:7002"
    command: redis-server --port 7002 --cluster-enabled yes
EOF

docker-compose -f redis-cluster.yml up -d
```

## Connect Vera to Cluster

```bash
// turbo
# Update .env
export REDIS_CLUSTER_NODES=localhost:7000,localhost:7001,localhost:7002
export REDIS_CLUSTER_ENABLED=true

# Or via API
curl -X POST http://localhost:8088/api/cache/configure \
  -d '{"cluster": true, "nodes": ["localhost:7000", "localhost:7001", "localhost:7002"]}'
```

## Verify Cluster

```bash
// turbo
# Check cluster info
redis-cli -p 7000 cluster info

# List nodes
redis-cli -p 7000 cluster nodes

# Test data distribution
redis-cli -p 7000 SET test-key "value"
redis-cli -p 7000 GET test-key
```

## Failover Test

```bash
// turbo
# Kill one master
redis-cli -p 7000 DEBUG SEGFAULT

# Check failover (slave becomes master)
redis-cli -p 7001 cluster nodes

# Vera should continue working
curl http://localhost:8088/api/cache/stats
```
