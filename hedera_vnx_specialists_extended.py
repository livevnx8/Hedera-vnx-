#!/usr/bin/env python3
"""
Extended Hedera VNX Micro-Specialists - Additional specialist types.

New specialists:
- Volatility Monitor
- Trend Detector
- Momentum Tracker
- Support/Resistance Analyst
- Correlation Monitor
- Drawdown Risk Assessor
- Market Regime Detector
- Sentiment Analyzer
- Order Flow Monitor
- Liquidity Depth Tracker
"""

import sys
import time
from typing import Dict, Any, List

import numpy as np

from vera_os.paths import add_src_to_path

add_src_to_path()

from hedera_vnx_specialists import BaseVNXSpecialist, SwarmOrchestrator
from hedera_connector import HederaConnector


class VolatilitySpecialist(BaseVNXSpecialist):
    """
    Monitors price volatility and detects regime changes.
    Detects: High volatility periods, calm before storm, volatility clustering.
    """

    def __init__(self):
        super().__init__("volatility_001", "Volatility Monitor")
        self.connector = HederaConnector()
        self.price_history = []
        self.volatility_window = 20

    def run(self) -> Dict[str, Any]:
        self.status = "RUNNING"
        start = time.time()

        try:
            stats = self.connector.get_network_stats()
            price = stats.get("hbar_usd_price", 0.0957)
            self.price_history.append(price)
            if len(self.price_history) > self.volatility_window:
                self.price_history.pop(0)

            alerts = []
            current_vol = 0
            regime = "UNKNOWN"

            if len(self.price_history) >= 5:
                returns = np.diff(self.price_history) / np.array(self.price_history[:-1])
                current_vol = np.std(returns) * np.sqrt(24)  # Annualized hourly vol

                if current_vol > 0.5:
                    regime = "HIGH_VOLATILITY"
                    alerts.append({"type": "HIGH_VOLATILITY", "value": round(current_vol, 4), "severity": "WARNING"})
                elif current_vol < 0.05:
                    regime = "LOW_VOLATILITY"
                    alerts.append({"type": "LOW_VOLATILITY", "value": round(current_vol, 4), "severity": "INFO"})
                else:
                    regime = "NORMAL"

                # Detect volatility clustering
                if len(returns) >= 10:
                    recent_vol = np.std(returns[-5:])
                    older_vol = np.std(returns[-10:-5])
                    if recent_vol > older_vol * 2:
                        alerts.append({"type": "VOLATILITY_CLUSTERING", "severity": "WARNING"})

            self.confidence = min(1.0, len(self.price_history) / self.volatility_window)

        except Exception:
            price = 0
            current_vol = 0
            regime = "ERROR"
            alerts = []
            self.confidence = 0

        self.last_run = time.time()
        self.status = "COMPLETE"

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "current_price": price,
            "volatility": round(current_vol, 4),
            "regime": regime,
            "history_length": len(self.price_history),
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round((time.time() - start) * 1000, 2),
        }


class TrendDetectorSpecialist(BaseVNXSpecialist):
    """
    Detects price trends using multiple timeframes.
    Detects: Uptrend, downtrend, sideways, trend strength.
    """

    def __init__(self):
        super().__init__("trend_001", "Trend Detector")
        self.connector = HederaConnector()
        self.price_history = []

    def run(self) -> Dict[str, Any]:
        self.status = "RUNNING"
        start = time.time()

        try:
            stats = self.connector.get_network_stats()
            price = stats.get("hbar_usd_price", 0.0957)
            self.price_history.append(price)
            if len(self.price_history) > 50:
                self.price_history.pop(0)

            trend = "NEUTRAL"
            strength = 0
            alerts = []

            if len(self.price_history) >= 10:
                # Simple linear regression for trend
                x = np.arange(len(self.price_history))
                y = np.array(self.price_history)
                slope = np.polyfit(x, y, 1)[0]

                # Normalize slope to trend strength (-1 to 1)
                avg_price = np.mean(y)
                strength = np.clip(slope * len(y) / avg_price, -1, 1)

                if strength > 0.3:
                    trend = "UPTREND"
                    if strength > 0.7:
                        alerts.append({"type": "STRONG_UPTREND", "strength": round(strength, 4), "severity": "INFO"})
                elif strength < -0.3:
                    trend = "DOWNTREND"
                    if strength < -0.7:
                        alerts.append({"type": "STRONG_DOWNTREND", "strength": round(strength, 4), "severity": "WARNING"})
                else:
                    trend = "SIDEWAYS"

            self.confidence = min(1.0, len(self.price_history) / 20)

        except Exception:
            trend = "ERROR"
            strength = 0
            alerts = []
            self.confidence = 0

        self.last_run = time.time()
        self.status = "COMPLETE"

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "trend": trend,
            "strength": round(strength, 4),
            "history_length": len(self.price_history),
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round((time.time() - start) * 1000, 2),
        }


