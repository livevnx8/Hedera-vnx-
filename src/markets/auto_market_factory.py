"""
Auto-Market Factory — automatically creates prediction markets from BitLattice signals.

When the swarm detects strong directional signals with high confidence, this
factory auto-creates markets for users to trade.  Supports scheduled market
creation for recurring events (e.g. "HBAR above $0.10 by end of day").
"""

import hashlib
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from .market_core import MarketManager, MarketType, PredictionMarket
from .hbar_pools import HBARPoolManager
from .hts_outcome_tokens import OutcomeTokenManager
from .oracle_feed import SwarmOracleFeed


@dataclass
class MarketTemplate:
    """A reusable template for auto-creating markets."""
    template_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str = ""
    question_pattern: str = ""       # e.g. "Will {token} move {direction} in the next {window}?"
    token: str = ""
    outcomes: List[str] = field(default_factory=lambda: ["YES", "NO"])
    market_type: MarketType = MarketType.HTS_TOKEN
    duration_seconds: int = 86400    # 24h default
    min_confidence: float = 0.70     # minimum swarm confidence to trigger
    min_probability: float = 0.65    # minimum probability divergence from 0.5
    cooldown_seconds: int = 3600     # 1h between auto-creations
    enabled: bool = True
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "template_id": self.template_id,
            "name": self.name,
            "question_pattern": self.question_pattern,
            "token": self.token,
            "market_type": self.market_type.value,
            "duration_seconds": self.duration_seconds,
            "min_confidence": self.min_confidence,
            "min_probability": self.min_probability,
            "cooldown_seconds": self.cooldown_seconds,
            "enabled": self.enabled,
            "tags": self.tags,
        }


@dataclass
class FactoryEvent:
    """Record of an auto-creation event."""
    event_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    template_id: str = ""
    market_id: str = ""
    trigger_signal: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "template_id": self.template_id,
            "market_id": self.market_id,
            "trigger_signal": self.trigger_signal,
            "created_at": self.created_at,
        }


