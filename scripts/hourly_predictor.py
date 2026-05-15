#!/usr/bin/env python3
"""
VNX — Hourly HBAR Price Predictor & Accuracy Tracker

Runs every hour via cron. Uses VNX BitLattice model (PyTorch + ONNX) to:
  1. Fetch current HBAR price from CoinGecko
  2. Predict 1h and 24h direction (UP/DOWN) and confidence
  3. Score past predictions against actual outcomes
  4. Persist everything to SQLite for the dashboard

Usage: python3 scripts/hourly_predictor.py
"""

import json
import logging
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import requests

# Setup path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vnx.paths import MODELS_DIR, LOGS_DIR, add_src_to_path

add_src_to_path()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOGS_DIR / "hourly_predictor.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("hourly_predictor")

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "predictions.db"
CG_URL = "https://api.coingecko.com/api/v3/simple/price"
CG_ID = "hedera-hashgraph"

# ── Database ────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       REAL NOT NULL,
    iso_time        TEXT NOT NULL,
    token           TEXT NOT NULL DEFAULT 'hbar',
    price_at_predict REAL NOT NULL,
    direction_1h    TEXT NOT NULL,
    confidence_1h   REAL NOT NULL,
    up_prob_1h      REAL NOT NULL,
    direction_24h   TEXT NOT NULL,
    confidence_24h  REAL NOT NULL,
    up_prob_24h     REAL NOT NULL,
    inference_engine TEXT NOT NULL DEFAULT 'pytorch',
    inference_ms    REAL NOT NULL DEFAULT 0,
    -- Filled in later when we score
    actual_price_1h  REAL,
    actual_price_24h REAL,
    correct_1h      INTEGER,
    correct_24h     INTEGER,
    scored_at       REAL
);
CREATE INDEX IF NOT EXISTS idx_pred_ts ON predictions(timestamp);
CREATE INDEX IF NOT EXISTS idx_pred_scored ON predictions(scored_at);

