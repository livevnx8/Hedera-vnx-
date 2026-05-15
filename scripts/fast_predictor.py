#!/usr/bin/env python3
"""
Vera OS — Fast 5-Minute HBAR Predictor with Real-Time Learning

Runs as a long-running background process:
  - Fetches HBAR price every 60s (for chart data)
  - Makes predictions every 5 min (direction for next 5 min)
  - Scores predictions after 5 min against actual price
  - Tracks rolling accuracy with learning feedback

Usage: python3 scripts/fast_predictor.py &
"""

import json
import logging
import os
import sqlite3
import sys
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vera_os.paths import MODELS_DIR, LOGS_DIR, add_src_to_path

add_src_to_path()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOGS_DIR / "fast_predictor.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("fast_predictor")

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "fast_predictions.db"
CG_URL = "https://api.coingecko.com/api/v3/simple/price"
CG_ID = "hedera-hashgraph"

SCHEMA = """
CREATE TABLE IF NOT EXISTS price_ticks (
    timestamp   REAL PRIMARY KEY,
    price       REAL NOT NULL,
    volume_24h  REAL,
    change_24h  REAL
);

CREATE TABLE IF NOT EXISTS fast_predictions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       REAL NOT NULL,
    iso_time        TEXT NOT NULL,
    price_at_predict REAL NOT NULL,
    direction       TEXT NOT NULL,
    confidence      REAL NOT NULL,
    up_prob         REAL NOT NULL,
    inference_ms    REAL NOT NULL DEFAULT 0,
    pattern         TEXT,
    pattern_confidence REAL,
    -- Scored after 5 min
    actual_price    REAL,
    price_change_pct REAL,
    correct         INTEGER,
    scored_at       REAL
);
CREATE INDEX IF NOT EXISTS idx_fp_ts ON fast_predictions(timestamp);
CREATE INDEX IF NOT EXISTS idx_fp_scored ON fast_predictions(scored_at);

CREATE TABLE IF NOT EXISTS accuracy_log (
    timestamp       REAL PRIMARY KEY,
    rolling_10      REAL,
    rolling_50      REAL,
    total_correct   INTEGER,
    total_predictions INTEGER
);

CREATE TABLE IF NOT EXISTS agent_votes (
    prediction_id   INTEGER NOT NULL,
    agent_name      TEXT NOT NULL,
    score           REAL NOT NULL,
    vote_direction  TEXT NOT NULL,
    correct         INTEGER,
    PRIMARY KEY (prediction_id, agent_name)
);

CREATE TABLE IF NOT EXISTS agent_weights (
    agent_name      TEXT PRIMARY KEY,
    weight          REAL NOT NULL DEFAULT 1.0,
    total_votes     INTEGER NOT NULL DEFAULT 0,
    correct_votes   INTEGER NOT NULL DEFAULT 0,
    accuracy        REAL NOT NULL DEFAULT 0.5,
    last_updated    REAL
);
"""


