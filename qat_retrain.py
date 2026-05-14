#!/usr/bin/env python3
"""
Quantization-Aware Training (QAT) for BitLattice models.

Retrains existing PyTorch models with ternary quantization during forward pass,
using straight-through estimator (STE) to maintain gradient flow.

Key difference from post-training quantization:
  - Forward: uses ternary weights {-1, 0, +1}
  - Backward: gradients flow to full-precision weights
  - Optimizer: updates full-precision weights
  - NO permanent quantization of stored weights

Usage: python3 qat_retrain.py
"""

import sys
import time
from pathlib import Path
from typing import Dict, Any, List, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

from starlit.bitlattice_model_pytorch import BitLatticeModelPyTorch

DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')


class TernaryQATLayer(nn.Module):
    """
    Ternary QAT linear layer.
    Forward uses ternary weights (STE), backward updates full-precision.
    """
    
    def __init__(self, in_features: int, out_features: int, threshold: float = 0.33):
        super().__init__()
        self.in_features = in_features
        self.out_features = out_features
        self.threshold = threshold
        
        # Full-precision weights (always kept)
        self.weight = nn.Parameter(torch.randn(out_features, in_features) * 0.01)
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
        # STE: return ternary value, but gradient flows through w
        return ternary.detach() + w - w.detach()
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Use ternary weights for forward, but gradients flow to full-precision
        w_q = self.ternary_forward(self.weight)
        return F.linear(x, w_q, self.bias)


class QATBitLatticeModel(nn.Module):
    """
    BitLattice model with all layers replaced by ternary QAT layers.
    """
    
    def __init__(
        self,
        lattice_size: int = 120,
        num_features: int = 14,
        num_classes: int = 2,
        threshold: float = 0.33,
    ):
        super().__init__()
        self.lattice_size = lattice_size
        self.num_features = num_features
        self.num_classes = num_classes
        self.threshold = threshold
        
        # All layers are QAT layers
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
        """Get ternary weight distribution stats."""
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
            "total_weights": total,
            "minus_one": dist.get(-1, 0),
            "zero": dist.get(0, 0),
            "plus_one": dist.get(1, 0),
            "minus_one_pct": round(dist.get(-1, 0) / total * 100, 2),
            "zero_pct": round(dist.get(0, 0) / total * 100, 2),
            "plus_one_pct": round(dist.get(1, 0) / total * 100, 2),
        }


def load_original_model(model_path: str) -> Tuple[BitLatticeModelPyTorch, Dict]:
    """Load original PyTorch model from checkpoint."""
    checkpoint = torch.load(model_path, map_location=DEVICE)
    state = checkpoint.get("model_state_dict", checkpoint)
    
    # Infer architecture from weights
    input_w = state["input_layer.weight"]
    lattice_size = input_w.shape[0]
    num_features = input_w.shape[1]
    num_classes = state["classification_head.weight"].shape[0]
    
    model = BitLatticeModelPyTorch(
        lattice_size=lattice_size,
        vocabulary_size=128,
        num_features=num_features,
        num_classes=num_classes,
        device=str(DEVICE)
    )
    model.load_state_dict(state)
    model.eval()
    
    return model, checkpoint


def create_qat_from_original(original: BitLatticeModelPyTorch, threshold: float = 0.33) -> QATBitLatticeModel:
    """Create QAT model initialized from original model weights."""
    qat = QATBitLatticeModel(
        lattice_size=original.lattice_size,
        num_features=original.num_features,
        num_classes=original.num_classes,
        threshold=threshold,
    ).to(DEVICE)
    
    # Copy weights from original
    qat.input_layer.weight.data = original.input_layer.weight.data.clone()
    qat.input_layer.bias.data = original.input_layer.bias.data.clone()
    
    for i, layer in enumerate(original.ternary_layers):
        qat.ternary_layers[i].weight.data = layer.weight.data.clone()
        qat.ternary_layers[i].bias.data = layer.bias.data.clone()
    
    qat.residual.weight.data = original.residual.weight.data.clone()
    qat.residual.bias.data = original.residual.bias.data.clone()
    
    qat.classification_head.weight.data = original.classification_head.weight.data.clone()
    qat.classification_head.bias.data = original.classification_head.bias.data.clone()
    
    return qat