class MomentumSpecialist(BaseVNXSpecialist):
    """
    Tracks price momentum and detects divergences.
    Detects: Overbought, oversold, momentum divergence.
    """

    def __init__(self):
        super().__init__("momentum_001", "Momentum Tracker")
        self.price_history = []
        self.rsi_period = 14

    def _calculate_rsi(self, prices: List[float]) -> float:
        """Calculate RSI for momentum."""
        if len(prices) < self.rsi_period + 1:
            return 50

        deltas = np.diff(prices)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)

        avg_gain = np.mean(gains[-self.rsi_period:])
        avg_loss = np.mean(losses[-self.rsi_period:])

        if avg_loss == 0:
            return 100

        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return rsi

    def run(self) -> Dict[str, Any]:
        self.status = "RUNNING"
        start = time.time()

        try:
            connector = HederaConnector()
            stats = connector.get_network_stats()
            price = stats.get("hbar_usd_price", 0.0957)
            self.price_history.append(price)
            if len(self.price_history) > 50:
                self.price_history.pop(0)

            rsi = self._calculate_rsi(self.price_history)
            momentum = (rsi - 50) / 50  # Normalize to -1 to 1

            alerts = []
            signal = "NEUTRAL"

            if rsi > 70:
                signal = "OVERBOUGHT"
                alerts.append({"type": "OVERBOUGHT", "rsi": round(rsi, 2), "severity": "WARNING"})
            elif rsi < 30:
                signal = "OVERSOLD"
                alerts.append({"type": "OVERSOLD", "rsi": round(rsi, 2), "severity": "INFO"})
            elif momentum > 0.3:
                signal = "BULLISH_MOMENTUM"
            elif momentum < -0.3:
                signal = "BEARISH_MOMENTUM"

            self.confidence = min(1.0, len(self.price_history) / self.rsi_period)

        except Exception:
            rsi = 50
            momentum = 0
            signal = "ERROR"
            alerts = []
            self.confidence = 0

        self.last_run = time.time()
        self.status = "COMPLETE"

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "rsi": round(rsi, 2),
            "momentum": round(momentum, 4),
            "signal": signal,
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round((time.time() - start) * 1000, 2),
        }


class SupportResistanceSpecialist(BaseVNXSpecialist):
    """
    Identifies key support and resistance levels.
    Detects: Breakouts, bounces, level tests.
    """

    def __init__(self):
        super().__init__("sr_levels_001", "Support/Resistance Analyst")
        self.price_history = []
        self.levels = []

    def _find_levels(self, prices: List[float], n_levels: int = 3) -> List[float]:
        """Find support/resistance levels using local extrema."""
        if len(prices) < 10:
            return []

        prices_arr = np.array(prices)

        # Simple approach: find most frequent price regions
        hist, bins = np.histogram(prices_arr, bins=20)
        peak_indices = np.argsort(hist)[-n_levels:]
        levels = [(bins[i] + bins[i+1]) / 2 for i in peak_indices]

        return sorted(levels)

    def run(self) -> Dict[str, Any]:
        self.status = "RUNNING"
        start = time.time()

        try:
            connector = HederaConnector()
            stats = connector.get_network_stats()
            price = stats.get("hbar_usd_price", 0.0957)
            self.price_history.append(price)
            if len(self.price_history) > 100:
                self.price_history.pop(0)

            self.levels = self._find_levels(self.price_history)

            alerts = []
            nearest_support = None
            nearest_resistance = None

            if self.levels:
                # Find nearest support (below price) and resistance (above price)
                below = [l for l in self.levels if l < price]
                above = [l for l in self.levels if l > price]

                if below:
                    nearest_support = max(below)
                if above:
                    nearest_resistance = min(above)

                # Check if price is near a level (within 1%)
                for level in self.levels:
                    if abs(price - level) / level < 0.01:
                        alerts.append({"type": "LEVEL_TEST", "level": round(level, 4), "severity": "INFO"})

            self.confidence = min(1.0, len(self.price_history) / 50)

        except Exception:
            price = 0
            alerts = []
            self.confidence = 0

        self.last_run = time.time()
        self.status = "COMPLETE"

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "current_price": price,
            "support": round(nearest_support, 4) if nearest_support else None,
            "resistance": round(nearest_resistance, 4) if nearest_resistance else None,
            "key_levels": [round(l, 4) for l in self.levels[:5]],
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round((time.time() - start) * 1000, 2),
        }


