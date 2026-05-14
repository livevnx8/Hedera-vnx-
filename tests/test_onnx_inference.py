"""Tests for ONNX inference engine."""

import os
import sys

sys.path.insert(0, ".")

import pytest
import numpy as np


class TestONNXPredictionEngine:
    def setup_method(self):
        from src.prediction.onnx_inference import ONNXPredictionEngine
        self.engine = ONNXPredictionEngine()

    def test_models_loaded(self):
        assert len(self.engine.token_models) >= 1, "At least one ONNX model should load"
        assert "hbar" in self.engine.token_models

    def test_available_tokens(self):
        tokens = self.engine.available_tokens()
        assert isinstance(tokens, list)
        assert "hbar" in tokens

    def test_predict_hbar(self):
        features = {
            "price_change_1h": 0.01,
            "price_change_4h": 0.02,
            "price_change_24h": -0.01,
            "price_vs_sma7": 0.005,
            "price_vs_sma20": -0.01,
            "price_vs_sma50": -0.02,
            "rsi_14": 55.0,
            "bb_percent_b": 0.6,
            "volatility_14h": 0.03,
            "volume_proxy": 0.5,
            "volume_sma_24": 0.8,
            "volume_change_1h": 0.1,
            "high_low_range": 0.02,
            "body_size": 0.01,
        }
        result = self.engine.predict("hbar", features)
        assert "error" not in result
        assert result["token"] == "HBAR"
        assert result["direction"] in ("UP", "DOWN")
        assert 0 <= result["up_probability"] <= 1
        assert 0 <= result["down_probability"] <= 1
        assert result["inference_engine"] == "onnx"

    def test_predict_unknown_token(self):
        result = self.engine.predict("unknown_token", {})
        assert "error" in result
        assert result["code"] == "UNKNOWN_TOKEN"

    def test_predict_no_features(self):
        result = self.engine.predict("hbar", None)
        assert "error" in result

    def test_stats(self):
        stats = self.engine.stats()
        assert stats["engine"] == "onnx"
        assert stats["models_loaded"] >= 1
        assert isinstance(stats["tokens"], list)

    def test_inference_speed(self):
        """ONNX inference should be fast (< 10ms per prediction)."""
        features = {k: 0.0 for k in [
            "price_change_1h", "price_change_4h", "price_change_24h",
            "price_vs_sma7", "price_vs_sma20", "price_vs_sma50",
            "rsi_14", "bb_percent_b", "volatility_14h",
            "volume_proxy", "volume_sma_24", "volume_change_1h",
            "high_low_range", "body_size",
        ]}
        # Warm up
        self.engine.predict("hbar", features)
        # Measure
        import time
        start = time.perf_counter()
        N = 100
        for _ in range(N):
            self.engine.predict("hbar", features)
        elapsed = (time.perf_counter() - start) * 1000
        avg_ms = elapsed / N
        assert avg_ms < 10, f"ONNX inference too slow: {avg_ms:.2f}ms avg"