def generate_training_data(
    num_samples: int = 2000,
    num_features: int = 14,
    feature_names: List[str] = None,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """Generate synthetic price prediction training data."""
    if feature_names is None:
        feature_names = [
            "price", "price_change_1h", "price_change_24h", "volume",
            "volume_change", "rsi_14", "macd", "sma_7", "sma_30",
            "ema_12", "ema_26", "high_low_range", "body_size",
            "bollinger_position",
        ]
    
    np.random.seed(42)
    
    features = []
    labels = []
    
    # Base price with trend
    base_price = 0.0957
    
    for i in range(num_samples):
        # Simulate price movement
        trend = np.sin(i / 100) * 0.02  # Cyclical trend
        noise = np.random.normal(0, 0.005)
        price = base_price + trend + noise
        
        # Feature vector
        feat = {
            "price": price,
            "price_change_1h": np.random.normal(0.001, 0.01),
            "price_change_24h": np.random.normal(0.01, 0.03),
            "volume": np.random.lognormal(15, 1),
            "volume_change": np.random.normal(0, 0.1),
            "rsi_14": np.clip(50 + np.random.normal(0, 15), 10, 90),
            "macd": np.random.normal(0, 0.001),
            "sma_7": price * (1 + np.random.normal(0, 0.01)),
            "sma_30": price * (1 + np.random.normal(0, 0.02)),
            "ema_12": price * (1 + np.random.normal(0, 0.015)),
            "ema_26": price * (1 + np.random.normal(0, 0.02)),
            "high_low_range": abs(np.random.normal(0, 0.02)),
            "body_size": abs(np.random.normal(0, 0.005)),
            "bollinger_position": np.clip(np.random.normal(0.5, 0.2), 0, 1),
        }
        
        # Label: 1 if next price up, 0 if down
        next_return = np.random.normal(0.001, 0.02)
        label = 1 if next_return > 0 else 0
        
        features.append([feat.get(k, 0) for k in feature_names])
        labels.append(label)
    
    X = torch.tensor(features, dtype=torch.float32)
    y = torch.tensor(labels, dtype=torch.long)
    
    # Normalize features
    mean = X.mean(dim=0)
    std = X.std(dim=0) + 1e-8
    X = (X - mean) / std
    
    return X, y


def train_qat(
    model: QATBitLatticeModel,
    X_train: torch.Tensor,
    y_train: torch.Tensor,
    X_val: torch.Tensor,
    y_val: torch.Tensor,
    epochs: int = 50,
    lr: float = 0.001,
    batch_size: int = 64,
) -> Dict[str, Any]:
    """Train QAT model with ternary forward."""
    
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, epochs)
    
    train_dataset = torch.utils.data.TensorDataset(X_train, y_train)
    train_loader = torch.utils.data.DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    
    history = []
    best_val_acc = 0
    best_state = None
    
    print(f"\n{'Epoch':>6} {'Train Loss':>10} {'Train Acc':>10} {'Val Loss':>10} {'Val Acc':>10} {'-1':>6} {'0':>6} {'+1':>6}")
    print("-" * 70)
    
    for epoch in range(epochs):
        model.train()
        total_loss = 0
        total_correct = 0
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
                total_correct += (preds == batch_y).sum().item()
                total += batch_y.size(0)
                total_loss += loss.item() * batch_y.size(0)
        
        scheduler.step()
        
        train_loss = total_loss / total
        train_acc = total_correct / total
        
        # Validation
        model.eval()
        with torch.no_grad():
            val_logits = model(X_val.to(DEVICE))
            val_loss = F.cross_entropy(val_logits, y_val.to(DEVICE)).item()
            val_preds = torch.argmax(val_logits, dim=1)
            val_acc = (val_preds == y_val.to(DEVICE)).float().mean().item()
        
        # Weight distribution
        dist = model.get_weight_distribution()
        
        history.append({
            "epoch": epoch,
            "train_loss": train_loss,
            "train_acc": train_acc,
            "val_loss": val_loss,
            "val_acc": val_acc,
        })
        
        if epoch % 5 == 0 or epoch == epochs - 1:
            print(f"{epoch:>6} {train_loss:>10.4f} {train_acc:>10.2%} {val_loss:>10.4f} {val_acc:>10.2%} "
                  f"{dist['minus_one_pct']:>5.1f}% {dist['zero_pct']:>5.1f}% {dist['plus_one_pct']:>5.1f}%")
        
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
    
    # Restore best
    if best_state:
        model.load_state_dict(best_state)
    
    return {
        "history": history,
        "best_val_acc": best_val_acc,
        "final_weight_dist": model.get_weight_distribution(),
    }


