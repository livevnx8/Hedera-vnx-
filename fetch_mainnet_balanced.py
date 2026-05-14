#!/usr/bin/env python3
"""
Fetch mainnet transactions with account-based strategy for diversity.
Balance classes at data level via oversampling + weighted loss.
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

from starlit.hedera_real_data_fetcher import HederaDataFetcher, extract_features_from_real_transaction
from starlit.bitlattice_model_pytorch import (
    BitLatticeModelPyTorch,
    prepare_classification_examples,
    split_classification_corpus,
    compute_class_weights,
)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

print(f"Device: {DEVICE}")
print("=" * 60)
print("FETCHING MAINNET DATA WITH ACCOUNT-BASED STRATEGY")
print("=" * 60)

# Step 1: Fetch diverse mainnet transactions
fetcher = HederaDataFetcher(network="mainnet")

# Fetch all types to get diversity
print("\n[1/3] Fetching 3,000 mainnet transactions...")
mainnet_tx = fetcher.fetch_transactions(limit=3000)
print(f"Total: {len(mainnet_tx)}")
print(f"Types: {Counter(t.get('name', 'UNKNOWN') for t in mainnet_tx)}")

# Step 2: Fetch by account for additional diversity
print("\n[2/3] Fetching by top accounts...")
# Get unique accounts from first batch
accounts = set()
for tx in mainnet_tx[:500]:
    account = tx.get("account", tx.get("entity_id", ""))
    if account and account != "0.0.0":
        accounts.add(account)

top_accounts = list(accounts)[:20]  # Fetch from top 20 accounts
print(f"Found {len(top_accounts)} unique accounts")

account_tx = []
for account in top_accounts:
    try:
        # Fetch transactions for this account
        endpoint = f"{fetcher.base_url}/accounts/{account}/transactions"
        response = fetcher.session.get(endpoint, params={"limit": 100}, timeout=10)
        if response.status_code == 200:
            data = response.json()
            txs = data.get("transactions", [])
            account_tx.extend(txs)
            print(f"  Account {account}: {len(txs)} tx")
    except Exception as e:
        print(f"  Account {account}: error - {e}")
    time.sleep(0.2)

print(f"Account-based tx: {len(account_tx)}")

# Combine and deduplicate
all_tx_ids = set()
unique_tx = []
for tx in mainnet_tx + account_tx:
    tx_id = tx.get("transaction_id", str(id(tx)))
    if tx_id not in all_tx_ids:
        all_tx_ids.add(tx_id)
        unique_tx.append(tx)

print(f"\nTotal unique transactions: {len(unique_tx)}")
print(f"Type distribution: {Counter(t.get('name', 'UNKNOWN') for t in unique_tx)}")

# Step 3: Create corpus with real features
print("\n[3/3] Creating balanced classification corpus...")

type_map = {
    "CRYPTOTRANSFER": 0,
    "TOKENCREATE": 1,
    "TOKENTRANSFER": 2,
    "CONTRACTCALL": 3,
    "CONSENSUSSUBMITMESSAGE": 4,
    "TOKENMINT": 5,
    "TOKENBURN": 6,
    "ETHEREUMTRANSACTION": 7,
    "SCHEDULECREATE": 8,
    "SCHEDULESIGN": 9,
    "CRYPTOAPPROVEALLOWANCE": 10,
    "CRYPTOCREATEACCOUNT": 11,
    "CRYPTODELETE": 12,
    "FILECREATE": 13,
    "FILEUPDATE": 14,
    "TOPICCREATE": 15,
    "TOPICMESSAGE": 16,
    "CONTRACTCREATE": 17,
    "CONTRACTUPDATE": 18,
    "FREEZE": 19,
    "UNFREEZE": 20,
    "SYSTEMDELETE": 21,
    "SYSTEMUNDELETE": 22,
}

corpus = []
for tx in unique_tx:
    features = extract_features_from_real_transaction(tx)
    tx_type = tx.get("name", "UNKNOWN")
    label = type_map.get(tx_type, 0)
    corpus.append({
        "features": features,
        "label": label,
        "tx_id": tx.get("transaction_id", ""),
    })

# Show class distribution
label_counts = Counter(item["label"] for item in corpus)
print(f"Classes found: {len(label_counts)}")
for label, count in sorted(label_counts.items(), key=lambda x: x[1], reverse=True):
    name = [k for k, v in type_map.items() if v == label]
    print(f"  {name[0] if name else f'class_{label}':25s}: {count:5d}")

# Save
output_path = Path("/home/vera-live-0-1/hedera-llm-api/data/mainnet_real_corpus.json")
with open(output_path, 'w') as f:
    json.dump(corpus, f)
print(f"\nSaved to {output_path}")

# Step 4: Quick training with data-level balancing
print(f"\n{'='*60}")
print("TRAINING WITH DATA-LEVEL BALANCING + WEIGHTED LOSS")
print(f"{'='*60}")

# Filter to classes with >= 5 samples
valid_labels = {label for label, count in label_counts.items() if count >= 5}
filtered = [item for item in corpus if item["label"] in valid_labels]

print(f"Filtered to {len(valid_labels)} classes with >= 5 samples: {len(filtered)} total")

# Oversample minority classes to balance
max_count = max(Counter(item["label"] for item in filtered).values())
balanced_corpus = []
for label in valid_labels:
    class_items = [item for item in filtered if item["label"] == label]
    # Oversample with replacement
    n_needed = max_count
    indices = np.random.choice(len(class_items), size=n_needed, replace=True)
    for idx in indices:
        # Make a copy to avoid reference issues
        item = {
            "features": class_items[idx]["features"].copy(),
            "label": class_items[idx]["label"],
        }
        # Add tiny noise to features to avoid exact duplicates
        for key in item["features"]:
            item["features"][key] += np.random.normal(0, 0.001)
        balanced_corpus.append(item)

np.random.shuffle(balanced_corpus)
print(f"Balanced corpus: {len(balanced_corpus)} samples")
print(f"Balanced distribution: {Counter(item['label'] for item in balanced_corpus)}")

# Train
torch.manual_seed(42)
if DEVICE.type == "cuda":
    torch.cuda.manual_seed_all(42)

splits = split_classification_corpus(balanced_corpus, seed=42)
train_features, train_labels, feature_names, _ = prepare_classification_examples(splits["train"])
test_features, test_labels, _, _ = prepare_classification_examples(splits["test"], feature_names=feature_names)

num_classes = max(valid_labels) + 1
print(f"Features: {train_features.shape[1]}, Classes: {num_classes}")

# Combined strategy: data balancing + weighted loss
weights = compute_class_weights(train_labels, num_classes, max_weight=1.5)
print(f"Loss weights: {weights.tolist()}")

model = BitLatticeModelPyTorch(
    lattice_size=120, vocabulary_size=128,
    num_features=train_features.shape[1], num_classes=num_classes, device=str(DEVICE)
)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

train_ds = torch.utils.data.TensorDataset(train_features, train_labels)
train_loader = torch.utils.data.DataLoader(train_ds, batch_size=32, shuffle=True)

for epoch in range(20):
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
    
    model.eval()
    with torch.no_grad():
        test_acc = (model(test_features.to(DEVICE))[0].argmax(1) == test_labels.to(DEVICE)).float().mean().item()
    
    if epoch % 5 == 0 or epoch == 19:
        print(f"Epoch {epoch:2d}: loss={epoch_loss/len(train_loader):.4f}, test_acc={test_acc:.3f}")

# Per-class on balanced test set
model.eval()
with torch.no_grad():
    preds = model(test_features.to(DEVICE))[0].argmax(1).cpu()
    print(f"\nPer-class recall (balanced test set):")
    for c in sorted(valid_labels):
        mask = test_labels == c
        if mask.sum() > 0:
            recall = (preds[mask] == c).float().mean().item()
            names = [k for k, v in type_map.items() if v == c]
            print(f"  {names[0] if names else f'class_{c}':25s}: {recall*100:.1f}% ({mask.sum()} samples)")

print(f"\nFinal accuracy: {test_acc:.3f}")
print(f"Compare to unbalanced: testnet got 96.9% but was 87% majority baseline")
