"""
Meridian DeepSpeed ZeRO-3 Trainer Stub

ZeRO-3 shards **parameters, gradients, and optimizer states** across all GPUs.
This is the standard path for training 3B+ parameter models that do not fit
in a single GPU's VRAM.

Key concept:
- ZeRO-1: shards optimizer states only (saves ~75% memory on 4 GPUs)
- ZeRO-2: shards optimizer + gradients (saves ~87% memory on 8 GPUs)
- ZeRO-3: shards optimizer + gradients + parameters (saves ~93% memory on 8 GPUs)

For Meridian large (~3.5B params):
- Single GPU training: ~56 GB (impossible on consumer hardware)
- ZeRO-3 on 8x A100 80GB: ~7 GB per GPU ✅
- ZeRO-3 on 4x A100 80GB: ~14 GB per GPU ✅

Usage (future):
    deepspeed --num_gpus=4 src/ai/meridian/deepspeed_trainer.py \
        --preset large --data models/meridian/dataset.train.jsonl \
        --output models/meridian/checkpoints/large
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict


# ─── ZeRO-3 Config Presets ──────────────────────────────────────────────────

def build_zero3_config(
    preset: str = "large",
    *,
    train_batch_size: int = 32,
    train_micro_batch_size_per_gpu: int = 1,
    gradient_accumulation_steps: int = 8,
    offload_optimizer: bool = False,  # Set True for CPU-offload on limited VRAM
    offload_param: bool = False,
) -> Dict[str, Any]:
    """
    Build a DeepSpeed ZeRO-3 configuration dict.

    Parameters are tuned for the Meridian scaling ladder.
    """
    config: Dict[str, Any] = {
        "train_batch_size": train_batch_size,
        "train_micro_batch_size_per_gpu": train_micro_batch_size_per_gpu,
        "gradient_accumulation_steps": gradient_accumulation_steps,
        "optimizer": {
            "type": "AdamW",
            "params": {
                "lr": 3e-4,
                "betas": [0.9, 0.95],
                "eps": 1e-8,
                "weight_decay": 0.1,
            },
        },
        "scheduler": {
            "type": "WarmupDecayLR",
            "params": {
                "warmup_min_lr": 1e-6,
                "warmup_max_lr": 3e-4,
                "warmup_num_steps": 500,
                "total_num_steps": -1,  # auto-detect from dataloader
            },
        },
        "fp16": {"enabled": False},
        "bf16": {"enabled": True},
        "zero_optimization": {
            "stage": 3,
            "offload_optimizer": {
                "device": "cpu" if offload_optimizer else "none",
                "pin_memory": True,
            },
            "offload_param": {
                "device": "cpu" if offload_param else "none",
                "pin_memory": True,
            },
            "overlap_comm": True,
            "contiguous_gradients": True,
            "sub_group_size": 1e9,
            "reduce_bucket_size": "auto",
            "stage3_prefetch_bucket_size": "auto",
            "stage3_param_persistence_threshold": "auto",
            "stage3_max_live_parameters": 1e9,
            "stage3_max_reuse_distance": 1e9,
            "stage3_gather_16bit_weights_on_model_save": True,
        },
        "gradient_clipping": 1.0,
        "wall_clock_breakdown": False,
    }

    # Model-size-specific tuning
    if preset in ("large", "xl"):
        # Larger models benefit from aggressive offloading if VRAM is tight
        config["zero_optimization"]["stage3_prefetch_bucket_size"] = int(5e7)
    elif preset == "xxl":
        # 100B model: must offload to CPU/NVMe or use 8+ A100s
        config["zero_optimization"]["offload_optimizer"]["device"] = "cpu"
        config["zero_optimization"]["offload_param"]["device"] = "cpu"
        config["zero_optimization"]["stage3_prefetch_bucket_size"] = int(1e7)
        config["activation_checkpointing"] = {
            "partition_activations": True,
            "cpu_checkpointing": True,
            "contiguous_memory_optimization": False,
            "number_checkpoints": None,
            "synchronize_checkpoint_boundary": False,
            "profile": False,
        }

    return config


def save_zero3_config(path: Path, config: Dict[str, Any]) -> None:
    """Write a DeepSpeed JSON config file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
        f.write("\n")
    print(f"[DeepSpeed] ZeRO-3 config saved: {path}")


# ─── DeepSpeed Trainer Wrapper ──────────────────────────────────────────────

