"""
Meridian Distributed Training Scaffolding

Stub for FSDP / DeepSpeed / multi-GPU scaling.
Not yet wired into train.py — this is the architectural hook
for when you move beyond a single RTX 4060 Ti.

Usage (future):
    torchrun --nproc_per_node=2 src/ai/meridian/distributed.py \
        --preset large --data ... --output ...
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict


try:
    import torch
    import torch.distributed as dist
    from torch.distributed.fsdp import FullyShardedDataParallel as FSDP
    from torch.distributed.fsdp.wrap import transformer_auto_wrap_policy
    _DIST_AVAILABLE = True
except ImportError:
    _DIST_AVAILABLE = False


class DistributedTrainer:
    """
    Placeholder for fully-sharded data parallel training.

    When you scale past a single GPU (medium+ presets), this class
    will shard parameters, gradients, and optimizer states across
    devices using PyTorch FSDP.
    """

    def __init__(self, world_size: int = 1, rank: int = 0):
        self.world_size = world_size
        self.rank = rank
        self.is_distributed = world_size > 1

    def maybe_wrap_model(self, model: "MeridianModel") -> "MeridianModel | FSDP":
        """Wrap model with FSDP if distributed."""
        if not self.is_distributed:
            return model
        if not _DIST_AVAILABLE:
            raise RuntimeError("PyTorch distributed not available. Install torch>=2.0")

        # FSDP auto-wrap policy for transformer blocks
        auto_wrap_policy = transformer_auto_wrap_policy(
            transformer_layer_cls={"MeridianBlock"},
        )
        return FSDP(
            model,
            auto_wrap_policy=auto_wrap_policy,
            mixed_precision=torch.bfloat16,
            device_id=torch.cuda.current_device(),
            limit_all_gathers=True,
        )

    def barrier(self) -> None:
        if self.is_distributed and _DIST_AVAILABLE:
            dist.barrier()

    def is_main_process(self) -> bool:
        return self.rank == 0

    def save_checkpoint(self, model: Any, path: Path) -> None:
        """Save FSDP full state dict only from rank 0."""
        if not self.is_main_process():
            return
        if isinstance(model, FSDP):
            state_dict = model.state_dict()
        else:
            state_dict = model.state_dict()
        torch.save(state_dict, path)


def setup_distributed() -> DistributedTrainer:
    """Initialize distributed process group if torchrun detected."""
    if not _DIST_AVAILABLE:
        return DistributedTrainer(world_size=1, rank=0)

    if "RANK" in __import__("os").environ:
        rank = int(__import__("os").environ["RANK"])
        world_size = int(__import__("os").environ["WORLD_SIZE"])
        dist.init_process_group("nccl")
        return DistributedTrainer(world_size=world_size, rank=rank)
    return DistributedTrainer(world_size=1, rank=0)


# ─── Model Parallelism Stubs (Tensor + Pipeline) ────────────────────────────

class TensorParallelTrainer:
    """
    Stub for tensor (intra-layer) parallelism.

    Splits individual linear/attention layers across multiple GPUs within a node.
    Best for: very wide layers (d_model > 4096) where a single matmul exceeds VRAM.

    Example layout on 8 GPUs:
        GPUs 0-3: Tensor parallel group (split d_model across 4 devices)
        GPUs 4-7: Tensor parallel group (replica for data parallel)

    Not yet wired — requires Megatron-LM or custom torch.distributed._tensor.
    """

    def __init__(self, tp_size: int = 4, dp_size: int = 2):
        self.tp_size = tp_size
        self.dp_size = dp_size
        self.world_size = tp_size * dp_size

    def shard_linear(self, weight: Any, dim: int = 0) -> list[Any]:
        """Split a weight matrix along `dim` across tensor-parallel ranks."""
        # Placeholder: real implementation uses torch.distributed._tensor.DTensor
        chunks = [weight[i::self.tp_size] for i in range(self.tp_size)]
        return chunks

    def all_gather_output(self, local_output: Any) -> Any:
        """Gather outputs from all tensor-parallel ranks."""
        # Placeholder: real implementation uses all-gather collective
        return local_output  # noop stub


class PipelineParallelTrainer:
    """
    Stub for pipeline (inter-layer) parallelism.

    Splits transformer layers across GPUs in a pipeline.
    Best for: very deep models (n_layers > 32) where total layer count exceeds VRAM.

    Example layout on 8 GPUs with 48 layers:
        GPU 0: layers 0-5
        GPU 1: layers 6-11
        ...
        GPU 7: layers 42-47

    Forward pass: micro-batches flow through pipeline stages.
    Backward: gradients flow back (can use activation checkpointing per stage).
    """

    def __init__(self, num_stages: int = 4, num_layers: int = 48):
        self.num_stages = num_stages
        self.num_layers = num_layers
        self.layers_per_stage = num_layers // num_stages

    def get_stage_layers(self, stage_rank: int) -> tuple[int, int]:
        """Return (start_layer, end_layer) for a given pipeline stage."""
        start = stage_rank * self.layers_per_stage
        end = start + self.layers_per_stage
        return start, end

    def stage_forward(self, stage_rank: int, x: Any) -> Any:
        """Placeholder: forward through layers assigned to this stage."""
        start, end = self.get_stage_layers(stage_rank)
        # Real implementation: move x to stage_rank's device, run layers[start:end]
        return x


def teardown_distributed(trainer: DistributedTrainer) -> None:
    if trainer.is_distributed and _DIST_AVAILABLE:
        dist.destroy_process_group()


if __name__ == "__main__":
    trainer = setup_distributed()
    print(f"[Distributed] Rank {trainer.rank}/{trainer.world_size}")
    if trainer.is_main_process():
        print("  FSDP scaffolding ready. Wire into train.py when scaling to multi-GPU.")
    teardown_distributed(trainer)
