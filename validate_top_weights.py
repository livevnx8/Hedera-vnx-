#!/usr/bin/env python3
"""
Validate top 3 weighting strategies across 5 seeds.
Compare against unweighted baseline.
"""

import json
import sys
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import torch
import torch.nn.functional as F

from starlit.bitlattice_model_pytorch import (
    BitLatticeModelPyTorch,
    prepare_classification_examples,
    split_classification_corpus,
)

CORPUS_PATH = Path("/home/vera-live-0-1/hedera-llm-api/data/mixed_hedera_classification_corpus.json")
OUTPUT_DIR = Path("/home/vera-live-0-1/hedera-llm-api/class_weight_experiments")

SEEDS = [11, 23, 42, 77, 101]
EPOCHS = 20
BATCH_SIZE = 32
LEAKAGE_FEATURES = ("transaction_type_idx",)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def compute_inverse_weights(labels: torch.Tensor, num_classes: int, max_weight: float) -> torch.Tensor:
    """Compute inverse-frequency weights with cap."""
    counts = torch.bincount(labels.cpu(), minlength=num_classes).float()
    present = counts > 0
    weights = torch.ones(num_classes, dtype=torch.float32)
    if present.any():
        w = counts[present].sum() / counts[present]
        w = w / w.mean()
        w = torch.clamp(w, min=0.5, max=max_weight)
        weights[present] = w
    return weights