class DeepSpeedZeRO3Trainer:
    """
    Stub wrapper that initializes DeepSpeed engine with ZeRO-3.

    Not yet wired into train.py — import and use when you have
    multi-GPU nodes and the `deepspeed` package installed.
    """

    def __init__(
        self,
        model: "MeridianModel",
        config_path: Path,
    ):
        self.model = model
        self.config_path = config_path
        self._deepspeed_available = False
        try:
            import deepspeed
            self._deepspeed_available = True
            self._deepspeed = deepspeed
        except ImportError:
            pass

    def initialize(
        self,
        *,
        model_parameters=None,
        training_data=None,
    ) -> Any:
        """Return a DeepSpeed engine wrapping the model."""
        if not self._deepspeed_available:
            raise RuntimeError(
                "DeepSpeed not installed. Run: pip install deepspeed>=0.12.0"
            )

        engine, optimizer, _, _ = self._deepspeed.initialize(
            model=self.model,
            model_parameters=model_parameters or self.model.parameters(),
            training_data=training_data,
            config=str(self.config_path),
        )
        return engine

    def save_checkpoint(self, engine: Any, tag: str, output_dir: Path) -> None:
        """Save ZeRO-3 sharded checkpoint (must gather on load)."""
        engine.save_checkpoint(str(output_dir), tag=tag)

    def load_checkpoint(self, engine: Any, checkpoint_dir: Path, tag: str) -> None:
        """Load ZeRO-3 sharded checkpoint."""
        engine.load_checkpoint(str(checkpoint_dir), tag=tag)


# ─── Memory Estimation Helpers ──────────────────────────────────────────────

def estimate_zero3_memory(
    total_params: int,
    world_size: int = 8,
    param_dtype_bytes: float = 2,  # bf16
    grad_dtype_bytes: float = 4,   # fp32 gradients
    optimizer_state_bytes: float = 8,  # Adam: 2x fp32 per param
) -> Dict[str, float]:
    """
    Estimate per-GPU memory under ZeRO-3.

    DeepSpeed ZeRO-3 splits:
    - Parameters: 1/world_size per GPU
    - Gradients: 1/world_size per GPU
    - Optimizer states: 1/world_size per GPU
    - Activations: still full (depends on batch size, seq len)
    """
    params_per_gpu = (total_params * param_dtype_bytes) / world_size
    grads_per_gpu = (total_params * grad_dtype_bytes) / world_size
    optim_per_gpu = (total_params * optimizer_state_bytes) / world_size
    total_per_gpu_gb = (params_per_gpu + grads_per_gpu + optim_per_gpu) / 1e9

    return {
        "world_size": world_size,
        "params_per_gpu_gb": params_per_gpu / 1e9,
        "gradients_per_gpu_gb": grads_per_gpu / 1e9,
        "optimizer_per_gpu_gb": optim_per_gpu / 1e9,
        "total_per_gpu_gb": total_per_gpu_gb,
        "single_gpu_equivalent_gb": total_per_gpu_gb * world_size,
    }


def print_scaling_guide() -> None:
    """Print a hardware scaling guide for Meridian presets."""
    print("\n" + "=" * 70)
    print("Meridian DeepSpeed ZeRO-3 Scaling Guide")
    print("=" * 70)

    presets = {
        "base": 350_000_000,
        "medium": 1_000_000_000,
        "large": 3_500_000_000,
        "xl": 10_000_000_000,
        "xxl": 100_000_000_000,
    }

    for preset, params in presets.items():
        print(f"\n  Preset: {preset} (~{params / 1e9:.1f}B params)")
        for world_size in [1, 4, 8]:
            mem = estimate_zero3_memory(params, world_size=world_size)
            indicator = ""
            if mem["total_per_gpu_gb"] < 24:
                indicator = "✅ fits RTX 4090"
            elif mem["total_per_gpu_gb"] < 80:
                indicator = "✅ fits A100 80GB"
            else:
                indicator = "❌ need CPU offload or more GPUs"
            print(
                f"    {world_size} GPUs → {mem['total_per_gpu_gb']:.1f} GB/GPU  {indicator}"
            )

        # With CPU offload, memory drops dramatically
        if preset in ("xl", "xxl"):
            mem_offload = estimate_zero3_memory(
                params, world_size=8, optimizer_state_bytes=2
            )
            print(
                f"    8 GPUs + CPU offload → {mem_offload['total_per_gpu_gb']:.1f} GB/GPU  ⚡ offload active"
            )

    print("\n" + "=" * 70)


# ─── CLI ────────────────────────────────────────────────────────────────────

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate DeepSpeed ZeRO-3 config")
    parser.add_argument("--preset", choices=["large", "xl", "xxl"], default="large")
    parser.add_argument("--gpus", type=int, default=8, help="Number of GPUs in cluster")
    parser.add_argument("--micro-batch", type=int, default=1, help="Per-GPU batch size")
    parser.add_argument("--accum", type=int, default=8, help="Gradient accumulation steps")
    parser.add_argument("--offload", action="store_true", help="CPU-offload optimizer+params")
    parser.add_argument("--output", default="models/meridian/deepspeed_config.json")
    args = parser.parse_args()

    config = build_zero3_config(
        preset=args.preset,
        train_micro_batch_size_per_gpu=args.micro_batch,
        gradient_accumulation_steps=args.accum,
        train_batch_size=args.micro_batch * args.gpus * args.accum,
        offload_optimizer=args.offload,
        offload_param=args.offload,
    )
    save_zero3_config(Path(args.output), config)

    print_scaling_guide()


if __name__ == "__main__":
    main()
