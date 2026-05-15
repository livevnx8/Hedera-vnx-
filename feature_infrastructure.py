#!/usr/bin/env python3
"""
Feature Infrastructure Specialist for Hedera Prediction Market.

Three specialist types:
1. Feature Importance Monitor - tracks which features are predictive over time
2. Auto Feature Engineer - generates and evaluates new features
3. Feature Drift Detector - alerts when feature distributions shift
"""

import json
import math
import sqlite3
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Tuple

import numpy as np
from scipy import stats

from vnx.paths import CACHE_DIR

CACHE_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = CACHE_DIR / "predictions.db"


class FeatureImportanceMonitor:
    """
    Specialist 1: Tracks which features are most predictive over time.
    Alerts when features become stale.
    """

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path

    def get_feature_importance(self, token: str, window: int = 200) -> Dict[str, Any]:
        """Compute feature importance from historical predictions."""
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute('''
                SELECT features, direction, actual_direction, timestamp
                FROM predictions
                WHERE token = ? AND actual_direction IS NOT NULL
                ORDER BY timestamp DESC LIMIT ?
            ''', (token, window)).fetchall()

        if len(rows) < 50:
            return {"error": f"Insufficient data: {len(rows)} predictions"}

        # Extract feature names
        feature_names = set()
        for row in rows:
            features = json.loads(row[0]) if row[0] else {}
            feature_names.update(features.keys())

        # Remove metadata
        feature_names = {f for f in feature_names if f not in {"timestamp", "price"}}

        # Compute importance: correlation with correct predictions
        importance_scores = {}
        trends = {}

        for feature in feature_names:
            correct_values = []
            incorrect_values = []

            for row in rows:
                features = json.loads(row[0]) if row[0] else {}
                pred_dir = row[1]
                actual_dir = row[2]

                if feature in features:
                    if pred_dir == actual_dir:
                        correct_values.append(features[feature])
                    else:
                        incorrect_values.append(features[feature])

            if len(correct_values) < 10 or len(incorrect_values) < 10:
                continue

            # Importance = separation between correct and incorrect
            mean_correct = np.mean(correct_values)
            mean_incorrect = np.mean(incorrect_values)
            pooled_std = np.sqrt((np.std(correct_values)**2 + np.std(incorrect_values)**2) / 2)

            if pooled_std > 0:
                importance = abs(mean_correct - mean_incorrect) / pooled_std
            else:
                importance = 0

            importance_scores[feature] = {
                "importance": round(float(importance), 4),
                "mean_correct": round(float(mean_correct), 4),
                "mean_incorrect": round(float(mean_incorrect), 4),
                "pooled_std": round(float(pooled_std), 4),
                "n_correct": len(correct_values),
                "n_incorrect": len(incorrect_values),
            }

        # Sort by importance
        ranked = sorted(importance_scores.items(), key=lambda x: x[1]["importance"], reverse=True)

        # Detect stale features (importance dropped significantly)
        stale_features = []
        for feature, scores in ranked:
            if scores["importance"] < 0.01:
                stale_features.append({
                    "feature": feature,
                    "importance": scores["importance"],
                    "reason": "Below significance threshold",
                })

        return {
            "token": token.upper(),
            "window_size": len(rows),
            "feature_importance": [{"feature": f, **s} for f, s in ranked],
            "top_feature": ranked[0][0] if ranked else "none",
            "stale_features": stale_features,
            "recommendation": f"Consider removing {len(stale_features)} stale features" if stale_features else "All features healthy",
        }

    def get_importance_trend(self, token: str, feature: str, windows: int = 4) -> Dict[str, Any]:
        """Track how a feature's importance changes over time."""
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute('''
                SELECT COUNT(*) FROM predictions WHERE token = ? AND actual_direction IS NOT NULL
            ''', (token,)).fetchone()[0]

        if total < 100:
            return {"error": f"Insufficient data: {total} predictions"}

        window_size = total // windows
        trends = []

        for i in range(windows):
            offset = i * window_size
            result = self.get_feature_importance(token, window=window_size)
            if "error" in result:
                continue

            feat_data = next((f for f in result["feature_importance"] if f["feature"] == feature), None)
            if feat_data:
                trends.append({
                    "window": i + 1,
                    "importance": feat_data["importance"],
                })

        if len(trends) < 2:
            return {"error": f"Not enough windows for {feature}"}

        # Detect trend
        first = trends[0]["importance"]
        last = trends[-1]["importance"]
        change = last - first

        trend_direction = (
            "RISING" if change > 0.05 else
            "FALLING" if change < -0.05 else
            "STABLE"
        )

        return {
            "feature": feature,
            "token": token.upper(),
            "trend": trend_direction,
            "change": round(float(change), 4),
            "first_window": round(float(first), 4),
            "last_window": round(float(last), 4),
            "history": trends,
        }


