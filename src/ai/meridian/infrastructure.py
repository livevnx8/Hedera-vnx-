"""
Shared Meridian infrastructure helpers.

This keeps research runs reproducible and makes train/eval/serve agree on
model shape, dataset manifests, and checkpoint metadata.
"""

from __future__ import annotations

import hashlib
import json
import random
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict

import torch

from architecture import MeridianConfig


SCHEMA_VERSION = "meridian.dataset.v1"
CHECKPOINT_VERSION = "meridian.checkpoint.v1"


MODEL_PRESETS: Dict[str, Dict[str, Any]] = {
    "smoke": {
        "d_model": 64,
        "n_layers": 2,
        "n_heads": 4,
        "max_seq_len": 128,
        "vocab_size": 1024,
    },
    "small": {
        "d_model": 384,
        "n_layers": 8,
        "n_heads": 8,
        "max_seq_len": 1024,
        "vocab_size": 32000,
    },
    "base": {
        "d_model": 768,
        "n_layers": 12,
        "n_heads": 12,
        "max_seq_len": 2048,
        "vocab_size": 32000,
    },
    "medium": {
        "d_model": 1024,
        "n_layers": 16,
        "n_heads": 16,
        "max_seq_len": 2048,
        "vocab_size": 32000,
    },
    "medium-compact": {
        "d_model": 1152,
        "n_layers": 18,
        "n_heads": 18,
        "max_seq_len": 1024,
        "vocab_size": 50000,
    },
    "medium-plus": {
        "d_model": 1280,
        "n_layers": 20,
        "n_heads": 20,
        "max_seq_len": 2048,
        "vocab_size": 50000,
    },
    "large": {
        "d_model": 1536,
        "n_layers": 24,
        "n_heads": 24,
        "max_seq_len": 4096,
        "vocab_size": 48000,
    },
    "xl": {
        "d_model": 2048,
        "n_layers": 32,
        "n_heads": 32,
        "max_seq_len": 8192,
        "vocab_size": 64000,
    },
    "xxl": {
        "d_model": 4096,
        "n_layers": 48,
        "n_heads": 64,
        "max_seq_len": 8192,
        "vocab_size": 100000,
    },
}


def set_reproducible_seed(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def build_config(
    preset: str = "base",
    *,
    vocab_size: int | None = None,
    d_model: int | None = None,
    n_layers: int | None = None,
    n_heads: int | None = None,
    max_seq_len: int | None = None,
    use_ternary: bool = True,
    gradient_checkpointing: bool = False,
) -> MeridianConfig:
    values = dict(MODEL_PRESETS.get(preset, MODEL_PRESETS["base"]))
    overrides = {
        "vocab_size": vocab_size,
        "d_model": d_model,
        "n_layers": n_layers,
        "n_heads": n_heads,
        "max_seq_len": max_seq_len,
        "gradient_checkpointing": gradient_checkpointing,
    }
    for key, value in overrides.items():
        if value is not None:
            values[key] = value

    if values["d_model"] % values["n_heads"] != 0:
        raise ValueError("d_model must be divisible by n_heads")

    values["d_head"] = values["d_model"] // values["n_heads"]
    values["use_ternary"] = use_ternary
    return MeridianConfig(**values)


def config_to_dict(config: MeridianConfig) -> Dict[str, Any]:
    return asdict(config)


def config_from_checkpoint_payload(payload: Dict[str, Any], fallback: MeridianConfig) -> MeridianConfig:
    raw = payload.get("model_config")
    if not isinstance(raw, dict):
        raw = payload.get("config")
    if not isinstance(raw, dict):
        return fallback
    merged = config_to_dict(fallback)
    merged.update(raw)
    if merged["d_model"] % merged["n_heads"] != 0:
        raise ValueError("checkpoint model_config has incompatible d_model/n_heads")
    merged["d_head"] = merged["d_model"] // merged["n_heads"]
    return MeridianConfig(**merged)


def checkpoint_metadata(
    *,
    step: int,
    model_config: MeridianConfig,
    extra: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "checkpoint_version": CHECKPOINT_VERSION,
        "created_at": int(time.time()),
        "step": step,
        "model_config": config_to_dict(model_config),
    }
    if extra:
        payload.update(extra)
    return payload
