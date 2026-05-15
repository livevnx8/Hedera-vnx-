"""
ONNX Inference Engine for VNX token prediction models.

Loads ONNX models from models/onnx/ and runs inference using onnxruntime.
Falls back to CPU if GPU provider is unavailable.
Designed as a drop-in replacement for the PyTorch inference path.
"""

import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

logger = logging.getLogger("vnx.onnx_inference")

FEATURE_KEYS = [
    "price_change_1h", "price_change_4h", "price_change_24h",
    "price_vs_sma7", "price_vs_sma20", "price_vs_sma50",
    "rsi_14", "bb_percent_b", "volatility_14h",
    "volume_proxy", "volume_sma_24", "volume_change_1h",
    "high_low_range", "body_size",
]


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x, axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)


class ONNXModel:
    """Wrapper around a single ONNX model session."""

    def __init__(self, model_path: str, providers: Optional[List[str]] = None):
        import onnxruntime as ort

        if providers is None:
            available = ort.get_available_providers()
            # Prefer GPU if available
            if "CUDAExecutionProvider" in available:
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            else:
                providers = ["CPUExecutionProvider"]

        self.session = ort.InferenceSession(model_path, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.output_names = [o.name for o in self.session.get_outputs()]
        self.provider = self.session.get_providers()[0]
        self.model_path = model_path
        self.inference_count = 0
        self.total_inference_ms = 0.0

        logger.info(
            f"ONNX model loaded: {os.path.basename(model_path)} "
            f"provider={self.provider}"
        )

    def predict(self, features: np.ndarray) -> Dict[str, np.ndarray]:
        """Run inference on a feature array of shape (batch, 14)."""
        if features.ndim == 1:
            features = features.reshape(1, -1)

        start = time.perf_counter()
        outputs = self.session.run(None, {self.input_name: features.astype(np.float32)})
        elapsed_ms = (time.perf_counter() - start) * 1000

        self.inference_count += 1
        self.total_inference_ms += elapsed_ms

        return {
            name: arr
            for name, arr in zip(self.output_names, outputs)
        }

    @property
    def avg_inference_ms(self) -> float:
        if self.inference_count == 0:
            return 0.0
        return self.total_inference_ms / self.inference_count


class ONNXPredictionEngine:
    """
    Drop-in ONNX prediction engine for VNX.

    Scans models/onnx/ for *_production.onnx files and loads them.
    Provides the same predict() interface as ProductionPredictionEngine.
    """

    def __init__(self, models_dir: Optional[str] = None):
        if models_dir is None:
            models_dir = os.environ.get(
                "ONNX_MODELS_DIR",
                str(Path(__file__).resolve().parents[2] / "models" / "onnx"),
            )
        self._models_dir = Path(models_dir)
        self.token_models: Dict[str, ONNXModel] = {}
        self._load_models()

    def _load_models(self):
        if not self._models_dir.exists():
            logger.warning(f"ONNX models directory not found: {self._models_dir}")
            return

        for model_file in sorted(self._models_dir.glob("*_production.onnx")):
            token = model_file.stem.replace("_production", "")
            try:
                self.token_models[token] = ONNXModel(str(model_file))
            except Exception as e:
                logger.error(f"Failed to load ONNX model {token}: {e}")

        logger.info(
            f"ONNXPredictionEngine: {len(self.token_models)} models loaded "
            f"({', '.join(self.token_models.keys())})"
        )

    def predict(self, token: str, features: Dict[str, float]) -> Dict[str, Any]:
        """
        Run prediction for a token using ONNX inference.
        Returns same structure as ProductionPredictionEngine.predict().
        """
        token = token.lower()

        if token not in self.token_models:
            return {"error": f"No ONNX model for {token}", "code": "UNKNOWN_TOKEN"}

        if features is None:
            return {"error": "No features provided", "code": "INSUFFICIENT_DATA"}

        try:
            feature_vector = np.array(
                [[features.get(k, 0.0) for k in FEATURE_KEYS]],
                dtype=np.float32,
            )

            model = self.token_models[token]
            outputs = model.predict(feature_vector)

            logits = outputs.get("logits", outputs.get(model.output_names[0]))
            probs = _softmax(logits)

            up_prob = float(probs[0, 1])
            down_prob = float(probs[0, 0])
            confidence = abs(up_prob - 0.5) * 2

            return {
                "token": token.upper(),
                "direction": "UP" if up_prob > 0.5 else "DOWN",
                "up_probability": round(up_prob, 4),
                "down_probability": round(down_prob, 4),
                "confidence": round(confidence, 4),
                "market_odds": round(up_prob / max(down_prob, 1e-8), 2),
                "inference_time_ms": round(model.avg_inference_ms, 3),
                "inference_engine": "onnx",
                "provider": model.provider,
                "timestamp": datetime.now().isoformat(),
            }

        except Exception as e:
            logger.error(f"ONNX prediction error for {token}: {e}")
            return {"error": str(e), "code": "PREDICTION_ERROR"}

    def available_tokens(self) -> List[str]:
        return list(self.token_models.keys())

    def stats(self) -> Dict[str, Any]:
        model_stats = {}
        for token, model in self.token_models.items():
            model_stats[token] = {
                "provider": model.provider,
                "inference_count": model.inference_count,
                "avg_inference_ms": round(model.avg_inference_ms, 3),
                "model_path": os.path.basename(model.model_path),
            }
        return {
            "engine": "onnx",
            "models_dir": str(self._models_dir),
            "models_loaded": len(self.token_models),
            "tokens": list(self.token_models.keys()),
            "models": model_stats,
        }
