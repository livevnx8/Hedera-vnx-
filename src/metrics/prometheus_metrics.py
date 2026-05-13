#!/usr/bin/env python3
"""
Lightweight Prometheus metrics for FastAPI.
No external dependencies — generates Prometheus exposition format directly.

Usage:
    from metrics.prometheus_metrics import metrics

    @app.get("/predict/{token}")
    async def predict(token: str):
        metrics.request_count.labels(endpoint="/predict", method="GET").inc()
        with metrics.request_duration.labels(endpoint="/predict").time():
            result = do_prediction(token)
        return result

    @app.get("/metrics")
    async def prometheus_metrics():
        return PlainTextResponse(metrics.export())
"""

import time
import threading
from typing import Dict, List, Any
from collections import defaultdict


__all__ = [
    "Counter", "Histogram", "Gauge",
    "CounterView", "HistogramView", "GaugeView",
    "MetricsRegistry", "metrics",
]


class Counter:
    """Prometheus-style counter."""

    def __init__(self, name: str, description: str, labels: List[str] = None):
        self.name = name
        self.description = description
        self.label_names = labels or []
        self._values = defaultdict(lambda: 0)
        self._lock = threading.Lock()

    def labels(self, **kwargs) -> "Counter":
        """Return a view with specific labels."""
        label_key = ",".join(f'{k}="{v}"' for k, v in sorted(kwargs.items()))
        view = CounterView(self, label_key)
        return view

    def inc(self, value: float = 1.0):
        """Increment counter."""
        with self._lock:
            self._values[""] += value

    def _inc_label(self, label_key: str, value: float = 1.0):
        with self._lock:
            self._values[label_key] += value

    def _get_value(self, label_key: str = "") -> float:
        with self._lock:
            return self._values[label_key]

    def _format(self) -> str:
        lines = [f"# HELP {self.name} {self.description}",
                 f"# TYPE {self.name} counter"]
        with self._lock:
            for key, value in sorted(self._values.items()):
                if key:
                    lines.append(f'{self.name}{{{key}}} {value}')
                else:
                    lines.append(f'{self.name} {value}')
        return "\n".join(lines)


class CounterView:
    """View of a counter with specific labels."""

    def __init__(self, counter: Counter, label_key: str):
        self.counter = counter
        self.label_key = label_key

    def inc(self, value: float = 1.0):
        self.counter._inc_label(self.label_key, value)


class Histogram:
    """Prometheus-style histogram for latency tracking."""

    BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]

    def __init__(self, name: str, description: str, labels: List[str] = None):
        self.name = name
        self.description = description
        self.label_names = labels or []
        self._buckets = defaultdict(lambda: {b: 0 for b in self.BUCKETS})
        self._sums = defaultdict(lambda: 0.0)
        self._counts = defaultdict(lambda: 0)
        self._lock = threading.Lock()

    def labels(self, **kwargs) -> "HistogramView":
        label_key = ",".join(f'{k}="{v}"' for k, v in sorted(kwargs.items()))
        return HistogramView(self, label_key)

    def observe(self, value: float):
        """Record an observation."""
        with self._lock:
            self._observe_label("", value)

    def _observe_label(self, label_key: str, value: float):
        for bucket in self.BUCKETS:
            if value <= bucket:
                self._buckets[label_key][bucket] += 1
        self._sums[label_key] += value
        self._counts[label_key] += 1

    def _format(self) -> str:
        lines = [f"# HELP {self.name} {self.description}",
                 f"# TYPE {self.name} histogram"]

        with self._lock:
            for key in sorted(set(list(self._buckets.keys()) + list(self._sums.keys()))):
                suffix = "{" + key + "}" if key else ""

                # Bucket counts
                for bucket in self.BUCKETS:
                    bucket_name = f'{self.name}_bucket{suffix}'
                    if key:
                        bucket_name = f'{self.name}_bucket{{{key},le="{bucket}"}}'
                    else:
                        bucket_name = f'{self.name}_bucket{{le="{bucket}"}}'
                    lines.append(f'{bucket_name} {self._buckets[key][bucket]}')

                # +Inf bucket
                if key:
                    lines.append(f'{self.name}_bucket{{{key},le="+Inf"}} {self._counts[key]}')
                else:
                    lines.append(f'{self.name}_bucket{{le="+Inf"}} {self._counts[key]}')

                # Sum and count
                lines.append(f'{self.name}_sum{suffix} {self._sums[key]}')
                lines.append(f'{self.name}_count{suffix} {self._counts[key]}')

        return "\n".join(lines)


class HistogramView:
    """View of a histogram with specific labels."""

    def __init__(self, histogram: Histogram, label_key: str):
        self.histogram = histogram
        self.label_key = label_key

    def observe(self, value: float):
        self.histogram._observe_label(self.label_key, value)

    def time(self):
        """Context manager for timing."""
        return _Timer(self)


class _Timer:
    """Context manager for histogram timing."""

    def __init__(self, view: HistogramView):
        self.view = view
        self.start = None

    def __enter__(self):
        self.start = time.time()
        return self

    def __exit__(self, *args):
        elapsed = time.time() - self.start
        self.view.observe(elapsed)


