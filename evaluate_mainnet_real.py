#!/usr/bin/env python3
"""
Proper evaluation: oversample ONLY training set, test on REAL imbalanced distribution.
"""

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import torch
import torch.nn.functional as F
import numpy as np

from starlit.hedera_real_data_fetcher import extract_features_from_real_transaction
from starlit.bitlattice_model_pytorch import (
    BitLatticeModelPyTorch,
    prepare_classification_examples,
    split_classification_corpus,
    compute_class_weights,
)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

print(f"Device: {DEVICE}")
print("=" * 60)
print("MAINNET REAL DATA - PROPER EVALUATION")
print("Train: oversampled | Test: REAL imbalanced distribution")
print("=" * 60)

# Load mainnet corpus
corpus = json.loads(Path("/home/vera-live-0-1/hedera-llm-api/data/mainnet_real_corpus.json").read_text())
print(f"Loaded {len(corpus)} mainnet transactions")

# Show real distribution
label_counts = Counter(item["label"] for item in corpus)
type_map = {
    0: "CRYPTOTRANSFER", 3: "CONTRACTCALL", 4: "CONSENSUSSUBMITMESSAGE",
    5: "TOKENMINT", 6: "TOKENBURN", 7: "ETHEREUMTRANSACTION",
    9: "CRYPTOAPPROVEALLOWANCE", 11: "CRYPTOCREATEACCOUNT"
}
print(f"\nReal distribution:")
for label, count in sorted(label_counts.items(), key=lambda x: x[1], reverse=True):
    name = type_map.get(label, f"class_{label}")
    pct = count / len(corpus) * 100
    print(f"  {name:25s}: {count:4d} ({pct:5.1f}%)")

# Filter to classes with >= 5 samples
valid_labels = {label for label, count in label_counts.items() if count >= 5}
filtered = [item for item in corpus if item["label"] in valid_labels]

# Split FIRST (before any balancing)
torch.manual_seed(42)
np.random.seed(42)

# Manual stratified split
from sklearn.model_selection import train_test_split
labels = [item["label"] for item in filtered]
train_idx, test_idx = train_test_split(
    range(len(filtered)), test_size=0.2, stratify=labels, random_state=42
)

train_raw = [filtered[i] for i in train_idx]
test_raw = [filtered[i] for i in test_idx]

print(f"\nTrain: {len(train_raw)}, Test: {len(test_raw)}")
print(f"Test distribution: {Counter(item['label'] for item in test_raw)}")

# Now oversample ONLY training set
max_count = max(Counter(item["label"] for item in train_raw).values())
train_balanced = []
for label in valid_labels:
    class_items = [item for item in train_raw if item["label"] == label]
    n_needed = max_count
    indices = np.random.choice(len(class_items), size=n_needed, replace=True)
    for idx in indices:
        item = {
            "features": class_items[idx]["features"].copy(),
            "label": class_items[idx]["label"],
        }
        # Tiny noise
        for key in item["features"]:
            item["features"][key] += np.random.normal(0, 0.001)
        train_balanced.append(item)

np.random.shuffle(train_balanced)
print(f"Balanced train: {len(train_balanced)}")
print(f"Balanced train dist: {Counter(item['label'] for item in train_balanced)}")

# Prepare features
train_features, train_labels, feature_names, _ = prepare_classification_examples(train_balanced)
test_features, test_labels, _, _ = prepare_classification_examples(test_raw, feature_names=feature_names)

num_classes = max(valid_labels) + 1

# Loss weights based on REAL distribution (not balanced)
real_labels_tensor = torch.tensor([item["label"] for item in train_raw])
weights = compute_class_weights(real_labels_tensor, num_classes, max_weight=1.5)
print(f"\nLoss weights (from real distribution): {weights.tolist()}")

# Train
model = BitLatticeModelPyTorch(
    lattice_size=120, vocabulary_size=128,
    num_features=train_features.shape[1], num_classes=num_classes, device=str(DEVICE)
)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

train_ds = torch.utils.data.TensorDataset(train_features, train_labels)
train_loader = torch.utils.data.DataLoader(train_ds, batch_size=32, shuffle=True)

print(f"\nTraining for 30 epochs...")
for epoch in range(30):
    model.train()
    for batch_x, batch_y in train_loader:
        batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
        optimizer.zero_grad()
        logits, _ = model(batch_x)
        loss = F.cross_entropy(logits, batch_y, weight=weights.to(DEVICE))
        loss.backward()
        optimizer.step()
    
    if epoch % 5 == 0:
        model.eval()
        with torch.no_grad():
            test_logits, _ = model(test_features.to(DEVICE))
            test_acc = (test_logits.argmax(1) == test_labels.to(DEVICE)).float().mean().item()
        print(f"Epoch {epoch:2d}: test_acc={test_acc:.3f}")

# Final evaluation on REAL imbalanced test set
model.eval()
with torch.no_grad():
    test_logits, _ = model(test_features.to(DEVICE))
    preds = test_logits.argmax(1).cpu()
    test_acc = (preds == test_labels).float().mean().item()

print(f"\n{'='*60}")
print("FINAL RESULTS ON REAL IMBALANCED TEST SET")
print(f"{'='*60}")
print(f"Overall accuracy: {test_acc:.3f}")

# Majority baseline for test set
test_labels_list = test_labels.tolist()
majority_class = max(set(test_labels_list), key=test_labels_list.count)
majority_baseline = test_labels_list.count(majority_class) / len(test_labels_list)
print(f"Majority baseline: {majority_baseline:.3f}")
print(f"Improvement over baseline: {test_acc - majority_baseline:+.3f}")

print(f"\nPer-class recall (on real distribution):")
for c in sorted(valid_labels):
    mask = test_labels == c
    if mask.sum() > 0:
        recall = (preds[mask] == c).float().mean().item()
        name = type_map.get(c, f"class_{c}")
        count = mask.sum().item()
        print(f"  {name:25s}: {recall*100:5.1f}% ({count:3d} samples)")

# Save results
results = {
    "dataset": "mainnet_real",
    "total_samples": len(corpus),
    "train_samples": len(train_balanced),
    "test_samples": len(test_raw),
    "test_accuracy": test_acc,
    "majority_baseline": majority_baseline,
    "improvement": test_acc - majority_baseline,
    "class_distribution": dict(label_counts),
    "per_class_recall": {
        type_map.get(c, f"class_{c}"): float((preds[test_labels == c] == c).float().mean().item())
        for c in valid_labels
    }
}

out_path = Path("/home/vera-live-0-1/hedera-llm-api/mainnet_evaluation_results.json")
with open(out_path, 'w') as f:
    json.dump(results, f, indent=2)
print(f"\nResults saved to {out_path}")
