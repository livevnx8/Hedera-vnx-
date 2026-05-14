#!/usr/bin/env python3
"""
Scale swarm v2: Fix corpus corruption, confidence-weighted ensemble.
Compare: single 14-class model vs swarm ensemble.
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
from sklearn.model_selection import train_test_split

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
EPOCHS = 50
LR = 0.005

print(f"Device: {DEVICE}")
print("=" * 70)
print("SWARM SCALE V2 - CONFIDENCE-WEIGHTED ENSEMBLE")
print("=" * 70)

# Load corpus
corpus = json.loads(Path("/home/vera-live-0-1/hedera-llm-api/data/mainnet_10k_corpus.json").read_text())
print(f"Loaded {len(corpus)} transactions")

# Remove leakage
for item in corpus:
    if "transaction_type_idx" in item["features"]:
        del item["features"]["transaction_type_idx"]

# Type mapping
type_names = {
    0: "CRYPTOTRANSFER", 3: "CONTRACTCALL", 4: "CONSENSUSSUBMITMESSAGE",
    5: "TOKENMINT", 6: "TOKENBURN", 7: "ETHEREUMTRANSACTION",
    8: "SCHEDULECREATE", 9: "SCHEDULESIGN", 10: "CRYPTOAPPROVEALLOWANCE",
    11: "CRYPTOCREATEACCOUNT", 12: "CRYPTOUPDATEACCOUNT", 13: "FILECREATE",
    14: "FILEUPDATE", 18: "FREEZE",
}

# Create binary specialists: one-vs-all for each class
def train_binary_specialist(target_label, all_corpus, seed=42):
    """Train binary classifier: target class vs all others."""
    print(f"  Training binary specialist for class {target_label}...")
    
    # Deep copy to avoid corruption
    binary_corpus = []
    for item in all_corpus:
        binary_corpus.append({
            "features": {k: v for k, v in item["features"].items()},
            "label": 1 if item["label"] == target_label else 0
        })
    
    # Stratified split
    labels = [item["label"] for item in binary_corpus]
    train_idx, test_idx = train_test_split(range(len(binary_corpus)), test_size=0.2,
                                            stratify=labels, random_state=seed)
    
    train_raw = [binary_corpus[i] for i in train_idx]
    test_raw = [binary_corpus[i] for i in test_idx]
    
    # Balance training
    max_count = max(Counter(item["label"] for item in train_raw).values())
    train_balanced = []
    for label in [0, 1]:
        class_items = [item for item in train_raw if item["label"] == label]
        if not class_items:
            continue
        indices = np.random.choice(len(class_items), size=max_count, replace=True)
        for idx in indices:
            item = {"features": {k: v for k, v in class_items[idx]["features"].items()}, 
                    "label": class_items[idx]["label"]}
            for key in item["features"]:
                item["features"][key] += np.random.normal(0, 0.001)
            train_balanced.append(item)
    np.random.shuffle(train_balanced)
    
    # Features
    train_features, train_labels, feature_names, _ = prepare_classification_examples(train_balanced)
    test_features, test_labels, _, _ = prepare_classification_examples(test_raw, feature_names=feature_names)
    
    weights = compute_class_weights(train_labels, 2, max_weight=1.5)
    
    # Train
    torch.manual_seed(seed)
    model = BitLatticeModelPyTorch(
        lattice_size=120, vocabulary_size=128,
        num_features=train_features.shape[1], num_classes=2, device=str(DEVICE)
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)
    
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
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
        scheduler.step()
    
    # Evaluate
    model.eval()
    with torch.no_grad():
        test_logits, _ = model(test_features.to(DEVICE))
        probs = F.softmax(test_logits, dim=1)
        preds = test_logits.argmax(1).cpu()
        acc = (preds == test_labels).float().mean().item()
        # AUC-like score for positive class
        positive_prob = probs[:, 1].cpu()
        
    return model, acc, feature_names

# Phase 1: Train all 14 binary specialists
print("\n" + "=" * 70)
print("PHASE 1: Training 14 Binary One-vs-All Specialists")
print("=" * 70)

specialists = {}
for label, name in type_names.items():
    model, acc, feat_names = train_binary_specialist(label, corpus, seed=42)
    specialists[label] = {"model": model, "accuracy": acc, "features": feat_names}
    print(f"  {name:25s}: {acc:.3f}")

# Phase 2: Confidence-weighted ensemble
print("\n" + "=" * 70)
print("PHASE 2: Confidence-Weighted Ensemble")
print("=" * 70)

# Prepare test set from original corpus (no label changes)
np.random.seed(42)
labels = [item["label"] for item in corpus]
train_idx, test_idx = train_test_split(range(len(corpus)), test_size=0.2,
                                        stratify=labels, random_state=42)
test_raw = [corpus[i] for i in test_idx]

print(f"Testing on {len(test_raw)} samples...")

correct = 0
for item in test_raw:
    true_label = item["label"]
    
    # Get confidence score from each specialist
    scores = {}
    for label, spec in specialists.items():
        model = spec["model"]
        feat_names = spec["features"]
        features = torch.tensor([[item["features"].get(k, 0) for k in feat_names]], 
                                dtype=torch.float32).to(DEVICE)
        model.eval()
        with torch.no_grad():
            logits, _ = model(features)
            probs = F.softmax(logits, dim=1)
            # Score = probability of positive class (label=1)
            score = probs[0, 1].item()
        scores[label] = score
    
    # Predict: class with highest confidence
    predicted = max(scores.items(), key=lambda x: x[1])[0]
    
    if predicted == true_label:
        correct += 1

ensemble_acc = correct / len(test_raw)
print(f"\nEnsemble accuracy: {ensemble_acc:.3f}")

# Phase 3: Compare with single 14-class model
print("\n" + "=" * 70)
print("PHASE 3: Single 14-Class Model (Baseline)")
print("=" * 70)

train_corpus = [corpus[i] for i in train_idx]

# Balance training
max_count = max(Counter(item["label"] for item in train_corpus).values())
train_balanced = []
for label in set(item["label"] for item in train_corpus):
    class_items = [item for item in train_corpus if item["label"] == label]
    indices = np.random.choice(len(class_items), size=max_count, replace=True)
    for idx in indices:
        item = {"features": {k: v for k, v in class_items[idx]["features"].items()},
                "label": class_items[idx]["label"]}
        for key in item["features"]:
            item["features"][key] += np.random.normal(0, 0.001)
        train_balanced.append(item)
np.random.shuffle(train_balanced)

train_features, train_labels, feat_names, _ = prepare_classification_examples(train_balanced)
test_features, test_labels, _, _ = prepare_classification_examples(test_raw, feature_names=feat_names)

num_classes = max(type_names.keys()) + 1
real_labels = torch.tensor([item["label"] for item in train_corpus])
weights = compute_class_weights(real_labels, num_classes, max_weight=1.5)

torch.manual_seed(42)
single_model = BitLatticeModelPyTorch(
    lattice_size=120, vocabulary_size=128,
    num_features=train_features.shape[1], num_classes=num_classes, device=str(DEVICE)
)
optimizer = torch.optim.Adam(single_model.parameters(), lr=LR)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

train_ds = torch.utils.data.TensorDataset(train_features, train_labels)
train_loader = torch.utils.data.DataLoader(train_ds, batch_size=32, shuffle=True)

for epoch in range(EPOCHS):
    single_model.train()
    for batch_x, batch_y in train_loader:
        batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
        optimizer.zero_grad()
        logits, _ = single_model(batch_x)
        loss = F.cross_entropy(logits, batch_y, weight=weights.to(DEVICE))
        loss.backward()
        torch.nn.utils.clip_grad_norm_(single_model.parameters(), 1.0)
        optimizer.step()
    scheduler.step()

single_model.eval()
with torch.no_grad():
    test_logits, _ = single_model(test_features.to(DEVICE))
    preds = test_logits.argmax(1).cpu()
    single_acc = (preds == test_labels).float().mean().item()

print(f"Single 14-class model accuracy: {single_acc:.3f}")

# Summary
print(f"\n{'='*70}")
print("FINAL COMPARISON")
print(f"{'='*70}")
print(f"Ensemble (14 binary specialists): {ensemble_acc:.3f}")
print(f"Single 14-class model:             {single_acc:.3f}")
print(f"Winner: {'Ensemble' if ensemble_acc > single_acc else 'Single model'} (+{abs(ensemble_acc-single_acc):.3f})")

# Save
manifest = {
    "individual_specialists": {type_names[k]: {"accuracy": v["accuracy"]} for k, v in specialists.items()},
    "ensemble_accuracy": ensemble_acc,
    "single_model_accuracy": single_acc,
    "best_approach": "ensemble" if ensemble_acc > single_acc else "single",
    "num_specialists": len(specialists),
}
with open("/home/vera-live-0-1/hedera-llm-api/swarm_manifest_v2.json", 'w') as f:
    json.dump(manifest, f, indent=2)
print(f"\nSaved to swarm_manifest_v2.json")
