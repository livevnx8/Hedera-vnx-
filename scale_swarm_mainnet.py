#!/usr/bin/env python3
"""
Scale the Starlit swarm using proven mainnet data pipeline.
Train 14 transaction-type specialists + 4 domain ensemble specialists.
"""

import json
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import torch
import torch.nn.functional as F
import numpy as np

from starlit.bitlattice_model_pytorch import (
    BitLatticeModelPyTorch,
    prepare_classification_examples,
    split_classification_corpus,
    compute_class_weights,
)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
SEEDS = [11, 23, 42, 77, 101]
EPOCHS = 50
LR = 0.005

print(f"Device: {DEVICE}")
print("=" * 70)
print("SCALING THE SWARM - MAINNET REAL DATA")
print("=" * 70)

# Load mainnet corpus
corpus = json.loads(Path("/home/vera-live-0-1/hedera-llm-api/data/mainnet_10k_corpus.json").read_text())
print(f"Loaded {len(corpus)} mainnet transactions")

# Remove leakage
for item in corpus:
    if "transaction_type_idx" in item["features"]:
        del item["features"]["transaction_type_idx"]

# Define transaction type mappings
type_names = {
    0: "CRYPTOTRANSFER", 3: "CONTRACTCALL", 4: "CONSENSUSSUBMITMESSAGE",
    5: "TOKENMINT", 6: "TOKENBURN", 7: "ETHEREUMTRANSACTION",
    8: "SCHEDULECREATE", 9: "SCHEDULESIGN", 10: "CRYPTOAPPROVEALLOWANCE",
    11: "CRYPTOCREATEACCOUNT", 12: "CRYPTOUPDATEACCOUNT", 13: "FILECREATE",
    14: "FILEUPDATE", 18: "FREEZE",
}

# Define domain groupings for swarm hierarchy
DOMAINS = {
    "financial": [0],  # CRYPTOTRANSFER
    "smart_contract": [3, 7],  # CONTRACTCALL, ETHEREUMTRANSACTION
    "token": [5, 6],  # TOKENMINT, TOKENBURN
    "consensus": [4],  # CONSENSUSSUBMITMESSAGE
    "admin": [8, 9, 10, 11, 12, 13, 14, 18],  # Schedule, Crypto, File, Freeze
}

def train_specialist(name, class_filter, corpus_data, seed=42):
    """Train a single specialist on filtered classes."""
    filtered = [item for item in corpus_data if item["label"] in class_filter]
    if len(filtered) < 50:
        print(f"  Skipping {name}: only {len(filtered)} samples")
        return None
    
    # Relabel to contiguous indices
    label_map = {old: new for new, old in enumerate(sorted(class_filter))}
    for item in filtered:
        item["label"] = label_map[item["label"]]
    
    # Split
    torch.manual_seed(seed)
    np.random.seed(seed)
    
    labels = [item["label"] for item in filtered]
    from sklearn.model_selection import train_test_split
    train_idx, test_idx = train_test_split(range(len(filtered)), test_size=0.2, 
                                           stratify=labels, random_state=seed)
    
    train_raw = [filtered[i] for i in train_idx]
    test_raw = [filtered[i] for i in test_idx]
    
    # Balance training
    max_count = max(Counter(item["label"] for item in train_raw).values())
    train_balanced = []
    for label in set(item["label"] for item in train_raw):
        class_items = [item for item in train_raw if item["label"] == label]
        indices = np.random.choice(len(class_items), size=max_count, replace=True)
        for idx in indices:
            item = {"features": class_items[idx]["features"].copy(), "label": class_items[idx]["label"]}
            for key in item["features"]:
                item["features"][key] += np.random.normal(0, 0.001)
            train_balanced.append(item)
    np.random.shuffle(train_balanced)
    
    # Features
    train_features, train_labels, feature_names, _ = prepare_classification_examples(train_balanced)
    test_features, test_labels, _, _ = prepare_classification_examples(test_raw, feature_names=feature_names)
    
    num_classes = len(class_filter)
    real_labels_tensor = torch.tensor([item["label"] for item in train_raw])
    weights = compute_class_weights(real_labels_tensor, num_classes, max_weight=1.5)
    
    # Train
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
    
    # Evaluate
    model.eval()
    with torch.no_grad():
        test_logits, _ = model(test_features.to(DEVICE))
        preds = test_logits.argmax(1).cpu()
        acc = (preds == test_labels).float().mean().item()
    
    return {"model": model, "accuracy": acc, "num_samples": len(filtered), 
            "classes": class_filter, "feature_names": feature_names}