def train_evaluate(corpus, num_classes, feature_names, weights_tensor, seed):
    """Train and evaluate with given weights."""
    torch.manual_seed(seed)
    if DEVICE.type == "cuda":
        torch.cuda.manual_seed_all(seed)
    
    splits = split_classification_corpus(corpus, seed=seed)
    
    train_features, train_labels, _, _ = prepare_classification_examples(
        splits["train"], leakage_feature_names=LEAKAGE_FEATURES, feature_names=feature_names
    )
    test_features, test_labels, _, _ = prepare_classification_examples(
        splits["test"], leakage_feature_names=LEAKAGE_FEATURES, feature_names=feature_names
    )
    
    model = BitLatticeModelPyTorch(
        lattice_size=120, vocabulary_size=128,
        num_features=train_features.shape[1], num_classes=num_classes, device=str(DEVICE)
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    
    train_ds = torch.utils.data.TensorDataset(train_features, train_labels)
    train_loader = torch.utils.data.DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    
    for epoch in range(EPOCHS):
        model.train()
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
            optimizer.zero_grad()
            logits, _ = model(batch_x)
            loss = F.cross_entropy(logits, batch_y, weight=weights_tensor.to(DEVICE))
            loss.backward()
            optimizer.step()
    
    model.eval()
    with torch.no_grad():
        test_logits, _ = model(test_features.to(DEVICE))
        test_acc = (test_logits.argmax(1) == test_labels.to(DEVICE)).float().mean().item()
        
        # Per-class recall
        preds = test_logits.argmax(1).cpu()
        per_class = {}
        for c in range(num_classes):
            mask = test_labels == c
            if mask.sum() > 0:
                per_class[str(c)] = (preds[mask] == c).float().mean().item()
    
    return {"test_acc": test_acc, "per_class_recall": per_class}


def main():
    print("Loading corpus...")
    corpus = json.loads(CORPUS_PATH.read_text())
    num_classes = 10
    
    _, _, feature_names, _ = prepare_classification_examples(
        corpus[:100], leakage_feature_names=LEAKAGE_FEATURES
    )
    
    # Test configurations: (name, weight_fn, kwargs)
    configs = [
        ("unweighted", lambda labels, nc: torch.ones(nc), {}),
        ("inverse_max1.5", compute_inverse_weights, {"max_weight": 1.5}),
        ("inverse_max5.0", compute_inverse_weights, {"max_weight": 5.0}),
        ("sqrt_inv_max1.5", compute_inverse_weights, {"max_weight": 1.5}),  # Will compute differently in loop
    ]
    
    results = {name: [] for name, _, _ in configs}
    
    for seed in SEEDS:
        print(f"\n{'='*60}")
        print(f"Seed {seed}")
        print(f"{'='*60}")
        
        splits = split_classification_corpus(corpus, seed=seed)
        _, train_labels, _, _ = prepare_classification_examples(
            splits["train"], leakage_feature_names=LEAKAGE_FEATURES, feature_names=feature_names
        )
        
        for name, fn, kwargs in configs:
            if name == "sqrt_inv_max1.5":
                # Use sqrt inverse
                counts = torch.bincount(train_labels.cpu(), minlength=num_classes).float()
                present = counts > 0
                weights = torch.ones(num_classes, dtype=torch.float32)
                if present.any():
                    total = counts[present].sum()
                    w = torch.sqrt(total / counts[present])
                    w = w / w.mean()
                    w = torch.clamp(w, min=0.5, max=1.5)
                    weights[present] = w
            else:
                weights = fn(train_labels, num_classes, **kwargs)
            
            print(f"\n  {name}: weights={weights.tolist()}")
            result = train_evaluate(corpus, num_classes, feature_names, weights, seed)
            print(f"    Test acc: {result['test_acc']:.3f}")
            print(f"    Per-class: {result['per_class_recall']}")
            results[name].append(result)
    
    # Summary statistics
    print(f"\n{'='*60}")
    print("SUMMARY ACROSS 5 SEEDS")
    print(f"{'='*60}")
    
    summary = {}
    for name, runs in results.items():
        accs = [r["test_acc"] for r in runs]
        summary[name] = {
            "mean": np.mean(accs),
            "std": np.std(accs),
            "min": np.min(accs),
            "max": np.max(accs),
        }
        print(f"\n{name}:")
        print(f"  Accuracy: {np.mean(accs):.3f} ± {np.std(accs):.3f} (range: {np.min(accs):.3f}-{np.max(accs):.3f})")
        
        # Per-class statistics
        all_classes = set()
        for r in runs:
            all_classes.update(r["per_class_recall"].keys())
        
        for cls in sorted(all_classes, key=int):
            recalls = [r["per_class_recall"].get(cls, 0) for r in runs]
            print(f"  Class {cls}: {np.mean(recalls):.3f} ± {np.std(recalls):.3f}")
    
    # Save results
    with open(OUTPUT_DIR / "validation_5seeds.json", 'w') as f:
        json.dump({name: [{"test_acc": r["test_acc"], "per_class_recall": r["per_class_recall"]} for r in runs] 
                   for name, runs in results.items()}, f, indent=2)
    
    # Visualization
    create_comparison_plot(summary, results)
    
    print(f"\n{'='*60}")
    print("VALIDATION COMPLETE")
    print(f"{'='*60}")


def create_comparison_plot(summary, results):
    """Create comparison bar chart."""
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    
    # Overall accuracy comparison
    names = list(summary.keys())
    means = [summary[n]["mean"] for n in names]
    stds = [summary[n]["std"] for n in names]
    
    colors = ['gray', 'blue', 'green', 'orange']
    bars = axes[0].bar(range(len(names)), means, yerr=stds, capsize=5, 
                        color=colors[:len(names)], alpha=0.7, edgecolor='black', linewidth=2)
    axes[0].set_xticks(range(len(names)))
    axes[0].set_xticklabels(names, rotation=45, ha='right')
    axes[0].set_ylabel('Test Accuracy')
    axes[0].set_title('Test Accuracy Across 5 Seeds')
    axes[0].axhline(y=0.448, color='red', linestyle='--', label='Unweighted baseline')
    axes[0].legend()
    axes[0].grid(axis='y', alpha=0.3)
    
    for bar, mean, std in zip(bars, means, stds):
        height = bar.get_height()
        axes[0].text(bar.get_x() + bar.get_width()/2., height + std + 0.005, 
                    f'{mean:.3f}', ha='center', va='bottom', fontsize=10, fontweight='bold')
    
    # Per-class recall heatmap for best method vs unweighted
    classes = ['0', '2', '3', '4', '6', '7', '8']
    unweighted_recalls = []
    weighted_recalls = []
    
    for cls in classes:
        uw = [r["per_class_recall"].get(cls, 0) for r in results["unweighted"]]
        w = [r["per_class_recall"].get(cls, 0) for r in results["inverse_max5.0"]]
        unweighted_recalls.append(np.mean(uw))
        weighted_recalls.append(np.mean(w))
    
    x = np.arange(len(classes))
    width = 0.35
    axes[1].bar(x - width/2, unweighted_recalls, width, label='Unweighted', color='gray', alpha=0.7)
    axes[1].bar(x + width/2, weighted_recalls, width, label='Inverse max_w=5.0', color='green', alpha=0.7)
    axes[1].set_xlabel('Class')
    axes[1].set_ylabel('Recall')
    axes[1].set_title('Per-Class Recall Comparison')
    axes[1].set_xticks(x)
    axes[1].set_xticklabels(classes)
    axes[1].legend()
    axes[1].grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'validation_comparison.png', dpi=300, bbox_inches='tight')
    plt.savefig(OUTPUT_DIR / 'validation_comparison.svg', format='svg', bbox_inches='tight')
    plt.close()
    print(f"\nSaved visualization to {OUTPUT_DIR / 'validation_comparison.png'}")


if __name__ == "__main__":
    main()
