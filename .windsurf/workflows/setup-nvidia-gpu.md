---
description: Setup NVIDIA GPU acceleration for Vera lattice
---

# Setup NVIDIA GPU

Configure NVIDIA GPUs for accelerated AI inference and lattice operations.

## Prerequisites

- NVIDIA GPU (RTX 4090, A100, H100, or RTX 6000 Ada)
- CUDA 12.0+ capable driver (525.60.13 or newer)
- 64GB+ system RAM recommended

## 1. Install NVIDIA Drivers

```bash
// turbo
# Check current GPU
nvidia-smi

# Install latest drivers (Ubuntu)
sudo apt update
sudo apt install -y nvidia-driver-535
sudo reboot

# Verify after reboot
nvidia-smi
```

## 2. Install CUDA Toolkit

```bash
// turbo
# Download CUDA 12.2
wget https://developer.download.nvidia.com/compute/cuda/12.2.0/local_installers/cuda_12.2.0_535.54.03_linux.run
sudo sh cuda_12.2.0_535.54.03_linux.run --silent --toolkit

# Add to PATH
echo 'export PATH=/usr/local/cuda/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc

# Verify
nvcc --version
```

## 3. Install cuDNN

```bash
// turbo
# Download cuDNN 8.9 (requires NVIDIA developer account)
# Extract and copy files
sudo cp cuda/include/cudnn*.h /usr/local/cuda/include
sudo cp cuda/lib64/libcudnn* /usr/local/cuda/lib64
sudo chmod a+r /usr/local/cuda/include/cudnn*.h /usr/local/cuda/lib64/libcudnn*
```

## 4. Setup NVIDIA Container Toolkit

```bash
// turbo
# For Docker GPU support
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt update
sudo apt install -y nvidia-container-toolkit
sudo systemctl restart docker

# Test GPU in container
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

## 5. Configure Vera GPU Support

```bash
// turbo
# Add to .env
export CUDA_VISIBLE_DEVICES=0,1,2,3
export NVIDIA_VISIBLE_DEVICES=all
export GPU_MEMORY_FRACTION=0.9
export CUDA_LAUNCH_BLOCKING=0

# Enable GPU in Vera config
cat >> .env << 'EOF'
VERA_GPU_ENABLED=true
VERA_GPU_MEMORY_GB=24
VERA_GPU_BATCH_SIZE=32
VERA_GPU_MODEL_PRECISION=fp16
EOF
```

## 6. Install GPU-Accelerated Libraries

```bash
// turbo
# PyTorch with CUDA
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# TensorFlow GPU
pip install tensorflow[and-cuda]

# ONNX Runtime GPU
pip install onnxruntime-gpu

# NVIDIA Triton Client
pip install tritonclient[all]
```

## 7. GPU-Optimized Model Setup

```bash
// turbo
# Download optimized models
mkdir -p models/gpu-optimized

# Convert models to TensorRT
python -c "
import torch
from transformers import AutoModel
model = AutoModel.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')
# Convert to ONNX then TensorRT
"

# Setup model cache on fast storage (NVMe)
export TRANSFORMERS_CACHE=/mnt/nvme/vera/models
export HF_HOME=/mnt/nvme/vera/hf
```

## 8. Verify GPU Acceleration

```bash
// turbo
# Run GPU test
node -e "
import { gpuAccelerator } from './src/ai/gpuAccelerator.js';
const info = await gpuAccelerator.getGPUInfo();
console.log('GPU:', info.name);
console.log('Memory:', info.totalMemoryGB, 'GB');
console.log('CUDA Cores:', info.cudaCores);
console.log('Compute Capability:', info.computeCapability);
"

# Benchmark
node test-gpu-performance.mjs
```

## GPU Monitoring

```bash
// turbo
# Watch GPU usage
watch -n 1 nvidia-smi

# Or use nvtop
sudo apt install nvtop
nvtop
```

## Multi-GPU Setup

```bash
// turbo
# For 4x GPU system
export VERA_GPU_COUNT=4
export CUDA_VISIBLE_DEVICES=0,1,2,3
export NCCL_DEBUG=INFO

# Enable tensor parallelism
export VERA_TENSOR_PARALLEL_SIZE=4
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `nvidia-smi` not found | Reinstall drivers |
| CUDA out of memory | Reduce `GPU_MEMORY_FRACTION` |
| Slow inference | Check PCIe bandwidth |
| Docker no GPU | Restart docker after toolkit install |

## Next Steps

- `/optimize-gpu-performance` - Fine-tune GPU settings
- `/setup-multi-gpu` - Multi-node GPU cluster
- `/monitor-gpu-health` - GPU monitoring and alerts
