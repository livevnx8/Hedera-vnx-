"""
Intelligence & Analytics Agents — 5 specialists for signal aggregation,
sentiment, whale profiling, volume anomaly detection, and cross-chain arb.
"""

import hashlib
import math
import time
from typing import Any, Dict, List

from .base_agent import (
    AgentAction,
    ActionType,
    AgentDomain,
    WorkflowAgent,
    WorkflowOrchestrator,
)


class PredictionSignalAggregatorAgent(WorkflowAgent):
    """
    Combine BitLattice, oracle feed, sentiment, and on-chain signals
    into a composite score.
    """

    def __init__(self):
        super().__init__("intel_signal_001", "Prediction Signal Aggregator", AgentDomain.INTEL)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        signals = context.get("signals", self._default_signals())
        actions: List[AgentAction] = []

        weighted_sum = 0.0
        total_weight = 0.0
        components = []

        for sig in signals:
            name = sig.get("source", "unknown")
            value = sig.get("value", 0.5)        # 0 = bearish, 1 = bullish
            confidence = sig.get("confidence", 0.5)
            weight = sig.get("weight", 1.0)

            effective_weight = weight * confidence
            weighted_sum += value * effective_weight
            total_weight += effective_weight

            components.append({
                "source": name,
                "value": round(value, 3),
                "confidence": round(confidence, 3),
                "weight": weight,
                "contribution": round(value * effective_weight, 4),
            })

        composite = weighted_sum / max(total_weight, 0.001)
        direction = "BULLISH" if composite > 0.6 else "BEARISH" if composite < 0.4 else "NEUTRAL"

        actions.append(AgentAction(
            action_type=ActionType.INFORM,
            title=f"Composite signal: {direction} ({composite:.3f})",
            description=f"{len(signals)} sources | Strongest: {max(components, key=lambda c: c['contribution'])['source']}",
            params={
                "composite": round(composite, 4),
                "direction": direction,
                "sources": len(signals),
            },
            confidence=min(0.95, total_weight / max(len(signals), 1)),
            urgency="medium" if direction != "NEUTRAL" else "low",
        ))

        if abs(composite - 0.5) > 0.3:
            actions.append(AgentAction(
                action_type=ActionType.RECOMMEND,
                title=f"Strong signal: {direction} ({composite:.3f})",
                description="Signal strength warrants position adjustment",
                params={"composite": round(composite, 4), "direction": direction},
                confidence=0.82,
                urgency="high",
            ))

        return {
            "status": "completed",
            "composite_score": round(composite, 4),
            "direction": direction,
            "components": components,
            "actions": actions,
        }

    def _default_signals(self) -> List[Dict]:
        return [
            {"source": "bitlattice_swarm", "value": 0.72, "confidence": 0.85, "weight": 3.0},
            {"source": "oracle_feed", "value": 0.68, "confidence": 0.80, "weight": 2.5},
            {"source": "on_chain_momentum", "value": 0.61, "confidence": 0.70, "weight": 1.5},
            {"source": "sentiment_index", "value": 0.55, "confidence": 0.60, "weight": 1.0},
            {"source": "volume_trend", "value": 0.64, "confidence": 0.75, "weight": 1.5},
        ]


