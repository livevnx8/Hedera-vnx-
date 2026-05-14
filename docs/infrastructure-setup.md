# Starlit Infrastructure Setup Guide

## Overview

This guide covers setting up the infrastructure for optimized Starlit training, including GPU cluster setup, software stack installation, and distributed training framework deployment.

## Prerequisites

### Hardware Requirements

**Minimum**:
- 1x NVIDIA GPU (8GB+ VRAM)
- 16GB RAM
- 100GB SSD storage

**Recommended**:
- 8x NVIDIA A100 GPUs (40GB each)
- 512GB RAM
- 10TB NVMe storage

**Cloud Options**:
- AWS p4d.24xlarge (8x A100, 512GB RAM)
- Google Cloud TPU v4 pod
- Azure ND96asr_v4 (8x A100)

### Software Requirements

- Python 3.8+
- CUDA 11.8+ (for GPU)
- Linux (Ubuntu 20.04+ recommended)

## Installation Steps

### 1. Clone Repository

```bash
git clone <repository-url>
cd hedera-llm-api
```

### 2. Run Setup Script

```bash
chmod +x setup_starlit_training.sh
./setup_starlit_training.sh
```

This will:
- Create virtual environment
- Install PyTorch with CUDA support
- Install distributed training libraries
- Install monitoring tools
- Create necessary directories

### 3. Activate Virtual Environment

```bash
source venv/bin/activate
```

### 4. Verify Installation

```bash
python -c "import torch; print(f'PyTorch: {torch.__version__}'); print(f'CUDA available: {torch.cuda.is_available()}'); print(f'CUDA devices: {torch.cuda.device_count()}')"
```

Expected output:
```
PyTorch: 2.0.0
CUDA available: True
CUDA devices: 8
```

## Configuration

### Training Configuration

Edit `config/training_config.yaml` to customize:

```yaml
hardware:
  num_gpus: 8
  gpu_ids: [0, 1, 2, 3, 4, 5, 6, 7]

training:
  epochs: 100
  learning_rate: 0.01

specialists:
  domain:
    count: 40
  concept:
    count: 200
  pattern:
    count: 500
```

## Distributed Training Setup

### Single Node Multi-GPU

For training on a single node with multiple GPUs:

```bash
python src/starlit/distributed_training.py distributed
```

### Multi-Node Training

For training across multiple nodes:

1. On each node, set environment variables:
```bash
export MASTER_ADDR=<master_node_ip>
export MASTER_PORT=12355
export WORLD_SIZE=<total_num_processes>
export RANK=<node_rank>
```

2. Run training on each node:
```bash
python src/starlit/distributed_training.py distributed
```

## Monitoring

### TensorBoard

Start TensorBoard for monitoring:

```bash
tensorboard --logdir logs --port 6006
```

Access at `http://localhost:6006`

### Weights & Biases

Enable W&B logging in config:
```yaml
logging:
  wandb: true
  project_name: starlit-training
```

Login to W&B:
```bash
wandb login
```

## Testing Infrastructure

### Test GPU Setup

```bash
python -c "
import torch
print(f'GPU count: {torch.cuda.device_count()}')
for i in range(torch.cuda.device_count()):
    print(f'GPU {i}: {torch.cuda.get_device_name(i)}')
    x = torch.randn(1000, 1000).cuda(i)
    y = torch.randn(1000, 1000).cuda(i)
    z = torch.matmul(x, y)
    print(f'GPU {i} test passed')
"
```

### Test Distributed Training

```bash
python -m torch.distributed.launch \
    --nproc_per_node=4 \
    src/starlit/distributed_training.py distributed
```

## Troubleshooting

### CUDA Out of Memory

Reduce batch size in config:
```yaml
hardware:
  batch_size_per_gpu: 16  # Reduce from 32
```

Or enable gradient checkpointing:
```yaml
memory:
  gradient_checkpointing: true
```

### NCCL Errors

Check NCCL version:
```bash
python -c "import torch; print(torch.cuda.nccl.version())"
```

Set environment variables:
```bash
export NCCL_DEBUG=INFO
export NCCL_IB_DISABLE=1
```

### Slow Training

Check GPU utilization:
```bash
nvidia-smi -l 1
```

Enable mixed precision:
```yaml
hardware:
  mixed_precision: true
```

## Performance Optimization

### 1. Enable Mixed Precision

```yaml
hardware:
  mixed_precision: true
```

**Speedup**: 2-3x

### 2. Enable Gradient Checkpointing

```yaml
memory:
  gradient_checkpointing: true
```

**Memory reduction**: 50%

### 3. Increase Batch Size

```yaml
hardware:
  batch_size_per_gpu: 64  # Increase from 32
```

**Speedup**: 2x (if memory permits)

### 4. Use CUDA Graphs

```python
# In training code
model = torch.compile(model)
```

**Speedup**: 1.5-2x

## Production Deployment

### Using Kubernetes

Create `k8s/training-job.yaml`:
```yaml
apiVersion: kubeflow.org/v1
kind: PyTorchJob
metadata:
  name: starlit-training
spec:
  pytorchReplicaSpecs:
    Master:
      replicas: 1
      template:
        spec:
          containers:
          - name: pytorch
            image: starlit-training:latest
            resources:
              limits:
                nvidia.com/gpu: 8
    Worker:
      replicas: 7
      template:
        spec:
          containers:
          - name: pytorch
            image: starlit-training:latest
            resources:
              limits:
                nvidia.com/gpu: 8
```

### Using Slurm

Create `slurm/training.sh`:
```bash
#!/bin/bash
#SBATCH --job-name=starlit-training
#SBATCH --nodes=2
#SBATCH --ntasks-per-node=8
#SBATCH --gpus-per-node=8
#SBATCH --time=24:00:00

srun python src/starlit/distributed_training.py distributed
```

Submit:
```bash
sbatch slurm/training.sh
```

## Security

### API Keys

Store in environment variables:
```bash
export WANDB_API_KEY=<your-key>
export HF_TOKEN=<your-token>
```

### Firewall

Ensure ports are open:
- Master port: 12355
- TensorBoard: 6006

## Backup and Recovery

### Checkpointing

Checkpoints are saved to `checkpoints/` directory.

To resume training:
```bash
python src/starlit/distributed_training.py --resume checkpoints/latest.pt
```

### Artifact Backup

Artifacts are saved to `starlit-artifacts/`.

Backup to remote storage:
```bash
rsync -avz starlit-artifacts/ user@remote:/backup/starlit-artifacts/
```

## Next Steps

After infrastructure setup:
1. Test with small subset (5 domain + 10 concept + 20 pattern)
2. Validate training pipeline
3. Scale to full training (40 domain + 200 concept + 500 pattern)
4. Monitor and optimize

## Support

For issues:
- Check logs in `logs/` directory
- Check GPU status with `nvidia-smi`
- Check distributed training with `torch.distributed.get_rank()`
