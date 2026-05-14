#!/usr/bin/env python3
"""
Larger BitLattice architecture test — 512 vertices, deeper layers, dropout.

Hypothesis: The 120-vertex model is too small to capture price patterns.
This tests 512 vertices with 5 ternary layers + batch normalization + dropout.
"""

import sys
import time
from typing import Dict, Any, Tuple

import numpy as np
import requests
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')


class LargeTernaryLayer(nn.Module):
    """Ternary QAT layer with batch norm."""
    
    def __init__(self, in_features: int, out_features: int, threshold: float = 0.05, use_bn: bool = True):
        super().__init__()
        self.threshold = threshold
        self.use_bn = use_bn
        self.weight = nn.Parameter(torch.randn(out_features, in_features) * 0.1)
        self.bias = nn.Parameter(torch.zeros(out_features))
        if use_bn:
            self.bn = nn.BatchNorm1d(out_features)
    
    def ternary_forward(self, w: torch.Tensor) -> torch.Tensor:
        ternary = torch.where(
            w > self.threshold, torch.tensor(1.0, device=w.device),
            torch.where(w < -self.threshold, torch.tensor(-1.0, device=w.device),
                       torch.tensor(0.0, device=w.device))
        )
        return ternary.detach() + w - w.detach()
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        w_q = self.ternary_forward(self.weight)
        out = F.linear(x, w_q, self.bias)
        if self.use_bn and out.size(0) > 1:
            out = self.bn(out)
        return out


class LargeBitLatticeModel(nn.Module):
    """Large BitLattice: 512 vertices, 5 layers, dropout."""
    
    def __init__(self, lattice_size: int = 512, num_features: int = 14, num_classes: int = 2,
                 threshold: float = 0.05, num_layers: int = 5, dropout: float = 0.2):
        super().__init__()
        self.lattice_size = lattice_size
        self.threshold = threshold
        
        self.input_layer = LargeTernaryLayer(num_features, lattice_size, threshold)
        self.ternary_layers = nn.ModuleList([
            LargeTernaryLayer(lattice_size, lattice_size, threshold)
            for _ in range(num_layers)
        ])
        self.residual = LargeTernaryLayer(lattice_size, lattice_size, threshold)
        self.classification_head = LargeTernaryLayer(lattice_size, num_classes, threshold, use_bn=False)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.input_layer(x)
        x = F.relu(x)
        for layer in self.ternary_layers:
            x = F.relu(layer(x) + self.residual(x))
            x = self.dropout(x)
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


def fetch_hbar_history(days: int = 90) -> list:
    """Fetch HBAR price history."""
    try:
        url = "https://api.coingecko.com/api/v3/coins/hedera-hashgraph/market_chart"
        params = {"vs_currency": "usd", "days": days}
        resp = requests.get(url, params=params, timeout=30)
        data = resp.json()
        prices = [p[1] for p in data.get("prices", [])]
        volumes = [v[1] for v in data.get("total_volumes", [])]
        return [{"price": p, "volume": v} for p, v in zip(prices, volumes)]
    except Exception as e:
        print(f"API error: {e}")
        return []


def compute_features(history: list, idx: int):
    """Compute 14 features."""
    if idx < 30:
        return None
    
    prices = [h["price"] for h in history[max(0, idx-30):idx+1]]
    volumes = [h["volume"] for h in history[max(0, idx-30):idx+1]]
    p = prices[-1]
    p_prev = prices[-2]
    p_day = prices[0] if len(prices) >= 24 else p
    
    deltas = np.diff(prices[-15:])
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)
    avg_gain = np.mean(gains[-14:]) if len(gains) >= 14 else 0
    avg_loss = np.mean(losses[-14:]) if len(losses) >= 14 else 1
    rsi = 100 - (100 / (1 + avg_gain / max(avg_loss, 1e-10)))
    
    ema_12 = np.mean(prices[-12:])
    ema_26 = np.mean(prices[-26:]) if len(prices) >= 26 else np.mean(prices)
    sma_20 = np.mean(prices[-20:])
    std_20 = np.std(prices[-20:])
    bb_pos = (p - (sma_20 - 2*std_20)) / (4*std_20 + 1e-10) if std_20 > 0 else 0.5
    
    feat = np.array([
        p, (p - p_prev) / p_prev if p_prev > 0 else 0,
        (p - p_day) / p_day if p_day > 0 else 0,
        volumes[-1], (volumes[-1] - volumes[-2]) / volumes[-2] if len(volumes) >= 2 and volumes[-2] > 0 else 0,
        rsi, ema_12 - ema_26, np.mean(prices[-7:]),
        np.mean(prices[-30:]) if len(prices) >= 30 else np.mean(prices),
        ema_12, ema_26,
        (max(prices[-7:]) - min(prices[-7:])) / p if p > 0 else 0,
        abs(p - p_prev) / p if p > 0 else 0,
        bb_pos,
    ], dtype=np.float32)
    return feat


