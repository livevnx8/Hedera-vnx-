"""Developer-friendly prediction service wrapper."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PredictionService:
    """Small facade over the production Hedera prediction engine.

    The underlying model stack is loaded lazily when this class is created, so
    importing `vera_os` remains fast for docs, CLIs, and asset tooling.
    """

    engine: Any | None = field(default=None)

    def __post_init__(self) -> None:
        if self.engine is None:
            from prediction_server_production import ProductionPredictionEngine

            self.engine = ProductionPredictionEngine()

    def available_tokens(self) -> list[str]:
        """Return the token symbols with loaded production models."""
        return list(self.engine.token_models.keys())

    def health(self) -> dict[str, Any]:
        """Return model, cache, request, and circuit-breaker health."""
        return self.engine.get_health()

    def features_from_price(self, token: str, price_data: dict[str, Any]) -> dict[str, float] | None:
        """Compute model features from a caller-supplied price snapshot."""
        return self.engine.compute_features(token.lower(), price_data)

    def predict(self, token: str, features: dict[str, float] | None) -> dict[str, Any]:
        """Run a prediction with explicit features.

        Pass features from `features_from_price()` or a trusted feature pipeline.
        Returning the engine's structured error response keeps scripts simple.
        """
        return self.engine.predict(token.lower(), features)
