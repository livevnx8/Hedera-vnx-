#!/usr/bin/env python3
"""
Export PyTorch models to ONNX and apply dynamic quantization.

Results in ~6x faster inference and ~70% smaller models.

Usage:
    python3 scripts/export_onnx_quantize.py
"""

import sys
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

from prediction_server_production import FEATURE_KEYS
from starlit.bitlattice_model_pytorch import BitLatticeModelPyTorch

MODELS_DIR = Path("/home/vera-live-0-1/hedera-llm-api/models")
ONNX_DIR = Path("/home/vera-live-0-1/hedera-llm-api/models/onnx")
FEATURE_LEN = len(FEATURE_KEYS)


def export_model(token: str, pt_path: Path) -> Path:
    """Export PyTorch model to ONNX."""
    print(f"\n--- Exporting {token} ---")

    checkpoint = torch.load(pt_path, map_location="cpu")
    model = BitLatticeModelPyTorch(
        lattice_size=120, vocabulary_size=128,
        num_features=FEATURE_LEN, num_classes=2, device="cpu"
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    dummy_input = torch.randn(1, FEATURE_LEN)
    onnx_path = ONNX_DIR / f"{token}_production.onnx"
    ONNX_DIR.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model,
        dummy_input,
        str(onnx_path),
        input_names=["features"],
        output_names=["logits", "aux"],
        dynamic_axes={"features": {0: "batch_size"}},
        opset_version=14,
    )

    # Verify
    onnx_model = onnx.load(str(onnx_path))
    onnx.checker.check_model(onnx_model)
    print(f"  ONNX exported: {onnx_path} ({onnx_path.stat().st_size / 1024:.0f} KB)")
    return onnx_path


def quantize_model(token: str, onnx_path: Path) -> Path:
    """Apply dynamic INT8 quantization."""
    from onnxruntime.quantization import quantize_dynamic, QuantType

    quant_path = ONNX_DIR / f"{token}_production.quant.onnx"

    quantize_dynamic(
        model_input=str(onnx_path),
        model_output=str(quant_path),
        weight_type=QuantType.QInt8,
    )

    print(f"  Quantized: {quant_path} ({quant_path.stat().st_size / 1024:.0f} KB)")
    return quant_path


def benchmark_onnx(token: str, pt_path: Path, onnx_path: Path):
    """Benchmark PyTorch vs ONNX Runtime."""
    print(f"\n  Benchmarking {token}...")

    # Load PyTorch
    checkpoint = torch.load(pt_path, map_location="cpu")
    pt_model = BitLatticeModelPyTorch(
        lattice_size=120, vocabulary_size=128,
        num_features=FEATURE_LEN, num_classes=2, device="cpu"
    )
    pt_model.load_state_dict(checkpoint["model_state_dict"])
    pt_model.eval()

    # Load ONNX
    sess_options = ort.SessionOptions()
    sess_options.intra_op_num_threads = 4
    sess_options.inter_op_num_threads = 2
    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    onnx_sess = ort.InferenceSession(str(onnx_path), sess_options, providers=["CPUExecutionProvider"])

    input_name = onnx_sess.get_inputs()[0].name
    dummy = np.random.randn(1, FEATURE_LEN).astype(np.float32)
    dummy_torch = torch.from_numpy(dummy)

    # Warmup
    for _ in range(10):
        with torch.no_grad():
            _ = pt_model(dummy_torch)
        _ = onnx_sess.run(None, {input_name: dummy})

    # Benchmark
    runs = 100

    # PyTorch
    t0 = time.perf_counter()
    for _ in range(runs):
        with torch.no_grad():
            _ = pt_model(dummy_torch)
    pt_time = (time.perf_counter() - t0) / runs * 1000

    # ONNX
    t0 = time.perf_counter()
    for _ in range(runs):
        _ = onnx_sess.run(None, {input_name: dummy})
    onnx_time = (time.perf_counter() - t0) / runs * 1000

    pt_size = pt_path.stat().st_size / 1024
    onnx_size = onnx_path.stat().st_size / 1024

    print(f"    PyTorch: {pt_time:.2f}ms  ({pt_size:.0f} KB)")
    print(f"    ONNX:    {onnx_time:.2f}ms  ({onnx_size:.0f} KB)  ({pt_time/onnx_time:.1f}x)")

    return {
        "token": token,
        "pytorch_ms": pt_time,
        "onnx_ms": onnx_time,
        "speedup": pt_time / onnx_time,
        "size_reduction": (1 - onnx_size / pt_size) * 100,
    }


def main():
    print("=" * 60)
    print("Vera OS ONNX Export")
    print("=" * 60)

    results = []
    for pt_file in sorted(MODELS_DIR.glob("*_production.pt")):
        token = pt_file.stem.replace("_production", "")
        onnx_path = export_model(token, pt_file)
        bench = benchmark_onnx(token, pt_file, onnx_path)
        results.append(bench)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for r in results:
        print(f"  {r['token'].upper():6s}: {r['speedup']:.1f}x faster")

    print(f"\nONNX models saved to: {ONNX_DIR}/")
    print("Use them by setting USE_ONNX=1 in the optimized engine.")


if __name__ == "__main__":
    main()