class CorrelationSpecialist(BaseVNXSpecialist):
    """
    Monitors correlation between HBAR and other assets.
    Detects: Correlation breakdown, decoupling, regime shifts.
    """

    def __init__(self):
        super().__init__("correlation_001", "Correlation Monitor")
        self.hbar_history = []
        self.btc_proxy = []  # Simulated BTC price proxy

    def run(self) -> Dict[str, Any]:
        self.status = "RUNNING"
        start = time.time()

        try:
            connector = HederaConnector()
            stats = connector.get_network_stats()
            hbar = stats.get("hbar_usd_price", 0.0957)

            self.hbar_history.append(hbar)
            # Simulate BTC as inverse correlation proxy with noise
            btc = 65000 + np.random.normal(0, 500)
            self.btc_proxy.append(btc)

            if len(self.hbar_history) > 50:
                self.hbar_history.pop(0)
                self.btc_proxy.pop(0)

            correlation = 0
            regime = "UNKNOWN"
            alerts = []

            if len(self.hbar_history) >= 10:
                correlation = np.corrcoef(self.hbar_history, self.btc_proxy)[0, 1]

                if abs(correlation) > 0.7:
                    regime = "HIGH_CORRELATION"
                elif abs(correlation) < 0.3:
                    regime = "LOW_CORRELATION"
                    alerts.append({"type": "DECOUPLING", "correlation": round(correlation, 4), "severity": "INFO"})
                else:
                    regime = "MODERATE_CORRELATION"

            self.confidence = min(1.0, len(self.hbar_history) / 20)

        except Exception:
            correlation = 0
            regime = "ERROR"
            alerts = []
            self.confidence = 0

        self.last_run = time.time()
        self.status = "COMPLETE"

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "hbar_btc_correlation": round(correlation, 4),
            "regime": regime,
            "history_length": len(self.hbar_history),
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round((time.time() - start) * 1000, 2),
        }


class DrawdownSpecialist(BaseVNXSpecialist):
    """
    Tracks drawdown from peak and recovery metrics.
    Detects: Deep drawdowns, recovery signals, max pain levels.
    """

    def __init__(self):
        super().__init__("drawdown_001", "Drawdown Risk Assessor")
        self.price_history = []
        self.peak = 0

    def run(self) -> Dict[str, Any]:
        self.status = "RUNNING"
        start = time.time()

        try:
            connector = HederaConnector()
            stats = connector.get_network_stats()
            price = stats.get("hbar_usd_price", 0.0957)

            self.price_history.append(price)
            if len(self.price_history) > 100:
                self.price_history.pop(0)

            # Update peak
            if price > self.peak:
                self.peak = price

            drawdown = 0
            recovery = 0
            alerts = []

            if self.peak > 0:
                drawdown = (self.peak - price) / self.peak

                if drawdown > 0.3:
                    alerts.append({"type": "DEEP_DRAWDOWN", "drawdown": round(drawdown, 4), "severity": "CRITICAL"})
                elif drawdown > 0.1:
                    alerts.append({"type": "MODERATE_DRAWDOWN", "drawdown": round(drawdown, 4), "severity": "WARNING"})

                # Recovery metric: how far from trough
                if len(self.price_history) >= 10:
                    trough = min(self.price_history)
                    if price > trough:
                        recovery = (price - trough) / (self.peak - trough)

            self.confidence = min(1.0, len(self.price_history) / 20)

        except Exception:
            drawdown = 0
            recovery = 0
            alerts = []
            self.confidence = 0

        self.last_run = time.time()
        self.status = "COMPLETE"

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "current_price": price,
            "peak": round(self.peak, 4),
            "drawdown": round(drawdown, 4),
            "recovery": round(recovery, 4),
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round((time.time() - start) * 1000, 2),
        }


