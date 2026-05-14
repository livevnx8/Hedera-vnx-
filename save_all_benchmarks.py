#!/usr/bin/env python3
"""
Save all historical benchmarks from training runs
"""

import json
from datetime import datetime
from pathlib import Path
from save_benchmark import save_benchmark, save_finding, update_summary

# Benchmark 1: No quantization test
config_no_quant = {
    "run_name": "no-quantization",
    "model": {
        "architecture": "SimpleMLP",
        "hidden_size": 120,
        "num_features": 20,
        "num_classes": 10
    },
    "training": {
        "optimizer": "Adam",
        "learning_rate": 0.01,
        "batch_size": 32,
        "epochs": 10,
        "use_quantization": False
    },
    "dataset": {
        "type": "synthetic",
        "samples": 10000,
        "domain": "staking_rewards"
    }
}

results_no_quant = {
    "final_loss": 1.10,
    "final_accuracy": 0.34,
    "initial_loss": 2.30,
    "initial_accuracy": 0.10
}

findings_no_quant = [
    "Disabling ternary quantization enabled learning (loss: 2.30→1.10)",
    "Accuracy improved from 10% to 34% without quantization",
    "Root cause: TernaryAdam + ternary quantization blocking learning"
]

save_benchmark(config_no_quant, results_no_quant, findings_no_quant)

# Benchmark 2: Linear baseline
config_linear = {
    "run_name": "linear-baseline",
    "model": {
        "architecture": "Linear",
        "num_features": 20,
        "num_classes": 10
    },
    "training": {
        "optimizer": "Adam",
        "learning_rate": 0.01,
        "batch_size": 32,
        "epochs": 10
    },
    "dataset": {
        "type": "synthetic",
        "samples": 10000,
        "domain": "staking_rewards"
    }
}

results_linear = {
    "final_loss": 1.10,
    "final_accuracy": 0.33
}

findings_linear = [
    "Simple linear model achieves 33% accuracy",
    "Data and features are valid (model learns)",
    "BitLattice issues are architecture-specific, not data-related"
]

save_benchmark(config_linear, results_linear, findings_linear)

# Benchmark 3: Gradient magnitudes
config_grad = {
    "run_name": "gradient-magnitudes",
    "model": {
        "architecture": "BitLattice-like",
        "hidden_size": 120,
        "num_features": 20,
        "num_classes": 10
    },
    "training": {
        "optimizer": "Adam",
        "learning_rate": 0.01,
        "use_quantization": True
    },
    "dataset": {
        "type": "synthetic",
        "samples": 1000
    }
}

results_grad = {
    "avg_gradient_ratio": 0.27,
    "grad_before": 0.05,
    "grad_after": 0.0135
}

findings_grad = [
    "Gradient ratio (after/before quantization): 0.27",
    "Gradients computed but initial drop problematic",
    "Quantization reduces gradient flow significantly"
]

save_benchmark(config_grad, results_grad, findings_grad)

# Save key findings
save_finding(
    "Quantization Blocks Learning",
    """## Finding
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
""",
    tags=["quantization", "optimizer", "learning"]
)

save_finding(
    "API Pagination Limited",
    """## Finding
Hedera mirror node API pagination is limited to 100 transactions per request.

## Evidence
- Attempted to fetch 10K transactions
- API returned only 100 transactions
- Pagination parameters not working as expected

## Impact
- Cannot scale dataset beyond 100 real transactions with current implementation
- Limits ability to train on larger real datasets

## Next Steps
- Use Hedera SDK instead of REST API
- Set up local mirror node
- Fetch by account ID instead of global query
""",
    tags=["api", "hedera", "pagination"]
)

# Update summary
update_summary()

print("\n=== All historical benchmarks saved ===")
