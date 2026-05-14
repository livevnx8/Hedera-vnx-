"""
Meridian Parameter Estimator

Quick utility to estimate parameter counts and memory requirements
for each model preset before training.
"""

from __future__ import annotations

from infrastructure import MODEL_PRESETS, build_config


def estimate_model(preset: str) -> None:
    """Print parameter and memory estimates for a given preset."""
    cfg = build_config(preset, use_ternary=True)

    # Approximate parameter count formula for transformer with tied embeddings
    # N = vocab * d_model + n_layers * (12 * d_model^2 + 2.67 * 2 * d_model^2)
    # Simplified: embeddings + n_layers * (attn_weights + ffn_weights)
    embed = cfg.vocab_size * cfg.d_model
    attn_per_layer = 4 * cfg.d_model * cfg.d_model  # Q, K, V, O
    ffn_per_layer = 3 * cfg.d_model * int(2.67 * cfg.d_model)  # gate, up, down
    rms_norm = 2 * cfg.d_model * cfg.n_layers  # 2 norms per layer
    total_approx = embed + cfg.n_layers * (attn_per_layer + ffn_per_layer) + rms_norm

    # Ternary layers = all linear in attn + ffn (except embeddings and lm_head)
    ternary = cfg.n_layers * (attn_per_layer + ffn_per_layer)

    print(f"\n{'='*60}")
    print(f"Preset: {preset}")
    print(f"  d_model={cfg.d_model}, n_layers={cfg.n_layers}, n_heads={cfg.n_heads}")
    print(f"  max_seq_len={cfg.max_seq_len}, vocab_size={cfg.vocab_size}")
    print(f"  {'='*56}")
    print(f"  Approximate parameters: {total_approx / 1e6:.1f}M")
    print(f"  Ternary weights:        {ternary / 1e6:.1f}M ({ternary / total_approx * 100:.1f}%)")
    print(f"  Embedding/LM head:      {embed / 1e6:.1f}M")
    print(f"  Other (norms, biases):  {(total_approx - ternary - embed) / 1e6:.1f}M")
    print(f"  {'='*56}")

    # Memory estimates
    fp32_bytes = total_approx * 4  # full-precision for training
    bf16_bytes = total_approx * 2  # mixed precision activations
    ternary_storage = ternary * 0.2  # 1.58 bits ≈ 0.2 bytes per weight
    other_storage = (total_approx - ternary) * 2  # bf16 for non-ternary

    # Training memory (weights + optimizer states + gradients)
    # Adam: 2 floats per param for momentum/variance
    optimizer_states = total_approx * 8  # 2x fp32 per param
    gradients = total_approx * 4  # fp32 gradients
    training_mem_gb = (fp32_bytes + optimizer_states + gradients) / 1e9

    # Inference memory (just weights, no optimizer/gradients)
    inference_mem_gb = (ternary_storage + other_storage) / 1e9

    print(f"  Training memory (fp32+Adam): ~{training_mem_gb:.2f} GB")
    print(f"  Inference memory (ternary+bf16): ~{inference_mem_gb:.2f} GB")
    print(f"  {'='*56}")
    print(f"  RTX 4060 Ti 8GB: {'✅ feasible' if training_mem_gb < 6 else '⚠️  need grad accum + checkpointing' if training_mem_gb < 16 else '❌ need multi-GPU / FSDP'}")
    print(f"  RTX 4090 24GB: {'✅ comfortable' if training_mem_gb < 20 else '⚠️  tight'}")
    print(f"  A100 80GB: {'✅ trivial' if training_mem_gb < 60 else '⚠️  manageable'}")

    # DeepSpeed ZeRO-3 distributed memory
    if training_mem_gb > 10:
        print(f"\n  -- ZeRO-3 Distributed Training --")
        for world_size in [4, 8]:
            params_per_gpu = (total_approx * 2) / world_size  # bf16 params
            grads_per_gpu = (total_approx * 4) / world_size    # fp32 grads
            optim_per_gpu = (total_approx * 8) / world_size    # Adam states
            zero3_total = (params_per_gpu + grads_per_gpu + optim_per_gpu) / 1e9
            print(f"    {world_size} GPUs ZeRO-3 → ~{zero3_total:.1f} GB/GPU")

        if training_mem_gb > 60:
            print(f"    CPU offload optim → ~{((total_approx * 2) / 8 + (total_approx * 4) / 8) / 1e9:.1f} GB/GPU (params+grads only)")
            print(f"    CPU offload optim+param → ~{((total_approx * 4) / 8) / 1e9:.1f} GB/GPU (grads only)")


def main() -> None:
    print("Meridian Scaling Guide — Parameter & Memory Estimates")
    print("=" * 60)
    for preset in MODEL_PRESETS:
        estimate_model(preset)


if __name__ == "__main__":
    main()
