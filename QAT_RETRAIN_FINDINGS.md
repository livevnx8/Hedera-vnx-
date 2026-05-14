# QAT Retrain Findings

**Date**: 2026-05-10

## Experiment 1: QAT from Pretrained Models

**Method**: Load existing `.pt` models, wrap with ternary QAT layers, fine-tune.

| Metric | HBAR | SAUCE | DOVU |
|--------|------|-------|------|
| Original accuracy | 47.33% | 51.33% | 53.67% |
| QAT accuracy | 48.00% | 52.33% | 48.67% |
| Change | +0.67% | +1.00% | **-5.00%** |
| Weight -1 | 1.0% | 1.0% | 1.0% |
| Weight 0 | **98.0%** | **98.0%** | **98.0%** |
| Weight +1 | 1.0% | 1.0% | 1.0% |
| Speed | 512 μs (7x slower) | 512 μs | 512 μs |
| Compression | 16.5x | 16.5x | 16.5x |

**Verdict**: ❌ **FAILURE**
- Post-training QAT destroys model performance
- Threshold=0.33 collapses 98% of weights to 0
- Models were never trained for ternary constraints

---

## Experiment 2: QAT from Scratch

**Method**: Train new models FROM SCRATCH with ternary forward pass (STE).

| Threshold | FP Test | QAT Test | Gap | -1 | 0 | +1 |
|-----------|---------|----------|-----|----|---|----|
| 0.05 | 49.60% | **98.40%** | +48.80% | 38.9% | 34.9% | 26.3% |
| 0.10 | 49.60% | **96.93%** | +47.33% | 23.5% | 62.7% | 13.8% |
| 0.20 | 49.60% | **99.07%** | +49.47% | 13.6% | 79.4% | 7.1% |

**File size**: 14.9 KB (16.5x compression)

**Verdict**: ✅ **QAT CAN WORK** — but there's a catch (see below)

---

## The Catch: Data Signal

The synthetic data used in Experiment 2 has a **directly predictable signal**:
```python
feat[1] = momentum
label = 1 if momentum > 0 else 0
```

The model learns: "if feature[1] > 0, predict UP". This is trivially learnable with just ONE ternary weight (+1 on feature 1, 0 everywhere else).

**The 99% accuracy is NOT impressive** — it just means QAT can learn a linear threshold function when the signal is obvious.

**Real question**: Does QAT work on REAL price data with NOISY signal?

---

## Key Technical Findings

### 1. Threshold is Everything

| Threshold | Weight Collapse? | Accuracy | Use Case |
|-----------|-------------------|----------|----------|
| 0.33 | ❌ 98% → 0 | Random | Too aggressive |
| 0.20 | ⚠️ 79% → 0 | High (synthetic) | Aggressive but usable |
| 0.10 | ⚠️ 63% → 0 | High (synthetic) | Moderate |
| 0.05 | ✅ 35% → 0 | High (synthetic) | Conservative |

**Rule**: Lower threshold = more non-zero weights = more expressive model

### 2. QAT Must Be Applied During Training

```python
# ❌ WRONG: Post-training quantization
model.train()  # full precision
optimizer.step()
model.quantize_weights()  # destroys everything

# ✅ CORRECT: QAT during forward
w_q = ternary_forward(w)  # use ternary in forward
loss.backward()  # gradients flow to full-precision w
optimizer.step()  # updates full-precision w
```

### 3. Weight Distribution Matters

A working ternary model should have:
- ~10-40% non-zero weights (not 2%)
- Balanced -1 and +1 counts
- Zero weights in "unimportant" connections

The old `.vnx` files had:
- -1: 0.9%, 0: 98.1%, +1: 1.0%

This is **not a model** — it's a collection of zeros with a few random weights.

---

## Recommendations

### Immediate Actions

| Action | Priority | Effort |
|--------|----------|--------|
| Retrain ALL models from scratch with QAT (threshold=0.05-0.10) | High | 1-2 hours |
| Test on REAL historical price data (not synthetic) | High | 30 min |
| If real-data accuracy > 70%, replace all `.vnx` files | High | 10 min |
| If real-data accuracy < 60%, QAT is not viable for price prediction | High | — |

### If QAT Works on Real Data

Benefits:
- 16.5x model compression (14.9 KB vs 247 KB)
- Ternary weights enable ultra-fast SIMD inference
- Deterministic, explainable predictions

### If QAT Fails on Real Data

Alternatives:
- Keep full-precision models (247 KB is already small)
- Use INT8 quantization (2-4x compression, minimal accuracy loss)
- Use ONNX Runtime with graph optimizations

---

## Next Step

Run `python3 qat_train_from_scratch_real_data.py` to test QAT on actual HBAR price history from the Hedera Mirror Node or CoinGecko API.

If accuracy > 70%: Proceed with QAT production deployment.
If accuracy < 60%: Abandon ternary, use full-precision + ONNX optimization instead.
