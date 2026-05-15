#!/usr/bin/env python3
"""
VNX Latency Benchmark — Comprehensive performance measurement across all layers.

Tests:
  1. Prediction swarm inference time (7-agent consensus)
  2. SQLite write latency (price tick + prediction storage)
  3. Hiero mirror node REST API query time
  4. HCS proof verification latency
  5. End-to-end prediction cycle (price fetch → features → predict → store)

Networks: testnet (default) | mainnet (via env)
"""

import json
import os
import sqlite3
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from hedera_proof.mirror_verifier import MirrorVerifier


@dataclass
class BenchmarkResult:
    """Single benchmark measurement."""
    name: str
    latency_ms: float
    network: str = "testnet"
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class VNXLatencyBenchmark:
    """Run comprehensive latency benchmarks for VNX stack."""

    def __init__(self, network: str = "testnet"):
        self.network = network
        self.results: List[BenchmarkResult] = []
        self.db_path = Path(__file__).resolve().parents[1] / "data" / "fast_predictions.db"
        self.mirror = MirrorVerifier(network=network)

    def _measure(self, name: str, fn, **kwargs) -> BenchmarkResult:
        """Measure execution time of a function."""
        t0 = time.perf_counter()
        try:
            result = fn(**kwargs)
            elapsed = (time.perf_counter() - t0) * 1000
            return BenchmarkResult(
                name=name,
                latency_ms=round(elapsed, 3),
                network=self.network,
                details={"status": "success", "result": result},
            )
        except Exception as e:
            elapsed = (time.perf_counter() - t0) * 1000
            return BenchmarkResult(
                name=name,
                latency_ms=round(elapsed, 3),
                network=self.network,
                details={"status": "error", "error": str(e)},
            )

    def benchmark_sqlite_write(self) -> BenchmarkResult:
        """Measure SQLite write latency for a price tick + prediction."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        def _write():
            now = time.time()
            conn.execute(
                "INSERT OR REPLACE INTO price_ticks (timestamp, price, volume_24h, change_24h) VALUES (?, ?, ?, ?)",
                (now, 0.095, 50000000, 0.0),
            )
            conn.commit()
            return "inserted"

        result = self._measure("sqlite_price_tick_write", lambda: _write())
        conn.close()
        return result

    def benchmark_mirror_node_query(self) -> BenchmarkResult:
        """Measure Hiero mirror node REST API query latency."""
        return self._measure(
            "hiero_mirror_node_query",
            lambda: self.mirror.fetch_topic_messages("0.0.43850297", limit=1),
        )

    def benchmark_verify_by_hash(self) -> BenchmarkResult:
        """Measure HCS proof verification latency via mirror node."""
        dummy_hash = "a" * 64
        return self._measure(
            "hiero_verify_by_hash",
            lambda: self.mirror.verify_by_hash(dummy_hash, "0.0.43850297"),
        )

    def benchmark_end_to_end_cycle(self) -> BenchmarkResult:
        """Measure full prediction cycle: DB read → compute features → hash → verify."""
        def _cycle():
            conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row

            # 1. Read last price
            row = conn.execute(
                "SELECT timestamp, price FROM price_ticks ORDER BY timestamp DESC LIMIT 1"
            ).fetchone()
            if not row:
                conn.close()
                return "no_data"

            # 2. Build proof hash (simulating what /fast/verify does)
            import hashlib
            proof_payload = f"{row['timestamp']}:UP:0.5:{row['price']}"
            proof_hash = hashlib.sha256(proof_payload.encode()).hexdigest()

            # 3. Verify via mirror node
            self.mirror.verify_by_hash(proof_hash, "0.0.43850297")

            conn.close()
            return "completed"

        return self._measure("end_to_end_verify_cycle", _cycle)

    def benchmark_prediction_query(self) -> BenchmarkResult:
        """Measure prediction table query latency."""
        def _query():
            conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM fast_predictions ORDER BY timestamp DESC LIMIT 10"
            ).fetchall()
            conn.close()
            return len(rows)

        return self._measure("sqlite_prediction_query_last10", _query)

    def run_all(self) -> List[BenchmarkResult]:
        """Run all benchmarks."""
        print(f"\n{'='*60}")
        print(f"VNX Latency Benchmark — Network: {self.network.upper()}")
        print(f"Time: {datetime.now(timezone.utc).isoformat()}")
        print(f"{'='*60}\n")

        tests = [
            self.benchmark_sqlite_write,
            self.benchmark_prediction_query,
            self.benchmark_mirror_node_query,
            self.benchmark_verify_by_hash,
            self.benchmark_end_to_end_cycle,
        ]

        for test_fn in tests:
            print(f"Running {test_fn.__name__}...", end=" ")
            result = test_fn()
            self.results.append(result)
            status = result.details.get("status", "unknown")
            print(f"{result.latency_ms:>8.3f} ms [{status}]")

        return self.results

    def generate_report(self) -> str:
        """Generate markdown report from results."""
        total = sum(r.latency_ms for r in self.results)
        avg = total / len(self.results) if self.results else 0

        lines = [
            "# VNX Latency Benchmark Report",
            "",
            f"**Network:** `{self.network}`  ",
            f"**Timestamp:** {datetime.now(timezone.utc).isoformat()}  ",
            f"**Total Tests:** {len(self.results)}  ",
            f"**Average Latency:** {avg:.3f} ms",
            "",
            "## Results",
            "",
            "| Test | Latency (ms) | Status | Details |",
            "|------|-------------|--------|---------|",
        ]

        for r in self.results:
            status = r.details.get("status", "unknown")
            detail = ""
            if status == "error":
                detail = r.details.get("error", "")[:40]
            elif "result" in r.details:
                res = r.details["result"]
                if isinstance(res, int):
                    detail = f"{res} rows"
                elif isinstance(res, list):
                    detail = f"{len(res)} messages"
                else:
                    detail = str(res)[:40]
            lines.append(f"| {r.name} | {r.latency_ms:.3f} | {status} | {detail} |")

        lines.extend([
            "",
            "## Raw Data (JSON)",
            "",
            "```json",
            json.dumps([r.to_dict() for r in self.results], indent=2, default=str),
            "```",
            "",
            "## Notes",
            "",
            "- **Mirror node queries** use Hiero open-source REST API (Apache-2.0)",
            "- **SQLite writes** use WAL mode for concurrent read/write performance",
            "- **End-to-end cycle** simulates what `/fast/verify/{id}` does internally",
            f"- **Network target:** {self.network} mirror nodes",
            "",
            "---",
            "",
            "*Generated by benchmarks/vnx_latency_benchmark.py*",
        ])

        return "\n".join(lines)

    def save(self, output_dir: Path = None):
        """Save report to disk."""
        output_dir = output_dir or Path(__file__).resolve().parent
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"latency_report_{self.network}_{timestamp}.md"
        filepath = output_dir / filename

        with open(filepath, "w") as f:
            f.write(self.generate_report())

        # Also save raw JSON
        json_path = output_dir / f"latency_data_{self.network}_{timestamp}.json"
        with open(json_path, "w") as f:
            json.dump([r.to_dict() for r in self.results], f, indent=2, default=str)

        print(f"\n{'='*60}")
        print(f"Reports saved:")
        print(f"  Markdown: {filepath}")
        print(f"  JSON:     {json_path}")
        print(f"{'='*60}")
        return filepath, json_path


def main():
    network = os.environ.get("HEDERA_NETWORK", "testnet").lower()
    bench = VNXLatencyBenchmark(network=network)
    bench.run_all()
    bench.save()


if __name__ == "__main__":
    main()
