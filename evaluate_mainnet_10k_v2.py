#!/usr/bin/env python3
"""
Improved training: 50 epochs, lr=0.005, cosine scheduler.
Better stability for 14 classes.
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
print("5-SEED CV ON 5K MAINNET - IMPROVED TRAINING")
print(f"Epochs: {EPOCHS}, LR: {LR}, Scheduler: cosine")
print("=" * 60)

corpus = json.loads(Path("/home/vera-live-0-1/hedera-llm-api/data/mainnet_10k_corpus.json").read_text())
print(f"Loaded {len(corpus)} samples")

# Remove leakage
for item in corpus:
    if "transaction_type_idx" in item["features"]:
        del item["features"]["transaction_type_idx"]

label_counts = Counter(item["label"] for item in corpus)
valid_labels = set(label_counts.keys())
num_classes = max(valid_labels) + 1

print(f"Classes: {len(valid_labels)}")

type_names = {
    0: "CRYPTOTRANSFER", 3: "CONTRACTCALL", 4: "CONSENSUSSUBMITMESSAGE",
    5: "TOKENMINT", 6: "TOKENBURN", 7: "ETHEREUMTRANSACTION",
    8: "SCHEDULECREATE", 9: "SCHEDULESIGN", 10: "CRYPTOAPPROVEALLOWANCE",
    11: "CRYPTOCREATEACCOUNT", 12: "CRYPTOUPDATEACCOUNT", 13: "FILECREATE",
    14: "FILEUPDATE", 18: "FREEZE",
}

X = np.arange(len(corpus))
y = np.array([item["label"] for item in corpus])

results = []

for seed in SEEDS:
    print(f"\n{'='*40} Seed {seed} {'='*40}")
    
    sss = StratifiedShuffleSplit(n_splits=1, test_size=0.2, random_state=seed)
    train_idx, test_idx = next(sss.split(X, y))
    
    train_raw = [corpus[i] for i in train_idx]
    test_raw = [corpus[i] for i in test_idx]
    
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
    
    train_features, train_labels, feature_names, _ = prepare_classification_examples(train_balanced)
    test_features, test_labels, _, _ = prepare_classification_examples(test_raw, feature_names=feature_names)
    
    real_labels = torch.tensor([item["label"] for item in train_raw])
    weights = compute_class_weights(real_labels, num_classes, max_weight=1.5)
    
    # Train with scheduler
    torch.manual_seed(seed)
    if DEVICE.type == "cuda":
        torch.cuda.manual_seed_all(seed)
    
    model = BitLatticeModelPyTorch(
        lattice_size=120, vocabulary_size=128,
        num_features=train_features.shape[1], num_classes=num_classes, device=str(DEVICE)
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
        
        if epoch % 10 == 0:
            model.eval()
            with torch.no_grad():
                test_logits, _ = model(test_features.to(DEVICE))
                test_acc = (test_logits.argmax(1) == test_labels.to(DEVICE)).float().mean().item()
            print(f"  Epoch {epoch:2d}: acc={test_acc:.3f}, lr={scheduler.get_last_lr()[0]:.6f}")
    
    # Final eval
    model.eval()
    with torch.no_grad():
        test_logits, _ = model(test_features.to(DEVICE))
        preds = test_logits.argmax(1).cpu()
        test_acc = (preds == test_labels).float().mean().item()
    
    test_labels_list = test_labels.tolist()
    majority_baseline = test_labels_list.count(max(set(test_labels_list), key=test_labels_list.count)) / len(test_labels_list)
    
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
    
    print(f"FINAL: Acc={test_acc:.3f}, Baseline={majority_baseline:.3f}, Impr=+{test_acc-majority_baseline:.3f}")

# Summary
print(f"\n{'='*60}")
print("FINAL SUMMARY")
print(f"{'='*60}")

accs = [r["test_acc"] for r in results]
print(f"Accuracy:    {np.mean(accs):.3f} ± {np.std(accs):.3f} (range: {np.min(accs):.3f}-{np.max(accs):.3f})")

for c in sorted(valid_labels):
    recalls = [r["per_class"][c] for r in results if c in r["per_class"]]
    if recalls:
        name = type_names.get(c, f"class_{c}")
        print(f"  {name:25s}: {np.mean(recalls)*100:5.1f}% ± {np.std(recalls)*100:4.1f}%")

summary = {
    "dataset": "mainnet_5k_14classes_v2",
    "epochs": EPOCHS,
    "lr": LR,
    "accuracy": {"mean": float(np.mean(accs)), "std": float(np.std(accs))},
    "runs": results,
}
with open("/home/vera-live-0-1/hedera-llm-api/mainnet_5k_14classes_v2_results.json", 'w') as f:
    json.dump(summary, f, indent=2)
print("\nSaved to mainnet_5k_14classes_v2_results.json")