def prepare_data(history: list):
    """Prepare real data."""
    features, labels = [], []
    for i in range(len(history) - 1):
        feat = compute_features(history, i)
        if feat is not None:
            label = 1 if history[i + 1]["price"] > history[i]["price"] else 0
            features.append(feat)
            labels.append(label)
    
    X = torch.tensor(np.array(features), dtype=torch.float32)
    y = torch.tensor(labels, dtype=torch.long)
    mean = X.mean(dim=0)
    std = X.std(dim=0) + 1e-8
    X = (X - mean) / std
    
    n = len(X)
    n_train = int(0.7 * n)
    n_val = int(0.15 * n)
    return (X[:n_train], y[:n_train], X[n_train:n_train+n_val], y[n_train:n_train+n_val], X[n_train+n_val:], y[n_train+n_val:])


def train_and_eval(model_class, config, X_train, y_train, X_val, y_val, X_test, y_test, epochs=100, lr=0.005):
    """Train and evaluate a model."""
    model = model_class(**config).to(DEVICE)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, epochs)
    
    train_ds = torch.utils.data.TensorDataset(X_train, y_train)
    train_loader = torch.utils.data.DataLoader(train_ds, batch_size=128, shuffle=True)
    
    best_val = 0
    best_state = None
    
    for epoch in range(epochs):
        model.train()
        for bx, by in train_loader:
            bx, by = bx.to(DEVICE), by.to(DEVICE)
            opt.zero_grad()
            logits = model(bx)
            loss = F.cross_entropy(logits, by)
            loss.backward()
            opt.step()
        sched.step()
        
        # Validation
        model.eval()
        with torch.no_grad():
            val_logits = model(X_val.to(DEVICE))
            val_preds = torch.argmax(val_logits, dim=1)
            val_acc = (val_preds == y_val.to(DEVICE)).float().mean().item()
        
        if val_acc > best_val:
            best_val = val_acc
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
    
    if best_state:
        model.load_state_dict(best_state)
    
    # Test
    model.eval()
    with torch.no_grad():
        test_logits = model(X_test.to(DEVICE))
        test_preds = torch.argmax(test_logits, dim=1)
        test_acc = (test_preds == y_test.to(DEVICE)).float().mean().item()
    
    dist = model.get_weight_distribution() if hasattr(model, 'get_weight_distribution') else {}
    return test_acc, best_val, dist, sum(p.numel() for p in model.parameters())


