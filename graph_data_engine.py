#!/usr/bin/env python3
"""
Graph Data Engine for Hedera Prediction Market.
Generates time-series data for frontend charting libraries.
"""

import json
import sqlite3
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

import numpy as np

from vera_os.paths import CACHE_DIR, TOKEN_DATA_DIR


class GraphDataEngine:
    """
    Generates time-series data for frontend visualizations.

    Outputs JSON arrays compatible with:
    - Chart.js
    - D3.js
    - Recharts (React)
    - Any charting library accepting {x, y} data points
    """

    def __init__(self, db_path: str | Path = CACHE_DIR / "predictions.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self._load_historical()

    def _init_db(self):
        """Initialize predictions database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    token TEXT,
                    timestamp REAL,
                    price REAL,
                    up_probability REAL,
                    confidence REAL,
                    direction TEXT,
                    actual_direction TEXT,
                    features TEXT
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS accuracy_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    token TEXT,
                    date TEXT,
                    accuracy REAL,
                    total_predictions INTEGER,
                    correct_predictions INTEGER
                )
            ''')
            conn.commit()

    def _load_historical(self):
        """Load historical predictions from corpus data."""
        token_dir = TOKEN_DATA_DIR

        for corpus_file in token_dir.glob("*_corpus.json"):
            token = corpus_file.stem.replace("_corpus", "")
            corpus = json.loads(corpus_file.read_text())

            # Check if already seeded
            with sqlite3.connect(self.db_path) as conn:
                count = conn.execute(
                    'SELECT COUNT(*) FROM predictions WHERE token = ?', (token,)
                ).fetchone()[0]

                if count > 0:
                    continue  # Already seeded

            # Seed from corpus
            for i, sample in enumerate(corpus):
                if "features" not in sample:
                    continue

                features = sample["features"]
                price = features.get("price", 0)

                # Estimate probability from features
                up_prob = self._estimate_probability_from_features(features)
                confidence = abs(up_prob - 0.5) * 2
                direction = "UP" if up_prob > 0.5 else "DOWN"

                # Actual direction from label
                actual = None
                if "label" in sample:
                    actual = "UP" if sample["label"] == 1 else "DOWN"

                with sqlite3.connect(self.db_path) as conn:
                    conn.execute('''
                        INSERT INTO predictions (token, timestamp, price, up_probability,
                                                confidence, direction, actual_direction, features)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (token, i, price, up_prob, confidence, direction, actual, json.dumps(features)))

            with sqlite3.connect(self.db_path) as conn:
                conn.commit()

    def _estimate_probability_from_features(self, features: Dict) -> float:
        """Estimate UP probability from feature values."""
        score = 0.5  # Neutral start

        if "rsi_14" in features:
            score += (features["rsi_14"] - 0.5) * 0.3

        if "price_change_24h" in features:
            score += features["price_change_24h"] * 0.2

        if "price_vs_sma20" in features:
            score += (features["price_vs_sma20"] - 1.0) * 0.3

        if "bb_percent_b" in features:
            score += (features["bb_percent_b"] - 0.5) * 0.2

        return float(np.clip(score, 0, 1))

    def record_prediction(self, token: str, price: float, up_probability: float,
                        confidence: float, direction: str, features: Dict):
        """Record a new prediction for graph history."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                INSERT INTO predictions (token, timestamp, price, up_probability,
                                        confidence, direction, features)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (token, time.time(), price, up_probability, confidence, direction, json.dumps(features)))
            conn.commit()

    def get_probability_time_series(self, token: str, points: int = 100) -> Dict[str, Any]:
        """Get prediction probability over time for charting."""
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute('''
                SELECT timestamp, price, up_probability, confidence, direction, actual_direction
                FROM predictions WHERE token = ? ORDER BY timestamp DESC LIMIT ?
            ''', (token, points)).fetchall()

        if not rows:
            return {"error": f"No historical data for {token}"}

        # Reverse to chronological order
        rows = rows[::-1]

        probability_data = []
        confidence_band_upper = []
        confidence_band_lower = []
        price_data = []
        actual_data = []

        for row in rows:
            ts, price, up_prob, conf, pred_dir, actual_dir = row

            # Format timestamp
            if ts > 1000000000:  # Unix timestamp
                label = datetime.fromtimestamp(ts).strftime("%m-%d %H:%M")
            else:
                label = f"T-{int(ts)}"

            probability_data.append({
                "x": label,
                "y": round(up_prob * 100, 1),  # As percentage
            })

            # Confidence bands
            band = conf * 25  # Scale to percentage points
            confidence_band_upper.append({
                "x": label,
                "y": round(min(100, (up_prob * 100) + band), 1),
            })
            confidence_band_lower.append({
                "x": label,
                "y": round(max(0, (up_prob * 100) - band), 1),
            })

            # Price overlay
            price_data.append({
                "x": label,
                "y": round(price, 6),
            })

            # Actual direction (if known)
            if actual_dir:
                actual_data.append({
                    "x": label,
                    "y": 100 if actual_dir == "UP" else 0,
                })

        return {
            "token": token.upper(),
            "prediction_probability": probability_data,
            "confidence_band_upper": confidence_band_upper,
            "confidence_band_lower": confidence_band_lower,
            "price": price_data,
            "actual_direction": actual_data,
            "points": len(probability_data),
        }

    def get_accuracy_over_time(self, token: str, window_days: int = 7) -> Dict[str, Any]:
        """Get rolling accuracy for charting."""
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute('''
                SELECT timestamp, direction, actual_direction
                FROM predictions
                WHERE token = ? AND actual_direction IS NOT NULL
                ORDER BY timestamp
            ''', (token,)).fetchall()

        if len(rows) < 10:
            return {"error": f"Insufficient labeled data for {token}"}

        # Compute rolling accuracy
        window_size = min(50, len(rows) // 4)  # Adaptive window
        if window_size < 5:
            window_size = 5

        accuracy_data = []
        correct_count = 0

        for i in range(len(rows)):
            _, pred_dir, actual_dir = rows[i]
            if pred_dir == actual_dir:
                correct_count += 1

            # Rolling window
            if i >= window_size:
                _, old_pred, old_actual = rows[i - window_size]
                if old_pred == old_actual:
                    correct_count -= 1

            if i >= window_size - 1:
                accuracy = correct_count / min(window_size, i + 1) * 100

                ts = rows[i][0]
                if ts > 1000000000:
                    label = datetime.fromtimestamp(ts).strftime("%m-%d %H:%M")
                else:
                    label = f"T-{int(ts)}"

                accuracy_data.append({
                    "x": label,
                    "y": round(accuracy, 1),
                })

        return {
            "token": token.upper(),
            "rolling_accuracy": accuracy_data,
            "window_size": window_size,
            "current_accuracy": round(accuracy_data[-1]["y"], 1) if accuracy_data else 0,
            "points": len(accuracy_data),
        }

    def get_feature_importance(self, token: str) -> Dict[str, Any]:
        """Analyze which features mattered most historically."""
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute('''
                SELECT features, direction, actual_direction
                FROM predictions
                WHERE token = ? AND features IS NOT NULL AND actual_direction IS NOT NULL
                ORDER BY timestamp DESC LIMIT 200
            ''', (token,)).fetchall()

        if not rows:
            return {"error": f"No feature data for {token}"}

        # Feature correlation with correct predictions
        feature_names = [
            "rsi_14", "price_change_1h", "price_change_4h", "price_change_24h",
            "price_vs_sma7", "price_vs_sma20", "price_vs_sma50",
            "bb_percent_b", "volatility_14h", "volume_change_1h",
        ]

        feature_scores = {name: [] for name in feature_names}

        for row in rows:
            features_json, pred_dir, actual_dir = row
            try:
                features = json.loads(features_json)
                correct = 1 if pred_dir == actual_dir else 0

                for name in feature_names:
                    if name in features:
                        # Record feature value when prediction was correct vs incorrect
                        feature_scores[name].append((features[name], correct))
            except Exception:
                continue

        # Compute importance: difference in mean feature value when correct vs incorrect
        importance = []
        for name, values in feature_scores.items():
            if len(values) < 10:
                continue

            correct_vals = [v for v, c in values if c == 1]
            incorrect_vals = [v for v, c in values if c == 0]

            if correct_vals and incorrect_vals:
                mean_correct = np.mean(correct_vals)
                mean_incorrect = np.mean(incorrect_vals)
                diff = abs(mean_correct - mean_incorrect)
                importance.append({
                    "feature": name,
                    "importance": round(float(diff), 4),
                    "mean_when_correct": round(float(mean_correct), 4),
                    "mean_when_wrong": round(float(mean_incorrect), 4),
                })

        importance.sort(key=lambda x: x["importance"], reverse=True)

        return {
            "token": token.upper(),
            "feature_importance": importance[:10],
            "most_important": importance[0]["feature"] if importance else "unknown",
        }

    def get_dashboard_data(self, token: str) -> Dict[str, Any]:
        """Get all graph data for a token dashboard."""
        return {
            "token": token.upper(),
            "probability_series": self.get_probability_time_series(token),
            "accuracy_series": self.get_accuracy_over_time(token),
            "feature_importance": self.get_feature_importance(token),
            "generated_at": datetime.now().isoformat(),
        }
