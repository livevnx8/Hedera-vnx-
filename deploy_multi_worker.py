#!/usr/bin/env python3
"""
Vera OS Multi-Worker Deployment Script.

Starts the Super Server with multiple uvicorn workers for horizontal scaling.
Each worker runs its own process with independent L1 cache, sharing Redis L2 cache.

Usage:
    # Single worker (default)
    python3 deploy_multi_worker.py

    # 4 workers (recommended for 28-core machine)
    python3 deploy_multi_worker.py --workers 4

    # With custom host/port
    python3 deploy_multi_worker.py --host 0.0.0.0 --port 8000 --workers 4

    # Production with gunicorn (more robust process management)
    gunicorn super_server:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
"""

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path


def kill_existing(port: int):
    """Kill any process on the target port."""
    try:
        subprocess.run(
            ["fuser", "-k", f"{port}/tcp"],
            capture_output=True,
            timeout=5,
        )
    except Exception:
        pass
    # Also try pkill
    subprocess.run(
        "pkill -f 'super_server.py\|optimized_server.py\|prediction_server_v3.py'",
        shell=True, capture_output=True,
    )
    time.sleep(1)


def start_single_worker(host: str, port: int):
    """Start single uvicorn worker."""
    print(f"Starting single worker on {host}:{port}")
    cmd = [
        sys.executable, "-m", "uvicorn",
        "super_server:app",
        "--host", host,
        "--port", str(port),
        "--loop", "uvloop",
    ]
    return subprocess.Popen(cmd, cwd="/home/vera-live-0-1/hedera-llm-api")


def start_multi_worker(host: str, port: int, workers: int):
    """Start uvicorn with multiple workers."""
    print(f"Starting {workers} workers on {host}:{port}")
    # Use gunicorn for multi-process
    cmd = [
        sys.executable, "-m", "gunicorn",
        "super_server:app",
        "-w", str(workers),
        "-k", "uvicorn.workers.UvicornWorker",
        "--bind", f"{host}:{port}",
        "--timeout", "120",
        "--keep-alive", "5",
        "--max-requests", "10000",
        "--max-requests-jitter", "1000",
    ]
    return subprocess.Popen(cmd, cwd="/home/vera-live-0-1/hedera-llm-api")


def wait_for_health(host: str, port: int, timeout: int = 30) -> bool:
    """Wait until server responds to health check."""
    import urllib.request
    url = f"http://{host}:{port}/health"
    for _ in range(timeout * 2):
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def benchmark_workers(host: str, port: int, duration: int = 30):
    """Run quick load test against multi-worker deployment."""
    print(f"\nRunning {duration}s load test against {host}:{port}...")
    result = subprocess.run(
        [
            sys.executable, "tests/load_test.py",
            "--duration", str(duration),
            "--url", f"http://{host}:{port}",
            "--output", "tests/results/load_test_multiworker.json",
        ],
        cwd="/home/vera-live-0-1/hedera-llm-api",
        capture_output=True,
        text=True,
    )
    # Print summary lines
    for line in result.stdout.split("\n"):
        if any(k in line for k in ["RPS", "Error rate", "p99", "Grade", "="]):
            print(line)
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(description="Vera OS Multi-Worker Deployment")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host")
    parser.add_argument("--port", type=int, default=8000, help="Bind port")
    parser.add_argument("--workers", type=int, default=1, help="Number of workers (1 = single process)")
    parser.add_argument("--kill-existing", action="store_true", default=True, help="Kill existing processes on port")
    parser.add_argument("--benchmark", action="store_true", help="Run load test after startup")
    parser.add_argument("--daemon", action="store_true", help="Run in background")
    args = parser.parse_args()

    print("=" * 60)
    print("Vera OS Multi-Worker Deployment")
    print("=" * 60)
    print(f"Host:    {args.host}")
    print(f"Port:    {args.port}")
    print(f"Workers: {args.workers}")
    print()

    if args.kill_existing:
        kill_existing(args.port)

    if args.workers == 1:
        proc = start_single_worker(args.host, args.port)
    else:
        proc = start_multi_worker(args.host, args.port, args.workers)

    if args.daemon:
        print(f"Daemon started. PID: {proc.pid}")
        print(f"Logs: tail -f /tmp/vera_super.log")
        return

    print(f"Server PID: {proc.pid}")
    print("Waiting for health check...")

    if wait_for_health(args.host, args.port):
        print("Server is healthy!")
        print(f"API:     http://{args.host}:{args.port}")
        print(f"Stats:   http://{args.host}:{args.port}/optimization/stats")
        print(f"Health:  http://{args.host}:{args.port}/health")
    else:
        print("WARNING: Server did not respond to health check")

    if args.benchmark:
        benchmark_workers(args.host, args.port)

    print("\nPress Ctrl+C to stop server")
    try:
        proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down...")
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=10)


if __name__ == "__main__":
    main()
