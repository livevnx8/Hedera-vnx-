#!/usr/bin/env python3
"""
Retrain mainnet model WITHOUT transaction_type_idx (leakage feature).
Only use structural/account/temporal features for honest evaluation.
"""

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import torch
import torch.nn.functional as F
import numpy as np

from starlit.bitlattice_model_pytorch import (
    BitLatticeModelPyTorch,
    prepare_classification_examples,
    compute_class_weights,
)

from sklearn.model_selection import StratifiedShuffleSplit

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
SEEDS = [11, 23, 42, 77, 101]
EPOCHS = 30

print(f"Device: {DEVICE}")
print("=" * 60)
print("MAINNET - NO LEAKAGE (removed transaction_type_idx)")
print("=" * 60)

# Load corpus
corpus = json.loads(Path("/home/vera-live-0-1/hedera-llm-api/data/mainnet_real_corpus.json").read_text())

# Filter to classes with >= 10 samples
label_counts = Counter(item["label"] for item in corpus)
valid_labels = {label for label, count in label_counts.items() if count >= 10}
filtered = [item for item in corpus if item["label"] in valid_labels]

# REMOVE LEAKAGE FEATURE
type_map = {
    0: "CRYPTOTRANSFER", 3: "CONTRACTCALL", 4: "CONSENSUSSUBMITMESSAGE",
    7: "ETHEREUMTRANSACTION", 6: "TOKENBURN"
}

for item in filtered:
    if "transaction_type_idx" in item["features"]:
        del item["features"]["transaction_type_idx"]

print(f"Features after removing leakage: {len(filtered[0]['features'])}")
print(f"Remaining: {list(filtered[0]['features'].keys())[:5]}...")

X = np.arange(len(filtered))
y = np.array([item["label"] for item in filtered])

results = []

for seed in SEEDS:
    print(f"\n{'='*40} Seed {seed} {'='*40}")
    
    sss = StratifiedShuffleSplit(n_splits=1, test_size=0.2, random_state=seed)
    train_idx, test_idx = next(sss.split(X, y))
    
    train_raw = [filtered[i] for i in train_idx]
    test_raw = [filtered[i] for i in test_idx]
    
    # Oversample training
    max_count = max(Counter(item["label"] for item in train_raw).values())
    train_balanced = []
    np.random.seed(seed)
    for label in valid_labels:
        class_items = [item for item in train_raw if item["label"] == label]
        indices = np.random.choice(len(class_items), size=max_count, replace=True)
        for idx in indices:
            item = {
                "features": class_items[idx]["features"].copy(),
                "label": class_items[idx]["label"],
            }
            for key in item["features"]:
                item["features"][key] += np.random.normal(0, 0.001)
            train_balanced.append(item)
    np.random.shuffle(train_balanced)
    
    # Features (no leakage)
    train_features, train_labels, feature_names, _ = prepare_classification_examples(train_balanced)
    test_features, test_labels, _, _ = prepare_classification_examples(test_raw, feature_names=feature_names)
    
    num_classes = max(valid_labels) + 1
    real_labels = torch.tensor([item["label"] for item in train_raw])
    weights = compute_class_weights(real_labels, num_classes, max_weight=1.5)
    
    # Train
    torch.manual_seed(seed)
    if DEVICE.type == "cuda":
        torch.cuda.manual_seed_all(seed)
    
    model = BitLatticeModelPyTorch(
        lattice_size=120, vocabulary_size=128,
        num_features=train_features.shape[1], num_classes=num_classes, device=str(DEVICE)
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    
    train_ds = torch.utils.data.TensorDataset(train_features, train_labels)
    train_loader = torch.utils.data.DataLoader(train_ds, batch_size=32, shuffle=True)
    
    for epoch in range(EPOCHS):
        model.train()
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
            optimizer.zero_grad()
            logits, _ = model(batch_x)
            loss = F.cross_entropy(logits, batch_y, weight=weights.to(DEVICE))
            loss.backward()
            optimizer.step()
    
    # Evaluate
    model.eval()
    with torch.no_grad():
        test_logits, _ = model(test_features.to(DEVICE))
        preds = test_logits.argmax(1).cpu()
        test_acc = (preds == test_labels).float().mean().item()
    
    test_labels_list = test_labels.tolist()
    majority_class = max(set(test_labels_list), key=test_labels_list.count)
    majority_baseline = test_labels_list.count(majority_class) / len(test_labels_list)
    
    per_class = {}
    for c in valid_labels:
        mask = test_labels == c
        if mask.sum() > 0:
            per_class[c] = (preds[mask] == c).float().mean().item()
    
    results.append({
        "seed": seed,
        "test_acc": test_acc,
        "baseline": majority_baseline,
        "improvement": test_acc - majority_baseline,
        "per_class": per_class,
    })
    
    print(f"Acc: {test_acc:.3f} | Baseline: {majority_baseline:.3f} | Improvement: +{test_acc - majority_baseline:.3f}")
    print(f"Per-class: { {type_map.get(k, f'class_{k}'): f'{v:.2f}' for k, v in per_class.items()} }")

# Summary
print(f"\n{'='*60}")
print("5-SEED SUMMARY (NO LEAKAGE)")
print(f"{'='*60}")

accs = [r["test_acc"] for r in results]
baselines = [r["baseline"] for r in results]

print(f"Accuracy:    {np.mean(accs):.3f} ± {np.std(accs):.3f} (range: {np.min(accs):.3f}-{np.max(accs):.3f})")
print(f"Baseline:    {np.mean(baselines):.3f}")
print(f"Improvement: {np.mean([r['improvement'] for r in results]):.3f} ± {np.std([r['improvement'] for r in results]):.3f}")

print(f"\nPer-class recall (mean ± std):")
for c in sorted(valid_labels):
    recalls = [r["per_class"][c] for r in results]
    name = type_map.get(c, f"class_{c}")
    print(f"  {name:25s}: {np.mean(recalls)*100:5.1f}% ± {np.std(recalls)*100:4.1f}%")

# Save
summary = {
    "dataset": "mainnet_no_leakage",
    "features_used": list(filtered[0]["features"].keys()),
    "seeds": SEEDS,
    "accuracy": {"mean": float(np.mean(accs)), "std": float(np.std(accs))},
    "runs": results,
}
out_path = Path("/home/vera-live-0-1/hedera-llm-api/mainnet_no_leakage_results.json")
with open(out_path, 'w') as f:
    json.dump(summary, f, indent=2)
print(f"\nSaved to {out_path}")
