# NVIDIA NIM Setup Guide for Vera

## Priority 1: Get NIM Running (Biggest Speed Jump)

### Option A: Local Docker (Recommended for 4060 Ti)

```bash
# 1. Pull NIM image (Llama 3.1 8B optimized with TensorRT-LLM)
docker pull nvcr.io/nim/meta/llama3-8b-instruct:latest

# 2. Start NIM container
docker run --gpus all -it --rm \
  --name nim-llama3-8b \
  -p 8000:8000 \
  -e NGC_API_KEY=$NGC_API_KEY \
  nvcr.io/nim/meta/llama3-8b-instruct:latest

# 3. Test it's working
curl http://localhost:8000/v1/health

# Expected: {"status": "healthy"}
```

### Option B: Cloud NIM (NVIDIA API)

```bash
# If you have NGC API access
curl https://integrate.api.nvidia.com/v1/models \
  -H "Authorization: Bearer $NGC_API_KEY"
```

### Configure Vera to Use NIM

Add to `.env`:

```env
# NVIDIA NIM Configuration
NIM_URL=http://localhost:8000/v1
NIM_API_KEY=not-needed-for-local
USE_NIM=true

# Sovereign Router Priority
INFERENCE_PRIORITY=nim,vllm,ollama
```

### Verify Speed Improvement

```bash
# Test with timing
time curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta/llama3-8b-instruct",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }'

# NIM: ~50-100ms first token latency
# Ollama: ~200-500ms first token latency
```

---

## Expected Performance Gains

| Metric | Ollama | NIM (TensorRT-LLM) | Improvement |
|--------|--------|-------------------|-------------|
| Time to First Token | ~300ms | ~80ms | **3.75x** |
| Throughput (tok/s) | ~25 | ~120 | **4.8x** |
| Batch Processing | Slow | Optimized | **10x** |

---

## Quick Verification

```bash
# 1. Start NIM
docker run --gpus all -p 8000:8000 nvcr.io/nim/meta/llama3-8b-instruct:latest

# 2. Update Vera .env
USE_NIM=true
NIM_URL=http://localhost:8000/v1

# 3. Restart Vera
npm run dev

# 4. Test chat - should feel noticeably faster
```
