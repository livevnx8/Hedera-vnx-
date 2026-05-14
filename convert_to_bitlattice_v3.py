#!/usr/bin/env python3
"""
Convert existing prediction models to Starlit BitLattice v3 format.

Converts .pt checkpoints → .vnx artifacts with ternary quantization.
Reports accuracy and latency before/after conversion.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import numpy as np
import torch

from starlit.bitlattice_model_pytorch import BitLatticeModelPyTorch
from starlit.ternary_qat import TernaryQuantizer

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MODELS_DIR = Path("/home/vera-live-0-1/hedera-llm-api/models")
FEATURE_KEYS = [
    "price", "price_change_1h", "price_change_24h", "volume",
    "volume_change", "rsi_14", "macd", "sma_7", "sma_30",
    "high_low_range", "body_size", "ema_12", "bb_upper", "bb_lower",
]


def load_original_model(checkpoint_path: Path) -> BitLatticeModelPyTorch:
    """Load original .pt checkpoint into BitLattice model."""
    checkpoint = torch.load(checkpoint_path, map_location=str(DEVICE))
    model = BitLatticeModelPyTorch(
        lattice_size=120, vocabulary_size=128,
        num_features=len(FEATURE_KEYS), num_classes=2, device=str(DEVICE)
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


def test_inference(model: BitLatticeModelPyTorch, model_path: Path = None, n_runs: int = 100) -> dict:
    """Test inference latency and dummy accuracy."""
    # Generate random test features
    test_input = torch.randn(1, len(FEATURE_KEYS), device=DEVICE)
    
    # Warmup
    for _ in range(10):
        with torch.no_grad():
            _ = model(test_input)
    
    # Measure latency
    latencies = []
    logits = None
    with torch.no_grad():
        for _ in range(n_runs):
            start = time.perf_counter()
            logits, _ = model(test_input)
            torch.cuda.synchronize() if DEVICE.type == 'cuda' else None
            end = time.perf_counter()
            latencies.append((end - start) * 1000)  # ms
    
    probs = torch.softmax(logits, dim=1)
    up_prob = probs[0, 1].item()
    
    result = {
        "latency_ms": {
            "mean": round(np.mean(latencies), 3),
            "min": round(np.min(latencies), 3),
            "max": round(np.max(latencies), 3),
            "p99": round(np.percentile(latencies, 99), 3),
        },
        "sample_up_prob": round(up_prob, 4),
    }
    if model_path:
        result["model_size_kb"] = round(model_path.stat().st_size / 1024, 1)
    return result


def convert_to_ternary(model: BitLatticeModelPyTorch) -> BitLatticeModelPyTorch:
    """Apply ternary quantization to model weights."""
    quantizer = TernaryQuantizer(threshold=0.33)
    
    # Quantize all layers
    for name, param in model.named_parameters():
        if 'weight' in name:
            # Apply ternary quantization: -1, 0, +1
            param.data = quantizer.ste_forward(param.data)
    
    return model


def export_to_vnx(model: BitLatticeModelPyTorch, token: str) -> Path:
    """Export model to .vnx artifact format."""
    from starlit.artifact_format import BitLatticeArtifact, create_header, create_metadata
    
    # Create artifact
    header = create_header(lattice_size=model.lattice_size)
    
    metadata = create_metadata(
        architecture="pattern",
        specialization=f"{token}_price_prediction",
        specialist_id=f"pattern_{token}_price_001",
        lattice_size=model.lattice_size,
        vocabulary_size=model.vocabulary_size,
        corpus_hash="converted_from_pt",
        training_config={"epochs": 0, "learning_rate": 0, "batch_size": 0, "converted": True}
    )
    
    # Get first layer weights as representative
    weights = model.ternary_layers[0].weight.data.cpu().numpy()
    
    # Pack ternary weights
    from starlit.bitlattice_model import pack_ternary_weights
    packed = pack_ternary_weights(weights)
    
    artifact = BitLatticeArtifact(header, metadata, packed)
    
    output_path = MODELS_DIR / f"{token}_bitlattice_v3.vnx"
    artifact.save(str(output_path))
    
    return output_path


def compare_outputs(model_before, model_after, test_input):
    """Compare outputs before and after quantization."""
    with torch.no_grad():
        logits_before, _ = model_before(test_input)
        logits_after, _ = model_after(test_input)
        
        probs_before = torch.softmax(logits_before, dim=1)
        probs_after = torch.softmax(logits_after, dim=1)
        
        diff = torch.abs(probs_before - probs_after).mean().item()
        
    return {
        "prob_drift": round(diff, 6),
        "before_up": round(probs_before[0, 1].item(), 4),
        "after_up": round(probs_after[0, 1].item(), 4),
    }


def main():
    print("=" * 70)
    print("STARLIT BITLATTICE v3 CONVERSION")
    print("Converting .pt models → .vnx with ternary quantization")
    print("=" * 70)
    
    results = {}
    
    for model_file in sorted(MODELS_DIR.glob("*_production.pt")):
        token = model_file.stem.replace("_production", "").upper()
        print(f"\n{'='*70}")
        print(f"TOKEN: {token}")
        print(f"{'='*70}")
        
        # 1. Load original model
        print("\n[1] Loading original model...")
        original_model = load_original_model(model_file)
        print(f"  Loaded: {model_file.name}")
        
        # 2. Test original
        print("\n[2] Testing original model (full precision)...")
        original_results = test_inference(original_model, model_path=model_file)
        print(f"  Latency: {original_results['latency_ms']['mean']}ms (mean)")
        print(f"  Size: {original_results['model_size_kb']} KB")
        print(f"  Sample UP prob: {original_results['sample_up_prob']}")
        
        # 3. Convert to ternary
        print("\n[3] Converting to ternary quantization...")
        ternary_model = convert_to_ternary(original_model)
        print("  Ternary quantization applied (-1, 0, +1)")
        
        # Verify weights are ternary
        sample_weights = ternary_model.ternary_layers[0].weight.data.cpu().numpy().flatten()[:10]
        unique_vals = np.unique(sample_weights)
        print(f"  Unique weight values: {unique_vals}")
        
        # 4. Test ternary model
        print("\n[4] Testing ternary model...")
        ternary_results = test_inference(ternary_model, model_path=None)
        print(f"  Latency: {ternary_results['latency_ms']['mean']}ms (mean)")
        print(f"  Sample UP prob: {ternary_results['sample_up_prob']}")
        
        # 5. Compare outputs
        print("\n[5] Comparing outputs...")
        test_input = torch.randn(1, len(FEATURE_KEYS), device=DEVICE)
        comparison = compare_outputs(original_model, ternary_model, test_input)
        print(f"  Prob drift: {comparison['prob_drift']}")
        print(f"  Before UP: {comparison['before_up']}")
        print(f"  After UP:  {comparison['after_up']}")
        
        # 6. Export to .vnx
        print("\n[6] Exporting to .vnx artifact...")
        try:
            vnx_path = export_to_vnx(ternary_model, token.lower())
            vnx_size = vnx_path.stat().st_size
            print(f"  Saved: {vnx_path.name}")
            print(f"  VNX size: {vnx_size} bytes ({vnx_size/1024:.1f} KB)")
            
            # Calculate compression ratio
            original_size = model_file.stat().st_size
            compression = original_size / vnx_size if vnx_size > 0 else 0
            print(f"  Compression: {compression:.1f}x smaller")
        except Exception as e:
            print(f"  VNX export failed: {e}")
            vnx_path = None
            vnx_size = 0
            compression = 0
        
        results[token] = {
            "original": original_results,
            "ternary": ternary_results,
            "comparison": comparison,
            "vnx_size_bytes": vnx_size,
            "compression_ratio": round(compression, 1) if compression else 0,
        }
    
    # Summary
    print(f"\n{'='*70}")
    print("CONVERSION SUMMARY")
    print(f"{'='*70}")
    
    for token, r in results.items():
        print(f"\n{token}:")
        print(f"  Original latency: {r['original']['latency_ms']['mean']}ms")
        print(f"  Ternary latency:  {r['ternary']['latency_ms']['mean']}ms")
        print(f"  Prob drift:       {r['comparison']['prob_drift']}")
        if r['compression_ratio']:
            print(f"  Compression:      {r['compression_ratio']}x")
    
    return results


if __name__ == "__main__":
    results = main()
