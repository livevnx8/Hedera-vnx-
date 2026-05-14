#!/usr/bin/env python3
"""
Fetch HBAR historical price data from CoinGecko and create prediction corpus.
"""

import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import requests

# CoinGecko API (free tier, no key needed)
COINGECKO_API = "https://api.coingecko.com/api/v3"

def fetch_hbar_ohlc(days=30):
    """Fetch HBAR OHLC data from CoinGecko in 2-day chunks for hourly granularity."""
    print(f"Fetching HBAR OHLC data for last {days} days (hourly)...")
    
    all_candles = []
    now = datetime.now()
    
    # Fetch in 2-day chunks (CoinGecko gives hourly for days <= 2)
    for i in range(0, days, 2):
        chunk_days = min(2, days - i)
        to_date = now - timedelta(days=i)
        from_date = now - timedelta(days=i + chunk_days)
        
        url = f"{COINGECKO_API}/coins/hedera-hashgraph/market_chart/range"
        params = {
            "vs_currency": "usd",
            "from": int(from_date.timestamp()),
            "to": int(to_date.timestamp()),
        }
        
        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            # Format: prices [[timestamp, price]], market_caps, total_volumes
            prices = data.get("prices", [])
            volumes = data.get("total_volumes", [])
            
            for j in range(len(prices)):
                if j == 0:
                    continue
                ts = prices[j][0]
                close = prices[j][1]
                open_p = prices[j-1][1]
                high = max(open_p, close) * 1.001  # Estimate
                low = min(open_p, close) * 0.999   # Estimate
                volume = volumes[j][1] if j < len(volumes) else 0
                
                all_candles.append({
                    "timestamp": ts,
                    "open": open_p,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": volume,
                })
            
            print(f"  Days {i}-{i+chunk_days}: {len(prices)} candles")
            
        except Exception as e:
            print(f"  Error fetching days {i}-{i+chunk_days}: {e}")
        
        time.sleep(0.5)  # Rate limit
    
    print(f"Fetched {len(all_candles)} total candles")
    return all_candles


def compute_technical_indicators(candles):
    """Compute technical indicators for each candle."""
    n = len(candles)
    
    # Extract price series
    closes = np.array([c["close"] for c in candles])
    highs = np.array([c["high"] for c in candles])
    lows = np.array([c["low"] for c in candles])
    opens = np.array([c["open"] for c in candles])
    
    # Compute features for each candle (need enough history)
    for i in range(n):
        if i < 50:
            continue
        
        window = closes[max(0, i-50):i+1]
        
        # Basic price data
        candles[i]["price"] = closes[i]
        candles[i]["price_change_1h"] = (closes[i] - closes[i-1]) / closes[i-1] if closes[i-1] > 0 else 0
        candles[i]["price_change_4h"] = (closes[i] - closes[max(0, i-4)]) / closes[max(0, i-4)] if closes[max(0, i-4)] > 0 else 0
        candles[i]["price_change_24h"] = (closes[i] - closes[max(0, i-24)]) / closes[max(0, i-24)] if closes[max(0, i-24)] > 0 else 0
        
        # Moving averages
        candles[i]["sma_7"] = np.mean(closes[max(0, i-6):i+1])
        candles[i]["sma_20"] = np.mean(closes[max(0, i-19):i+1])
        candles[i]["sma_50"] = np.mean(closes[max(0, i-49):i+1])
        
        # Price vs moving averages
        candles[i]["price_vs_sma7"] = closes[i] / candles[i]["sma_7"] if candles[i]["sma_7"] > 0 else 1.0
        candles[i]["price_vs_sma20"] = closes[i] / candles[i]["sma_20"] if candles[i]["sma_20"] > 0 else 1.0
        candles[i]["price_vs_sma50"] = closes[i] / candles[i]["sma_50"] if candles[i]["sma_50"] > 0 else 1.0
        
        # RSI (14-period)
        delta = np.diff(closes[max(0, i-14):i+1])
        gain = np.mean(delta[delta > 0]) if len(delta[delta > 0]) > 0 else 0
        loss = np.mean(-delta[delta < 0]) if len(delta[delta < 0]) > 0 else 0
        if loss == 0:
            candles[i]["rsi_14"] = 100.0
        else:
            rs = gain / loss
            candles[i]["rsi_14"] = 100 - (100 / (1 + rs))
        
        # Bollinger Bands (20-period)
        bb_window = closes[max(0, i-19):i+1]
        bb_mean = np.mean(bb_window)
        bb_std = np.std(bb_window)
        candles[i]["bb_upper"] = bb_mean + 2 * bb_std
        candles[i]["bb_lower"] = bb_mean - 2 * bb_std
        candles[i]["bb_percent_b"] = (closes[i] - candles[i]["bb_lower"]) / (candles[i]["bb_upper"] - candles[i]["bb_lower"]) if (candles[i]["bb_upper"] - candles[i]["bb_lower"]) > 0 else 0.5
        
        # Volatility (ATR-like using high-low)
        hl_range = highs[max(0, i-13):i+1] - lows[max(0, i-13):i+1]
        candles[i]["volatility_14h"] = np.mean(hl_range) / closes[i] if closes[i] > 0 else 0
        
        # Volume from CoinGecko
        volumes = np.array([c["volume"] for c in candles])
        candles[i]["volume_proxy"] = volumes[i] / 100000000  # In 100M units
        candles[i]["volume_sma_24"] = np.mean(volumes[max(0, i-23):i+1]) / 100000000 if i > 0 else 0
        candles[i]["volume_change_1h"] = (volumes[i] - volumes[i-1]) / volumes[i-1] if volumes[i-1] > 0 and i > 0 else 0
        
        # High/Low ranges
        candles[i]["high_low_range"] = (highs[i] - lows[i]) / closes[i] if closes[i] > 0 else 0
        candles[i]["body_size"] = abs(closes[i] - opens[i]) / closes[i] if closes[i] > 0 else 0
    
    return candles


