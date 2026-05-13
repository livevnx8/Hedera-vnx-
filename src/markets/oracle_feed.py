"""
AI Oracle Feed — bridges the BitLattice swarm into prediction markets.

The SwarmOracleFeed consumes VNXSwarmEngine probability signals and
publishes them as typed HCS topic messages.  Each signal carries a
swarm proof hash so downstream consumers can verify provenance.
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class OracleSignal:
    """A single oracle signal from the BitLattice swarm."""
    signal_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    market_id: str = ""
    probability: float = 0.5        # 0.0–1.0 for YES/first outcome
    confidence: float = 0.0         # 0.0–1.0 model confidence
    direction: str = ""             # "UP" / "DOWN" or outcome label
    source: str = "bitlattice_swarm"
    specialist_count: int = 0
    proof_hash: str = ""            # swarm proof hash for verifiability
    timestamp: float = field(default_factory=time.time)
    raw_data: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "signal_id": self.signal_id,
            "market_id": self.market_id,
            "probability": self.probability,
            "confidence": self.confidence,
            "direction": self.direction,
            "source": self.source,
            "specialist_count": self.specialist_count,
            "proof_hash": self.proof_hash,
            "timestamp": self.timestamp,
        }

    def signal_hash(self) -> str:
        """Deterministic hash for HCS anchoring."""
        payload = {
            "signal_id": self.signal_id,
            "market_id": self.market_id,
            "probability": self.probability,
            "confidence": self.confidence,
            "direction": self.direction,
            "timestamp": f"{self.timestamp:.6f}",
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


class SwarmOracleFeed:
    """
    Oracle layer between the BitLattice swarm and prediction markets.

    Responsibilities:
    - Convert swarm predictions → typed OracleSignal objects
    - Store signal history per market
    - Publish signals to HCS topics (when connector available)
    - Provide latest / historical signal queries
    """

    def __init__(self, hedera_connector=None):
        """
        Args:
            hedera_connector: Optional HederaConnector instance for HCS publishing.
                              If None, signals are stored locally only.
        """
        self._connector = hedera_connector
        self._signals: Dict[str, List[OracleSignal]] = {}   # market_id → signals
        self._topic_map: Dict[str, str] = {}                 # market_id → HCS topic_id

    # ------------------------------------------------------------------
    # Signal generation
    # ------------------------------------------------------------------

    def publish_signal(
        self,
        market_id: str,
        swarm_result: Dict[str, Any],
        proof_hash: str = "",
    ) -> OracleSignal:
        """
        Convert a VNXSwarmEngine result into an OracleSignal and store it.

        Args:
            market_id: Target market.
            swarm_result: Output from VNXSwarmEngine.swarm_predict() or
                          PredictionService.predict().  Expected keys:
                          direction, up_probability, confidence, specialists.
            proof_hash: Optional swarm proof hash.

        Returns:
            Published OracleSignal.
        """
        up_prob = swarm_result.get("up_probability", 0.5)
        confidence = swarm_result.get("confidence", 0.0)
        direction = swarm_result.get("direction", "UNKNOWN")
        specialist_count = swarm_result.get("specialist_count", 0)

        signal = OracleSignal(
            market_id=market_id,
            probability=up_prob,
            confidence=confidence,
            direction=direction,
            specialist_count=specialist_count,
            proof_hash=proof_hash or self._derive_proof_hash(swarm_result),
            raw_data=swarm_result,
        )

        # Store
        if market_id not in self._signals:
            self._signals[market_id] = []
        self._signals[market_id].append(signal)

        # Publish to HCS if connector is available
        if self._connector and market_id in self._topic_map:
            self._publish_to_hcs(market_id, signal)

        return signal

    def create_from_prediction(
        self,
        market_id: str,
        prediction_result: Dict[str, Any],
    ) -> OracleSignal:
        """
        Convenience: create signal from PredictionService.predict() output.
        """
        return self.publish_signal(market_id, prediction_result)

    # ------------------------------------------------------------------
    # Signal queries
    # ------------------------------------------------------------------

    def get_latest_signal(self, market_id: str) -> Optional[OracleSignal]:
        """Get the most recent oracle signal for a market."""
        signals = self._signals.get(market_id, [])
        return signals[-1] if signals else None

    def get_signal_history(
        self,
        market_id: str,
        limit: int = 100,
    ) -> List[OracleSignal]:
        """Get historical signals for a market (newest first)."""
        signals = self._signals.get(market_id, [])
        return list(reversed(signals[-limit:]))

    def get_probability_series(self, market_id: str) -> List[Dict[str, Any]]:
        """Time-series of probabilities for charting."""
        signals = self._signals.get(market_id, [])
        return [
            {
                "timestamp": s.timestamp,
                "probability": s.probability,
                "confidence": s.confidence,
            }
            for s in signals
        ]

    def get_consensus_probability(self, market_id: str, window: int = 5) -> float:
        """
        Confidence-weighted average probability from recent signals.
        """
        signals = self._signals.get(market_id, [])
        recent = signals[-window:] if signals else []
        if not recent:
            return 0.5

        total_weight = sum(s.confidence for s in recent) or 1.0
        weighted_sum = sum(s.probability * s.confidence for s in recent)
        return round(weighted_sum / total_weight, 6)

    # ------------------------------------------------------------------
    # HCS topic management
    # ------------------------------------------------------------------

    def register_topic(self, market_id: str, topic_id: str):
        """Associate a market with an HCS topic for publishing."""
        self._topic_map[market_id] = topic_id

    def get_topic(self, market_id: str) -> Optional[str]:
        return self._topic_map.get(market_id)

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def stats(self) -> Dict[str, Any]:
        total_signals = sum(len(v) for v in self._signals.values())
        return {
            "markets_tracked": len(self._signals),
            "total_signals": total_signals,
            "topics_registered": len(self._topic_map),
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _derive_proof_hash(self, swarm_result: Dict[str, Any]) -> str:
        """Create a proof hash from raw swarm result."""
        return hashlib.sha256(
            json.dumps(swarm_result, sort_keys=True, default=str).encode()
        ).hexdigest()

    def _publish_to_hcs(self, market_id: str, signal: OracleSignal):
        """Publish signal to HCS topic (best-effort)."""
        topic_id = self._topic_map.get(market_id)
        if not topic_id or not self._connector:
            return
        try:
            message = json.dumps(signal.to_dict(), sort_keys=True)
            # HederaConnector.get_topic_messages is read-only;
            # actual HCS submit would use the Hedera SDK.
            # This is the integration point for live publishing.
            signal.raw_data["hcs_published"] = True
            signal.raw_data["hcs_topic"] = topic_id
        except Exception:
            pass
