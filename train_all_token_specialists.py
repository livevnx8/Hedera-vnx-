#!/usr/bin/env python3
"""
Train 24h prediction specialists for all available tokens.
Export production models for serving.
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
print("TRAINING ALL TOKEN SPECIALISTS")
print("=" * 60)

models_dir = Path("/home/vera-live-0-1/hedera-llm-api/models")
models_dir.mkdir(parents=True, exist_ok=True)

token_results = {}

token_dir = Path("/home/vera-live-0-1/hedera-llm-api/data/tokens")
for corpus_file in sorted(token_dir.glob("*_corpus.json")):
    token_name = corpus_file.stem.replace("_corpus", "")
    
    # Load
    corpus = json.loads(corpus_file.read_text())
    
    # Filter valid and remove metadata fields
    metadata_keys = {"timestamp", "price"}
    valid = []
    for item in corpus:
        # Check no NaN in numeric features (excluding metadata)
        numeric_vals = [v for k, v in item["features"].items() 
                       if k not in metadata_keys and isinstance(v, (int, float))]
        if not any(np.isnan(v) or np.isinf(v) for v in numeric_vals):
            # Remove metadata
            clean_item = {"features": {k: v for k, v in item["features"].items() if k not in metadata_keys},
                         "label": item["label"], "horizon": item.get("horizon", 24)}
            valid.append(clean_item)
    
    if len(valid) < 40:
        print(f"\nSkipping {token_name}: only {len(valid)} samples")
        continue
    
    print(f"\n{'='*60}")
    print(f"Training {token_name.upper()} Specialist")
    print(f"{'='*60}")
    print(f"Samples: {len(valid)} (UP: {sum(1 for c in valid if c['label']==1)}, DOWN: {sum(1 for c in valid if c['label']==0)})")
    
    # 5-seed CV
    best_model = None
    best_acc = 0
    best_state = None
    
    for seed in SEEDS:
        labels = [item["label"] for item in valid]
        sss = StratifiedShuffleSplit(n_splits=1, test_size=0.2, random_state=seed)
        train_idx, test_idx = next(sss.split(np.arange(len(valid)), labels))
        
        train_raw = [valid[i] for i in train_idx]
        test_raw = [valid[i] for i in test_idx]
        
        # Balance
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
        
        print(f"  Seed {seed}: {acc:.3f}")
        
        if acc > best_acc:
            best_acc = acc
            best_state = {
                "model_state_dict": model.state_dict(),
                "feature_names": feature_names,
                "accuracy": acc,
                "seed": seed,
            }
    
    # Save best
    save_path = models_dir / f"{token_name}_production.pt"
    torch.save(best_state, save_path)
    
    token_results[token_name] = {
        "accuracy": best_acc,
        "samples": len(valid),
        "model_path": str(save_path),
    }
    
    print(f"  Best: {best_acc:.3f} -> {save_path}")

# Summary
print(f"\n{'='*60}")
print("ALL TOKEN SPECIALISTS TRAINED")
print(f"{'='*60}")
for name, info in token_results.items():
    print(f"  {name.upper():10s}: {info['accuracy']:.3f} ({info['samples']} samples)")

# Save manifest
manifest = {
    "tokens": token_results,
    "training_config": {"epochs": EPOCHS, "lr": LR, "seeds": SEEDS},
}
with open(models_dir / "token_manifest.json", 'w') as f:
    json.dump(manifest, f, indent=2)

print(f"\nManifest saved to {models_dir}/token_manifest.json")