class SentimentAggregatorAgent(WorkflowAgent):
    """
    Aggregate social signals, compute fear/greed index, trend detection.
    """

    def __init__(self):
        super().__init__("intel_sentiment_001", "Sentiment Aggregator", AgentDomain.INTEL)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        sources = context.get("sentiment_sources", self._default_sources())
        actions: List[AgentAction] = []

        total_score = 0
        total_weight = 0
        breakdown = []

        for src in sources:
            name = src.get("source", "unknown")
            score = src.get("score", 50)       # 0=extreme fear, 100=extreme greed
            volume = src.get("volume", 0)      # message/post count
            weight = src.get("weight", 1.0)
            trend = src.get("trend", "flat")   # rising | falling | flat

            total_score += score * weight
            total_weight += weight
            breakdown.append({
                "source": name,
                "score": score,
                "volume": volume,
                "trend": trend,
            })

        fear_greed = round(total_score / max(total_weight, 1), 1)
        label = (
            "Extreme Fear" if fear_greed < 20 else
            "Fear" if fear_greed < 40 else
            "Neutral" if fear_greed < 60 else
            "Greed" if fear_greed < 80 else
            "Extreme Greed"
        )

        actions.append(AgentAction(
            action_type=ActionType.INFORM,
            title=f"Fear/Greed Index: {fear_greed:.0f} ({label})",
            description=f"{len(sources)} sources aggregated",
            params={"fear_greed": fear_greed, "label": label},
            confidence=0.78,
            urgency="low" if 30 < fear_greed < 70 else "medium",
        ))

        if fear_greed < 20 or fear_greed > 80:
            actions.append(AgentAction(
                action_type=ActionType.ALERT,
                title=f"Extreme sentiment: {label}",
                description="Contrarian signal — extreme readings often precede reversals",
                params={"fear_greed": fear_greed, "label": label},
                confidence=0.75,
                urgency="high",
            ))

        return {
            "status": "completed",
            "fear_greed_index": fear_greed,
            "label": label,
            "breakdown": breakdown,
            "actions": actions,
        }

    def _default_sources(self) -> List[Dict]:
        return [
            {"source": "crypto_twitter", "score": 62, "volume": 15000, "weight": 2.0, "trend": "rising"},
            {"source": "reddit_hedera", "score": 58, "volume": 800, "weight": 1.5, "trend": "flat"},
            {"source": "discord_community", "score": 71, "volume": 3200, "weight": 1.0, "trend": "rising"},
            {"source": "news_headlines", "score": 45, "volume": 50, "weight": 1.5, "trend": "falling"},
        ]


class WhaleBehaviorProfilerAgent(WorkflowAgent):
    """
    Cluster large wallets, track accumulation/distribution, predict impact.
    """

    def __init__(self):
        super().__init__("intel_whale_001", "Whale Behavior Profiler", AgentDomain.INTEL)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        whales = context.get("whales", self._default_whales())
        actions: List[AgentAction] = []

        accumulating = 0
        distributing = 0
        total_moved = 0
        analyzed = []

        for w in whales:
            addr = w.get("address", "0.0.???")
            balance = w.get("balance", 0)
            inflow_24h = w.get("inflow_24h", 0)
            outflow_24h = w.get("outflow_24h", 0)
            tx_count_24h = w.get("tx_count_24h", 0)

            net_flow = inflow_24h - outflow_24h
            total_moved += abs(net_flow)
            behavior = "accumulating" if net_flow > 0 else "distributing" if net_flow < 0 else "holding"

            if behavior == "accumulating":
                accumulating += 1
            elif behavior == "distributing":
                distributing += 1

            entry = {
                "address": addr,
                "balance": balance,
                "net_flow_24h": net_flow,
                "behavior": behavior,
                "tx_count_24h": tx_count_24h,
            }
            analyzed.append(entry)

            # Large single-entity move
            if abs(net_flow) > 1_000_000_000_000:  # >10k HBAR
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Whale move: {addr} {'bought' if net_flow > 0 else 'sold'} {abs(net_flow)/100_000_000:.0f} HBAR",
                    description=f"Balance: {balance/100_000_000:.0f} HBAR | Behavior: {behavior}",
                    params={"address": addr, "net_flow": net_flow, "behavior": behavior},
                    confidence=0.88,
                    urgency="high",
                ))

        net_pressure = "accumulation" if accumulating > distributing else "distribution" if distributing > accumulating else "neutral"
        actions.append(AgentAction(
            action_type=ActionType.INFORM,
            title=f"Whale pressure: {net_pressure} ({accumulating} buy / {distributing} sell)",
            description=f"Total whale flow: {total_moved/100_000_000:.0f} HBAR moved in 24h",
            params={"net_pressure": net_pressure, "accumulating": accumulating, "distributing": distributing},
            confidence=0.82,
            urgency="medium" if net_pressure != "neutral" else "low",
        ))

        return {
            "status": "completed",
            "whales": analyzed,
            "net_pressure": net_pressure,
            "accumulating_count": accumulating,
            "distributing_count": distributing,
            "total_moved_24h": total_moved,
            "actions": actions,
        }

    def _default_whales(self) -> List[Dict]:
        return [
            {"address": "0.0.98", "balance": 50_000_000_000_000, "inflow_24h": 2_000_000_000_000, "outflow_24h": 500_000_000_000, "tx_count_24h": 12},
            {"address": "0.0.800", "balance": 20_000_000_000_000, "inflow_24h": 100_000_000_000, "outflow_24h": 3_000_000_000_000, "tx_count_24h": 8},
            {"address": "0.0.1500", "balance": 10_000_000_000_000, "inflow_24h": 500_000_000_000, "outflow_24h": 500_000_000_000, "tx_count_24h": 4},
        ]


