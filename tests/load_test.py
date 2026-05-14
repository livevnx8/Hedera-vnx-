#!/usr/bin/env python3
"""
End-to-End Load Test for Vera OS.

Benchmarks the FastAPI server under concurrent load.
Tests: prediction latency, throughput, error rate, cache performance.

Usage:
    python3 tests/load_test.py --duration 60 --concurrency 50
"""

import argparse
import asyncio
import json
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any

import aiohttp

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

# Target configuration
DEFAULT_BASE_URL = "http://localhost:8000"
BASE_URL = DEFAULT_BASE_URL
ENDPOINTS = {
    "/predict/hbar": {"weight": 0.5, "method": "GET"},
    "/swarm/predict/hbar": {"weight": 0.2, "method": "GET"},
    "/health": {"weight": 0.15, "method": "GET"},
    "/metrics": {"weight": 0.1, "method": "GET"},
    "/": {"weight": 0.05, "method": "GET"},
}


class LoadTestResult:
    def __init__(self):
        self.latencies: Dict[str, List[float]] = defaultdict(list)
        self.errors: Dict[str, List[str]] = defaultdict(list)
        self.status_codes: Dict[str, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
        self.request_count = 0
        self.error_count = 0
        self.start_time = 0
        self.end_time = 0


async def make_request(session: aiohttp.ClientSession, endpoint: str, method: str = "GET", base_url: str = DEFAULT_BASE_URL) -> Dict[str, Any]:
    """Make a single HTTP request and record timing."""
    url = f"{base_url}{endpoint}"
    start = time.perf_counter()
    try:
        async with session.request(method, url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            body = await resp.text()
            latency = (time.perf_counter() - start) * 1000  # ms
            return {
                "endpoint": endpoint,
                "status": resp.status,
                "latency_ms": latency,
                "error": None,
                "body_len": len(body),
            }
    except asyncio.TimeoutError:
        return {
            "endpoint": endpoint,
            "status": 0,
            "latency_ms": (time.perf_counter() - start) * 1000,
            "error": "TIMEOUT",
            "body_len": 0,
        }
    except Exception as e:
        return {
            "endpoint": endpoint,
            "status": 0,
            "latency_ms": (time.perf_counter() - start) * 1000,
            "error": str(e)[:100],
            "body_len": 0,
        }


async def worker(session: aiohttp.ClientSession, queue: asyncio.Queue, results: LoadTestResult, stop_event: asyncio.Event, base_url: str = DEFAULT_BASE_URL):
    """Worker that pulls endpoints from queue and makes requests."""
    while not stop_event.is_set():
        try:
            endpoint = await asyncio.wait_for(queue.get(), timeout=0.5)
        except asyncio.TimeoutError:
            continue

        config = ENDPOINTS[endpoint]
        result = await make_request(session, endpoint, config["method"], base_url)
        results.request_count += 1

        if result["error"]:
            results.error_count += 1
            results.errors[endpoint].append(result["error"])

        results.latencies[endpoint].append(result["latency_ms"])
        results.status_codes[endpoint][result["status"]] += 1


async def generate_load(queue: asyncio.Queue, rps: float, stop_event: asyncio.Event):
    """Generate requests at target RPS distributed across endpoints."""
    import random

    endpoints = list(ENDPOINTS.keys())
    weights = [ENDPOINTS[e]["weight"] for e in endpoints]
    interval = 1.0 / rps if rps > 0 else 1.0

    while not stop_event.is_set():
        endpoint = random.choices(endpoints, weights=weights)[0]
        try:
            queue.put_nowait(endpoint)
        except asyncio.QueueFull:
            pass
        await asyncio.sleep(interval)


async def run_load_test(duration_sec: int = 60, concurrency: int = 50, target_rps: float = 50.0, base_url: str = DEFAULT_BASE_URL) -> Dict[str, Any]:
    """Run the load test."""
    print(f"\n{'='*60}")
    print(f"LOAD TEST")
    print(f"Duration: {duration_sec}s | Concurrency: {concurrency} | Target RPS: {target_rps}")
    print(f"{'='*60}\n")

    # Check if server is up
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"{base_url}/health", timeout=aiohttp.ClientTimeout(total=5)) as r:
                if r.status != 200:
                    print(f"WARNING: Server returned {r.status} on /health")
    except Exception as e:
        print(f"WARNING: Could not connect to {base_url}: {e}")
        print("Tests will run anyway and report connection failures.")

    results = LoadTestResult()
    queue = asyncio.Queue(maxsize=10000)
    stop_event = asyncio.Event()

    results.start_time = time.time()

    async with aiohttp.ClientSession() as session:
        # Start workers
        workers = [
            asyncio.create_task(worker(session, queue, results, stop_event, base_url))
            for _ in range(concurrency)
        ]

        # Start load generator
        load_task = asyncio.create_task(generate_load(queue, target_rps, stop_event))

        # Run for duration
        print(f"Running for {duration_sec} seconds...")
        await asyncio.sleep(duration_sec)

        # Stop
        stop_event.set()
        load_task.cancel()
        try:
            await load_task
        except asyncio.CancelledError:
            pass

        await asyncio.gather(*workers, return_exceptions=True)

    results.end_time = time.time()

    return compile_results(results)


def compile_results(results: LoadTestResult) -> Dict[str, Any]:
    """Compile raw results into summary statistics."""
    import statistics

    total_requests = results.request_count
    total_errors = results.error_count
    duration = results.end_time - results.start_time
    actual_rps = total_requests / duration if duration > 0 else 0
    error_rate = total_errors / total_requests if total_requests > 0 else 0

    # Per-endpoint stats
    endpoint_stats = {}
    all_latencies = []
    for endpoint, latencies in results.latencies.items():
        if not latencies:
            continue
        all_latencies.extend(latencies)
        sorted_lat = sorted(latencies)
        n = len(sorted_lat)
        codes = dict(results.status_codes[endpoint])

        endpoint_stats[endpoint] = {
            "requests": n,
            "errors": len(results.errors[endpoint]),
            "error_rate_pct": round(len(results.errors[endpoint]) / n * 100, 2) if n > 0 else 0,
            "latency_ms": {
                "min": round(min(latencies), 2),
                "max": round(max(latencies), 2),
                "mean": round(statistics.mean(latencies), 2),
                "median": round(statistics.median(latencies), 2),
                "p50": round(sorted_lat[int(n * 0.50)], 2) if n > 0 else 0,
                "p95": round(sorted_lat[int(n * 0.95)], 2) if n > 0 else 0,
                "p99": round(sorted_lat[min(int(n * 0.99), n - 1)], 2) if n > 0 else 0,
            },
            "status_codes": codes,
        }

    # Overall latency
    if all_latencies:
        sorted_all = sorted(all_latencies)
        n = len(sorted_all)
        overall_latency = {
            "min": round(min(all_latencies), 2),
            "max": round(max(all_latencies), 2),
            "mean": round(statistics.mean(all_latencies), 2),
            "median": round(statistics.median(all_latencies), 2),
            "p50": round(sorted_all[int(n * 0.50)], 2),
            "p95": round(sorted_all[int(n * 0.95)], 2),
            "p99": round(sorted_all[min(int(n * 0.99), n - 1)], 2),
        }
    else:
        overall_latency = {"min": 0, "max": 0, "mean": 0, "median": 0, "p50": 0, "p95": 0, "p99": 0}

    # Pass/fail thresholds
    p99 = overall_latency["p99"]
    p95 = overall_latency["p95"]
    throughput_ok = actual_rps >= 40  # 80% of target
    latency_ok = p99 < 500
    error_ok = error_rate < 0.001  # 0.1%

    grade = "A" if (throughput_ok and latency_ok and error_ok) else \
            "B" if (throughput_ok and p99 < 1000 and error_rate < 0.01) else \
            "C" if (actual_rps > 10) else "D"

    return {
        "duration_sec": round(duration, 1),
        "total_requests": total_requests,
        "total_errors": total_errors,
        "actual_rps": round(actual_rps, 1),
        "target_rps": 50,
        "error_rate_pct": round(error_rate * 100, 3),
        "overall_latency_ms": overall_latency,
        "endpoint_stats": endpoint_stats,
        "thresholds": {
            "throughput_ok": throughput_ok,
            "latency_ok": latency_ok,
            "error_ok": error_ok,
        },
        "grade": grade,
        "timestamp": datetime.now().isoformat(),
    }


def print_summary(results: Dict[str, Any]) -> None:
    print(f"\n{'='*60}")
    print(f"LOAD TEST RESULTS")
    print(f"{'='*60}")
    print(f"Duration:          {results['duration_sec']}s")
    print(f"Total requests:    {results['total_requests']}")
    print(f"Errors:            {results['total_errors']}")
    print(f"Actual RPS:        {results['actual_rps']}")
    print(f"Error rate:        {results['error_rate_pct']:.3f}%")

    lat = results["overall_latency_ms"]
    print(f"\nLatency (ms):")
    print(f"  min:   {lat['min']}")
    print(f"  mean:  {lat['mean']}")
    print(f"  p50:   {lat['p50']}")
    print(f"  p95:   {lat['p95']}")
    print(f"  p99:   {lat['p99']}")

    print(f"\nPer-endpoint:")
    for endpoint, stats in results["endpoint_stats"].items():
        print(f"  {endpoint}: {stats['requests']} req, p99={stats['latency_ms']['p99']}ms, err={stats['error_rate_pct']:.2f}%")

    t = results["thresholds"]
    print(f"\nThresholds:")
    print(f"  Throughput > 40 rps:  {'PASS' if t['throughput_ok'] else 'FAIL'}")
    print(f"  p99 < 500ms:          {'PASS' if t['latency_ok'] else 'FAIL'}")
    print(f"  Error rate < 0.1%:    {'PASS' if t['error_ok'] else 'FAIL'}")

    print(f"\n{'='*60}")
    print(f"Grade: {results['grade']}")
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="Vera OS Load Test")
    parser.add_argument("--duration", type=int, default=60, help="Test duration in seconds")
    parser.add_argument("--concurrency", type=int, default=50, help="Number of concurrent workers")
    parser.add_argument("--rps", type=float, default=50.0, help="Target requests per second")
    parser.add_argument("--url", type=str, default=BASE_URL, help="Base URL")
    parser.add_argument("--output", type=str, default="tests/results/load_test.json")
    args = parser.parse_args()

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    results = asyncio.run(run_load_test(args.duration, args.concurrency, args.rps, args.url))

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to: {args.output}")
    print_summary(results)


if __name__ == "__main__":
    main()
