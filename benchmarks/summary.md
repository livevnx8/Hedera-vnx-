# Training Benchmarks Summary

**Last Updated**: 2026-05-10 12:38:08
**Total Runs**: 4

## Best Performing Models

| Run | Accuracy | Loss | Dataset | Key Finding |
|-----|----------|------|---------|-------------|
| 2026-05-10_gradient-magnitudes | 0.0% | 0.00 | synthetic | Gradient ratio (after/before quantization): 0.27... |
| 2026-05-10_linear-baseline | 33.0% | 1.10 | synthetic | Simple linear model achieves 33% accuracy... |
| 2026-05-10_no-quantization | 34.0% | 1.10 | synthetic | Disabling ternary quantization enabled learning (l... |
| 2026-05-10_mixed-corpus | 45.5% | 0.85 | mixed | Real data improved accuracy from 33% to 45%... |

## Key Findings

1. **Gradient ratio (after/before quantization): 0.27** - Observed in: 2026-05-10_gradient-magnitudes
2. **Gradients computed but initial drop problematic** - Observed in: 2026-05-10_gradient-magnitudes
3. **Quantization reduces gradient flow significantly** - Observed in: 2026-05-10_gradient-magnitudes
4. **Simple linear model achieves 33% accuracy** - Observed in: 2026-05-10_linear-baseline
5. **Data and features are valid (model learns)** - Observed in: 2026-05-10_linear-baseline
6. **BitLattice issues are architecture-specific, not data-related** - Observed in: 2026-05-10_linear-baseline
7. **Disabling ternary quantization enabled learning (loss: 2.30→1.10)** - Observed in: 2026-05-10_no-quantization
8. **Accuracy improved from 10% to 34% without quantization** - Observed in: 2026-05-10_no-quantization
9. **Root cause: TernaryAdam + ternary quantization blocking learning** - Observed in: 2026-05-10_no-quantization
10. **Real data improved accuracy from 33% to 45%** - Observed in: 2026-05-10_mixed-corpus
11. **Loss decreased from 1.58 to 0.85** - Observed in: 2026-05-10_mixed-corpus
12. **Training completed without errors** - Observed in: 2026-05-10_mixed-corpus
13. **Class imbalance present in real data** - Observed in: 2026-05-10_mixed-corpus