class VolumeAnomalyScorerAgent(WorkflowAgent):
    """
    Z-score volume deviations, wash trading detection, organic vs synthetic.
    """

    def __init__(self):
        super().__init__("intel_volume_001", "Volume Anomaly Scorer", AgentDomain.INTEL)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        markets = context.get("volume_data", self._default_data())
        actions: List[AgentAction] = []

        analyzed = []
        for m in markets:
            name = m.get("market", "Unknown")
            current_vol = m.get("volume_24h", 0)
            avg_vol = m.get("avg_volume_30d", 0)
            std_vol = m.get("std_volume_30d", 1)
            unique_traders = m.get("unique_traders_24h", 0)
            avg_trade_size = m.get("avg_trade_size", 0)

            # Z-score
            z_score = (current_vol - avg_vol) / max(std_vol, 1)

            # Wash trading indicator: low unique traders relative to volume
            trades_estimate = current_vol / max(avg_trade_size, 1)
            wash_ratio = trades_estimate / max(unique_traders, 1)
            wash_suspect = wash_ratio > 10

            organic_pct = min(100, max(0, 100 - (wash_ratio - 1) * 10)) if wash_ratio > 1 else 100

            entry = {
                "market": name,
                "volume_24h": current_vol,
                "z_score": round(z_score, 2),
                "wash_suspect": wash_suspect,
                "organic_pct": round(organic_pct, 1),
                "unique_traders": unique_traders,
            }
            analyzed.append(entry)

            if abs(z_score) > 3:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Volume anomaly: {name} (z={z_score:+.1f})",
                    description=f"{'Spike' if z_score > 0 else 'Collapse'} — {current_vol:,.0f} vs avg {avg_vol:,.0f}",
                    params={"market": name, "z_score": z_score, "volume": current_vol},
                    confidence=0.85,
                    urgency="high",
                ))
            if wash_suspect:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Wash trading suspect: {name}",
                    description=f"Only {unique_traders} unique traders for {current_vol:,.0f} volume. Organic: {organic_pct:.0f}%",
                    params={"market": name, "organic_pct": organic_pct, "unique_traders": unique_traders},
                    confidence=0.78,
                    urgency="high",
                ))

        return {
            "status": "completed",
            "markets": analyzed,
            "anomaly_count": sum(1 for a in analyzed if abs(a["z_score"]) > 2),
            "wash_suspects": sum(1 for a in analyzed if a["wash_suspect"]),
            "actions": actions,
        }

    def _default_data(self) -> List[Dict]:
        return [
            {"market": "HBAR/USDC", "volume_24h": 2_500_000, "avg_volume_30d": 800_000, "std_volume_30d": 200_000, "unique_traders_24h": 450, "avg_trade_size": 2000},
            {"market": "SAUCE/USDC", "volume_24h": 180_000, "avg_volume_30d": 150_000, "std_volume_30d": 40_000, "unique_traders_24h": 120, "avg_trade_size": 500},
            {"market": "DOVU/HBAR", "volume_24h": 500_000, "avg_volume_30d": 50_000, "std_volume_30d": 20_000, "unique_traders_24h": 8, "avg_trade_size": 100},
        ]


