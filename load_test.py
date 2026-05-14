#!/usr/bin/env python3
"""
Load test for prediction server.
Simulates high concurrent request volume to verify stability.
"""

import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

import requests

BASE_URL = "http://localhost:8000"
TOKENS = ["hbar", "sauce", "dovu"]

async def single_request(session, endpoint: str) -> dict:
    """Make a single request and measure latency."""
    start = time.perf_counter()
    try:
        response = await asyncio.get_event_loop().run_in_executor(
            None, lambda: session.get(f"{BASE_URL}{endpoint}", timeout=5)
        )
        latency = (time.perf_counter() - start) * 1000
        return {
            "status": response.status_code,
            "latency_ms": latency,
            "success": response.status_code == 200,
        }
    except Exception as e:
        return {
            "status": 0,
            "latency_ms": (time.perf_counter() - start) * 1000,
            "success": False,
            "error": str(e),
        }

async def burst_test(session, concurrency: int, endpoint: str) -> list:
    """Send burst of concurrent requests."""
    tasks = [single_request(session, endpoint) for _ in range(concurrency)]
    return await asyncio.gather(*tasks)

async def run_load_test():
    """Run comprehensive load test."""
    print("=" * 60)
    print("PREDICTION SERVER LOAD TEST")
    print("=" * 60)
    
    session = requests.Session()
    
    # Check server health
    print("\n[1] Checking server health...")
    try:
        response = session.get(f"{BASE_URL}/health", timeout=5)
        health = response.json()
        print(f"  Status: {health['status']}")
        print(f"  Models: {health['models_loaded']}")
        print(f"  Device: {health['device']}")
    except Exception as e:
        print(f"  ERROR: Server not available at {BASE_URL}")
        print(f"  {e}")
        print("\nStart server with: python3 prediction_server_production.py")
        return
    
    # Test 1: Sequential requests (baseline)
    print("\n[2] Sequential requests (100 requests)...")
    latencies = []
    errors = 0
    for i in range(100):
        result = await single_request(session, "/predict/hbar")
        if result["success"]:
            latencies.append(result["latency_ms"])
        else:
            errors += 1
    
    if latencies:
        print(f"  Successful: {len(latencies)}/100")
        print(f"  Errors: {errors}")
        print(f"  Latency: {sum(latencies)/len(latencies):.2f}ms avg, "
              f"{min(latencies):.2f}ms min, {max(latencies):.2f}ms max")
    else:
        print("  All requests failed!")
    
    # Test 2: Burst test (concurrent requests)
    print("\n[3] Burst test (10 concurrent requests)...")
    results = await burst_test(session, 10, "/predict/hbar")
    successes = sum(1 for r in results if r["success"])
    errors = len(results) - successes
    latencies = [r["latency_ms"] for r in results if r["success"]]
    
    print(f"  Successful: {successes}/10")
    print(f"  Errors: {errors}")
    if latencies:
        print(f"  Latency: {sum(latencies)/len(latencies):.2f}ms avg, "
              f"{max(latencies):.2f}ms max")
    
    # Test 3: Stress test (100 concurrent requests)
    print("\n[4] Stress test (100 concurrent requests)...")
    results = await burst_test(session, 100, "/predict/hbar")
    successes = sum(1 for r in results if r["success"])
    errors = len(results) - successes
    latencies = [r["latency_ms"] for r in results if r["success"]]
    
    print(f"  Successful: {successes}/100")
    print(f"  Errors: {errors}")
    if latencies:
        print(f"  Latency: {sum(latencies)/len(latencies):.2f}ms avg, "
              f"{max(latencies):.2f}ms max")
    
    # Test 4: All tokens
    print("\n[5] All tokens test...")
    for token in TOKENS:
        result = await single_request(session, f"/predict/{token}")
        status = "OK" if result["success"] else "FAIL"
        print(f"  {token.upper():6s}: {status} ({result['latency_ms']:.2f}ms)")
    
    # Test 6: Health under load
    print("\n[6] Health check under load...")
    response = session.get(f"{BASE_URL}/health", timeout=5)
    health = response.json()
    print(f"  Status: {health['status']}")
    print(f"  Request count: {health['request_count']}")
    print(f"  Error count: {health['error_count']}")
    print(f"  Error rate: {health['error_rate']:.2%}")
    
    # Summary
    print(f"\n{'='*60}")
    print("LOAD TEST SUMMARY")
    print(f"{'='*60}")
    print(f"Sequential (100):  {'PASS' if len(latencies) >= 95 else 'FAIL'} ({len(latencies)}/100 OK)")
    print(f"Burst (10):        {'PASS' if successes >= 9 else 'FAIL'} ({successes}/10 OK)")
    print(f"Stress (100):      {'PASS' if successes >= 90 else 'FAIL'} ({successes}/100 OK)")
    print(f"Error rate:        {health['error_rate']:.2%} {'PASS' if health['error_rate'] < 0.05 else 'FAIL'}")
    print(f"Overall:           {'ALL TESTS PASSED' if health['error_rate'] < 0.05 else 'NEEDS ATTENTION'}")

if __name__ == "__main__":
    asyncio.run(run_load_test())
