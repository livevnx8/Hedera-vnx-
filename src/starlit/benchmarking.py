"""
Benchmarking metrics for BitLattice micro-specialists
"""

import time
import os
from typing import Dict, Any
from .bitlattice_model import BitLatticeModel
from .validation import measure_energy_consumption


def benchmark_specialist(model: BitLatticeModel, spec_def: Dict[str, Any], artifact_path: str) -> Dict[str, Any]:
    """
    Benchmark specialist performance.
    
    Args:
        model: Trained BitLatticeModel
        spec_def: Specialist definition
        artifact_path: Path to artifact file
        
    Returns:
        Benchmark report
    """
    # Memory footprint
    memory_size = os.path.getsize(artifact_path)
    
    # Latency benchmark
    latencies = []
    test_input = "test_input"
    
    for _ in range(1000):
        start = time.time()
        model.forward_pass(test_input)
        latency = time.time() - start
        latencies.append(latency * 1000)  # Convert to ms
    
    avg_latency = sum(latencies) / len(latencies)
    p99_latency = sorted(latencies)[int(len(latencies) * 0.99)]
    
    # Energy benchmark
    energy = measure_energy_consumption(model)
    
    benchmark_report = {
        "specialist_id": spec_def["specialist_id"],
        "memory_size_bytes": memory_size,
        "avg_latency_ms": avg_latency,
        "p99_latency_ms": p99_latency,
        "energy_mJ": energy
    }
    
    # Check if meets performance targets
    if memory_size > 1024:
        print(f"WARNING: {spec_def['specialist_id']} memory {memory_size} > 1KB")
    
    if avg_latency > 0.1:  # 100μs target
        print(f"WARNING: {spec_def['specialist_id']} latency {avg_latency}ms > 100μs")
    
    return benchmark_report
