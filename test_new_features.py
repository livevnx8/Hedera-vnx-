#!/usr/bin/env python3
"""
Quick test: Fetch 5K real transactions with fixed pagination + new features,
train BitLattice for 20 epochs, compare accuracy with old baseline.
"""

import json
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import torch
import torch.nn.functional as F

from starlit.hedera_real_data_fetcher import HederaDataFetcher, extract_features_from_real_transaction
from starlit.bitlattice_model_pytorch import (
    BitLatticeModelPyTorch,
    prepare_classification_examples,
    split_classification_corpus,
    compute_class_weights,
)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
SEED = 42
EPOCHS = 20
BATCH_SIZE = 32

print(f"Device: {DEVICE}")
print("Fetching 5,000 real transactions with fixed pagination...")

fetcher = HederaDataFetcher(network="testnet")
# Fetch all transaction types to get diversity
transactions = fetcher.fetch_transactions(limit=5000)

print(f"Total fetched: {len(transactions)}")
print(f"Type distribution: {Counter(t.get('name', 'UNKNOWN') for t in transactions)}")

# Create classification corpus
print("\nCreating classification corpus with 20 real features...")
corpus = []
for tx in transactions:
    features = extract_features_from_real_transaction(tx)
    tx_type = tx.get("name", "UNKNOWN")
    type_map = {
        "CRYPTOTRANSFER": 0,
        "TOKENCREATE": 1,
        "TOKENTRANSFER": 2,
        "CONTRACTCALL": 3,
        "CONSENSUSSUBMITMESSAGE": 4,
        "TOKENMINT": 5,
        "SYSTEMDELETE": 6,
        "SYSTEMUNDELETE": 7,
        "FREEZE": 8,
        "UNFREEZE": 9,
    }
    label = type_map.get(tx_type, 0)
    corpus.append({
        "features": features,
        "label": label,
    })

# Filter to only classes with enough samples
label_counts = Counter(item["label"] for item in corpus)
print(f"Label distribution: {dict(label_counts)}")

# Keep only classes with >= 10 samples
valid_labels = {label for label, count in label_counts.items() if count >= 10}
filtered_corpus = [item for item in corpus if item["label"] in valid_labels]
print(f"Filtered corpus size: {len(filtered_corpus)} (removed rare classes)")

# Save corpus
output_path = Path("/home/vera-live-0-1/hedera-llm-api/data/real_5k_newfeatures_corpus.json")
output_path.parent.mkdir(exist_ok=True)
with open(output_path, 'w') as f:
    json.dump(filtered_corpus, f)
print(f"Saved to {output_path}")

# Quick train-test
print(f"\n{'='*60}")
print("Quick training test (20 epochs)")
print(f"{'='*60}")

torch.manual_seed(SEED)
if DEVICE.type == "cuda":
    torch.cuda.manual_seed_all(SEED)

splits = split_classification_corpus(filtered_corpus, seed=SEED)
train_features, train_labels, feature_names, _ = prepare_classification_examples(splits["train"])
test_features, test_labels, _, _ = prepare_classification_examples(splits["test"], feature_names=feature_names)

num_classes = max(valid_labels) + 1
print(f"Features: {train_features.shape[1]}, Classes: {num_classes}")
print(f"Train: {len(train_features)}, Test: {len(test_features)}")

# Class weights
weights = compute_class_weights(train_labels, num_classes, max_weight=1.5)
print(f"Class weights: {weights.tolist()}")

model = BitLatticeModelPyTorch(
    lattice_size=120, vocabulary_size=128,
    num_features=train_features.shape[1], num_classes=num_classes, device=str(DEVICE)
)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

train_ds = torch.utils.data.TensorDataset(train_features, train_labels)
train_loader = torch.utils.data.DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)

for epoch in range(EPOCHS):
    model.train()
    epoch_loss = 0.0
    for batch_x, batch_y in train_loader:
        batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
        optimizer.zero_grad()
        logits, _ = model(batch_x)
        loss = F.cross_entropy(logits, batch_y, weight=weights.to(DEVICE))
        loss.backward()
        optimizer.step()
        epoch_loss += loss.item()
    
    # Evaluate
    model.eval()
    with torch.no_grad():
        test_logits, _ = model(test_features.to(DEVICE))
        test_acc = (test_logits.argmax(1) == test_labels.to(DEVICE)).float().mean().item()
    
    if epoch % 5 == 0 or epoch == EPOCHS - 1:
        print(f"Epoch {epoch:2d}: loss={epoch_loss/len(train_loader):.4f}, test_acc={test_acc:.3f}")

# Per-class recall
model.eval()
with torch.no_grad():
    preds = test_logits.argmax(1).cpu()
    print(f"\nPer-class recall:")
    for c in sorted(valid_labels):
        mask = test_labels == c
        if mask.sum() > 0:
            recall = (preds[mask] == c).float().mean().item()
            matching_types = [k for k, v in type_map.items() if v == c]
            class_name = matching_types[0] if matching_types else f"class_{c}"
            print(f"  {class_name:25s}: {recall*100:.1f}% ({mask.sum()} samples)")

print(f"\nFinal test accuracy: {test_acc:.3f}")
print(f"Compare to old baseline: ~44.8% (mixed corpus)")
