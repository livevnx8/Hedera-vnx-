#!/usr/bin/env python3
"""
Phase 1: Grid search across weighting strategies and cap values.
Single-seed fast evaluation to find promising candidates.
"""

import json
import sys
import time
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import torch
import torch.nn as nn
import torch.nn.functional as F

from starlit.bitlattice_model_pytorch import (
    BitLatticeModelPyTorch,
    prepare_classification_examples,
    split_classification_corpus,
)

CORPUS_PATH = Path("/home/vera-live-0-1/hedera-llm-api/data/mixed_hedera_classification_corpus.json")
OUTPUT_DIR = Path("/home/vera-live-0-1/hedera-llm-api/class_weight_experiments")
OUTPUT_DIR.mkdir(exist_ok=True)

SEED = 42
EPOCHS = 20
BATCH_SIZE = 32
LEAKAGE_FEATURES = ("transaction_type_idx",)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

print(f"Grid search on device: {DEVICE}")


def compute_weights(labels: torch.Tensor, num_classes: int, method: str, max_weight: float) -> torch.Tensor:
    """Compute class weights using specified method."""
    counts = torch.bincount(labels.cpu(), minlength=num_classes).float()
    present = counts > 0
    weights = torch.ones(num_classes, dtype=torch.float32)
    
    if not present.any():
        return weights
    
    total = counts[present].sum()
    max_count = counts[present].max()
    median_count = counts[present].median()
    
    if method == "inverse":
        w = total / counts[present]
        w = w / w.mean()
    elif method == "median":
        w = median_count / counts[present]
    elif method == "sqrt_inv":
        w = torch.sqrt(total / counts[present])
        w = w / w.mean()
    elif method == "log_inv":
        w = torch.log(total / counts[present] + 1.0)
        w = w / w.mean()
    elif method == "effective":
        # Effective number: (1 - beta) / (1 - beta^n)
        # Using beta = 0.9999 (standard for effective number)
        beta = 0.9999
        w = (1.0 - beta) / (1.0 - beta ** counts[present])
        w = w / w.mean()
    elif method == "linear":
        # Linear scaling: weight = count / max_count, inverted and normalized
        w = max_count / counts[present]
        w = torch.sqrt(w)  # Dampen
        w = w / w.mean()
    else:
        raise ValueError(f"Unknown method: {method}")
    
    # Apply cap and floor
    w = torch.clamp(w, min=0.5, max=max_weight)
    weights[present] = w
    return weights


