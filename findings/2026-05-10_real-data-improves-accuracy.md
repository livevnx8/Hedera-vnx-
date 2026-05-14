# Real Data Improves Accuracy

**Date**: 2026-05-10

## Finding
Adding 100 real Hedera transactions to 9000 synthetic samples improved accuracy from 33% to 45%.

## Evidence
- Baseline (synthetic-only): 33-34% accuracy
- Mixed corpus: 45-46% accuracy
- Relative improvement: 36%
- Loss: 1.58 → 0.85

## Implications
- Real data provides valuable signal even in small quantities
- Mixed training is effective when real data is limited
- Class imbalance in real data may need addressing

## Next Steps
- Fetch more real data to reduce synthetic ratio
- Address class imbalance with oversampling
- Test with different real/synthetic ratios


**Tags**: real-data, accuracy, mixed-training
