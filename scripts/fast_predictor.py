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

    def __init__(self):
        self.db = get_db()
        self._init_model()
        self.price_history = []
        self.volume_history = []
        self._load_recent_prices()

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

    def predict(self) -> Optional[Dict]:
        """Run prediction for next 5-min direction."""
        features = self.compute_features()
        if features is None:
            return None

        result = self.onnx_engine.predict("hbar", features)
        if "error" in result:
            logger.error(f"Prediction error: {result['error']}")
            return None
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
                               (timestamp, iso_time, price_at_predict, direction, confidence, up_prob, inference_ms)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (now, iso, current_price,
                             result["direction"], result["confidence"],
                             result["up_probability"], result.get("inference_time_ms", 0)),
                        )
                        predictor.db.commit()
                        last_predict_time = now
                        logger.info(f"PREDICT: {result['direction']} (conf={result['confidence']:.1%}) "
                                    f"price=${current_price:.6f} [{result.get('inference_time_ms', 0):.2f}ms]")
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