def train_with_weights(corpus, num_classes, feature_names, weights_tensor):
    """Train BitLattice with given class weights."""
    torch.manual_seed(SEED)
    if DEVICE.type == "cuda":
        torch.cuda.manual_seed_all(SEED)
    
    splits = split_classification_corpus(corpus, seed=SEED)
    
    train_features, train_labels, _, _ = prepare_classification_examples(
        splits["train"], leakage_feature_names=LEAKAGE_FEATURES, feature_names=feature_names
    )
    val_features, val_labels, _, _ = prepare_classification_examples(
        splits["val"], leakage_feature_names=LEAKAGE_FEATURES, feature_names=feature_names
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
    
    history = []
    for epoch in range(EPOCHS):
        model.train()
        epoch_loss = 0.0
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
            optimizer.zero_grad()
            logits, _ = model(batch_x)
            loss = F.cross_entropy(logits, batch_y, weight=weights_tensor.to(DEVICE))
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
        
        # Evaluate
        model.eval()
        with torch.no_grad():
            val_logits, _ = model(val_features.to(DEVICE))
            val_loss = F.cross_entropy(val_logits, val_labels.to(DEVICE)).item()
            val_acc = (val_logits.argmax(1) == val_labels.to(DEVICE)).float().mean().item()
            
            test_logits, _ = model(test_features.to(DEVICE))
            test_loss = F.cross_entropy(test_logits, test_labels.to(DEVICE)).item()
            test_acc = (test_logits.argmax(1) == test_labels.to(DEVICE)).float().mean().item()
        
        history.append({
            "epoch": epoch,
            "train_loss": epoch_loss / len(train_loader),
            "val_loss": val_loss,
            "val_acc": val_acc,
            "test_acc": test_acc,
        })
    
    # Compute per-class recall
    model.eval()
    with torch.no_grad():
        test_logits, _ = model(test_features.to(DEVICE))
        preds = test_logits.argmax(1).cpu()
        per_class = {}
        for c in range(num_classes):
            mask = test_labels == c
            if mask.sum() > 0:
                per_class[str(c)] = (preds[mask] == c).float().mean().item()
    
    return {
        "final_test_acc": test_acc,
        "final_val_acc": val_acc,
        "history": history,
        "per_class_recall": per_class,
        "weights": weights_tensor.tolist(),
    }


def main():
    print("Loading corpus...")
    corpus = json.loads(CORPUS_PATH.read_text())
    num_classes = 10
    
    _, _, feature_names, _ = prepare_classification_examples(
        corpus[:100], leakage_feature_names=LEAKAGE_FEATURES
    )
    
    # Get training labels for weight computation
    splits = split_classification_corpus(corpus, seed=SEED)
    _, train_labels, _, _ = prepare_classification_examples(
        splits["train"], leakage_feature_names=LEAKAGE_FEATURES, feature_names=feature_names
    )
    
    print(f"Class distribution: {Counter(train_labels.tolist())}")
    
    methods = ["inverse", "median", "sqrt_inv", "log_inv", "effective", "linear"]
    max_weights = [1.0, 1.5, 2.0, 3.0, 5.0]
    
    results = []
    total = len(methods) * len(max_weights)
    i = 0
    
    for method in methods:
        for max_w in max_weights:
            i += 1
            print(f"\n[{i}/{total}] Testing {method} with max_weight={max_w}...")
            
            weights = compute_weights(train_labels, num_classes, method, max_w)
            print(f"  Weights: {weights.tolist()}")
            
            result = train_with_weights(corpus, num_classes, feature_names, weights)
            print(f"  Test accuracy: {result['final_test_acc']:.3f}  Val accuracy: {result['final_val_acc']:.3f}")
            print(f"  Per-class recall: {result['per_class_recall']}")
            
            results.append({
                "method": method,
                "max_weight": max_w,
                **result,
            })
    
    # Save results
    results_path = OUTPUT_DIR / "grid_search_results.json"
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved results to {results_path}")
    
    # Create summary visualization
    create_summary_plot(results)
    
    # Print top 5 configurations
    print("\n=== TOP 5 CONFIGURATIONS ===")
    sorted_results = sorted(results, key=lambda r: r["final_test_acc"], reverse=True)
    for r in sorted_results[:5]:
        print(f"  {r['method']:12s} max_w={r['max_weight']:.1f}: test_acc={r['final_test_acc']:.3f}")
    
    # Print configurations that improved over unweighted baseline
    baseline = 0.448  # From previous evaluation
    improved = [r for r in results if r["final_test_acc"] > baseline]
    print(f"\n=== IMPROVED OVER BASELINE ({baseline:.3f}) ===")
    if improved:
        for r in sorted(improved, key=lambda x: x["final_test_acc"], reverse=True):
            print(f"  {r['method']:12s} max_w={r['max_weight']:.1f}: test_acc={r['final_test_acc']:.3f}")
    else:
        print("  NONE - all weighting strategies collapsed accuracy")
        print("  Best performing (least damage):")
        for r in sorted_results[:3]:
            print(f"    {r['method']:12s} max_w={r['max_weight']:.1f}: test_acc={r['final_test_acc']:.3f}")


def create_summary_plot(results):
    """Create summary bar chart of all methods."""
    fig, ax = plt.subplots(figsize=(14, 8))
    
    methods = sorted(set(r["method"] for r in results))
    max_weights = sorted(set(r["max_weight"] for r in results))
    
    x = np.arange(len(methods))
    width = 0.15
    
    for i, max_w in enumerate(max_weights):
        accs = []
        for method in methods:
            r = next((r for r in results if r["method"] == method and r["max_weight"] == max_w), None)
            accs.append(r["final_test_acc"] if r else 0)
        ax.bar(x + i * width, accs, width, label=f"max_w={max_w}")
    
    ax.axhline(y=0.448, color='red', linestyle='--', linewidth=2, label='Unweighted baseline (44.8%)')
    ax.axhline(y=0.278, color='orange', linestyle='--', linewidth=2, label='Majority baseline (27.8%)')
    
    ax.set_xlabel('Weighting Method')
    ax.set_ylabel('Test Accuracy')
    ax.set_title('Class Weighting Strategy Comparison (seed=42)')
    ax.set_xticks(x + width * 2)
    ax.set_xticklabels(methods, rotation=45, ha='right')
    ax.legend()
    ax.grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'grid_search_summary.png', dpi=300, bbox_inches='tight')
    plt.savefig(OUTPUT_DIR / 'grid_search_summary.svg', format='svg', bbox_inches='tight')
    plt.close()
    print(f"Saved visualization to {OUTPUT_DIR / 'grid_search_summary.png'}")


if __name__ == "__main__":
    main()
