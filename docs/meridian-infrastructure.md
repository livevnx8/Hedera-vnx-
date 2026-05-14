# Meridian Infrastructure

Meridian is a research model for Vera-native routing, classification, proof scoring, and anomaly detection. Treat it as a specialist control model, not a general chat model or source of truth.

## Infrastructure Contract

- Dataset schema: `meridian.dataset.v1`
- Checkpoint schema: `meridian.checkpoint.v1`
- Inference endpoint: `POST /v1/infer`
- Health endpoint: `GET /health`
- Default local URL: `http://localhost:8123`
- Backends: `pytorch` for research checkpoints, `bitnetcpp` for official GGUF inference

## Recommended Flow

```bash
python3 src/ai/meridian/prepare_data.py --n-synthetic 5000 --seed 137
python3 src/ai/meridian/train.py --preset small --epochs 3 --batch_size 4 --max_seq_len 512
python3 src/ai/meridian/eval.py --checkpoint models/meridian/checkpoints/best.pt --output models/meridian/eval.json
python3 src/ai/meridian/server.py --backend pytorch --checkpoint models/meridian/checkpoints/best.pt --port 8123
```

For fast infrastructure checks:

```bash
python3 src/ai/meridian/smoke.py
```

## bitnet.cpp Lane

Use `bitnet.cpp` as the production-style inference backend for official BitNet b1.58 GGUF models. Keep PyTorch for research, training, and architecture experiments.

Expected local layout:

```text
vendor/BitNet/
models/BitNet-b1.58-2B-4T/ggml-model-i2_s.gguf
```

Start a bitnet.cpp-backed Meridian server:

```bash
python3 src/ai/meridian/server.py \
  --backend bitnetcpp \
  --bitnet-dir vendor/BitNet \
  --bitnet-model models/BitNet-b1.58-2B-4T/ggml-model-i2_s.gguf \
  --port 8124
```

If your local bitnet.cpp command differs, pass a command template:

```bash
python3 src/ai/meridian/server.py \
  --backend bitnetcpp \
  --bitnet-command "python3 {bitnet_dir}/run_inference.py -m {model} -p {prompt} -n {max_tokens} -t {threads} -c {ctx_size} -temp {temperature}"
```

Then point Vera at it:

```env
ENABLE_MERIDIAN_BITNET=true
MERIDIAN_BACKEND=bitnetcpp
MERIDIAN_URL=http://localhost:8124
```

## Backend Benchmark

Run both backends on separate ports and compare them through the same `/v1/infer` contract:

```bash
python3 src/ai/meridian/benchmark_backends.py \
  --data models/meridian/dataset.eval.jsonl \
  --pytorch-url http://127.0.0.1:8123 \
  --bitnetcpp-url http://127.0.0.1:8124 \
  --output models/meridian/backend-benchmark.json
```

## Vera Pairing

Meridian should answer constrained Vera-native questions:

- Which tool or agent should handle this task?
- Which HCS topic or proof lane applies?
- Is the result proof-complete or suspicious?
- Does this workflow suggest an upgrade package?
- Is this anomaly routine, degraded, or operator-worthy?

Vera and the lattice remain responsible for orchestration, receipts, settlement, governance, and production truth.

## Compatibility Policy

Do not claim custom Meridian checkpoints are `bitnet.cpp` compatible until an export path proves the architecture maps cleanly to the supported BitNet/GGUF format. The current safe lane is:

```text
PyTorch Meridian = research/training
bitnet.cpp Meridian = official GGUF inference
Vera router = stable /v1/infer contract
```
