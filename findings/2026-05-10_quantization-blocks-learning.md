# Quantization Blocks Learning

**Date**: 2026-05-10

## Finding
Ternary quantization with TernaryAdam optimizer prevented the BitLattice model from learning.

## Evidence
- With quantization: Loss stuck at 2.30 (ln(10), random prediction), accuracy 0%
- Without quantization: Loss decreased to 1.10, accuracy improved to 34%
- Gradient ratio after quantization: 0.27 (73% reduction)

## Root Cause
- TernaryAdam optimizer + ternary quantization blocking gradient flow
- Straight-through estimator not sufficient for this architecture

## Fix Applied
- Replaced TernaryAdam with standard Adam
- Disabled quantization during training
- Result: Model now learns successfully (34% accuracy)

## Implications
- Quantization should be applied after training, not during
- Standard optimizer required for effective learning


**Tags**: quantization, optimizer, learning