def main():
    print("=" * 70)
    print("LARGE ARCHITECTURE TEST")
    print("=" * 70)
    print(f"Device: {DEVICE}")
    
    # Fetch data
    print("\nFetching HBAR price history...")
    history = fetch_hbar_history(days=90)
    print(f"  Got {len(history)} hourly candles")
    
    if len(history) < 100:
        print("[!] Not enough real data — aborting")
        return
    
    X_train, y_train, X_val, y_val, X_test, y_test = prepare_data(history)
    print(f"  Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")
    print(f"  Label balance: {y_test.float().mean():.1%} UP")
    
    # Architectures to test
    configs = [
        {
            "name": "Small (baseline)",
            "model": "SmallQAT",
            "config": {"lattice_size": 120, "threshold": 999.0},
        },
        {
            "name": "Small QAT",
            "model": "SmallQAT",
            "config": {"lattice_size": 120, "threshold": 0.05},
        },
        {
            "name": "Medium (256)",
            "model": "Large",
            "config": {"lattice_size": 256, "num_layers": 4, "threshold": 999.0, "dropout": 0.2},
        },
        {
            "name": "Medium QAT (256)",
            "model": "Large",
            "config": {"lattice_size": 256, "num_layers": 4, "threshold": 0.05, "dropout": 0.2},
        },
        {
            "name": "Large (512)",
            "model": "Large",
            "config": {"lattice_size": 512, "num_layers": 5, "threshold": 999.0, "dropout": 0.3},
        },
        {
            "name": "Large QAT (512)",
            "model": "Large",
            "config": {"lattice_size": 512, "num_layers": 5, "threshold": 0.05, "dropout": 0.3},
        },
        {
            "name": "XL (1024)",
            "model": "Large",
            "config": {"lattice_size": 1024, "num_layers": 6, "threshold": 999.0, "dropout": 0.4},
        },
        {
            "name": "XL QAT (1024)",
            "model": "Large",
            "config": {"lattice_size": 1024, "num_layers": 6, "threshold": 0.05, "dropout": 0.4},
        },
    ]
    
    # Import small model from previous script
    from qat_train_from_scratch import ScratchQATModel
    
    results = []
    
    for cfg in configs:
        print(f"\n{'='*70}")
        print(f"Testing: {cfg['name']}")
        print(f"{'='*70}")
        
        if cfg["model"] == "SmallQAT":
            model_class = ScratchQATModel
        else:
            model_class = LargeBitLatticeModel
        
        start = time.time()
        test_acc, val_acc, dist, params = train_and_eval(
            model_class, cfg["config"],
            X_train, y_train, X_val, y_val, X_test, y_test,
            epochs=100, lr=0.005
        )
        elapsed = time.time() - start
        
        is_qat = "QAT" in cfg["name"]
        print(f"  Params: {params:,}")
        print(f"  Val accuracy: {val_acc:.2%}")
        print(f"  Test accuracy: {test_acc:.2%}")
        if dist:
            print(f"  Weights: -1={dist.get('minus_one_pct', 0):.1f}%, 0={dist.get('zero_pct', 0):.1f}%, +1={dist.get('plus_one_pct', 0):.1f}%")
        print(f"  Training time: {elapsed:.1f}s")
        
        results.append({
            "name": cfg["name"],
            "params": params,
            "val_acc": val_acc,
            "test_acc": test_acc,
            "dist": dist,
            "time": elapsed,
            "is_qat": is_qat,
        })
    
    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"\n{'Model':<20} {'Params':>10} {'Val Acc':>10} {'Test Acc':>10} {'-1':>6} {'0':>6} {'+1':>6} {'Time':>8}")
    print("-" * 80)
    
    for r in results:
        dist = r.get("dist", {})
        print(f"{r['name']:<20} {r['params']:>10,} {r['val_acc']:>10.2%} {r['test_acc']:>10.2%} "
              f"{dist.get('minus_one_pct', 0):>5.1f}% {dist.get('zero_pct', 0):>5.1f}% {dist.get('plus_one_pct', 0):>5.1f}% {r['time']:>7.1f}s")
    
    # Find best
    best = max(results, key=lambda r: r['test_acc'])
    print(f"\nBest model: {best['name']} ({best['test_acc']:.2%})")
    
    if best['test_acc'] > 0.55:
        print(f"\n✅ ARCHITECTURE IMPROVEMENT FOUND")
        print(f"   {best['name']} beats random chance by {best['test_acc'] - 0.5:+.1%}")
    else:
        print(f"\n❌ Even {best['name']} cannot beat random chance")
        print(f"   Best accuracy: {best['test_acc']:.2%}")
        print(f"   This suggests the problem is the FEATURES, not the model size.")
    
    print("=" * 70)


if __name__ == "__main__":
    main()