# Phase 1: Train individual transaction-type specialists
print("\n" + "=" * 70)
print("PHASE 1: Training 14 Individual Transaction-Type Specialists")
print("=" * 70)

individual_specialists = {}
for label, name in type_names.items():
    print(f"\nTraining specialist: {name} (class {label})...")
    # Binary classification: this type vs all others
    binary_corpus = []
    for item in corpus:
        binary_item = {
            "features": item["features"].copy(),
            "label": 1 if item["label"] == label else 0
        }
        binary_corpus.append(binary_item)
    
    result = train_specialist(name, [0, 1], binary_corpus, seed=42)
    if result:
        individual_specialists[name] = result
        print(f"  {name}: {result['accuracy']:.3f} accuracy")

# Phase 2: Train domain ensemble specialists
print("\n" + "=" * 70)
print("PHASE 2: Training 4 Domain Ensemble Specialists")
print("=" * 70)

domain_specialists = {}
for domain_name, class_list in DOMAINS.items():
    print(f"\nTraining domain specialist: {domain_name} ({len(class_list)} classes)...")
    domain_corpus = [item for item in corpus if item["label"] in class_list]
    # Relabel
    label_map = {old: new for new, old in enumerate(sorted(class_list))}
    for item in domain_corpus:
        item = {"features": item["features"].copy(), "label": label_map[item["label"]]}
    
    result = train_specialist(domain_name, list(range(len(class_list))), domain_corpus, seed=42)
    if result:
        domain_specialists[domain_name] = result
        print(f"  {domain_name}: {result['accuracy']:.3f} accuracy")

# Phase 3: Full swarm evaluation
print("\n" + "=" * 70)
print("PHASE 3: Full Swarm Evaluation")
print("=" * 70)

# Test ensemble: route to domain specialist first, then to individual
test_items = [item for item in corpus if np.random.random() < 0.2]  # 20% test
np.random.seed(42)
test_items = np.random.choice(corpus, size=min(len(corpus) // 5, 1000), replace=False).tolist()

print(f"Testing ensemble on {len(test_items)} samples...")

correct = 0
for item in test_items:
    features = torch.tensor([[item["features"][k] for k in sorted(item["features"].keys())]], 
                            dtype=torch.float32).to(DEVICE)
    true_label = item["label"]
    
    # Domain routing: which domain does this belong to?
    domain_votes = {}
    for domain_name, domain_spec in domain_specialists.items():
        domain_spec["model"].eval()
        with torch.no_grad():
            logits, _ = domain_spec["model"](features)
            pred = logits.argmax(1).item()
            # Map back to original labels
            original_labels = sorted(DOMAINS[domain_name])
            if pred < len(original_labels):
                predicted_label = original_labels[pred]
                domain_votes[predicted_label] = domain_votes.get(predicted_label, 0) + 1
    
    # Pick the most voted label
    if domain_votes:
        ensemble_label = max(domain_votes.items(), key=lambda x: x[1])[0]
    else:
        ensemble_label = 0
    
    if ensemble_label == true_label:
        correct += 1

ensemble_acc = correct / len(test_items)
print(f"\nEnsemble accuracy: {ensemble_acc:.3f}")

# Summary
print(f"\n{'='*70}")
print("SWARM SCALE SUMMARY")
print(f"{'='*70}")
print(f"Individual specialists: {len(individual_specialists)}")
print(f"Domain specialists: {len(domain_specialists)}")
print(f"Ensemble accuracy: {ensemble_acc:.3f}")
print(f"Total models: {len(individual_specialists) + len(domain_specialists)}")

# Save swarm manifest
manifest = {
    "individual_specialists": {name: {"accuracy": s["accuracy"], "samples": s["num_samples"]} 
                              for name, s in individual_specialists.items()},
    "domain_specialists": {name: {"accuracy": s["accuracy"], "classes": s["classes"], "samples": s["num_samples"]} 
                          for name, s in domain_specialists.items()},
    "ensemble_accuracy": ensemble_acc,
    "total_models": len(individual_specialists) + len(domain_specialists),
}

with open("/home/vera-live-0-1/hedera-llm-api/swarm_manifest.json", 'w') as f:
    json.dump(manifest, f, indent=2)
print(f"\nSaved swarm manifest to swarm_manifest.json")

print(f"\n{'='*70}")
print("SWARM SCALING COMPLETE")
print(f"{'='*70}")