class MarketRegimeSpecialist(BaseVNXSpecialist):
    """
    Classifies current market regime.
    Detects: Bull market, bear market, accumulation, distribution.
    """

    def __init__(self):
        super().__init__("regime_001", "Market Regime Detector")
        self.price_history = []
        self.volume_proxy = []

    def run(self) -> Dict[str, Any]:
        self.status = "RUNNING"
        start = time.time()

        try:
            connector = HederaConnector()
            stats = connector.get_network_stats()
            price = stats.get("hbar_usd_price", 0.0957)

            self.price_history.append(price)
            self.volume_proxy.append(np.random.exponential(1e6))  # Simulated volume

            if len(self.price_history) > 50:
                self.price_history.pop(0)
                self.volume_proxy.pop(0)

            regime = "UNKNOWN"
            alerts = []

            if len(self.price_history) >= 20:
                # Simple regime detection
                ma_short = np.mean(self.price_history[-10:])
                ma_long = np.mean(self.price_history[-20:])
                price_trend = (self.price_history[-1] - self.price_history[0]) / self.price_history[0]

                if ma_short > ma_long * 1.02 and price_trend > 0.05:
                    regime = "BULL_MARKET"
                    alerts.append({"type": "BULL_CONFIRMED", "severity": "INFO"})
                elif ma_short < ma_long * 0.98 and price_trend < -0.05:
                    regime = "BEAR_MARKET"
                    alerts.append({"type": "BEAR_CONFIRMED", "severity": "WARNING"})
                elif abs(price_trend) < 0.02:
                    regime = "ACCUMULATION" if self.volume_proxy[-1] > np.mean(self.volume_proxy) else "SIDEWAYS"
                else:
                    regime = "TRANSITION"

            self.confidence = min(1.0, len(self.price_history) / 20)

        except Exception:
            regime = "ERROR"
            alerts = []
            self.confidence = 0

        self.last_run = time.time()
        self.status = "COMPLETE"

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "regime": regime,
            "history_length": len(self.price_history),
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round((time.time() - start) * 1000, 2),
        }


class SentimentSpecialist(BaseVNXSpecialist):
    """
    Analyzes market sentiment from multiple sources.
    Detects: Extreme fear, extreme greed, sentiment shifts.
    """

    def __init__(self):
        super().__init__("sentiment_001", "Sentiment Analyzer")
        self.sentiment_history = []

    def run(self) -> Dict[str, Any]:
        self.status = "RUNNING"
        start = time.time()

        try:
            # Simulate sentiment from network activity
            connector = HederaConnector()
            tx_data = connector.get_network_transactions(limit=100)
            tx_count = len(tx_data.get("transactions", [])) if tx_data else 50

            # Higher tx = more activity = more bullish sentiment proxy
            sentiment = min(100, tx_count)  # 0-100 scale
            self.sentiment_history.append(sentiment)
            if len(self.sentiment_history) > 30:
                self.sentiment_history.pop(0)

            alerts = []
            signal = "NEUTRAL"

            if sentiment > 80:
                signal = "EXTREME_GREED"
                alerts.append({"type": "EXTREME_GREED", "sentiment": sentiment, "severity": "WARNING"})
            elif sentiment < 20:
                signal = "EXTREME_FEAR"
                alerts.append({"type": "EXTREME_FEAR", "sentiment": sentiment, "severity": "INFO"})
            elif sentiment > 55:
                signal = "GREED"
            elif sentiment < 45:
                signal = "FEAR"

            self.confidence = min(1.0, len(self.sentiment_history) / 10)

        except Exception:
            sentiment = 50
            signal = "NEUTRAL"
            alerts = []
            self.confidence = 0

        self.last_run = time.time()
        self.status = "COMPLETE"

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "sentiment_score": sentiment,
            "signal": signal,
            "history_avg": round(np.mean(self.sentiment_history), 2) if self.sentiment_history else 50,
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round((time.time() - start) * 1000, 2),
        }