def test_inference_speed(model: nn.Module, X_test: torch.Tensor, runs: int = 100) -> float:
    """Test inference speed in microseconds."""
    model.eval()
    X_test = X_test.to(DEVICE)
    
    # Warmup
    with torch.no_grad():
        for _ in range(10):
            _ = model(X_test[:1])
    
    torch.cuda.synchronize() if DEVICE.type == 'cuda' else None
    start = time.perf_counter()
    
    with torch.no_grad():
        for _ in range(runs):
            _ = model(X_test[:1])
    
    torch.cuda.synchronize() if DEVICE.type == 'cuda' else None
    elapsed = (time.perf_counter() - start) / runs * 1e6  # microseconds
    
    return elapsed


def export_vnx_qat(model: QATBitLatticeModel, token: str) -> str:
    """Export QAT model to .vnx format with proper ternary packing."""
    from starlit.artifact_format import BitLatticeArtifact, create_header, create_metadata
    from starlit.bitlattice_model import pack_ternary_weights
    
    # Collect all weights
    all_weights = []
    for layer in [model.input_layer] + list(model.ternary_layers) + [model.residual, model.classification_head]:
        w = layer.weight.data.cpu().numpy().flatten()
        all_weights.extend(w.tolist())
    
    arr = np.array(all_weights, dtype=np.float32)
    
    # Ternarize for export
    ternary = np.where(arr > model.threshold, 1,
              np.where(arr < -model.threshold, -1, 0)).astype(np.int8)
    
    # Pack to bytes
    packed = pack_ternary_weights(ternary)
    
    # Create artifact
    header = create_header(version=0x0003, lattice_size=model.lattice_size)
    metadata = create_metadata(
        architecture="domain",
        specialization=f"{token} price prediction (QAT)",
        specialist_id=f"pattern_{token.lower()}_price_qat",
        lattice_size=model.lattice_size,
        vocabulary_size=128,
        corpus_hash="qat_retrain_v1",
        training_config={
            "threshold": model.threshold,
            "num_features": model.num_features,
            "num_classes": model.num_classes,
            "qat": True,
        },
    )
    
    artifact = BitLatticeArtifact(
        header=header,
        metadata=metadata,
        weights=packed,
    )
    
    output_path = f"/home/vera-live-0-1/hedera-llm-api/models/{token}_qat_v3.vnx"
    artifact.save(output_path)
    
    return output_path


