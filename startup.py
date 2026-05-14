#!/usr/bin/env python3
"""
Unified startup script for Hedera Prediction Market.
Validates environment, loads models, runs health checks, then starts server.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import torch


def check_directories():
    """Ensure required directories exist."""
    required = [
        "/home/vera-live-0-1/hedera-llm-api/models",
        "/home/vera-live-0-1/hedera-llm-api/data/tokens",
        "/home/vera-live-0-1/hedera-llm-api/logs",
        "/home/vera-live-0-1/hedera-llm-api/cache",
    ]
    for path in required:
        Path(path).mkdir(parents=True, exist_ok=True)
        print(f"  [OK] {path}")


def check_models():
    """Verify all production models exist."""
    models_dir = Path("/home/vera-live-0-1/hedera-llm-api/models")
    model_files = list(models_dir.glob("*_production.pt"))
    
    if not model_files:
        print("  [FAIL] No production models found!")
        print("  Run: python3 train_all_token_specialists.py")
        return False
    
    for mf in model_files:
        try:
            checkpoint = torch.load(mf, map_location='cpu')
            token = mf.stem.replace("_production", "")
            acc = checkpoint.get("accuracy", 0)
            print(f"  [OK] {token.upper()}: {acc:.1%} accuracy")
        except Exception as e:
            print(f"  [FAIL] {mf.name}: {e}")
            return False
    
    return True


def check_data():
    """Verify token corpora exist."""
    data_dir = Path("/home/vera-live-0-1/hedera-llm-api/data/tokens")
    corpus_files = list(data_dir.glob("*_corpus.json"))
    
    if not corpus_files:
        print("  [FAIL] No token data found!")
        print("  Run: python3 fetch_multi_token_data.py")
        return False
    
    for cf in corpus_files:
        token = cf.stem.replace("_corpus", "")
        import json
        corpus = json.loads(cf.read_text())
        print(f"  [OK] {token.upper()}: {len(corpus)} samples")
    
    return True


def check_dependencies():
    """Verify Python dependencies."""
    required = [
        "torch", "numpy", "requests", "fastapi", "uvicorn",
    ]
    
    all_ok = True
    for pkg in required:
        try:
            __import__(pkg)
            print(f"  [OK] {pkg}")
        except ImportError:
            print(f"  [FAIL] {pkg} not installed")
            all_ok = False
    
    if not all_ok:
        print("\nInstall missing: pip install torch numpy requests fastapi uvicorn")
    
    return all_ok


def test_inference():
    """Quick inference test."""
    from prediction_server_production import ProductionPredictionEngine
    
    engine = ProductionPredictionEngine()
    
    if not engine.token_models:
        print("  [FAIL] No models loaded")
        return False
    
    # Test each token
    from prediction_server_production import FEATURE_KEYS
    for token in list(engine.token_models.keys()):
        try:
            features = {k: 0.5 for k in FEATURE_KEYS}
            result = engine.predict(token, features)
            if "error" in result:
                print(f"  [FAIL] {token.upper()}: {result['error']}")
                return False
            print(f"  [OK] {token.upper()}: {result['direction']} "
                  f"(UP: {result['up_probability']:.1%}, "
                  f"{result['inference_time_ms']:.2f}ms)")
        except Exception as e:
            print(f"  [FAIL] {token.upper()}: {e}")
            return False
    
    return True


def main():
    print("=" * 60)
    print("HEDERA PREDICTION MARKET - STARTUP VALIDATION")
    print("=" * 60)
    
    print("\n[1/5] Checking directories...")
    check_directories()
    
    print("\n[2/5] Checking dependencies...")
    if not check_dependencies():
        print("\n[ABORT] Missing dependencies")
        return 1
    
    print("\n[3/5] Checking data...")
    if not check_data():
        print("\n[ABORT] Missing data")
        return 1
    
    print("\n[4/5] Checking models...")
    if not check_models():
        print("\n[ABORT] Missing models")
        return 1
    
    print("\n[5/5] Testing inference...")
    if not test_inference():
        print("\n[ABORT] Inference test failed")
        return 1
    
    print("\n" + "=" * 60)
    print("ALL CHECKS PASSED - STARTING SERVER")
    print("=" * 60)
    print("\nServer: http://localhost:8000")
    print("API Docs: http://localhost:8000/docs")
    print("Health: http://localhost:8000/health")
    print("\nPress Ctrl+C to stop")
    print("=" * 60)
    
    # Start server
    import uvicorn
    from prediction_server_production import app
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
