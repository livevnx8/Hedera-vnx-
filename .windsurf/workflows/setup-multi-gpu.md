---
description: Setup multi-GPU and distributed lattice computing
---

# Setup Multi-GPU

Scale Vera lattice across multiple NVIDIA GPUs.

## Single Node Multi-GPU

### 1. Hardware Requirements

- 2-8x NVIDIA GPUs (same model recommended)
- NVLink or high-speed PCIe switch
- 256GB+ system RAM
- 2TB+ NVMe storage

### 2. Configure Multi-GPU

```bash
// turbo
# Detect GPUs
nvidia-smi -L

# Set environment
export CUDA_VISIBLE_DEVICES=0,1,2,3,4,5,6,7
export VERA_GPU_COUNT=8

# Enable NCCL
export NCCL_DEBUG=INFO
export NCCL_SOCKET_IFNAME=eth0
export NCCL_IB_DISABLE=0  # Enable InfiniBand if available
```

### 3. Data Parallel Setup

```bash
// turbo
# Distribute batches across GPUs
node -e "
import { multiGPUManager } from './src/ai/multiGPUManager.js';
await multiGPUManager.initialize({
  strategy: 'data_parallel',
  gpus: [0, 1, 2, 3],
  batchSizePerGPU: 16
});
console.log('Data parallel ready on 4 GPUs');
"
```

### 4. Model Parallel Setup (Large Models)

```bash
// turbo
# Split model layers across GPUs
node -e "
import { modelParallel } from './src/ai/modelParallel.js';
await modelParallel.initialize({
  numGPUs: 8,
  layersPerGPU: 'auto',
  pipelineParallelism: true
});
"
```

### 5. Tensor Parallelism

```bash
// turbo
# Split tensors for maximum efficiency
export VERA_TENSOR_PARALLEL_SIZE=8
export VERA_PIPELINE_PARALLEL_SIZE=1

node -e "
import { tensorParallel } from './src/ai/tensorParallel.js';
await tensorParallel.initialize({
  worldSize: 8,
  backend: 'nccl'
});
"
```

## Multi-Node Cluster

### 1. Setup Head Node

```bash
// turbo
# On GPU node 1 (head)
export VERA_MASTER_ADDR=192.168.1.10
export VERA_MASTER_PORT=29500
export VERA_WORLD_SIZE=16  # 2 nodes x 8 GPUs
export VERA_RANK=0

# Start coordinator
node src/ai/gpuCoordinator.js --head --port 29500
```

### 2. Setup Worker Nodes

```bash
// turbo
# On GPU nodes 2-N
export VERA_MASTER_ADDR=192.168.1.10
export VERA_MASTER_PORT=29500
export VERA_WORLD_SIZE=16
export VERA_RANK=1  # 2, 3, etc.

# Connect to head
node src/ai/gpuCoordinator.js --worker --head-addr 192.168.1.10
```

### 3. InfiniBand/RDMA (High Performance)

```bash
// turbo
# Check IB devices
ibstat
ibstatus

# Enable RDMA for NCCL
export NCCL_IB_HCA=mlx5_0,mlx5_1
export NCCL_IB_GID_INDEX=3
export NCCL_IB_TC=106
export NCCL_IB_QPS_PER_CONNECTION=4
```

## GPU Cluster Management

```bash
// turbo
# Check cluster health
curl http://localhost:8088/api/gpu/cluster/status | jq .

# View GPU topology
curl http://localhost:8088/api/gpu/cluster/topology | jq .

# Rebalance workload
curl -X POST http://localhost:8088/api/gpu/cluster/rebalance
```

## Fault Tolerance

```bash
// turbo
# Enable automatic failover
export VERA_GPU_FAULT_TOLERANCE=true
export VERA_GPU_HEALTH_CHECK_INTERVAL=30

# Configure spare GPU
export VERA_GPU_SPARE=7  # GPU 7 as hot spare
```

## Performance Monitoring

```bash
// turbo
# Cluster-wide GPU monitoring
watch -n 1 'curl -s http://localhost:8088/api/gpu/cluster/utilization | jq ".[] | {gpu: .id, util: .utilization, mem: .memoryUsed}"'

# Bandwidth test
nccl-tests/build/all_reduce_perf -b 8M -e 1G -f 2 -g 8
```

## Auto-Scaling

```bash
// turbo
# Enable GPU auto-scaling
export VERA_GPU_AUTOSCALE=true
export VERA_GPU_MIN_UTILIZATION=80
export VERA_GPU_SCALE_UP_THRESHOLD=90
export VERA_GPU_SCALE_DOWN_THRESHOLD=30

# Or configure via API
curl -X POST http://localhost:8088/api/gpu/cluster/autoscale \
  -d '{"enabled": true, "minNodes": 2, "maxNodes": 10}'
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| NCCL timeout | Check firewall, increase NCCL_TIMEOUT |
| Uneven GPU load | Rebalance with API call |
| Memory mismatch | Ensure same GPU models per node |
| Slow inter-node | Enable RDMA/InfiniBand |

## Next Steps

- `/monitor-gpu-health` - GPU health monitoring
- `/setup-gpu-scheduler` - Job scheduling across GPUs