class Gauge:
    """Prometheus-style gauge."""

    def __init__(self, name: str, description: str, labels: List[str] = None):
        self.name = name
        self.description = description
        self.label_names = labels or []
        self._values = defaultdict(lambda: 0.0)
        self._lock = threading.Lock()

    def labels(self, **kwargs) -> "GaugeView":
        label_key = ",".join(f'{k}="{v}"' for k, v in sorted(kwargs.items()))
        return GaugeView(self, label_key)

    def set(self, value: float):
        with self._lock:
            self._values[""] = value

    def _set_label(self, label_key: str, value: float):
        with self._lock:
            self._values[label_key] = value

    def _format(self) -> str:
        lines = [f"# HELP {self.name} {self.description}",
                 f"# TYPE {self.name} gauge"]
        with self._lock:
            for key, value in sorted(self._values.items()):
                if key:
                    lines.append(f'{self.name}{{{key}}} {value}')
                else:
                    lines.append(f'{self.name} {value}')
        return "\n".join(lines)


class GaugeView:
    """View of a gauge with specific labels."""

    def __init__(self, gauge: Gauge, label_key: str):
        self.gauge = gauge
        self.label_key = label_key

    def set(self, value: float):
        self.gauge._set_label(self.label_key, value)


class MetricsRegistry:
    """Registry of all Prometheus metrics."""

    def __init__(self):
        self._metrics = {}

        # Request metrics
        self.request_count = self._register(Counter(
            "vera_requests_total",
            "Total HTTP requests",
            ["endpoint", "method"]
        ))

        self.request_duration = self._register(Histogram(
            "vera_request_duration_seconds",
            "HTTP request duration",
            ["endpoint"]
        ))

        self.response_status = self._register(Counter(
            "vera_response_status_total",
            "HTTP response status codes",
            ["endpoint", "status"]
        ))

        # Specialist metrics
        self.specialist_runs = self._register(Counter(
            "vera_specialist_runs_total",
            "Specialist execution count",
            ["specialist_id", "swarm_type"]
        ))

        self.specialist_latency = self._register(Histogram(
            "vera_specialist_latency_seconds",
            "Specialist execution latency",
            ["specialist_id"]
        ))

        self.specialist_alerts = self._register(Counter(
            "vera_alerts_total",
            "Total alerts generated",
            ["severity", "specialist_id"]
        ))

        # Swarm health
        self.vnx_swarm_health = self._register(Gauge(
            "vera_vnx_swarm_health",
            "VNX swarm health score (0-1)"
        ))

        self.hedera_swarm_health = self._register(Gauge(
            "vera_hedera_swarm_health",
            "Hedera VNX swarm health score (0-1)"
        ))

        self.swarm_specialists_active = self._register(Gauge(
            "vera_swarm_specialists_active",
            "Number of active specialists"
        ))

        # Prediction metrics
        self.prediction_count = self._register(Counter(
            "vera_predictions_total",
            "Total predictions made",
            ["token", "direction"]
        ))

        self.prediction_accuracy = self._register(Gauge(
            "vera_prediction_accuracy",
            "Prediction accuracy (0-1)",
            ["token"]
        ))

        # Circuit breaker metrics
        self.circuit_breaker_state = self._register(Gauge(
            "vera_circuit_breaker_state",
            "Circuit breaker state (0=closed, 1=open, 2=half_open)",
            ["name"]
        ))

        self.circuit_breaker_failures = self._register(Counter(
            "vera_circuit_breaker_failures_total",
            "Circuit breaker failure count",
            ["name"]
        ))

        # Cache metrics
        self.cache_hit = self._register(Counter(
            "vera_cache_hits_total",
            "Cache hit count",
            ["cache_level"]
        ))

        self.cache_miss = self._register(Counter(
            "vera_cache_misses_total",
            "Cache miss count",
            ["cache_level"]
        ))

        # Infrastructure
        self.db_connection_up = self._register(Gauge(
            "vera_db_connection_up",
            "Database connection status (1=up, 0=down)"
        ))

        self.redis_up = self._register(Gauge(
            "vera_redis_up",
            "Redis connection status (1=up, 0=down)"
        ))

        # HCS metrics
        self.hcs_messages = self._register(Counter(
            "vera_hcs_messages_total",
            "HCS messages processed"
        ))

        self.hcs_failures = self._register(Counter(
            "vera_hcs_failures_total",
            "HCS processing failures"
        ))

    def _register(self, metric):
        self._metrics[metric.name] = metric
        return metric

    def export(self) -> str:
        """Export all metrics in Prometheus exposition format."""
        lines = []
        for name in sorted(self._metrics.keys()):
            lines.append(self._metrics[name]._format())
            lines.append("")
        return "\n".join(lines)

    def get_all(self) -> Dict[str, Any]:
        """Get all metric values as dict (for debugging)."""
        return {name: type(m).__name__ for name, m in self._metrics.items()}


# Global metrics instance
metrics = MetricsRegistry()