CREATE TABLE IF NOT EXISTS price_log (
    timestamp       REAL PRIMARY KEY,
    price           REAL NOT NULL,
    volume_24h      REAL,
    change_24h      REAL
);
"""


def get_db() -> sqlite3.Connection:
    os.makedirs(DB_PATH.parent, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


# ── Price Fetching ──────────────────────────────────────────────

def fetch_hbar_price() -> Optional[Dict[str, float]]:
    """Fetch current HBAR price from CoinGecko."""
    for attempt in range(3):
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
            logger.warning(f"Price fetch attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)
    return None


def log_price(conn: sqlite3.Connection, price_data: Dict[str, float]):
    """Store price in the log for future accuracy scoring."""
    conn.execute(
        "INSERT OR REPLACE INTO price_log (timestamp, price, volume_24h, change_24h) VALUES (?, ?, ?, ?)",
        (time.time(), price_data["price"], price_data.get("volume_24h"), price_data.get("change_24h")),
    )
    conn.commit()


# ── Prediction ──────────────────────────────────────────────────

def run_prediction(price_data: Dict[str, float]) -> Dict[str, Any]:
    """
    Run both PyTorch and ONNX predictions.
    Returns the ONNX result (faster) with PyTorch as validation.
    """
    from prediction_server_production import ProductionPredictionEngine, FEATURE_KEYS

    engine = ProductionPredictionEngine()

    # Feed price into history and compute features
    features = engine.compute_features("hbar", price_data)
    if features is None:
        raise RuntimeError("Insufficient price history for feature computation")

    # PyTorch prediction (1h signal — the default model output)
    pytorch_result = engine.predict("hbar", features)

    # ONNX prediction
    from src.prediction.onnx_inference import ONNXPredictionEngine
    onnx_engine = ONNXPredictionEngine()
    onnx_result = onnx_engine.predict("hbar", features)

    # The model predicts direction. We use the same signal for both horizons
    # but adjust confidence based on horizon (24h predictions are less certain)
    onnx_up = onnx_result.get("up_probability", 0.5)
    onnx_conf = onnx_result.get("confidence", 0)

    # 24h prediction: same direction, reduced confidence (longer horizon = more uncertainty)
    conf_24h = onnx_conf * 0.7  # 30% confidence reduction for 24h

    return {
        "direction_1h": onnx_result.get("direction", "UP"),
        "confidence_1h": round(onnx_conf, 4),
        "up_prob_1h": round(onnx_up, 4),
        "direction_24h": onnx_result.get("direction", "UP"),
        "confidence_24h": round(conf_24h, 4),
        "up_prob_24h": round(onnx_up, 4),
        "inference_engine": "onnx",
        "inference_ms": onnx_result.get("inference_time_ms", 0),
        "pytorch_direction": pytorch_result.get("direction", "?"),
        "pytorch_confidence": pytorch_result.get("confidence", 0),
        "model_accuracy": pytorch_result.get("model_accuracy", 0),
    }


# ── Accuracy Scoring ────────────────────────────────────────────

def score_past_predictions(conn: sqlite3.Connection, current_price: float):
    """
    Score unscored predictions where enough time has passed.
    - 1h predictions: score if >= 55 minutes old
    - 24h predictions: score if >= 23.5 hours old
    """
    now = time.time()
    scored = 0

    # Score 1h predictions (at least 55 min old, not yet scored for 1h)
    rows = conn.execute(
        "SELECT id, timestamp, price_at_predict, direction_1h FROM predictions "
        "WHERE correct_1h IS NULL AND timestamp < ?",
        (now - 55 * 60,),
    ).fetchall()

    for row in rows:
        # Get actual price closest to 1h after prediction
        actual = conn.execute(
            "SELECT price FROM price_log WHERE timestamp >= ? ORDER BY timestamp ASC LIMIT 1",
            (row["timestamp"] + 55 * 60,),
        ).fetchone()

        if actual:
            actual_price = actual["price"]
            predicted_up = row["direction_1h"] == "UP"
            actually_up = actual_price > row["price_at_predict"]
            correct = int(predicted_up == actually_up)

            conn.execute(
                "UPDATE predictions SET actual_price_1h = ?, correct_1h = ?, scored_at = ? WHERE id = ?",
                (actual_price, correct, now, row["id"]),
            )
            scored += 1
            symbol = "✓" if correct else "✗"
            pct = ((actual_price - row["price_at_predict"]) / row["price_at_predict"]) * 100
            logger.info(
                f"  1h score {symbol}: predicted={row['direction_1h']}, "
                f"price {row['price_at_predict']:.6f}→{actual_price:.6f} ({pct:+.2f}%)"
            )

    # Score 24h predictions (at least 23.5h old, not yet scored for 24h)
    rows = conn.execute(
        "SELECT id, timestamp, price_at_predict, direction_24h FROM predictions "
        "WHERE correct_24h IS NULL AND timestamp < ?",
        (now - 23.5 * 3600,),
    ).fetchall()

    for row in rows:
        actual = conn.execute(
            "SELECT price FROM price_log WHERE timestamp >= ? ORDER BY timestamp ASC LIMIT 1",
            (row["timestamp"] + 23.5 * 3600,),
        ).fetchone()

        if actual:
            actual_price = actual["price"]
            predicted_up = row["direction_24h"] == "UP"
            actually_up = actual_price > row["price_at_predict"]
            correct = int(predicted_up == actually_up)

            conn.execute(
                "UPDATE predictions SET actual_price_24h = ?, correct_24h = ? WHERE id = ?",
                (actual_price, correct, row["id"]),
            )
            scored += 1

    conn.commit()
    return scored


def get_accuracy_stats(conn: sqlite3.Connection) -> Dict[str, Any]:
    """Compute accuracy statistics."""
    stats = {}

    for horizon in ["1h", "24h"]:
        col = f"correct_{horizon}"
        total = conn.execute(f"SELECT COUNT(*) FROM predictions WHERE {col} IS NOT NULL").fetchone()[0]
        correct = conn.execute(f"SELECT COUNT(*) FROM predictions WHERE {col} = 1").fetchone()[0]
        stats[f"{horizon}_total"] = total
        stats[f"{horizon}_correct"] = correct
        stats[f"{horizon}_accuracy"] = round(correct / max(total, 1), 4)

    stats["total_predictions"] = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
    stats["unscored"] = conn.execute(
        "SELECT COUNT(*) FROM predictions WHERE correct_1h IS NULL"
    ).fetchone()[0]

    # Recent streak (last 10 1h predictions)
    recent = conn.execute(
        "SELECT correct_1h FROM predictions WHERE correct_1h IS NOT NULL "
        "ORDER BY timestamp DESC LIMIT 10"
    ).fetchall()
    stats["recent_10_1h"] = [r[0] for r in recent]
    stats["recent_10_accuracy"] = round(sum(stats["recent_10_1h"]) / max(len(stats["recent_10_1h"]), 1), 4)

    return stats


# ── Main ────────────────────────────────────────────────────────

def main():
    logger.info("=" * 60)
    logger.info("VNX — Hourly HBAR Prediction Run")
    logger.info("=" * 60)

    conn = get_db()

    # 1. Fetch current price
    price_data = fetch_hbar_price()
    if not price_data or price_data["price"] <= 0:
        logger.error("Failed to fetch HBAR price — aborting")
        conn.close()
        return

    current_price = price_data["price"]
    logger.info(f"HBAR price: ${current_price:.6f}")

    # 2. Log price
    log_price(conn, price_data)

    # 3. Score past predictions
    logger.info("Scoring past predictions...")
    scored = score_past_predictions(conn, current_price)
    logger.info(f"Scored {scored} predictions")

    # 4. Run new prediction
    logger.info("Running VNX BitLattice prediction...")
    try:
        pred = run_prediction(price_data)
    except Exception as e:
        logger.error(f"Prediction failed: {e}")
        conn.close()
        return

    now = time.time()
    iso = datetime.now(timezone.utc).isoformat()

    conn.execute(
        """INSERT INTO predictions
           (timestamp, iso_time, token, price_at_predict,
            direction_1h, confidence_1h, up_prob_1h,
            direction_24h, confidence_24h, up_prob_24h,
            inference_engine, inference_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            now, iso, "hbar", current_price,
            pred["direction_1h"], pred["confidence_1h"], pred["up_prob_1h"],
            pred["direction_24h"], pred["confidence_24h"], pred["up_prob_24h"],
            pred["inference_engine"], pred["inference_ms"],
        ),
    )
    conn.commit()

    logger.info(f"  1h:  {pred['direction_1h']} (conf={pred['confidence_1h']:.1%})")
    logger.info(f"  24h: {pred['direction_24h']} (conf={pred['confidence_24h']:.1%})")
    logger.info(f"  Engine: {pred['inference_engine']} ({pred['inference_ms']:.2f}ms)")

    # 5. Print accuracy stats
    stats = get_accuracy_stats(conn)
    logger.info(f"Accuracy — 1h: {stats['1h_correct']}/{stats['1h_total']} ({stats['1h_accuracy']:.1%}) | "
                f"24h: {stats['24h_correct']}/{stats['24h_total']} ({stats['24h_accuracy']:.1%})")
    logger.info(f"Total predictions: {stats['total_predictions']} | Unscored: {stats['unscored']}")

    conn.close()
    logger.info("Done.\n")


if __name__ == "__main__":
    main()
