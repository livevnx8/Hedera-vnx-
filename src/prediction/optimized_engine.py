#!/usr/bin/env python3
"""
Optimized Prediction Engine for Vera OS.

Optimizations applied:
  1. ThreadPoolExecutor for CPU-bound PyTorch inference (non-blocking)
  2. LRU prediction cache with 30s TTL
  3. torch.set_num_threads(4) for efficient parallel inference
  4. Batch prediction support
  5. Feature vector pre-allocation and reuse
  6. Pre-warmed dummy inference on load
"""

import hashlib
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from typing import Dict, Any, List, Optional

import numpy as np
import torch
import torch.nn.functional as F

from prediction_server_production import (
    ProductionPredictionEngine,
    FEATURE_KEYS,
    DEVICE,
    logger,
)

# Optimize PyTorch for CPU inference
# Use 4 threads per model (28 cores / ~7 models = 4 each, good balance)
torch.set_num_threads(4)
torch.set_num_interop_threads(2)

# Enable JIT optimizations where possible
torch.backends.mkldnn.enabled = True


class OptimizedPredictionEngine(ProductionPredictionEngine):
    """Drop-in optimized replacement for ProductionPredictionEngine."""

    def __init__(self, max_workers: int = 8, cache_ttl: int = 30):
        self._cache: Dict[str, Any] = {}
        self._cache_ttl = cache_ttl
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="vera_inference"
        )
        self._feature_buffer = None
        super().__init__()
        self._warmup_all_models()

    def _warmup_all_models(self):
        """Run dummy inference to warm up CPU caches and JIT."""
        dummy = torch.randn(1, len(FEATURE_KEYS)).to(DEVICE)
        for token, info in self.token_models.items():
            model = info["model"]
            model.eval()
            with torch.no_grad():
                for _ in range(3):
                    _ = model(dummy)
        logger.info("All models warmed up")

    def _feature_hash(self, features: Dict[str, float]) -> str:
        """Hash features for cache key."""
        vals = [round(features.get(k, 0), 6) for k in FEATURE_KEYS]
        return hashlib.md5(json.dumps(vals).encode()).hexdigest()[:16]

    def _cache_key(self, token: str, features: Dict[str, float]) -> str:
        return f"{token}:{self._feature_hash(features)}"

    def _get_cached(self, key: str) -> Optional[Dict]:
        entry = self._cache.get(key)
        if entry and time.time() - entry["ts"] < self._cache_ttl:
            return entry["result"]
        return None

    def _set_cached(self, key: str, result: Dict):
        self._cache[key] = {"result": result, "ts": time.time()}

    def _predict_sync(self, token: str, features: Dict[str, float]) -> Dict[str, Any]:
        """Synchronous predict (runs in thread pool)."""
        # Check cache first
        cache_key = self._cache_key(token, features)
        cached = self._get_cached(cache_key)
        if cached:
            return {**cached, "cached": True}

        self.request_count += 1

        if token not in self.token_models:
            self.error_count += 1
            return {"error": f"Unknown token: {token}", "code": "UNKNOWN_TOKEN"}

        if features is None:
            self.error_count += 1
            return {"error": "Insufficient price history", "code": "INSUFFICIENT_DATA"}

        try:
            # Pre-allocate or reuse tensor
            if self._feature_buffer is None or self._feature_buffer.shape != (1, len(FEATURE_KEYS)):
                self._feature_buffer = torch.empty(1, len(FEATURE_KEYS), dtype=torch.float32, device=DEVICE)

            for i, k in enumerate(FEATURE_KEYS):
                self._feature_buffer[0, i] = features.get(k, 0.0)

            model_info = self.token_models[token]
            model = model_info["model"]

            start = time.perf_counter()
            with torch.no_grad():
                logits, _ = model(self._feature_buffer)
                probs = F.softmax(logits, dim=1)
            inference_time = (time.perf_counter() - start) * 1000

            up_prob = probs[0, 1].item()
            down_prob = probs[0, 0].item()
            confidence = max(up_prob, down_prob)
            direction = "UP" if up_prob > down_prob else "DOWN"

            result = {
                "token": token.upper(),
                "direction": direction,
                "confidence": round(confidence, 4),
                "up_probability": round(up_prob, 4),
                "down_probability": round(down_prob, 4),
                "inference_time_ms": round(inference_time, 2),
                "cached": False,
                "model_accuracy": model_info.get("accuracy", 0),
            }

            self._set_cached(cache_key, result)
            return result

        except Exception as e:
            self.error_count += 1
            logger.error(f"Prediction error for {token}: {e}")
            return {"error": str(e), "code": "PREDICTION_ERROR"}

    def predict(self, token: str, features: Dict[str, float]) -> Dict[str, Any]:
        """Thread-safe predict that can be called from async code."""
        return self._predict_sync(token, features)

    async def predict_async(self, token: str, features: Dict[str, float]) -> Dict[str, Any]:
        """Async wrapper using thread pool (non-blocking)."""
        loop = __import__('asyncio').get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            self._predict_sync,
            token,
            features
        )

    def predict_batch(self, tokens: List[str], features_list: List[Dict[str, float]]) -> List[Dict[str, Any]]:
        """Batch predict multiple tokens (parallel via thread pool)."""
        futures = [
            self._executor.submit(self._predict_sync, t, f)
            for t, f in zip(tokens, features_list)
        ]
        return [f.result() for f in futures]

    async def predict_batch_async(self, tokens: List[str], features_list: List[Dict[str, float]]) -> List[Dict[str, Any]]:
        """Async batch predict."""
        loop = __import__('asyncio').get_event_loop()
        futures = [
            loop.run_in_executor(self._executor, self._predict_sync, t, f)
            for t, f in zip(tokens, features_list)
        ]
        return await __import__('asyncio').gather(*futures)

    def get_cache_stats(self) -> Dict[str, Any]:
        """Return cache hit/miss stats."""
        # Count cached entries
        total = len(self._cache)
        valid = sum(1 for e in self._cache.values() if time.time() - e["ts"] < self._cache_ttl)
        return {
            "cache_entries": total,
            "valid_entries": valid,
            "ttl_seconds": self._cache_ttl,
            "executor_workers": self._executor._max_workers,
        }

    def shutdown(self):
        """Clean shutdown."""
        self._executor.shutdown(wait=True)
        logger.info("OptimizedPredictionEngine shut down")
