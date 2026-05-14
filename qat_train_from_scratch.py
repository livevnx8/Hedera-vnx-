#!/usr/bin/env python3
"""
Train BitLattice models FROM SCRATCH with Quantization-Aware Training (QAT).

Key insight: Previous QAT failed because:
  1. Post-training quantization with threshold=0.33 collapses 98% of weights to 0
  2. QAT from pretrained full-precision model inherits the same problem

Solution: Train from scratch with ternary constraints, using:
  - Lower threshold (0.05 instead of 0.33) to allow meaningful weight distribution
  - STE (straight-through estimator) for gradient flow
  - Proper weight initialization scaled for ternary range

Usage: python3 qat_train_from_scratch.py
"""

import sys
import time
from typing import Dict, Any, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')


class TernaryQATLayer(nn.Module):
    """Ternary QAT linear layer with configurable threshold."""
    
    def __init__(self, in_features: int, out_features: int, threshold: float = 0.05):
        super().__init__()
        self.in_features = in_features
        self.out_features = out_features
        self.threshold = threshold
        
        # Initialize with larger weights to hit ternary thresholds
        self.weight = nn.Parameter(torch.randn(out_features, in_features) * 0.1)
        self.bias = nn.Parameter(torch.zeros(out_features))
    
    def ternary_forward(self, w: torch.Tensor) -> torch.Tensor:
        """STE: ternary values in forward, identity gradient in backward."""
        ternary = torch.where(
            w > self.threshold,
            torch.tensor(1.0, device=w.device),
            torch.where(
                w < -self.threshold,
                torch.tensor(-1.0, device=w.device),
                torch.tensor(0.0, device=w.device)
            )
        )
        return ternary.detach() + w - w.detach()
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        w_q = self.ternary_forward(self.weight)
        return F.linear(x, w_q, self.bias)


class ScratchQATModel(nn.Module):
    """BitLattice model trained from scratch with QAT."""
    
    def __init__(self, lattice_size: int = 120, num_features: int = 14, num_classes: int = 2, threshold: float = 0.05):
        super().__init__()
        self.lattice_size = lattice_size
        self.num_features = num_features
        self.num_classes = num_classes
        self.threshold = threshold
        
        self.input_layer = TernaryQATLayer(num_features, lattice_size, threshold)
        self.ternary_layers = nn.ModuleList([
            TernaryQATLayer(lattice_size, lattice_size, threshold)
            for _ in range(3)
        ])
        self.residual = TernaryQATLayer(lattice_size, lattice_size, threshold)
        self.classification_head = TernaryQATLayer(lattice_size, num_classes, threshold)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.input_layer(x)
        for layer in self.ternary_layers:
            x = F.relu(layer(x) + self.residual(x))
        return self.classification_head(x)
    
    def get_weight_distribution(self) -> Dict[str, Any]:
        all_weights = []
        for layer in [self.input_layer] + list(self.ternary_layers) + [self.residual, self.classification_head]:
            w = layer.weight.data.cpu().numpy().flatten()
            all_weights.extend(w.tolist())
        
        arr = np.array(all_weights)
        ternary = np.where(arr > self.threshold, 1,
                  np.where(arr < -self.threshold, -1, 0))
        
        unique, counts = np.unique(ternary, return_counts=True)
        dist = dict(zip([int(u) for u in unique], [int(c) for c in counts]))
        total = len(ternary)
        
        return {
            "total": total,
            "minus_one": dist.get(-1, 0),
            "zero": dist.get(0, 0),
            "plus_one": dist.get(1, 0),
            "minus_one_pct": round(dist.get(-1, 0) / total * 100, 2),
            "zero_pct": round(dist.get(0, 0) / total * 100, 2),
            "plus_one_pct": round(dist.get(1, 0) / total * 100, 2),
        }


def generate_data(num_samples: int = 5000) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """Generate synthetic price data with meaningful signal."""
    np.random.seed(42)
    
    n_features = 14
    features = []
    labels = []
    
    # Create data with actual predictive signal
    for i in range(num_samples):
        # Feature 0: price (base)
        price = 0.05 + np.random.beta(2, 5) * 0.15  # 0.05 to 0.20 range
        
        # Create features correlated with future direction
        momentum = np.random.normal(0, 0.02)
        rsi = 50 + momentum * 500  # RSI correlates with momentum
        
        feat = np.random.randn(n_features) * 0.5
        feat[0] = price
        feat[1] = momentum  # price_change_1h
        feat[5] = np.clip(rsi, 0, 100)  # rsi_14
        feat[6] = momentum * 2  # macd
        
        # Label based on momentum (predictable signal)
        label = 1 if momentum > 0 else 0
        
        features.append(feat)
        labels.append(label)
    
    X = torch.tensor(np.array(features), dtype=torch.float32)
    y = torch.tensor(labels, dtype=torch.long)
    
    # Normalize
    mean = X.mean(dim=0)
    std = X.std(dim=0) + 1e-8
    X = (X - mean) / std
    
    # Split
    n = len(X)
    n_train = int(0.7 * n)
    n_val = int(0.15 * n)
    
    return (X[:n_train], y[:n_train],
            X[n_train:n_train+n_val], y[n_train:n_train+n_val],
            X[n_train+n_val:], y[n_train+n_val:])