class CrossChainArbDetectorAgent(WorkflowAgent):
    """
    Price discrepancy detection across bridges, arb opportunity scoring.
    """

    def __init__(self):
        super().__init__("intel_arb_001", "Cross-Chain Arb Detector", AgentDomain.INTEL)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        pairs = context.get("cross_chain_pairs", self._default_pairs())
        actions: List[AgentAction] = []

        opportunities = []
        for pair in pairs:
            token = pair.get("token", "Unknown")
            hedera_price = pair.get("hedera_price", 0)
            external_price = pair.get("external_price", 0)
            bridge = pair.get("bridge", "unknown")
            bridge_fee_pct = pair.get("bridge_fee_pct", 0.5)
            bridge_time_min = pair.get("bridge_time_min", 15)

            if hedera_price <= 0 or external_price <= 0:
                continue

            spread_pct = ((external_price - hedera_price) / hedera_price) * 100
            net_profit_pct = abs(spread_pct) - bridge_fee_pct

            profitable = net_profit_pct > 0.1  # >0.1% net

            direction = "buy_hedera_sell_external" if spread_pct > 0 else "buy_external_sell_hedera"

            entry = {
                "token": token,
                "hedera_price": hedera_price,
                "external_price": external_price,
                "spread_pct": round(spread_pct, 3),
                "bridge": bridge,
                "bridge_fee_pct": bridge_fee_pct,
                "net_profit_pct": round(net_profit_pct, 3),
                "profitable": profitable,
                "direction": direction,
                "bridge_time_min": bridge_time_min,
            }
            opportunities.append(entry)

            if profitable and net_profit_pct > 0.5:
                actions.append(AgentAction(
                    action_type=ActionType.RECOMMEND,
                    title=f"Arb opportunity: {token} ({net_profit_pct:.2f}% net)",
                    description=f"Spread: {spread_pct:+.3f}% | Direction: {direction} | Bridge: {bridge} ({bridge_time_min}min)",
                    params={"token": token, "direction": direction, "net_profit_pct": net_profit_pct},
                    confidence=0.80,
                    urgency="high" if net_profit_pct > 1.0 else "medium",
                ))

        return {
            "status": "completed",
            "opportunities": opportunities,
            "profitable_count": sum(1 for o in opportunities if o["profitable"]),
            "best_spread": max((o["net_profit_pct"] for o in opportunities), default=0),
            "actions": actions,
        }

    def _default_pairs(self) -> List[Dict]:
        return [
            {"token": "HBAR", "hedera_price": 0.0850, "external_price": 0.0862, "bridge": "hashport", "bridge_fee_pct": 0.3, "bridge_time_min": 10},
            {"token": "SAUCE", "hedera_price": 0.0120, "external_price": 0.0118, "bridge": "hashport", "bridge_fee_pct": 0.5, "bridge_time_min": 15},
            {"token": "USDC", "hedera_price": 1.0000, "external_price": 1.0001, "bridge": "hashport", "bridge_fee_pct": 0.2, "bridge_time_min": 10},
        ]


def create_intel_orchestrator() -> WorkflowOrchestrator:
    """Create the Intelligence & Analytics orchestrator with all 5 agents."""
    return WorkflowOrchestrator(
        domain=AgentDomain.INTEL,
        agents=[
            PredictionSignalAggregatorAgent(),
            SentimentAggregatorAgent(),
            WhaleBehaviorProfilerAgent(),
            VolumeAnomalyScorerAgent(),
            CrossChainArbDetectorAgent(),
        ],
    )
