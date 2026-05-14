#!/usr/bin/env python3
"""
Unified Prediction Market Server.
Serves predictions for all Hedera ecosystem tokens via FastAPI.
"""

import json
import sys
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

import numpy as np
import requests
import torch
import torch.nn.functional as F

from starlit.bitlattice_model_pytorch import BitLatticeModelPyTorch

# Load all token models
MODELS_DIR = Path("/home/vera-live-0-1/hedera-llm-api/models")
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Feature keys (must match training)
FEATURE_KEYS = [
    "price_change_1h", "price_change_4h", "price_change_24h",
    "price_vs_sma7", "price_vs_sma20", "price_vs_sma50",
    "rsi_14", "bb_percent_b", "volatility_14h",
    "volume_proxy", "volume_sma_24", "volume_change_1h",
    "high_low_range", "body_size",
]

class UnifiedPredictionEngine:
    """Multi-token prediction engine for Hedera ecosystem."""
    
    def __init__(self):
        self.token_models = {}
        self.token_features = {}
        self.price_history = {}  # token -> deque of prices
        self.volume_history = {}  # token -> deque of volumes
        self.last_predictions = {}
        
        self._load_models()
    
    def _load_models(self):
        """Load all production models from disk."""
        manifest_path = MODELS_DIR / "token_manifest.json"
        if not manifest_path.exists():
            print("No token manifest found. Run training first.")
            return
        
        for model_file in MODELS_DIR.glob("*_production.pt"):
            token_name = model_file.stem.replace("_production", "")
            
            try:
                checkpoint = torch.load(model_file, map_location=str(DEVICE))
                
                model = BitLatticeModelPyTorch(
                    lattice_size=120, vocabulary_size=128,
                    num_features=len(FEATURE_KEYS), num_classes=2, device=str(DEVICE)
                )
                model.load_state_dict(checkpoint["model_state_dict"])
                model.eval()
                
                self.token_models[token_name] = {
                    "model": model,
                    "accuracy": checkpoint.get("accuracy", 0),
                }
                self.price_history[token_name] = deque(maxlen=200)
                self.volume_history[token_name] = deque(maxlen=200)
                
                print(f"Loaded {token_name.upper()}: {checkpoint.get('accuracy', 0):.1%} accuracy")
                
            except Exception as e:
                print(f"Failed to load {token_name}: {e}")
    
    def get_available_tokens(self) -> List[str]:
        """List tokens with loaded models."""
        return sorted(self.token_models.keys())
    
    def fetch_token_price(self, token_id: str) -> Dict[str, Any]:
        """Fetch current price for a token from CoinGecko."""
        try:
            url = f"https://api.coingecko.com/api/v3/simple/price"
            params = {
                "ids": token_id,
                "vs_currencies": "usd",
                "include_24hr_change": "true",
                "include_24hr_vol": "true",
            }
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            
            token_data = data.get(token_id, {})
            return {
                "timestamp": time.time(),
                "price": token_data.get("usd", 0),
                "change_24h": token_data.get("usd_24h_change", 0),
                "volume_24h": token_data.get("usd_24h_vol", 0),
            }
        except Exception as e:
            return None
    
    def compute_features_live(self, token_name: str, price_data: Dict) -> Dict[str, float]:
        """Compute prediction features from live price data."""
        if token_name not in self.price_history:
            return None
        
        self.price_history[token_name].append(price_data["price"])
        self.volume_history[token_name].append(price_data.get("volume_24h", 0))
        
        prices = list(self.price_history[token_name])
        volumes = list(self.volume_history[token_name])
        n = len(prices)
        
        if n < 50:
            return None
        
        features = {}
        
        # Price changes
        features["price_change_1h"] = np.tanh((prices[-1] - prices[-2]) / prices[-2] * 10) if len(prices) > 1 and prices[-2] > 0 else 0
        features["price_change_4h"] = np.tanh((prices[-1] - prices[-5]) / prices[-5] * 10) if len(prices) > 5 and prices[-5] > 0 else 0
        features["price_change_24h"] = np.tanh((prices[-1] - prices[-25]) / prices[-25] * 10) if len(prices) > 25 and prices[-25] > 0 else 0
        
        # Moving averages
        sma7 = np.mean(prices[-7:]) if len(prices) >= 7 else prices[-1]
        sma20 = np.mean(prices[-20:]) if len(prices) >= 20 else prices[-1]
        sma50 = np.mean(prices[-50:]) if len(prices) >= 50 else prices[-1]
        
        features["price_vs_sma7"] = prices[-1] / sma7 if sma7 > 0 else 1.0
        features["price_vs_sma20"] = prices[-1] / sma20 if sma20 > 0 else 1.0
        features["price_vs_sma50"] = prices[-1] / sma50 if sma50 > 0 else 1.0
        
        # RSI
        if len(prices) >= 15:
            deltas = np.diff(prices[-15:])
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
        if len(prices) >= 20:
            window = prices[-20:]
            bb_mean = np.mean(window)
            bb_std = np.std(window)
            bb_upper = bb_mean + 2 * bb_std
            bb_lower = bb_mean - 2 * bb_std
            bb_b = (prices[-1] - bb_lower) / (bb_upper - bb_lower) if bb_upper != bb_lower else 0.5
            features["bb_percent_b"] = max(0, min(1, bb_b))
        else:
            features["bb_percent_b"] = 0.5
        
        # Volatility
        if len(prices) >= 14:
            ranges = [abs(prices[j] - prices[j-1]) / prices[j-1] for j in range(-14, 0) if prices[j-1] > 0]
            features["volatility_14h"] = min(1, np.mean(ranges)) if ranges else 0.05
        else:
            features["volatility_14h"] = 0.05
        
        # Volume
        vol = volumes[-1] if volumes else 0
        vol_sma = np.mean(volumes[-24:]) if len(volumes) >= 24 else vol
        features["volume_proxy"] = min(1, vol / 100000000)
        features["volume_sma_24"] = min(1, vol_sma / 100000000)
        features["volume_change_1h"] = np.tanh((vol - volumes[-2]) / volumes[-2]) if len(volumes) > 1 and volumes[-2] > 0 else 0
        
        # Price ranges
        features["high_low_range"] = abs(prices[-1] - prices[-2]) / prices[-1] if len(prices) > 1 and prices[-1] > 0 else 0
        features["body_size"] = abs(prices[-1] - prices[-2]) / prices[-1] if len(prices) > 1 and prices[-1] > 0 else 0
        
        return features
    
    def predict(self, token_name: str, features: Dict[str, float]) -> Dict[str, Any]:
        """Predict price direction for a token."""
        if token_name not in self.token_models:
            return {"error": f"Unknown token: {token_name}"}
        
        if features is None:
            return {"error": "Insufficient price history (need 50+ data points)"}
        
        # Build feature vector
        feature_vector = torch.tensor([[features.get(k, 0) for k in FEATURE_KEYS]], 
                                       dtype=torch.float32).to(DEVICE)
        
        # Inference
        model_info = self.token_models[token_name]
        model = model_info["model"]
        
        start = time.perf_counter()
        with torch.no_grad():
            logits, _ = model(feature_vector)
            probs = F.softmax(logits, dim=1)
        inference_time = (time.perf_counter() - start) * 1000
        
        up_prob = probs[0, 1].item()
        down_prob = probs[0, 0].item()
        confidence = abs(up_prob - 0.5) * 2
        
        result = {
            "token": token_name.upper(),
            "direction": "UP" if up_prob > 0.5 else "DOWN",
            "up_probability": round(up_prob, 4),
            "down_probability": round(down_prob, 4),
            "confidence": round(confidence, 4),
            "market_odds": round(up_prob / down_prob, 2) if down_prob > 0 else 999,
            "model_accuracy": round(model_info["accuracy"], 4),
            "inference_time_ms": round(inference_time, 2),
            "timestamp": datetime.now().isoformat(),
        }
        
        self.last_predictions[token_name] = result
        return result
    
    def predict_all(self) -> Dict[str, Any]:
        """Get predictions for all available tokens."""
        results = {}
        
        # CoinGecko IDs mapping
        cg_ids = {
            "hbar": "hedera-hashgraph",
            "sauce": "saucerswap",
            "dovu": "dovu",
        }
        
        for token_name in self.get_available_tokens():
            cg_id = cg_ids.get(token_name, token_name)
            price_data = self.fetch_token_price(cg_id)
            
            if price_data:
                features = self.compute_features_live(token_name, price_data)
                prediction = self.predict(token_name, features)
                if "error" not in prediction:
                    results[token_name] = prediction
        
        return results


