#!/usr/bin/env python3
"""
Test QAT on real HBAR price data from CoinGecko.
This determines whether QAT is viable for production.
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

from qat_train_from_scratch import ScratchQATModel, DEVICE


def fetch_hbar_history(days: int = 90) -> list:
    """Fetch HBAR price history from CoinGecko."""
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


def compute_features(history: list, idx: int) -> np.ndarray:
    """Compute 14 features from price history at index."""
    if idx < 30:
        return None
    
    prices = [h["price"] for h in history[max(0, idx-30):idx+1]]
    volumes = [h["volume"] for h in history[max(0, idx-30):idx+1]]
    
    p = prices[-1]
    p_prev = prices[-2]
    p_day = prices[0] if len(prices) >= 24 else p
    
    # RSI
    deltas = np.diff(prices[-15:])
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)
    avg_gain = np.mean(gains[-14:]) if len(gains) >= 14 else 0
    avg_loss = np.mean(losses[-14:]) if len(losses) >= 14 else 1
    rsi = 100 - (100 / (1 + avg_gain / max(avg_loss, 1e-10)))
    
    # EMAs
    ema_12 = np.mean(prices[-12:])
    ema_26 = np.mean(prices[-26:]) if len(prices) >= 26 else np.mean(prices)
    
    # Bollinger position
    sma_20 = np.mean(prices[-20:])
    std_20 = np.std(prices[-20:])
    bb_pos = (p - (sma_20 - 2*std_20)) / (4*std_20 + 1e-10) if std_20 > 0 else 0.5
    
    feat = np.array([
        p,
        (p - p_prev) / p_prev if p_prev > 0 else 0,
        (p - p_day) / p_day if p_day > 0 else 0,
        volumes[-1],
        (volumes[-1] - volumes[-2]) / volumes[-2] if len(volumes) >= 2 and volumes[-2] > 0 else 0,
        rsi,
        ema_12 - ema_26,
        np.mean(prices[-7:]),
        np.mean(prices[-30:]) if len(prices) >= 30 else np.mean(prices),
        ema_12,
        ema_26,
        (max(prices[-7:]) - min(prices[-7:])) / p if p > 0 else 0,
        abs(p - p_prev) / p if p > 0 else 0,
        bb_pos,
    ], dtype=np.float32)
    
    return feat


def prepare_real_data(history: list) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """Prepare real data: features and next-hour direction labels."""
    features = []
    labels = []
    
    for i in range(len(history) - 1):
        feat = compute_features(history, i)
        if feat is not None:
            # Label: 1 if next hour price goes up, 0 if down
            next_price = history[i + 1]["price"]
            curr_price = history[i]["price"]
            label = 1 if next_price > curr_price else 0
            features.append(feat)
            labels.append(label)
    
    X = torch.tensor(np.array(features), dtype=torch.float32)
    y = torch.tensor(labels, dtype=torch.long)
    
    # Normalize
    mean = X.mean(dim=0)
    std = X.std(dim=0) + 1e-8
    X = (X - mean) / std
    
    n = len(X)
    n_train = int(0.7 * n)
    n_val = int(0.15 * n)
    
    return (X[:n_train], y[:n_train],
            X[n_train:n_train+n_val], y[n_train:n_train+n_val],
            X[n_train+n_val:], y[n_train+n_val:])


def train_and_eval(threshold: float, X_train, y_train, X_val, y_val, X_test, y_test, epochs: int = 100):
    """Train QAT model and return metrics."""
    
    # Full-precision baseline
    fp = ScratchQATModel(threshold=999.0).to(DEVICE)
    fp_opt = torch.optim.Adam(fp.parameters(), lr=0.01)
    fp_sched = torch.optim.lr_scheduler.CosineAnnealingLR(fp_opt, epochs)
    
    train_ds = torch.utils.data.TensorDataset(X_train, y_train)
    train_loader = torch.utils.data.DataLoader(train_ds, batch_size=64, shuffle=True)
    
    for epoch in range(epochs):
        fp.train()
        for bx, by in train_loader:
            bx, by = bx.to(DEVICE), by.to(DEVICE)
            fp_opt.zero_grad()
            logits = fp(bx)
            loss = F.cross_entropy(logits, by)
            loss.backward()
            fp_opt.step()
        fp_sched.step()
    
    fp.eval()
    with torch.no_grad():
        fp_test_logits = fp(X_test.to(DEVICE))
        fp_test_acc = (torch.argmax(fp_test_logits, dim=1) == y_test.to(DEVICE)).float().mean().item()
    
    # QAT model
    qat = ScratchQATModel(threshold=threshold).to(DEVICE)
    qat_opt = torch.optim.Adam(qat.parameters(), lr=0.01)
    qat_sched = torch.optim.lr_scheduler.CosineAnnealingLR(qat_opt, epochs)
    
    for epoch in range(epochs):
        qat.train()
        for bx, by in train_loader:
            bx, by = bx.to(DEVICE), by.to(DEVICE)
            qat_opt.zero_grad()
            logits = qat(bx)
            loss = F.cross_entropy(logits, by)
            loss.backward()
            qat_opt.step()
        qat_sched.step()
    
    qat.eval()
    with torch.no_grad():
        qat_test_logits = qat(X_test.to(DEVICE))
        qat_test_acc = (torch.argmax(qat_test_logits, dim=1) == y_test.to(DEVICE)).float().mean().item()
    
    dist = qat.get_weight_distribution()
    
    return {
        "fp_acc": fp_test_acc,
        "qat_acc": qat_test_acc,
        "gap": qat_test_acc - fp_test_acc,
        "dist": dist,
    }


def main():
    print("=" * 70)
    print("QAT TEST ON REAL HBAR PRICE DATA")
    print("=" * 70)
    
    # Fetch data
    print("\nFetching HBAR price history...")
    history = fetch_hbar_history(days=90)
    print(f"  Got {len(history)} hourly candles")
    
    if len(history) < 100:
        print("[!] Not enough data, using synthetic fallback")
        from qat_train_from_scratch import generate_data
        X_train, y_train, X_val, y_val, X_test, y_test = generate_data(2000)
    else:
        X_train, y_train, X_val, y_val, X_test, y_test = prepare_real_data(history)
    
    print(f"  Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")
    
    # Test label balance
    up_pct = y_test.float().mean().item()
    print(f"  Test set: {up_pct:.1%} UP, {1-up_pct:.1%} DOWN")
    
    # Test different thresholds
    thresholds = [0.05, 0.10, 0.20]
    results = {}
    
    for threshold in thresholds:
        print(f"\n{'='*70}")
        print(f"Testing threshold={threshold}...")
        print(f"{'='*70}")
        
        result = train_and_eval(threshold, X_train, y_train, X_val, y_val, X_test, y_test, epochs=50)
        results[threshold] = result
        
        print(f"  Full-precision: {result['fp_acc']:.2%}")
        print(f"  QAT:            {result['qat_acc']:.2%}")
        print(f"  Gap:            {result['gap']:+.2%}")
        print(f"  Weights: -1={result['dist']['minus_one_pct']:.1f}%, 0={result['dist']['zero_pct']:.1f}%, +1={result['dist']['plus_one_pct']:.1f}%")
    
    # Summary
    print("\n" + "=" * 70)
    print("RESULTS: QAT ON REAL DATA")
    print("=" * 70)
    print(f"\n{'Threshold':>10} {'FP Acc':>10} {'QAT Acc':>10} {'Gap':>10} {'-1':>6} {'0':>6} {'+1':>6}")
    print("-" * 60)
    
    for t, r in results.items():
        print(f"{t:>10.2f} {r['fp_acc']:>10.2%} {r['qat_acc']:>10.2%} {r['gap']:>+10.2%} "
              f"{r['dist']['minus_one_pct']:>5.1f}% {r['dist']['zero_pct']:>5.1f}% {r['dist']['plus_one_pct']:>5.1f}%")
    
    # Decision
    best = max(results.values(), key=lambda r: r['qat_acc'])
    
    print("\n" + "=" * 70)
    print("DECISION")
    print("=" * 70)
    
    if best['qat_acc'] >= 0.70:
        print(f"\n✅ QAT IS VIABLE")
        print(f"   Best accuracy: {best['qat_acc']:.2%}")
        print(f"   Gap to full-precision: {best['gap']:+.2%}")
        print(f"\n   Recommendation: Proceed with QAT production deployment")
    elif best['qat_acc'] >= 0.60:
        print(f"\n⚠️ QAT IS MARGINAL")
        print(f"   Best accuracy: {best['qat_acc']:.2%}")
        print(f"   Gap to full-precision: {best['gap']:+.2%}")
        print(f"\n   Recommendation: Needs more research or larger models")
    else:
        print(f"\n❌ QAT NOT VIABLE")
        print(f"   Best accuracy: {best['qat_acc']:.2%}")
        print(f"   Full-precision: {best['fp_acc']:.2%}")
        print(f"\n   Recommendation: Use full-precision models + ONNX optimization")
    
    print("=" * 70)


if __name__ == "__main__":
    main()