def get_db() -> sqlite3.Connection:
    os.makedirs(DB_PATH.parent, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def fetch_price() -> Optional[Dict]:
    """Fetch HBAR price from CoinGecko."""
    try:
        resp = requests.get(
            CG_URL,
            params={
                "ids": CG_ID,
                "vs_currencies": "usd",
                "include_24hr_change": "true",
                "include_24hr_vol": "true",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json().get(CG_ID, {})
        return {
            "price": data.get("usd", 0),
            "volume_24h": data.get("usd_24h_vol", 0),
            "change_24h": data.get("usd_24h_change", 0),
        }
    except Exception as e:
        logger.warning(f"Price fetch failed: {e}")
        return None


class FastPredictor:
    """5-minute prediction engine with learning feedback."""

    # Default starting weights for each agent
    DEFAULT_WEIGHTS = {
        "onnx": 1.0,
        "rsi_revert": 1.5,
        "momentum": 1.2,
        "bb_bounce": 1.3,
        "sma_cross": 1.0,
        "vol_price": 0.8,
        "pattern_recog": 1.4,
    }

    def __init__(self):
        self.db = get_db()
        self._init_model()
        self.price_history = []
        self.volume_history = []
        self.agent_weights = dict(self.DEFAULT_WEIGHTS)
        self._load_recent_prices()
        self._load_agent_weights()

    def _init_model(self):
        """Load ONNX model for fast inference."""
        from src.prediction.onnx_inference import ONNXPredictionEngine
        self.onnx_engine = ONNXPredictionEngine()
        logger.info(f"ONNX models loaded: {self.onnx_engine.available_tokens()}")

    def _load_recent_prices(self):
        """Load last 200 price ticks from DB for feature computation."""
        rows = self.db.execute(
            "SELECT price, volume_24h FROM price_ticks ORDER BY timestamp DESC LIMIT 200"
        ).fetchall()
        if rows:
            self.price_history = [r["price"] for r in reversed(rows)]
            self.volume_history = [r["volume_24h"] or 50000000 for r in reversed(rows)]
            logger.info(f"Loaded {len(self.price_history)} historical prices")

    def _load_agent_weights(self):
        """Load learned agent weights from DB."""
        rows = self.db.execute(
            "SELECT agent_name, weight, accuracy FROM agent_weights WHERE total_votes >= 5"
        ).fetchall()
        for row in rows:
            if row["agent_name"] in self.agent_weights:
                self.agent_weights[row["agent_name"]] = row["weight"]
        if rows:
            logger.info(f"Loaded adaptive weights: {dict((r['agent_name'], round(r['weight'], 2)) for r in rows)}")

    def _save_agent_votes(self, prediction_id: int, votes):
        """Store individual agent votes for later scoring."""
        for name, score, weight in votes:
            direction = "UP" if score > 0 else "DOWN"
            self.db.execute(
                "INSERT OR REPLACE INTO agent_votes (prediction_id, agent_name, score, vote_direction) VALUES (?,?,?,?)",
                (prediction_id, name, float(score), direction),
            )
        self.db.commit()

    def _update_agent_weights(self, prediction_id: int, actual_up: bool):
        """Score each agent's vote and update adaptive weights."""
        rows = self.db.execute(
            "SELECT agent_name, vote_direction FROM agent_votes WHERE prediction_id = ? AND correct IS NULL",
            (prediction_id,),
        ).fetchall()
        
        for row in rows:
            agent_correct = int((row["vote_direction"] == "UP") == actual_up)
            self.db.execute(
                "UPDATE agent_votes SET correct = ? WHERE prediction_id = ? AND agent_name = ?",
                (agent_correct, prediction_id, row["agent_name"]),
            )
            
            # Update cumulative agent stats
            self.db.execute("""
                INSERT INTO agent_weights (agent_name, weight, total_votes, correct_votes, accuracy, last_updated)
                VALUES (?, ?, 1, ?, ?, ?)
                ON CONFLICT(agent_name) DO UPDATE SET
                    total_votes = total_votes + 1,
                    correct_votes = correct_votes + ?,
                    accuracy = CAST(correct_votes + ? AS REAL) / (total_votes + 1),
                    weight = CASE
                        WHEN (total_votes + 1) >= 5 THEN
                            0.5 + (CAST(correct_votes + ? AS REAL) / (total_votes + 1))
                        ELSE weight
                    END,
                    last_updated = ?
            """, (
                row["agent_name"], self.DEFAULT_WEIGHTS.get(row["agent_name"], 1.0),
                agent_correct, agent_correct / 1.0, time.time(),
                agent_correct, agent_correct, agent_correct, time.time(),
            ))
        
        self.db.commit()
        
        # Reload weights into memory
        if rows:
            self._load_agent_weights()

    def log_price(self, price_data: Dict):
        """Store price tick."""
        self.db.execute(
            "INSERT OR REPLACE INTO price_ticks (timestamp, price, volume_24h, change_24h) VALUES (?, ?, ?, ?)",
            (time.time(), price_data["price"], price_data.get("volume_24h"), price_data.get("change_24h")),
        )
        self.db.commit()
        self.price_history.append(price_data["price"])
        self.volume_history.append(price_data.get("volume_24h", 50000000))
        # Keep last 500
        if len(self.price_history) > 500:
            self.price_history = self.price_history[-500:]
            self.volume_history = self.volume_history[-500:]

    def compute_features(self) -> Optional[Dict[str, float]]:
        """Compute features from price history."""
        prices = self.price_history
        volumes = self.volume_history
        n = len(prices)

        if n < 20:
            return None

        features = {}

        # Price changes (scaled for 5-min intervals)
        features["price_change_1h"] = np.tanh((prices[-1] - prices[-2]) / max(prices[-2], 1e-8) * 100) if n >= 2 else 0
        features["price_change_4h"] = np.tanh((prices[-1] - prices[-min(5, n)]) / max(prices[-min(5, n)], 1e-8) * 50) if n >= 5 else 0
        features["price_change_24h"] = np.tanh((prices[-1] - prices[-min(20, n)]) / max(prices[-min(20, n)], 1e-8) * 20) if n >= 20 else 0

        # Moving averages
        sma7 = np.mean(prices[-min(7, n):])
        sma20 = np.mean(prices[-min(20, n):])
        sma50 = np.mean(prices[-min(50, n):]) if n >= 50 else sma20

        features["price_vs_sma7"] = prices[-1] / max(sma7, 1e-8)
        features["price_vs_sma20"] = prices[-1] / max(sma20, 1e-8)
        features["price_vs_sma50"] = prices[-1] / max(sma50, 1e-8)

        # RSI (14 periods)
        if n >= 15:
            deltas = np.diff(prices[-15:])
            gains = deltas[deltas > 0]
            losses = -deltas[deltas < 0]
            avg_gain = np.mean(gains) if len(gains) > 0 else 0
            avg_loss = np.mean(losses) if len(losses) > 0 else 0
            rsi = 100.0 if avg_loss == 0 else 100 - (100 / (1 + avg_gain / max(avg_loss, 1e-10)))
            features["rsi_14"] = rsi / 100.0
        else:
            features["rsi_14"] = 0.5

        # Bollinger Bands
        if n >= 20:
            window = prices[-20:]
            bb_mean = np.mean(window)
            bb_std = np.std(window)
            bb_upper = bb_mean + 2 * bb_std
            bb_lower = bb_mean - 2 * bb_std
            bb_b = (prices[-1] - bb_lower) / max(bb_upper - bb_lower, 1e-10)
            features["bb_percent_b"] = max(0, min(1, bb_b))
        else:
            features["bb_percent_b"] = 0.5

        # Volatility
        if n >= 14:
            ranges = [abs(prices[j] - prices[j-1]) / max(prices[j-1], 1e-8) for j in range(-min(14, n), 0)]
            features["volatility_14h"] = min(1, np.mean(ranges) * 10)
        else:
            features["volatility_14h"] = 0.05

        # Volume
        vol = volumes[-1] if volumes else 50000000
        vol_sma = np.mean(volumes[-min(24, len(volumes)):]) if volumes else vol
        features["volume_proxy"] = min(1, vol / 100000000)
        features["volume_sma_24"] = min(1, vol_sma / 100000000)
        features["volume_change_1h"] = np.tanh((vol - volumes[-2]) / max(volumes[-2], 1)) if len(volumes) > 1 else 0

        # Ranges
        features["high_low_range"] = abs(prices[-1] - prices[-2]) / max(prices[-1], 1e-8) if n >= 2 else 0
        features["body_size"] = abs(prices[-1] - prices[-2]) / max(prices[-1], 1e-8) if n >= 2 else 0

        return features

    def _find_peaks_troughs(self, arr: np.ndarray, window: int = 3):
        """Find local maxima (peaks) and minima (troughs) indices."""
        peaks, troughs = [], []
        for i in range(window, len(arr) - window):
            local = arr[i - window:i + window + 1]
            if arr[i] == np.max(local):
                peaks.append(i)
            elif arr[i] == np.min(local):
                troughs.append(i)
        return np.array(peaks), np.array(troughs)

    def detect_patterns(self, prices: list) -> Dict[str, Any]:
        """
        Detect common chart patterns from recent price history.
        Returns: {pattern_name, direction_score, confidence, details}
        """
        if len(prices) < 20:
            return {"pattern": "none", "score": 0.0, "confidence": 0.0}

        arr = np.array(prices)
        peaks, troughs = self._find_peaks_troughs(arr, window=2)
        n = len(arr)

        best = {"pattern": "none", "score": 0.0, "confidence": 0.0}

        # ── Double Top ──
        if len(peaks) >= 2:
            for i in range(len(peaks) - 1):
                p1, p2 = peaks[i], peaks[i + 1]
                if p2 - p1 < 5 or p2 - p1 > 25:
                    continue
                top1, top2 = arr[p1], arr[p2]
                # Tops within 1% of each other
                if abs(top1 - top2) / max(top1, 1e-8) < 0.01:
                    trough = np.min(arr[p1:p2])
                    neckline = trough * 0.998
                    if arr[-1] < neckline:
                        conf = min(1.0, (neckline - arr[-1]) / neckline * 200)
                        best = {"pattern": "double_top", "score": -0.5, "confidence": round(conf, 3)}
                        break

        # ── Double Bottom ──
        if best["pattern"] == "none" and len(troughs) >= 2:
            for i in range(len(troughs) - 1):
                t1, t2 = troughs[i], troughs[i + 1]
                if t2 - t1 < 5 or t2 - t1 > 25:
                    continue
                bot1, bot2 = arr[t1], arr[t2]
                if abs(bot1 - bot2) / max(bot1, 1e-8) < 0.01:
                    peak = np.max(arr[t1:t2])
                    neckline = peak * 1.002
                    if arr[-1] > neckline:
                        conf = min(1.0, (arr[-1] - neckline) / neckline * 200)
                        best = {"pattern": "double_bottom", "score": 0.5, "confidence": round(conf, 3)}
                        break

        # ── Ascending Triangle (bullish) ──
        if best["pattern"] == "none" and len(peaks) >= 3 and len(troughs) >= 2:
            recent_peaks = arr[peaks[-3:]]
            recent_troughs = arr[troughs[-2:]]
            flat_top = np.std(recent_peaks) / np.mean(recent_peaks) < 0.005
            rising_bottom = recent_troughs[-1] > recent_troughs[0] * 1.003
            if flat_top and rising_bottom:
                conf = min(1.0, (recent_troughs[-1] - recent_troughs[0]) / recent_troughs[0] * 100)
                best = {"pattern": "asc_triangle", "score": 0.4, "confidence": round(conf, 3)}

        # ── Descending Triangle (bearish) ──
        if best["pattern"] == "none" and len(peaks) >= 2 and len(troughs) >= 3:
            recent_peaks = arr[peaks[-2:]]
            recent_troughs = arr[troughs[-3:]]
            flat_bottom = np.std(recent_troughs) / np.mean(recent_troughs) < 0.005
            falling_top = recent_peaks[-1] < recent_peaks[0] * 0.997
            if flat_bottom and falling_top:
                conf = min(1.0, (recent_peaks[0] - recent_peaks[-1]) / recent_peaks[0] * 100)
                best = {"pattern": "desc_triangle", "score": -0.4, "confidence": round(conf, 3)}

        # ── Bull Flag (continuation after strong up move) ──
        if best["pattern"] == "none" and n >= 15:
            pre = arr[-15:-5]
            flag = arr[-5:]
            pre_move = (pre[-1] - pre[0]) / max(pre[0], 1e-8)
            flag_drift = (flag[-1] - flag[0]) / max(flag[0], 1e-8)
            if pre_move > 0.005 and -0.002 < flag_drift < 0.001:
                best = {"pattern": "bull_flag", "score": 0.35, "confidence": round(min(1.0, pre_move * 50), 3)}

        # ── Bear Flag (continuation after strong down move) ──
        if best["pattern"] == "none" and n >= 15:
            pre = arr[-15:-5]
            flag = arr[-5:]
            pre_move = (pre[-1] - pre[0]) / max(pre[0], 1e-8)
            flag_drift = (flag[-1] - flag[0]) / max(flag[0], 1e-8)
            if pre_move < -0.005 and -0.001 < flag_drift < 0.002:
                best = {"pattern": "bear_flag", "score": -0.35, "confidence": round(min(1.0, abs(pre_move) * 50), 3)}

        # ── Rising Wedge (bearish reversal) ──
        if best["pattern"] == "none" and len(peaks) >= 2 and len(troughs) >= 2:
            recent_peaks = arr[peaks[-2:]]
            recent_troughs = arr[troughs[-2:]]
            tops_rising = recent_peaks[-1] > recent_peaks[0]
            bottoms_rising = recent_troughs[-1] > recent_troughs[0]
            wedge_tight = abs((recent_peaks[-1] - recent_peaks[0]) - (recent_troughs[-1] - recent_troughs[0])) / max(recent_peaks[0], 1e-8) < 0.01
            if tops_rising and bottoms_rising and wedge_tight:
                best = {"pattern": "rising_wedge", "score": -0.3, "confidence": 0.5}

        # ── Falling Wedge (bullish reversal) ──
        if best["pattern"] == "none" and len(peaks) >= 2 and len(troughs) >= 2:
            recent_peaks = arr[peaks[-2:]]
            recent_troughs = arr[troughs[-2:]]
            tops_falling = recent_peaks[-1] < recent_peaks[0]
            bottoms_falling = recent_troughs[-1] < recent_troughs[0]
            wedge_tight = abs((recent_peaks[0] - recent_peaks[-1]) - (recent_troughs[0] - recent_troughs[-1])) / max(recent_peaks[0], 1e-8) < 0.01
            if tops_falling and bottoms_falling and wedge_tight:
                best = {"pattern": "falling_wedge", "score": 0.3, "confidence": 0.5}

        # ── Support Breakout ( bullish ) ──
        if best["pattern"] == "none" and n >= 10:
            sma10 = np.mean(arr[-10:])
            if arr[-1] > sma10 * 1.003 and arr[-2] <= sma10 * 1.003:
                best = {"pattern": "support_bounce", "score": 0.25, "confidence": 0.4}

        # ── Resistance Breakdown ( bearish ) ──
        if best["pattern"] == "none" and n >= 10:
            sma10 = np.mean(arr[-10:])
            if arr[-1] < sma10 * 0.997 and arr[-2] >= sma10 * 0.997:
                best = {"pattern": "resist_break", "score": -0.25, "confidence": 0.4}

        return best

    def predict(self) -> Optional[Dict]:
        """
        Multi-agent swarm prediction for next 5-min direction.
        
        Agents:
          1. ONNX BitLattice (dampened) - neural network signal
          2. RSI Mean-Reversion - oversold/overbought reversal
          3. Momentum Agent - short-term price velocity
          4. Bollinger Bounce - band-edge reversals
          5. SMA Crossover - trend alignment
          6. Volume-Price Divergence - smart money detection
          7. Chart Pattern Recognition - double tops, triangles, flags, wedges
        
        Each agent votes UP (+1) or DOWN (-1) with a weight.
        Consensus = weighted sum -> direction + confidence.
        """
        prices = self.price_history
        volumes = self.volume_history
        n = len(prices)
        if n < 30:
            return None

        t0 = time.time()
        votes = []  # (agent_name, direction_score, weight)
        W = self.agent_weights  # adaptive weights

        # ── Agent 1: ONNX BitLattice (dampened) ──
        features = self.compute_features()
        if features:
            onnx_result = self.onnx_engine.predict("hbar", features)
            if "error" not in onnx_result:
                raw_up = onnx_result["up_probability"]
                onnx_score = (raw_up - 0.5) * 0.6
                votes.append(("onnx", onnx_score, W.get("onnx", 1.0)))

        # ── Agent 2: RSI Mean-Reversion ──
        # At 5-min scale, mean-reversion dominates
        if n >= 15:
            deltas = np.diff(prices[-15:])
            gains = deltas[deltas > 0]
            losses = -deltas[deltas < 0]
            avg_gain = np.mean(gains) if len(gains) > 0 else 1e-10
            avg_loss = np.mean(losses) if len(losses) > 0 else 1e-10
            rsi = 100 - (100 / (1 + avg_gain / max(avg_loss, 1e-10)))
            
            # Mean-reversion: oversold -> UP, overbought -> DOWN
            if rsi < 30:
                rsi_score = 0.6  # strongly oversold -> UP
            elif rsi < 40:
                rsi_score = 0.3
            elif rsi > 70:
                rsi_score = -0.6  # strongly overbought -> DOWN
            elif rsi > 60:
                rsi_score = -0.3
            else:
                rsi_score = 0.0  # neutral
            votes.append(("rsi_revert", rsi_score, W.get("rsi_revert", 1.5)))

        # ── Agent 3: Short Momentum (3-tick) ──
        if n >= 4:
            mom3 = (prices[-1] - prices[-4]) / max(prices[-4], 1e-8)
            # Momentum: trend continuation if strong, otherwise fade
            if abs(mom3) > 0.001:  # >0.1% in 3 ticks = strong momentum
                mom_score = np.clip(mom3 * 200, -0.5, 0.5)  # follow it
            else:
                # Weak momentum → mean-revert
                mom_score = -np.clip(mom3 * 500, -0.3, 0.3)
            votes.append(("momentum", mom_score, W.get("momentum", 1.2)))

        # ── Agent 4: Bollinger Bounce ──
        if n >= 20:
            window = prices[-20:]
            bb_mean = np.mean(window)
            bb_std = np.std(window)
            if bb_std > 0:
                z_score = (prices[-1] - bb_mean) / bb_std
                # Near upper band -> DOWN, near lower band -> UP
                if z_score > 1.5:
                    bb_score = -0.5
                elif z_score > 1.0:
                    bb_score = -0.25
                elif z_score < -1.5:
                    bb_score = 0.5
                elif z_score < -1.0:
                    bb_score = 0.25
                else:
                    bb_score = 0.0
            else:
                bb_score = 0.0
            votes.append(("bb_bounce", bb_score, W.get("bb_bounce", 1.3)))

        # ── Agent 5: SMA Micro-Crossover ──
        if n >= 10:
            sma5 = np.mean(prices[-5:])
            sma10 = np.mean(prices[-10:])
            cross = (sma5 - sma10) / max(sma10, 1e-8)
            # Positive cross = bullish trend
            sma_score = np.clip(cross * 1000, -0.4, 0.4)
            votes.append(("sma_cross", sma_score, W.get("sma_cross", 1.0)))

        # ── Agent 6: Volume-Price Divergence ──
        if n >= 5 and len(volumes) >= 5:
            price_chg = (prices[-1] - prices[-5]) / max(prices[-5], 1e-8)
            vol_now = np.mean(volumes[-3:])
            vol_prev = np.mean(volumes[-6:-3]) if len(volumes) >= 6 else vol_now
            vol_chg = (vol_now - vol_prev) / max(vol_prev, 1)
            
            # Rising volume + falling price = capitulation (reversal UP)
            # Rising volume + rising price = continuation
            if vol_chg > 0.1 and price_chg < -0.0005:
                vol_score = 0.3  # capitulation → UP
            elif vol_chg > 0.1 and price_chg > 0.0005:
                vol_score = 0.2  # volume confirms → UP
            elif vol_chg < -0.1 and price_chg > 0.0005:
                vol_score = -0.2  # rising on low vol → fade
            else:
                vol_score = 0.0
            votes.append(("vol_price", vol_score, W.get("vol_price", 0.8)))

        # ── Agent 7: Chart Pattern Recognition ──
        pattern = self.detect_patterns(prices)
        if pattern["pattern"] != "none":
            pat_score = pattern["score"] * pattern["confidence"]  # scale by pattern confidence
            votes.append(("pattern_recog", pat_score, W.get("pattern_recog", 1.4)))

        # ── Swarm Consensus ──
        if not votes:
            return None

        total_weight = sum(w for _, _, w in votes)
        weighted_sum = sum(score * weight for _, score, weight in votes)
        consensus = weighted_sum / total_weight  # -1 to +1

        direction = "UP" if consensus > 0 else "DOWN"
        # Confidence = how strongly agents agree (0 to 1)
        confidence = min(1.0, abs(consensus) * 2)
        # Don't be overconfident with low agreement
        agreeing = sum(1 for _, s, _ in votes if (s > 0) == (consensus > 0) and abs(s) > 0.05)
        agreement_ratio = agreeing / len(votes)
        confidence = confidence * (0.5 + 0.5 * agreement_ratio)

        up_prob = 0.5 + consensus / 2

        elapsed_ms = (time.time() - t0) * 1000

        agent_details = {name: round(score, 3) for name, score, _ in votes}
        logger.info(f"  Agents: {agent_details} => consensus={consensus:.3f}")

        result = {
            "token": "HBAR",
            "direction": direction,
            "up_probability": round(max(0, min(1, up_prob)), 4),
            "down_probability": round(max(0, min(1, 1 - up_prob)), 4),
            "confidence": round(confidence, 4),
            "market_odds": round(up_prob / max(1 - up_prob, 1e-8), 2),
            "inference_time_ms": round(elapsed_ms, 3),
            "inference_engine": "swarm",
            "agents": agent_details,
            "agreement": f"{agreeing}/{len(votes)}",
            "_votes": votes,  # internal: for saving per-agent data
        }

        # Include pattern info if detected
        if pattern["pattern"] != "none":
            result["pattern"] = pattern["pattern"]
            result["pattern_confidence"] = pattern["confidence"]
            logger.info(f"  Pattern detected: {pattern['pattern']} (conf={pattern['confidence']:.2f})")

        return result

    def score_predictions(self, current_price: float):
        """Score predictions that are >= 5 min old."""
        now = time.time()
        rows = self.db.execute(
            "SELECT id, timestamp, price_at_predict, direction FROM fast_predictions "
            "WHERE correct IS NULL AND timestamp < ?",
            (now - 4.5 * 60,),  # Score after 4.5 min
        ).fetchall()

        scored = 0
        for row in rows:
            predicted_up = row["direction"] == "UP"
            actually_up = current_price > row["price_at_predict"]
            correct = int(predicted_up == actually_up)
            change_pct = ((current_price - row["price_at_predict"]) / row["price_at_predict"]) * 100

            self.db.execute(
                "UPDATE fast_predictions SET actual_price = ?, price_change_pct = ?, correct = ?, scored_at = ? WHERE id = ?",
                (current_price, change_pct, correct, now, row["id"]),
            )
            # Score individual agents and update adaptive weights
            self._update_agent_weights(row["id"], actually_up)
            
            scored += 1
            sym = "+" if correct else "-"
            logger.info(f"  [{sym}] pred={row['direction']} actual={'UP' if actually_up else 'DOWN'} "
                        f"({change_pct:+.4f}%) price={current_price:.6f}")

        if scored > 0:
            self.db.commit()
            self._log_accuracy()
        return scored

    def _log_accuracy(self):
        """Log rolling accuracy."""
        now = time.time()
        r10 = self.db.execute(
            "SELECT correct FROM fast_predictions WHERE correct IS NOT NULL ORDER BY timestamp DESC LIMIT 10"
        ).fetchall()
        r50 = self.db.execute(
            "SELECT correct FROM fast_predictions WHERE correct IS NOT NULL ORDER BY timestamp DESC LIMIT 50"
        ).fetchall()
        total = self.db.execute("SELECT COUNT(*) FROM fast_predictions WHERE correct IS NOT NULL").fetchone()[0]
        correct = self.db.execute("SELECT COUNT(*) FROM fast_predictions WHERE correct = 1").fetchone()[0]

        roll_10 = sum(r[0] for r in r10) / max(len(r10), 1)
        roll_50 = sum(r[0] for r in r50) / max(len(r50), 1)

        self.db.execute(
            "INSERT OR REPLACE INTO accuracy_log (timestamp, rolling_10, rolling_50, total_correct, total_predictions) VALUES (?,?,?,?,?)",
            (now, roll_10, roll_50, correct, total),
        )
        self.db.commit()
        logger.info(f"  Accuracy: last10={roll_10:.0%} last50={roll_50:.0%} overall={correct}/{total}")


def run_loop():
    """Main event loop."""
    predictor = FastPredictor()
    last_predict_time = 0
    tick_count = 0

    logger.info("=" * 60)
    logger.info("Vera OS Fast Predictor started (5-min cycle)")
    logger.info("=" * 60)

    while True:
        try:
            # Fetch price every 60s
            price_data = fetch_price()
            if price_data and price_data["price"] > 0:
                predictor.log_price(price_data)
                tick_count += 1
                current_price = price_data["price"]

                # Score pending predictions
                predictor.score_predictions(current_price)

                # Predict every 5 min
                now = time.time()
                if now - last_predict_time >= 300:  # 5 min
                    result = predictor.predict()
                    if result:
                        iso = datetime.now(timezone.utc).isoformat()
                        predictor.db.execute(
                            """INSERT INTO fast_predictions
                               (timestamp, iso_time, price_at_predict, direction, confidence, up_prob, inference_ms, pattern, pattern_confidence)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (now, iso, current_price,
                             result["direction"], result["confidence"],
                             result["up_probability"], result.get("inference_time_ms", 0),
                             result.get("pattern"), result.get("pattern_confidence")),
                        )
                        predictor.db.commit()
                        # Save per-agent votes for adaptive learning
                        pred_id = predictor.db.execute("SELECT last_insert_rowid()").fetchone()[0]
                        if result.get("_votes"):
                            predictor._save_agent_votes(pred_id, result["_votes"])
                        last_predict_time = now
                        pat_str = f" | pattern={result['pattern']}" if result.get('pattern') else ""
                        logger.info(f"PREDICT: {result['direction']} (conf={result['confidence']:.1%}) "
                                    f"price=${current_price:.6f} [{result.get('inference_time_ms', 0):.2f}ms] "
                                    f"agree={result.get('agreement', '?')}{pat_str}")
                    else:
                        logger.warning("Prediction skipped (insufficient data)")
                        last_predict_time = now

                if tick_count % 5 == 0:
                    logger.info(f"Tick #{tick_count}: HBAR=${current_price:.6f} | "
                                f"history={len(predictor.price_history)} pts")
            else:
                logger.warning("No price data received")

        except Exception as e:
            logger.error(f"Loop error: {e}", exc_info=True)

        time.sleep(60)  # Sleep 60s between ticks


if __name__ == "__main__":
    run_loop()