# FastAPI Application
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Hedera Prediction Market Engine", version="1.0.0")
engine = UnifiedPredictionEngine()

class PredictionResponse(BaseModel):
    token: str
    direction: str
    up_probability: float
    confidence: float
    market_odds: float
    model_accuracy: float
    inference_time_ms: float

@app.get("/")
async def root():
    return {
        "service": "Hedera Prediction Market Engine",
        "version": "1.0.0",
        "tokens": engine.get_available_tokens(),
        "models_loaded": len(engine.token_models),
    }

@app.get("/predict/{token}", response_model=PredictionResponse)
async def predict_token(token: str):
    """Get price direction prediction for a specific token."""
    token = token.lower()
    
    if token not in engine.token_models:
        raise HTTPException(status_code=404, detail=f"Token '{token}' not available")
    
    # CoinGecko IDs
    cg_ids = {
        "hbar": "hedera-hashgraph",
        "sauce": "saucerswap", 
        "dovu": "dovu",
    }
    
    cg_id = cg_ids.get(token, token)
    price_data = engine.fetch_token_price(cg_id)
    
    if not price_data:
        raise HTTPException(status_code=503, detail="Failed to fetch price data")
    
    features = engine.compute_features_live(token, price_data)
    result = engine.predict(token, features)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result

@app.get("/predict")
async def predict_all():
    """Get predictions for all available tokens."""
    return engine.predict_all()

@app.get("/tokens")
async def list_tokens():
    """List available tokens with model accuracy."""
    return {
        token: {
            "accuracy": info["accuracy"],
            "status": "loaded",
        }
        for token, info in engine.token_models.items()
    }

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "models_loaded": len(engine.token_models),
        "tokens": engine.get_available_tokens(),
        "device": str(DEVICE),
    }

if __name__ == "__main__":
    print("=" * 60)
    print("HEDERA PREDICTION MARKET ENGINE - UNIFIED SERVER")
    print("=" * 60)
    
    print(f"\nLoaded {len(engine.token_models)} token models:")
    for token, info in engine.token_models.items():
        print(f"  {token.upper()}: {info['accuracy']:.1%} accuracy")
    
    # Test predictions
    print("\nTest predictions:")
    predictions = engine.predict_all()
    for token, pred in predictions.items():
        print(f"  {pred['token']}: {pred['direction']} "
              f"(UP: {pred['up_probability']:.1%}, conf: {pred['confidence']:.1%})")
    
    print("\nStarting FastAPI server on http://0.0.0.0:8000")
    print("Endpoints:")
    print("  GET /predict/{token}  - Predict single token")
    print("  GET /predict          - Predict all tokens")
    print("  GET /tokens           - List available tokens")
    print("  GET /health           - Health check")
    print("  GET /docs             - Swagger UI")
    
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