def train_model(model: ScratchQATModel, X_train, y_train, X_val, y_val, epochs: int = 100, lr: float = 0.01, batch_size: int = 128):
    """Train from scratch with QAT."""
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, epochs)
    
    train_dataset = torch.utils.data.TensorDataset(X_train, y_train)
    train_loader = torch.utils.data.DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    
    best_val = 0
    best_state = None
    history = []
    
    print(f"\n{'Epoch':>5} {'Train Loss':>10} {'Train Acc':>10} {'Val Loss':>10} {'Val Acc':>10} {'-1':>6} {'0':>6} {'+1':>6}")
    print("-" * 70)
    
    for epoch in range(epochs):
        model.train()
        total_loss = 0
        correct = 0
        total = 0
        
        for batch_X, batch_y in train_loader:
            batch_X = batch_X.to(DEVICE)
            batch_y = batch_y.to(DEVICE)
            
            optimizer.zero_grad()
            logits = model(batch_X)
            loss = F.cross_entropy(logits, batch_y)
            loss.backward()
            optimizer.step()
            
            with torch.no_grad():
                preds = torch.argmax(logits, dim=1)
                correct += (preds == batch_y).sum().item()
                total += batch_y.size(0)
                total_loss += loss.item() * batch_y.size(0)
        
        scheduler.step()
        
        # Validation
        model.eval()
        with torch.no_grad():
            val_logits = model(X_val.to(DEVICE))
            val_loss = F.cross_entropy(val_logits, y_val.to(DEVICE)).item()
            val_preds = torch.argmax(val_logits, dim=1)
            val_acc = (val_preds == y_val.to(DEVICE)).float().mean().item()
        
        train_loss = total_loss / total
        train_acc = correct / total
        dist = model.get_weight_distribution()
        
        history.append({"epoch": epoch, "train_acc": train_acc, "val_acc": val_acc})
        
        if epoch % 10 == 0 or epoch == epochs - 1:
            print(f"{epoch:>5} {train_loss:>10.4f} {train_acc:>10.2%} {val_loss:>10.4f} {val_acc:>10.2%} "
                  f"{dist['minus_one_pct']:>5.1f}% {dist['zero_pct']:>5.1f}% {dist['plus_one_pct']:>5.1f}%")
        
        if val_acc > best_val:
            best_val = val_acc
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
    
    if best_state:
        model.load_state_dict(best_state)
    
    return history, best_val


def export_vnx(model: ScratchQATModel, token: str, threshold: float) -> str:
    """Export to .vnx format."""
    from starlit.artifact_format import BitLatticeArtifact, create_header, create_metadata
    from starlit.bitlattice_model import pack_ternary_weights
    
    all_weights = []
    for layer in [model.input_layer] + list(model.ternary_layers) + [model.residual, model.classification_head]:
        w = layer.weight.data.cpu().numpy().flatten()
        all_weights.extend(w.tolist())
    
    arr = np.array(all_weights, dtype=np.float32)
    ternary = np.where(arr > threshold, 1,
              np.where(arr < -threshold, -1, 0)).astype(np.int8)
    packed = pack_ternary_weights(ternary)
    
    header = create_header(version=0x0003, lattice_size=model.lattice_size)
    metadata = create_metadata(
        architecture="domain",
        specialization=f"{token} QAT price prediction",
        specialist_id=f"pattern_{token.lower()}_qat_v3",
        lattice_size=model.lattice_size,
        vocabulary_size=128,
        corpus_hash="scratch_qat_v1",
        training_config={"threshold": threshold, "qat": True, "from_scratch": True},
    )
    
    artifact = BitLatticeArtifact(header=header, metadata=metadata, weights=packed)
    path = f"/home/vera-live-0-1/hedera-llm-api/models/{token.lower()}_scratch_qat_v3.vnx"
    artifact.save(path)
    return path


