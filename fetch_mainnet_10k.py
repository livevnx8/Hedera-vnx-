#!/usr/bin/env python3
"""
Fetch 10K+ mainnet transactions across 15+ transaction types.
Uses per-type filtering to capture rare types that don't appear in bulk queries.
"""

import json
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

from starlit.hedera_real_data_fetcher import HederaDataFetcher, extract_features_from_real_transaction

print("=" * 70)
print("FETCHING 10K+ MAINNET TRANSACTIONS ACROSS 15+ TYPES")
print("=" * 70)

fetcher = HederaDataFetcher(network="mainnet")

# Transaction types to fetch with target counts
TYPE_TARGETS = {
    "CRYPTOTRANSFER": 2000,
    "CONTRACTCALL": 1500,
    "ETHEREUMTRANSACTION": 500,
    "CONSENSUSSUBMITMESSAGE": 500,
    "TOKENBURN": 300,
    "TOKENMINT": 300,
    "TOKENTRANSFER": 400,
    "TOKENCREATE": 200,
    "CRYPTOCREATEACCOUNT": 300,
    "CRYPTOUPDATEACCOUNT": 200,
    "FILECREATE": 150,
    "FILEUPDATE": 150,
    "TOPICCREATE": 150,
    "CONTRACTCREATE": 200,
    "CONTRACTUPDATE": 150,
    "FREEZE": 100,
    "UNFREEZE": 100,
    "SCHEDULECREATE": 100,
    "SCHEDULESIGN": 100,
    "CRYPTOAPPROVEALLOWANCE": 100,
}

all_transactions = []
seen_ids = set()

# Step 1: Per-type fetching
print("\n[Phase 1] Per-type fetching...")
for tx_type, target in TYPE_TARGETS.items():
    print(f"\nFetching {tx_type} (target: {target})...")
    try:
        txs = fetcher.fetch_transactions(limit=target, transaction_type=tx_type)
        new_count = 0
        for tx in txs:
            tx_id = tx.get("transaction_id", "")
            if tx_id and tx_id not in seen_ids:
                seen_ids.add(tx_id)
                all_transactions.append(tx)
                new_count += 1
        print(f"  Got {len(txs)} total, {new_count} new (unique: {len(all_transactions)})")
    except Exception as e:
        print(f"  Error: {e}")
    time.sleep(0.2)

# Step 2: Bulk fetch to fill remaining quota
remaining = 12000 - len(all_transactions)
if remaining > 0:
    print(f"\n[Phase 2] Bulk fetching {remaining} more transactions...")
    try:
        txs = fetcher.fetch_transactions(limit=remaining)
        new_count = 0
        for tx in txs:
            tx_id = tx.get("transaction_id", "")
            if tx_id and tx_id not in seen_ids:
                seen_ids.add(tx_id)
                all_transactions.append(tx)
                new_count += 1
        print(f"  Got {len(txs)} total, {new_count} new")
    except Exception as e:
        print(f"  Error: {e}")

print(f"\n{'='*70}")
print(f"FETCH COMPLETE: {len(all_transactions)} unique transactions")
print(f"{'='*70}")

# Type distribution
type_counts = Counter(t.get("name", "UNKNOWN") for t in all_transactions)
print(f"\nType distribution:")
for tx_type, count in type_counts.most_common():
    pct = count / len(all_transactions) * 100
    print(f"  {tx_type:30s}: {count:5d} ({pct:5.1f}%)")

# Create classification corpus
print(f"\nCreating classification corpus with real features...")

type_map = {
    "CRYPTOTRANSFER": 0, "TOKENCREATE": 1, "TOKENTRANSFER": 2,
    "CONTRACTCALL": 3, "CONSENSUSSUBMITMESSAGE": 4, "TOKENMINT": 5,
    "TOKENBURN": 6, "ETHEREUMTRANSACTION": 7, "SCHEDULECREATE": 8,
    "SCHEDULESIGN": 9, "CRYPTOAPPROVEALLOWANCE": 10, "CRYPTOCREATEACCOUNT": 11,
    "CRYPTOUPDATEACCOUNT": 12, "FILECREATE": 13, "FILEUPDATE": 14,
    "TOPICCREATE": 15, "CONTRACTCREATE": 16, "CONTRACTUPDATE": 17,
    "FREEZE": 18, "UNFREEZE": 19, "SYSTEMDELETE": 20, "SYSTEMUNDELETE": 21,
}

corpus = []
for tx in all_transactions:
    features = extract_features_from_real_transaction(tx)
    tx_type = tx.get("name", "UNKNOWN")
    label = type_map.get(tx_type, 0)
    corpus.append({
        "features": features,
        "label": label,
        "tx_id": tx.get("transaction_id", ""),
    })

# Filter to classes with >= 10 samples
label_counts = Counter(item["label"] for item in corpus)
valid_labels = {label for label, count in label_counts.items() if count >= 10}
filtered = [item for item in corpus if item["label"] in valid_labels]

print(f"\nAfter filtering (>=10 per class):")
print(f"  Total samples: {len(filtered)}")
print(f"  Classes: {len(valid_labels)}")
for label, count in sorted(label_counts.items(), key=lambda x: x[1], reverse=True):
    if label in valid_labels:
        name = [k for k, v in type_map.items() if v == label]
        print(f"  {name[0] if name else f'class_{label}':30s}: {count:5d}")

# Save
output_path = Path("/home/vera-live-0-1/hedera-llm-api/data/mainnet_10k_corpus.json")
with open(output_path, 'w') as f:
    json.dump(filtered, f)
print(f"\nSaved to {output_path}")
print(f"\n{'='*70}")
print("FETCH COMPLETE")
print(f"{'='*70}")
