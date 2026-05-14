#!/usr/bin/env python3
"""
Fetch 30 days of hourly price data for 10+ Hedera ecosystem tokens.
Handles CoinGecko rate limits with sequential fetching + delays.
"""

import json
import time
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import requests

COINGECKO_API = "https://api.coingecko.com/api/v3"

# Hedera ecosystem tokens
TOKENS = {
    "hbar": {"id": "hedera-hashgraph", "symbol": "HBAR", "priority": 0},
    "usdc": {"id": "usd-coin", "symbol": "USDC", "priority": 0},
    "sauce": {"id": "saucerswap", "symbol": "SAUCE", "priority": 1},
    "hbarx": {"id": "stader-hbarx", "symbol": "HBARX", "priority": 1},
    "dovu": {"id": "dovu", "symbol": "DOVU", "priority": 1},
    "karate": {"id": "karate-combat", "symbol": "KARATE", "priority": 2},
    "pack": {"id": "hashpack", "symbol": "PACK", "priority": 2},
    "heli": {"id": "heliswap", "symbol": "HELI", "priority": 2},
    "suku": {"id": "suku", "symbol": "SUKU", "priority": 3},
    "grel": {"id": "greelance", "symbol": "GREL", "priority": 3},
}

def fetch_token_market_chart(token_id, days=30):
    """Fetch market chart data for a single token."""
    url = f"{COINGECKO_API}/coins/{token_id}/market_chart"
    params = {"vs_currency": "usd", "days": str(days)}
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data
    except Exception as e:
        print(f"    Error: {e}")
        return None

def create_features(prices, volumes):
    """Compute technical features from price/volume series."""
    n = len(prices)
    if n < 50:
        return []
    
    samples = []
    for i in range(50, n):
        features = {}
        
        # Price changes (normalized)
        features["price_change_1h"] = np.tanh((prices[i] - prices[i-1]) / prices[i-1] * 10) if prices[i-1] > 0 else 0
        features["price_change_4h"] = np.tanh((prices[i] - prices[max(0, i-4)]) / prices[max(0, i-4)] * 10) if prices[max(0, i-4)] > 0 else 0
        features["price_change_24h"] = np.tanh((prices[i] - prices[max(0, i-24)]) / prices[max(0, i-24)] * 10) if prices[max(0, i-24)] > 0 else 0
        
        # Moving averages
        sma7 = np.mean(prices[max(0, i-6):i+1])
        sma20 = np.mean(prices[max(0, i-19):i+1])
        sma50 = np.mean(prices[max(0, i-49):i+1])
        
        features["price_vs_sma7"] = prices[i] / sma7 if sma7 > 0 else 1.0
        features["price_vs_sma20"] = prices[i] / sma20 if sma20 > 0 else 1.0
        features["price_vs_sma50"] = prices[i] / sma50 if sma50 > 0 else 1.0
        
        # RSI
        if i >= 14:
            deltas = np.diff(prices[i-14:i+1])
            gains = deltas[deltas > 0]
            losses = -deltas[deltas < 0]
            avg_gain = np.mean(gains) if len(gains) > 0 else 0
            avg_loss = np.mean(losses) if len(losses) > 0 else 0
            if avg_loss == 0:
                rsi = 100.0
            else:
                rs = avg_gain / avg_loss
                rsi = 100 - (100 / (1 + rs))
            features["rsi_14"] = rsi / 100.0
        else:
            features["rsi_14"] = 0.5
        
        # Bollinger Bands
        if i >= 19:
            window = prices[i-19:i+1]
            bb_mean = np.mean(window)
            bb_std = np.std(window)
            bb_upper = bb_mean + 2 * bb_std
            bb_lower = bb_mean - 2 * bb_std
            bb_b = (prices[i] - bb_lower) / (bb_upper - bb_lower) if bb_upper != bb_lower else 0.5
            features["bb_percent_b"] = max(0, min(1, bb_b))
        else:
            features["bb_percent_b"] = 0.5
        
        # Volatility
        if i >= 13:
            ranges = [abs(prices[j] - prices[j-1]) / prices[j-1] for j in range(i-13, i+1) if prices[j-1] > 0]
            features["volatility_14h"] = min(1, np.mean(ranges)) if ranges else 0.05
        else:
            features["volatility_14h"] = 0.05
        
        # Volume
        vol = volumes[i] if i < len(volumes) else 0
        vol_sma = np.mean(volumes[max(0, i-23):i+1]) if i > 0 else vol
        features["volume_proxy"] = min(1, vol / 100000000)
        features["volume_sma_24"] = min(1, vol_sma / 100000000)
        features["volume_change_1h"] = np.tanh((vol - volumes[i-1]) / volumes[i-1]) if i > 0 and volumes[i-1] > 0 else 0
        
        # Price ranges
        features["high_low_range"] = min(1, abs(prices[i] - prices[i-1]) / prices[i]) if prices[i] > 0 else 0
        features["body_size"] = abs(prices[i] - prices[i-1]) / prices[i] if prices[i] > 0 else 0
        
        # Label: 24h ahead
        if i + 24 < n:
            future_price = prices[i + 24]
            current_price = prices[i]
            change = (future_price - current_price) / current_price
            threshold = 0.005  # 0.5%
            
            if change > threshold:
                label = 1  # UP
            elif change < -threshold:
                label = 0  # DOWN
            else:
                label = -1  # NEUTRAL (skip)
            
            if label != -1:
                features["timestamp"] = i
                features["price"] = current_price
                samples.append({"features": features, "label": label, "horizon": 24})
    
    return samples

def main():
    print("=" * 70)
    print("FETCHING MULTI-TOKEN DATA FOR PREDICTION MARKET")
    print("=" * 70)
    
    output_dir = Path("/home/vera-live-0-1/hedera-llm-api/data/tokens")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    results = {}
    
    for token_key, token_info in TOKENS.items():
        token_id = token_info["id"]
        symbol = token_info["symbol"]
        print(f"\n[{symbol}] Fetching {token_id}...")
        
        data = fetch_token_market_chart(token_id, days=30)
        if not data:
            print(f"  Skipping {symbol}")
            continue
        
        prices = [p[1] for p in data.get("prices", [])]
        volumes = [v[1] for v in data.get("total_volumes", [])]
        
        print(f"  Prices: {len(prices)}, Volumes: {len(volumes)}")
        
        samples = create_features(prices, volumes)
        
        up = sum(1 for s in samples if s["label"] == 1)
        down = sum(1 for s in samples if s["label"] == 0)
        print(f"  24h samples: {len(samples)} (UP: {up}, DOWN: {down})")
        
        # Save
        save_path = output_dir / f"{token_key}_corpus.json"
        with open(save_path, 'w') as f:
            json.dump(samples, f)
        
        results[token_key] = {
            "symbol": symbol,
            "samples": len(samples),
            "up": up,
            "down": down,
            "path": str(save_path),
        }
        
        # Rate limit: wait between tokens
        time.sleep(2)
    
    # Summary
    print(f"\n{'='*70}")
    print("MULTI-TOKEN FETCH SUMMARY")
    print(f"{'='*70}")
    for token_key, info in results.items():
        print(f"  {info['symbol']:10s}: {info['samples']:4d} samples (UP: {info['up']:3d}, DOWN: {info['down']:3d})")
    
    total = sum(info["samples"] for info in results.values())
    print(f"\nTotal labeled samples: {total}")
    print(f"Saved to {output_dir}")

if __name__ == "__main__":
    main()