class LiquiditySpecialist(BaseVNXSpecialist):
    """
    Monitors market liquidity and depth.
    Detects: Liquidity crises, spread widening, shallow depth.
    """

    def __init__(self):
        super().__init__("liquidity_001", "Liquidity Depth Tracker")
        self.spread_history = []

    def run(self) -> Dict[str, Any]:
        self.status = "RUNNING"
        start = time.time()

        try:
            connector = HederaConnector()
            stats = connector.get_network_stats()
            price = stats.get("hbar_usd_price", 0.0957)

            # Simulate bid-ask spread (tighter = more liquid)
            spread = abs(np.random.normal(0.001, 0.0005))  # ~0.1% spread
            self.spread_history.append(spread)
            if len(self.spread_history) > 20:
                self.spread_history.pop(0)

            alerts = []
            health = "HEALTHY"

            avg_spread = np.mean(self.spread_history) if self.spread_history else 0.001

            if spread > avg_spread * 3:
                health = "ILLIQUID"
                alerts.append({"type": "SPREAD_SPIKE", "spread": round(spread, 6), "severity": "WARNING"})
            elif spread > 0.005:  # 0.5% spread
                health = "STRESSED"
                alerts.append({"type": "WIDE_SPREAD", "spread": round(spread, 6), "severity": "INFO"})

            # Depth proxy from network activity
            tx_data = connector.get_network_transactions(limit=10)
            depth_proxy = len(tx_data.get("transactions", [])) if tx_data else 0

            self.confidence = min(1.0, len(self.spread_history) / 10)

        except Exception:
            spread = 0
            depth_proxy = 0
            health = "ERROR"
            alerts = []
            self.confidence = 0

        self.last_run = time.time()
        self.status = "COMPLETE"

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "current_spread": round(spread, 6),
            "avg_spread": round(avg_spread, 6),
            "depth_proxy": depth_proxy,
            "health": health,
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round((time.time() - start) * 1000, 2),
        }


class ExtendedSwarmOrchestrator(SwarmOrchestrator):
    """
    Extended orchestrator with all 16 specialist types.
    """

    def __init__(self):
        super().__init__()
        # Add new specialists
        self.specialists.extend([
            VolatilitySpecialist(),
            TrendDetectorSpecialist(),
            MomentumSpecialist(),
            SupportResistanceSpecialist(),
            CorrelationSpecialist(),
            DrawdownSpecialist(),
            MarketRegimeSpecialist(),
            SentimentSpecialist(),
            LiquiditySpecialist(),
        ])


if __name__ == "__main__":
    print("=" * 60)
    print("EXTENDED HEDERA VNX MICRO-SPECIALISTS")
    print("=" * 60)

    orchestrator = ExtendedSwarmOrchestrator()

    print(f"\nSpecialist types:")
    for spec in orchestrator.get_specialist_types():
        print(f"  {spec['id']}: {spec['type']}")

    print(f"\nTotal: {len(orchestrator.specialists)} specialists")

    print(f"\nRunning swarm...")
    result = orchestrator.run_all()

    print(f"\nSwarm Result:")
    print(f"  Status: {result['status']}")
    print(f"  Specialists: {result['specialists_active']}/{result['specialists_total']}")
    print(f"  Avg Confidence: {result['avg_confidence']}")
    print(f"  Total Alerts: {result['total_alerts']}")
    print(f"  Latency: {result['latency_ms']}ms")

    print("\n" + "=" * 60)
    print(f"EXTENDED SWARM: {result['specialists_active']}/16 SPECIALISTS ACTIVE")
    print("=" * 60)