class AutoMarketFactory:
    """
    Watches oracle signals and auto-creates markets when thresholds are met.

    Usage:
        factory = AutoMarketFactory(market_manager, pool_manager, token_manager, oracle_feed)
        factory.register_template(MarketTemplate(
            name="HBAR Bullish",
            question_pattern="Will HBAR move UP in the next 24 hours?",
            token="hbar",
            min_confidence=0.75,
        ))
        # Call periodically:
        new_markets = factory.check_and_create()
    """

    def __init__(
        self,
        market_manager: MarketManager,
        pool_manager: HBARPoolManager,
        token_manager: OutcomeTokenManager,
        oracle_feed: SwarmOracleFeed,
    ):
        self._markets = market_manager
        self._pools = pool_manager
        self._tokens = token_manager
        self._oracle = oracle_feed

        self._templates: Dict[str, MarketTemplate] = {}
        self._events: List[FactoryEvent] = []
        self._last_created: Dict[str, float] = {}  # template_id → timestamp

    # ------------------------------------------------------------------
    # Template management
    # ------------------------------------------------------------------

    def register_template(self, template: MarketTemplate) -> MarketTemplate:
        """Register a market creation template."""
        self._templates[template.template_id] = template
        return template

    def remove_template(self, template_id: str):
        self._templates.pop(template_id, None)

    def list_templates(self) -> List[MarketTemplate]:
        return list(self._templates.values())

    # ------------------------------------------------------------------
    # Default templates for Hedera tokens
    # ------------------------------------------------------------------

    def register_defaults(self):
        """Register default market templates for HBAR, SAUCE, DOVU."""
        tokens = [
            ("hbar", "HBAR"),
            ("sauce", "SAUCE"),
            ("dovu", "DOVU"),
        ]
        for token_lower, token_upper in tokens:
            # Bullish market
            self.register_template(MarketTemplate(
                name=f"{token_upper} Bullish 24h",
                question_pattern=f"Will {token_upper} price increase in the next 24 hours?",
                token=token_lower,
                outcomes=["YES", "NO"],
                market_type=MarketType.HTS_TOKEN,
                duration_seconds=86400,
                min_confidence=0.75,
                min_probability=0.65,
                cooldown_seconds=7200,
                tags=[token_lower, "auto", "bullish"],
            ))
            # Bearish market
            self.register_template(MarketTemplate(
                name=f"{token_upper} Bearish 24h",
                question_pattern=f"Will {token_upper} price decrease in the next 24 hours?",
                token=token_lower,
                outcomes=["YES", "NO"],
                market_type=MarketType.HBAR_POOL,
                duration_seconds=86400,
                min_confidence=0.75,
                min_probability=0.65,
                cooldown_seconds=7200,
                tags=[token_lower, "auto", "bearish"],
            ))
            # Short-term (4h)
            self.register_template(MarketTemplate(
                name=f"{token_upper} Short-term 4h",
                question_pattern=f"Will {token_upper} move significantly in the next 4 hours?",
                token=token_lower,
                outcomes=["UP", "DOWN"],
                market_type=MarketType.BINARY,
                duration_seconds=14400,
                min_confidence=0.80,
                min_probability=0.70,
                cooldown_seconds=3600,
                tags=[token_lower, "auto", "short-term"],
            ))

    # ------------------------------------------------------------------
    # Auto-creation logic
    # ------------------------------------------------------------------

    def check_and_create(self) -> List[PredictionMarket]:
        """
        Check all templates against current oracle signals.
        Create markets where thresholds are met and cooldown has passed.

        Returns list of newly created markets.
        """
        created: List[PredictionMarket] = []
        now = time.time()

        for template in self._templates.values():
            if not template.enabled:
                continue

            # Check cooldown
            last = self._last_created.get(template.template_id, 0)
            if now - last < template.cooldown_seconds:
                continue

            # Check for matching signals across all markets
            signal = self._find_trigger_signal(template)
            if not signal:
                continue

            # Create market
            market = self._create_from_template(template, signal)
            if market:
                created.append(market)
                self._last_created[template.template_id] = now
                self._events.append(FactoryEvent(
                    template_id=template.template_id,
                    market_id=market.market_id,
                    trigger_signal=signal,
                ))

        return created

    def check_signal_and_create(
        self,
        token: str,
        swarm_result: Dict[str, Any],
    ) -> List[PredictionMarket]:
        """
        Check a specific swarm result against templates for this token.
        Use this when you get a fresh prediction from VNXSwarmEngine.
        """
        created: List[PredictionMarket] = []
        now = time.time()

        for template in self._templates.values():
            if not template.enabled or template.token != token:
                continue

            last = self._last_created.get(template.template_id, 0)
            if now - last < template.cooldown_seconds:
                continue

            confidence = swarm_result.get("confidence", 0)
            up_prob = swarm_result.get("up_probability", 0.5)
            direction = swarm_result.get("direction", "")
            divergence = abs(up_prob - 0.5)

            if confidence < template.min_confidence:
                continue
            if divergence < (template.min_probability - 0.5):
                continue

            # Direction check for directional templates
            if "bullish" in template.tags and direction != "UP":
                continue
            if "bearish" in template.tags and direction != "DOWN":
                continue

            market = self._create_from_template(template, swarm_result)
            if market:
                created.append(market)
                self._last_created[template.template_id] = now
                self._events.append(FactoryEvent(
                    template_id=template.template_id,
                    market_id=market.market_id,
                    trigger_signal=swarm_result,
                ))

        return created

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_events(self, limit: int = 50) -> List[FactoryEvent]:
        return list(reversed(self._events[-limit:]))

    def stats(self) -> Dict[str, Any]:
        return {
            "templates": len(self._templates),
            "enabled_templates": sum(1 for t in self._templates.values() if t.enabled),
            "total_auto_created": len(self._events),
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _find_trigger_signal(self, template: MarketTemplate) -> Optional[Dict[str, Any]]:
        """Look for oracle signals matching the template trigger conditions."""
        # Check across all tracked markets for this token's signals
        for market_id, signals in self._oracle._signals.items():
            if not signals:
                continue
            latest = signals[-1]
            if latest.confidence >= template.min_confidence:
                divergence = abs(latest.probability - 0.5)
                if divergence >= (template.min_probability - 0.5):
                    return latest.to_dict()
        return None

    def _create_from_template(
        self,
        template: MarketTemplate,
        trigger: Dict[str, Any],
    ) -> Optional[PredictionMarket]:
        """Create a market from a template."""
        try:
            resolution_time = time.time() + template.duration_seconds
            question = template.question_pattern

            market = self._markets.create_market(
                question=question,
                outcomes=template.outcomes,
                resolution_time=resolution_time,
                market_type=template.market_type,
                creator="auto_factory",
                description=f"Auto-created from {template.name} | trigger confidence: {trigger.get('confidence', 'N/A')}",
                tags=template.tags + ["auto_created"],
            )

            # Create backing structures
            if template.market_type in (MarketType.HBAR_POOL, MarketType.BINARY):
                try:
                    self._pools.create_pool(market.market_id, template.outcomes)
                except ValueError:
                    pass

            if template.market_type == MarketType.HTS_TOKEN:
                try:
                    self._tokens.create_market_tokens(market.market_id, template.outcomes)
                except ValueError:
                    pass

            return market
        except Exception:
            return None
