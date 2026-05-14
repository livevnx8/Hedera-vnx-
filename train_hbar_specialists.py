#!/usr/bin/env python3
"""
Train HBAR price direction prediction specialists for 1h, 4h, 24h horizons.
Compare: individual specialists vs ensemble.
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
EPOCHS = 50
LR = 0.005

print(f"Device: {DEVICE}")
print("=" * 60)
print("HBAR PRICE DIRECTION PREDICTION SPECIALISTS")
print("=" * 60)

# Load corpus
corpus = json.loads(Path("/home/vera-live-0-1/hedera-llm-api/data/hbar_prediction_corpus.json").read_text())
print(f"Loaded {len(corpus)} total labeled samples")

# Filter out samples with missing/NaN features
def has_valid_features(item):
    for v in item["features"].values():
        if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
            return False
    return True

corpus = [item for item in corpus if has_valid_features(item)]
print(f"After filtering NaN: {len(corpus)} valid samples")

# Separate by horizon
horizons = [1, 4, 24]
specialists = {}

for h in horizons:
    h_corpus = [item for item in corpus if item["horizon"] == h]
    if len(h_corpus) < 20:
        print(f"\nSkipping {h}h: only {len(h_corpus)} samples")
        continue
    
    print(f"\n{'='*60}")
    print(f"Training {h}h Horizon Specialist")
    print(f"{'='*60}")
    print(f"Samples: {len(h_corpus)} (UP: {sum(1 for c in h_corpus if c['label']==1)}, DOWN: {sum(1 for c in h_corpus if c['label']==0)})")
    
    # 5-seed cross-validation
    results = []
    X = np.arange(len(h_corpus))
    y = np.array([item["label"] for item in h_corpus])
    
    for seed in SEEDS:
        sss = StratifiedShuffleSplit(n_splits=1, test_size=0.2, random_state=seed)
        train_idx, test_idx = next(sss.split(X, y))
        
        train_raw = [h_corpus[i] for i in train_idx]
        test_raw = [h_corpus[i] for i in test_idx]
        
        # Balance training
        max_count = max(Counter(item["label"] for item in train_raw).values())
        train_balanced = []
        for label in [0, 1]:
            class_items = [item for item in train_raw if item["label"] == label]
            indices = np.random.choice(len(class_items), size=max_count, replace=True)
            for idx in indices:
                item = {"features": {k: v for k, v in class_items[idx]["features"].items()}, "label": class_items[idx]["label"]}
                for key in item["features"]:
                    item["features"][key] += np.random.normal(0, 0.001)
                train_balanced.append(item)
        np.random.shuffle(train_balanced)
        
        # Features
        train_features, train_labels, feature_names, _ = prepare_classification_examples(train_balanced)
        test_features, test_labels, _, _ = prepare_classification_examples(test_raw, feature_names=feature_names)
        
        real_labels = torch.tensor([item["label"] for item in train_raw])
        weights = compute_class_weights(real_labels, 2, max_weight=1.5)
        
        # Train
        torch.manual_seed(seed)
        model = BitLatticeModelPyTorch(
            lattice_size=120, vocabulary_size=128,
            num_features=train_features.shape[1], num_classes=2, device=str(DEVICE)
        )
        optimizer = torch.optim.Adam(model.parameters(), lr=LR)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)
        
        train_ds = torch.utils.data.TensorDataset(train_features, train_labels)
        train_loader = torch.utils.data.DataLoader(train_ds, batch_size=16, shuffle=True)
        
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
            preds = test_logits.argmax(1).cpu()
            acc = (preds == test_labels).float().mean().item()
            
            # Confusion matrix
            tp = ((preds == 1) & (test_labels == 1)).sum().item()
            tn = ((preds == 0) & (test_labels == 0)).sum().item()
            fp = ((preds == 1) & (test_labels == 0)).sum().item()
            fn = ((preds == 0) & (test_labels == 1)).sum().item()
        
        results.append({
            "seed": seed, "accuracy": acc,
            "tp": tp, "tn": tn, "fp": fp, "fn": fn,
        })
        print(f"  Seed {seed}: acc={acc:.3f} (TP={tp}, TN={tn}, FP={fp}, FN={fn})")
    
    # Summary
    accs = [r["accuracy"] for r in results]
    print(f"\n{h}h SUMMARY: {np.mean(accs):.3f} ± {np.std(accs):.3f} (range: {np.min(accs):.3f}-{np.max(accs):.3f})")
    print(f"  vs Random Baseline: 50%")
    print(f"  Improvement: +{np.mean(accs)-0.5:.1%}")
    
    specialists[h] = {
        "accuracy_mean": float(np.mean(accs)),
        "accuracy_std": float(np.std(accs)),
        "runs": results,
    }

# Overall comparison
print(f"\n{'='*60}")
print("SPECIALIST COMPARISON")
print(f"{'='*60}")

for h in horizons:
    if h in specialists:
        s = specialists[h]
        print(f"{h:2d}h: {s['accuracy_mean']:.3f} ± {s['accuracy_std']:.3f}  (+{s['accuracy_mean']-0.5:.1%} vs random)")

# Save
summary = {
    "dataset": "hbar_price_prediction",
    "total_samples": len(corpus),
    "specialists": specialists,
}
with open("/home/vera-live-0-1/hedera-llm-api/hbar_specialist_results.json", 'w') as f:
    json.dump(summary, f, indent=2)
print(f"\nSaved to hbar_specialist_results.json")

print(f"\n{'='*60}")
print("HBAR PREDICTION ENGINE COMPLETE")
print(f"{'='*60}")