class AutoFeatureEngineer:
    """
    Specialist 2: Automatically generates and evaluates new features.
    """

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path

    def generate_candidates(self, features: Dict[str, float]) -> Dict[str, float]:
        """Generate new feature candidates from existing features."""
        candidates = {}

        numeric_features = {k: v for k, v in features.items()
                           if isinstance(v, (int, float)) and k not in {"timestamp", "price"}}

        feature_names = list(numeric_features.keys())
        values = list(numeric_features.values())

        # 1. Polynomial features
        for name, val in numeric_features.items():
            candidates[f"{name}_sq"] = val ** 2
            candidates[f"{name}_abs"] = abs(val)
            candidates[f"{name}_sqrt"] = math.sqrt(abs(val)) if val != 0 else 0

        # 2. Interaction features
        for i, (n1, v1) in enumerate(numeric_features.items()):
            for n2, v2 in list(numeric_features.items())[i+1:]:
                candidates[f"{n1}_x_{n2}"] = v1 * v2
                if v2 != 0:
                    candidates[f"{n1}_div_{n2}"] = v1 / v2

        # 3. Ratio features
        if "volume_proxy" in numeric_features and "volume_sma_24" in numeric_features:
            if numeric_features["volume_sma_24"] != 0:
                candidates["volume_ratio"] = numeric_features["volume_proxy"] / numeric_features["volume_sma_24"]

        # 4. Composite momentum
        if "rsi_14" in numeric_features and "price_change_24h" in numeric_features:
            candidates["momentum_composite"] = numeric_features["rsi_14"] * 0.6 + np.tanh(numeric_features["price_change_24h"]) * 0.4

        # 5. Volatility-adjusted returns
        if "price_change_24h" in numeric_features and "volatility_14h" in numeric_features:
            if numeric_features["volatility_14h"] > 0:
                candidates["sharpe_like"] = numeric_features["price_change_24h"] / numeric_features["volatility_14h"]

        # 6. Bollinger position
        if "bb_percent_b" in numeric_features:
            bb = numeric_features["bb_percent_b"]
            candidates["bb_extreme"] = 1 if bb < 0.1 or bb > 0.9 else 0
            candidates["bb_mid"] = 1 - abs(bb - 0.5) * 2

        # 7. Trend consistency
        if all(f in numeric_features for f in ["price_vs_sma7", "price_vs_sma20", "price_vs_sma50"]):
            sma_signals = [
                1 if numeric_features["price_vs_sma7"] > 1.0 else -1,
                1 if numeric_features["price_vs_sma20"] > 1.0 else -1,
                1 if numeric_features["price_vs_sma50"] > 1.0 else -1,
            ]
            candidates["sma_agreement"] = sum(sma_signals) / 3  # -1 to +1

        return candidates

    def evaluate_feature(self, token: str, feature_name: str, window: int = 200) -> Dict[str, Any]:
        """Evaluate how predictive a feature is."""
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute('''
                SELECT features, actual_direction
                FROM predictions
                WHERE token = ? AND actual_direction IS NOT NULL
                ORDER BY timestamp DESC LIMIT ?
            ''', (token, window)).fetchall()

        if len(rows) < 50:
            return {"error": f"Insufficient data: {len(rows)}"}

        feature_values = []
        labels = []

        for row in rows:
            features = json.loads(row[0]) if row[0] else {}
            if feature_name in features:
                feature_values.append(features[feature_name])
                labels.append(1 if row[1] == "UP" else 0)

        if len(feature_values) < 50:
            return {"error": f"Feature '{feature_name}' not found in enough samples"}

        # Point-biserial correlation (feature vs binary label)
        from scipy.stats import pointbiserialr

        try:
            correlation, p_value = pointbiserialr(labels, feature_values)
        except Exception:
            correlation, p_value = 0, 1

        # Compute accuracy using simple threshold
        threshold = np.median(feature_values)
        predictions = [1 if v > threshold else 0 for v in feature_values]
        accuracy = sum(1 for p, l in zip(predictions, labels) if p == l) / len(labels)

        return {
            "feature": feature_name,
            "token": token.upper(),
            "correlation": round(float(correlation), 4),
            "p_value": round(float(p_value), 4),
            "accuracy": round(float(accuracy), 4),
            "n_samples": len(feature_values),
            "significant": p_value < 0.05,
            "recommendation": "KEEP" if abs(correlation) > 0.1 and p_value < 0.05 else "DROP",
        }

    def discover_features(self, token: str) -> Dict[str, Any]:
        """Auto-discover and evaluate new features."""
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute('''
                SELECT features FROM predictions WHERE token = ? AND features IS NOT NULL
                ORDER BY timestamp DESC LIMIT 1
            ''', (token,)).fetchone()

        if not row:
            return {"error": "No feature data available"}

        base_features = json.loads(row[0])
        candidates = self.generate_candidates(base_features)

        # Evaluate each candidate
        results = []
        for name, value in candidates.items():
            # Simple heuristic evaluation
            score = abs(value) if not np.isnan(value) and not np.isinf(value) else 0
            results.append({
                "feature": name,
                "example_value": round(float(value), 4),
                "potential_score": round(float(score), 4),
            })

        results.sort(key=lambda x: x["potential_score"], reverse=True)

        return {
            "token": token.upper(),
            "base_features": len(base_features),
            "candidates_generated": len(candidates),
            "top_candidates": results[:10],
            "recommendation": f"Test top {min(5, len(results))} candidates with evaluate_feature()",
        }


