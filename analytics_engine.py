#!/usr/bin/env python3
"""
Analytics Engine for Hedera Prediction Market.
Provides market-wide and per-token deep analytics.
"""

import json
import math
from collections import deque
from pathlib import Path
from typing import Dict, Any, List, Tuple

import numpy as np

from vnx.paths import TOKEN_DATA_DIR


class AnalyticsEngine:
    """
    Computes real-time analytics for prediction market tokens.

    Two specialist types:
    1. Market-wide: correlations, volatility regimes, sentiment
    2. Per-token: trend strength, divergence, volume anomalies
    """

    def __init__(self, token_dir: str | Path = TOKEN_DATA_DIR):
        self.token_dir = Path(token_dir)
        self.price_histories = {}
        self._load_histories()

    def _load_histories(self):
        """Load price histories from corpus files."""
        for corpus_file in self.token_dir.glob("*_corpus.json"):
            token = corpus_file.stem.replace("_corpus", "")
            corpus = json.loads(corpus_file.read_text())

            # Extract price and features
            prices = []
            features = []
            for sample in corpus:
                if "price" in sample:
                    prices.append(sample["price"])
                elif "features" in sample and "price" in sample["features"]:
                    prices.append(sample["features"]["price"])
                features.append(sample.get("features", {}))

            if prices:
                self.price_histories[token] = {
                    "prices": prices,
                    "features": features,
                }

    # ============================================================
    # MARKET-WIDE ANALYTICS
    # ============================================================

    def get_correlation_matrix(self) -> Dict[str, Dict[str, float]]:
        """Compute pairwise price correlations between all tokens."""
        tokens = list(self.price_histories.keys())
        if len(tokens) < 2:
            return {}

        # Find common length
        min_len = min(len(self.price_histories[t]["prices"]) for t in tokens)

        matrix = {}
        for i, t1 in enumerate(tokens):
            matrix[t1] = {}
            for j, t2 in enumerate(tokens):
                if i == j:
                    matrix[t1][t2] = 1.0
                elif j > i:
                    p1 = self.price_histories[t1]["prices"][-min_len:]
                    p2 = self.price_histories[t2]["prices"][-min_len:]

                    # Pearson correlation
                    if len(p1) > 1 and np.std(p1) > 0 and np.std(p2) > 0:
                        corr = np.corrcoef(p1, p2)[0, 1]
                        matrix[t1][t2] = float(corr) if not np.isnan(corr) else 0.0
                    else:
                        matrix[t1][t2] = 0.0
                else:
                    matrix[t1][t2] = matrix[t2][t1]

        return matrix

    def get_market_volatility(self) -> Dict[str, Any]:
        """Compute aggregate market volatility and regime."""
        tokens = list(self.price_histories.keys())
        if not tokens:
            return {}

        volatilities = []
        for token, data in self.price_histories.items():
            prices = data["prices"]
            if len(prices) >= 14:
                # Compute 14-period realized volatility
                log_returns = [math.log(prices[i] / prices[i-1])
                              for i in range(1, len(prices)) if prices[i-1] > 0]
                if len(log_returns) >= 14:
                    vol = np.std(log_returns[-14:]) * math.sqrt(365 * 24) * 100  # Annualized %
                    volatilities.append(vol)

        if not volatilities:
            return {}

        avg_vol = np.mean(volatilities)
        max_vol = np.max(volatilities)

        # Classify regime
        if avg_vol < 30:
            regime = "LOW"
        elif avg_vol < 60:
            regime = "MEDIUM"
        else:
            regime = "HIGH"

        return {
            "average_volatility_annualized": round(float(avg_vol), 2),
            "max_volatility": round(float(max_vol), 2),
            "regime": regime,
            "tokens_analyzed": len(volatilities),
        }

    def get_market_sentiment(self) -> Dict[str, Any]:
        """Aggregate bullish/bearish sentiment across all tokens."""
        tokens = list(self.price_histories.keys())
        if not tokens:
            return {}

        bullish = 0
        bearish = 0
        neutral = 0
        momentum_scores = []

        for token, data in self.price_histories.items():
            prices = data["prices"]
            if len(prices) < 7:
                continue

            # Simple momentum: compare last price to 7-period SMA
            sma7 = np.mean(prices[-7:])
            last_price = prices[-1]

            if last_price > sma7 * 1.01:
                bullish += 1
            elif last_price < sma7 * 0.99:
                bearish += 1
            else:
                neutral += 1

            # Momentum score: how far from SMA
            if sma7 > 0:
                momentum = (last_price - sma7) / sma7 * 100
                momentum_scores.append(momentum)

        total = bullish + bearish + neutral
        if total == 0:
            return {}

        avg_momentum = np.mean(momentum_scores) if momentum_scores else 0

        return {
            "bullish_tokens": bullish,
            "bearish_tokens": bearish,
            "neutral_tokens": neutral,
            "bullish_percentage": round(bullish / total * 100, 1),
            "bearish_percentage": round(bearish / total * 100, 1),
            "average_momentum_percent": round(float(avg_momentum), 2),
            "sentiment": "BULLISH" if bullish > bearish else "BEARISH" if bearish > bullish else "NEUTRAL",
        }

    def get_hot_cold_ranking(self) -> Dict[str, Any]:
        """Rank tokens by recent performance."""
        rankings = []

        for token, data in self.price_histories.items():
            prices = data["prices"]
            if len(prices) < 24:
                continue

            change_24h = (prices[-1] - prices[-25]) / prices[-25] * 100 if prices[-25] > 0 else 0
            volatility = np.std([abs(prices[i] - prices[i-1]) / prices[i-1]
                                for i in range(-14, 0) if prices[i-1] > 0]) * 100 if len(prices) >= 14 else 0

            # Composite score: trend + momentum
            rankings.append({
                "token": token.upper(),
                "change_24h_percent": round(float(change_24h), 2),
                "volatility_percent": round(float(volatility), 2),
                "score": round(float(change_24h - volatility * 0.1), 2),  # Higher change, lower vol = better
            })

        rankings.sort(key=lambda x: x["score"], reverse=True)

        return {
            "hot": rankings[:3] if len(rankings) >= 3 else rankings,
            "cold": rankings[-3:][::-1] if len(rankings) >= 3 else rankings[::-1],
            "all": rankings,
        }

    # ============================================================
    # PER-TOKEN ANALYTICS
    # ============================================================

    def get_token_analytics(self, token: str) -> Dict[str, Any]:
        """Deep analytics for a single token."""
        token = token.lower()
        if token not in self.price_histories:
            return {"error": f"Token '{token}' not found"}

        data = self.price_histories[token]
        prices = data["prices"]
        features = data["features"]

        if len(prices) < 20:
            return {"error": f"Insufficient data for {token}"}

        analytics = {
            "token": token.upper(),
            "current_price": round(prices[-1], 6),
        }

        # 1. Trend Strength (ADX-like)
        analytics["trend_strength"] = self._compute_trend_strength(prices)

        # 2. Support/Resistance
        analytics["support_resistance"] = self._compute_support_resistance(prices)

        # 3. RSI Divergence
        analytics["divergence"] = self._detect_divergence(prices, features)

        # 4. Volume Anomaly
        analytics["volume_anomaly"] = self._detect_volume_anomaly(features)

        # 5. Momentum Score
        analytics["momentum"] = self._compute_momentum_score(prices, features)

        # 6. Volatility Regime
        analytics["volatility_regime"] = self._get_volatility_regime(prices)

        return analytics

    def _compute_trend_strength(self, prices: List[float]) -> Dict[str, Any]:
        """Compute ADX-like trend strength (0-100)."""
        if len(prices) < 14:
            return {"score": 0, "direction": "NEUTRAL"}

        # Use +DM/-DM approximation
        plus_dm = 0
        minus_dm = 0
        tr_sum = 0

        for i in range(-14, 0):
            if i - 1 < -len(prices):
                continue
            high = prices[i]
            low = prices[i-1]
            prev_high = prices[i-1]
            prev_low = prices[i-2] if i-2 >= -len(prices) else prices[i-1]

            up_move = high - prev_high
            down_move = prev_low - low

            if up_move > down_move and up_move > 0:
                plus_dm += up_move
            elif down_move > up_move and down_move > 0:
                minus_dm += down_move

            tr = max(high - low, abs(high - prev_low), abs(low - prev_low))
            tr_sum += tr

        if tr_sum == 0:
            return {"score": 0, "direction": "NEUTRAL"}

        plus_di = (plus_dm / tr_sum) * 100
        minus_di = (minus_dm / tr_sum) * 100

        dx = abs(plus_di - minus_di) / (plus_di + minus_di) * 100 if (plus_di + minus_di) > 0 else 0
        adx = dx  # Simplified ADX

        direction = "UP" if plus_di > minus_di else "DOWN" if minus_di > plus_di else "NEUTRAL"

        return {
            "score": round(min(100, adx), 1),
            "direction": direction,
            "plus_di": round(plus_di, 2),
            "minus_di": round(minus_di, 2),
        }

    def _compute_support_resistance(self, prices: List[float]) -> Dict[str, Any]:
        """Find recent support and resistance levels."""
        if len(prices) < 20:
            return {}

        recent = prices[-20:]

        # Support = recent low, Resistance = recent high
        support = min(recent)
        resistance = max(recent)
        current = prices[-1]

        # Distance to levels
        dist_to_support = (current - support) / current * 100 if current > 0 else 0
        dist_to_resistance = (resistance - current) / current * 100 if current > 0 else 0

        return {
            "support": round(support, 6),
            "resistance": round(resistance, 6),
            "distance_to_support_percent": round(float(dist_to_support), 2),
            "distance_to_resistance_percent": round(float(dist_to_resistance), 2),
            "breakout_potential": "UP" if dist_to_resistance < dist_to_support else "DOWN",
        }

    def _detect_divergence(self, prices: List[float], features: List[Dict]) -> Dict[str, Any]:
        """Detect bullish/bearish RSI divergence."""
        if len(prices) < 14 or len(features) < 14:
            return {"detected": False}

        # Get RSI values from features
        rsi_values = []
        for f in features[-14:]:
            if isinstance(f, dict) and "rsi_14" in f:
                rsi_values.append(f["rsi_14"] * 100)  # Scale to 0-100

        if len(rsi_values) < 7:
            return {"detected": False}

        # Find last 5 local minima/maxima in price and RSI
        price_min_idx = np.argmin(prices[-7:])
        price_max_idx = np.argmax(prices[-7:])

        rsi_min_idx = np.argmin(rsi_values[-7:])
        rsi_max_idx = np.argmax(rsi_values[-7:])

        # Bullish divergence: price lower low, RSI higher low
        bullish = price_min_idx > 2 and rsi_min_idx < price_min_idx

        # Bearish divergence: price higher high, RSI lower high
        bearish = price_max_idx > 2 and rsi_max_idx < price_max_idx

        if bullish and not bearish:
            return {"detected": True, "type": "BULLISH", "confidence": "MEDIUM"}
        elif bearish and not bullish:
            return {"detected": True, "type": "BEARISH", "confidence": "MEDIUM"}

        return {"detected": False}

    def _detect_volume_anomaly(self, features: List[Dict]) -> Dict[str, Any]:
        """Detect unusual volume activity."""
        volumes = []
        for f in features:
            if isinstance(f, dict):
                if "volume_proxy" in f:
                    volumes.append(f["volume_proxy"])
                elif "volume" in f:
                    volumes.append(f["volume"])

        if len(volumes) < 7:
            return {"detected": False}

        current = volumes[-1]
        avg_7d = np.mean(volumes[-7:])

        if avg_7d == 0:
            return {"detected": False}

        ratio = current / avg_7d

        if ratio > 3:
            return {"detected": True, "severity": "EXTREME", "ratio": round(float(ratio), 2)}
        elif ratio > 2:
            return {"detected": True, "severity": "HIGH", "ratio": round(float(ratio), 2)}
        elif ratio > 1.5:
            return {"detected": True, "severity": "MEDIUM", "ratio": round(float(ratio), 2)}

        return {"detected": False}

    def _compute_momentum_score(self, prices: List[float], features: List[Dict]) -> Dict[str, Any]:
        """Composite momentum score from multiple indicators."""
        scores = {}

        # Price velocity (1h change)
        if len(prices) > 1 and prices[-2] > 0:
            velocity = (prices[-1] - prices[-2]) / prices[-2] * 100
            scores["velocity"] = round(float(velocity), 2)

        # RSI momentum
        if features and isinstance(features[-1], dict) and "rsi_14" in features[-1]:
            rsi = features[-1]["rsi_14"] * 100
            scores["rsi"] = round(float(rsi), 2)

        # SMA slope
        if len(prices) >= 7:
            sma7_now = np.mean(prices[-7:])
            sma7_prev = np.mean(prices[-8:-1]) if len(prices) >= 8 else sma7_now
            sma_slope = (sma7_now - sma7_prev) / sma7_prev * 100 if sma7_prev > 0 else 0
            scores["sma_slope"] = round(float(sma_slope), 2)

        # Composite score (-100 to +100)
        composite = 0
        if "velocity" in scores:
            composite += np.tanh(scores["velocity"]) * 30
        if "rsi" in scores:
            composite += (scores["rsi"] - 50) * 0.6
        if "sma_slope" in scores:
            composite += np.tanh(scores["sma_slope"]) * 20

        scores["composite"] = round(float(np.clip(composite, -100, 100)), 1)
        scores["interpretation"] = (
            "STRONG_UP" if composite > 50 else
            "UP" if composite > 20 else
            "NEUTRAL" if composite > -20 else
            "DOWN" if composite > -50 else
            "STRONG_DOWN"
        )

        return scores

    def _get_volatility_regime(self, prices: List[float]) -> Dict[str, Any]:
        """Classify volatility regime."""
        if len(prices) < 14:
            return {"regime": "UNKNOWN"}

        log_returns = [math.log(prices[i] / prices[i-1])
                      for i in range(1, len(prices)) if prices[i-1] > 0]

        if len(log_returns) < 14:
            return {"regime": "UNKNOWN"}

        vol = np.std(log_returns[-14:]) * math.sqrt(365 * 24) * 100

        return {
            "regime": "LOW" if vol < 30 else "MEDIUM" if vol < 60 else "HIGH",
            "annualized_percent": round(float(vol), 2),
        }