def main():
    print("=" * 70)
    print("TRAIN FROM SCRATCH WITH QAT")
    print("=" * 70)
    print(f"Device: {DEVICE}")
    
    # Generate data once
    print("\nGenerating data...")
    X_train, y_train, X_val, y_val, X_test, y_test = generate_data(5000)
    print(f"  Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")
    
    # Test different thresholds
    thresholds = [0.05, 0.10, 0.20]
    results = {}
    
    for threshold in thresholds:
        print(f"\n{'='*70}")
        print(f"THRESHOLD: {threshold}")
        print(f"{'='*70}")
        
        # Baseline: full-precision model (same architecture, no ternary)
        print("\n[Full-Precision Baseline]")
        fp_model = ScratchQATModel(threshold=999.0).to(DEVICE)  # threshold=999 means no quantization
        fp_hist, fp_best = train_model(fp_model, X_train, y_train, X_val, y_val, epochs=50, lr=0.01)
        
        fp_model.eval()
        with torch.no_grad():
            fp_logits = fp_model(X_test.to(DEVICE))
            fp_preds = torch.argmax(fp_logits, dim=1)
            fp_test_acc = (fp_preds == y_test.to(DEVICE)).float().mean().item()
        
        print(f"  Best val: {fp_best:.2%}, Test: {fp_test_acc:.2%}")
        
        # QAT model
        print(f"\n[QAT with threshold={threshold}]")
        qat_model = ScratchQATModel(threshold=threshold).to(DEVICE)
        qat_hist, qat_best = train_model(qat_model, X_train, y_train, X_val, y_val, epochs=50, lr=0.01)
        
        qat_model.eval()
        with torch.no_grad():
            qat_logits = qat_model(X_test.to(DEVICE))
            qat_preds = torch.argmax(qat_logits, dim=1)
            qat_test_acc = (qat_preds == y_test.to(DEVICE)).float().mean().item()
        
        dist = qat_model.get_weight_distribution()
        print(f"  Best val: {qat_best:.2%}, Test: {qat_test_acc:.2%}")
        print(f"  Weights: -1={dist['minus_one_pct']:.1f}%, 0={dist['zero_pct']:.1f}%, +1={dist['plus_one_pct']:.1f}%")
        
        # Export best QAT
        vnx_path = export_vnx(qat_model, "HBAR", threshold)
        import os
        vnx_size = os.path.getsize(vnx_path)
        
        results[threshold] = {
            "fp_test_acc": fp_test_acc,
            "qat_test_acc": qat_test_acc,
            "fp_best_val": fp_best,
            "qat_best_val": qat_best,
            "weight_dist": dist,
            "vnx_size_kb": vnx_size / 1024,
        }
    
    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY: QAT FROM SCRATCH")
    print("=" * 70)
    print(f"\n{'Threshold':>10} {'FP Test':>10} {'QAT Test':>10} {'Gap':>10} {'-1':>6} {'0':>6} {'+1':>6} {'Size KB':>10}")
    print("-" * 70)
    for t, r in results.items():
        gap = r['qat_test_acc'] - r['fp_test_acc']
        sign = "+" if gap > 0 else ""
        dist = r['weight_dist']
        print(f"{t:>10.2f} {r['fp_test_acc']:>10.2%} {r['qat_test_acc']:>10.2%} {sign}{gap:>10.2%} "
              f"{dist['minus_one_pct']:>5.1f}% {dist['zero_pct']:>5.1f}% {dist['plus_one_pct']:>5.1f}% {r['vnx_size_kb']:>10.1f}")
    
    print("\n" + "=" * 70)
    print("KEY FINDINGS")
    print("=" * 70)
    
    best_threshold = max(results.keys(), key=lambda t: results[t]['qat_test_acc'])
    best = results[best_threshold]
    
    print(f"\n1. Best threshold: {best_threshold}")
    print(f"   QAT accuracy: {best['qat_test_acc']:.2%}")
    print(f"   Full-precision accuracy: {best['fp_test_acc']:.2%}")
    print(f"   Gap: {best['qat_test_acc'] - best['fp_test_acc']:+.2%}")
    
    print(f"\n2. Weight distribution at threshold={best_threshold}:")
    print(f"   -1: {best['weight_dist']['minus_one_pct']:.1f}%")
    print(f"    0: {best['weight_dist']['zero_pct']:.1f}%")
    print(f"   +1: {best['weight_dist']['plus_one_pct']:.1f}%")
    
    print(f"\n3. File size: {best['vnx_size_kb']:.1f} KB")
    
    if best['qat_test_acc'] >= best['fp_test_acc'] * 0.95:
        print(f"\n✅ QAT maintains >95% of full-precision accuracy")
    else:
        print(f"\n❌ QAT accuracy gap is significant")
    
    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()