class FeatureDriftDetector:
    """
    Specialist 3: Detects when feature distributions shift over time.
    Alerts for model retraining.
    """

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.drift_threshold = 2.0  # Standard deviations

    def detect_drift(self, token: str, feature: str, window_ref: int = 100, window_cur: int = 100) -> Dict[str, Any]:
        """Detect if a feature's distribution has drifted."""
        with sqlite3.connect(self.db_path) as conn:
            # Reference window (older data)
            ref_rows = conn.execute('''
                SELECT features FROM predictions
                WHERE token = ? AND features IS NOT NULL
                ORDER BY timestamp ASC LIMIT ? OFFSET ?
            ''', (token, window_ref, 0)).fetchall()

            # Current window (recent data)
            cur_rows = conn.execute('''
                SELECT features FROM predictions
                WHERE token = ? AND features IS NOT NULL
                ORDER BY timestamp DESC LIMIT ?
            ''', (token, window_cur)).fetchall()

        ref_values = []
        for row in ref_rows:
            features = json.loads(row[0]) if row[0] else {}
            if feature in features and not np.isnan(features[feature]) and not np.isinf(features[feature]):
                ref_values.append(features[feature])

        cur_values = []
        for row in cur_rows:
            features = json.loads(row[0]) if row[0] else {}
            if feature in features and not np.isnan(features[feature]) and not np.isinf(features[feature]):
                cur_values.append(features[feature])

        if len(ref_values) < 20 or len(cur_values) < 20:
            return {"error": f"Insufficient data for {feature}: ref={len(ref_values)}, cur={len(cur_values)}"}

        # Statistical tests
        ref_mean = np.mean(ref_values)
        ref_std = np.std(ref_values)
        cur_mean = np.mean(cur_values)
        cur_std = np.std(cur_values)

        # Kolmogorov-Smirnov test
        try:
            ks_stat, ks_pvalue = stats.ks_2samp(ref_values, cur_values)
        except Exception:
            ks_stat, ks_pvalue = 0, 1

        # Mean shift (in standard deviations)
        if ref_std > 0:
            mean_shift = (cur_mean - ref_mean) / ref_std
        else:
            mean_shift = 0

        # Variance shift
        if ref_std > 0:
            variance_shift = cur_std / ref_std
        else:
            variance_shift = 1.0

        # Determine drift
        drift_detected = (
            abs(mean_shift) > self.drift_threshold or
            variance_shift > 2.0 or variance_shift < 0.5 or
            ks_pvalue < 0.01
        )

        severity = (
            "CRITICAL" if abs(mean_shift) > 4 else
            "HIGH" if abs(mean_shift) > 3 else
            "MEDIUM" if abs(mean_shift) > 2 else
            "LOW" if drift_detected else
            "NONE"
        )

        return {
            "feature": feature,
            "token": token.upper(),
            "drift_detected": drift_detected,
            "severity": severity,
            "mean_shift_std": round(float(mean_shift), 2),
            "variance_ratio": round(float(variance_shift), 2),
            "ks_statistic": round(float(ks_stat), 4),
            "ks_pvalue": round(float(ks_pvalue), 4),
            "ref_stats": {"mean": round(float(ref_mean), 4), "std": round(float(ref_std), 4), "n": len(ref_values)},
            "cur_stats": {"mean": round(float(cur_mean), 4), "std": round(float(cur_std), 4), "n": len(cur_values)},
            "recommendation": "RETRAIN" if severity in ["CRITICAL", "HIGH"] else "MONITOR" if drift_detected else "NONE",
        }

    def detect_all_drift(self, token: str) -> Dict[str, Any]:
        """Check all features for drift."""
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute('''
                SELECT features FROM predictions WHERE token = ? AND features IS NOT NULL LIMIT 1
            ''', (token,)).fetchone()

        if not row:
            return {"error": f"No data for {token}"}

        features = json.loads(row[0]) if row[0] else {}
        feature_names = [f for f in features.keys() if f not in {"timestamp", "price"}]

        results = []
        critical_count = 0
        high_count = 0

        for feature in feature_names:
            result = self.detect_drift(token, feature)
            if "error" not in result:
                results.append(result)
                if result["severity"] == "CRITICAL":
                    critical_count += 1
                elif result["severity"] == "HIGH":
                    high_count += 1

        # Overall recommendation
        if critical_count >= 2 or high_count >= 3:
            overall = "RETRAIN_IMMEDIATELY"
        elif critical_count >= 1 or high_count >= 2:
            overall = "RETRAIN_SOON"
        elif high_count >= 1:
            overall = "MONITOR_CLOSELY"
        else:
            overall = "HEALTHY"

        return {
            "token": token.upper(),
            "features_checked": len(results),
            "critical": critical_count,
            "high": high_count,
            "overall_status": overall,
            "drift_details": results,
            "recommendation": overall,
        }

    def get_regime_shift(self, token: str) -> Dict[str, Any]:
        """Detect if market regime has shifted (volatility, trend)."""
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute('''
                SELECT features FROM predictions
                WHERE token = ? AND features IS NOT NULL
                ORDER BY timestamp
            ''', (token,)).fetchall()

        if len(rows) < 50:
            return {"error": f"Insufficient data: {len(rows)}"}

        # Split into two halves
        mid = len(rows) // 2

        early_vol = []
        late_vol = []

        for i, row in enumerate(rows):
            features = json.loads(row[0]) if row[0] else {}
            if "volatility_14h" in features:
                if i < mid:
                    early_vol.append(features["volatility_14h"])
                else:
                    late_vol.append(features["volatility_14h"])

        if len(early_vol) < 10 or len(late_vol) < 10:
            return {"error": "Insufficient volatility data"}

        early_mean = np.mean(early_vol)
        late_mean = np.mean(late_vol)

        if early_mean > 0:
            vol_change = (late_mean - early_mean) / early_mean * 100
        else:
            vol_change = 0

        regime_shift = (
            "LOW_TO_HIGH" if vol_change > 50 else
            "HIGH_TO_LOW" if vol_change < -50 else
            "STABLE"
        )

        return {
            "token": token.upper(),
            "volatility_regime_shift": regime_shift,
            "early_volatility": round(float(early_mean), 4),
            "late_volatility": round(float(late_mean), 4),
            "change_percent": round(float(vol_change), 1),
            "recommendation": "ADJUST_POSITION_SIZING" if regime_shift != "STABLE" else "NONE",
        }
