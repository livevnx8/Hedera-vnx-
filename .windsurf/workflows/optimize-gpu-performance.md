---
description: Optimize GPU performance for AI inference
---

# Optimize GPU Performance

Maximize NVIDIA GPU efficiency for Vera's AI workloads.

## Quick Optimization

```bash
// turbo
# Run auto-optimizer
./optimize-gpu.sh
```

## 1. Memory Optimization

```bash
// turbo
# Clear GPU cache
node -e "
import { gpuAccelerator } from './src/ai/gpuAccelerator.js';
await gpuAccelerator.clearCache();
console.log('GPU cache cleared');
"

# Set optimal batch size
export VERA_GPU_BATCH_SIZE=64  # Adjust based on GPU memory
export VERA_GPU_MAX_SEQ_LENGTH=2048
```

## 2. Mixed Precision (FP16)

```bash
// turbo
# Enable FP16 for 2x speedup
export VERA_GPU_FP16=true
export VERA_GPU_BF16=true  # For Ampere+ GPUs

# Verify in code
node -e "
import { modelOptimizer } from './src/ai/modelOptimizer.js';
await modelOptimizer.enableMixedPrecision();
console.log('Mixed precision enabled');
"
```

## 3. TensorRT Optimization

```bash
// turbo
# Convert models to TensorRT
python src/ai/convert_tensorrt.py \
  --model models/vera-base \
  --output models/vera-base-trt \
  --precision fp16 \
  --max-batch-size 64

# Use optimized model
export VERA_MODEL_PATH=models/vera-base-trt
```

## 4. CUDA Graphs (Static Workloads)

```bash
// turbo
# Enable CUDA graphs for repeated inference
export VERA_CUDA_GRAPHS=true

# Pre-compile graphs
node -e "
import { inferenceEngine } from './src/ai/inferenceEngine.js';
await inferenceEngine.warmupCUDAGraphs();
"
```

## 5. Multi-Stream Inference

```bash
// turbo
# Process multiple requests concurrently
export VERA_GPU_STREAMS=4
export VERA_GPU_MAX_INFLIGHT=16

# Configure in Vera
curl -X POST http://localhost:8088/api/ai/gpu/configure \
  -d '{"streams": 4, "maxInflight": 16}'
```

## 6. Kernel Fusion

```bash
// turbo
# Fuse operations for fewer kernel launches
export VERA_KERNEL_FUSION=true
export VERA_FLASH_ATTENTION=true  # For transformer models
```

## 7. PCIe Optimization

```bash
// turbo
# Check PCIe bandwidth
nvidia-smi topo -m

# Enable PCIe gen4 if available
sudo nvidia-smi -pm 1  # Persistence mode

# Set max performance
sudo nvidia-smi -ac 877,1530  # Lock clocks (adjust for your GPU)
```

## 8. Memory Pool Management

```bash
// turbo
# Pre-allocate memory pool
export VERA_GPU_MEMORY_POOL_GB=20
export VERA_GPU_ALLOCATOR=cuda_malloc_async

# Monitor fragmentation
nvidia-smi dmon -s mu
```

## Performance Benchmarking

```bash
// turbo
# Run comprehensive benchmark
node benchmark-gpu.mjs \
  --model vera-base \
  --batch-sizes 1,8,16,32,64 \
  --sequence-lengths 128,512,1024,2048 \
  --iterations 100

# Results saved to gpu-benchmark-$(date +%Y%m%d).json
```

## Tuning Parameters by GPU

| GPU | Batch Size | Precision | Streams |
|-----|------------|-----------|---------|
| RTX 4090 | 32 | FP16 | 2 |
| A100 40GB | 64 | BF16 | 4 |
| A100 80GB | 128 | BF16 | 4 |
| H100 | 256 | FP8 | 8 |

## Continuous Optimization

```bash
// turbo
# Auto-tune every hour
while true; do
  node auto-tune-gpu.mjs
  sleep 3600
done
```

## Troubleshooting Performance

| Symptom | Cause | Fix |
|---------|-------|-----|
| Low GPU util (<50%) | CPU bottleneck | Increase batch size |
| Memory errors | OOM | Reduce batch size or seq length |
| Slow first inference | Cold start | Run warmup |
| PCIe errors | Bandwidth | Check slot (x16 vs x8) |

## Next Steps

- `/setup-multi-gpu` - Scale across multiple GPUs
- `/monitor-gpu-health` - Real-time GPU monitoring