def create_labels(candles, horizons=[1, 4, 24], threshold=0.005):
    """Create up/down labels for different time horizons."""
    n = len(candles)
    
    for i in range(n):
        for h in horizons:
            if i + h < n:
                future_price = candles[i + h]["close"]
                current_price = candles[i]["close"]
                change = (future_price - current_price) / current_price
                
                if change > threshold:
                    candles[i][f"label_{h}h"] = 1  # UP
                elif change < -threshold:
                    candles[i][f"label_{h}h"] = 0  # DOWN
                else:
                    candles[i][f"label_{h}h"] = -1  # NEUTRAL (will be filtered)
            else:
                candles[i][f"label_{h}h"] = -1
    
    return candles


def create_corpus(candles):
    """Create ML-ready corpus from candles with features."""
    corpus = []
    
    feature_keys = [
        "price_change_1h", "price_change_4h", "price_change_24h",
        "price_vs_sma7", "price_vs_sma20", "price_vs_sma50",
        "rsi_14", "bb_percent_b", "volatility_14h",
        "volume_proxy", "volume_sma_24", "volume_change_1h",
        "high_low_range", "body_size",
    ]
    
    horizons = [1, 4, 24]
    
    for candle in candles:
        # Skip if not enough history or no labels
        if "label_1h" not in candle or "rsi_14" not in candle:
            continue
        
        features = {}
        for key in feature_keys:
            if key in candle:
                # Normalize features
                val = candle[key]
                if key in ["price_change_1h", "price_change_4h", "price_change_24h"]:
                    features[key] = np.tanh(val * 10)  # tanh for percentage changes
                elif key == "rsi_14":
                    features[key] = val / 100.0  # 0-1 range
                elif key == "bb_percent_b":
                    features[key] = max(0, min(1, val))  # Clip to 0-1
                elif key == "volume_proxy":
                    features[key] = min(1, val / 10000000)  # Cap at 10M
                elif key == "volume_sma_24":
                    features[key] = min(1, val / 10000000)
                elif key == "volume_change_1h":
                    features[key] = np.tanh(val)  # tanh for percentage changes
                elif key in ["high_low_range", "body_size", "volatility_14h"]:
                    features[key] = min(1, val)
                else:
                    features[key] = val
        
        for h in horizons:
            label_key = f"label_{h}h"
            if label_key in candle and candle[label_key] != -1:
                corpus.append({
                    "features": features,
                    "label": candle[label_key],
                    "horizon": h,
                    "timestamp": candle["timestamp"],
                    "price": candle["close"],
                })
    
    return corpus


def main():
    print("=" * 60)
    print("FETCHING HBAR DATA FOR PREDICTION ENGINE")
    print("=" * 60)
    
    # Fetch data
    candles = fetch_hbar_ohlc(days=90)
    
    # Compute indicators
    print("\nComputing technical indicators...")
    candles = compute_technical_indicators(candles)
    
    # Create labels
    print("Creating labels for 1h, 4h, 24h horizons...")
    candles = create_labels(candles)
    
    # Create corpus
    print("Creating ML corpus...")
    corpus = create_corpus(candles)
    
    print(f"\nTotal labeled samples: {len(corpus)}")
    
    # Show distribution
    for h in [1, 4, 24]:
        h_corpus = [c for c in corpus if c["horizon"] == h]
        up = sum(1 for c in h_corpus if c["label"] == 1)
        down = sum(1 for c in h_corpus if c["label"] == 0)
        print(f"  {h}h horizon: {len(h_corpus)} samples (UP: {up}, DOWN: {down})")
    
    # Save
    output_path = Path("/home/vera-live-0-1/hedera-llm-api/data/hbar_prediction_corpus.json")
    with open(output_path, 'w') as f:
        json.dump(corpus, f, indent=2)
    print(f"\nSaved to {output_path}")
    
    print("\n" + "=" * 60)
    print("HBAR DATA FETCH COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