def main():
    print("=" * 70)
    print("QUANTIZATION-AWARE TRAINING (QAT) FOR BITLATTICE MODELS")
    print("=" * 70)
    print(f"Device: {DEVICE}")
    
    tokens = ["HBAR", "SAUCE", "DOVU"]
    results = {}
    
    for token in tokens:
        model_path = f"/home/vera-live-0-1/hedera-llm-api/models/{token.lower()}_production.pt"
        
        if not Path(model_path).exists():
            print(f"\n[!] {model_path} not found, skipping {token}")
            continue
        
        print(f"\n{'='*70}")
        print(f"TOKEN: {token}")
        print(f"{'='*70}")
        
        # Load original
        print("\n[1] Loading original model...")
        original, checkpoint = load_original_model(model_path)
        print(f"    Features: {original.num_features}")
        print(f"    Lattice: {original.lattice_size}")
        print(f"    Classes: {original.num_classes}")
        
        # Generate data
        print("\n[2] Generating training data...")
        feature_names = checkpoint.get("feature_keys", None)
        X, y = generate_training_data(num_samples=2000, num_features=original.num_features, feature_names=feature_names)
        
        # Split
        n_train = int(0.7 * len(X))
        n_val = int(0.15 * len(X))
        X_train, y_train = X[:n_train], y[:n_train]
        X_val, y_val = X[n_train:n_train+n_val], y[n_train:n_train+n_val]
        X_test, y_test = X[n_train+n_val:], y[n_train+n_val:]
        print(f"    Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")
        
        # Test original accuracy
        print("\n[3] Testing original model...")
        original.eval()
        with torch.no_grad():
            orig_out = original(X_test.to(DEVICE))
            orig_logits = orig_out[0] if isinstance(orig_out, tuple) else orig_out
            preds = torch.argmax(orig_logits, dim=1)
            original_acc = (preds == y_test.to(DEVICE)).float().mean().item()
        print(f"    Original accuracy: {original_acc:.2%}")
        
        # Create QAT model
        print("\n[4] Creating QAT model from original...")
        qat = create_qat_from_original(original, threshold=0.33)
        dist_before = qat.get_weight_distribution()
        print(f"    Weight distribution (before training):")
        print(f"      -1: {dist_before['minus_one_pct']:.1f}%")
        print(f"       0: {dist_before['zero_pct']:.1f}%")
        print(f"      +1: {dist_before['plus_one_pct']:.1f}%")
        
        # Train QAT
        print("\n[5] Training with QAT (ternary forward + STE)...")
        train_result = train_qat(qat, X_train, y_train, X_val, y_val, epochs=30, lr=0.001)
        
        # Test QAT accuracy
        print("\n[6] Testing QAT model...")
        qat.eval()
        with torch.no_grad():
            test_logits = qat(X_test.to(DEVICE))
            test_preds = torch.argmax(test_logits, dim=1)
            qat_acc = (test_preds == y_test.to(DEVICE)).float().mean().item()
        
        dist_after = qat.get_weight_distribution()
        print(f"    QAT accuracy: {qat_acc:.2%}")
        print(f"    Weight distribution (after training):")
        print(f"      -1: {dist_after['minus_one_pct']:.1f}%")
        print(f"       0: {dist_after['zero_pct']:.1f}%")
        print(f"      +1: {dist_after['plus_one_pct']:.1f}%")
        
        # Speed test
        print("\n[7] Speed comparison...")
        orig_speed = test_inference_speed(original, X_test)
        qat_speed = test_inference_speed(qat, X_test)
        print(f"    Original: {orig_speed:.1f} μs")
        print(f"    QAT:      {qat_speed:.1f} μs")
        
        # Export
        print("\n[8] Exporting to .vnx...")
        vnx_path = export_vnx_qat(qat, token.lower())
        print(f"    Saved: {vnx_path}")
        
        # File size comparison
        import os
        orig_size = os.path.getsize(model_path)
        vnx_size = os.path.getsize(vnx_path)
        print(f"    Original: {orig_size/1024:.1f} KB")
        print(f"    QAT .vnx: {vnx_size/1024:.1f} KB")
        print(f"    Compression: {orig_size/vnx_size:.1f}x")
        
        results[token] = {
            "original_acc": original_acc,
            "qat_acc": qat_acc,
            "acc_change": qat_acc - original_acc,
            "orig_speed_us": orig_speed,
            "qat_speed_us": qat_speed,
            "compression": orig_size / vnx_size,
            "weight_dist": dist_after,
        }
    
    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"\n{'Token':<10} {'Orig Acc':<10} {'QAT Acc':<10} {'Change':<10} {'Compress':<10}")
    print("-" * 60)
    for token, r in results.items():
        change = r['acc_change']
        sign = "+" if change > 0 else ""
        print(f"{token:<10} {r['original_acc']:<10.2%} {r['qat_acc']:<10.2%} {sign}{change:<10.2%} {r['compression']:<10.1f}x")
    
    print("\n" + "=" * 70)
    print("QAT RETRAINING COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
